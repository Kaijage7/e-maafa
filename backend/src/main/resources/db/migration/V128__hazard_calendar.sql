-- C3 (national stakeholders feedback): a structured NATIONAL HAZARD CALENDAR — which hazards are
-- likely in which months — replacing the free-text seasonal_pattern. Grounded in Tanzania's
-- climatology: Masika long rains (Mar–May), Vuli short rains (Oct–Dec), the dry season / Kiangazi
-- (Jun–Oct), the hot Kaskazi season (Dec–Feb) and the SW Indian Ocean cyclone window (Nov–Apr).
-- hazard_name aligns with portal_hazard_cards.name so the public view can show the bilingual name.
create table if not exists public.hazard_calendar (
    id          bigserial   primary key,
    hazard_name text        not null,
    month       smallint    not null check (month between 1 and 12),
    risk_level  text        not null,                 -- High | Moderate | Low
    season      text,                                 -- Masika | Vuli | Kiangazi | Kaskazi
    note        text,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now(),
    unique (hazard_name, month)
);

comment on table public.hazard_calendar is
    'C3 national hazard seasonality calendar (Tanzania climatology). hazard_name aligns with portal_hazard_cards.name for bilingual display.';

insert into public.hazard_calendar (hazard_name, month, risk_level, season, note) values
    ('Flood',     1,  'Moderate', 'Kaskazi',  'Unimodal rains in central and southern regions'),
    ('Flood',     2,  'Moderate', 'Kaskazi',  'Unimodal rains in central and southern regions'),
    ('Flood',     3,  'High',     'Masika',   'Long rains — riverine and flash floods'),
    ('Flood',     4,  'High',     'Masika',   'Long rains peak — widespread flooding'),
    ('Flood',     5,  'High',     'Masika',   'Long rains — riverine and flash floods'),
    ('Flood',     11, 'Moderate', 'Vuli',     'Short rains in bimodal regions'),
    ('Flood',     12, 'Moderate', 'Vuli',     'Short rains in bimodal regions'),
    ('Drought',   6,  'Moderate', 'Kiangazi', 'Onset of the long dry season'),
    ('Drought',   7,  'High',     'Kiangazi', 'Dry season — water and pasture stress'),
    ('Drought',   8,  'High',     'Kiangazi', 'Dry season — water and pasture stress'),
    ('Drought',   9,  'High',     'Kiangazi', 'Dry season — water and pasture stress'),
    ('Drought',   10, 'Moderate', 'Kiangazi', 'Late dry season before the short rains'),
    ('Landslide', 3,  'Moderate', 'Masika',   'Saturated slopes in highland regions'),
    ('Landslide', 4,  'High',     'Masika',   'Peak rains — highland landslides (Kilimanjaro, Mbeya, Uluguru)'),
    ('Landslide', 5,  'Moderate', 'Masika',   'Saturated slopes in highland regions'),
    ('Landslide', 12, 'Low',      'Vuli',     'Short rains on steep terrain'),
    ('Cyclone',   11, 'Low',      'Vuli',     'Start of the SW Indian Ocean cyclone season'),
    ('Cyclone',   12, 'Moderate', 'Vuli',     'Cyclone season — coast and Zanzibar'),
    ('Cyclone',   1,  'Moderate', 'Kaskazi',  'Cyclone season — coast and Zanzibar'),
    ('Cyclone',   2,  'Moderate', 'Kaskazi',  'Cyclone season — coast and Zanzibar'),
    ('Cyclone',   3,  'Moderate', 'Masika',   'Cyclone season — coast and Zanzibar'),
    ('Cyclone',   4,  'Low',      'Masika',   'End of the cyclone season'),
    ('Epidemic',  3,  'Moderate', 'Masika',   'Waterborne disease (cholera) risk during the rains'),
    ('Epidemic',  4,  'Moderate', 'Masika',   'Waterborne disease (cholera) risk during the rains'),
    ('Epidemic',  5,  'Moderate', 'Masika',   'Waterborne disease (cholera) risk during the rains'),
    ('Epidemic',  11, 'Moderate', 'Vuli',     'Waterborne disease risk during the short rains'),
    ('Epidemic',  12, 'Moderate', 'Vuli',     'Waterborne disease risk during the short rains'),
    ('Fire',      6,  'Moderate', 'Kiangazi', 'Dry vegetation — bush-fire risk'),
    ('Fire',      7,  'Moderate', 'Kiangazi', 'Dry vegetation — bush-fire risk'),
    ('Fire',      8,  'High',     'Kiangazi', 'Peak bush-fire season'),
    ('Fire',      9,  'High',     'Kiangazi', 'Peak bush-fire season'),
    ('Fire',      10, 'Moderate', 'Kiangazi', 'Dry vegetation before the rains'),
    ('Heatwave',  12, 'Moderate', 'Kaskazi',  'Hot season onset'),
    ('Heatwave',  1,  'High',     'Kaskazi',  'Hottest months — heat stress'),
    ('Heatwave',  2,  'High',     'Kaskazi',  'Hottest months — heat stress')
on conflict (hazard_name, month) do nothing;
