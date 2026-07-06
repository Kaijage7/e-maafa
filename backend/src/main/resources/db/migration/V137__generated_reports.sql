-- Registry of GENERATED official documents (NDRF annex PDFs and future filings): the system
-- renders the document from the keyed data, converts it to PDF, stores the file under the
-- storage root (auth-protected /storage/reports/** prefix) and files a row here so the
-- Reports & Analytics module lists every generated document. Rows are append-only versions —
-- re-filing after a reopen produces a NEW row/file, never an overwrite of an official record.

create table if not exists public.generated_reports (
    id           bigserial primary key,
    report_type  varchar(40) not null,   -- DLNA_ANNEX1 | RECOVERY_PLAN_ANNEX2
    title        varchar(300) not null,
    ref_no       varchar(64),
    incident_id  bigint references public.incidents (id),
    source_id    bigint,                 -- dlna_assessments.id or recovery_plans.id
    file_path    varchar(300) not null,  -- relative to the storage root, served at /api/storage/
    file_bytes   bigint,
    generated_by bigint,
    generated_at timestamp not null default now()
);

create index if not exists idx_generated_reports_incident on public.generated_reports (incident_id);
create index if not exists idx_generated_reports_type on public.generated_reports (report_type, generated_at desc);
