-- ONE HEALTH module — the existing oh_* tables (migrations 2026_02_05_000001..2026_03_26_000003)
-- in their FINAL state: event_type check includes other+ew_alert, contact/person and district/title
-- nullable, source_warning_id, dissemination upload columns, directive implementation tracking.
-- Plus read-model stubs for the FK targets absent locally (stakeholders, wards).
-- IF NOT EXISTS keeps production untouched.

CREATE TABLE IF NOT EXISTS public.stakeholders (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    organization VARCHAR(255),
    type VARCHAR(255) CHECK (type IN ('Government', 'NGO', 'Private', 'International', 'Community', 'Individual')),
    email VARCHAR(255),
    phone VARCHAR(255),
    address TEXT,
    region VARCHAR(255),
    district VARCHAR(255),
    expertise_areas JSON,
    sector VARCHAR(255),
    contact_person_name VARCHAR(255),
    contact_person_title VARCHAR(255),
    contact_person_phone VARCHAR(255),
    contact_person_email VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.wards (
    id BIGSERIAL PRIMARY KEY,
    district_id BIGINT NOT NULL REFERENCES public.districts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    ward_code VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_areas_of_concern (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(255) NOT NULL UNIQUE,
    category VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_concern_items (
    id BIGSERIAL PRIMARY KEY,
    area_of_concern_id BIGINT NOT NULL REFERENCES public.oh_areas_of_concern(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sort_order SMALLINT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_area_stakeholder (
    id BIGSERIAL PRIMARY KEY,
    area_of_concern_id BIGINT NOT NULL REFERENCES public.oh_areas_of_concern(id) ON DELETE CASCADE,
    stakeholder_id BIGINT NOT NULL REFERENCES public.stakeholders(id) ON DELETE CASCADE,
    assigned_by BIGINT,
    updated_by BIGINT,
    notes TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    UNIQUE (area_of_concern_id, stakeholder_id)
);

CREATE TABLE IF NOT EXISTS public.oh_events (
    id BIGSERIAL PRIMARY KEY,
    event_id VARCHAR(255) NOT NULL UNIQUE,
    stakeholder_id BIGINT NOT NULL REFERENCES public.stakeholders(id) ON DELETE CASCADE,
    area_of_concern_id BIGINT NOT NULL REFERENCES public.oh_areas_of_concern(id) ON DELETE CASCADE,
    concern_item_id BIGINT REFERENCES public.oh_concern_items(id) ON DELETE SET NULL,
    event_title VARCHAR(255),
    event_type VARCHAR(255) NOT NULL
        CHECK (event_type IN ('hazard', 'outbreak', 'incident', 'other', 'ew_alert')),
    event_description TEXT NOT NULL,
    date_of_occurrence DATE NOT NULL,
    recommendation TEXT,
    region_id BIGINT NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
    district_id BIGINT REFERENCES public.districts(id) ON DELETE CASCADE,
    ward_village VARCHAR(255),
    ward_id BIGINT REFERENCES public.wards(id) ON DELETE SET NULL,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    contact_person_name VARCHAR(255),
    contact_person_phone VARCHAR(255),
    contact_person_email VARCHAR(255),
    contact_person_designation VARCHAR(255),
    status VARCHAR(255) NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'under_review', 'directive_issued', 'disseminated', 'monitoring', 'closed', 'archived')),
    priority_level VARCHAR(255) CHECK (priority_level IN ('low', 'medium', 'high', 'critical')),
    risk_level VARCHAR(255) CHECK (risk_level IN ('low', 'moderate', 'high', 'very_high')),
    submitted_by BIGINT,
    submitted_at TIMESTAMPTZ,
    reviewed_by BIGINT,
    reviewed_at TIMESTAMPTZ,
    review_comments TEXT,
    closure_date DATE,
    outcome_summary TEXT,
    lessons_learned TEXT,
    completion_percentage SMALLINT NOT NULL DEFAULT 0,
    attachments JSON,
    source_warning_id BIGINT REFERENCES public.warnings(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS oh_events_status_index ON public.oh_events (status);
CREATE INDEX IF NOT EXISTS oh_events_date_of_occurrence_index ON public.oh_events (date_of_occurrence);

CREATE TABLE IF NOT EXISTS public.oh_event_environmental_details (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES public.oh_events(id) ON DELETE CASCADE,
    hazard_id BIGINT REFERENCES public.hazards(id) ON DELETE SET NULL,
    hazard_type VARCHAR(255),
    weather_data TEXT,
    temperature VARCHAR(255),
    rainfall VARCHAR(255),
    wind_speed VARCHAR(255),
    environmental_impact TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_event_health_details (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES public.oh_events(id) ON DELETE CASCADE,
    disease_name VARCHAR(255),
    disease_status VARCHAR(255) CHECK (disease_status IN ('suspected', 'confirmed')),
    transmission_type VARCHAR(255),
    cases_male INTEGER NOT NULL DEFAULT 0,
    cases_female INTEGER NOT NULL DEFAULT 0,
    cases_children INTEGER NOT NULL DEFAULT 0,
    cases_total INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    admitted INTEGER NOT NULL DEFAULT 0,
    animal_species VARCHAR(255),
    animal_cases INTEGER NOT NULL DEFAULT 0,
    animal_deaths INTEGER NOT NULL DEFAULT 0,
    lab_results TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_event_agricultural_details (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES public.oh_events(id) ON DELETE CASCADE,
    crop_livestock_type VARCHAR(255),
    pest_disease_name VARCHAR(255),
    area_affected_ha NUMERIC(10,2),
    severity_level VARCHAR(255) CHECK (severity_level IN ('low', 'moderate', 'high', 'severe')),
    impact_description TEXT,
    farmers_affected INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_event_food_safety_details (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES public.oh_events(id) ON DELETE CASCADE,
    food_product_name VARCHAR(255),
    source_producer VARCHAR(255),
    reason_for_confiscation TEXT,
    lab_results TEXT,
    quantity_destroyed VARCHAR(255),
    quantity_seized VARCHAR(255),
    people_affected INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_event_animal_entries (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES public.oh_events(id) ON DELETE CASCADE,
    species VARCHAR(255) NOT NULL,
    species_other VARCHAR(255),
    cases INTEGER NOT NULL DEFAULT 0,
    deaths INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_directives (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES public.oh_events(id) ON DELETE CASCADE,
    directive_title VARCHAR(255) NOT NULL,
    action_description TEXT NOT NULL,
    deadline DATE,
    priority_level VARCHAR(255) NOT NULL DEFAULT 'medium'
        CHECK (priority_level IN ('low', 'medium', 'high', 'critical')),
    risk_level VARCHAR(255) CHECK (risk_level IN ('low', 'moderate', 'high', 'very_high')),
    coordination_notes TEXT,
    status VARCHAR(255) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'issued', 'acknowledged', 'in_progress', 'completed', 'overdue')),
    issued_by BIGINT,
    issued_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS oh_directives_deadline_index ON public.oh_directives (deadline);

CREATE TABLE IF NOT EXISTS public.oh_directive_stakeholder (
    id BIGSERIAL PRIMARY KEY,
    directive_id BIGINT NOT NULL REFERENCES public.oh_directives(id) ON DELETE CASCADE,
    stakeholder_id BIGINT NOT NULL REFERENCES public.stakeholders(id) ON DELETE CASCADE,
    acknowledgement_status VARCHAR(255) NOT NULL DEFAULT 'pending'
        CHECK (acknowledgement_status IN ('pending', 'acknowledged', 'declined')),
    acknowledged_at TIMESTAMPTZ,
    response_notes TEXT,
    implementation_status VARCHAR(30) NOT NULL DEFAULT 'not_started',
    implementation_percentage SMALLINT NOT NULL DEFAULT 0,
    implementation_notes TEXT,
    last_update_at TIMESTAMPTZ,
    last_update_by BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    UNIQUE (directive_id, stakeholder_id)
);

CREATE TABLE IF NOT EXISTS public.oh_directive_implementation_updates (
    id BIGSERIAL PRIMARY KEY,
    directive_id BIGINT NOT NULL REFERENCES public.oh_directives(id) ON DELETE CASCADE,
    stakeholder_id BIGINT NOT NULL REFERENCES public.stakeholders(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    implementation_status VARCHAR(30) NOT NULL,
    implementation_percentage SMALLINT NOT NULL DEFAULT 0,
    update_notes TEXT NOT NULL,
    challenges TEXT,
    expected_completion_date DATE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_disseminations (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES public.oh_events(id) ON DELETE CASCADE,
    dissemination_type VARCHAR(255) NOT NULL CHECK (dissemination_type IN ('stakeholder', 'public')),
    alert_message TEXT NOT NULL,
    alert_message_sw TEXT,
    target_audience JSON,
    channels JSON,
    language VARCHAR(255) NOT NULL DEFAULT 'both' CHECK (language IN ('en', 'sw', 'both')),
    sector VARCHAR(255),
    directives VARCHAR(500),
    approval_status VARCHAR(255) NOT NULL DEFAULT 'pending'
        CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    approval_remarks TEXT,
    approved_by BIGINT,
    approved_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    sent_by BIGINT,
    status VARCHAR(255) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending_approval', 'approved', 'sent', 'failed')),
    sms_sent_count INTEGER NOT NULL DEFAULT 0,
    email_sent_count INTEGER NOT NULL DEFAULT 0,
    uploaded_file VARCHAR(255),
    uploaded_recipients JSON,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_dissemination_stakeholders (
    id BIGSERIAL PRIMARY KEY,
    dissemination_id BIGINT NOT NULL REFERENCES public.oh_disseminations(id) ON DELETE CASCADE,
    stakeholder_id BIGINT NOT NULL REFERENCES public.stakeholders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    UNIQUE (dissemination_id, stakeholder_id)
);

CREATE TABLE IF NOT EXISTS public.oh_dissemination_logs (
    id BIGSERIAL PRIMARY KEY,
    dissemination_id BIGINT NOT NULL REFERENCES public.oh_disseminations(id) ON DELETE CASCADE,
    channel VARCHAR(255) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    status VARCHAR(255) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
    response_data TEXT,
    external_id VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_action_trackings (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES public.oh_events(id) ON DELETE CASCADE,
    directive_id BIGINT REFERENCES public.oh_directives(id) ON DELETE SET NULL,
    stakeholder_id BIGINT REFERENCES public.stakeholders(id) ON DELETE SET NULL,
    action_title VARCHAR(255) NOT NULL,
    action_description TEXT,
    completion_percentage SMALLINT NOT NULL DEFAULT 0,
    status VARCHAR(255) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
    target_date DATE,
    completed_date DATE,
    remarks TEXT,
    updated_by BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_event_workflow_histories (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES public.oh_events(id) ON DELETE CASCADE,
    user_id BIGINT,
    from_status VARCHAR(255),
    to_status VARCHAR(255) NOT NULL,
    action VARCHAR(255) NOT NULL,
    performed_by_role VARCHAR(255),
    comments TEXT,
    metadata JSON,
    ip_address VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.oh_event_comments (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES public.oh_events(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    stakeholder_id BIGINT REFERENCES public.stakeholders(id) ON DELETE SET NULL,
    comment_text TEXT NOT NULL,
    parent_id BIGINT REFERENCES public.oh_event_comments(id) ON DELETE CASCADE,
    comment_type VARCHAR(30) NOT NULL DEFAULT 'general',
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ
);
