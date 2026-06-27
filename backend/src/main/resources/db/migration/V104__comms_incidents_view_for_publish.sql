-- De-cheat surfaced by the Stage B test: Comms Officer is granted incidents.publish (RESPONSE_PUBLISH
-- always intended Comms to publish incident news/maps to the public portal) but lacked incidents.view,
-- so the ModuleGuardFilter (path /v1/response/incidents -> incidents.view) blocked Comms BEFORE the
-- publish gate — the grant was dead and the matrix lied. Every other publish role already holds
-- incidents.view. Grant it to Comms so the capability the matrix shows is actually usable.
-- (Root cause of the gap: the seeder's seed-only-if-empty never backfilled incidents.view onto the
-- already-seeded Comms role; a fresh install gets it via the Comms "*|view" policy.)
insert into public.role_has_permissions(permission_id, role_id)
select p.id, r.id
from public.permissions p, public.roles r
where p.name = 'incidents.view' and r.name = 'Comms Officer'
on conflict do nothing;
