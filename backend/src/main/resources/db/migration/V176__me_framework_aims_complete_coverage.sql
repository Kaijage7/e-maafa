-- V176: Lock the original M&E module aims into a governed framework.
-- Ensures every stated reporting surface has catalogue indicators, exact TCVMP wording,
-- and a dashboard-facing aim map. No invented policy — only the agreed structure:
--   Regions · District/LGA · Ministries & Gov institutions · Partners (FBO/NGO/INGO/Private)
--   · PMO-DMD / SP 2026–2031 · Incidents · Early warnings · National resources & readiness
--   · FY planning considering Tanzania Climate Vulnerability Map System (TCVMP)
--   · Quarterly response/recovery reporting · Regional response budget use

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Framework aims (what the module is for) — single source of truth for UI
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.me_framework_aims (
    aim_code varchar(60) primary key,
    aim_group varchar(80) not null,
    title_en varchar(255) not null,
    title_sw varchar(255),
    description_en text,
    me_level varchar(30) not null,
    indicator_codes text not null,
    sort_order integer not null default 100,
    active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

insert into public.me_framework_aims(aim_code, aim_group, title_en, title_sw, description_en, me_level, indicator_codes, sort_order)
values
('AIM_REGION', 'Area reporting',
 'Regions', 'Mikoa',
 'Regional budget allocated; Regional Emergency Operations and Communication Centre; Regional Emergency Response Teams; activities implemented across the disaster management cycle (prevention/mitigation, preparedness, response, recovery); regional FY planning considering TCVMP; quarterly response/recovery reports; resources used in response from the regional budget.',
 'region',
 'REG_BUDGET_ALLOCATED,REG_EOC_OPERATIONAL,REG_RESPONSE_TEAM_FUNCTIONAL,REG_PREVENTION_ACTIVITIES,REG_PREPAREDNESS_ACTIVITIES,REG_RESPONSE_ACTIVITIES,REG_RECOVERY_ACTIVITIES,REG_FY_TCVMP_CONSIDERED,REG_QTR_RESPONSE_RECOVERY_REPORT,REG_RESPONSE_BUDGET_USED,RESOURCE_STOCK_COVERAGE,RESOURCE_DISTRIBUTION_EQUITY',
 10),
('AIM_LGA', 'Area reporting',
 'District / LGA', 'Wilaya / Halmashauri',
 'District/LGA budget allocated; Emergency Response and Preparedness Plan; activities implemented across the disaster management cycle (prevention/mitigation, preparedness, response, recovery); FY planning considering TCVMP; quarterly response/recovery reporting.',
 'council',
 'LGA_BUDGET_ALLOCATED,LGA_PREPAREDNESS_PLAN,LGA_PREVENTION_ACTIVITIES,LGA_PREPAREDNESS_ACTIVITIES,LGA_RESPONSE_ACTIVITIES,LGA_RECOVERY_ACTIVITIES,LGA_FY_TCVMP_CONSIDERED,LGA_QTR_RESPONSE_RECOVERY_REPORT',
 20),
('AIM_MINISTRY_MDA', 'Institutional reporting',
 'Ministries and government institutions (policy MDAs)',
 'Wizara na taasisi za serikali',
 'All ministries as indicated in the National Disaster Management Policy 2004 (2025 Edition) and government institutions (target ~325): sector budget, contingency, response capacity, policy-role indicators, quarterly response/recovery reports, FY planning considering TCVMP.',
 'agency',
 'MDA_SECTOR_DRR_BUDGET,MDA_SECTOR_CONTINGENCY_PLAN,MDA_SECTOR_RESPONSE_CAPACITY,GOV_INST_RESOURCE_READINESS,MDA_FY_TCVMP_CONSIDERED,MDA_QTR_RESPONSE_RECOVERY_REPORT,MDA_QTR_RESPONSE_RECOVERY_RECORDS,POLICY_STAKEHOLDER_PLATFORM_COORDINATED,POLICY_PORALG_LGA_DRR_INTEGRATION,POLICY_FINANCE_DRR_FUNDS_AVAILABLE,POLICY_PLANNING_DRR_INTEGRATED,POLICY_HEALTH_MEDICAL_SERVICES,POLICY_HEALTH_OUTBREAK_CONTROL,POLICY_HEALTH_RISK_PLAN_BUDGET,POLICY_AGRICULTURE_FOOD_SECURITY,POLICY_AGRICULTURE_RISK_PLAN_BUDGET,POLICY_WATER_RESILIENT_INFRA,POLICY_WATER_FLOOD_EARLY_WARNING,POLICY_ENVIRONMENT_DRR_EIA,POLICY_EDUCATION_DRR_CURRICULUM,POLICY_COMMUNICATION_CONTINUITY,POLICY_SECURITY_PROTECTION',
 30),
('AIM_PARTNERS', 'Institutional reporting',
 'FBO, NGOs, INGOs and private sector',
 'Taasisi za dini, NGOs, INGOs na sekta binafsi',
 'Partner resource commitments, geographic coverage, training support, class-specific UN/NGO/INGO/FBO/private indicators, and FY planning considering TCVMP.',
 'stakeholder',
 'PARTNER_RESOURCE_COMMITMENT,PARTNER_GEOGRAPHIC_COVERAGE,PARTNER_TRAINING_SUPPORT,PARTNER_FY_TCVMP_CONSIDERED,UN_TECHNICAL_ASSISTANCE,UN_HUMANITARIAN_SUPPORT,UN_CAPACITY_BUILDING,NGO_COMMUNITY_PREPAREDNESS,NGO_HUMANITARIAN_ASSISTANCE,NGO_GEOGRAPHIC_COVERAGE,INGO_HUMANITARIAN_SUPPORT,INGO_CAPACITY_BUILDING,FBO_COMMUNITY_MOBILISATION,FBO_HUMANITARIAN_ASSISTANCE,PRIVATE_BCP_IN_PLACE,PRIVATE_CRITICAL_SERVICE_CONTINUITY,PRIVATE_LOGISTICS_SUPPORT,PRIVATE_RISK_TRANSFER',
 40),
('AIM_PMO_DMD', 'National / PMO-DMD',
 'PMO-DMD and Strategic Plan 2026–2031',
 'OWM-SBU / PMO-DMD na Mpango Mkakati 2026–2031',
 'PMO-DMD strategic-plan milestones (SP 2026–2031), national EOCC readiness, NDMF, multi-hazard EWS, coordination, research, frameworks, country readiness and resource equity.',
 'national',
 'PMO_SP_2026_2031_MILESTONE,PMO_EOCC_READINESS,PMO_NDMF_DISBURSEMENT,PMO_NDMF_BUDGET_INCREASE,PMO_MULTIHAZARD_EWS_OPERATIONAL,PMO_RESPONSE_RECOVERY_COORD_PCT,PMO_PUBLIC_AWARENESS_INTERVENTIONS,PMO_CAPACITY_BUILDING_PROGRAMMES,PMO_DISTRICT_RVCA_COUNT,PMO_DRR_STRATEGIES_DEVELOPED,PMO_RESEARCH_STUDIES_COUNT,PMO_FRAMEWORKS_FORMULATED,PMO_STAKEHOLDER_COORD_MEETINGS,PMO_JOINT_COORDINATION_GUIDELINES,PMO_NATIONAL_CONTINGENCY_PLAN,NAT_COUNTRY_READINESS_INDEX,NAT_RESOURCE_DISTRIBUTION_EQUITY,NAT_FY_TCVMP_CONSIDERED',
 50),
('AIM_INCIDENT', 'Event reporting',
 'Incidents', 'Matukio ya maafa',
 'Indicators captured during incidents: response time, task completion, resource deployment and coordination.',
 'incident',
 'INCIDENT_RESPONSE_TIME,INCIDENT_TASK_COMPLETION,INCIDENT_RESOURCE_DEPLOYED,INCIDENT_COORDINATION_ACTIVE',
 60),
('AIM_EARLY_WARNING', 'Event reporting',
 'Early warnings', 'Tahadhari za mapema',
 'Indicators for early-warning dissemination reach, anticipatory actions, and people covered.',
 'warning',
 'EW_DISSEMINATION_REACH,EW_ACTION_TRIGGERED,EW_PEOPLE_REACHED,EW_LEAD_TIME_HOURS',
 70),
('AIM_RESOURCES_READINESS', 'National synthesis',
 'Resources distribution and country readiness',
 'Ugawaji wa rasilimali na utayari wa taifa',
 'General view of types, amounts and distribution of resources in the country, and composite country readiness.',
 'national',
 'NAT_RESOURCE_DISTRIBUTION_EQUITY,NAT_COUNTRY_READINESS_INDEX,RESOURCE_STOCK_COVERAGE,RESOURCE_DISTRIBUTION_EQUITY,PMO_EOCC_READINESS',
 80),
('AIM_TCVMP_FY', 'FY planning',
 'FY budgeting & plans considering TCVMP',
 'Bajeti na mipango ya mwaka ikizingatia TCVMP',
 'In financial-year budgeting, planning and development plans: indicator for considering Tanzania Climate Vulnerability Map System (TCVMP) — not generic climate indicators.',
 'national',
 'NAT_FY_TCVMP_CONSIDERED,REG_FY_TCVMP_CONSIDERED,LGA_FY_TCVMP_CONSIDERED,MDA_FY_TCVMP_CONSIDERED,PARTNER_FY_TCVMP_CONSIDERED',
 90),
('AIM_QUARTERLY_RR', 'Periodic reporting',
 'Quarterly response and recovery reporting',
 'Ripoti za robo mwaka za kukabili na kurejesha hali',
 'Quarterly reporting of disaster-related response and recovery information to sectors; regions also report resources used in response from the regional budget.',
 'region',
 'REG_QTR_RESPONSE_RECOVERY_REPORT,REG_RESPONSE_BUDGET_USED,MDA_QTR_RESPONSE_RECOVERY_REPORT,MDA_QTR_RESPONSE_RECOVERY_RECORDS,LGA_QTR_RESPONSE_RECOVERY_REPORT',
 100)
on conflict (aim_code) do update
set aim_group = excluded.aim_group,
    title_en = excluded.title_en,
    title_sw = excluded.title_sw,
    description_en = excluded.description_en,
    me_level = excluded.me_level,
    indicator_codes = excluded.indicator_codes,
    sort_order = excluded.sort_order,
    active = true,
    updated_at = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Gap-fill indicators (exact original aims)
-- ─────────────────────────────────────────────────────────────────────────────
with seed(code, name, description, domain, disaster_cycle, level, value_type, unit, frequency,
          owner_type, sector, source_module, target_value, direction, sort_order,
          applicable_sectors, applicable_classes, policy_role_code, role_summary) as (
  values
    -- District/LGA quarterly (was only region + sector)
    ('LGA_QTR_RESPONSE_RECOVERY_REPORT',
     'District/LGA quarterly response and recovery report submitted',
     'Whether the district/LGA submitted the quarterly report of disaster-related response and recovery information for the reporting period.',
     'Quarterly Disaster Reporting', 'response', 'council', 'boolean', null, 'quarterly', 'lga',
     'Regional/LGA Governance', 'Original M&E aims — quarterly RR reporting', 1, 'higher', 460,
     'Regional/LGA Governance', 'Local Government Authority', null,
     'District/LGA quarterly disaster response and recovery reporting.'),

    -- Incidents (expand event capture)
    ('INCIDENT_RESOURCE_DEPLOYED',
     'Incident resources deployed',
     'Quantity or count of resources deployed for the incident (from system allocations/dispatches).',
     'Incidents', 'response', 'incident', 'number', 'units', 'event', 'pmo-dmd',
     'Response', 'Original M&E aims — incident indicators', null, 'higher', 910,
     null, null, null,
     'Incident-level resource deployment captured in the system.'),
    ('INCIDENT_COORDINATION_ACTIVE',
     'Incident multi-agency coordination active',
     'Whether multi-agency coordination structures are active for the incident (command/EOC linkage).',
     'Incidents', 'response', 'incident', 'boolean', null, 'event', 'pmo-dmd',
     'Response', 'Original M&E aims — incident indicators', 1, 'higher', 920,
     null, null, null,
     'Incident coordination status for national/area command.'),

    -- Early warnings (expand)
    ('EW_PEOPLE_REACHED',
     'People reached by early-warning messages',
     'Estimated number of people reached by disseminated early-warning messages for the warning event.',
     'Early Warnings', 'preparedness', 'warning', 'count', 'people', 'event', 'pmo-dmd',
     'Early Warning', 'Original M&E aims — early-warning indicators', null, 'higher', 930,
     null, null, null,
     'Early-warning population reach.'),
    ('EW_LEAD_TIME_HOURS',
     'Early-warning lead time (hours)',
     'Hours between warning issuance and hazard onset / first impact (where known).',
     'Early Warnings', 'preparedness', 'warning', 'number', 'hours', 'event', 'pmo-dmd',
     'Early Warning', 'Original M&E aims — early-warning indicators', null, 'higher', 940,
     null, null, null,
     'Lead time supports anticipatory action effectiveness.'),

    -- INGO (international NGOs) — distinct from national NGO class where needed
    ('INGO_HUMANITARIAN_SUPPORT',
     'INGO humanitarian assistance delivered',
     'Humanitarian assistance (beneficiaries or value) delivered by an international NGO under national coordination.',
     'Partners - INGO', 'response', 'stakeholder', 'number', 'TZS/beneficiaries', 'quarterly', 'stakeholder',
     'Humanitarian/DRR', 'Original M&E aims — INGOs', null, 'higher', 1545,
     'Humanitarian/DRR', 'NGO,International NGO', 'POLICY_NGO',
     'International NGOs report humanitarian support aligned to national priorities.'),
    ('INGO_CAPACITY_BUILDING',
     'INGO capacity-building support delivered',
     'Capacity-building activities delivered by international NGOs for government or communities.',
     'Partners - INGO', 'preparedness', 'stakeholder', 'count', 'activities', 'quarterly', 'stakeholder',
     'Humanitarian/DRR', 'Original M&E aims — INGOs', null, 'higher', 1546,
     'Humanitarian/DRR', 'NGO,International NGO', 'POLICY_NGO',
     'INGO contribution to national and local readiness.'),

    -- District administrative level (optional entry; same intent as LGA where district is used)
    ('DIST_BUDGET_ALLOCATED',
     'District disaster management budget allocated',
     'Disaster-management budget allocated at district administrative level for the financial year.',
     'Districts', null, 'district', 'currency', 'TZS', 'annual', 'district',
     'Regional/LGA Governance', 'Original M&E aims — District/LGA', null, 'higher', 400,
     null, null, null,
     'District budget allocation (where district is the reporting unit).'),
    ('DIST_PREPAREDNESS_PLAN',
     'District emergency response and preparedness plan in place',
     'Whether a district-level emergency response and preparedness plan is in place and current.',
     'Districts', 'preparedness', 'district', 'boolean', null, 'annual', 'district',
     'Regional/LGA Governance', 'Original M&E aims — District/LGA', 1, 'higher', 410,
     null, null, null,
     'District emergency response and preparedness plan.'),
    ('DIST_PREVENTION_ACTIVITIES',
     'District prevention and mitigation activities implemented',
     'Count of prevention/mitigation activities implemented at district level in the period.',
     'Districts', 'prevention_mitigation', 'district', 'count', 'activities', 'quarterly', 'district',
     'Regional/LGA Governance', 'Original M&E aims — DM cycle', null, 'higher', 420,
     null, null, null, 'District DM cycle — prevention/mitigation.'),
    ('DIST_PREPAREDNESS_ACTIVITIES',
     'District preparedness activities implemented',
     'Count of preparedness activities implemented at district level in the period.',
     'Districts', 'preparedness', 'district', 'count', 'activities', 'quarterly', 'district',
     'Regional/LGA Governance', 'Original M&E aims — DM cycle', null, 'higher', 430,
     null, null, null, 'District DM cycle — preparedness.'),
    ('DIST_RESPONSE_ACTIVITIES',
     'District response activities implemented',
     'Count of response activities implemented at district level in the period.',
     'Districts', 'response', 'district', 'count', 'activities', 'quarterly', 'district',
     'Regional/LGA Governance', 'Original M&E aims — DM cycle', null, 'higher', 440,
     null, null, null, 'District DM cycle — response.'),
    ('DIST_RECOVERY_ACTIVITIES',
     'District recovery activities implemented',
     'Count of recovery activities implemented at district level in the period.',
     'Districts', 'recovery', 'district', 'count', 'activities', 'quarterly', 'district',
     'Regional/LGA Governance', 'Original M&E aims — DM cycle', null, 'higher', 450,
     null, null, null, 'District DM cycle — recovery.'),
    ('DIST_FY_TCVMP_CONSIDERED',
     'District FY plan considering Tanzania Climate Vulnerability Map System (TCVMP)',
     'Whether the district financial-year budget, planning and development plan is considering Tanzania Climate Vulnerability Map System (TCVMP) — not generic climate indicators.',
     'Climate Vulnerability & FY Planning', 'prevention_mitigation', 'district', 'boolean', null, 'annual', 'district',
     'Regional/LGA Governance', 'Tanzania Climate Vulnerability Map System (TCVMP)', 1, 'higher', 455,
     null, null, null,
     'FY planning indicator: considering Tanzania Climate Vulnerability Map System (TCVMP).')
)
insert into public.me_indicator_catalog(code, name, description, domain, disaster_cycle, level, value_type, unit,
                                        frequency, owner_type, sector, source_module, target_value, direction,
                                        sort_order, applicable_sectors, applicable_institution_classes,
                                        policy_role_code, policy_role_source, role_summary, active, created_at, updated_at)
select code, name, description, domain, disaster_cycle, level, value_type, unit, frequency, owner_type, sector,
       source_module, target_value, direction, sort_order, applicable_sectors, applicable_classes,
       policy_role_code, 'Original M&E module aims + National Disaster Management Policy 2004 (2025 Edition)',
       role_summary, true, now(), now()
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
    sector = excluded.sector,
    source_module = excluded.source_module,
    target_value = excluded.target_value,
    direction = excluded.direction,
    sort_order = excluded.sort_order,
    applicable_sectors = excluded.applicable_sectors,
    applicable_institution_classes = excluded.applicable_institution_classes,
    policy_role_code = excluded.policy_role_code,
    policy_role_source = excluded.policy_role_source,
    role_summary = excluded.role_summary,
    active = true,
    updated_at = now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Exact TCVMP wording (Tanzania Climate Vulnerability Map System) — not "climate indicators"
-- ─────────────────────────────────────────────────────────────────────────────
update public.me_indicator_catalog
   set name = case code
         when 'NAT_FY_TCVMP_CONSIDERED' then 'National FY plan considering Tanzania Climate Vulnerability Map System (TCVMP)'
         when 'REG_FY_TCVMP_CONSIDERED' then 'Regional FY plan considering Tanzania Climate Vulnerability Map System (TCVMP)'
         when 'LGA_FY_TCVMP_CONSIDERED' then 'District/LGA FY plan considering Tanzania Climate Vulnerability Map System (TCVMP)'
         when 'MDA_FY_TCVMP_CONSIDERED' then 'Sector FY plan considering Tanzania Climate Vulnerability Map System (TCVMP)'
         when 'PARTNER_FY_TCVMP_CONSIDERED' then 'Partner FY plan considering Tanzania Climate Vulnerability Map System (TCVMP)'
         else name
       end,
       description = case code
         when 'NAT_FY_TCVMP_CONSIDERED' then
           'Whether national financial-year budgeting, planning and development plans are considering Tanzania Climate Vulnerability Map System (TCVMP). This is not a generic climate-indicator set — it records consideration of TCVMP.'
         when 'REG_FY_TCVMP_CONSIDERED' then
           'Whether the regional financial-year budget, planning and development plan is considering Tanzania Climate Vulnerability Map System (TCVMP).'
         when 'LGA_FY_TCVMP_CONSIDERED' then
           'Whether the district/LGA financial-year budget, planning and development plan is considering Tanzania Climate Vulnerability Map System (TCVMP).'
         when 'MDA_FY_TCVMP_CONSIDERED' then
           'Whether the ministry, department, agency or government institution financial-year budget and development plan is considering Tanzania Climate Vulnerability Map System (TCVMP).'
         when 'PARTNER_FY_TCVMP_CONSIDERED' then
           'Whether a partner programme or development plan is considering Tanzania Climate Vulnerability Map System (TCVMP) when selecting disaster-risk priorities.'
         else description
       end,
       domain = 'FY Planning — Tanzania Climate Vulnerability Map System (TCVMP)',
       source_module = 'Tanzania Climate Vulnerability Map System (TCVMP)',
       updated_at = now()
 where code in (
   'NAT_FY_TCVMP_CONSIDERED','REG_FY_TCVMP_CONSIDERED','LGA_FY_TCVMP_CONSIDERED',
   'MDA_FY_TCVMP_CONSIDERED','PARTNER_FY_TCVMP_CONSIDERED','DIST_FY_TCVMP_CONSIDERED'
 );

-- Align region/LGA names with original wording where helpful
update public.me_indicator_catalog
   set name = 'Regional Emergency Operations and Communication Centre operational',
       description = 'Whether the Regional Emergency Operations and Communication Centre (EOCC) is operational for the reporting period.',
       updated_at = now()
 where code = 'REG_EOC_OPERATIONAL';

update public.me_indicator_catalog
   set name = 'Regional emergency response team functional',
       description = 'Functionality of the Regional Emergency Response Team for the reporting period.',
       updated_at = now()
 where code = 'REG_RESPONSE_TEAM_FUNCTIONAL';

update public.me_indicator_catalog
   set name = 'Emergency response and preparedness plan in place',
       description = 'Whether an Emergency Response and Preparedness Plan is in place for the district/LGA.',
       updated_at = now()
 where code = 'LGA_PREPAREDNESS_PLAN';

update public.me_indicator_catalog
   set name = 'Resources used in response from regional budget',
       description = 'Value of resources used in disaster response drawn from the regional budget in the reporting period (quarterly).',
       domain = 'Regional Budget Response Resources',
       frequency = 'quarterly',
       updated_at = now()
 where code = 'REG_RESPONSE_BUDGET_USED';

update public.me_indicator_catalog
   set name = 'PMO-DMD strategic-plan (SP 2026–2031) milestone progress',
       description = 'Progress against PMO-DMD Strategic Plan 2026–2031 milestones for the reporting period.',
       updated_at = now()
 where code = 'PMO_SP_2026_2031_MILESTONE';

-- Expand NGO indicator classes to include International NGO label where used
update public.me_indicator_catalog
   set applicable_institution_classes = case
         when applicable_institution_classes is null or applicable_institution_classes = '' then 'NGO,International NGO'
         when applicable_institution_classes ilike '%International NGO%' then applicable_institution_classes
         when applicable_institution_classes ilike '%NGO%' then applicable_institution_classes || ',International NGO'
         else applicable_institution_classes
       end,
       updated_at = now()
 where level = 'stakeholder'
   and code like 'NGO_%';

-- Tag INGOs in stakeholders that are International type under NGO class (no new fake orgs)
update public.stakeholders
   set institution_subclass = coalesce(nullif(institution_subclass,''), 'International NGO'),
       sector_tags = case
         when coalesce(sector_tags,'') = '' then 'Humanitarian/DRR'
         when sector_tags ilike '%Humanitarian%' then sector_tags
         else sector_tags || ',Humanitarian/DRR'
       end,
       updated_at = now()
 where coalesce(is_active,true)
   and institution_class = 'NGO'
   and type = 'International'
   and (institution_subclass is null or institution_subclass = '' or institution_subclass ilike '%NGO%');
