-- C2 (national stakeholders feedback): public "Know Your Hazards" cards already carry bilingual
-- DESCRIPTIONS (description_en / description_sw) but the hazard NAME was English-only. Add a Swahili
-- name and backfill the standard cards with accurate Swahili so the public hub/cards render the
-- hazard name in the citizen's language. The English `name` stays the slug/route-key and the fallback
-- (the frontend shows name_sw only when the page is in Swahili and name_sw is present).
alter table public.portal_hazard_cards add column if not exists name_sw text;

update public.portal_hazard_cards set name_sw = case name
        when 'Flood'             then 'Mafuriko'
        when 'Drought'           then 'Ukame'
        when 'Earthquake'        then 'Tetemeko la Ardhi'
        when 'Cyclone'           then 'Kimbunga'
        when 'Epidemic'          then 'Mlipuko wa Ugonjwa'
        when 'Landslide'         then 'Maporomoko ya Ardhi'
        when 'Fire'              then 'Moto'
        when 'Tsunami'           then 'Tsunami'
        when 'Building Collapse' then 'Kuporomoka kwa Jengo'
        when 'Heatwave'          then 'Wimbi la Joto'
        when 'Volcanic Eruption' then 'Mlipuko wa Volkeno'
        when 'Accident'          then 'Ajali'
        else name_sw end
where name_sw is null;

comment on column public.portal_hazard_cards.name_sw is
    'Swahili hazard name for the public Know-Your-Hazards cards/hub (C2). English `name` remains the slug/route-key and the English-fallback.';
