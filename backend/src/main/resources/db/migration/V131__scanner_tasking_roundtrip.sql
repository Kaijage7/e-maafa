-- Enrich scanner_entity_taskings for the full entity-dispatch ROUND TRIP (e-MAAFA standard):
-- carry the dispatch context the operator chose (urgency / source / instruction), the entity's
-- official assessment (response_*), and the EOCC review outcome (review_*), so a tasking flows
--   awaiting -> acknowledged -> responded -> [EOCC review] -> accepted | returned -> (rework) -> responded ...
-- Additive + idempotent; existing taskings keep status='awaiting' with NULLs in the new columns.
alter table public.scanner_entity_taskings
  add column if not exists urgency             varchar(16),   -- Immediate | Urgent | Routine
  add column if not exists source              varchar(60),   -- where the signal came from (monitoring, regional, global, media, community, field...)
  add column if not exists instruction         text,          -- what the operator is asking the entity to do
  add column if not exists acknowledged_at     timestamp without time zone,
  add column if not exists response_severity   varchar(20),   -- the entity's assessed severity
  add column if not exists response_message    text,          -- the entity's official assessment
  add column if not exists response_action     text,          -- recommended action issued by the entity
  add column if not exists response_attachment varchar(255),  -- optional bulletin/evidence reference
  add column if not exists review_outcome      varchar(20),   -- accepted | returned (EOCC)
  add column if not exists review_note         text,
  add column if not exists reviewed_at         timestamp without time zone,
  add column if not exists reviewed_by         bigint;
