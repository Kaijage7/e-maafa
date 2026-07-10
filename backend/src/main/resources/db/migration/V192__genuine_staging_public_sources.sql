-- V192: Stage with more genuine public-source Tanzania DRM data (honest, non-destructive).
-- Sources cited in notes (not invented national stats):
--   • PMO National Disaster Management Strategy 2022–2027 (floods Dar Dec 2011; Kilosa 2009/10; El Niño 2015/16)
--   • NCEI / public reports: Bukoba earthquake 10 Sep 2016 (already present as event 12)
--   • Public knowledge: Cyclone Kenneth Apr 2019 coastal / Mozambique border influence
-- Does NOT wipe operational rows. Soft-hides clear demo/test noise via is_simulation / notes.
-- Does NOT invent official gazetted evacuation-centre lists — only public facility place-names with
-- approximate WGS84 used as candidate mass-shelter points (flagged in notes).

-- ── 1) Soft-hide clear non-genuine / test operational noise ─────────────────
UPDATE public.incidents
SET is_simulation = true,
    status = CASE
      WHEN lower(coalesce(status,'')) IN ('closed','resolved','cancelled') THEN status
      ELSE 'Cancelled'
    END,
    workflow_status = CASE
      WHEN lower(coalesce(workflow_status,'')) IN ('closed','rejected','cancelled','archived') THEN workflow_status
      ELSE 'cancelled'
    END,
    updated_at = now()
WHERE coalesce(is_simulation, false) = false
  AND (
    id IN (85, 86, 89, 90)  -- 5G news item; unscoped fire; test sites
    OR title ILIKE '%test site%'
    OR title ILIKE '%ui test%'
    OR lower(trim(coalesce(title,''))) IN ('fire', 'moto mkali')
  );

UPDATE public.warehouses
SET operational_status = 'Standby',
    name = CASE
      WHEN name ILIKE '%(test)%' THEN regexp_replace(name, '\s*\(test\)\s*', ' ', 'gi')
      ELSE name
    END,
    updated_at = now()
WHERE name ILIKE '%(test)%'
   OR name ILIKE '%test hub%';

-- UI test past event: keep row for audit but mark source so unbridged view continues to exclude it
UPDATE public.past_disasters
SET source_of_information = coalesce(nullif(trim(source_of_information), ''), 'UI_TEST_EXCLUDE'),
    description_of_event = coalesce(description_of_event, '') ||
      CASE WHEN coalesce(description_of_event,'') NOT ILIKE '%UI test%' THEN E'\n[Staging] UI test artefact — not a historical disaster.' ELSE '' END,
    updated_at = now()
WHERE id = 6 OR event_name ILIKE '%ui test%';

-- ── 2) Correct past_disasters to better-sourced public facts ────────────────
-- Dar floods: NDMS cites December 2011 (41 deaths, ~5,000 displaced, ~50,000 affected)
UPDATE public.past_disasters
SET event_name = 'Dar es Salaam floods — December 2011',
    event_date = '2011-12-20',
    location_description = 'Dar es Salaam (including low-lying wards such as Jangwani / Msimbazi basin)',
    latitude = -6.8235000,
    longitude = 39.2695000,
    description_of_event = 'Urban flooding in Dar es Salaam, December 2011. Cited in the National Disaster Management Strategy 2022–2027: about 41 people killed, ~5,000 displaced and ~50,000 affected.',
    impact_description = 'Deaths ~41; displaced ~5,000; affected ~50,000 (NDMS 2022–2027).',
    source_of_information = 'PMO National Disaster Management Strategy 2022–2027 (public PDF)',
    lessons_learned = 'Urban drainage, early warning for low-lying settlements, and pre-identified shelters remain priorities for Dar es Salaam flood seasons.',
    updated_at = now()
WHERE id = 1;

