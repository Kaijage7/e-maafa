-- V175: Deep Tanzania institution registry for System Settings + M&E reporting paths
-- Honest sources: ORODHA YA WASHIRIKI, FINAL_DRR Stakeholders DB, Executive Agencies Act entities,
-- known URT water utilities/boards/hospitals/research institutes, Nov 2025 cabinet structure,
-- bilateral/multilateral partners with documented Tanzania presence.
-- De-duplicated against live agencies/stakeholders. No invented organisations.
--
-- Reporting paths:
--   * MDAs (agencies table) -> M&E level=agency (MDA focals)
--   * Partners (stakeholders table) -> M&E level=stakeholder (UN/NGO/FBO/Private/DP)
-- Governed in System Settings > Institution Registry.

-- Ensure Development Partner class label exists
insert into public.me_institution_class_labels(institution_class, label_en, label_sw, registry, sort_order)
values ('Development Partner', 'Development partners', 'Washirika wa maendeleo', 'stakeholder', 75)
on conflict (institution_class) do update
set label_en = excluded.label_en, label_sw = excluded.label_sw, active = true;


insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Petroleum Upstream Regulatory Authority', nullif('PURA',''), 'Government', 'Upstream petroleum regulation and sector risk oversight.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Energy/Minerals',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('1','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Upstream petroleum regulation and sector risk oversight.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Petroleum Upstream Regulatory Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PURA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PURA')
          and length('PURA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Weights and Measures Agency', nullif('WMA',''), 'Government', 'Metrology services for trade and emergency logistics.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Trade/Standards',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('2','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Metrology services for trade and emergency logistics.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Weights and Measures Agency', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('WMA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('WMA')
          and length('WMA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Government Flight Agency', nullif('TGFA',''), 'Government', 'Government flight services for emergency operations.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Infrastructure/Transport',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('3','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Government flight services for emergency operations.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Government Flight Agency', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TGFA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TGFA')
          and length('TGFA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Dar Rapid Transit Agency', nullif('DART',''), 'Government', 'Urban mass transit continuity in Dar es Salaam.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Infrastructure/Transport',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('4','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Urban mass transit continuity in Dar es Salaam.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Dar Rapid Transit Agency', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('DART','') is not null
          and upper(coalesce(x.acronym,'')) = upper('DART')
          and length('DART') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Construction Council', nullif('NCC',''), 'Government', 'Construction industry development and standards.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Infrastructure/Housing',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('5','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Construction industry development and standards.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Construction Council', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NCC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NCC')
          and length('NCC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Architects and Quantity Surveyors Registration Board', nullif('AQRB',''), 'Government', 'Professional registration for reconstruction quality.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Infrastructure/Housing',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('6','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Professional registration for reconstruction quality.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Architects and Quantity Surveyors Registration Board', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('AQRB','') is not null
          and upper(coalesce(x.acronym,'')) = upper('AQRB')
          and length('AQRB') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Muhimbili National Hospital', nullif('MNH',''), 'Government', 'National referral hospital surge capacity.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('7','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'National referral hospital surge capacity.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Muhimbili National Hospital', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MNH','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MNH')
          and length('MNH') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Benjamin Mkapa Hospital', nullif('BMH',''), 'Government', 'National hospital capacity for mass-casualty support.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('8','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'National hospital capacity for mass-casualty support.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Benjamin Mkapa Hospital', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('BMH','') is not null
          and upper(coalesce(x.acronym,'')) = upper('BMH')
          and length('BMH') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Ocean Road Cancer Institute', nullif('ORCI',''), 'Government', 'Specialist health capacity.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('9','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Specialist health capacity.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Ocean Road Cancer Institute', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('ORCI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('ORCI')
          and length('ORCI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Jakaya Kikwete Cardiac Institute', nullif('JKCI',''), 'Government', 'Specialist cardiac emergency capacity.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('10','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Specialist cardiac emergency capacity.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Jakaya Kikwete Cardiac Institute', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('JKCI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('JKCI')
          and length('JKCI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Kibong''oto Infectious Diseases Hospital', nullif('KIDH',''), 'Government', 'Infectious disease hospital capacity.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('11','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Infectious disease hospital capacity.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Kibong''oto Infectious Diseases Hospital', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KIDH','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KIDH')
          and length('KIDH') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Institute of Education', nullif('TIE',''), 'Government', 'Curriculum development including DRR content.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('12','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Curriculum development including DRR content.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Institute of Education', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TIE','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TIE')
          and length('TIE') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Institute of Adult Education', nullif('IAE',''), 'Government', 'Adult education and community learning for DRR.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('13','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Adult education and community learning for DRR.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Institute of Adult Education', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('IAE','') is not null
          and upper(coalesce(x.acronym,'')) = upper('IAE')
          and length('IAE') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Agency for the Development of Educational Management', nullif('ADEM',''), 'Government', 'Education leadership training including emergency management.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('14','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Education leadership training including emergency management.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Agency for the Development of Educational Management', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('ADEM','') is not null
          and upper(coalesce(x.acronym,'')) = upper('ADEM')
          and length('ADEM') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National College of Tourism', nullif('NCT',''), 'Government', 'Tourism sector training and safety.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('15','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Tourism sector training and safety.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National College of Tourism', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NCT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NCT')
          and length('NCT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Institute of Rural Development Planning', nullif('IRDP',''), 'Government', 'Rural planning and local resilience.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('16','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Rural planning and local resilience.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Institute of Rural Development Planning', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('IRDP','') is not null
          and upper(coalesce(x.acronym,'')) = upper('IRDP')
          and length('IRDP') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Local Government Training Institute', nullif('LGTI',''), 'Government', 'LGA capacity building for disaster committees.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('17','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'LGA capacity building for disaster committees.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Local Government Training Institute', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('LGTI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('LGTI')
          and length('LGTI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mzumbe University', nullif('MU',''), 'Government', 'Public administration and disaster governance training.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('18','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Public administration and disaster governance training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mzumbe University', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MU','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MU')
          and length('MU') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Nelson Mandela African Institution of Science and Technology', nullif('NM-AIST',''), 'Government', 'Science and technology research for resilience.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('19','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Science and technology research for resilience.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Nelson Mandela African Institution of Science and Technology', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NM-AIST','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NM-AIST')
          and length('NM-AIST') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mbeya University of Science and Technology', nullif('MUST',''), 'Government', 'Science and technology education.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('20','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Science and technology education.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mbeya University of Science and Technology', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MUST','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MUST')
          and length('MUST') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Open University of Tanzania', nullif('OUT',''), 'Government', 'Distance learning for DRR capacity at scale.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('21','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Distance learning for DRR capacity at scale.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Open University of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('OUT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('OUT')
          and length('OUT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Moshi Co-operative University', nullif('MoCU',''), 'Government', 'Cooperative sector resilience training.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('22','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Cooperative sector resilience training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Moshi Co-operative University', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MoCU','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MoCU')
          and length('MoCU') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Marine Parks and Reserves Unit', nullif('MPRU',''), 'Government', 'Marine protected areas and coastal hazard interface.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Environment/Natural Resources',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('23','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Marine protected areas and coastal hazard interface.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Marine Parks and Reserves Unit', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MPRU','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MPRU')
          and length('MPRU') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Fisheries Research Institute', nullif('TAFIRI',''), 'Government', 'Fisheries research for food security and aquatic hazards.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Livestock/Fisheries',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('24','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Fisheries research for food security and aquatic hazards.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Fisheries Research Institute', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TAFIRI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TAFIRI')
          and length('TAFIRI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Fisheries Corporation', nullif('TAFICO',''), 'Government', 'Fisheries production continuity.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Livestock/Fisheries',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('25','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Fisheries production continuity.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Fisheries Corporation', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TAFICO','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TAFICO')
          and length('TAFICO') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Irrigation Commission', nullif('NIRC',''), 'Government', 'Irrigation infrastructure resilience and flood interface.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Agriculture/Water',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('26','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Irrigation infrastructure resilience and flood interface.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Irrigation Commission', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NIRC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NIRC')
          and length('NIRC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Agricultural Research Institute', nullif('TARI',''), 'Government', 'Agricultural research for climate and pest risks.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('27','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Agricultural research for climate and pest risks.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Agricultural Research Institute', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TARI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TARI')
          and length('TARI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Agricultural Seed Agency', nullif('ASA',''), 'Government', 'Seed security for recovery of food systems.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('28','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Seed security for recovery of food systems.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Agricultural Seed Agency', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('ASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('ASA')
          and length('ASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Official Seed Certification Institute', nullif('TOSCI',''), 'Government', 'Seed certification for recovery programmes.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('29','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Seed certification for recovery programmes.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Official Seed Certification Institute', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TOSCI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TOSCI')
          and length('TOSCI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Coffee Board', nullif('TCB',''), 'Government', 'Coffee sector resilience.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('30','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Coffee sector resilience.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Coffee Board', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TCB','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TCB')
          and length('TCB') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Cashewnut Board of Tanzania', nullif('CBT',''), 'Government', 'Cashew sector resilience.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('31','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Cashew sector resilience.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Cashewnut Board of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('CBT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('CBT')
          and length('CBT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Cereal and Other Produce Board of Tanzania', nullif('CPB',''), 'Government', 'Cereal marketing and food security interface.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('32','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Cereal marketing and food security interface.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Cereal and Other Produce Board of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('CPB','') is not null
          and upper(coalesce(x.acronym,'')) = upper('CPB')
          and length('CPB') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Ranching Company', nullif('NARCO',''), 'Government', 'Ranching sector continuity.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Livestock/Fisheries',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('33','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Ranching sector continuity.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Ranching Company', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NARCO','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NARCO')
          and length('NARCO') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Trade Development Authority', nullif('TANTRADE',''), 'Government', 'Trade facilitation for relief and recovery goods.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Trade/Industry',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('34','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Trade facilitation for relief and recovery goods.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Trade Development Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TANTRADE','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TANTRADE')
          and length('TANTRADE') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Fair Competition Commission', nullif('FCC',''), 'Government', 'Market competition oversight including emergency markets.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Trade/Industry',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('35','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Market competition oversight including emergency markets.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Fair Competition Commission', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('FCC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('FCC')
          and length('FCC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Employment Services Agency', nullif('TAESA',''), 'Government', 'Employment services post-disaster.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Labour',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('36','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Employment services post-disaster.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Employment Services Agency', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TAESA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TAESA')
          and length('TAESA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Prevention and Combating of Corruption Bureau', nullif('PCCB',''), 'Government', 'Integrity oversight of disaster resource use.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('37','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Integrity oversight of disaster resource use.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Prevention and Combating of Corruption Bureau', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PCCB','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PCCB')
          and length('PCCB') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Commission for Human Rights and Good Governance', nullif('CHRAGG',''), 'Government', 'Rights protection of disaster-affected persons.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('38','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Rights protection of disaster-affected persons.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Commission for Human Rights and Good Governance', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('CHRAGG','') is not null
          and upper(coalesce(x.acronym,'')) = upper('CHRAGG')
          and length('CHRAGG') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Law Reform Commission of Tanzania', nullif('LRCT',''), 'Government', 'Legal reform including disaster law.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('39','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Legal reform including disaster law.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Law Reform Commission of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('LRCT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('LRCT')
          and length('LRCT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Institute of Judicial Administration', nullif('IJA',''), 'Government', 'Judicial capacity building.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('40','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Judicial capacity building.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Institute of Judicial Administration', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('IJA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('IJA')
          and length('IJA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Prisons Service', nullif('TPS',''), 'Government', 'Prisons emergency continuity.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Security/Response',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('41','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Prisons emergency continuity.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Prisons Service', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TPS','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TPS')
          and length('TPS') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Immigration Services Department', nullif('ISD',''), 'Government', 'Border and migration management in crises.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Security/Response',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('42','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Border and migration management in crises.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Immigration Services Department', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('ISD','') is not null
          and upper(coalesce(x.acronym,'')) = upper('ISD')
          and length('ISD') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Intelligence and Security Service', nullif('TISS',''), 'Government', 'National security intelligence support to crisis management.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Security/Response',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('43','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'National security intelligence support to crisis management.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Intelligence and Security Service', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TISS','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TISS')
          and length('TISS') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Planning Commission', nullif('PC',''), 'Government', 'National planning integration of disaster risk.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('National Planning',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('44','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'National planning integration of disaster risk.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Planning Commission', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PC')
          and length('PC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Treasury Registrar', nullif('TR',''), 'Government', 'Oversight of public corporations including utility readiness.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Finance/Risk Financing',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('45','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Oversight of public corporations including utility readiness.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Treasury Registrar', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TR','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TR')
          and length('TR') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Government Procurement Services Agency', nullif('GPSA',''), 'Government', 'Central procurement of government and emergency supplies.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('46','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Central procurement of government and emergency supplies.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Government Procurement Services Agency', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('GPSA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('GPSA')
          and length('GPSA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Broadcasting Corporation', nullif('TBC',''), 'Government', 'Public broadcaster for early warning and awareness.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Communication/Media',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('47','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Public broadcaster for early warning and awareness.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Broadcasting Corporation', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TBC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TBC')
          and length('TBC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Standard Newspapers', nullif('TSN',''), 'Government', 'Government newspapers for public information.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Communication/Media',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('48','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Government newspapers for public information.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Standard Newspapers', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TSN','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TSN')
          and length('TSN') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Baraza la Kiswahili la Taifa', nullif('BAKITA',''), 'Government', 'National Kiswahili council for clear public messaging.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Culture/Language',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('49','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'National Kiswahili council for clear public messaging.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Baraza la Kiswahili la Taifa', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('BAKITA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('BAKITA')
          and length('BAKITA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Sports Council', nullif('NSC',''), 'Government', 'Sports facilities as potential emergency shelters.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Culture/Language',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('50','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Sports facilities as potential emergency shelters.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Sports Council', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NSC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NSC')
          and length('NSC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Museum of Tanzania', nullif('NMT',''), 'Government', 'Cultural heritage protection in disasters.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Culture/Language',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('51','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Cultural heritage protection in disasters.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Museum of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NMT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NMT')
          and length('NMT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Antiquities Division / Agency of Antiquities', nullif('AOA',''), 'Government', 'Heritage site protection from disasters.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Culture/Language',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('52','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Heritage site protection from disasters.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Antiquities Division / Agency of Antiquities', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('AOA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('AOA')
          and length('AOA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'TIB Development Bank', nullif('TIB',''), 'Government', 'Development financing for resilient infrastructure.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Finance/Risk Financing',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('53','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Development financing for resilient infrastructure.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('TIB Development Bank', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TIB','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TIB')
          and length('TIB') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Agricultural Development Bank', nullif('TADB',''), 'Government', 'Agricultural finance for climate and disaster recovery.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Finance/Risk Financing',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('54','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Agricultural finance for climate and disaster recovery.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Agricultural Development Bank', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TADB','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TADB')
          and length('TADB') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Microfinance Bank Plc Public Interest Mandate', nullif('NMB-public',''), 'Government', 'Major bank with extensive rural footprint for recovery payments (listed for coordination, not private M&E ownership).', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Finance/Risk Financing',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('55','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Major bank with extensive rural footprint for recovery payments (listed for coordination, not private M&E ownership).', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Microfinance Bank Plc Public Interest Mandate', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NMB-public','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NMB-public')
          and length('NMB-public') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Insurance Corporation of Tanzania', nullif('NIC',''), 'Government', 'Public insurance capacity for risk transfer.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Finance/Risk Financing',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('56','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Public insurance capacity for risk transfer.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Insurance Corporation of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NIC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NIC')
          and length('NIC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Export Credit Guarantee Company', nullif('TEC',''), 'Government', 'Trade finance guarantees supporting recovery.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Finance/Risk Financing',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('57','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Trade finance guarantees supporting recovery.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Export Credit Guarantee Company', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TEC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TEC')
          and length('TEC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Coffee Research Institute', nullif('TaCRI',''), 'Government', 'Coffee research for climate resilience.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('58','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Coffee research for climate resilience.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Coffee Research Institute', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TaCRI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TaCRI')
          and length('TaCRI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Industrial Research and Development Organization', nullif('TIRDO',''), 'Government', 'Industrial research for resilient production.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Trade/Industry',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('59','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Industrial research for resilient production.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Industrial Research and Development Organization', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TIRDO','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TIRDO')
          and length('TIRDO') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Centre for Agricultural Mechanization and Rural Technology', nullif('CAMARTEC',''), 'Government', 'Agricultural mechanization for recovery.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('60','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Agricultural mechanization for recovery.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Centre for Agricultural Mechanization and Rural Technology', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('CAMARTEC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('CAMARTEC')
          and length('CAMARTEC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Engineering and Manufacturing Design Organization', nullif('TEMDO',''), 'Government', 'Engineering design for public infrastructure.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Trade/Industry',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('61','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Engineering design for public infrastructure.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Engineering and Manufacturing Design Organization', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TEMDO','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TEMDO')
          and length('TEMDO') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Automotive Technology Centre', nullif('TATC',''), 'Government', 'Automotive technology support for logistics fleets.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Trade/Industry',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('62','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Automotive technology support for logistics fleets.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Automotive Technology Centre', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TATC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TATC')
          and length('TATC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Institute of Transport', nullif('NIT',''), 'Government', 'Transport training for emergency logistics.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Infrastructure/Transport',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('63','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Transport training for emergency logistics.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Institute of Transport', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NIT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NIT')
          and length('NIT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Bandari College Tanzania', nullif('BCT',''), 'Government', 'Port and maritime training.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Infrastructure/Transport',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('64','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Port and maritime training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Bandari College Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('BCT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('BCT')
          and length('BCT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Institute of Accountancy', nullif('TIA',''), 'Government', 'Public accounting skills for disaster fund accountability.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('65','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Public accounting skills for disaster fund accountability.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Institute of Accountancy', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TIA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TIA')
          and length('TIA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'College of Business Education', nullif('CBE',''), 'Government', 'Business education for SME recovery.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('66','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Business education for SME recovery.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('College of Business Education', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('CBE','') is not null
          and upper(coalesce(x.acronym,'')) = upper('CBE')
          and length('CBE') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Institute of Social Work', nullif('ISW',''), 'Government', 'Social work capacity for psychosocial support.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('67','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Social work capacity for psychosocial support.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Institute of Social Work', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('ISW','') is not null
          and upper(coalesce(x.acronym,'')) = upper('ISW')
          and length('ISW') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mwalimu Nyerere Memorial Academy', nullif('MNMA',''), 'Government', 'Leadership and civic education.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('68','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Leadership and civic education.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mwalimu Nyerere Memorial Academy', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MNMA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MNMA')
          and length('MNMA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Eastern Africa Statistical Training Centre', nullif('EASTC',''), 'Government', 'Statistics training for risk and impact data.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Planning/Statistics',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('69','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Statistics training for risk and impact data.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Eastern Africa Statistical Training Centre', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('EASTC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('EASTC')
          and length('EASTC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Centre for Foreign Relations', nullif('CFR',''), 'Government', 'Diplomatic training for international disaster cooperation.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('International Cooperation',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('70','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Diplomatic training for international disaster cooperation.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Centre for Foreign Relations', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('CFR','') is not null
          and upper(coalesce(x.acronym,'')) = upper('CFR')
          and length('CFR') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Government Store Department', nullif('GSD',''), 'Government', 'Government stores for emergency commodity pre-positioning.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('71','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Government stores for emergency commodity pre-positioning.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Government Store Department', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('GSD','') is not null
          and upper(coalesce(x.acronym,'')) = upper('GSD')
          and length('GSD') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Library Services Board', nullif('TLSB',''), 'Government', 'Public libraries as community information points.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('72','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Public libraries as community information points.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Library Services Board', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TLSB','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TLSB')
          and length('TLSB') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Copyright Society of Tanzania', nullif('COSOTA',''), 'Government', 'Copyright and cultural sector continuity.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Culture/Language',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('73','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Copyright and cultural sector continuity.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Copyright Society of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('COSOTA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('COSOTA')
          and length('COSOTA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Film Board', nullif('TFB',''), 'Government', 'Film sector public information capacity.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Culture/Language',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('74','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Film sector public information capacity.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Film Board', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TFB','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TFB')
          and length('TFB') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Surface and Marine Transport Accident Investigation', nullif('TAIC',''), 'Government', 'Transport accident investigation for safety learning.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Infrastructure/Transport',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('75','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Transport accident investigation for safety learning.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Surface and Marine Transport Accident Investigation', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TAIC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TAIC')
          and length('TAIC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Central Corridor Transit Transport Facilitation Agency', nullif('CCTTFA',''), 'Government', 'Regional corridor logistics for relief movement.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Infrastructure/Transport',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('76','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Regional corridor logistics for relief movement.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Central Corridor Transit Transport Facilitation Agency', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('CCTTFA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('CCTTFA')
          and length('CCTTFA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Revenue Authority Customs and Excise', nullif('TRA-CE',''), 'Government', 'Customs facilitation for humanitarian cargo.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Finance/Risk Financing',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('77','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Customs facilitation for humanitarian cargo.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Revenue Authority Customs and Excise', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TRA-CE','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TRA-CE')
          and length('TRA-CE') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Board of Accountants and Auditors', nullif('NBAA',''), 'Government', 'Professional accounting standards for public fund accountability.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('78','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Professional accounting standards for public fund accountability.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Board of Accountants and Auditors', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NBAA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NBAA')
          and length('NBAA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Board of Materials Management', nullif('NBMM',''), 'Government', 'Materials management standards for warehouses.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('79','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Materials management standards for warehouses.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Board of Materials Management', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NBMM','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NBMM')
          and length('NBMM') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Procurement and Supplies Professionals and Technicians Board', nullif('PSPTB',''), 'Government', 'Procurement professionalism for emergency supply chains.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('80','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Procurement professionalism for emergency supply chains.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Procurement and Supplies Professionals and Technicians Board', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PSPTB','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PSPTB')
          and length('PSPTB') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Government Communication Unit', nullif('GCU',''), 'Government', 'Government public communication in emergencies.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Communication/Media',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('81','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Government public communication in emergencies.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Government Communication Unit', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('GCU','') is not null
          and upper(coalesce(x.acronym,'')) = upper('GCU')
          and length('GCU') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Internet Data Centre', nullif('NIDC',''), 'Government', 'Critical digital infrastructure continuity.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Digital Government / ICT',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('82','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Critical digital infrastructure continuity.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Internet Data Centre', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NIDC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NIDC')
          and length('NIDC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Universal Communications Access Fund', nullif('UCAF',''), 'Government', 'Rural communications access supporting warning reach.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Communication/Media',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('83','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Rural communications access supporting warning reach.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Universal Communications Access Fund', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('UCAF','') is not null
          and upper(coalesce(x.acronym,'')) = upper('UCAF')
          and length('UCAF') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Commission for Lands', nullif('COL',''), 'Government', 'Land administration for safe settlements and recovery.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Land Use/Urban Planning',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('84','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Land administration for safe settlements and recovery.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Commission for Lands', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('COL','') is not null
          and upper(coalesce(x.acronym,'')) = upper('COL')
          and length('COL') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Surveys and Mapping Division / Agency', nullif('SMD',''), 'Government', 'Geospatial data for risk mapping.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Land Use/Urban Planning',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('85','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Geospatial data for risk mapping.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Surveys and Mapping Division / Agency', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SMD','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SMD')
          and length('SMD') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania National Business Council Secretariat', nullif('TNBC',''), 'Government', 'Public-private dialogue including disaster risk financing.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Private Sector Coordination',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('86','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Public-private dialogue including disaster risk financing.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania National Business Council Secretariat', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TNBC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TNBC')
          and length('TNBC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Government e-Payment Gateway Operations', nullif('GePG',''), 'Government', 'Government payment gateway for transparent disaster disbursements.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Digital Government / ICT',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('87','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Government payment gateway for transparent disaster disbursements.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Government e-Payment Gateway Operations', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('GePG','') is not null
          and upper(coalesce(x.acronym,'')) = upper('GePG')
          and length('GePG') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Prime Minister''s Office Policy and Coordination', nullif('PMO-PC',''), 'Government', 'Policy coordination supporting disaster management implementation.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Disaster Management Coordination',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('88','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Policy coordination supporting disaster management implementation.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Prime Minister''s Office Policy and Coordination', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PMO-PC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PMO-PC')
          and length('PMO-PC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'President''s Office Planning and Investment', nullif('PO-PI',''), 'Government', 'National planning and investment integrating disaster risk.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('National Planning',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('89','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'National planning and investment integrating disaster risk.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('President''s Office Planning and Investment', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PO-PI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PO-PI')
          and length('PO-PI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Vice President''s Office Union and Environment', nullif('VPO-UE',''), 'Government', 'Environment and climate integration with disaster management.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Environment/Natural Resources',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('90','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Environment and climate integration with disaster management.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Vice President''s Office Union and Environment', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('VPO-UE','') is not null
          and upper(coalesce(x.acronym,'')) = upper('VPO-UE')
          and length('VPO-UE') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Parliament of the United Republic of Tanzania Administration', nullif('BUNGE-ADM',''), 'Government', 'Legislative oversight of disaster policy and budgets.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('91','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Legislative oversight of disaster policy and budgets.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Parliament of the United Republic of Tanzania Administration', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('BUNGE-ADM','') is not null
          and upper(coalesce(x.acronym,'')) = upper('BUNGE-ADM')
          and length('BUNGE-ADM') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Judiciary of Tanzania Administration', nullif('JUD-ADM',''), 'Government', 'Judicial continuity and rights protection in emergencies.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('92','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Judicial continuity and rights protection in emergencies.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Judiciary of Tanzania Administration', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('JUD-ADM','') is not null
          and upper(coalesce(x.acronym,'')) = upper('JUD-ADM')
          and length('JUD-ADM') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Controller and Auditor General Office', nullif('CAG',''), 'Government', 'Supreme audit of public disaster expenditure.', true,
  'Government Institution', nullif('MDA / Executive Agency / Authority',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + ORODHA + FINAL_DRR + known Executive Agencies',
  nullif('GOV_INST',''), nullif('93','')::int,
  'URT MDAs: Treasury Registrar/CAG scope, Executive Agencies Act entities, ORODHA TAASISI, FINAL_DRR; de-duplicated against live registry', nullif('',''),
  'Supreme audit of public disaster expenditure.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Controller and Auditor General Office', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('CAG','') is not null
          and upper(coalesce(x.acronym,'')) = upper('CAG')
          and length('CAG') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'President''s Office - Youth Development', nullif('PO-YD',''), 'Government', 'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Youth/Social).', true,
  'Ministry', nullif('Ministry / Office',''),
  nullif('Youth/Social',''), true,
  'National MDA reference compilation', 'tanzaniainvest.com cabinet + ORODHA',
  nullif('WIZARA',''), nullif('94','')::int,
  'President Samia cabinet restructure Nov 2025 (27 ministries) + ORODHA YA WASHIRIKI', nullif('',''),
  'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Youth/Social).', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('President''s Office - Youth Development', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PO-YD','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PO-YD')
          and length('PO-YD') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Prime Minister''s Office - Policy, Parliament, Coordination and Persons with Disability', nullif('PMO-SBU',''), 'Government', 'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Disaster Management Coordination).', true,
  'Ministry', nullif('Ministry / Office',''),
  nullif('Disaster Management Coordination',''), true,
  'National MDA reference compilation', 'tanzaniainvest.com cabinet + ORODHA',
  nullif('WIZARA',''), nullif('95','')::int,
  'President Samia cabinet restructure Nov 2025 (27 ministries) + ORODHA YA WASHIRIKI', nullif('POLICY_PMO_DMD',''),
  'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Disaster Management Coordination).', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Prime Minister''s Office - Policy, Parliament, Coordination and Persons with Disability', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PMO-SBU','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PMO-SBU')
          and length('PMO-SBU') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Prime Minister''s Office - Labour, Employment and Relations', nullif('PMO-Labour',''), 'Government', 'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Labour).', true,
  'Ministry', nullif('Ministry / Office',''),
  nullif('Labour',''), true,
  'National MDA reference compilation', 'tanzaniainvest.com cabinet + ORODHA',
  nullif('WIZARA',''), nullif('96','')::int,
  'President Samia cabinet restructure Nov 2025 (27 ministries) + ORODHA YA WASHIRIKI', nullif('',''),
  'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Labour).', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Prime Minister''s Office - Labour, Employment and Relations', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PMO-Labour','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PMO-Labour')
          and length('PMO-Labour') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Ministry of Finance', nullif('MoF',''), 'Government', 'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Finance/Risk Financing).', true,
  'Ministry', nullif('Ministry / Office',''),
  nullif('Finance/Risk Financing',''), true,
  'National MDA reference compilation', 'tanzaniainvest.com cabinet + ORODHA',
  nullif('WIZARA',''), nullif('97','')::int,
  'President Samia cabinet restructure Nov 2025 (27 ministries) + ORODHA YA WASHIRIKI', nullif('POLICY_FINANCE',''),
  'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Finance/Risk Financing).', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Ministry of Finance', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MoF','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MoF')
          and length('MoF') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Ministry of Energy', nullif('MoE',''), 'Government', 'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Energy/Water).', true,
  'Ministry', nullif('Ministry / Office',''),
  nullif('Energy/Water',''), true,
  'National MDA reference compilation', 'tanzaniainvest.com cabinet + ORODHA',
  nullif('WIZARA',''), nullif('98','')::int,
  'President Samia cabinet restructure Nov 2025 (27 ministries) + ORODHA YA WASHIRIKI', nullif('',''),
  'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Energy/Water).', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Ministry of Energy', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MoE','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MoE')
          and length('MoE') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Ministry of Investment, Industry and Trade', nullif('MIIT',''), 'Government', 'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Trade/Industry).', true,
  'Ministry', nullif('Ministry / Office',''),
  nullif('Trade/Industry',''), true,
  'National MDA reference compilation', 'tanzaniainvest.com cabinet + ORODHA',
  nullif('WIZARA',''), nullif('99','')::int,
  'President Samia cabinet restructure Nov 2025 (27 ministries) + ORODHA YA WASHIRIKI', nullif('',''),
  'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Trade/Industry).', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Ministry of Investment, Industry and Trade', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MIIT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MIIT')
          and length('MIIT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Ministry of Works', nullif('MoWorks',''), 'Government', 'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Infrastructure/Transport).', true,
  'Ministry', nullif('Ministry / Office',''),
  nullif('Infrastructure/Transport',''), true,
  'National MDA reference compilation', 'tanzaniainvest.com cabinet + ORODHA',
  nullif('WIZARA',''), nullif('100','')::int,
  'President Samia cabinet restructure Nov 2025 (27 ministries) + ORODHA YA WASHIRIKI', nullif('POLICY_WORKS_TRANSPORT',''),
  'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Infrastructure/Transport).', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Ministry of Works', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MoWorks','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MoWorks')
          and length('MoWorks') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Ministry of Transport', nullif('MoT',''), 'Government', 'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Infrastructure/Transport).', true,
  'Ministry', nullif('Ministry / Office',''),
  nullif('Infrastructure/Transport',''), true,
  'National MDA reference compilation', 'tanzaniainvest.com cabinet + ORODHA',
  nullif('WIZARA',''), nullif('101','')::int,
  'President Samia cabinet restructure Nov 2025 (27 ministries) + ORODHA YA WASHIRIKI', nullif('POLICY_WORKS_TRANSPORT',''),
  'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Infrastructure/Transport).', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Ministry of Transport', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MoT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MoT')
          and length('MoT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Ministry of Information, Communication and Information Technology', nullif('MICT',''), 'Government', 'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Communication/Media).', true,
  'Ministry', nullif('Ministry / Office',''),
  nullif('Communication/Media',''), true,
  'National MDA reference compilation', 'tanzaniainvest.com cabinet + ORODHA',
  nullif('WIZARA',''), nullif('102','')::int,
  'President Samia cabinet restructure Nov 2025 (27 ministries) + ORODHA YA WASHIRIKI', nullif('POLICY_COMMUNICATIONS',''),
  'Cabinet ministry/office with disaster-management mandate under MKAKATI Sura 6 (Communication/Media).', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Ministry of Information, Communication and Information Technology', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MICT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MICT')
          and length('MICT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'St. Augustine University of Tanzania', nullif('SAUT',''), 'Government', 'Higher education and research institution contributing to DRR knowledge and training.', true,
  'Academic and Research Institution', nullif('University / College',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'TCU-listed institutions + ORODHA VYUO',
  nullif('VYUO',''), nullif('103','')::int,
  'Public and chartered universities in Tanzania (research capacity for DM)', nullif('POLICY_ACADEMIC',''),
  'Higher education and research institution contributing to DRR knowledge and training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('St. Augustine University of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SAUT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SAUT')
          and length('SAUT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tumaini University Dar es Salaam College', nullif('TUDARCo',''), 'Government', 'Higher education and research institution contributing to DRR knowledge and training.', true,
  'Academic and Research Institution', nullif('University / College',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'TCU-listed institutions + ORODHA VYUO',
  nullif('VYUO',''), nullif('104','')::int,
  'Public and chartered universities in Tanzania (research capacity for DM)', nullif('POLICY_ACADEMIC',''),
  'Higher education and research institution contributing to DRR knowledge and training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tumaini University Dar es Salaam College', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TUDARCo','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TUDARCo')
          and length('TUDARCo') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Kampala International University in Tanzania', nullif('KIUT',''), 'Government', 'Higher education and research institution contributing to DRR knowledge and training.', true,
  'Academic and Research Institution', nullif('University / College',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'TCU-listed institutions + ORODHA VYUO',
  nullif('VYUO',''), nullif('105','')::int,
  'Public and chartered universities in Tanzania (research capacity for DM)', nullif('POLICY_ACADEMIC',''),
  'Higher education and research institution contributing to DRR knowledge and training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Kampala International University in Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KIUT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KIUT')
          and length('KIUT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Ruaha Catholic University', nullif('RUCU',''), 'Government', 'Higher education and research institution contributing to DRR knowledge and training.', true,
  'Academic and Research Institution', nullif('University / College',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'TCU-listed institutions + ORODHA VYUO',
  nullif('VYUO',''), nullif('106','')::int,
  'Public and chartered universities in Tanzania (research capacity for DM)', nullif('POLICY_ACADEMIC',''),
  'Higher education and research institution contributing to DRR knowledge and training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Ruaha Catholic University', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('RUCU','') is not null
          and upper(coalesce(x.acronym,'')) = upper('RUCU')
          and length('RUCU') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'University of Iringa', nullif('UoI',''), 'Government', 'Higher education and research institution contributing to DRR knowledge and training.', true,
  'Academic and Research Institution', nullif('University / College',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'TCU-listed institutions + ORODHA VYUO',
  nullif('VYUO',''), nullif('107','')::int,
  'Public and chartered universities in Tanzania (research capacity for DM)', nullif('POLICY_ACADEMIC',''),
  'Higher education and research institution contributing to DRR knowledge and training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('University of Iringa', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('UoI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('UoI')
          and length('UoI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Teofilo Kisanji University', nullif('TEKU',''), 'Government', 'Higher education and research institution contributing to DRR knowledge and training.', true,
  'Academic and Research Institution', nullif('University / College',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'TCU-listed institutions + ORODHA VYUO',
  nullif('VYUO',''), nullif('108','')::int,
  'Public and chartered universities in Tanzania (research capacity for DM)', nullif('POLICY_ACADEMIC',''),
  'Higher education and research institution contributing to DRR knowledge and training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Teofilo Kisanji University', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TEKU','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TEKU')
          and length('TEKU') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Sebastian Kolowa Memorial University', nullif('SEKOMU',''), 'Government', 'Higher education and research institution contributing to DRR knowledge and training.', true,
  'Academic and Research Institution', nullif('University / College',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'TCU-listed institutions + ORODHA VYUO',
  nullif('VYUO',''), nullif('109','')::int,
  'Public and chartered universities in Tanzania (research capacity for DM)', nullif('POLICY_ACADEMIC',''),
  'Higher education and research institution contributing to DRR knowledge and training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Sebastian Kolowa Memorial University', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SEKOMU','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SEKOMU')
          and length('SEKOMU') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mwenge Catholic University', nullif('MWECAU',''), 'Government', 'Higher education and research institution contributing to DRR knowledge and training.', true,
  'Academic and Research Institution', nullif('University / College',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'TCU-listed institutions + ORODHA VYUO',
  nullif('VYUO',''), nullif('110','')::int,
  'Public and chartered universities in Tanzania (research capacity for DM)', nullif('POLICY_ACADEMIC',''),
  'Higher education and research institution contributing to DRR knowledge and training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mwenge Catholic University', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MWECAU','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MWECAU')
          and length('MWECAU') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Jordan University College', nullif('JUCo',''), 'Government', 'Higher education and research institution contributing to DRR knowledge and training.', true,
  'Academic and Research Institution', nullif('University / College',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'TCU-listed institutions + ORODHA VYUO',
  nullif('VYUO',''), nullif('111','')::int,
  'Public and chartered universities in Tanzania (research capacity for DM)', nullif('POLICY_ACADEMIC',''),
  'Higher education and research institution contributing to DRR knowledge and training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Jordan University College', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('JUCo','') is not null
          and upper(coalesce(x.acronym,'')) = upper('JUCo')
          and length('JUCo') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Stefano Moshi Memorial University College', nullif('SMMUCo',''), 'Government', 'Higher education and research institution contributing to DRR knowledge and training.', true,
  'Academic and Research Institution', nullif('University / College',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'TCU-listed institutions + ORODHA VYUO',
  nullif('VYUO',''), nullif('112','')::int,
  'Public and chartered universities in Tanzania (research capacity for DM)', nullif('POLICY_ACADEMIC',''),
  'Higher education and research institution contributing to DRR knowledge and training.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Stefano Moshi Memorial University College', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SMMUCo','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SMMUCo')
          and length('SMMUCo') >= 3
        )
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'GIZ Tanzania', 'GIZ Tanzania', 'International', nullif('Development Cooperation',''), true,
  'Development Partner', nullif('Development Partner',''),
  nullif('Development Cooperation',''), true,
  'Partner reference compilation', 'ORODHA + known bilateral/multilateral partners',
  nullif('DEVELOPMENT_PARTNERS',''), nullif('1','')::int,
  'Real bilateral/multilateral partners with known Tanzania presence; de-duplicated', nullif('POLICY_DIPLOMATIC',''),
  'Development/humanitarian partner supporting national disaster risk management under government leadership.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('GIZ Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('GIZ Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'KfW Development Bank Tanzania', 'KfW Development Bank Tanzania', 'International', nullif('Development Cooperation',''), true,
  'Development Partner', nullif('Development Partner',''),
  nullif('Development Cooperation',''), true,
  'Partner reference compilation', 'ORODHA + known bilateral/multilateral partners',
  nullif('DEVELOPMENT_PARTNERS',''), nullif('2','')::int,
  'Real bilateral/multilateral partners with known Tanzania presence; de-duplicated', nullif('POLICY_DIPLOMATIC',''),
  'Development/humanitarian partner supporting national disaster risk management under government leadership.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('KfW Development Bank Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('KfW Development Bank Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Sida Sweden Tanzania', 'Sida Sweden Tanzania', 'International', nullif('Development Cooperation',''), true,
  'Development Partner', nullif('Development Partner',''),
  nullif('Development Cooperation',''), true,
  'Partner reference compilation', 'ORODHA + known bilateral/multilateral partners',
  nullif('DEVELOPMENT_PARTNERS',''), nullif('3','')::int,
  'Real bilateral/multilateral partners with known Tanzania presence; de-duplicated', nullif('POLICY_DIPLOMATIC',''),
  'Development/humanitarian partner supporting national disaster risk management under government leadership.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Sida Sweden Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Sida Sweden Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Danida / Danish Embassy Development Cooperation', 'Danida / Danish Embassy Development Cooperation', 'International', nullif('Development Cooperation',''), true,
  'Development Partner', nullif('Development Partner',''),
  nullif('Development Cooperation',''), true,
  'Partner reference compilation', 'ORODHA + known bilateral/multilateral partners',
  nullif('DEVELOPMENT_PARTNERS',''), nullif('4','')::int,
  'Real bilateral/multilateral partners with known Tanzania presence; de-duplicated', nullif('POLICY_DIPLOMATIC',''),
  'Development/humanitarian partner supporting national disaster risk management under government leadership.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Danida / Danish Embassy Development Cooperation', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Danida / Danish Embassy Development Cooperation', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'KOICA Tanzania', 'KOICA Tanzania', 'International', nullif('Development Cooperation',''), true,
  'Development Partner', nullif('Development Partner',''),
  nullif('Development Cooperation',''), true,
  'Partner reference compilation', 'ORODHA + known bilateral/multilateral partners',
  nullif('DEVELOPMENT_PARTNERS',''), nullif('5','')::int,
  'Real bilateral/multilateral partners with known Tanzania presence; de-duplicated', nullif('POLICY_DIPLOMATIC',''),
  'Development/humanitarian partner supporting national disaster risk management under government leadership.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('KOICA Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('KOICA Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'UN Capital Development Fund Tanzania', 'UN Capital Development Fund Tanzania', 'International', nullif('Humanitarian/DRR',''), true,
  'UN Agency', nullif('UN Agency',''),
  nullif('Humanitarian/DRR',''), true,
  'Partner reference compilation', 'ORODHA + known bilateral/multilateral partners',
  nullif('DEVELOPMENT_PARTNERS',''), nullif('6','')::int,
  'Real bilateral/multilateral partners with known Tanzania presence; de-duplicated', nullif('POLICY_UN_AGENCY',''),
  'Development/humanitarian partner supporting national disaster risk management under government leadership.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('UN Capital Development Fund Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('UN Capital Development Fund Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'ADRiFi Trust Fund partnership', 'ADRiFi Trust Fund partnership', 'International', nullif('Finance/Risk Financing',''), true,
  'Development Partner', nullif('Development Partner',''),
  nullif('Finance/Risk Financing',''), true,
  'Partner reference compilation', 'ORODHA + known bilateral/multilateral partners',
  nullif('DEVELOPMENT_PARTNERS',''), nullif('7','')::int,
  'Real bilateral/multilateral partners with known Tanzania presence; de-duplicated', nullif('POLICY_DIPLOMATIC',''),
  'Development/humanitarian partner supporting national disaster risk management under government leadership.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('ADRiFi Trust Fund partnership', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('ADRiFi Trust Fund partnership', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Episcopal Conference Caritas', 'Tanzania Episcopal Conference Caritas', 'NGO', nullif('Humanitarian/Community',''), true,
  'Faith-Based Organization', nullif('FBO',''),
  nullif('Humanitarian/Community',''), true,
  'Partner reference compilation', 'ORODHA + MKAKATI 6.2.50',
  nullif('FBO',''), nullif('8','')::int,
  'Faith-based organisations active in Tanzania social services', nullif('POLICY_FBO',''),
  'Faith-based organisation for community mobilisation and humanitarian assistance.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Episcopal Conference Caritas', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Episcopal Conference Caritas', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Seventh-day Adventist Church Tanzania', 'Seventh-day Adventist Church Tanzania', 'NGO', nullif('Humanitarian/Community',''), true,
  'Faith-Based Organization', nullif('FBO',''),
  nullif('Humanitarian/Community',''), true,
  'Partner reference compilation', 'ORODHA + MKAKATI 6.2.50',
  nullif('FBO',''), nullif('9','')::int,
  'Faith-based organisations active in Tanzania social services', nullif('POLICY_FBO',''),
  'Faith-based organisation for community mobilisation and humanitarian assistance.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Seventh-day Adventist Church Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Seventh-day Adventist Church Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Moravian Church in Tanzania', 'Moravian Church in Tanzania', 'NGO', nullif('Humanitarian/Community',''), true,
  'Faith-Based Organization', nullif('FBO',''),
  nullif('Humanitarian/Community',''), true,
  'Partner reference compilation', 'ORODHA + MKAKATI 6.2.50',
  nullif('FBO',''), nullif('10','')::int,
  'Faith-based organisations active in Tanzania social services', nullif('POLICY_FBO',''),
  'Faith-based organisation for community mobilisation and humanitarian assistance.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Moravian Church in Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Moravian Church in Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Catholic Relief Services Tanzania', 'Catholic Relief Services Tanzania', 'NGO', nullif('Humanitarian/DRR',''), true,
  'NGO', nullif('National/International NGO',''),
  nullif('Humanitarian/DRR',''), true,
  'Partner reference compilation', 'ORODHA + FINAL_DRR + known DRR NGOs',
  nullif('NGOS',''), nullif('11','')::int,
  'Civil society organisations with documented Tanzania presence', nullif('POLICY_NGO',''),
  'NGO supporting community preparedness, response or recovery under national coordination.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Catholic Relief Services Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Catholic Relief Services Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Finn Church Aid Tanzania', 'Finn Church Aid Tanzania', 'NGO', nullif('Humanitarian/DRR',''), true,
  'NGO', nullif('National/International NGO',''),
  nullif('Humanitarian/DRR',''), true,
  'Partner reference compilation', 'ORODHA + FINAL_DRR + known DRR NGOs',
  nullif('NGOS',''), nullif('12','')::int,
  'Civil society organisations with documented Tanzania presence', nullif('POLICY_NGO',''),
  'NGO supporting community preparedness, response or recovery under national coordination.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Finn Church Aid Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Finn Church Aid Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Lutheran World Federation Tanzania', 'Lutheran World Federation Tanzania', 'NGO', nullif('Humanitarian/DRR',''), true,
  'NGO', nullif('National/International NGO',''),
  nullif('Humanitarian/DRR',''), true,
  'Partner reference compilation', 'ORODHA + FINAL_DRR + known DRR NGOs',
  nullif('NGOS',''), nullif('13','')::int,
  'Civil society organisations with documented Tanzania presence', nullif('POLICY_NGO',''),
  'NGO supporting community preparedness, response or recovery under national coordination.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Lutheran World Federation Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Lutheran World Federation Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Islamic Relief Tanzania', 'Islamic Relief Tanzania', 'NGO', nullif('Humanitarian/DRR',''), true,
  'NGO', nullif('National/International NGO',''),
  nullif('Humanitarian/DRR',''), true,
  'Partner reference compilation', 'ORODHA + FINAL_DRR + known DRR NGOs',
  nullif('NGOS',''), nullif('14','')::int,
  'Civil society organisations with documented Tanzania presence', nullif('POLICY_NGO',''),
  'NGO supporting community preparedness, response or recovery under national coordination.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Islamic Relief Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Islamic Relief Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Humanity & Inclusion Tanzania', 'Humanity & Inclusion Tanzania', 'NGO', nullif('Humanitarian/DRR',''), true,
  'NGO', nullif('National/International NGO',''),
  nullif('Humanitarian/DRR',''), true,
  'Partner reference compilation', 'ORODHA + FINAL_DRR + known DRR NGOs',
  nullif('NGOS',''), nullif('15','')::int,
  'Civil society organisations with documented Tanzania presence', nullif('POLICY_NGO',''),
  'NGO supporting community preparedness, response or recovery under national coordination.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Humanity & Inclusion Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Humanity & Inclusion Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'British Red Cross Tanzania partnership', 'British Red Cross Tanzania partnership', 'NGO', nullif('Humanitarian/DRR',''), true,
  'NGO', nullif('National/International NGO',''),
  nullif('Humanitarian/DRR',''), true,
  'Partner reference compilation', 'ORODHA + FINAL_DRR + known DRR NGOs',
  nullif('NGOS',''), nullif('16','')::int,
  'Civil society organisations with documented Tanzania presence', nullif('POLICY_NGO',''),
  'NGO supporting community preparedness, response or recovery under national coordination.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('British Red Cross Tanzania partnership', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('British Red Cross Tanzania partnership', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'FEMINA HIP', 'FEMINA HIP', 'NGO', nullif('Humanitarian/DRR',''), true,
  'NGO', nullif('National/International NGO',''),
  nullif('Humanitarian/DRR',''), true,
  'Partner reference compilation', 'ORODHA + FINAL_DRR + known DRR NGOs',
  nullif('NGOS',''), nullif('17','')::int,
  'Civil society organisations with documented Tanzania presence', nullif('POLICY_NGO',''),
  'NGO supporting community preparedness, response or recovery under national coordination.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('FEMINA HIP', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('FEMINA HIP', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Malihai Clubs of Tanzania', 'Malihai Clubs of Tanzania', 'NGO', nullif('Humanitarian/DRR',''), true,
  'NGO', nullif('National/International NGO',''),
  nullif('Humanitarian/DRR',''), true,
  'Partner reference compilation', 'ORODHA + FINAL_DRR + known DRR NGOs',
  nullif('NGOS',''), nullif('18','')::int,
  'Civil society organisations with documented Tanzania presence', nullif('POLICY_NGO',''),
  'NGO supporting community preparedness, response or recovery under national coordination.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Malihai Clubs of Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Malihai Clubs of Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.stakeholders(name, organization, type, sector, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'ENVIROCARE Tanzania', 'ENVIROCARE Tanzania', 'NGO', nullif('Humanitarian/DRR',''), true,
  'NGO', nullif('National/International NGO',''),
  nullif('Humanitarian/DRR',''), true,
  'Partner reference compilation', 'ORODHA + FINAL_DRR + known DRR NGOs',
  nullif('NGOS',''), nullif('19','')::int,
  'Civil society organisations with documented Tanzania presence', nullif('POLICY_NGO',''),
  'NGO supporting community preparedness, response or recovery under national coordination.', now(), now()
where not exists (
  select 1 from public.stakeholders x
  where lower(regexp_replace(coalesce(x.organization, x.name, ''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('ENVIROCARE Tanzania', '[^a-z0-9]+', '', 'g'))
     or lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('ENVIROCARE Tanzania', '[^a-z0-9]+', '', 'g'))
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mtwara-Mikindani Urban Water Supply and Sanitation Authority', nullif('MTMIWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1001','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mtwara-Mikindani Urban Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MTMIWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MTMIWASA')
          and length('MTMIWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Lindi Municipal Water Supply and Sanitation Authority', nullif('Lindi-UWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1002','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Lindi Municipal Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('Lindi-UWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('Lindi-UWASA')
          and length('Lindi-UWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Handeni Trunk Main Water Supply and Sanitation Authority', nullif('HTM-WSSA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1003','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Handeni Trunk Main Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('HTM-WSSA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('HTM-WSSA')
          and length('HTM-WSSA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Kahama-Shinyanga Water Supply and Sanitation Authority', nullif('KASHWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1004','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Kahama-Shinyanga Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KASHWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KASHWASA')
          and length('KASHWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Maswa Urban Water Supply and Sanitation Authority', nullif('MAUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1005','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Maswa Urban Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MAUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MAUWASA')
          and length('MAUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Bariadi Urban Water Supply and Sanitation Authority', nullif('BAUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1006','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Bariadi Urban Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('BAUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('BAUWASA')
          and length('BAUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tarime Urban Water Supply and Sanitation Authority', nullif('TUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1007','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tarime Urban Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TUWASA')
          and length('TUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Musoma Municipal Water Supply Authority', nullif('MUWASA-M',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1008','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Musoma Municipal Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MUWASA-M','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MUWASA-M')
          and length('MUWASA-M') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Bukoba Municipal Water Supply Authority', nullif('BUWASA-M',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1009','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Bukoba Municipal Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('BUWASA-M','') is not null
          and upper(coalesce(x.acronym,'')) = upper('BUWASA-M')
          and length('BUWASA-M') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Kigoma-Ujiji Urban Water Supply and Sanitation Authority', nullif('KUWASA-U',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1010','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Kigoma-Ujiji Urban Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KUWASA-U','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KUWASA-U')
          and length('KUWASA-U') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Sumbawanga Municipal Water Supply Authority', nullif('SUWASA-M',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1011','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Sumbawanga Municipal Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SUWASA-M','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SUWASA-M')
          and length('SUWASA-M') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mpanda Urban Water Supply and Sanitation Authority', nullif('MPUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1012','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mpanda Urban Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MPUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MPUWASA')
          and length('MPUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tabora Urban Water Supply and Sanitation Authority', nullif('TUWASA-T',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1013','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tabora Urban Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TUWASA-T','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TUWASA-T')
          and length('TUWASA-T') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Nzega Urban Water Supply and Sanitation Authority', nullif('NUWASA-N',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1014','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Nzega Urban Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NUWASA-N','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NUWASA-N')
          and length('NUWASA-N') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Singida Municipal Water Supply Authority', nullif('SIUWASA-M',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1015','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Singida Municipal Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SIUWASA-M','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SIUWASA-M')
          and length('SIUWASA-M') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Manyoni Urban Water Supply Authority', nullif('MAUWASA-M',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1016','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Manyoni Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MAUWASA-M','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MAUWASA-M')
          and length('MAUWASA-M') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Babati Town Water Supply and Sanitation Authority', nullif('BAWASA-T',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1017','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Babati Town Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('BAWASA-T','') is not null
          and upper(coalesce(x.acronym,'')) = upper('BAWASA-T')
          and length('BAWASA-T') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mbulu Urban Water Supply Authority', nullif('MBUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1018','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mbulu Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MBUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MBUWASA')
          and length('MBUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Karatu Urban Water Supply Authority', nullif('KAUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1019','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Karatu Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KAUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KAUWASA')
          and length('KAUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Same-Mwanga Urban Water Supply Authority', nullif('SMUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1020','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Same-Mwanga Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SMUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SMUWASA')
          and length('SMUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Korogwe Urban Water Supply Authority', nullif('KOUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1021','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Korogwe Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KOUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KOUWASA')
          and length('KOUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Muheza Urban Water Supply Authority', nullif('MUHUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1022','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Muheza Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MUHUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MUHUWASA')
          and length('MUHUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Pangani Urban Water Supply Authority', nullif('PAUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1023','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Pangani Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PAUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PAUWASA')
          and length('PAUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Kilwa Urban Water Supply Authority', nullif('KIUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1024','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Kilwa Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KIUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KIUWASA')
          and length('KIUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Nachingwea Urban Water Supply Authority', nullif('NAUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1025','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Nachingwea Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NAUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NAUWASA')
          and length('NAUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Masasi Urban Water Supply Authority', nullif('MASUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1026','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Masasi Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MASUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MASUWASA')
          and length('MASUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Newala Urban Water Supply Authority', nullif('NEUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1027','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Newala Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NEUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NEUWASA')
          and length('NEUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tunduru Urban Water Supply Authority', nullif('TUNUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1028','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tunduru Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TUNUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TUNUWASA')
          and length('TUNUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Songea Municipal Water Supply Authority', nullif('SOUWASA-M',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1029','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Songea Municipal Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SOUWASA-M','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SOUWASA-M')
          and length('SOUWASA-M') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mbinga Urban Water Supply Authority', nullif('MBIUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1030','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mbinga Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MBIUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MBIUWASA')
          and length('MBIUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Njombe Town Water Supply Authority', nullif('NUWASA-T',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1031','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Njombe Town Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NUWASA-T','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NUWASA-T')
          and length('NUWASA-T') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Makambako Urban Water Supply Authority', nullif('MAKUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1032','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Makambako Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MAKUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MAKUWASA')
          and length('MAKUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Iringa Municipal Water Supply Authority', nullif('IRUWASA-M',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1033','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Iringa Municipal Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('IRUWASA-M','') is not null
          and upper(coalesce(x.acronym,'')) = upper('IRUWASA-M')
          and length('IRUWASA-M') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mafinga Urban Water Supply Authority', nullif('MAFUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1034','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mafinga Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MAFUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MAFUWASA')
          and length('MAFUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mbeya City Water Supply and Sanitation Authority', nullif('MBWASA-C',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1035','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mbeya City Water Supply and Sanitation Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MBWASA-C','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MBWASA-C')
          and length('MBWASA-C') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tukuyu Urban Water Supply Authority', nullif('TUUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1036','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tukuyu Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TUUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TUUWASA')
          and length('TUUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Kyela Urban Water Supply Authority', nullif('KYUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1037','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Kyela Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KYUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KYUWASA')
          and length('KYUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Chunya Urban Water Supply Authority', nullif('CHUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1038','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Chunya Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('CHUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('CHUWASA')
          and length('CHUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Sumbawanga Municipal Council Water Authority', nullif('SUMUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1039','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Sumbawanga Municipal Council Water Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SUMUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SUMUWASA')
          and length('SUMUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mpanda Municipal Water Authority', nullif('MPUWA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1040','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mpanda Municipal Water Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MPUWA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MPUWA')
          and length('MPUWA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Kakonko Urban Water Supply Authority', nullif('KAKUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1041','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Kakonko Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KAKUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KAKUWASA')
          and length('KAKUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Kasulu Urban Water Supply Authority', nullif('KASUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1042','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Kasulu Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KASUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KASUWASA')
          and length('KASUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Kibondo Urban Water Supply Authority', nullif('KIBUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1043','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Kibondo Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KIBUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KIBUWASA')
          and length('KIBUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Geita Town Water Supply Authority', nullif('GEUWASA-T',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1044','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Geita Town Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('GEUWASA-T','') is not null
          and upper(coalesce(x.acronym,'')) = upper('GEUWASA-T')
          and length('GEUWASA-T') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Chato Urban Water Supply Authority', nullif('CHAUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1045','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Chato Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('CHAUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('CHAUWASA')
          and length('CHAUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Biharamulo Urban Water Supply Authority', nullif('BIHUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1046','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Biharamulo Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('BIHUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('BIHUWASA')
          and length('BIHUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Ngara Urban Water Supply Authority', nullif('NGUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1047','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Ngara Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NGUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NGUWASA')
          and length('NGUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Muleba Urban Water Supply Authority', nullif('MULUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1048','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Muleba Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MULUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MULUWASA')
          and length('MULUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Karagwe Urban Water Supply Authority', nullif('KARUWASA',''), 'Government', 'Government institution with disaster-relevant mandate in Water/WASH.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Water/WASH',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1049','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Water/WASH.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Karagwe Urban Water Supply Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KARUWASA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KARUWASA')
          and length('KARUWASA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tobacco Board of Tanzania', nullif('TBT',''), 'Government', 'Government institution with disaster-relevant mandate in Agriculture/Food Security.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1050','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Agriculture/Food Security.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tobacco Board of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TBT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TBT')
          and length('TBT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Pyrethrum Board of Tanzania', nullif('PBT',''), 'Government', 'Government institution with disaster-relevant mandate in Agriculture/Food Security.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1051','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Agriculture/Food Security.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Pyrethrum Board of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PBT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PBT')
          and length('PBT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Sisal Board of Tanzania', nullif('SiBT',''), 'Government', 'Government institution with disaster-relevant mandate in Agriculture/Food Security.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1052','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Agriculture/Food Security.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Sisal Board of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SiBT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SiBT')
          and length('SiBT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Sisal Board', nullif('TSB',''), 'Government', 'Government institution with disaster-relevant mandate in Agriculture/Food Security.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1053','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Agriculture/Food Security.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Sisal Board', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TSB','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TSB')
          and length('TSB') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Dairy Board of Tanzania', nullif('DBT',''), 'Government', 'Government institution with disaster-relevant mandate in Livestock/Fisheries.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Livestock/Fisheries',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1054','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Livestock/Fisheries.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Dairy Board of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('DBT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('DBT')
          and length('DBT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Meat Board of Tanzania', nullif('MBT',''), 'Government', 'Government institution with disaster-relevant mandate in Livestock/Fisheries.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Livestock/Fisheries',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1055','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Livestock/Fisheries.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Meat Board of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MBT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MBT')
          and length('MBT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Dairy Board', nullif('TDB',''), 'Government', 'Government institution with disaster-relevant mandate in Livestock/Fisheries.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Livestock/Fisheries',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1056','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Livestock/Fisheries.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Dairy Board', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TDB','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TDB')
          and length('TDB') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Fertilizer Regulatory Authority', nullif('TFRA',''), 'Government', 'Government institution with disaster-relevant mandate in Agriculture/Food Security.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1057','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Agriculture/Food Security.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Fertilizer Regulatory Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TFRA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TFRA')
          and length('TFRA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Plant Health and Pesticides Authority', nullif('TPHPA',''), 'Government', 'Government institution with disaster-relevant mandate in Agriculture/Food Security.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1058','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Agriculture/Food Security.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Plant Health and Pesticides Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TPHPA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TPHPA')
          and length('TPHPA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tropical Pesticides Research Institute', nullif('TPRI',''), 'Government', 'Government institution with disaster-relevant mandate in Agriculture/Food Security.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1059','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Agriculture/Food Security.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tropical Pesticides Research Institute', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TPRI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TPRI')
          and length('TPRI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tea Research Institute of Tanzania', nullif('TRIT',''), 'Government', 'Government institution with disaster-relevant mandate in Agriculture/Food Security.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Agriculture/Food Security',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1060','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Agriculture/Food Security.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tea Research Institute of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TRIT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TRIT')
          and length('TRIT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Wildlife Protection Fund', nullif('TWPF',''), 'Government', 'Government institution with disaster-relevant mandate in Environment/Natural Resources.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Environment/Natural Resources',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1061','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Environment/Natural Resources.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Wildlife Protection Fund', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TWPF','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TWPF')
          and length('TWPF') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Eastern Arc Mountains Conservation Endowment Fund', nullif('EAMCEF',''), 'Government', 'Government institution with disaster-relevant mandate in Environment/Natural Resources.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Environment/Natural Resources',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1062','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Environment/Natural Resources.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Eastern Arc Mountains Conservation Endowment Fund', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('EAMCEF','') is not null
          and upper(coalesce(x.acronym,'')) = upper('EAMCEF')
          and length('EAMCEF') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Forest Fund', nullif('TaFF',''), 'Government', 'Government institution with disaster-relevant mandate in Environment/Natural Resources.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Environment/Natural Resources',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1063','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Environment/Natural Resources.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Forest Fund', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TaFF','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TaFF')
          and length('TaFF') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Land Use Planning Commission', nullif('NLUPC',''), 'Government', 'Government institution with disaster-relevant mandate in Land Use/Urban Planning.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Land Use/Urban Planning',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1064','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Land Use/Urban Planning.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Land Use Planning Commission', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NLUPC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NLUPC')
          and length('NLUPC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Property and Business Formalization Programme MKURABITA', nullif('MKURABITA',''), 'Government', 'Government institution with disaster-relevant mandate in Land Use/Urban Planning.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Land Use/Urban Planning',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1065','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Land Use/Urban Planning.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Property and Business Formalization Programme MKURABITA', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MKURABITA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MKURABITA')
          and length('MKURABITA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Mortgage Refinance Company', nullif('TMRC',''), 'Government', 'Government institution with disaster-relevant mandate in Finance/Risk Financing.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Finance/Risk Financing',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1066','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Finance/Risk Financing.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Mortgage Refinance Company', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TMRC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TMRC')
          and length('TMRC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Unit Trust of Tanzania', nullif('UTT',''), 'Government', 'Government institution with disaster-relevant mandate in Finance/Risk Financing.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Finance/Risk Financing',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1067','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Finance/Risk Financing.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Unit Trust of Tanzania', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('UTT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('UTT')
          and length('UTT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Zanzibar Institute of Financial Administration', nullif('ZIFA',''), 'Government', 'Government institution with disaster-relevant mandate in Education/Research.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1068','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Education/Research.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Zanzibar Institute of Financial Administration', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('ZIFA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('ZIFA')
          and length('ZIFA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'College of African Wildlife Management Mweka', nullif('CAWM',''), 'Government', 'Government institution with disaster-relevant mandate in Education/Research.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1069','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Education/Research.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('College of African Wildlife Management Mweka', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('CAWM','') is not null
          and upper(coalesce(x.acronym,'')) = upper('CAWM')
          and length('CAWM') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Serengeti Wildlife Research Centre', nullif('SWRC',''), 'Government', 'Government institution with disaster-relevant mandate in Environment/Natural Resources.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Environment/Natural Resources',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1070','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Environment/Natural Resources.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Serengeti Wildlife Research Centre', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SWRC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SWRC')
          and length('SWRC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Kunduchi Fisheries Institute', nullif('KFI',''), 'Government', 'Government institution with disaster-relevant mandate in Education/Research.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Education/Research',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1071','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Education/Research.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Kunduchi Fisheries Institute', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('KFI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('KFI')
          and length('KFI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Institute for Medical Research Mwanza Centre', nullif('NIMR-M',''), 'Government', 'Government institution with disaster-relevant mandate in Health/Research.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health/Research',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1072','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health/Research.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Institute for Medical Research Mwanza Centre', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NIMR-M','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NIMR-M')
          and length('NIMR-M') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Institute for Medical Research Tanga Centre', nullif('NIMR-T',''), 'Government', 'Government institution with disaster-relevant mandate in Health/Research.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health/Research',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1073','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health/Research.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Institute for Medical Research Tanga Centre', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NIMR-T','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NIMR-T')
          and length('NIMR-T') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Institute for Medical Research Mbeya Centre', nullif('NIMR-Mb',''), 'Government', 'Government institution with disaster-relevant mandate in Health/Research.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health/Research',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1074','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health/Research.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Institute for Medical Research Mbeya Centre', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NIMR-Mb','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NIMR-Mb')
          and length('NIMR-Mb') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Muhimbili Orthopaedic Institute', nullif('MOI',''), 'Government', 'Government institution with disaster-relevant mandate in Health.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1075','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Muhimbili Orthopaedic Institute', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MOI','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MOI')
          and length('MOI') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Dodoma Regional Referral Hospital', nullif('DRRH',''), 'Government', 'Government institution with disaster-relevant mandate in Health.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1076','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Dodoma Regional Referral Hospital', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('DRRH','') is not null
          and upper(coalesce(x.acronym,'')) = upper('DRRH')
          and length('DRRH') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Bugando Medical Centre', nullif('BMC',''), 'Government', 'Government institution with disaster-relevant mandate in Health.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1077','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Bugando Medical Centre', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('BMC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('BMC')
          and length('BMC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mbeya Zonal Referral Hospital', nullif('MZRH',''), 'Government', 'Government institution with disaster-relevant mandate in Health.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1078','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mbeya Zonal Referral Hospital', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MZRH','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MZRH')
          and length('MZRH') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mtwara Regional Referral Hospital', nullif('MRRH',''), 'Government', 'Government institution with disaster-relevant mandate in Health.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1079','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mtwara Regional Referral Hospital', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MRRH','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MRRH')
          and length('MRRH') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanga Regional Referral Hospital', nullif('TRRH',''), 'Government', 'Government institution with disaster-relevant mandate in Health.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1080','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanga Regional Referral Hospital', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TRRH','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TRRH')
          and length('TRRH') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mwanza Regional Referral Hospital Sekou Toure', nullif('MRRH-ST',''), 'Government', 'Government institution with disaster-relevant mandate in Health.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1081','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mwanza Regional Referral Hospital Sekou Toure', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MRRH-ST','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MRRH-ST')
          and length('MRRH-ST') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Arusha Regional Referral Hospital Mount Meru', nullif('ARRH-MM',''), 'Government', 'Government institution with disaster-relevant mandate in Health.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1082','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Arusha Regional Referral Hospital Mount Meru', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('ARRH-MM','') is not null
          and upper(coalesce(x.acronym,'')) = upper('ARRH-MM')
          and length('ARRH-MM') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mawenzi Regional Referral Hospital', nullif('Mawenzi-RRH',''), 'Government', 'Government institution with disaster-relevant mandate in Health.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1083','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mawenzi Regional Referral Hospital', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('Mawenzi-RRH','') is not null
          and upper(coalesce(x.acronym,'')) = upper('Mawenzi-RRH')
          and length('Mawenzi-RRH') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Muhimbili National Hospital Mloganzila', nullif('MNH-M',''), 'Government', 'Government institution with disaster-relevant mandate in Health.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Health',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1084','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Health.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Muhimbili National Hospital Mloganzila', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MNH-M','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MNH-M')
          and length('MNH-M') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Government Printer', nullif('GP',''), 'Government', 'Government institution with disaster-relevant mandate in Governance.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Governance',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1085','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Governance.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Government Printer', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('GP','') is not null
          and upper(coalesce(x.acronym,'')) = upper('GP')
          and length('GP') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Fair Competition Tribunal', nullif('FCT',''), 'Government', 'Government institution with disaster-relevant mandate in Trade/Industry.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Trade/Industry',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1086','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Trade/Industry.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Fair Competition Tribunal', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('FCT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('FCT')
          and length('FCT') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Universal Communications Service Access Fund', nullif('UCSAF',''), 'Government', 'Government institution with disaster-relevant mandate in Communication/Media.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Communication/Media',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1087','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Communication/Media.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Universal Communications Service Access Fund', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('UCSAF','') is not null
          and upper(coalesce(x.acronym,'')) = upper('UCSAF')
          and length('UCSAF') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Special Economic Zones Authority coordination', nullif('SEZA',''), 'Government', 'Government institution with disaster-relevant mandate in Trade/Industry.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Trade/Industry',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1088','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Trade/Industry.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Special Economic Zones Authority coordination', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('SEZA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('SEZA')
          and length('SEZA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Mining Commission', nullif('MC',''), 'Government', 'Government institution with disaster-relevant mandate in Energy/Minerals.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Energy/Minerals',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1089','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Energy/Minerals.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Mining Commission', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('MC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('MC')
          and length('MC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Tanzania Minerals Audit Agency', nullif('TMAA',''), 'Government', 'Government institution with disaster-relevant mandate in Energy/Minerals.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Energy/Minerals',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1090','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Energy/Minerals.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Tanzania Minerals Audit Agency', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('TMAA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('TMAA')
          and length('TMAA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Deep Sea Fishing Authority', nullif('DSFA',''), 'Government', 'Government institution with disaster-relevant mandate in Livestock/Fisheries.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Livestock/Fisheries',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1091','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Livestock/Fisheries.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Deep Sea Fishing Authority', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('DSFA','') is not null
          and upper(coalesce(x.acronym,'')) = upper('DSFA')
          and length('DSFA') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Public Service Recruitment Secretariat', nullif('PSRS',''), 'Government', 'Government institution with disaster-relevant mandate in Public Service.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Public Service',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1092','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Public Service.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Public Service Recruitment Secretariat', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PSRS','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PSRS')
          and length('PSRS') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'Public Service Commission', nullif('PSC',''), 'Government', 'Government institution with disaster-relevant mandate in Public Service.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Public Service',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1093','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Public Service.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('Public Service Commission', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('PSC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('PSC')
          and length('PSC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Economic Empowerment Council', nullif('NEEC',''), 'Government', 'Government institution with disaster-relevant mandate in Social Protection.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Social Protection',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1094','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Social Protection.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Economic Empowerment Council', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('NEEC','') is not null
          and upper(coalesce(x.acronym,'')) = upper('NEEC')
          and length('NEEC') >= 3
        )
);

insert into public.agencies(name, acronym, agency_type, mandate_description, is_active,
  institution_class, institution_subclass, sector_tags, me_required, source_register,
  source_file, source_sheet, source_row, source_reference, policy_role_code, role_summary,
  created_at, updated_at)
select 'National Service JKT', nullif('JKT',''), 'Government', 'Government institution with disaster-relevant mandate in Security/Response.', true,
  'Government Institution', nullif('MDA / Utility / Board',''),
  nullif('Security/Response',''), true,
  'National MDA reference compilation', 'Research + utility authorities + boards',
  nullif('EXTRA_MDA',''), nullif('1095','')::int,
  'Documented URT water utilities, boards, hospitals, research institutes; de-duplicated', nullif('',''),
  'Government institution with disaster-relevant mandate in Security/Response.', now(), now()
where not exists (
  select 1 from public.agencies x
  where lower(regexp_replace(coalesce(x.name,''), '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace('National Service JKT', '[^a-z0-9]+', '', 'g'))
     or (
          nullif('JKT','') is not null
          and upper(coalesce(x.acronym,'')) = upper('JKT')
          and length('JKT') >= 3
        )
);

-- Map policy roles for expanded MDAs by acronym/name (only where still null)
update public.agencies a set
  policy_role_code = v.role,
  me_required = true,
  updated_at = now()
from (values
  ('TMA','POLICY_TMA'),('TIRA','POLICY_TIRA'),('eGA','POLICY_EGA'),('EGA','POLICY_EGA'),
  ('NEMC','POLICY_NEMC'),('TCRA','POLICY_TCRA'),('MoH','POLICY_HEALTH'),('MoW','POLICY_WATER'),
  ('MoA','POLICY_AGRICULTURE'),('MoF','POLICY_FINANCE'),('PMO-DMD','POLICY_PMO_DMD'),
  ('PO-RALG','POLICY_PORALG'),('TAMISEMI','POLICY_PORALG'),('GST','POLICY_SECURITY_RESPONSE'),
  ('FRF','POLICY_SECURITY_RESPONSE'),('TPF','POLICY_SECURITY_RESPONSE'),('TPDF','POLICY_SECURITY_RESPONSE'),
  ('NIMR','POLICY_HEALTH'),('MSD','POLICY_HEALTH'),('TMDA','POLICY_HEALTH'),
  ('RUWASA','POLICY_WATER'),('DAWASA','POLICY_WATER'),('TANESCO','POLICY_WORKS_TRANSPORT'),
  ('TANROADS','POLICY_WORKS_TRANSPORT'),('TARURA','POLICY_WORKS_TRANSPORT'),
  ('ARU','POLICY_ACADEMIC'),('UDSM','POLICY_ACADEMIC'),('UDOM','POLICY_ACADEMIC'),
  ('SUA','POLICY_ACADEMIC'),('MUHAS','POLICY_ACADEMIC'),('COSTECH','POLICY_ACADEMIC')
) as v(acr, role)
where a.policy_role_code is null
  and upper(coalesce(a.acronym,'')) = upper(v.acr);

-- Mark all non-LGA government institutions as M&E required by default
update public.agencies
   set me_required = true, updated_at = now()
 where coalesce(is_active,true)
   and institution_class in (
     'Ministry','Government Institution','Government Directorate',
     'Security and Response Institution','Academic and Research Institution'
   );

update public.stakeholders
   set me_required = true, updated_at = now()
 where coalesce(is_active,true)
   and institution_class in (
     'UN Agency','NGO','Private Sector','Faith-Based Organization','Media',
     'Diplomatic Mission','Development Partner','Community / Civic Group'
   );

-- Reporting-path helper view for System Settings / M&E (no app rewrite needed)
create or replace view public.v_institution_me_reporting_paths as
select 'agency'::text as registry_kind,
       a.id,
       a.name,
       a.acronym,
       a.institution_class,
       a.policy_role_code,
       a.sector_tags,
       a.me_required,
       'agency'::text as me_level,
       'MDA focal reports in M&E workbench at Government institutions (MDAs) level'::text as reporting_path_en,
       'Afisa wa MDA anaripoti kwenye Kazi ya M&E ngazi ya Taasisi za Serikali (MDAs)'::text as reporting_path_sw,
       (select count(*) from public.me_indicator_catalog i
         where i.active and i.level = 'agency'
           and (
             coalesce(i.applicable_institution_classes,'') = ''
             or exists (
               select 1 from regexp_split_to_table(lower(i.applicable_institution_classes), ',') c(v)
               where trim(c.v) = lower(coalesce(a.institution_class,''))
             )
           )
           and (
             coalesce(i.policy_role_code,'') = ''
             or i.policy_role_code = a.policy_role_code
             or a.policy_role_code is null
           )
       ) as matching_indicators
from public.agencies a
where coalesce(a.is_active,true)
union all
select 'stakeholder',
       s.id,
       coalesce(s.organization, s.name),
       null,
       s.institution_class,
       s.policy_role_code,
       s.sector_tags,
       s.me_required,
       'stakeholder',
       'Partner reports in M&E workbench at Partners (UN/NGO/Private/FBO/Media) level',
       'Mshirika anaripoti kwenye Kazi ya M&E ngazi ya Wadau (UN/NGO/Sekta Binafsi/Dini/Habari)',
       (select count(*) from public.me_indicator_catalog i
         where i.active and i.level = 'stakeholder'
           and (
             coalesce(i.applicable_institution_classes,'') = ''
             or exists (
               select 1 from regexp_split_to_table(lower(i.applicable_institution_classes), ',') c(v)
               where trim(c.v) = lower(coalesce(s.institution_class,''))
             )
           )
       )
from public.stakeholders s
where coalesce(s.is_active,true);
