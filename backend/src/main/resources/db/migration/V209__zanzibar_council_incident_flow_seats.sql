-- Zanzibar has 11 administrative districts and 11 active councils, with a strict
-- one-district-to-one-council mapping in the authoritative geography. V183 filled the
-- Zanzibar incident-flow positions as district seats after V165 deliberately seeded
-- council seats for Mainland only. Incidents, however, carry council_id and the workflow
-- correctly requires an exact council match whenever that value is present. The missing
-- council attachment therefore made Zanzibar DDMC and DED look unstaffed and silently
-- skipped both approval gates.

do $$
declare
    n integer;
begin
    select count(*) into n
    from public.councils c
    where c.country_part = 'zanzibar'
      and coalesce(c.is_active, true);
    if n <> 11 then
        raise exception 'Expected 11 active Zanzibar councils, found %', n;
    end if;

    select count(*) into n
    from (
        select d.id
        from public.districts d
        left join public.councils c
          on c.district_id = d.id
         and c.country_part = 'zanzibar'
         and coalesce(c.is_active, true)
        where d.country_part = 'zanzibar'
        group by d.id
        having count(c.id) <> 1
    ) mismatched;
    if n <> 0 then
        raise exception 'Every Zanzibar district must map to exactly one active council; % district(s) do not', n;
    end if;
end $$;

-- Keep the original district position keys and emails: these remain district offices.
-- Add the operational council attachment used by visibility and workflow gates. Include
-- the two advisory/logistics seats so all district incident personas share the same exact
-- one-to-one jurisdiction as the stage owners.
update public.users u
set council_id = c.id,
    updated_at = now()
from public.councils c
where c.district_id = u.district_id
  and c.country_part = 'zanzibar'
  and coalesce(c.is_active, true)
  and coalesce(u.seeded_officer, false)
  and u.position_key like 'district:%'
  and exists (
      select 1
      from public.model_has_roles mhr
      join public.roles r on r.id = mhr.role_id
      where mhr.model_id = u.id
        and mhr.model_type = 'App\Models\User'
        and r.name in (
            'Dist DC', 'DED', 'DAS', 'District Commissioner',
            'District Planning Officer', 'District Logistic Officer'
        )
  );

update public.roles
set assignment_hint = case name
        when 'Dist DC' then 'Requires region, district and council/LGA attachment; owns the DDMC entry gate for that council/LGA.'
        when 'DED' then 'Requires region, district and council/LGA attachment; owns the DED approval stage for that council/LGA.'
        when 'DAS' then 'Requires region, district and council/LGA attachment; district leadership notifications and support for that council/LGA.'
        when 'District Commissioner' then 'Requires region, district and council/LGA attachment; district incident oversight for that council/LGA.'
        else assignment_hint
    end,
    updated_at = now()
where name in ('Dist DC', 'DED', 'DAS', 'District Commissioner');

-- Release invariant: every active Tanzania council must now have its own DDMC and DED
-- stage owner. Checking coverage rather than only raw row counts catches duplicates and
-- wrong-area attachments.
do $$
declare
    role_name text;
    missing integer;
begin
    foreach role_name in array array['Dist DC', 'DED']
    loop
        select count(*) into missing
        from public.councils c
        where coalesce(c.is_active, true)
          and not exists (
              select 1
              from public.users u
              join public.model_has_roles mhr
                on mhr.model_id = u.id
               and mhr.model_type = 'App\Models\User'
              join public.roles r on r.id = mhr.role_id
              where u.council_id = c.id
                and r.name = role_name
          );
        if missing <> 0 then
            raise exception 'Expected complete 195-council % coverage; % active council(s) are missing a seat',
                role_name, missing;
        end if;
    end loop;
end $$;

