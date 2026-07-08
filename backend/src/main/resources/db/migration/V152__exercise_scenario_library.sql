-- F06: reusable exercise scenario library for scaled Command Post simulations.
--
-- The existing Command Post already supports one incident/forecast activation, drill isolation,
-- injects and AAR. These tables add the missing reusable scenario layer: template incidents,
-- MSEL events, participant rosters, compressed-time launches and run grouping.

create table if not exists public.exercise_scenarios (
  id                         bigserial primary key,
  code                       varchar(80) not null unique,
  title                      varchar(220) not null,
  hazard                     varchar(160) not null,
  description                text,
  regions                    json not null default '[]'::json,
  objectives                 json not null default '[]'::json,
  default_time_compression   numeric(8,2) not null default 1
                             check (default_time_compression > 0),
  status                     varchar(20) not null default 'active'
                             check (status in ('draft','active','archived')),
  created_by                 bigint references public.users(id) on delete set null,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);

create table if not exists public.scenario_incidents (
  id                    bigserial primary key,
  scenario_id           bigint not null references public.exercise_scenarios(id) on delete cascade,
  sort_order            integer not null default 0,
  title                 varchar(255) not null,
  description           text,
  incident_type_id      bigint references public.incident_types(id) on delete set null,
  severity_level        varchar(255) not null default 'Major',
  region_id             bigint references public.regions(id) on delete set null,
  district_id           bigint references public.districts(id) on delete set null,
  region_name           varchar(255),
  district_name         varchar(255),
  location_description  text,
  latitude              numeric(10,7),
  longitude             numeric(10,7),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (scenario_id, sort_order)
);

create table if not exists public.scenario_events (
  id                    bigserial primary key,
  scenario_id           bigint not null references public.exercise_scenarios(id) on delete cascade,
  incident_template_id  bigint references public.scenario_incidents(id) on delete cascade,
  sort_order            integer not null default 0,
  offset_minutes        integer not null check (offset_minutes >= 0),
  title                 varchar(220) not null,
  detail                text,
  inject_type           varchar(20) not null default 'event'
                        check (inject_type in ('event','decision','message')),
  target_drf_id         bigint references public.disaster_response_functions(id) on delete set null,
  expected_action       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (scenario_id, sort_order)
);

create table if not exists public.scenario_participants (
  id            bigserial primary key,
  scenario_id   bigint not null references public.exercise_scenarios(id) on delete cascade,
  user_id       bigint not null references public.users(id) on delete cascade,
  command_role  varchar(30) check (command_role in
                  ('IC','Deputy IC','Operations','Planning','Logistics','Finance/Admin','PIO','Safety','Liaison')),
  drf_id        bigint references public.disaster_response_functions(id) on delete set null,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (scenario_id, user_id, command_role, drf_id)
);

create table if not exists public.exercise_runs (
  id                       bigserial primary key,
  scenario_id              bigint not null references public.exercise_scenarios(id) on delete cascade,
  run_code                 varchar(100) not null unique,
  launched_by              bigint references public.users(id) on delete set null,
  launched_at              timestamptz not null default now(),
  time_compression_factor  numeric(8,2) not null default 1
                           check (time_compression_factor > 0),
  allow_real_ops           boolean not null default false,
  status                   varchar(20) not null default 'active'
                           check (status in ('active','completed','cancelled')),
  notes                    text
);

create table if not exists public.exercise_participants (
  id            bigserial primary key,
  run_id        bigint not null references public.exercise_runs(id) on delete cascade,
  activation_id bigint references public.response_activations(id) on delete cascade,
  user_id       bigint not null references public.users(id) on delete cascade,
  command_role  varchar(30),
  drf_id        bigint references public.disaster_response_functions(id) on delete set null,
  status        varchar(20) not null default 'enrolled'
                check (status in ('enrolled','active','released')),
  notes         text,
  created_at    timestamptz not null default now()
);

alter table public.incidents
  add column if not exists exercise_run_id bigint,
  add column if not exists scenario_incident_id bigint;

alter table public.response_activations
  add column if not exists exercise_run_id bigint,
  add column if not exists scenario_id bigint,
  add column if not exists scenario_incident_id bigint;

alter table public.activation_injects
  add column if not exists scenario_event_id bigint,
  add column if not exists target_drf_id bigint,
  add column if not exists expected_action text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'incidents_exercise_run_id_fkey') then
    alter table public.incidents
      add constraint incidents_exercise_run_id_fkey
      foreign key (exercise_run_id) references public.exercise_runs(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'incidents_scenario_incident_id_fkey') then
    alter table public.incidents
      add constraint incidents_scenario_incident_id_fkey
      foreign key (scenario_incident_id) references public.scenario_incidents(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'response_activations_exercise_run_id_fkey') then
    alter table public.response_activations
      add constraint response_activations_exercise_run_id_fkey
      foreign key (exercise_run_id) references public.exercise_runs(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'response_activations_scenario_id_fkey') then
    alter table public.response_activations
      add constraint response_activations_scenario_id_fkey
      foreign key (scenario_id) references public.exercise_scenarios(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'response_activations_scenario_incident_id_fkey') then
    alter table public.response_activations
      add constraint response_activations_scenario_incident_id_fkey
      foreign key (scenario_incident_id) references public.scenario_incidents(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'activation_injects_scenario_event_id_fkey') then
    alter table public.activation_injects
      add constraint activation_injects_scenario_event_id_fkey
      foreign key (scenario_event_id) references public.scenario_events(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'activation_injects_target_drf_id_fkey') then
    alter table public.activation_injects
      add constraint activation_injects_target_drf_id_fkey
      foreign key (target_drf_id) references public.disaster_response_functions(id) on delete set null;
  end if;
