-- space02 residual cleanup (honest, non-destructive):
-- 1) Stamp zonal warehouses with region_id from city_or_region → regions.name
-- 2) Backfill locatable incidents missing area (leave unscoped free-text drafts)
-- 3) Link geo_name_aliases.inform_area_code via deterministic name match
-- 4) High-confidence past_disasters ↔ disaster_events bridges only
-- 5) Align terminal status dual-truth (Closed/Resolved with open workflow)
-- 6) Integrity views for dual-truth + unbridged past events

-- ── 1) Warehouse area stamps (city_or_region → region) ───────────────────────
UPDATE public.warehouses w
SET region_id = r.id,
    updated_at = now()
FROM public.regions r
WHERE w.region_id IS NULL
  AND w.city_or_region IS NOT NULL
  AND lower(trim(w.city_or_region)) = lower(trim(r.name));

-- ── 2) Incidents missing area (known locatable cases only — no invented areas) ─
-- Impact confirmation cyclone: multi-region list in location_description JSON → first region Mtwara
UPDATE public.incidents
SET region_id = (SELECT id FROM public.regions WHERE lower(name) = 'mtwara' LIMIT 1),
    region_name = 'Mtwara',
    location_description = 'Mtwara, Lindi, Pwani (multi-region impact confirmation)',
    updated_at = now()
WHERE id = 9
  AND region_id IS NULL AND district_id IS NULL;

-- Public hazard report Jangwani → Ilala, Dar es Salaam
UPDATE public.incidents
SET region_id = 7,
    district_id = 1960,
    region_name = 'Dar es Salaam',
    district_name = 'Ilala',
    location_description = 'Jangwani, Ilala, Dar es Salaam',
    updated_at = now()
WHERE id = 17
  AND region_id IS NULL AND district_id IS NULL;

-- Moto Mkali (id 86): location is unusable ("fire") — leave unscoped; integrity view tracks it.
-- Do NOT invent a region for free-text with no geography.

-- ── 3) geo_name_aliases → INFORM area codes (deterministic, district preferred) ─
-- Via districts.name when district_id is set
UPDATE public.geo_name_aliases g
SET inform_area_code = m.code,
    updated_at = now()
FROM (
    SELECT DISTINCT ON (g2.id)
           g2.id AS alias_id,
           ia.code
    FROM public.geo_name_aliases g2
    JOIN public.districts d ON d.id = g2.district_id
    JOIN public.inform_area ia ON ia.level IN ('district', 'council')
      AND (
        lower(trim(ia.name)) = lower(trim(d.name))
        OR lower(trim(regexp_replace(
             regexp_replace(ia.name, '\s+(District|Municipal|Municipality|Town|Urban|Council|City|DC|TC|MC)$', '', 'i'),
             '[^a-zA-Z0-9]+', ' ', 'g')))
           = lower(trim(regexp_replace(
             regexp_replace(d.name, '\s+(District|Municipal|Municipality|Town|Urban|Council|City|DC|TC|MC)$', '', 'i'),
             '[^a-zA-Z0-9]+', ' ', 'g')))
      )
    WHERE g2.inform_area_code IS NULL
    ORDER BY g2.id,
             CASE WHEN ia.level = 'district' THEN 0 ELSE 1 END,
             ia.code
) m
WHERE g.id = m.alias_id
  AND g.inform_area_code IS NULL;

-- Via normalized_name (district preferred)
UPDATE public.geo_name_aliases g
SET inform_area_code = m.code,
    updated_at = now()
FROM (
    SELECT DISTINCT ON (g2.id)
           g2.id AS alias_id,
           ia.code
    FROM public.geo_name_aliases g2
    JOIN public.inform_area ia ON ia.level IN ('district', 'council')
      AND lower(trim(regexp_replace(
            regexp_replace(ia.name, '\s+(District|Municipal|Municipality|Town|Urban|Council|City|DC|TC|MC)$', '', 'i'),
            '[^a-zA-Z0-9]+', ' ', 'g')))
          = g2.normalized_name
    WHERE g2.inform_area_code IS NULL
    ORDER BY g2.id,
             CASE WHEN ia.level = 'district' THEN 0 ELSE 1 END,
             ia.code
) m
WHERE g.id = m.alias_id
  AND g.inform_area_code IS NULL;

-- Via exact alias_name
UPDATE public.geo_name_aliases g
SET inform_area_code = m.code,
    updated_at = now()
FROM (
    SELECT DISTINCT ON (g2.id)
           g2.id AS alias_id,
           ia.code
    FROM public.geo_name_aliases g2
    JOIN public.inform_area ia ON ia.level IN ('district', 'council')
      AND lower(trim(ia.name)) = lower(trim(g2.alias_name))
    WHERE g2.inform_area_code IS NULL
    ORDER BY g2.id,
             CASE WHEN ia.level = 'district' THEN 0 ELSE 1 END,
             ia.code
) m
WHERE g.id = m.alias_id
  AND g.inform_area_code IS NULL;

