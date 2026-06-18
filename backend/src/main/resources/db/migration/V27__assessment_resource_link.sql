-- R7: link damage assessments into the single allocation pipeline.
-- The source kept a separate resource_requests table beside allocated_resources;
-- per the RESPONSE-PLAN dedup rules an assessment's direct resource requests are
-- allocated_resources rows (same V24 approval chain, same dispatch console),
-- tied back to their assessment through this column.
alter table public.allocated_resources
    add column if not exists assessment_id bigint references public.damage_assessments(id) on delete set null;
create index if not exists idx_allocated_resources_assessment on public.allocated_resources(assessment_id);
