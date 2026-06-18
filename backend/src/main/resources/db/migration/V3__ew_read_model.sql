-- Read model over the EXISTING Early Warning tables (owned by the existing app, in `public`).
-- The platform only READS them. IF NOT EXISTS means production (where they already exist) is untouched;
-- this only materialises them on a standalone/local database.

CREATE TABLE IF NOT EXISTS public.hazards (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, type VARCHAR(255),
    severity_scale VARCHAR(255), description TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.regions (
    id BIGSERIAL PRIMARY KEY, name VARCHAR(255) NOT NULL, code VARCHAR(10),
    region_code VARCHAR(20), population INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.districts (
    id BIGSERIAL PRIMARY KEY, region_id BIGINT, name VARCHAR(255) NOT NULL, code VARCHAR(10),
    district_code VARCHAR(20), population INTEGER, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.warnings (
    id BIGSERIAL PRIMARY KEY, warning_code VARCHAR(50), status VARCHAR(255) DEFAULT 'pending',
    is_approved BOOLEAN DEFAULT FALSE, approval_notes TEXT, approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.warning_hazards (
    id BIGSERIAL PRIMARY KEY, warning_id BIGINT NOT NULL, hazard_id BIGINT,
    likelihood_of_occurrence VARCHAR(20), warning_level VARCHAR(20),
    validity_start TIMESTAMPTZ, validity_end TIMESTAMPTZ, duration INTEGER, technical_description TEXT,
    region_id BIGINT, district_id BIGINT, ward_id BIGINT, village_id BIGINT,
    latitude NUMERIC(10,8), longitude NUMERIC(11,8),
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ
);
