-- The source writes 'forwarded' and 'status_update' rows into approval_histories, but the
-- column's CHECK (from the 2025_01_21 migration) only allows approved/rejected — every forward
-- silently fails in Postgres. Widen to the actions actually used.
ALTER TABLE public.approval_histories DROP CONSTRAINT IF EXISTS approval_histories_action_check;
ALTER TABLE public.approval_histories ADD CONSTRAINT approval_histories_action_check
    CHECK (action IN ('approved', 'rejected', 'forwarded', 'status_update', 'rollback',
                      'resubmitted', 'fast_track', 'updated', 'source_updated'));
