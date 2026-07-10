-- V185 / F83: professional subscription_id generation (no count(*)+1 race).
-- Unique index already exists (alert_subscriptions_subscription_id_key).

create sequence if not exists public.alert_subscription_id_seq;

-- Continue after the highest existing SUB-YYYY-NNNN suffix (any year).
select setval(
    'public.alert_subscription_id_seq',
    greatest(
        coalesce((
            select max(nullif(regexp_replace(subscription_id, '^SUB-[0-9]{4}-', ''), '')::bigint)
            from public.alert_subscriptions
            where subscription_id ~ '^SUB-[0-9]{4}-[0-9]+$'
        ), 0),
        1
    ),
    true
);
