-- M&E indicators added from the planning/quarterly-reporting requirement:
--   • financial-year budgeting, planning and development plans consider the Tanzania Climate Vulnerability Map system;
--   • quarterly sector reporting captures disaster response/recovery information;
--   • regional quarterly reporting captures resources used in response from the regional budget.

with seed(code, name, description, domain, disaster_cycle, level, value_type, unit, frequency,
          owner_type, stakeholder_type, sector, source_module, target_value, direction, sort_order) as (
  values
    ('NAT_FY_CVM_CONSIDERED', 'National FY plan considered Tanzania Climate Vulnerability Map',
     'Whether national financial-year budgeting, planning and development plans used the Tanzania Climate Vulnerability Map system as evidence for prioritisation.',
     'Climate Vulnerability & FY Planning', 'prevention_mitigation', 'national', 'boolean', null, 'annual',
     'pmo-dmd', null, 'National planning', 'Tanzania Climate Vulnerability Map System', 1, 'higher', 800),

    ('REG_FY_CVM_CONSIDERED', 'Regional FY plan considered Tanzania Climate Vulnerability Map',
     'Whether the regional financial-year budget, planning and development plan used the Tanzania Climate Vulnerability Map system.',
     'Climate Vulnerability & FY Planning', 'prevention_mitigation', 'region', 'boolean', null, 'annual',
     'region', null, 'Regional planning', 'Tanzania Climate Vulnerability Map System', 1, 'higher', 810),
    ('LGA_FY_CVM_CONSIDERED', 'District/LGA FY plan considered Tanzania Climate Vulnerability Map',
     'Whether the district/LGA financial-year budget, planning and development plan used the Tanzania Climate Vulnerability Map system.',
     'Climate Vulnerability & FY Planning', 'prevention_mitigation', 'council', 'boolean', null, 'annual',
     'district', null, 'LGA planning', 'Tanzania Climate Vulnerability Map System', 1, 'higher', 820),
    ('MDA_FY_CVM_CONSIDERED', 'Sector FY plan considered Tanzania Climate Vulnerability Map',
     'Whether the ministry, department, agency or government institution used the Tanzania Climate Vulnerability Map system in its financial-year budget and development plan.',
     'Climate Vulnerability & FY Planning', 'prevention_mitigation', 'agency', 'boolean', null, 'annual',
     'agency', null, 'Sector planning', 'Tanzania Climate Vulnerability Map System', 1, 'higher', 830),
    ('PARTNER_FY_CVM_CONSIDERED', 'Partner FY plan considered Tanzania Climate Vulnerability Map',
     'Whether a partner programme, investment or development plan used the Tanzania Climate Vulnerability Map system when selecting disaster-risk priorities.',
     'Climate Vulnerability & FY Planning', 'prevention_mitigation', 'stakeholder', 'boolean', null, 'annual',
     'stakeholder', null, 'Partner planning', 'Tanzania Climate Vulnerability Map System', 1, 'higher', 840),

    ('MDA_QTR_RESPONSE_RECOVERY_REPORT', 'Sector quarterly response/recovery report submitted',
     'Whether the sector submitted quarterly disaster-related response and recovery information for its mandate area.',
     'Quarterly Disaster Reporting', 'response', 'agency', 'boolean', null, 'quarterly',
     'agency', null, 'Sector response and recovery', 'M&E Manual Entry', 1, 'higher', 900),
    ('MDA_QTR_RESPONSE_RECOVERY_RECORDS', 'Sector quarterly response/recovery records reported',
     'Number of disaster-related response and recovery records reported by the sector during the quarter.',
     'Quarterly Disaster Reporting', 'recovery', 'agency', 'count', 'records', 'quarterly',
     'agency', null, 'Sector response and recovery', 'M&E Manual Entry', null, 'higher', 910),
    ('REG_QTR_RESPONSE_RECOVERY_REPORT', 'Regional quarterly response/recovery report submitted',
     'Whether the region submitted quarterly disaster-related response and recovery information.',
     'Quarterly Disaster Reporting', 'response', 'region', 'boolean', null, 'quarterly',
     'region', null, 'Regional response and recovery', 'M&E Manual Entry', 1, 'higher', 920),
    ('REG_RESPONSE_BUDGET_USED', 'Resources used in response from regional budget',
     'Amount of regional budget resources used for disaster response during the reporting quarter.',
     'Regional Budget Response Resources', 'response', 'region', 'currency', 'TZS', 'quarterly',
     'region', null, 'Regional budget execution', 'Budget & Finance', null, 'higher', 930)
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
    active = true,
    updated_at = now();
