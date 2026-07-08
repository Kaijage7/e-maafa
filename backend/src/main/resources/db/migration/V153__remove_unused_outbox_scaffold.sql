-- F18: remove the unused transactional outbox runtime scaffold.
-- The platform never emitted domain events into this table, so keeping the table plus
-- scheduled relay advertised an event-driven integration path that did not exist.

drop table if exists platform.outbox_event cascade;
