-- Monitoring & Evaluation indicator registry and value store.
-- V166 introduced the module shell/permissions. This migration makes M&E configurable from the system:
-- PMO-DMD can maintain indicator definitions, while authorised area/sector actors can enter period values
-- for their own context. It is intentionally separate from INFORM, because M&E indicators are operational
-- period measures rather than a 0-10 risk-model registry.

insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at)
values
  ('monitoring_evaluation.enter', 'Monitoring & Evaluation', 'enter',
   'Enter Monitoring & Evaluation values', 'web', now(), now()),
  ('monitoring_evaluation.manage', 'Monitoring & Evaluation', 'manage',
   'Manage Monitoring & Evaluation indicators', 'web', now(), now())
on conflict (name) do update
set module = excluded.module,
    action = excluded.action,
    label = excluded.label,
    updated_at = now();

with grants(permission_name, role_name) as (
  values
    ('monitoring_evaluation.enter', 'Super Admin'),
    ('monitoring_evaluation.enter', 'ICT Admin'),
    ('monitoring_evaluation.enter', 'Director'),
    ('monitoring_evaluation.enter', 'Asst. Director'),
    ('monitoring_evaluation.enter', 'EOCC'),
    ('monitoring_evaluation.enter', 'Reg DC'),
    ('monitoring_evaluation.enter', 'RAS'),
    ('monitoring_evaluation.enter', 'RC'),
    ('monitoring_evaluation.enter', 'Regional Planning Officer'),
    ('monitoring_evaluation.enter', 'Regional Logistic Officer'),
    ('monitoring_evaluation.enter', 'Dist DC'),
    ('monitoring_evaluation.enter', 'DED'),
    ('monitoring_evaluation.enter', 'DAS'),
    ('monitoring_evaluation.enter', 'District Commissioner'),
    ('monitoring_evaluation.enter', 'District Planning Officer'),
    ('monitoring_evaluation.enter', 'District Logistic Officer'),
    ('monitoring_evaluation.enter', 'MDA Focal')
)
insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from grants g
join public.permissions p on p.name = g.permission_name
join public.roles r on r.name = g.role_name
on conflict do nothing;

create table if not exists public.me_indicator_catalog (
    id                  bigserial primary key,
    code                varchar(90) not null unique,
    name                varchar(260) not null,
    description         text,
    domain              varchar(90) not null,
    disaster_cycle      varchar(40),
    level               varchar(30) not null default 'national',
    value_type          varchar(20) not null default 'number',
    unit                varchar(60),
    frequency           varchar(40) not null default 'quarterly',
    owner_type          varchar(40) not null default 'pmo-dmd',
    owner_agency_id     bigint references public.agencies(id) on delete set null,
    stakeholder_type    varchar(80),
    sector              varchar(120),
    source_module       varchar(120),
    target_value        numeric(18,4),
    direction           varchar(12) not null default 'higher',
    sort_order          integer not null default 1000,
    active              boolean not null default true,
    created_by          bigint references public.users(id) on delete set null,
    updated_by          bigint references public.users(id) on delete set null,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    constraint me_indicator_level_ck check (level in (
        'national','region','district','council','agency','stakeholder','incident','warning'
    )),
    constraint me_indicator_value_type_ck check (value_type in (
        'number','count','currency','percent','boolean','text'
    )),
    constraint me_indicator_direction_ck check (direction in ('higher','lower','neutral')),
    constraint me_indicator_cycle_ck check (
        disaster_cycle is null or disaster_cycle in ('prevention_mitigation','preparedness','response','recovery')
    )
);

