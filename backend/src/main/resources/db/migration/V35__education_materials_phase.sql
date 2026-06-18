-- FEMA-pattern timeline framing for action guides: Prepare NOW (before) / Stay Safe DURING /
-- Be Safe AFTER. 'any' = not phase-specific (videos, documents).
ALTER TABLE public.education_materials ADD COLUMN IF NOT EXISTS phase VARCHAR(20) DEFAULT 'any';
