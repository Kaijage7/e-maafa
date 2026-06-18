-- Read model over the existing alert_subscriptions table (Preparedness). IF NOT EXISTS keeps prod untouched.
CREATE TABLE IF NOT EXISTS public.alert_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    subscription_id VARCHAR(255),
    full_name VARCHAR(255),
    subscriber_location VARCHAR(255),
    communication_channels JSONB,
    phone_number VARCHAR(50),
    email VARCHAR(255),
    hazards_of_interest JSONB,
    location_of_interest JSONB,
    alert_level_priority VARCHAR(50),
    languages JSONB,
    consent BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    subscribed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
