-- =====================================================================================
-- V61 — Extend disaster_event_effects to hold EVERY field of the official PMO loss table
-- (JEDWALI Na.1, "TAARIFA YA MAAFA MBALIMBALI"). The DesInventar-Sendai model already
-- carries people/deaths/economic-loss/facilities; the national sitrep table also counts
-- HOUSEHOLDS (kaya), CLASSROOMS (madarasa), RELIGIOUS FACILITIES (makanisa) and a plain
-- ROAD COUNT (barabara, not km). Adding them additively so the Disaster Data report can
-- reproduce the official sheet 1:1 and the cards stay faithful to what was reported.
-- =====================================================================================

ALTER TABLE disaster_event_effects
    ADD COLUMN IF NOT EXISTS households_affected         INT DEFAULT 0,   -- KAYA zilizoathirika (distinct from directly_affected people)
    ADD COLUMN IF NOT EXISTS classrooms_damaged          INT DEFAULT 0,   -- MADARASA (D-2 detail under schools)
    ADD COLUMN IF NOT EXISTS religious_facilities_damaged INT DEFAULT 0,  -- MAKANISA / taasisi za kidini (D-4)
    ADD COLUMN IF NOT EXISTS roads_damaged               INT DEFAULT 0;   -- BARABARA count (kept alongside roads_km_damaged)

-- On the event card itself: the government RELIEF disbursed for the event (the report's "Hatua/HATUA
-- ZILIZOCHUKULIWA" funds — national total TZS 1,123,380,000) and the response-actions narrative, so the
-- Disaster Data report reproduces JEDWALI Na.2 (Athari + Hatua) and totals the relief column.
ALTER TABLE disaster_events
    ADD COLUMN IF NOT EXISTS gov_response_tzs  NUMERIC(18,2) DEFAULT 0,   -- relief disbursed (OWM-SBUU + region/council)
    ADD COLUMN IF NOT EXISTS response_actions  TEXT;                      -- "Hatua zilizochukuliwa" summary

COMMENT ON COLUMN disaster_events.gov_response_tzs IS 'Government relief disbursed for this event (TZS)';
COMMENT ON COLUMN disaster_event_effects.households_affected IS 'KAYA zilizoathirika — affected households (Sendai B-2 proxy)';
COMMENT ON COLUMN disaster_event_effects.classrooms_damaged IS 'MADARASA yaliyoharibika — classrooms damaged (Sendai D-2)';
COMMENT ON COLUMN disaster_event_effects.religious_facilities_damaged IS 'MAKANISA / taasisi za kidini — religious facilities damaged (Sendai D-4)';
COMMENT ON COLUMN disaster_event_effects.roads_damaged IS 'BARABARA — number of roads damaged (count; roads_km_damaged holds length when reported)';
