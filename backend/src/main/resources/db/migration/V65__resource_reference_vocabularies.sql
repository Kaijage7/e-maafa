-- F-settings: controlled vocabularies for the relief-resource catalogue.
--
-- Before this, public.resources.category and .unit_of_measure were free-text VARCHAR with NO
-- authoritative source — the Settings > Resource Management form let officers type anything, so
-- "kg"/"Kg"/"kilogram" and "Shelter"/"shelters" fragmented indefinitely and corrupted every
-- downstream readout (allocations, dispatch, warehouse stock, bids, Sendai valuation). These two
-- reference tables become the single source of truth the screen now selects from, and the
-- controller validates writes against them.
--
-- Seeded from the canonical relief set AND from every value already present in public.resources,
-- so no existing catalogue row is orphaned by the new validation. Idempotent (on conflict do nothing).

create table if not exists public.resource_categories (
    id          bigserial primary key,
    name        varchar(120) not null unique,
    active      boolean      not null default true,
    sort_order  int          not null default 100,
    created_at  timestamptz  not null default now()
);

create table if not exists public.units_of_measure (
    id          bigserial primary key,
    code        varchar(40)  not null unique,
    label       varchar(120),
    active      boolean      not null default true,
    sort_order  int          not null default 100,
    created_at  timestamptz  not null default now()
);

insert into public.resource_categories (name, sort_order) values
    ('Food Items', 10),
    ('Non-Food Items', 20),
    ('Emergency Shelter', 30),
    ('Water and Sanitation', 40),
    ('Medical and Health', 50),
    ('Search and Rescue Equipment', 60),
    ('Logistics and Transport', 70),
    ('Communication Equipment', 80),
    ('Agriculture and Livestock', 90)
on conflict (name) do nothing;

-- adopt any category already in use that the canonical set did not cover
insert into public.resource_categories (name, sort_order)
    select distinct category, 100 from public.resources where category is not null
on conflict (name) do nothing;

insert into public.units_of_measure (code, label, sort_order) values
    ('piece', 'Piece', 10),
    ('kg', 'Kilogram', 20),
    ('liter', 'Liter', 30),
    ('carton', 'Carton', 40),
    ('box', 'Box', 50),
    ('pack', 'Pack', 60),
    ('packet', 'Packet', 70),
    ('sachet', 'Sachet', 80),
    ('set', 'Set', 90),
    ('kit', 'Kit', 100),
    ('pair', 'Pair', 110),
    ('roll', 'Roll', 120),
    ('bag', 'Bag', 130),
    ('can', 'Can', 140),
    ('tin', 'Tin', 150),
    ('tablet', 'Tablet', 160),
    ('bottle', 'Bottle', 170),
    ('drum', 'Drum', 180),
    ('bale', 'Bale', 190)
on conflict (code) do nothing;

-- adopt any unit already in use that the canonical set did not cover
insert into public.units_of_measure (code, sort_order)
    select distinct unit_of_measure, 200 from public.resources where unit_of_measure is not null
on conflict (code) do nothing;
