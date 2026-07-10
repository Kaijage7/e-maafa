-- V184: production honesty / professional cleanup
-- 1) Remove dual-proof smoke injects and smoke SMS audit rows
-- 2) Clear synthetic placeholder phones on seeded position seats (notify_sms already false)
-- 3) Correct public capability copy that over-claimed WhatsApp delivery

delete from public.activation_injects
 where title ilike 'SMOKE-%'
    or title ilike '%SMOKE-F79%'
    or title = 'SMOKE-F79-SCHED';

delete from public.sms_logs
 where notification_type ilike 'smoke%'
    or external_id ilike '%smoke%'
    or message ilike 'DLR smoke%'
    or message = 'retry smoke';

-- Synthetic phones from V182: '07' + 8-digit id pad. They look real but are not carrier-verified
-- numbers. Keep notify_sms false (already); clear the placeholder so role-SMS cannot silently
-- target fake handsets. Named officers with real phones (not matching this pattern, or not
-- seeded_officer) are left untouched.
update public.users u
   set phone = null,
       updated_at = now()
 where coalesce(u.seeded_officer, false) = true
   and coalesce(u.notify_sms, false) = false
   and u.phone is not null
   and u.phone ~ '^07[0-9]{8}$'
   and u.phone = '07' || lpad((u.id % 100000000)::text, 8, '0');

-- Portal capability cards: honest channels (SMS + email). WhatsApp is not a live delivery path.
update public.portal_settings
   set value = replace(value::text,
         'automated SMS, email, and WhatsApp alerts',
         'automated SMS and email alerts where configured')::jsonb,
       updated_at = now()
 where key = 'capabilities.items'
   and value::text ilike '%WhatsApp%';
