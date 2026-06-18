-- Ownership proof for the public unsubscribe.
-- Before this, POST /v1/portal/unsubscribe deactivated ANY subscription matching a raw phone/email
-- (an IDOR: an anonymous attacker could silence a citizen's disaster alerts knowing only their phone).
-- We now require a one-time code sent to that contact and confirmed back before anything is deactivated.
-- This table holds the pending, hashed, short-lived codes (plaintext is never stored).

create table if not exists public.alert_unsubscribe_requests (
    id          bigserial primary key,
    contact     varchar(255) not null,      -- the phone/email the code was sent to (the claimed owner)
    code_hash   varchar(128) not null,      -- SHA-256 hex of the 6-digit code
    channel     varchar(10)  not null,      -- 'sms' | 'email'
    attempts    integer      not null default 0,
    expires_at  timestamptz  not null,
    consumed_at timestamptz,
    created_at  timestamptz  not null default now()
);

create index if not exists idx_unsub_req_contact
    on public.alert_unsubscribe_requests (contact, created_at desc);
