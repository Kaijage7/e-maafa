-- The settings-driven chain automation (V133) logs system hops as action='auto_advanced' so the
-- audit trail distinguishes a system skip from a human approval. The histories action CHECK
-- predates it — extend the allowed list (everything else unchanged).
alter table public.incident_workflow_histories
    drop constraint incident_workflow_histories_action_check;
alter table public.incident_workflow_histories
    add constraint incident_workflow_histories_action_check
    check (action::text = any (array[
        'created', 'submitted', 'approved', 'rejected', 'rolled_back',
        'edited', 'resubmitted', 'assigned', 'completed', 'auto_advanced'
    ]::text[]));
