-- F-settings: controlled vocabulary for translation groups/namespaces.
--
-- Before this, public.translations.group_name was an unconstrained VARCHAR with NO authoritative
-- source — the Settings > Translations form let admins free-type a group (a datalist of existing
-- rows only), so a typo silently created a brand-new ungoverned namespace and the backend defaulted
-- to a magic 'General'. This reference table is the single source of truth the screen now selects
-- from, and the controller validates writes against it.
--
-- Seeded from the canonical namespaces AND every group_name already in use, so no existing
-- translation is orphaned by the new validation. Idempotent (on conflict do nothing).

create table if not exists public.translation_groups (
    id          bigserial primary key,
    name        varchar(60) not null unique,
    sort_order  int         not null default 100,
    active      boolean     not null default true,
    created_at  timestamptz not null default now()
);

insert into public.translation_groups (name, sort_order) values
    ('General', 10),
    ('Navigation', 20),
    ('Buttons', 30),
    ('Forms', 40),
    ('Messages', 50),
    ('Validation', 60),
    ('Dashboard', 70),
    ('Reports', 80),
    ('Hazards', 90),
    ('Settings', 100)
on conflict (name) do nothing;

-- adopt any group already in use that the canonical set did not cover
insert into public.translation_groups (name, sort_order)
    select distinct group_name, 100 from public.translations where group_name is not null
on conflict (name) do nothing;
