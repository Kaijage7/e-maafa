-- Read model over the existing warehouses table (Preparedness). IF NOT EXISTS keeps production untouched.
CREATE TABLE IF NOT EXISTS public.warehouses (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    zone VARCHAR(255),
    location_address TEXT,
    city_or_region VARCHAR(255),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    storage_capacity_sqm NUMERIC(10,2),
    contact_person_name VARCHAR(255),
    contact_person_phone VARCHAR(255),
    operational_status VARCHAR(255) DEFAULT 'Operational',
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