create table if not exists public.me_indicator_values (
    id              bigserial primary key,
    indicator_id    bigint not null references public.me_indicator_catalog(id) on delete cascade,
    period_label    varchar(50) not null,
    period_start    date,
    period_end      date,
    area_level      varchar(30) not null default 'national',
    region_id       bigint references public.regions(id) on delete set null,
    district_id     bigint references public.districts(id) on delete set null,
    council_id      bigint references public.councils(id) on delete set null,
    agency_id       bigint references public.agencies(id) on delete set null,
    stakeholder_id  bigint references public.stakeholders(id) on delete set null,
    incident_id     bigint references public.incidents(id) on delete set null,
    warning_id      bigint references public.warnings(id) on delete set null,
    numeric_value   numeric(18,4),
    text_value      text,
    status          varchar(20) not null default 'draft',
    notes           text,
    data_source     varchar(160),
    submitted_by    bigint references public.users(id) on delete set null,
    submitted_at    timestamptz,
    approved_by     bigint references public.users(id) on delete set null,
    approved_at     timestamptz,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    constraint me_value_area_level_ck check (area_level in (
        'national','region','district','council','agency','stakeholder','incident','warning'
    )),
    constraint me_value_status_ck check (status in ('draft','submitted','approved','rejected'))
);

create unique index if not exists ux_me_indicator_value_key
on public.me_indicator_values (
    indicator_id,
    period_label,
    area_level,
    coalesce(region_id, 0),
    coalesce(district_id, 0),
    coalesce(council_id, 0),
    coalesce(agency_id, 0),
    coalesce(stakeholder_id, 0),
    coalesce(incident_id, 0),
    coalesce(warning_id, 0)
);

create index if not exists idx_me_indicator_catalog_level on public.me_indicator_catalog(level, active);
create index if not exists idx_me_indicator_catalog_domain on public.me_indicator_catalog(domain, active);
create index if not exists idx_me_indicator_values_period on public.me_indicator_values(period_label, status);
create index if not exists idx_me_indicator_values_area on public.me_indicator_values(area_level, region_id, district_id, council_id);
create index if not exists idx_me_indicator_values_entity on public.me_indicator_values(agency_id, stakeholder_id);

