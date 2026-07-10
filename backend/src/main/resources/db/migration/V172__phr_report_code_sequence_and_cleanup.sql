-- F84: PHR report_code was count(*)+1 with no unique index (race collisions).
-- Sequence + unique constraint; generator uses nextval in application code.
-- F57: drop dead approval_level_definitions (live approval config is elsewhere).
-- F56: drop schema-only recipient_groups tables (audience uses hardcoded GROUP_ROLES).

create sequence if not exists public.phr_report_code_seq;

-- Seed sequence past any existing max suffix for the current year pattern PHR-YYYY-#####
do $$
declare
    max_n bigint;
begin
    select coalesce(max(
        case when report_code ~ '^PHR-[0-9]{4}-[0-9]+$'
             then substring(report_code from '[0-9]+$')::bigint
             else 0 end
    ), 0) into max_n
    from public.public_hazard_reports;
    perform setval('public.phr_report_code_seq', greatest(max_n, 1), true);
end $$;

create unique index if not exists uq_public_hazard_reports_report_code
    on public.public_hazard_reports (report_code);

-- F57: dead twin of live approval workflow config
drop table if exists public.approval_level_definitions cascade;

-- F56: schema-only audience tables never used by runtime resolution
drop table if exists public.recipient_group_members cascade;
drop table if exists public.recipient_groups cascade;
