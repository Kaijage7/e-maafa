-- Durable convergence ledger for mobile/web incident reads.
--
-- The event row is written by a trigger in the SAME transaction as the incident mutation. This
-- covers current Spring services, legacy/shared-database writers and future write paths without
-- relying on every caller to remember an application callback. It is a change ledger, not a
-- delivery outbox: connected clients receive only a wake-up and always recover through the cursor.

-- The single head row is the serialization point for cursor assignment. A sequence/BIGSERIAL is
-- not sufficient: it is allocated before commit, so a delayed lower id can become visible after a
-- client has already advanced past it.
create table platform.domain_sync_head (
    singleton   boolean primary key default true check (singleton),
    last_cursor bigint      not null default 0 check (last_cursor >= 0),
    updated_at  timestamptz not null default now()
);
insert into platform.domain_sync_head(singleton, last_cursor)
values (true, 0)
on conflict (singleton) do nothing;

create table platform.domain_sync_events (
    sync_sequence       bigint       primary key,
    event_type          varchar(100) not null,
    aggregate_type      varchar(80)  not null,
    aggregate_id        bigint       not null,
    change_type         varchar(20)  not null,
    required_permission varchar(100) not null,
    region_id           bigint,
    district_id         bigint,
    council_id          bigint,
    occurred_at         timestamptz  not null default clock_timestamp(),
    constraint domain_sync_event_type_ck
        check (event_type ~ '^[a-z][a-z0-9_.-]{2,99}$'),
    constraint domain_sync_aggregate_type_ck
        check (aggregate_type ~ '^[a-z][a-z0-9_.-]{1,79}$'),
    constraint domain_sync_change_type_ck
        check (change_type in ('created', 'updated', 'deleted')),
    constraint domain_sync_permission_ck
        check (required_permission ~ '^[a-z][a-z0-9_.-]{2,99}$')
);

create index domain_sync_events_area_cursor_idx
    on platform.domain_sync_events (region_id, district_id, council_id, sync_sequence);
create index domain_sync_events_aggregate_cursor_idx
    on platform.domain_sync_events (aggregate_type, aggregate_id, sync_sequence);
create index domain_sync_events_retention_idx
    on platform.domain_sync_events (occurred_at, sync_sequence);

comment on table platform.domain_sync_events is
    'Transactionally committed, permission- and jurisdiction-scoped deltas used for mobile/web cursor convergence.';
comment on column platform.domain_sync_events.sync_sequence is
    'Transaction-serialized server cursor; clients persist it only after committing the associated delta page locally.';

-- Cleanup advances this watermark atomically with deletion. A client below it must take a new
-- GraphQL snapshot rather than pretending the retained suffix is a complete history.
create table platform.sync_event_retention_state (
    singleton            boolean primary key default true check (singleton),
    last_pruned_sequence bigint      not null default 0 check (last_pruned_sequence >= 0),
    updated_at           timestamptz not null default now()
);
insert into platform.sync_event_retention_state (singleton, last_pruned_sequence)
values (true, 0)
on conflict (singleton) do nothing;

create or replace function platform.append_incident_sync_event(
    aggregate_id_value bigint,
    change_name varchar,
    region_id_value bigint,
    district_id_value bigint,
    council_id_value bigint
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, platform
as $function$
declare
    next_cursor bigint;
begin
    -- This UPSERT takes the singleton row lock and holds it until the caller's transaction commits.
    -- Concurrent incident transactions therefore cannot become visible out of cursor order.
    insert into platform.domain_sync_head(singleton, last_cursor, updated_at)
    values (true, 1, now())
    on conflict (singleton) do update
       set last_cursor = platform.domain_sync_head.last_cursor + 1,
           updated_at = now()
    returning last_cursor into next_cursor;

    insert into platform.domain_sync_events (
        sync_sequence, event_type, aggregate_type, aggregate_id, change_type, required_permission,
        region_id, district_id, council_id
    ) values (
        next_cursor, 'incident.' || change_name, 'incident', aggregate_id_value,
        change_name, 'incidents.view', region_id_value, district_id_value, council_id_value
    );
end;
$function$;

revoke all on function platform.append_incident_sync_event(bigint, varchar, bigint, bigint, bigint)
    from public;

create or replace function platform.capture_incident_sync_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, platform
as $function$
begin
    if tg_op = 'INSERT' then
        perform platform.append_incident_sync_event(
            new.id, 'created', new.region_id, new.district_id, new.council_id);
    elsif tg_op = 'UPDATE' then
        if old.region_id is distinct from new.region_id
           or old.district_id is distinct from new.district_id
           or old.council_id is distinct from new.council_id then
            -- A client in the former jurisdiction must remove the row even though it still exists
            -- for the new jurisdiction. National clients safely process delete then update/refetch.
            perform platform.append_incident_sync_event(
                old.id, 'deleted', old.region_id, old.district_id, old.council_id);
        end if;
        perform platform.append_incident_sync_event(
            new.id, 'updated', new.region_id, new.district_id, new.council_id);
    else
        -- Preserve the former scope as a tombstone so an offline scoped client can remove the row.
        perform platform.append_incident_sync_event(
            old.id, 'deleted', old.region_id, old.district_id, old.council_id);
    end if;

    if tg_op = 'DELETE' then
        return old;
    end if;
    return new;
end;
$function$;

drop trigger if exists incidents_capture_sync_event on public.incidents;
create trigger incidents_capture_sync_event
after insert or update or delete on public.incidents
for each row execute function platform.capture_incident_sync_event();

revoke all on function platform.capture_incident_sync_event() from public;
