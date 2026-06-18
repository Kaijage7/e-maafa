-- Remaining disaster_risk_frameworks columns (add_missing_columns 2026_01_14_201800) the framework
-- store/update write. IF NOT EXISTS keeps production untouched.
ALTER TABLE public.disaster_risk_frameworks ADD COLUMN IF NOT EXISTS sectors_covered TEXT;
ALTER TABLE public.disaster_risk_frameworks ADD COLUMN IF NOT EXISTS key_stakeholders TEXT;
ALTER TABLE public.disaster_risk_frameworks ADD COLUMN IF NOT EXISTS related_documents TEXT;
