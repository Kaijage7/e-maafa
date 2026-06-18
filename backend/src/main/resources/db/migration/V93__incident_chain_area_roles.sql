-- Two area-tier roles the jurisdiction-scoped incident chain needs:
--   DED — District Executive Director: approves incidents at the district stage (matched to their district).
--   RC  — Regional Commissioner: regional oversight/viewer of incidents in their region.
-- Idempotent; explicit id = max(id)+1 to coexist with the explicitly-id'd seeded roles (LocalDataSeeder).
insert into public.roles(id, name, guard_name, description, created_at, updated_at)
select (select coalesce(max(id), 0) from public.roles) + 1, 'DED', 'web',
       'District Executive Director — approves incidents at the district stage (jurisdiction-scoped).', now(), now()
where not exists (select 1 from public.roles where name = 'DED');

insert into public.roles(id, name, guard_name, description, created_at, updated_at)
select (select coalesce(max(id), 0) from public.roles) + 1, 'RC', 'web',
       'Regional Commissioner — regional oversight/viewer of incidents in their region.', now(), now()
where not exists (select 1 from public.roles where name = 'RC');
