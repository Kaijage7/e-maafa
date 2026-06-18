-- Read model over the existing training_plans table (Preparedness). IF NOT EXISTS keeps prod untouched.
CREATE TABLE IF NOT EXISTS public.training_plans (
    id BIGSERIAL PRIMARY KEY,
    training_id VARCHAR(255),
    training_title VARCHAR(255),
    implementing_institution VARCHAR(255),
    objective TEXT,
    geographical_scope JSONB,
    targeted_audience JSONB,
    venue VARCHAR(255),
    training_start_date DATE,
    training_end_date DATE,
    training_description TEXT,
    source_of_fund VARCHAR(100),
    organization_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'planned',
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
