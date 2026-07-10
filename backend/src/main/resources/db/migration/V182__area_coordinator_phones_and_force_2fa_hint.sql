-- V182: F76 — give area-coordinator / seeded officer seats a phone number so role-targeted
-- SMS *can* resolve recipients. notify_sms stays FALSE (no spam); operators opt-in per account.
-- Phones are synthetic local placeholders derived from user id (not real numbers).

update public.users u
   set phone = '07' || lpad((u.id % 100000000)::text, 8, '0'),
       updated_at = now()
 where (coalesce(u.phone, '') = '')
   and (
        coalesce(u.seeded_officer, false)
        or exists (
            select 1 from public.model_has_roles m
            join public.roles r on r.id = m.role_id
            where m.model_id = u.id
              and r.name in (
                'RAS','RC','Reg DC','DAS','DED','Dist DC','District Commissioner',
                'EOCC','Director','Asst. Director','Secretary','Super Admin'
              )
        )
   );

-- Document force-2FA is a runtime config (dmis.auth.force-2fa-roles), not a schema flag.
comment on column public.users.totp_enabled is
  'TOTP 2FA enabled. When dmis.auth.force-2fa-roles includes a user role, login requires totp_enabled=true.';
