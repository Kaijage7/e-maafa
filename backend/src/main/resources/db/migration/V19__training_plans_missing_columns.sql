-- V13 (mitigation dashboard read models) created a minimal training_plans table before
-- V17 (preparedness read model) could create the full one, so V17's CREATE TABLE IF NOT
-- EXISTS no-opped and the TrainingPlan entity fails schema validation. Add the missing
-- columns additively; IF NOT EXISTS keeps environments that already have them untouched.
ALTER TABLE public.training_plans ADD COLUMN IF NOT EXISTS objective TEXT;
ALTER TABLE public.training_plans ADD COLUMN IF NOT EXISTS geographical_scope JSONB;
ALTER TABLE public.training_plans ADD COLUMN IF NOT EXISTS venue VARCHAR(255);
ALTER TABLE public.training_plans ADD COLUMN IF NOT EXISTS training_description TEXT;
ALTER TABLE public.training_plans ADD COLUMN IF NOT EXISTS source_of_fund VARCHAR(100);
ALTER TABLE public.training_plans ADD COLUMN IF NOT EXISTS organization_name VARCHAR(255);
