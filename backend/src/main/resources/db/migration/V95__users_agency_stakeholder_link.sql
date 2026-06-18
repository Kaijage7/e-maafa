-- Link a user account to the agency or stakeholder it represents, so endpoints can scope a login to
-- its own institution (e.g. an EW agency focal acting only on its agency's submissions; a partner login
-- seeing only its own stakeholder records). NULL = no institution restriction (national / admin).
-- Idempotent: ADD COLUMN IF NOT EXISTS + guarded FK creation.

alter table public.users add column if not exists agency_id      bigint;
alter table public.users add column if not exists stakeholder_id bigint;

do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'users_agency_id_fkey') then
        alter table public.users add constraint users_agency_id_fkey
            foreign key (agency_id) references public.agencies(id) on delete set null;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'users_stakeholder_id_fkey') then
        alter table public.users add constraint users_stakeholder_id_fkey
            foreign key (stakeholder_id) references public.stakeholders(id) on delete set null;
    end if;
end $$;

create index if not exists idx_users_agency_id      on public.users (agency_id);
create index if not exists idx_users_stakeholder_id on public.users (stakeholder_id);

-- Backfill the agency focal logins by their agency acronym.
update public.users u set agency_id = a.id
  from public.agencies a
 where u.agency_id is null and a.acronym = 'TMA'  and u.email = 'tma@meteo.go.tz';
update public.users u set agency_id = a.id
  from public.agencies a
 where u.agency_id is null and a.acronym = 'MoH'  and u.email = 'moh@pmo.go.tz';
update public.users u set agency_id = a.id
  from public.agencies a
 where u.agency_id is null and a.acronym = 'MoW'  and u.email = 'mow@pmo.go.tz';
update public.users u set agency_id = a.id
  from public.agencies a
 where u.agency_id is null and a.acronym = 'MoA'  and u.email = 'moa@pmo.go.tz';
update public.users u set agency_id = a.id
  from public.agencies a
 where u.agency_id is null and a.acronym = 'NEMC' and u.email = 'nemc@pmo.go.tz';
update public.users u set agency_id = a.id
  from public.agencies a
 where u.agency_id is null and a.acronym = 'GST'  and u.email = 'gst@pmo.go.tz';

-- Backfill stakeholder logins from the existing stakeholders.user_id link (reverse direction).
update public.users u set stakeholder_id = s.id
  from public.stakeholders s
 where u.stakeholder_id is null and s.user_id = u.id;
