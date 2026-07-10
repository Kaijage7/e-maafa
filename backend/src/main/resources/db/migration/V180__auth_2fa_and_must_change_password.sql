-- V180: TOTP 2FA + mandatory password change (PSA v / 2FA residual)
-- Honest production path: optional TOTP per user; admin-set passwords force change on next login.

alter table public.users
    add column if not exists totp_secret varchar(64),
    add column if not exists totp_enabled boolean not null default false,
    add column if not exists must_change_password boolean not null default false,
    add column if not exists totp_confirmed_at timestamptz;

comment on column public.users.totp_secret is 'Base32 TOTP secret (RFC 6238); null when 2FA not enrolled';
comment on column public.users.totp_enabled is 'When true, login requires a valid TOTP after password';
comment on column public.users.must_change_password is 'When true, login issues only a limited token until self-service change';

-- Short-lived login challenges (MFA step). Only SHA-256 of the token is stored.
create table if not exists public.auth_login_challenges (
    id            bigserial primary key,
    user_id       bigint not null references public.users(id) on delete cascade,
    token_hash    char(64) not null,
    purpose       varchar(32) not null, -- mfa | password_change
    expires_at    timestamptz not null,
    used_at       timestamptz,
    created_at    timestamptz not null default now()
);

create unique index if not exists auth_login_challenges_token_hash_uq
    on public.auth_login_challenges (token_hash);
create index if not exists auth_login_challenges_user_idx
    on public.auth_login_challenges (user_id, purpose);
