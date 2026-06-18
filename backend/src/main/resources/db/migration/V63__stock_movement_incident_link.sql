-- Make warehouse operations dual-mode: every stock movement (intake/receipt, removal/dispatch,
-- transfer, borrow/return) is a NORMAL warehouse operation by default, but can optionally be
-- linked to an incident when it is part of an emergency response.
-- Incident-driven dispatch already links via allocation_id; this adds a direct, optional incident
-- link for the normal-operations flows so receipts/dispatch/requests are traceable to an incident.
alter table public.stock_movements
    add column if not exists incident_id bigint references public.incidents(id);

create index if not exists idx_stock_movements_incident on public.stock_movements(incident_id);

comment on column public.stock_movements.incident_id is
    'Optional incident this warehouse movement supports (NULL = routine/normal operation).';
