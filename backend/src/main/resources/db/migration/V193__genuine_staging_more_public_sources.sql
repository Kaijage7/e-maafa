-- V193: More genuine public-source Tanzania DRM staging (honest, non-destructive, idempotent).
-- Sources (public; figures order-of-magnitude as reported — not invented national stats):
--   • FloodList / ECHO Daily Flash: Dar es Salaam flash floods 13–15 Oct 2020 (~12 deaths, Ilala/Kinondoni/Msimbazi)
--   • ReliefWeb ECHO Daily Flash 5 Dec 2023 / public media: Hanang (Katesh) floods & landslides 3 Dec 2023
--       (~63 deaths, ~116 injured as of early Dec reporting; later academic notes higher landslide tolls)
--   • National Audit Office Tanzania "Floods Management at Babati" (2011 PDF): Lake Babati floods Apr 1990
--       (documented inundation of Babati town; no official death toll asserted here)
--   • FloodList (via multi-source summaries): Apr 2020 floods/mudslides Arusha & Kilimanjaro (Arumeru, Hai, Moshi)
--   • EM-DAT 2023 report (CRED): United Republic of Tanzania flood impacts ~2.9 million people (2023 season aggregate)
--   • Stadiums: public venue knowledge (Amaan Zanzibar ~15k; Sokoine Mbeya ~20k; Kambarage Shinyanga ~30k)
--       — candidate mass-shelter points ONLY, NOT official gazetted evacuation centres
-- Does NOT wipe operational rows. Soft-hides residual UI-test hazards. Integrity bridges required for past rows.

-- ── 0) Soft-hide residual UI-test hazards (demo noise) ───────────────────────
UPDATE public.hazards
SET name = CASE
      WHEN name NOT ILIKE '%[staging exclude]%' THEN name || ' [staging exclude]'
      ELSE name
    END
WHERE name ILIKE 'UI Test Hazard%'
  AND name NOT ILIKE '%[staging exclude]%';

-- Align National Stadium row coords to public Benjamin Mkapa Stadium location if present
UPDATE public.evacuation_centers
SET latitude = -6.8536000,
    longitude = 39.2738000,
    centre_name = CASE
      WHEN centre_name ILIKE '%Benjamin Mkapa%' THEN centre_name
      ELSE 'Benjamin Mkapa National Stadium (Dar es Salaam)'
    END,
    updated_at = now()
WHERE ecentre_id = 'EC-DSM-NS';

-- ── 1) past_disasters — new high-confidence historical rows ──────────────────
INSERT INTO public.past_disasters (
    event_name, event_date, location_description, latitude, longitude, hazard_id,
    description_of_event, impact_description, lessons_learned, source_of_information,
    created_at, updated_at
)
SELECT
    'Dar es Salaam flash floods — October 2020',
    '2020-10-13',
    'Dar es Salaam — Ilala and Kinondoni districts; Msimbazi valley / low-lying wards',
    -6.8167000,
    39.2800000,
    1,
    'Heavy rain from ~13 October 2020 triggered flash floods in Dar es Salaam. Public reporting (FloodList; ECHO Daily Flash 19 Oct 2020 citing media/police): at least 12 people killed in Ilala and Kinondoni / Msimbazi valley; widespread urban inundation of flood-prone settlements.',
    'Deaths ~12 (Dar police / media as of mid-Oct 2020); significant urban flooding in low-lying wards (public sources).',
    'Neighbourhood disaster committees, pre-identified temporary shelters (e.g. Jangwani ward practice), and Msimbazi basin drainage remain central to Dar urban flood preparedness (World Bank community DRM notes).',
    'FloodList (Oct 2020); ECHO Daily Flash 19 Oct 2020 (ReliefWeb)',
    now(), now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.past_disasters p
    WHERE p.event_name = 'Dar es Salaam flash floods — October 2020'
       OR (p.event_date = '2020-10-13' AND p.location_description ILIKE '%Ilala%Kinondoni%')
);

