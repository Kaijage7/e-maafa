-- Unified notification system: one per-user in-app feed + per-user channel preferences + email audit.
-- The Laravel original sent SMS (M-Gov), email (Gmail SMTP) and in-app
-- notifications across many flows (incident, alert, warning, CP/AAP activation, dispatch to response
-- teams, content publication, approvals). Which "products" a user receives is controlled per-user in
-- System Settings. This migration adds the missing pieces without duplicating the existing
-- resource_notifications feed (V24) — it generalises that table into the single user-notification feed.

-- 1) Per-user contact + channel preferences (the "what products users receive" control).
--    in-app is always available; email defaults ON (free Gmail SMTP); SMS defaults OFF (metered M-Gov
--    credits) and is enabled per-user for response teams / focal points who need field alerts.
alter table public.users add column if not exists phone          varchar(30);
alter table public.users add column if not exists notify_in_app  boolean not null default true;
alter table public.users add column if not exists notify_email   boolean not null default true;
alter table public.users add column if not exists notify_sms     boolean not null default false;

comment on column public.users.phone         is 'E.164/local mobile for SMS delivery (formatted to 255XXXXXXXXX at send).';
comment on column public.users.notify_in_app is 'Receive in-app (bell) notifications.';
comment on column public.users.notify_email  is 'Receive email notifications (Gmail SMTP).';
comment on column public.users.notify_sms    is 'Receive SMS notifications (M-Gov gateway, metered).';

-- 2) Generalise resource_notifications into the single per-user notification feed.
--    allocated_resource_id is already nullable; add a generic deep-link + source entity reference so
--    incident / early-warning / activation / publication notifications live in the same feed and the
--    bell can route a click to the originating record.
alter table public.resource_notifications add column if not exists link        varchar(255);
alter table public.resource_notifications add column if not exists entity_type varchar(64);
alter table public.resource_notifications add column if not exists entity_id   bigint;
alter table public.resource_notifications add column if not exists severity    varchar(20);

comment on column public.resource_notifications.link        is 'Optional in-app deep link the bell opens on click.';
comment on column public.resource_notifications.entity_type is 'Source record type (incident, early_warning, anticipatory_plan, activation, publication, allocation...).';
comment on column public.resource_notifications.entity_id   is 'Source record id (paired with entity_type).';
comment on column public.resource_notifications.severity    is 'info | success | warning | critical — drives bell styling.';

create index if not exists rn_user_created_index on public.resource_notifications (user_id, created_at desc);

-- 3) Email delivery audit (mirror of sms_logs) so every email send is traceable like every SMS.
create table if not exists public.email_logs (
    id                bigserial primary key,
    notification_type varchar(60),
    notification_id   bigint,
    recipient_email   varchar(255) not null,
    recipient_name    varchar(255),
    subject           varchar(255),
    message           text,
    status            varchar(20) not null default 'pending'
        check (status in ('pending','sent','failed','delivered')),
    response_data     text,
    error_message     text,
    sent_at           timestamptz,
    delivered_at      timestamptz,
    retry_count       integer not null default 0,
    sent_by           bigint,
    created_at        timestamptz not null default now(),
    updated_at        timestamptz not null default now()
);
create index if not exists idx_email_status_created on public.email_logs(status, created_at);
create index if not exists idx_email_recipient on public.email_logs(recipient_email);
