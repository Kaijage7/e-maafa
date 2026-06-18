-- EOCC Bulletin registry: mark a stored bulletin as published (an internal registry state, distinct
-- from the warning_code-driven public-portal linkage). Additive and nullable so existing rows are
-- unaffected (default Draft). published_by is a soft FK to the user who set the state.
alter table public.ew_generated_products add column if not exists is_published boolean not null default false;
alter table public.ew_generated_products add column if not exists published_at timestamptz;
alter table public.ew_generated_products add column if not exists published_by bigint references public.users(id) on delete set null;
-- Publish targets: a bulletin can be surfaced on the public portal map and/or as a downloadable
-- document in the public Publications library (disaster_risk_frameworks, document_type 'Bulletin').
alter table public.ew_generated_products add column if not exists show_on_map boolean not null default false;

create index if not exists idx_ew_product_published on public.ew_generated_products(is_published);
