-- Mobile/web command safety: a client may lose the HTTP response after a committed POST and
-- retry the same command. Persist the first response by authenticated actor + operation + key so
-- a retry cannot create a second operational record. This is deliberately NOT an outbox/event bus.

create table platform.api_idempotency_keys (
    actor_user_id      bigint       not null references public.users(id) on delete cascade,
    operation          varchar(100) not null,
    idempotency_key    varchar(128) not null,
    request_fingerprint char(64)    not null,
    response_body      jsonb,
    completed_at       timestamptz,
    created_at         timestamptz  not null default now(),
    expires_at         timestamptz  not null,
    replay_count       integer      not null default 0,
    last_replayed_at   timestamptz,
    primary key (actor_user_id, operation, idempotency_key),
    constraint api_idempotency_operation_ck
        check (operation ~ '^[a-z0-9][a-z0-9._-]{2,99}$'),
    constraint api_idempotency_key_ck
        check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$'),
    constraint api_idempotency_fingerprint_ck
        check (request_fingerprint ~ '^[0-9a-f]{64}$'),
    constraint api_idempotency_completion_ck
        check ((response_body is null) = (completed_at is null)),
    constraint api_idempotency_expiry_ck
        check (expires_at > created_at)
);

create index api_idempotency_expiry_idx
    on platform.api_idempotency_keys (expires_at);

comment on table platform.api_idempotency_keys is
    'Replay-safe POST results keyed by real user, operation and client key; retained for the configured retry window.';
comment on column platform.api_idempotency_keys.request_fingerprint is
    'SHA-256 of the logical request including uploaded file bytes; prevents a key being reused for another payload.';
