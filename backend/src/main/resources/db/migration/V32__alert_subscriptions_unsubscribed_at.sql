-- V18's read model omitted unsubscribed_at (the Laravel table has it); the public unsubscribe
-- flow writes it. Additive, IF NOT EXISTS keeps environments that already have it untouched.
ALTER TABLE public.alert_subscriptions ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;
