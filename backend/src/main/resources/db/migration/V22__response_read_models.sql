-- ═══════════════════════════════════════════════════════════════════════════════
-- Response module read models (incidents, resource allocation & approval chain,
-- damage assessment, alerts, warehouse stock movements, DRF coordination).
-- Mirrors the source migrations listed beside each block. IF NOT EXISTS / ADD
-- COLUMN IF NOT EXISTS keeps environments that already carry the Laravel schema
-- untouched (strangler rule: we never mutate production data, only read/write
-- through the same tables).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── incidents: V13 created a minimal stub for the mitigation dashboard; extend it to
--    the full source shape (2025_06_03_215225 + workflow/damage/feature extensions). ──
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS incident_type_id BIGINT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS agency_id BIGINT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS location_description TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS district_name VARCHAR(255);
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS region_name VARCHAR(255);
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS reported_by_name VARCHAR(255);
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS reported_by_contact VARCHAR(255);
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS source_of_report VARCHAR(255);
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS photo_paths JSON;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS assigned_to_user_id BIGINT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS photo_path VARCHAR(255);
-- workflow fields (2026_01_16_092114): Draft → DAS → RAS → National approval chain
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(255) NOT NULL DEFAULT 'draft';
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS origin_level VARCHAR(20) NOT NULL DEFAULT 'district';
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS region_id BIGINT REFERENCES public.regions(id) ON DELETE SET NULL;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS district_id BIGINT REFERENCES public.districts(id) ON DELETE SET NULL;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS submitted_by_user_id BIGINT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS das_reviewed_by_user_id BIGINT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS das_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS das_comments TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS ras_reviewed_by_user_id BIGINT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS ras_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS ras_comments TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS national_reviewed_by_user_id BIGINT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS national_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS national_comments TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS national_recommendation TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS assigned_to_role VARCHAR(255);
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS assistant_director_reviewed_by_user_id BIGINT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS assistant_director_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS assistant_director_comments TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS assistant_director_recommendation TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS director_reviewed_by_user_id BIGINT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS director_reviewed_at TIMESTAMPTZ;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS director_comments TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS director_recommendation TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS public_hazard_report_id BIGINT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS rollback_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS last_rollback_at TIMESTAMPTZ;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS last_rollback_by_role VARCHAR(255);
-- casualty & damage figures (2026_01_21_195337 + 2026_03_09 children_affected)
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS deaths_male INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS deaths_female INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS deaths_total INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS injured_male INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS injured_female INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS injured_total INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS missing_male INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS missing_female INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS missing_total INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS displaced INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS people_with_disabilities INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS pregnant_affected INTEGER DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS children_affected INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS infrastructure_damage JSON;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS emergency_needs JSON;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS emergency_needs_other VARCHAR(255);
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS action_taken TEXT;
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS video_path VARCHAR(255);
ALTER TABLE public.incidents ADD COLUMN IF NOT EXISTS attachment_links JSON;
CREATE INDEX IF NOT EXISTS incidents_workflow_status_index ON public.incidents (workflow_status);
CREATE INDEX IF NOT EXISTS incidents_region_workflow_index ON public.incidents (region_id, workflow_status);

