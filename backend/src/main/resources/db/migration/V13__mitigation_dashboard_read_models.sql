-- Read models the Prevention & Mitigation dashboard + GIS map aggregate over, mirrored from the
-- existing Laravel migrations (subset columns the two screens read). IF NOT EXISTS keeps
-- production untouched.
CREATE TABLE IF NOT EXISTS public.disaster_risk_frameworks (
    id BIGSERIAL PRIMARY KEY,
    repository_entry_id VARCHAR(255) UNIQUE,
    document_type VARCHAR(255),
    document_type_other VARCHAR(255),
    document_name VARCHAR(255),
    year_of_approval INTEGER,
    hazard_types JSON,
    geographic_scope VARCHAR(255),
    narrative_description TEXT,
    implementation_period_start DATE,
    implementation_period_end DATE,
    attachment_path VARCHAR(255),
    external_link VARCHAR(255),
    status VARCHAR(255),
    created_by BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.strategic_projects (
    id BIGSERIAL PRIMARY KEY,
    entry_id VARCHAR(255) UNIQUE,
    project_name VARCHAR(255),
    project_category VARCHAR(255),
    project_sector VARCHAR(255),
    project_status VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.disaster_knowledge_repositories (
    id BIGSERIAL PRIMARY KEY,
    entry_id VARCHAR(255) UNIQUE,
    content_title VARCHAR(255),
    content_type VARCHAR(255),
    description TEXT,
    visibility_level VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.training_plans (
    id BIGSERIAL PRIMARY KEY,
    training_id VARCHAR(255) UNIQUE,
    training_title VARCHAR(255),
    implementing_institution VARCHAR(255),
    training_start_date DATE,
    training_end_date DATE,
    targeted_audience JSON,
    status VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.incidents (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255),
    hazard_id BIGINT,
    status VARCHAR(255),
    severity_level VARCHAR(255),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    reported_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