with seed(code, name, description, domain, disaster_cycle, level, value_type, unit, frequency,
          owner_type, stakeholder_type, sector, source_module, target_value, direction, sort_order) as (
  values
    ('REG_BUDGET_ALLOCATED', 'Regional disaster management budget allocated',
     'Budget allocated by a region for disaster risk management and response readiness.',
     'Regions', null, 'region', 'currency', 'TZS', 'annual', 'region', null, null, 'Budget & Finance', null, 'higher', 10),
    ('REG_EOC_OPERATIONAL', 'Regional Emergency Operations and Communication Centre operational',
     'Whether the region has an operational emergency operations and communication centre.',
     'Regions', 'preparedness', 'region', 'boolean', null, 'quarterly', 'region', null, null, 'Preparedness', 1, 'higher', 20),
    ('REG_RESPONSE_TEAM_FUNCTIONAL', 'Regional emergency response team functional',
     'Functional regional emergency response team / RDMC staffing and readiness.',
     'Regions', 'preparedness', 'region', 'percent', '%', 'quarterly', 'region', null, null, 'Incident Flow', 100, 'higher', 30),
    ('REG_PREVENTION_ACTIVITIES', 'Regional prevention and mitigation activities implemented',
     'Activities implemented against prevention and mitigation priorities in the disaster management cycle.',
     'Regions', 'prevention_mitigation', 'region', 'count', 'activities', 'quarterly', 'region', null, null, 'Prevention & Mitigation', null, 'higher', 40),
    ('REG_PREPAREDNESS_ACTIVITIES', 'Regional preparedness activities implemented',
     'Preparedness activities implemented by the region.',
     'Regions', 'preparedness', 'region', 'count', 'activities', 'quarterly', 'region', null, null, 'Preparedness', null, 'higher', 50),
    ('REG_RESPONSE_ACTIVITIES', 'Regional response activities implemented',
     'Response activities implemented by the region during incidents or readiness posture.',
     'Regions', 'response', 'region', 'count', 'activities', 'quarterly', 'region', null, null, 'Response', null, 'higher', 60),
    ('REG_RECOVERY_ACTIVITIES', 'Regional recovery activities implemented',
     'Recovery activities implemented by the region after disaster events.',
     'Regions', 'recovery', 'region', 'count', 'activities', 'quarterly', 'region', null, null, 'Recovery', null, 'higher', 70),

    ('LGA_BUDGET_ALLOCATED', 'District / LGA disaster management budget allocated',
     'Budget allocated by district or LGA for disaster risk management and response readiness.',
     'District / LGA', null, 'council', 'currency', 'TZS', 'annual', 'district', null, null, 'Budget & Finance', null, 'higher', 110),
    ('LGA_PREPAREDNESS_PLAN', 'Emergency response and preparedness plan in place',
     'Whether the district/LGA has an approved emergency response and preparedness plan.',
     'District / LGA', 'preparedness', 'council', 'boolean', null, 'quarterly', 'district', null, null, 'Preparedness', 1, 'higher', 120),
    ('LGA_PREVENTION_ACTIVITIES', 'District / LGA prevention and mitigation activities implemented',
     'LGA prevention and mitigation activities implemented in the reporting period.',
     'District / LGA', 'prevention_mitigation', 'council', 'count', 'activities', 'quarterly', 'district', null, null, 'Prevention & Mitigation', null, 'higher', 130),
    ('LGA_PREPAREDNESS_ACTIVITIES', 'District / LGA preparedness activities implemented',
     'LGA preparedness activities implemented in the reporting period.',
     'District / LGA', 'preparedness', 'council', 'count', 'activities', 'quarterly', 'district', null, null, 'Preparedness', null, 'higher', 140),
    ('LGA_RESPONSE_ACTIVITIES', 'District / LGA response activities implemented',
     'LGA response activities implemented in the reporting period.',
     'District / LGA', 'response', 'council', 'count', 'activities', 'quarterly', 'district', null, null, 'Response', null, 'higher', 150),
    ('LGA_RECOVERY_ACTIVITIES', 'District / LGA recovery activities implemented',
     'LGA recovery activities implemented in the reporting period.',
     'District / LGA', 'recovery', 'council', 'count', 'activities', 'quarterly', 'district', null, null, 'Recovery', null, 'higher', 160),

    ('MDA_SECTOR_DRR_BUDGET', 'Ministry sector disaster-risk budget',
     'Sector budget allocated by a ministry or government agency for disaster risk reduction and preparedness.',
     'Ministries and MDAs', null, 'agency', 'currency', 'TZS', 'annual', 'agency', null, null, 'M&E Manual Entry', null, 'higher', 210),
    ('MDA_SECTOR_CONTINGENCY_PLAN', 'Sector contingency or continuity plan in place',
     'Whether the ministry/institution has an approved sector contingency or continuity plan.',
     'Ministries and MDAs', 'preparedness', 'agency', 'boolean', null, 'annual', 'agency', null, null, 'M&E Manual Entry', 1, 'higher', 220),
    ('MDA_SECTOR_RESPONSE_CAPACITY', 'Sector response capacity available',
     'Operational sector capacity available for disaster response, keyed as percentage readiness.',
     'Ministries and MDAs', 'response', 'agency', 'percent', '%', 'quarterly', 'agency', null, null, 'M&E Manual Entry', 100, 'higher', 230),
    ('GOV_INST_RESOURCE_READINESS', 'Government institution resource readiness',
     'Readiness level of government institutions supporting disaster operations.',
     'Government Institutions', 'preparedness', 'agency', 'percent', '%', 'quarterly', 'agency', null, null, 'Resource Management', 100, 'higher', 240),

    ('PMO_SP_2026_2031_MILESTONE', 'PMO-DMD strategic-plan milestone progress',
     'Progress against SP 2026-2031 disaster management milestones.',
     'PMO-DMD Strategic Plan', null, 'national', 'percent', '%', 'quarterly', 'pmo-dmd', null, 'PMO-DMD', 'M&E Manual Entry', 100, 'higher', 310),
    ('PMO_EOCC_READINESS', 'National EOCC readiness',
     'Readiness of the national Emergency Operations and Communication Centre.',
     'PMO-DMD Strategic Plan', 'preparedness', 'national', 'percent', '%', 'monthly', 'pmo-dmd', null, 'PMO-DMD', 'Command Post', 100, 'higher', 320),
    ('PMO_NDMF_DISBURSEMENT', 'NDMF disbursement execution',
     'Execution rate of National Disaster Management Fund disbursements.',
     'PMO-DMD Strategic Plan', 'response', 'national', 'percent', '%', 'quarterly', 'pmo-dmd', null, 'PMO-DMD', 'Budget & Finance', 100, 'higher', 330),

    ('PARTNER_RESOURCE_COMMITMENT', 'Partner resource commitments',
     'Resources committed by non-state partners for preparedness, response or recovery.',
     'FBO / NGO / INGO / Private', 'response', 'stakeholder', 'currency', 'TZS', 'quarterly', 'stakeholder', null, null, 'Stakeholder Portal', null, 'higher', 410),
    ('PARTNER_GEOGRAPHIC_COVERAGE', 'Partner geographic coverage',
     'Number of regions/districts/LGAs covered by a partner programme or operation.',
     'FBO / NGO / INGO / Private', null, 'stakeholder', 'count', 'areas', 'quarterly', 'stakeholder', null, null, 'Stakeholder Portal', null, 'higher', 420),
    ('PARTNER_TRAINING_SUPPORT', 'Partner training or measure support delivered',
     'Training, mitigation-measure or preparedness support delivered by partners.',
     'FBO / NGO / INGO / Private', 'preparedness', 'stakeholder', 'count', 'activities', 'quarterly', 'stakeholder', null, null, 'Stakeholder Portal', null, 'higher', 430),

    ('INCIDENT_RESPONSE_TIME', 'Incident response time',
     'Time from incident report to first coordinated response action.',
     'Incidents', 'response', 'incident', 'number', 'hours', 'event', 'incident', null, null, 'Response', null, 'lower', 510),
    ('INCIDENT_TASK_COMPLETION', 'Incident task completion rate',
     'Share of assigned response tasks completed for the incident.',
     'Incidents', 'response', 'incident', 'percent', '%', 'event', 'incident', null, null, 'Tasks', 100, 'higher', 520),
    ('EW_DISSEMINATION_REACH', 'Early-warning dissemination reach',
     'Estimated share of targeted recipients reached by an issued warning.',
     'Early Warnings', 'preparedness', 'warning', 'percent', '%', 'event', 'warning', null, null, 'Communication & Alerts', 100, 'higher', 610),
    ('EW_ACTION_TRIGGERED', 'Early-warning anticipatory actions triggered',
     'Number of anticipatory or preparedness actions triggered by the warning.',
     'Early Warnings', 'preparedness', 'warning', 'count', 'actions', 'event', 'warning', null, null, 'Anticipatory Action Plans', null, 'higher', 620),

    ('RESOURCE_STOCK_COVERAGE', 'Resource stock coverage',
     'Estimated coverage of essential disaster-response stock against readiness requirements.',
     'Resources and Country Readiness', 'preparedness', 'region', 'percent', '%', 'monthly', 'pmo-dmd', null, null, 'Warehouse & Stock', 100, 'higher', 710),
    ('RESOURCE_DISTRIBUTION_EQUITY', 'Resource distribution equity',
     'Equity of resource distribution against incident need and geographic vulnerability.',
     'Resources and Country Readiness', 'response', 'region', 'percent', '%', 'quarterly', 'pmo-dmd', null, null, 'Resource Allocation', 100, 'higher', 720)
)
insert into public.me_indicator_catalog(code, name, description, domain, disaster_cycle, level, value_type, unit,
                                        frequency, owner_type, stakeholder_type, sector, source_module,
                                        target_value, direction, sort_order, active, created_at, updated_at)
select code, name, description, domain, disaster_cycle, level, value_type, unit, frequency, owner_type,
       stakeholder_type, sector, source_module, target_value, direction, sort_order, true, now(), now()
from seed
on conflict (code) do update
set name = excluded.name,
    description = excluded.description,
    domain = excluded.domain,
    disaster_cycle = excluded.disaster_cycle,
    level = excluded.level,
    value_type = excluded.value_type,
    unit = excluded.unit,
    frequency = excluded.frequency,
    owner_type = excluded.owner_type,
    stakeholder_type = excluded.stakeholder_type,
    sector = excluded.sector,
    source_module = excluded.source_module,
    target_value = excluded.target_value,
    direction = excluded.direction,
    sort_order = excluded.sort_order,
    updated_at = now();