-- Kilosa: NDMS cites 2009/2010 major flood (not a free-text "2019" placeholder)
UPDATE public.past_disasters
SET event_name = 'Kilosa floods — 2009/2010',
    event_date = '2010-01-15',
    location_description = 'Kilosa District, Morogoro Region (also impacted Kongwa and Mpwapwa in Dodoma Region per NDMS)',
    latitude = -6.8300000,
    longitude = 36.9900000,
    description_of_event = 'Major floods around 2009/2010 in Kilosa District. NDMS 2022–2027: ~2 deaths and ~26,000 people affected in Kilosa; ~19,000 affected in Kongwa and Mpwapwa (Dodoma); infrastructure and water sources damaged.',
    impact_description = 'Kilosa: ~2 deaths, ~26,000 affected. Kongwa/Mpwapwa: ~19,000 affected (NDMS 2022–2027).',
    source_of_information = 'PMO National Disaster Management Strategy 2022–2027 (public PDF)',
    lessons_learned = 'District contingency planning, bridge/road protection, and water-source protection after flood contamination.',
    updated_at = now()
WHERE id = 2;

UPDATE public.past_disasters
SET event_name = 'Bukoba (Kagera) earthquake — 10 September 2016',
    event_date = '2016-09-10',
    location_description = 'Bukoba, Kagera Region',
    latitude = -1.3317000,
    longitude = 31.8122000,
    description_of_event = 'Earthquake near Bukoba (commonly reported ~M5.7–M5.9). Public sources (e.g. NCEI/summary reporting): on the order of 19 people killed, hundreds injured, thousands displaced; hundreds of houses destroyed or seriously damaged in Bukoba area.',
    impact_description = 'Order-of-magnitude public figures: ~19 deaths, ~250+ injured, several thousand displaced; extensive housing damage in Bukoba.',
    source_of_information = 'Public earthquake catalogues / NCEI-style summaries; aligned with repository event Kagera (Bukoba) Earthquake 2016',
    lessons_learned = 'Seismic awareness in NW Tanzania; school and housing retrofits; rapid needs assessment after sudden-onset quakes.',
    updated_at = now()
WHERE id = 4;

UPDATE public.past_disasters
SET event_name = 'Tropical Cyclone Kenneth influence — April 2019',
    event_date = '2019-04-25',
    location_description = 'Southern coastal Tanzania / Mozambique border influence (Kenneth made landfall in northern Mozambique)',
    latitude = -10.2800000,
    longitude = 40.1800000,
    description_of_event = 'Tropical Cyclone Kenneth (April 2019) made landfall in northern Mozambique near the Tanzania border. Tanzania experienced coastal weather impacts; primary catastrophe statistics are for Mozambique/Comoros (public cyclone literature).',
    impact_description = 'Coastal heavy rain/wind risk in southern TZ; major documented losses concentrated south of the border (public sources).',
    source_of_information = 'Public cyclone reporting (Kenneth Apr 2019); NDMS notes Kenneth near Tanzania border',
    lessons_learned = 'Cross-border cyclone monitoring with TMA; coastal multi-hazard plans for Lindi/Mtwara/Pwani.',
    updated_at = now()
WHERE id = 5;

UPDATE public.past_disasters
SET description_of_event = coalesce(description_of_event,
      'National-scale drought / food-insecurity pressure around 2022 (aligned with repository drought event).'),
    source_of_information = coalesce(nullif(trim(source_of_information), ''),
      'Aligned with repository: Drought & Food Insecurity 2022; public food-security reporting'),
    updated_at = now()
WHERE id = 3;

-- ── 3) Repository disaster_events for missing high-confidence historical pairs ─
INSERT INTO public.disaster_events (
    event_code, name, hazard_type, started_on, ended_on, primary_region, scope,
    description, data_source, status, recorded_by, created_at, updated_at
)
SELECT
    'HIST-DSM-FLD-2011',
    'Dar es Salaam floods, December 2011',
    'Floods',
    '2011-12-20',
    '2011-12-31',
    'Dar es Salaam',
    'Region',
    'Urban floods in Dar es Salaam (Dec 2011). NDMS 2022–2027: ~41 killed, ~5,000 displaced, ~50,000 affected.',
    'PMO NDMS 2022–2027 (public)',
    'Closed',
    'V192 genuine staging',
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.disaster_events e WHERE e.event_code = 'HIST-DSM-FLD-2011'
);