INSERT INTO public.past_disasters (
    event_name, event_date, location_description, latitude, longitude, hazard_id,
    description_of_event, impact_description, lessons_learned, source_of_information,
    created_at, updated_at
)
SELECT
    'Hanang (Katesh) floods and landslides — December 2023',
    '2023-12-03',
    'Katesh area, Hanang District, Manyara Region (slopes of Mount Hanang)',
    -4.4300000,
    35.4000000,
    5,
    'On ~3 December 2023, torrential rains triggered flash floods and landslides in Hanang District (Katesh), Manyara Region. Public multi-source reporting: President and PM statements; ECHO Daily Flash 5 Dec 2023 (media) cited at least 63 deaths, ~116 injured, and missing persons in early December tallies. Peer-reviewed follow-up literature discusses higher landslide fatality counts for the same event cluster — figures here are presented as early public tallies, not a final official gazette.',
    'Early public tallies (ECHO/media ~5 Dec 2023): ≥63 deaths, ~116 injured; houses destroyed in Katesh area. Later scientific notes report higher landslide death tolls for 3 Dec 2023 Hanang event.',
    'Slope-hazard awareness on volcanic/mountain flanks; rapid search-and-rescue surge; multi-agency public health recovery after sudden-onset landslides (documented in post-event health response literature).',
    'ReliefWeb ECHO Daily Flash 5 Dec 2023; public media (PM Majaliwa / President statements Dec 2023)',
    now(), now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.past_disasters p
    WHERE p.event_name = 'Hanang (Katesh) floods and landslides — December 2023'
       OR (p.event_date = '2023-12-03' AND p.location_description ILIKE '%Hanang%')
);

INSERT INTO public.past_disasters (
    event_name, event_date, location_description, latitude, longitude, hazard_id,
    description_of_event, impact_description, lessons_learned, source_of_information,
    created_at, updated_at
)
SELECT
    'Lake Babati floods through Babati town — April 1990',
    '1990-04-15',
    'Babati town, Babati District, Manyara Region (Lake Babati overflow / inundation)',
    -4.2167000,
    35.7500000,
    1,
    'Documented historical inundation of Babati town by Lake Babati in April 1990 (National Audit Office Tanzania performance audit on flood management at Babati; also cited in limnology / water-balance literature). Floods also recorded in other years (e.g. 1964, 1998) at the same location. No precise official national death toll is asserted in this staging row.',
    'Significant inundation of Babati town streets and community assets (NAO Tanzania photo-documented 1990 event). Exact casualty figures not claimed here.',
    'Lake-level monitoring, drainage/channel maintenance after debris clogging (NAO findings), and local contingency planning for shallow-lake flood buffer loss.',
    'NAO Tanzania: Floods Management at Babati (public audit PDF, 2011)',
    now(), now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.past_disasters p
    WHERE p.event_name = 'Lake Babati floods through Babati town — April 1990'
       OR (p.event_date = '1990-04-15' AND p.location_description ILIKE '%Babati%')
);

INSERT INTO public.past_disasters (
    event_name, event_date, location_description, latitude, longitude, hazard_id,
    description_of_event, impact_description, lessons_learned, source_of_information,
    created_at, updated_at
)
SELECT
    'Arusha and Kilimanjaro floods / mudslides — April 2020',
    '2020-04-15',
    'Arumeru (Arusha); Hai and Moshi districts (Kilimanjaro) — northern Tanzania',
    -3.3700000,
    36.6800000,
    1,
    'Part of the broader 2020 East Africa flood season. Public FloodList-style reporting: floods and mudslides in Arusha and Kilimanjaro — fatalities reported in Arumeru; homes destroyed; Arusha–Moshi road disruption; thousands of households affected in Moshi/Hai districts (public summaries of April 2020 events).',
    'Public order-of-magnitude: multiple fatalities in northern regions; ≥2,700 households reported homeless in Moshi district in some summaries; road and housing damage (public sources).',
    'Northern highland flash-flood and mudslide preparedness; critical-road continuity planning on Arusha–Moshi corridor.',
    'FloodList / public summaries of Apr 2020 northern Tanzania floods (East Africa flood season)',
    now(), now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.past_disasters p
    WHERE p.event_name = 'Arusha and Kilimanjaro floods / mudslides — April 2020'
       OR (p.event_date = '2020-04-15' AND p.location_description ILIKE '%Arumeru%')
);

