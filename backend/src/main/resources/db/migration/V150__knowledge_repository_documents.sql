-- F43: make the Recovery knowledge repository a real document library.
-- Additive only: existing metadata-only entries stay valid, and documents/incidents are optional.
alter table public.disaster_knowledge_repositories
    add column if not exists incident_id bigint,
    add column if not exists file_path varchar(255),
    add column if not exists file_name varchar(255),
    add column if not exists file_content_type varchar(120),
    add column if not exists file_size_bytes bigint;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'disaster_knowledge_repositories_incident_id_fkey'
    ) then
        alter table public.disaster_knowledge_repositories
            add constraint disaster_knowledge_repositories_incident_id_fkey
            foreign key (incident_id) references public.incidents(id) on delete set null;
    end if;
end $$;

create index if not exists idx_dkr_incident_id on public.disaster_knowledge_repositories(incident_id);
create index if not exists idx_dkr_file_path on public.disaster_knowledge_repositories(file_path);
