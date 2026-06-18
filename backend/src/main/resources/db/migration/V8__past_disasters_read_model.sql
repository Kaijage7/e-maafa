-- The existing past_disasters table (2025_06_03_121410 + 2025_06_04_112110 add coordinates),
-- mirrored for the local database. IF NOT EXISTS keeps production untouched.
CREATE TABLE IF NOT EXISTS public.past_disasters (
    id BIGSERIAL PRIMARY KEY,
    event_name VARCHAR(255) NOT NULL,
    event_date DATE NOT NULL,
    location_description TEXT,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    hazard_id BIGINT REFERENCES public.hazards(id) ON DELETE SET NULL,
    description_of_event TEXT,
    impact_description TEXT,
    lessons_learned TEXT,
    source_of_information VARCHAR(255),
    report_document_path VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