INSERT INTO public.past_disasters (
    event_name, event_date, location_description, latitude, longitude, hazard_id,
    description_of_event, impact_description, lessons_learned, source_of_information,
    created_at, updated_at
)
SELECT
    'Tanzania multi-region floods season — 2023 (aggregate)',
    '2023-11-01',
    'Multi-region: Arusha, Manyara (Hanang), Kigoma, Kagera, Coast/Pwani, Dar es Salaam, Zanzibar and others (short rains / El Niño period)',
    -6.2000000,
    35.7500000,
    1,
    '2023 short-rains / El Niño-associated flood and landslide season across multiple Tanzanian regions (ReliefWeb disaster FL-2023-000241-TZA and related updates). EM-DAT 2023 annual report (CRED) lists United Republic of Tanzania among top flood-impact countries with ~2.9 million people affected by flood events in 2023 (aggregate catalogue figure — not a single localised incident count). Includes the Hanang Dec 2023 peak event as a component.',
    'EM-DAT 2023 report: ~2.9 million people affected by floods in Tanzania (2023 catalogue aggregate). Localised peaks (e.g. Hanang) documented separately.',
    'National multi-region surge capacity; consolidated situation reporting; El Niño seasonal readiness for short rains.',
    'EM-DAT / CRED 2023 report; ReliefWeb FL-2023-000241-TZA',
    now(), now()
WHERE NOT EXISTS (
    SELECT 1 FROM public.past_disasters p
    WHERE p.event_name = 'Tanzania multi-region floods season — 2023 (aggregate)'
       OR (p.event_date = '2023-11-01' AND p.source_of_information ILIKE '%EM-DAT%')
);

-- Improve drought 2022 sourcing text (no invented stats)
UPDATE public.past_disasters
SET event_name = 'Tanzania drought and food-insecurity pressure — 2022',
    description_of_event = 'National-scale drought / food-insecurity pressure around 2022, aligned with repository drought event. Public food-security and DRM literature consistently list drought among Tanzania''s primary slow-onset hazards (NDMS 2022–2027 notes drought among major disaster causes 1997–2017). Specific national mortality/affected figures are not invented here — treat as contextual historical marker.',
    impact_description = 'Slow-onset drought / food-security stress (public DRM literature context; not a single-day casualty event).',
    source_of_information = 'Repository drought event 2022; NDMS 2022–2027 drought context; public food-security reporting',
    lessons_learned = 'Seasonal climate outlooks (TMA), agricultural contingency, and social-protection linkages for drought years.',
    updated_at = now()
WHERE id = 3;

-- ── 2) disaster_events repository rows (event_code ≤ 20 chars) ────────────────
INSERT INTO public.disaster_events (
    event_code, name, hazard_type, started_on, ended_on, primary_region, scope,
    description, data_source, status, recorded_by, created_at, updated_at
)
SELECT
    'HIST-DSM-FLD-2020',
    'Dar es Salaam flash floods, October 2020',
    'Floods',
    '2020-10-13',
    '2020-10-16',
    'Dar es Salaam',
    'Region',
    'Flash floods Ilala/Kinondoni/Msimbazi ~13–15 Oct 2020. Public sources: ~12 deaths (FloodList; ECHO Daily Flash).',
    'FloodList; ECHO Daily Flash 19 Oct 2020',
    'Closed',
    'V193 genuine staging',
    now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.disaster_events e WHERE e.event_code = 'HIST-DSM-FLD-2020');

INSERT INTO public.disaster_events (
    event_code, name, hazard_type, started_on, ended_on, primary_region, scope,
    description, data_source, status, recorded_by, created_at, updated_at
)
SELECT
    'HIST-HNG-LS-2023',
    'Hanang (Katesh) floods and landslides, December 2023',
    'Landslide',
    '2023-12-03',
    '2023-12-10',
    'Manyara',
    'District',
    'Hanang District Katesh floods/landslides ~3 Dec 2023. Early public tallies (ECHO 5 Dec 2023): ≥63 deaths, ~116 injured. Later literature notes higher landslide fatality counts.',
    'ReliefWeb ECHO Daily Flash 5 Dec 2023; public media',
    'Closed',
    'V193 genuine staging',
    now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.disaster_events e WHERE e.event_code = 'HIST-HNG-LS-2023');

INSERT INTO public.disaster_events (
    event_code, name, hazard_type, started_on, ended_on, primary_region, scope,
    description, data_source, status, recorded_by, created_at, updated_at
)
SELECT
    'HIST-BBT-FLD-1990',
    'Lake Babati floods, Babati town, April 1990',
    'Floods',
    '1990-04-01',
    '1990-04-30',
    'Manyara',
    'District',
    'Lake Babati inundation of Babati town April 1990 (NAO Tanzania Floods Management at Babati audit). Historical series also includes 1964, 1998 etc.',
    'NAO Tanzania Floods Management at Babati (2011 public PDF)',
    'Closed',
    'V193 genuine staging',
    now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.disaster_events e WHERE e.event_code = 'HIST-BBT-FLD-1990');

