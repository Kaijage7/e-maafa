-- F41: keep repository analytics vocabulary stable.
-- Region quality is handled in SendaiAnalyticsService because national-scope effects
-- are valid for national targets but must not be presented as regional priorities.
update public.disaster_events e
set hazard_type = 'Floods',
    hazard_id = coalesce((select h.id from public.hazards h where lower(h.name) = 'floods' limit 1), e.hazard_id),
    updated_at = now()
where lower(coalesce(e.hazard_type, '')) = 'flood';
