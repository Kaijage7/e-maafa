-- Shared platform infrastructure: the transactional event outbox.
-- A domain event is written here in the same transaction as the state change that
-- raised it, then relayed to consumers. Never references the legacy `public` tables.

CREATE TABLE platform.outbox_event (
    id             UUID         PRIMARY KEY,
    event_type     VARCHAR(150) NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id   UUID         NOT NULL,
    payload        JSONB        NOT NULL,
    occurred_at    TIMESTAMPTZ  NOT NULL,
    published_at   TIMESTAMPTZ
);

-- The relay scans for unpublished rows oldest-first; a partial index keeps that cheap.
CREATE INDEX ix_outbox_unpublished
    ON platform.outbox_event (occurred_at)
    WHERE published_at IS NULL;
