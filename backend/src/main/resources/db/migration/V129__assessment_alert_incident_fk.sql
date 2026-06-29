-- Read-only-audit finding: damage_assessments.incident_id and alerts.incident_id had NO foreign key,
-- so rows could (and did, via E2E tests) point at non-existent incidents — surfacing as blank records
-- and inflating the Damage-Assessment "total" stat. The obvious test rows were removed already; here we
-- NULL any remaining dangling references and add the foreign keys so the integrity cannot drift again.
-- incident_id stays NULLABLE (a record survives, unlinked, if its incident is ever removed) — which is
-- exactly what the existing LEFT JOIN reads already tolerate.

update public.damage_assessments x set incident_id = null
 where x.incident_id is not null
   and not exists (select 1 from public.incidents i where i.id = x.incident_id);

update public.alerts x set incident_id = null
 where x.incident_id is not null
   and not exists (select 1 from public.incidents i where i.id = x.incident_id);

alter table public.damage_assessments
  add constraint fk_damage_assessments_incident
  foreign key (incident_id) references public.incidents (id) on delete set null;

alter table public.alerts
  add constraint fk_alerts_incident
  foreign key (incident_id) references public.incidents (id) on delete set null;
