-- Accountability for stakeholder resource bids (in-kind donation offers): record the user who ENTERED the
-- offer (the maker — critical for on-behalf entries an operator files for a partner) and the user who ACCEPTED
-- it (the checker), so the maker and the checker are distinct, identified parties separate from the partner the
-- offer is attributed to. Closes a non-repudiation / segregation-of-duties gap. Both nullable: pre-existing
-- rows (recorded before this column existed) keep NULL; new offers and acceptances populate them server-side.
alter table public.stakeholder_resource_bids add column if not exists recorded_by bigint;
alter table public.stakeholder_resource_bids add column if not exists accepted_by bigint;
