-- Existing identity tables (users + Spatie roles). IF NOT EXISTS keeps production untouched; this only
-- materialises them on a standalone/local database so the login can authenticate against real rows.
CREATE TABLE IF NOT EXISTS public.users (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255) UNIQUE,
    password VARCHAR(255),
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.roles (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    guard_name VARCHAR(255) DEFAULT 'web',
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.model_has_roles (
    role_id BIGINT,
    model_type VARCHAR(255),
    model_id BIGINT
);
