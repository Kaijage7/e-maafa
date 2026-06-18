-- R11b: Command Post posture doctrine.
-- Adds the de-escalation 'safeguard' posture (cyclone passing but residual flood/landslide
-- risk — international doctrine: never jump Red->Closed), and a reference table mapping each
-- posture to the Tanzania TEPRP level, the SW-Indian-Ocean alert colour, the lead-time window
-- and the authorising office per the DM Act 2022 / NDPRP 2022. Production-safe additive.

-- 1) widen the posture ladder to include 'safeguard'
alter table public.response_activations drop constraint if exists response_activations_posture_check;
alter table public.response_activations add constraint response_activations_posture_check
    check (posture in ('monitoring','emergency','disaster','safeguard'));

-- 2) doctrine reference (read-only lookup the board uses for correct labels/colours)
create table if not exists public.posture_doctrine (
    posture       varchar(20) primary key,
    sort_order    int not null,
    teprp_level   varchar(20)  not null,   -- Tanzania TEPRP Level 1/2/3 (3 = worst)
    alert_colour  varchar(20)  not null,   -- Madagascar/SWIO convention: Green/Yellow/Red/Blue
    alert_label   varchar(60)  not null,
    lead_time     varchar(40)  not null,   -- typical cyclone lead-time window
    authoriser    varchar(120) not null,   -- who authorises this posture per the Act/Plan
    description   text         not null
);

insert into public.posture_doctrine
    (posture, sort_order, teprp_level, alert_colour, alert_label, lead_time, authoriser, description)
values
    ('monitoring', 1, 'TEPRP Level 1', 'Green',  'Preliminary watch',
        '-120 to -72h', 'Director, DMD',
        'Forecast received; EOCC monitoring 24/7; all 15 DRFs on call; preposition checks and evacuation-route review.'),
    ('emergency', 2, 'TEPRP Level 2', 'Yellow', 'Threat — evacuations begin',
        '-72 to -24h', 'Director DMD advises the Prime Minister',
        'Direct threat; partial/full EOCC activation; coastal/low-lying evacuations begin; shelters opened.'),
    ('disaster', 3, 'TEPRP Level 3', 'Red', 'Imminent / impact',
        '-24 to 0h', 'Minister declares Disaster Area (s.32); President proclaims emergency (s.33)',
        'Full activation; movement restrictions and final sheltering; Disaster Area declaration directs the NDPRP for up to 3 months.'),
    ('safeguard', 4, 'De-escalation', 'Blue', 'Post-hazard watch',
        'post-passage', 'Director, DMD',
        'System moving away but residual flood/landslide risk remains; rapid damage & needs assessment (DRF 10); no jump straight to stood-down.')
on conflict (posture) do nothing;