-- High-confidence manual residual aliases (historical renames / CBD urban centres)
UPDATE public.geo_name_aliases g
SET inform_area_code = v.code,
    notes = coalesce(g.notes, '') || CASE WHEN g.notes IS NULL OR g.notes = '' THEN '' ELSE '; ' END
            || 'V190 manual INFORM map: ' || v.reason,
    updated_at = now()
FROM (VALUES
    ('Arumeru',    'TZ0202', 'historical Arumeru → Meru district'),
    ('Chakechake', 'TZ5501', 'spelling Chakechake → Chake Chake'),
    ('Mpanda Cbd', 'TZ2301', 'CBD → Mpanda Urban'),
    ('Kigoma Cbd', 'TZ1604', 'CBD → Kigoma Urban'),
    ('Mbeya Cbd',  'TZ1208', 'CBD → Mbeya Urban'),
    ('Kibaha Cbd', 'TZ0607', 'CBD → Kibaha Urban'),
    ('Tabora Cbd', 'TZ1406', 'CBD → Tabora Urban')
) AS v(alias_name, code, reason)
WHERE lower(trim(g.alias_name)) = lower(trim(v.alias_name))
  AND g.inform_area_code IS NULL
  AND EXISTS (SELECT 1 FROM public.inform_area ia WHERE ia.code = v.code);

-- ── 4) past_disasters ↔ disaster_events bridges (high-confidence year+name only) ─
-- Already have Bukoba 2016 (V179).
-- Dar floods 2011 / Kilosa 2019 / Cyclone Kenneth 2019: no matching repository year row — leave unbridged.
-- Drought 2022 → Disaster & Food Insecurity 2022 (event 14 pattern)
INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, created_at)
SELECT e.id, 'past_disaster', p.id, 'V190 bridge drought 2022', now()
FROM public.past_disasters p
JOIN public.disaster_events e ON extract(year from e.started_on) = 2022
  AND (lower(coalesce(e.hazard_type,'')) LIKE '%drought%' OR lower(e.name) LIKE '%drought%')
WHERE p.id = 3
  AND NOT EXISTS (SELECT 1 FROM public.disaster_event_links l
                  WHERE l.entity_type='past_disaster' AND l.entity_id=p.id AND l.event_id=e.id)
ORDER BY e.id
LIMIT 1;

-- ── 5) Terminal status dual-truth repair (Closed/Resolved must close workflow) ─
UPDATE public.incidents
SET workflow_status = 'closed',
    updated_at = now()
WHERE coalesce(is_simulation, false) = false
  AND lower(coalesce(status, '')) IN ('closed', 'resolved', 'cancelled', 'closed_rumor')
  AND lower(coalesce(workflow_status, '')) NOT IN ('closed', 'rejected', 'cancelled', 'archived');

-- ── 6) Status dual-truth monitoring views ─────────────────────────────────────
CREATE OR REPLACE VIEW public.vw_integrity_incident_status_dual AS
SELECT i.id, i.title, i.status, i.workflow_status,
       CASE
         WHEN lower(coalesce(i.status,'')) IN ('closed','resolved','cancelled','closed_rumor')
              AND lower(coalesce(i.workflow_status,'')) NOT IN ('closed','rejected','cancelled','archived')
           THEN 'closed_status_open_workflow'
         WHEN lower(coalesce(i.workflow_status,'')) = 'approved'
              AND lower(coalesce(i.status,'')) IN ('reported','draft','submitted')
           THEN 'approved_workflow_early_status'
         WHEN lower(coalesce(i.workflow_status,'')) = 'draft'
              AND lower(coalesce(i.status,'')) IN ('active response','verified')
           THEN 'draft_workflow_active_status'
         ELSE 'ok'
       END AS dual_flag
FROM public.incidents i
WHERE coalesce(i.is_simulation, false) = false;

CREATE OR REPLACE VIEW public.vw_integrity_past_without_repository AS
SELECT p.id, p.event_name, p.event_date
FROM public.past_disasters p
WHERE NOT EXISTS (
  SELECT 1 FROM public.disaster_event_links l
  WHERE l.entity_type = 'past_disaster' AND l.entity_id = p.id
)
AND lower(coalesce(p.event_name,'')) NOT LIKE '%ui test%';

-- Refresh summary view to include new metrics.
-- DROP first: CREATE OR REPLACE cannot reorder/rename columns when inserting new metrics mid-list.
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
    (SELECT count(*) FROM public.integration_messages WHERE status IN ('failed','retry')) AS integration_failures,
    (SELECT count(*) FROM public.vw_integrity_incident_status_dual WHERE dual_flag <> 'ok') AS incident_status_dual_flags,
    (SELECT count(*) FROM public.vw_integrity_past_without_repository) AS past_disasters_unbridged,
    now() AS generated_at;
