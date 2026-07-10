-- Residual dual-truth: operational status "Active Response" with workflow still draft
-- and zero response activations is not a real activation — demote status to Reported.
-- Does not invent approvals or activations.

UPDATE public.incidents i
SET status = 'Reported',
    updated_at = now()
WHERE coalesce(i.is_simulation, false) = false
  AND lower(coalesce(i.status, '')) = 'active response'
  AND lower(coalesce(i.workflow_status, '')) = 'draft'
  AND NOT EXISTS (
        SELECT 1 FROM public.response_activations ra WHERE ra.incident_id = i.id
      )
  AND NOT EXISTS (
        SELECT 1 FROM public.allocated_resources ar WHERE ar.incident_id = i.id
      );
