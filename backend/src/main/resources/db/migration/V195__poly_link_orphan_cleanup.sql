-- V195: POLY-01 closeout — remove soft-link rows whose target entity no longer exists.
-- Honest cleanup only; does not invent replacement targets.

DELETE FROM public.disaster_event_links l
WHERE l.id IN (SELECT link_id FROM public.vw_integrity_poly_link_orphans);

DELETE FROM public.disaster_event_links l
WHERE l.id IN (SELECT link_id FROM public.vw_integrity_poly_event_orphans);