INSERT INTO public.disaster_events (
    event_code, name, hazard_type, started_on, ended_on, primary_region, scope,
    description, data_source, status, recorded_by, created_at, updated_at
)
SELECT
    'HIST-ARU-FLD-2020',
    'Arusha and Kilimanjaro floods/mudslides, April 2020',
    'Floods',
    '2020-04-01',
    '2020-04-30',
    'Arusha',
    'Region',
    'Northern highlands floods and mudslides April 2020 (Arumeru, Hai, Moshi). Public FloodList-style summaries within 2020 East Africa flood season.',
    'FloodList / public Apr 2020 northern Tanzania flood summaries',
    'Closed',
    'V193 genuine staging',
    now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.disaster_events e WHERE e.event_code = 'HIST-ARU-FLD-2020');

INSERT INTO public.disaster_events (
    event_code, name, hazard_type, started_on, ended_on, primary_region, scope,
    description, data_source, status, recorded_by, created_at, updated_at
)
SELECT
    'HIST-TZ-FLD-2023',
    'Tanzania multi-region floods season 2023 (aggregate)',
    'Floods',
    '2023-10-15',
    '2023-12-31',
    'Manyara',
    'National',
    '2023 multi-region flood/landslide season (ReliefWeb FL-2023-000241-TZA). EM-DAT 2023: ~2.9M people affected by floods in Tanzania (aggregate catalogue figure).',
    'EM-DAT CRED 2023 report; ReliefWeb FL-2023-000241-TZA',
    'Closed',
    'V193 genuine staging',
    now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.disaster_events e WHERE e.event_code = 'HIST-TZ-FLD-2023');

-- Drought bridge event if missing
INSERT INTO public.disaster_events (
    event_code, name, hazard_type, started_on, ended_on, primary_region, scope,
    description, data_source, status, recorded_by, created_at, updated_at
)
SELECT
    'HIST-DRT-2022',
    'Drought and food-insecurity pressure, 2022',
    'Drought',
    '2022-01-01',
    '2022-12-31',
    'Dodoma',
    'National',
    'Contextual national drought / food-security pressure marker for 2022 (aligned with repository drought event). No invented casualty totals.',
    'Repository drought 2022; NDMS 2022–2027 drought context',
    'Closed',
    'V193 genuine staging',
    now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.disaster_events e WHERE e.event_code = 'HIST-DRT-2022');

-- ── 3) Bridges past_disaster ↔ disaster_events ───────────────────────────────
INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, created_at)
SELECT e.id, 'past_disaster', p.id, 'V193 bridge Dar flash floods Oct 2020', now()
FROM public.disaster_events e
JOIN public.past_disasters p ON p.event_name = 'Dar es Salaam flash floods — October 2020'
WHERE e.event_code = 'HIST-DSM-FLD-2020'
  AND NOT EXISTS (
      SELECT 1 FROM public.disaster_event_links l
      WHERE l.entity_type = 'past_disaster' AND l.entity_id = p.id AND l.event_id = e.id
  );

INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, created_at)
SELECT e.id, 'past_disaster', p.id, 'V193 bridge Hanang Dec 2023', now()
FROM public.disaster_events e
JOIN public.past_disasters p ON p.event_name = 'Hanang (Katesh) floods and landslides — December 2023'
WHERE e.event_code = 'HIST-HNG-LS-2023'
  AND NOT EXISTS (
      SELECT 1 FROM public.disaster_event_links l
      WHERE l.entity_type = 'past_disaster' AND l.entity_id = p.id AND l.event_id = e.id
  );

INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, created_at)
SELECT e.id, 'past_disaster', p.id, 'V193 bridge Lake Babati 1990', now()
FROM public.disaster_events e
JOIN public.past_disasters p ON p.event_name = 'Lake Babati floods through Babati town — April 1990'
WHERE e.event_code = 'HIST-BBT-FLD-1990'
  AND NOT EXISTS (
      SELECT 1 FROM public.disaster_event_links l
      WHERE l.entity_type = 'past_disaster' AND l.entity_id = p.id AND l.event_id = e.id
  );

INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, created_at)
SELECT e.id, 'past_disaster', p.id, 'V193 bridge Arusha/Kilimanjaro Apr 2020', now()
FROM public.disaster_events e
JOIN public.past_disasters p ON p.event_name = 'Arusha and Kilimanjaro floods / mudslides — April 2020'
WHERE e.event_code = 'HIST-ARU-FLD-2020'
  AND NOT EXISTS (
      SELECT 1 FROM public.disaster_event_links l
      WHERE l.entity_type = 'past_disaster' AND l.entity_id = p.id AND l.event_id = e.id
  );

INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, created_at)
SELECT e.id, 'past_disaster', p.id, 'V193 bridge TZ multi-region floods 2023 aggregate', now()
FROM public.disaster_events e
JOIN public.past_disasters p ON p.event_name = 'Tanzania multi-region floods season — 2023 (aggregate)'
WHERE e.event_code = 'HIST-TZ-FLD-2023'
  AND NOT EXISTS (
      SELECT 1 FROM public.disaster_event_links l
      WHERE l.entity_type = 'past_disaster' AND l.entity_id = p.id AND l.event_id = e.id
  );

INSERT INTO public.disaster_event_links (event_id, entity_type, entity_id, note, created_at)
SELECT e.id, 'past_disaster', p.id, 'V193 bridge drought 2022', now()
FROM public.disaster_events e
JOIN public.past_disasters p ON p.id = 3
WHERE e.event_code = 'HIST-DRT-2022'
  AND NOT EXISTS (
      SELECT 1 FROM public.disaster_event_links l
      WHERE l.entity_type = 'past_disaster' AND l.entity_id = 3
  );

-- ── 4) Additional candidate mass-shelter points (public stadiums — NOT gazette) ─
INSERT INTO public.evacuation_centers (
    ecentre_id, centre_name, centre_type, region, district, council,
    capacity_people, accessibility, status, latitude, longitude, created_at, updated_at
)
SELECT v.ecentre_id, v.centre_name, v.centre_type, v.region, v.district, v.council,
       v.capacity_people, v.accessibility, v.status, v.latitude, v.longitude, now(), now()
FROM (VALUES
    ('EC-ZNZ-AM', 'Amaan Stadium (Zanzibar)', '["Stadium"]',
     'Mjini Magharibi', 'Mjini', NULL, 15000, 'Vehicle accessible',
     'Active', -6.16220000, 39.19210000),
    ('EC-MBY-SK', 'Sokoine Stadium (Mbeya)', '["Stadium"]',
     'Mbeya', 'Mbeya City', NULL, 20000, 'Vehicle accessible',
     'Active', -8.90940000, 33.46080000),
    ('EC-SHY-KB', 'Kambarage Stadium (Shinyanga)', '["Stadium"]',
     'Shinyanga', 'Shinyanga Municipal', NULL, 30000, 'Vehicle accessible',
     'Active', -3.68070000, 33.42710000),
    ('EC-MRG-JH', 'Jamhuri Stadium (Morogoro)', '["Stadium"]',
     'Morogoro', 'Morogoro Municipal', NULL, 10000, 'Vehicle accessible',
     'Active', -6.82780000, 37.65910000)
) AS v(ecentre_id, centre_name, centre_type, region, district, council,
       capacity_people, accessibility, status, latitude, longitude)
WHERE NOT EXISTS (
    SELECT 1 FROM public.evacuation_centers e WHERE e.ecentre_id = v.ecentre_id
);

-- ── 5) Annotate earlier seed ECs that look like placeholders (honest notes via accessibility) ─
UPDATE public.evacuation_centers
SET accessibility = CASE
      WHEN accessibility ILIKE '%candidate%' OR accessibility ILIKE '%staging%' THEN accessibility
      ELSE coalesce(accessibility, 'Vehicle accessible') || ' | staging: public facility place-name — not official EC gazette'
    END,
    updated_at = now()
WHERE ecentre_id LIKE 'EC-%'
  AND (
    ecentre_id IN ('EC-DSM-NS','EC-DSM-UH','EC-DOM-JS','EC-MWZ-CK','EC-ARU-SA',
                   'EC-ZNZ-AM','EC-MBY-SK','EC-SHY-KB','EC-MRG-JH')
    OR centre_name ILIKE '%Stadium%'
  )
  AND accessibility NOT ILIKE '%not official EC gazette%';
