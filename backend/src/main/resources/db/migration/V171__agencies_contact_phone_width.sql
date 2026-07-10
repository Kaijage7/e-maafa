-- agencies.contact_person_phone was VARCHAR(50) (Laravel mirror of create_agencies_table).
-- Real institution-registry imports carry multi-number contact strings (e.g. GST = 78 chars,
-- TAEC = 65). stakeholders.contact_person_phone is already VARCHAR(255).
-- Widen only; no data loss. Required so InstitutionRegistryLocalSeeder and portal agency admin
-- writes do not fail DataIntegrityViolation on legitimate registry data.

alter table public.agencies
    alter column contact_person_phone type varchar(255);
