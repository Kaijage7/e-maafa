-- Official wording correction for the climate-planning M&E indicators:
-- "considering Climate Vulnerability Map System (TCVMP)".
-- Applied as a follow-up migration so databases that already ran V168 are corrected without a Flyway checksum change.

with mapping(old_code, new_code, name, description, sort_order) as (
  values
    ('NAT_FY_CVM_CONSIDERED', 'NAT_FY_TCVMP_CONSIDERED',
     'National FY plan considering Climate Vulnerability Map System (TCVMP)',
     'Whether national financial-year budgeting, planning and development plans are considering Climate Vulnerability Map System (TCVMP) as evidence for prioritisation.',
     800),
    ('REG_FY_CVM_CONSIDERED', 'REG_FY_TCVMP_CONSIDERED',
     'Regional FY plan considering Climate Vulnerability Map System (TCVMP)',
     'Whether the regional financial-year budget, planning and development plan is considering Climate Vulnerability Map System (TCVMP).',
     810),
    ('LGA_FY_CVM_CONSIDERED', 'LGA_FY_TCVMP_CONSIDERED',
     'District/LGA FY plan considering Climate Vulnerability Map System (TCVMP)',
     'Whether the district/LGA financial-year budget, planning and development plan is considering Climate Vulnerability Map System (TCVMP).',
     820),
    ('MDA_FY_CVM_CONSIDERED', 'MDA_FY_TCVMP_CONSIDERED',
     'Sector FY plan considering Climate Vulnerability Map System (TCVMP)',
     'Whether the ministry, department, agency or government institution financial-year budget and development plan is considering Climate Vulnerability Map System (TCVMP).',
     830),
    ('PARTNER_FY_CVM_CONSIDERED', 'PARTNER_FY_TCVMP_CONSIDERED',
     'Partner FY plan considering Climate Vulnerability Map System (TCVMP)',
     'Whether a partner programme, investment or development plan is considering Climate Vulnerability Map System (TCVMP) when selecting disaster-risk priorities.',
     840)
)
update public.me_indicator_catalog i
set code = m.new_code,
    name = m.name,
    description = m.description,
    source_module = 'Climate Vulnerability Map System (TCVMP)',
    domain = 'Climate Vulnerability & FY Planning',
    sort_order = m.sort_order,
    updated_at = now()
from mapping m
where i.code = m.old_code
  and not exists (
      select 1 from public.me_indicator_catalog existing
      where existing.code = m.new_code and existing.id <> i.id
  );

with mapping(new_code, name, description, sort_order) as (
  values
    ('NAT_FY_TCVMP_CONSIDERED',
     'National FY plan considering Climate Vulnerability Map System (TCVMP)',
     'Whether national financial-year budgeting, planning and development plans are considering Climate Vulnerability Map System (TCVMP) as evidence for prioritisation.',
     800),
    ('REG_FY_TCVMP_CONSIDERED',
     'Regional FY plan considering Climate Vulnerability Map System (TCVMP)',
     'Whether the regional financial-year budget, planning and development plan is considering Climate Vulnerability Map System (TCVMP).',
     810),
    ('LGA_FY_TCVMP_CONSIDERED',
     'District/LGA FY plan considering Climate Vulnerability Map System (TCVMP)',
     'Whether the district/LGA financial-year budget, planning and development plan is considering Climate Vulnerability Map System (TCVMP).',
     820),
    ('MDA_FY_TCVMP_CONSIDERED',
     'Sector FY plan considering Climate Vulnerability Map System (TCVMP)',
     'Whether the ministry, department, agency or government institution financial-year budget and development plan is considering Climate Vulnerability Map System (TCVMP).',
     830),
    ('PARTNER_FY_TCVMP_CONSIDERED',
     'Partner FY plan considering Climate Vulnerability Map System (TCVMP)',
     'Whether a partner programme, investment or development plan is considering Climate Vulnerability Map System (TCVMP) when selecting disaster-risk priorities.',
     840)
)
update public.me_indicator_catalog i
set name = m.name,
    description = m.description,
    source_module = 'Climate Vulnerability Map System (TCVMP)',
    domain = 'Climate Vulnerability & FY Planning',
    sort_order = m.sort_order,
    active = true,
    updated_at = now()
from mapping m
where i.code = m.new_code;
