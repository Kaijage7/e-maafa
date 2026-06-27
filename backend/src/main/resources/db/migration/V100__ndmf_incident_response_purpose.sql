-- Allow NDMF cash to be disbursed directly to an incident response (the stakeholder-cash → NDMF → incident
-- trail), alongside the existing training/procurement purposes. The conditional resource/training-link checks
-- still hold (they only fire for those purpose types), so 'incident_response' needs no resource/training id.
alter table public.ndmf_disbursements drop constraint if exists ndmf_disb_purpose_chk;
alter table public.ndmf_disbursements add constraint ndmf_disb_purpose_chk
    check ((purpose_type)::text = any (array['training','procurement','incident_response']::text[]));
