-- Seed the statutory declaration authorities as roles so the declaration chain can be separated by
-- authority instead of one broad command tier driving propose→declare. Disaster Management Act No. 6 of 2022:
--   s.32  Minister gazettes a Disaster Area
--   s.33  President proclaims a State of Emergency
--   s.10  National Technical Committee reviews a proposed declaration
--   s.8(1)(d)  National Steering Committee endorses / advises the declaring authority
-- Idempotent: only inserts names not already present. Ids = current max + 1..N (roles.id is seeded
-- explicitly, not from a sequence, so no setval is needed).
insert into public.roles (id, name, guard_name, created_at, updated_at)
select (select coalesce(max(id), 0) from public.roles) + row_number() over (order by ord),
       r.name, 'web', now(), now()
from (values
        ('Minister', 1),
        ('President', 2),
        ('National Technical Committee', 3),
        ('National Steering Committee', 4)
     ) as r(name, ord)
where not exists (select 1 from public.roles x where x.name = r.name);
