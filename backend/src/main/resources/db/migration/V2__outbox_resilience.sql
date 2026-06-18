-- Outbox resilience: per-event attempt tracking so a repeatedly failing ("poison") event is
-- dead-lettered after a few tries instead of forcing the relay to replay the whole batch forever.

ALTER TABLE platform.outbox_event
    ADD COLUMN attempts   INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN last_error VARCHAR(500);
