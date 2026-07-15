-- Mobile device installation registry for push wake-up addressing.
--
-- This is NOT a second identity store and NOT a delivery outbox. It binds an authenticated
-- platform user to a durable installation id so a future FCM/APNs sender can address only
-- the installations that user still owns. Push payloads must remain content-free wake-ups;
-- durable recovery always uses the REST cursor contract.

create table platform.mobile_device_installations (
    id                  bigserial    primary key,
    user_id             bigint       not null references public.users(id) on delete cascade,
    installation_id     varchar(128) not null,
    platform            varchar(16)  not null,
    app_version         varchar(64),
    push_provider       varchar(16)  not null default 'none',
    push_token          text,
    push_token_set_at   timestamptz,
    last_seen_at        timestamptz  not null default now(),
    revoked_at          timestamptz,
    created_at          timestamptz  not null default now(),
    updated_at          timestamptz  not null default now(),
    constraint mobile_device_installation_id_ck
        check (installation_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'),
    constraint mobile_device_platform_ck
        check (platform in ('android', 'ios', 'web')),
    constraint mobile_device_push_provider_ck
        check (push_provider in ('none', 'fcm', 'apns')),
    constraint mobile_device_token_provider_ck
        check (
            (push_provider = 'none' and push_token is null)
            or (push_provider <> 'none'
                and push_token is not null
                and char_length(push_token) between 16 and 4096)
        ),
    constraint mobile_device_revoked_order_ck
        check (revoked_at is null or revoked_at >= created_at)
);

create unique index mobile_device_user_installation_uidx
    on platform.mobile_device_installations (user_id, installation_id);

-- One live push token per provider should not fan-out to multiple users after reinstall reuse.
create unique index mobile_device_live_push_token_uidx
    on platform.mobile_device_installations (push_provider, push_token)
    where revoked_at is null
      and push_token is not null
      and push_provider <> 'none';

create index mobile_device_user_live_idx
    on platform.mobile_device_installations (user_id)
    where revoked_at is null;

comment on table platform.mobile_device_installations is
    'Authenticated mobile/web installation registry for optional push wake-up addressing; not the source of domain data.';
comment on column platform.mobile_device_installations.push_token is
    'Provider token for wake-up only. Never log or return the full value to other clients.';
