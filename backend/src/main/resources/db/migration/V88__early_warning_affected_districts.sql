-- Carry the warning's district down to the public read model so the portal map can colour the specific
-- district(s) instead of flooding the whole region. warning_hazards already captures district_id; this is
-- the published projection of it. Region-level warnings leave this null (the map then colours the region).
alter table public.early_warnings add column if not exists affected_districts text;
