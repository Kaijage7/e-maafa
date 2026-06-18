-- Read model over the existing evacuation_centers table (owned by the existing app, in `public`).
-- Subset of columns the index screen needs. IF NOT EXISTS keeps production untouched.
CREATE TABLE IF NOT EXISTS public.evacuation_centers (
    id BIGSERIAL PRIMARY KEY,
    ecentre_id VARCHAR(255),
    centre_name VARCHAR(255),
    centre_type TEXT,
    region VARCHAR(255),
    district VARCHAR(255),
    capacity_people INTEGER,
    accessibility VARCHAR(255),
    status VARCHAR(255) DEFAULT 'Active',
    latitude NUMERIC(10,8),
    longitude NUMERIC(11,8),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