end $$;

create index if not exists idx_scenario_incidents_scenario on public.scenario_incidents(scenario_id, sort_order);
create index if not exists idx_scenario_events_scenario on public.scenario_events(scenario_id, sort_order);
create index if not exists idx_scenario_participants_scenario on public.scenario_participants(scenario_id);
create index if not exists idx_exercise_runs_scenario on public.exercise_runs(scenario_id, status);
create index if not exists idx_exercise_participants_run on public.exercise_participants(run_id, activation_id);
create index if not exists idx_incidents_exercise_run on public.incidents(exercise_run_id);
create index if not exists idx_response_activations_exercise_run on public.response_activations(exercise_run_id);
create index if not exists idx_activation_injects_scenario_event on public.activation_injects(scenario_event_id);

-- Seed one reusable national-scale scenario so the library is immediately usable after migration.
with inserted as (
  insert into public.exercise_scenarios
    (code, title, hazard, description, regions, objectives, default_time_compression, status)
  select
    'TZ-CYCLONE-FLOOD-HEALTH-72H',
    'Coastal cyclone, flood and health surge exercise',
    'Cyclone / flood / disease outbreak',
    'Composite 72-hour exercise spanning cyclone landfall, river flooding and a post-impact health surge.',
    '["Mtwara","Lindi","Pwani"]'::json,
    '["Open multi-region command posts","Coordinate evacuation, WASH and health surveillance","Resolve MSEL injects under compressed time"]'::json,
    12,
    'active'
  where not exists (
    select 1 from public.exercise_scenarios where code = 'TZ-CYCLONE-FLOOD-HEALTH-72H'
  )
  returning id
), scenario as (
  select id from inserted
  union all
  select id from public.exercise_scenarios where code = 'TZ-CYCLONE-FLOOD-HEALTH-72H'
  limit 1
), incident_rows(sort_order, title, description, severity_level, region_name, district_name, location_description, latitude, longitude) as (
  values
    (1, 'Cyclone landfall and coastal storm surge',
     'Destructive winds, storm surge and evacuation pressure along the southern coast.',
     'Critical', 'Mtwara', null, 'Mtwara coastal belt', -10.2690, 40.1820),
    (2, 'River flooding and road-access disruption',
     'Flooding isolates communities and disrupts relief access corridors.',
     'Major', 'Lindi', null, 'Lindi river basin', -9.9971, 39.7165),
    (3, 'Post-impact health surveillance surge',
     'Shelter congestion and unsafe water trigger urgent health and WASH surveillance.',
     'Major', 'Pwani', null, 'Coastal evacuation shelters', -6.8550, 38.9000)
)
insert into public.scenario_incidents
  (scenario_id, sort_order, title, description, severity_level, region_id, district_id,
   region_name, district_name, location_description, latitude, longitude)
select s.id, r.sort_order, r.title, r.description, r.severity_level,
       (select id from public.regions where lower(name) = lower(r.region_name) limit 1),
       case when r.district_name is null then null
            else (select id from public.districts where lower(name) = lower(r.district_name) limit 1) end,
       r.region_name, r.district_name, r.location_description, r.latitude, r.longitude
from scenario s
cross join incident_rows r
where not exists (
  select 1 from public.scenario_incidents x
  where x.scenario_id = s.id and x.sort_order = r.sort_order
);

with scenario as (
  select id from public.exercise_scenarios where code = 'TZ-CYCLONE-FLOOD-HEALTH-72H'
), event_rows(sort_order, incident_sort, offset_minutes, title, detail, inject_type, drf_number, expected_action) as (
  values
    (1, null, 0, 'Exercise start: national coordination briefing',
     'Exercise director releases the initial cyclone/flood/health composite briefing.',
     'message', 1, 'Confirm command structure, common operating picture and reporting rhythm.'),
    (2, 1, 30, 'Storm surge blocks primary evacuation route',
     'District reports the main coastal road is impassable and buses must be redirected.',
     'event', 3, 'Logistics identifies an alternate route and updates evacuation transport plan.'),
    (3, 2, 60, 'Bridge washout isolates two wards',
     'Floodwater has cut access to two wards; local responders request boat support.',
     'decision', 7, 'Search and Rescue prioritizes access plan and resource request.'),
    (4, 3, 90, 'Shelter clinic reports suspected cholera cluster',
     'Three acute watery diarrhoea cases are reported from a crowded evacuation shelter.',
     'event', 6, 'Health/Medical opens surveillance line list and coordinates WASH response.'),
    (5, 1, 150, 'Evacuation centre exceeds planned capacity',
     'Centre manager reports arrivals above capacity and shortage of NFIs.',
     'event', 4, 'Shelter/NFI identifies overflow site and requests relief stock.'),
    (6, null, 240, 'Prime Minister situation brief due',
     'National leadership requests an integrated situation report covering all affected regions.',
     'decision', 1, 'Coordination compiles cross-region SITREP with decisions needed.')
), resolved as (
  select s.id as scenario_id, e.*, si.id as incident_template_id, drf.id as target_drf_id
  from scenario s
  join event_rows e on true
  left join public.scenario_incidents si
    on si.scenario_id = s.id and si.sort_order = e.incident_sort
  left join public.disaster_response_functions drf
    on drf.number = e.drf_number
)
insert into public.scenario_events
  (scenario_id, incident_template_id, sort_order, offset_minutes, title, detail,
   inject_type, target_drf_id, expected_action)
select scenario_id, incident_template_id, sort_order, offset_minutes, title, detail,
       inject_type, target_drf_id, expected_action
from resolved r
where not exists (
  select 1 from public.scenario_events x
  where x.scenario_id = r.scenario_id and x.sort_order = r.sort_order
);
