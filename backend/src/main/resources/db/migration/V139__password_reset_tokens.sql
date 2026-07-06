-- Self-service password reset by email (SEC-7 follow-on / VAPT v): single-use, expiring
-- tokens. Only the SHA-256 of the emailed token is stored — a database leak cannot be
-- replayed into a reset. Rows are invalidated on use and superseded on re-request.

create table if not exists public.password_reset_tokens (
    id         bigserial primary key,
    email      varchar(255) not null,
    token_hash varchar(64) not null unique,
    expires_at timestamp not null,
    used_at    timestamp,
    created_at timestamp not null default now()
);

create index if not exists idx_password_reset_tokens_email on public.password_reset_tokens (email);
