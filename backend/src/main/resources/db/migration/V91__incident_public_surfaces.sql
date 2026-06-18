-- Surface an incident to the public: a live map marker + a news/event entry, both opening a live
-- snapshot (incident + response status + allocated resources + updates). These columns let an operator
-- explicitly publish an incident to the citizen-facing portal, independent of the time-window rules.
alter table public.incidents add column if not exists show_on_portal_map boolean not null default false;
alter table public.incidents add column if not exists pushed_to_map_at   timestamptz;
alter table public.incidents add column if not exists portal_news_id      bigint;
alter table public.incidents add column if not exists pushed_to_news_at   timestamptz;

create index if not exists idx_incidents_portal_map on public.incidents (show_on_portal_map) where show_on_portal_map = true;