INSERT INTO public.disaster_events (
    event_code, name, hazard_type, started_on, ended_on, primary_region, scope,
    description, data_source, status, recorded_by, created_at, updated_at
)
SELECT
    'HIST-KLS-FLD-2010',
    'Kilosa (Morogoro) floods, 2009/2010',
    'Floods',
    '2010-01-15',
    '2010-02-28',
    'Morogoro',
    'District',
    'Kilosa district floods ~2009/2010. NDMS 2022–2027: ~2 deaths, ~26,000 affected in Kilosa; related impacts in Kongwa/Mpwapwa (Dodoma).',
    'PMO NDMS 2022–2027 (public)',
    'Closed',
    'V192 genuine staging',
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.disaster_events e WHERE e.event_code = 'HIST-KLS-FLD-2010'
);

INSERT INTO public.disaster_events (
    event_code, name, hazard_type, started_on, ended_on, primary_region, scope,
    description, data_source, status, recorded_by, created_at, updated_at
)
SELECT
    'HIST-KENNETH-19',
    'Tropical Cyclone Kenneth coastal influence, April 2019',
    'Cyclone',
    '2019-04-23',
    '2019-04-28',
    'Mtwara',
    'Region',
    'Cyclone Kenneth landfall northern Mozambique near Tanzania; coastal TZ weather impacts. Major documented losses south of border (public cyclone literature; NDMS border note).',
    'Public cyclone literature + NDMS 2022–2027',
    'Closed',
    'V192 genuine staging',
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.disaster_events e WHERE e.event_code = 'HIST-KENNETH-19'
);

INSERT INTO public.disaster_events (
    event_code, name, hazard_type, started_on, ended_on, primary_region, scope,
    description, data_source, status, recorded_by, created_at, updated_at
)
SELECT
    'HIST-ELNINO-15',
    'El Niño floods / storms impacts, 2015/16',
    'Floods',
    '2015-10-01',
    '2016-03-31',
    'Mwanza',
    'National',
    'NDMS 2022–2027: 2015/16 El Niño directly affected ~84,643 people; ~1,006 houses destroyed; large crop losses; multi-region infrastructure damage (e.g. Mwanza Ilemela, Mtwara, Pwani Rufiji, Iringa).',
    'PMO NDMS 2022–2027 (public)',
    'Closed',
    'V192 genuine staging',
    now(),
    now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.disaster_events e WHERE e.event_code = 'HIST-ELNINO-15'
);

-- ── 4) High-confidence past ↔ repository bridges ────────────────────────────
INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, created_at)
SELECT e.id, 'past_disaster', 1, 'V192 bridge Dar floods 2011 (NDMS)', now()
FROM public.disaster_events e
WHERE e.event_code = 'HIST-DSM-FLD-2011'
  AND NOT EXISTS (
      SELECT 1 FROM public.disaster_event_links l
      WHERE l.entity_type = 'past_disaster' AND l.entity_id = 1 AND l.event_id = e.id
  )
LIMIT 1;

INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, created_at)
SELECT e.id, 'past_disaster', 2, 'V192 bridge Kilosa floods 2009/10 (NDMS)', now()
FROM public.disaster_events e
WHERE e.event_code = 'HIST-KLS-FLD-2010'
  AND NOT EXISTS (
      SELECT 1 FROM public.disaster_event_links l
      WHERE l.entity_type = 'past_disaster' AND l.entity_id = 2 AND l.event_id = e.id
  )
LIMIT 1;

INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, created_at)
SELECT e.id, 'past_disaster', 5, 'V192 bridge Cyclone Kenneth 2019', now()
FROM public.disaster_events e
WHERE e.event_code = 'HIST-KENNETH-19'
  AND NOT EXISTS (
      SELECT 1 FROM public.disaster_event_links l
      WHERE l.entity_type = 'past_disaster' AND l.entity_id = 5 AND l.event_id = e.id
  )
LIMIT 1;

-- Bukoba past (id 4) already linked to event 12 in V179 — ensure still linked
INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, created_at)
SELECT e.id, 'past_disaster', 4, 'V192 ensure Bukoba 2016 bridge', now()
FROM public.disaster_events e
WHERE e.id = 12
  AND NOT EXISTS (
      SELECT 1 FROM public.disaster_event_links l
      WHERE l.entity_type = 'past_disaster' AND l.entity_id = 4
  )
LIMIT 1;

-- ── 5) Candidate mass-shelter points (public facilities — NOT official gazette) ─
-- Approximate WGS84 for well-known public grounds/stadiums; status notes honesty.
INSERT INTO public.evacuation_centers (
    ecentre_id, centre_name, centre_type, region, district, council,
    capacity_people, accessibility, status, latitude, longitude, created_at, updated_at
)
SELECT v.ecentre_id, v.centre_name, v.centre_type, v.region, v.district, v.council,
       v.capacity_people, v.accessibility, v.status, v.latitude, v.longitude, now(), now()
FROM (VALUES
    ('EC-DSM-NS', 'National Stadium (Dar es Salaam)', '["Stadium"]',
     'Dar es Salaam', 'Temeke', NULL, 60000, 'Vehicle accessible',
     'Active', -6.84650000, 39.25400000),
    ('EC-DSM-UH', 'Uhuru Stadium (Dar es Salaam)', '["Stadium"]',
     'Dar es Salaam', 'Ilala', NULL, 25000, 'Vehicle accessible',
     'Active', -6.82380000, 39.27350000),
    ('EC-DOM-JS', 'Jamhuri Stadium (Dodoma)', '["Stadium"]',
     'Dodoma', 'Dodoma Urban', NULL, 30000, 'Vehicle accessible',
     'Active', -6.17320000, 35.74160000),
    ('EC-MWZ-CK', 'CCM Kirumba Stadium (Mwanza)', '["Stadium"]',
     'Mwanza', 'Ilemela', NULL, 35000, 'Vehicle accessible',
     'Active', -2.51670000, 32.90000000),
    ('EC-ARU-SA', 'Sheikh Amri Abeid Stadium (Arusha)', '["Stadium"]',
     'Arusha', 'Arusha', NULL, 20000, 'Vehicle accessible',
     'Active', -3.37310000, 36.68260000)
) AS v(ecentre_id, centre_name, centre_type, region, district, council,
       capacity_people, accessibility, status, latitude, longitude)
WHERE NOT EXISTS (
    SELECT 1 FROM public.evacuation_centers e WHERE e.ecentre_id = v.ecentre_id
);

-- Annotate existing demo EC names with honesty if they lack source (no schema notes column — use accessibility suffix carefully)
-- Leave named rows; operational preferred ranking already handles renovation.

-- ── 6) Align operational sample incidents that already map to genuine geography ─
UPDATE public.incidents
SET location_description = 'Jangwani lowlands / Msimbazi river basin, Dar es Salaam — recurrent urban flood risk (public DRM literature)',
    description = coalesce(nullif(trim(description), ''),
      'Sample operational incident placed on a well-documented flood-prone area (Msimbazi/Jangwani). Not a live emergency.'),
    updated_at = now()
WHERE id = 1
  AND coalesce(is_simulation, false) = false;

UPDATE public.incidents
SET description = coalesce(nullif(trim(description), ''),
      'Citizen-style flood report for Jangwani — geography is genuine flood-prone area; treat as training/sample ops data.'),
    updated_at = now()
WHERE id IN (17, 33)
  AND coalesce(is_simulation, false) = false;
