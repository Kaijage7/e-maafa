-- R11b corrective: anticipatory (forecast-triggered) activations seed DRF lanes
-- BEFORE any incident exists; the lanes attach to the incident on impact
-- confirmation. V30 made response_activations.incident_id nullable — the lane
-- table needs the same.
alter table public.incident_tasks alter column incident_id drop not null;
