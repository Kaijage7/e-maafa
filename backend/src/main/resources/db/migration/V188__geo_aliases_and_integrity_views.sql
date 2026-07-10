-- space02 DBA-1.2 geo name dictionary + DBA-2 integrity monitoring views (read-only, non-breaking).

CREATE TABLE IF NOT EXISTS public.geo_name_aliases (
    id              BIGSERIAL PRIMARY KEY,
    alias_name      VARCHAR(200) NOT NULL,
    normalized_name VARCHAR(200) NOT NULL,
    region_id       BIGINT REFERENCES public.regions(id) ON DELETE SET NULL,
    district_id     BIGINT REFERENCES public.districts(id) ON DELETE SET NULL,
    council_id      BIGINT REFERENCES public.councils(id) ON DELETE SET NULL,
    inform_area_code VARCHAR(40),
    source          VARCHAR(40) NOT NULL DEFAULT 'manual', -- manual|gadm|ew|inform|seed
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_geo_name_aliases_district_seed
    ON public.geo_name_aliases (district_id)
    WHERE district_id IS NOT NULL AND source = 'seed';

CREATE INDEX IF NOT EXISTS ix_geo_name_aliases_norm
    ON public.geo_name_aliases (normalized_name);

CREATE INDEX IF NOT EXISTS ix_geo_name_aliases_district
    ON public.geo_name_aliases (district_id);

-- Seed aliases from districts.name (canonical) for future EW/INFORM matching.
INSERT INTO public.geo_name_aliases (alias_name, normalized_name, region_id, district_id, source)
SELECT d.name,
       lower(trim(regexp_replace(
           regexp_replace(d.name, '\s+(District|Municipal|Municipality|Town|Urban|Council|City|DC|TC|MC)$', '', 'i'),
           '[^a-zA-Z0-9]+', ' ', 'g'))),
       d.region_id,
       d.id,
       'seed'
FROM public.districts d
WHERE d.name IS NOT NULL AND trim(d.name) <> ''
  AND NOT EXISTS (
        SELECT 1 FROM public.geo_name_aliases g
        WHERE g.district_id = d.id AND g.source = 'seed'
      );

-- ── DBA-2 integrity views (reporting only; do not block writes) ───────────────

CREATE OR REPLACE VIEW public.vw_integrity_orphan_allocations AS
SELECT ar.id AS allocation_id, ar.incident_id, ar.status, ar.created_at
FROM public.allocated_resources ar
LEFT JOIN public.incidents i ON i.id = ar.incident_id
WHERE ar.incident_id IS NOT NULL AND i.id IS NULL;

CREATE OR REPLACE VIEW public.vw_integrity_orphan_stock_movements AS
SELECT sm.id AS movement_id, sm.incident_id, sm.allocation_id, sm.created_at
FROM public.stock_movements sm
LEFT JOIN public.incidents i ON i.id = sm.incident_id
WHERE sm.incident_id IS NOT NULL AND i.id IS NULL;

CREATE OR REPLACE VIEW public.vw_integrity_incidents_missing_area AS
SELECT i.id, i.title, i.status, i.workflow_status, i.region_id, i.district_id, i.region_name, i.district_name
FROM public.incidents i
WHERE coalesce(i.is_simulation, false) = false
  AND i.region_id IS NULL
  AND i.district_id IS NULL
  AND coalesce(trim(i.region_name), '') = ''
  AND coalesce(trim(i.district_name), '') = '';

CREATE OR REPLACE VIEW public.vw_integrity_warehouses_unscoped AS
SELECT w.id, w.name, w.zone, w.region_id, w.district_id, w.operational_status
FROM public.warehouses w
WHERE w.region_id IS NULL AND w.district_id IS NULL;

CREATE OR REPLACE VIEW public.vw_integrity_summary AS
SELECT
    (SELECT count(*) FROM public.vw_integrity_orphan_allocations) AS orphan_allocations,
    (SELECT count(*) FROM public.vw_integrity_orphan_stock_movements) AS orphan_stock_movements,
    (SELECT count(*) FROM public.vw_integrity_incidents_missing_area) AS incidents_missing_area,
    (SELECT count(*) FROM public.vw_integrity_warehouses_unscoped) AS warehouses_national_or_unscoped,
    (SELECT count(*) FROM public.geo_name_aliases) AS geo_aliases,
    (SELECT count(*) FROM public.integration_endpoints) AS integration_endpoints,
    (SELECT count(*) FROM public.integration_messages WHERE status IN ('failed','retry')) AS integration_failures,
    now() AS generated_at;
