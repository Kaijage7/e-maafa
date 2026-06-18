-- Hazard education repository: per-hazard materials shown on the public education hub
-- (/education/hazard/{name}), uploaded & categorised in Content Management.
-- audience: children | adults | disabilities | all
-- material_type: action_guide (action statements) | video | document | poster | other
CREATE TABLE IF NOT EXISTS public.education_materials (
    id BIGSERIAL PRIMARY KEY,
    hazard VARCHAR(100),
    audience VARCHAR(30) DEFAULT 'all',
    material_type VARCHAR(30) DEFAULT 'action_guide',
    title VARCHAR(255),
    body TEXT,                 -- action statements / description (one per line for action guides)
    video_url VARCHAR(500),    -- for material_type = video (YouTube or hosted)
    file_path VARCHAR(255),    -- for documents/posters (public storage, /api/storage/…)
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_education_materials_hazard ON public.education_materials(hazard, audience);
