-- ═══════════════════════════════════════════════════════════════════════════════
-- Generalized approval workflow engine (source migrations 2026_03_18/19/20):
-- per-module role-chain configuration + per-record step instances + notifications.
-- The V22 approval_workflows table kept the legacy value-threshold shape; the
-- source's 2026_03_20 migration converted it to the polymorphic step table and
-- moved thresholds to nullable columns — mirrored here additively.
-- ═══════════════════════════════════════════════════════════════════════════════

-- Module registry: which models run through the engine (e.g. resource_allocation)
CREATE TABLE IF NOT EXISTS public.approval_workflow_modules (
    id BIGSERIAL PRIMARY KEY,
    module_code VARCHAR(255) NOT NULL UNIQUE,
    module_name VARCHAR(255) NOT NULL,
    model_class VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Role-chain configuration per module (level, role, order, skip rules)
CREATE TABLE IF NOT EXISTS public.approval_workflow_configurations (
    id BIGSERIAL PRIMARY KEY,
    module_id BIGINT NOT NULL REFERENCES public.approval_workflow_modules(id) ON DELETE CASCADE,
    level INTEGER NOT NULL,
    name VARCHAR(255) NOT NULL,
    role_required VARCHAR(255) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    can_skip BOOLEAN NOT NULL DEFAULT FALSE,
    skip_conditions JSON,
    description TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    UNIQUE (module_id, level)
);

-- Per-record step instances: V22 created approval_workflows in the legacy threshold
-- shape; convert additively to the generalized polymorphic shape (2026_03_20).
ALTER TABLE public.approval_workflows ALTER COLUMN min_value DROP NOT NULL;
ALTER TABLE public.approval_workflows ALTER COLUMN approval_level DROP NOT NULL;
ALTER TABLE public.approval_workflows ALTER COLUMN approval_level DROP DEFAULT;
ALTER TABLE public.approval_workflows DROP CONSTRAINT IF EXISTS approval_workflows_approval_level_check;
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS module_id BIGINT REFERENCES public.approval_workflow_modules(id) ON DELETE CASCADE;
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS approvable_type VARCHAR(255);
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS approvable_id BIGINT;
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS step_number INTEGER;
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS step_name VARCHAR(255);
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS approver_role VARCHAR(255);
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS status VARCHAR(255) NOT NULL DEFAULT 'pending';
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS user_id BIGINT;
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS action_at TIMESTAMPTZ;
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS remarks TEXT;
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE public.approval_workflows ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS aw_approvable_index ON public.approval_workflows (approvable_type, approvable_id);

-- Engine state on the allocation record itself (2026_03_18/19)
ALTER TABLE public.allocated_resources ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(255);
ALTER TABLE public.allocated_resources ADD COLUMN IF NOT EXISTS current_workflow_step INTEGER;
ALTER TABLE public.allocated_resources ADD COLUMN IF NOT EXISTS workflow_initiated_at TIMESTAMPTZ;
ALTER TABLE public.allocated_resources ADD COLUMN IF NOT EXISTS workflow_completed_at TIMESTAMPTZ;
ALTER TABLE public.allocated_resources ADD COLUMN IF NOT EXISTS source VARCHAR(255);
ALTER TABLE public.allocated_resources ADD COLUMN IF NOT EXISTS warehouse_id BIGINT REFERENCES public.warehouses(id) ON DELETE SET NULL;

-- In-app notifications for approvers/requesters (2026_03_18)
CREATE TABLE IF NOT EXISTS public.resource_notifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    allocated_resource_id BIGINT REFERENCES public.allocated_resources(id) ON DELETE CASCADE,
    type VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    channel VARCHAR(255) NOT NULL DEFAULT 'database',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    metadata JSON,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rn_user_read_index ON public.resource_notifications (user_id, is_read);

-- Named approval levels for the settings screen (2026_03_18)
CREATE TABLE IF NOT EXISTS public.approval_level_definitions (
    id BIGSERIAL PRIMARY KEY,
    level INTEGER NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    role_required VARCHAR(255) NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    description TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Seed the resource_allocation module with the SRS chain (DAS → RAS → EOCC → Asst.
-- Director → Director) so the engine is operational out of the box; the Settings
-- screen (R12) manages these rows afterwards.
INSERT INTO public.approval_workflow_modules (module_code, module_name, model_class, is_active, description, created_at, updated_at)
SELECT 'resource_allocation', 'Resource Allocation', 'App\Models\AllocatedResource', TRUE,
       'Relief resource request approval chain', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM public.approval_workflow_modules WHERE module_code = 'resource_allocation');

INSERT INTO public.approval_workflow_configurations (module_id, level, name, role_required, "order", is_active, created_at, updated_at)
SELECT m.id, v.level, v.name, v.role, v.level, TRUE, now(), now()
FROM public.approval_workflow_modules m
CROSS JOIN (VALUES
    (1, 'District Administrative Secretary', 'DAS'),
    (2, 'Regional Administrative Secretary', 'RAS'),
    (3, 'EOCC Review', 'EOCC'),
    (4, 'Assistant Director', 'Asst. Director'),
    (5, 'Director Approval', 'Director')
) AS v(level, name, role)
WHERE m.module_code = 'resource_allocation'
  AND NOT EXISTS (SELECT 1 FROM public.approval_workflow_configurations c WHERE c.module_id = m.id);
