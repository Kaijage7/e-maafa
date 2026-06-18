-- The existing infrastructure_items table (2025_06_03_111700), mirrored for the local database.
-- IF NOT EXISTS keeps production untouched.
CREATE TABLE IF NOT EXISTS public.infrastructure_items (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(255) NOT NULL,
    location_description TEXT,
    address VARCHAR(255),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    capacity INTEGER,
    contact_person_name VARCHAR(255),
    contact_person_phone VARCHAR(255),
    contact_person_email VARCHAR(255),
    status VARCHAR(255) NOT NULL DEFAULT 'Unknown',
    additional_info TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