-- ── incident_types (2025_06_03_214031) ──
CREATE TABLE IF NOT EXISTS public.incident_types (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    default_severity VARCHAR(255),
    icon_class VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- ── incident_tasks (2025_06_03_224221 + DRF coordination extensions 2026_03_26) ──
CREATE TABLE IF NOT EXISTS public.incident_tasks (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    activation_id BIGINT,
    drf_id BIGINT,
    stakeholder_id BIGINT REFERENCES public.stakeholders(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    assigned_to_user_id BIGINT,
    priority VARCHAR(255) NOT NULL DEFAULT 'Medium',
    status VARCHAR(255) NOT NULL DEFAULT 'To Do',
    progress_percent INTEGER NOT NULL DEFAULT 0,
    due_date DATE,
    completed_at TIMESTAMPTZ,
    created_by_user_id BIGINT,
    notes TEXT,
    challenge TEXT,
    resource_request TEXT,
    is_72hr_critical BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    photo_path VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- ── incident_updates (2025_06_03_234429): the situation log per incident ──
CREATE TABLE IF NOT EXISTS public.incident_updates (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    user_id BIGINT,
    update_details TEXT NOT NULL,
    update_type VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- ── incident_workflow_histories (2026_01_16_092734): DAS/RAS/National audit trail ──
CREATE TABLE IF NOT EXISTS public.incident_workflow_histories (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL,
    from_status VARCHAR(255),
    to_status VARCHAR(255) NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN
        ('created', 'submitted', 'approved', 'rejected', 'rolled_back', 'edited',
         'resubmitted', 'assigned', 'completed')),
    performed_by_role VARCHAR(255) NOT NULL,
    comments TEXT,
    metadata JSON,
    ip_address VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS iwh_incident_created_index ON public.incident_workflow_histories (incident_id, created_at);

-- ── resources: extend the preparedness stub to the source shape (2025_06_03_170811 + unit_cost) ──
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS unit_of_measure VARCHAR(255);
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS specifications TEXT;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER;
ALTER TABLE public.resources ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15,2) DEFAULT 0;

-- ── warehouses: dispatch capacity figure used by the response warehouse dashboard ──
ALTER TABLE public.warehouses ADD COLUMN IF NOT EXISTS capacity INTEGER DEFAULT 0;

-- ── allocated_resources (2025_06_03_231502 + forward/approve/dispatch/bidding extensions):
--    the full request → forward → PMO approval → dispatch → receipt → delivery chain ──
CREATE TABLE IF NOT EXISTS public.allocated_resources (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    resource_id BIGINT NOT NULL REFERENCES public.resources(id) ON DELETE RESTRICT,
    quantity_requested NUMERIC(10,2) NOT NULL,
    unit_of_measure VARCHAR(255) NOT NULL,
    justification_for_request TEXT,
    quantity_allocated NUMERIC(10,2),
    source_details TEXT,
    status VARCHAR(255) NOT NULL DEFAULT 'Requested',
    published_for_stakeholder_bidding BOOLEAN DEFAULT FALSE,
    bidding_status VARCHAR(20) DEFAULT 'open',
    bid_deadline TIMESTAMPTZ,
    allocation_date DATE,
    allocated_by_user_id BIGINT,
    allocation_notes TEXT,
    requested_by BIGINT,
    forwarded_by BIGINT,
    forwarded_at TIMESTAMPTZ,
    approved_by BIGINT,
    approved_at TIMESTAMPTZ,
    rejected_by BIGINT,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,
    approval_remarks TEXT,
    approval_conditions TEXT,
    deployed_at TIMESTAMPTZ,
    deployed_from_warehouse BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL,
    dispatched_by BIGINT,
    dispatched_at TIMESTAMPTZ,
    received_by BIGINT,
    received_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    fulfilled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- ── approval workflow config + audit (2025_01_21_create_response_additional_tables) ──
CREATE TABLE IF NOT EXISTS public.approval_workflows (
    id BIGSERIAL PRIMARY KEY,
    min_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    max_value NUMERIC(15,2),
    approval_level VARCHAR(20) NOT NULL DEFAULT 'pmo' CHECK (approval_level IN ('auto', 'pmo', 'minister')),
    conditions TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.approval_histories (
    id BIGSERIAL PRIMARY KEY,
    allocation_id BIGINT,
    action VARCHAR(20) NOT NULL DEFAULT 'approved' CHECK (action IN ('approved', 'rejected')),
    user_id BIGINT,
    remarks TEXT,
    conditions TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- ── damage assessment suite (2025_01_21_create_damage_assessments + additional tables) ──
CREATE TABLE IF NOT EXISTS public.damage_assessments (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT,
    assessment_type VARCHAR(20) NOT NULL DEFAULT 'Initial' CHECK (assessment_type IN ('Initial', 'Detailed', 'Final')),
    assessment_date DATE NOT NULL,
    assessor_id BIGINT,
    location VARCHAR(255),
    district VARCHAR(255),
    latitude NUMERIC(10,8),
    longitude NUMERIC(11,8),
    damage_level VARCHAR(20) NOT NULL DEFAULT 'Moderate' CHECK (damage_level IN ('Minor', 'Moderate', 'Severe', 'Total Loss')),
    estimated_loss NUMERIC(15,2) NOT NULL DEFAULT 0,
    immediate_needs TEXT,
    recommendations TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'Draft' CHECK (status IN ('Draft', 'Pending', 'Pending Verification', 'Completed')),
    submitted_at TIMESTAMPTZ,
    submitted_by BIGINT,
    completed_at TIMESTAMPTZ,
    verified_by BIGINT,
    verification_notes TEXT,
    updated_by BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.assessment_categories (
    id BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT,
    category VARCHAR(255) NOT NULL,
    subcategory VARCHAR(255),
    damage_description TEXT,
    quantity_damaged INTEGER,
    unit VARCHAR(255),
    damage_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    severity VARCHAR(20) NOT NULL DEFAULT 'Moderate' CHECK (severity IN ('Minor', 'Moderate', 'Severe')),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.assessment_photos (
    id BIGSERIAL PRIMARY KEY,
    assessment_id BIGINT,
    photo_path VARCHAR(255) NOT NULL,
    caption VARCHAR(255),
    uploaded_by BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- ── communication & alerts (2024_01_20/21 + 2025_01_22 category columns) ──
CREATE TABLE IF NOT EXISTS public.alerts (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT,
    alert_type VARCHAR(255) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    channels JSON,
    recipient_groups JSON,
    created_by BIGINT NOT NULL,
    scheduled_at TIMESTAMPTZ,
    sent_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scheduled', 'sent', 'failed')),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS alerts_status_index ON public.alerts (status);
CREATE TABLE IF NOT EXISTS public.alert_templates (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(255) NOT NULL,
    category VARCHAR(255),
    subject VARCHAR(255),
    content TEXT,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    variables JSON,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT NOT NULL,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.alert_recipients (
    id BIGSERIAL PRIMARY KEY,
    alert_id BIGINT,
    recipient_type VARCHAR(255) NOT NULL,
    recipient_id BIGINT NOT NULL,
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'read', 'failed')),
    delivery_method VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.recipient_groups (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    member_count INTEGER NOT NULL DEFAULT 0,
    created_by BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.recipient_group_members (
    id BIGSERIAL PRIMARY KEY,
    group_id BIGINT,
    user_id BIGINT,
    added_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- ── warehouse stock movements (2026_03_15_000002): transfers, intake, adjustments ──
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id BIGSERIAL PRIMARY KEY,
    resource_id BIGINT REFERENCES public.resources(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL,
    movement_type VARCHAR(30) NOT NULL DEFAULT 'Transfer',
    from_warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL,
    to_warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL,
    allocation_id BIGINT REFERENCES public.allocated_resources(id) ON DELETE SET NULL,
    batch_number VARCHAR(255),
    expiry_date DATE,
    supplier VARCHAR(255),
    priority VARCHAR(20) NOT NULL DEFAULT 'Normal',
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'Pending',
    user_id BIGINT,
    completed_at TIMESTAMPTZ,
    completed_by BIGINT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- ── DRF coordination / NDPRP 2022 (2026_03_26_200001) ──
CREATE TABLE IF NOT EXISTS public.disaster_response_functions (
    id BIGSERIAL PRIMARY KEY,
    number INTEGER NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    lead_agency_name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(255) NOT NULL DEFAULT 'fa-tasks',
    color VARCHAR(255) NOT NULL DEFAULT '#6b7280',
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.drf_default_tasks (
    id BIGSERIAL PRIMARY KEY,
    drf_id BIGINT NOT NULL REFERENCES public.disaster_response_functions(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    is_72hr_critical BOOLEAN NOT NULL DEFAULT FALSE,
    default_priority VARCHAR(255) NOT NULL DEFAULT 'Medium',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.response_activations (
    id BIGSERIAL PRIMARY KEY,
    incident_id BIGINT NOT NULL UNIQUE REFERENCES public.incidents(id) ON DELETE CASCADE,
    activated_by BIGINT NOT NULL,
    activated_at TIMESTAMPTZ NOT NULL,
    deactivated_at TIMESTAMPTZ,
    status VARCHAR(255) NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.task_activity_log (
    id BIGSERIAL PRIMARY KEY,
    activation_id BIGINT NOT NULL REFERENCES public.response_activations(id) ON DELETE CASCADE,
    task_id BIGINT REFERENCES public.incident_tasks(id) ON DELETE SET NULL,
    user_id BIGINT NOT NULL,
    stakeholder_id BIGINT REFERENCES public.stakeholders(id) ON DELETE SET NULL,
    action VARCHAR(255) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ── incident_history_reports (2026_03_26_071344): periodic situation figures ──
CREATE TABLE IF NOT EXISTS public.incident_history_reports (
    id BIGSERIAL PRIMARY KEY,
    uuid UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    incident_id BIGINT NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
    user_id BIGINT,
    deaths_male INTEGER NOT NULL DEFAULT 0,
    deaths_female INTEGER NOT NULL DEFAULT 0,
    deaths_total INTEGER NOT NULL DEFAULT 0,
    injured_male INTEGER NOT NULL DEFAULT 0,
    injured_female INTEGER NOT NULL DEFAULT 0,
    injured_total INTEGER NOT NULL DEFAULT 0,
    missing_male INTEGER NOT NULL DEFAULT 0,
    missing_female INTEGER NOT NULL DEFAULT 0,
    missing_total INTEGER NOT NULL DEFAULT 0,
    displaced INTEGER NOT NULL DEFAULT 0,
    people_with_disabilities INTEGER NOT NULL DEFAULT 0,
    pregnant_affected INTEGER NOT NULL DEFAULT 0,
    children_affected INTEGER NOT NULL DEFAULT 0,
    government_property_loss BOOLEAN NOT NULL DEFAULT FALSE,
    private_property_loss BOOLEAN NOT NULL DEFAULT FALSE,
    services_unavailable JSON,
    remarks TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
