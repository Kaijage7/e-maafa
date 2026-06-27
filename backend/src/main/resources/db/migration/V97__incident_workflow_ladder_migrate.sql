-- Move any in-flight incidents from the old approval stages onto the new escalation ladder
-- (INCIDENT-WORKFLOW-PLAN.md): report → DDMC → DED → RDMC → RAS → EOCC → Director → PS.
-- Old → new mapping (draft/approved/rejected unchanged):
update public.incidents set workflow_status = 'waiting_ded'      where workflow_status in ('waiting_das_approval','rolled_back_to_das');
update public.incidents set workflow_status = 'waiting_ras'      where workflow_status = 'waiting_ras_approval';
update public.incidents set workflow_status = 'waiting_eocc'     where workflow_status in ('waiting_assistant_director_approval','waiting_national_approval','rolled_back_to_national');
update public.incidents set workflow_status = 'waiting_director'  where workflow_status = 'waiting_director_approval';
update public.incidents set workflow_status = 'waiting_ps'       where workflow_status = 'waiting_ps_approval';
update public.incidents set workflow_status = 'waiting_ddmc'     where workflow_status = 'rolled_back_to_district';
update public.incidents set workflow_status = 'waiting_rdmc'     where workflow_status = 'rolled_back_to_regional';
