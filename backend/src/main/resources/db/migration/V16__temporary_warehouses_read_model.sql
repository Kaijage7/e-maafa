-- Read model over the existing temporary_warehouses table (Preparedness). IF NOT EXISTS keeps prod untouched.
CREATE TABLE IF NOT EXISTS public.temporary_warehouses (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    code VARCHAR(255),
    level VARCHAR(50),
    region_id BIGINT,
    district_id BIGINT,
    location_description TEXT,
    latitude NUMERIC(10,8),
    longitude NUMERIC(11,8),
    contact_person_name VARCHAR(255),
    contact_person_phone VARCHAR(255),
    operational_status VARCHAR(50) DEFAULT 'Active',
    is_active BOOLEAN DEFAULT true,
    established_date DATE,
    closed_date DATE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
