-- Enforce exactly ONE latest submission per agency. The supersede-then-insert in submit() is not
-- race-safe on its own: two concurrent posts for the same agency can each demote the old row then both
-- insert is_latest=true, leaving two latest rows that double-count in the DMD consolidation. A partial
-- unique index makes the second concurrent insert fail instead of silently corrupting. First demote any
-- pre-existing duplicate latest rows (keep the highest id) so the index can be created.
update public.ew_agency_submissions s set is_latest = false
 where is_latest = true
   and id < (select max(id) from public.ew_agency_submissions x where x.agency = s.agency and x.is_latest = true);

create unique index if not exists ux_ew_sub_one_latest
  on public.ew_agency_submissions(agency) where is_latest = true;
