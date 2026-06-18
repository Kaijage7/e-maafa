-- Capture WHY a citizen unsubscribes, chosen from a CMS-controlled list.
-- The reason is stored on the subscription it deactivates (for "why are people leaving" analytics).
alter table public.alert_subscriptions add column if not exists unsubscribe_reason varchar(255);

-- The reason OPTIONS are a portal_settings JSON list managed in Content Management → Portal Management
-- (the same mechanism as the capability cards / emergency numbers), so they are controlled, not hardcoded.
-- Bilingual (en/sw) to match the public portal. Seeded with sample reasons for a disaster-alert service.
insert into public.portal_settings ("group", key, value, type, created_at, updated_at)
select 'subscription', 'unsubscribe.reasons',
       '[{"en":"I receive too many alerts","sw":"Napokea arifa nyingi mno"},'
    || '{"en":"Alerts are not relevant to my area","sw":"Arifa hazihusu eneo langu"},'
    || '{"en":"I no longer live in this area","sw":"Sikai tena katika eneo hili"},'
    || '{"en":"The information was not useful","sw":"Taarifa hazikuwa na msaada"},'
    || '{"en":"I get alerts through another channel","sw":"Napokea arifa kwa njia nyingine"},'
    || '{"en":"Other reason","sw":"Sababu nyingine"}]',
       'json', now(), now()
where not exists (select 1 from public.portal_settings where key = 'unsubscribe.reasons');
