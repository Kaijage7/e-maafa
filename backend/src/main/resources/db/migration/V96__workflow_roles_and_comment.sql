-- Incident escalation-workflow roles + the advise-without-approve permission (INCIDENT-WORKFLOW-PLAN.md).
-- Roles use explicit id = max(id)+1 and a name guard to stay idempotent and coexist with seeded/explicit ids
-- (same pattern as V93). Grants join on name and are on-conflict-do-nothing.
--   Planning Officers (district/region): advise the coordinator (DDMC/RDMC) — view + comment, no approval.
--   Logistic Officers (district/region): purchase + dispatch resources at their tier.
--   District Commissioner (DC): advises DED (the RC equivalent at district), view + comment, no approval.

insert into public.roles(id, name, guard_name, description, created_at, updated_at)
select (select coalesce(max(id),0) from public.roles)+1, 'District Planning Officer', 'web',
       'District Planning Officer (Afisa Mipango Wilaya) — advises DDMC; view + comment, no approval.', now(), now()
where not exists (select 1 from public.roles where name = 'District Planning Officer');

insert into public.roles(id, name, guard_name, description, created_at, updated_at)
select (select coalesce(max(id),0) from public.roles)+1, 'Regional Planning Officer', 'web',
       'Regional Planning Officer (Afisa Mipango Mkoa) — advises RDMC; view + comment, no approval.', now(), now()
where not exists (select 1 from public.roles where name = 'Regional Planning Officer');

insert into public.roles(id, name, guard_name, description, created_at, updated_at)
select (select coalesce(max(id),0) from public.roles)+1, 'District Logistic Officer', 'web',
       'District Logistic Officer — purchases/dispatches resources at district level.', now(), now()
where not exists (select 1 from public.roles where name = 'District Logistic Officer');

insert into public.roles(id, name, guard_name, description, created_at, updated_at)
select (select coalesce(max(id),0) from public.roles)+1, 'Regional Logistic Officer', 'web',
       'Regional Logistic Officer — purchases/dispatches resources at regional level.', now(), now()
where not exists (select 1 from public.roles where name = 'Regional Logistic Officer');

insert into public.roles(id, name, guard_name, description, created_at, updated_at)
select (select coalesce(max(id),0) from public.roles)+1, 'District Commissioner', 'web',
       'District Commissioner (DC) — advises DED; view + comment, no approval.', now(), now()
where not exists (select 1 from public.roles where name = 'District Commissioner');

-- advise-without-approve permission
insert into public.permissions(name, module, action, label, guard_name, created_at, updated_at)
values ('incidents.comment','Incidents','comment','Comment — Incidents','web', now(), now())
on conflict (name) do nothing;

-- grants: approvers (Dist DC=DDMC, Reg DC=RDMC, EOCC) gain approve+comment; advisers get view+comment;
-- logistic officers get view + dispatch + stock-manage. (Chain stages still gate WHEN one may approve.)
insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from (values
  ('Dist DC','incidents.approve'),('Dist DC','incidents.comment'),
  ('Reg DC','incidents.approve'),('Reg DC','incidents.comment'),
  ('EOCC','incidents.approve'),('EOCC','incidents.comment'),
  ('DED','incidents.comment'),('RAS','incidents.comment'),
  ('Director','incidents.comment'),('Secretary','incidents.comment'),('Asst. Director','incidents.comment'),
  ('RC','incidents.view'),('RC','incidents.comment'),
  ('District Planning Officer','incidents.view'),('District Planning Officer','incidents.comment'),
  ('Regional Planning Officer','incidents.view'),('Regional Planning Officer','incidents.comment'),
  ('District Commissioner','incidents.view'),('District Commissioner','incidents.comment'),
  ('District Logistic Officer','incidents.view'),('District Logistic Officer','resource_allocation.dispatch'),('District Logistic Officer','warehouse_and_stock.manage'),
  ('Regional Logistic Officer','incidents.view'),('Regional Logistic Officer','resource_allocation.dispatch'),('Regional Logistic Officer','warehouse_and_stock.manage')
) as gr(rname, pname)
join public.roles r on r.name = gr.rname
join public.permissions p on p.name = gr.pname
on conflict do nothing;
