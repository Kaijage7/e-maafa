-- Publications (disaster_risk_frameworks doubles as the public publications library):
-- DMD documents exist in English and Swahili editions — tag each entry so the public
-- page can arrange the two language parts cleanly and CM can upload either edition.
alter table public.disaster_risk_frameworks
    add column if not exists language varchar(8) not null default 'en';

comment on column public.disaster_risk_frameworks.language is
    'Document language: en | sw (Swahili editions are separate entries, e.g. Mkakati wa Taifa)';
