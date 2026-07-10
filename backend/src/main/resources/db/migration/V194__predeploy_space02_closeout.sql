-- V194: Pre-deploy space02 closeout (honest, non-destructive).
-- Closes remaining closeable DBA residuals before country cutover:
--   • POLY-01 soft integrity for disaster_event_links orphans
--   • Deactivate UI-test hazards (keep rows for audit)
--   • Soft-mark UI-test past disaster so operators never treat as history
--   • Expand vw_integrity_summary with poly + HIST/genuine counters
-- Does NOT invent national live integrations or production certificate.

-- ── 1) Deactivate UI / staging-only hazards ──────────────────────────────────
UPDATE public.hazards
SET is_active = false,
    updated_at = now()
WHERE (name ILIKE 'UI Test Hazard%' OR name ILIKE '%[staging exclude]%')
  AND coalesce(is_active, true) = true;

-- ── 2) Soft-mark UI test past disaster (already sourced UI_TEST_EXCLUDE) ─────
UPDATE public.past_disasters
SET event_name = CASE
      WHEN event_name NOT ILIKE '[EXCLUDE]%' THEN '[EXCLUDE] ' || event_name
      ELSE event_name
    END,
    source_of_information = 'UI_TEST_EXCLUDE',
    description_of_event = coalesce(description_of_event, '') ||
      CASE WHEN coalesce(description_of_event, '') NOT ILIKE '%not a historical disaster%'
           THEN E'\n[Staging] UI test artefact — not a historical disaster; excluded from genuine history counts.'
           ELSE '' END,
    updated_at = now()
WHERE id = 6
   OR event_name ILIKE '%ui test%'
   OR source_of_information ILIKE 'UI_TEST%';

-- ── 3) POLY-01: soft integrity for disaster_event_links orphans ──────────────
CREATE OR REPLACE VIEW public.vw_integrity_poly_link_orphans AS
SELECT l.id AS link_id,
       l.event_id,
       l.entity_type,
       l.entity_id,
       l.note,
       l.created_at
FROM public.disaster_event_links l
WHERE
  (l.entity_type = 'past_disaster'
    AND NOT EXISTS (SELECT 1 FROM public.past_disasters p WHERE p.id = l.entity_id))
  OR (l.entity_type = 'incident'
    AND NOT EXISTS (SELECT 1 FROM public.incidents i WHERE i.id = l.entity_id))
  OR (l.entity_type = 'damage_assessment'
    AND NOT EXISTS (SELECT 1 FROM public.damage_assessments d WHERE d.id = l.entity_id))
  OR (l.entity_type IN ('early_warning', 'warning')
    AND NOT EXISTS (SELECT 1 FROM public.early_warnings e WHERE e.id = l.entity_id)
    AND NOT EXISTS (SELECT 1 FROM public.warnings w WHERE w.id = l.entity_id))
  OR (l.entity_type = 'threat'
    AND NOT EXISTS (SELECT 1 FROM public.threats t WHERE t.id = l.entity_id))
  OR (l.entity_type IS NULL OR trim(l.entity_type) = '');

-- Also flag links whose parent disaster_event is missing
CREATE OR REPLACE VIEW public.vw_integrity_poly_event_orphans AS
SELECT l.id AS link_id, l.event_id, l.entity_type, l.entity_id, l.created_at
FROM public.disaster_event_links l
WHERE NOT EXISTS (SELECT 1 FROM public.disaster_events e WHERE e.id = l.event_id);

-- ── 4) Refresh integrity summary (DBA-2 expanded for pre-deploy board) ───────
-- PostgreSQL CREATE OR REPLACE cannot append columns mid-list — drop first.
DROP VIEW IF EXISTS public.vw_integrity_summary;
CREATE VIEW public.vw_integrity_summary AS
SELECT
    (SELECT count(*) FROM public.vw_integrity_orphan_allocations) AS orphan_allocations,
    (SELECT count(*) FROM public.vw_integrity_orphan_stock_movements) AS orphan_stock_movements,
    (SELECT count(*) FROM public.vw_integrity_incidents_missing_area) AS incidents_missing_area,
    (SELECT count(*) FROM public.vw_integrity_warehouses_unscoped) AS warehouses_national_or_unscoped,
    (SELECT count(*) FROM public.geo_name_aliases) AS geo_aliases,
    (SELECT count(*) FROM public.geo_name_aliases WHERE inform_area_code IS NOT NULL) AS geo_aliases_with_inform,
    (SELECT count(*) FROM public.integration_endpoints) AS integration_endpoints,
    (SELECT count(*) FROM public.integration_messages WHERE status IN ('failed', 'retry')) AS integration_failures,
    (SELECT count(*) FROM public.vw_integrity_incident_status_dual WHERE dual_flag <> 'ok') AS incident_status_dual_flags,
    (SELECT count(*) FROM public.vw_integrity_past_without_repository) AS past_disasters_unbridged,
    (SELECT count(*) FROM public.vw_integrity_poly_link_orphans) AS poly_link_orphans,
    (SELECT count(*) FROM public.vw_integrity_poly_event_orphans) AS poly_event_orphans,
    (SELECT count(*) FROM public.past_disasters
      WHERE coalesce(source_of_information, '') NOT ILIKE 'UI_TEST%'
        AND event_name NOT ILIKE '%ui test%'
        AND event_name NOT ILIKE '[EXCLUDE]%') AS past_disasters_genuine,
    (SELECT count(*) FROM public.disaster_events WHERE event_code LIKE 'HIST-%') AS hist_repository_events,
    (SELECT count(*) FROM public.evacuation_centers) AS evacuation_centers,
    now() AS generated_at;

-- ── 5) Ensure past_without_repository still excludes UI/EXCLUDE artefacts ────
CREATE OR REPLACE VIEW public.vw_integrity_past_without_repository AS
SELECT p.id, p.event_name, p.event_date
FROM public.past_disasters p
WHERE NOT EXISTS (
        SELECT 1 FROM public.disaster_event_links l
        WHERE l.entity_type = 'past_disaster' AND l.entity_id = p.id
      )
  AND lower(coalesce(p.event_name, '')) NOT LIKE '%ui test%'
  AND p.event_name NOT ILIKE '[EXCLUDE]%'
  AND coalesce(p.source_of_information, '') NOT ILIKE 'UI_TEST%';
