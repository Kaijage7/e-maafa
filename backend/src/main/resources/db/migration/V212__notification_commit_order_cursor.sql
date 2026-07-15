-- A BIGSERIAL id is allocated before transaction commit. Using it directly as a reconnect cursor can
-- permanently skip a lower-id notification that commits after a higher-id transaction. Assign a
-- per-user sequence while holding that user's head-row lock; the lock is retained until commit, so
-- visible rows cannot commit out of sequence for that user.

alter table public.resource_notifications
    add column if not exists sync_sequence bigint;

with ranked as (
    select id,
           row_number() over (partition by user_id order by id) as sequence_number
      from public.resource_notifications
)
update public.resource_notifications notification
   set sync_sequence = ranked.sequence_number
  from ranked
 where notification.id = ranked.id
   and notification.sync_sequence is null;

create table if not exists platform.notification_sync_heads (
    user_id       bigint primary key,
    last_sequence bigint not null check (last_sequence >= 0),
    updated_at    timestamptz not null default now()
);

insert into platform.notification_sync_heads(user_id, last_sequence, updated_at)
select user_id, max(sync_sequence), now()
  from public.resource_notifications
 group by user_id
on conflict (user_id) do update
   set last_sequence = greatest(platform.notification_sync_heads.last_sequence,
                               excluded.last_sequence),
       updated_at = now();

alter table public.resource_notifications
    alter column sync_sequence set not null;

create unique index if not exists resource_notifications_user_sync_uq
    on public.resource_notifications(user_id, sync_sequence);

create or replace function platform.assign_notification_sync_sequence()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, platform
as $$
begin
    insert into platform.notification_sync_heads(user_id, last_sequence, updated_at)
    values (new.user_id, 1, now())
    on conflict (user_id) do update
       set last_sequence = platform.notification_sync_heads.last_sequence + 1,
           updated_at = now()
    returning last_sequence into new.sync_sequence;
    return new;
end;
$$;

drop trigger if exists resource_notifications_assign_sync_sequence
    on public.resource_notifications;
create trigger resource_notifications_assign_sync_sequence
before insert on public.resource_notifications
for each row execute function platform.assign_notification_sync_sequence();

revoke all on function platform.assign_notification_sync_sequence() from public;

comment on column public.resource_notifications.sync_sequence is
    'Per-user transaction-serialized reconnect cursor; unlike BIGSERIAL id it cannot commit out of order for one user.';
comment on table platform.notification_sync_heads is
    'Row-lock heads used to assign commit-ordered per-user notification sync sequences.';
