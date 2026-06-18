-- Training Plan golden-thread links: a preparedness training plan can be
-- PUBLISHED as a public News/Event, PUSHED to DRR priorities (a mitigation_measures record carries the
-- Low/Medium/High priority), and — when it has no funding source — REQUEST SUPPORT (stakeholders are
-- notified via the one notification backbone). These columns record those links so the UI can reflect
-- state and we don't double-publish. All additive / nullable.
alter table public.training_plans add column if not exists published_at          timestamptz;
alter table public.training_plans add column if not exists news_id               bigint;
alter table public.training_plans add column if not exists mitigation_measure_id bigint;
alter table public.training_plans add column if not exists drr_priority          varchar(20);
alter table public.training_plans add column if not exists support_requested_at  timestamptz;

comment on column public.training_plans.published_at          is 'When this training was published as a public News/Event (portal_news.id in news_id).';
comment on column public.training_plans.news_id               is 'The portal_news event created when this training was published.';
comment on column public.training_plans.mitigation_measure_id is 'The DRR-priority mitigation_measures record this training was pushed to.';
comment on column public.training_plans.drr_priority          is 'Low | Medium | High — the DRR priority assigned when pushed to priorities.';
comment on column public.training_plans.support_requested_at  is 'When stakeholder funding support was requested for this (unfunded) training.';
