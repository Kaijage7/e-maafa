-- V90 — EW Monitoring: entity updates (revision flow) + OSINT disaster scanner.
-- IDEMPOTENT on purpose: the standalone EWS shares this database and already created these objects via DDL,
-- so every statement is IF NOT EXISTS / ADD COLUMN IF NOT EXISTS and is a safe no-op where they exist.

-- Monitoring stream ④: an entity can post an UPDATE under an already-issued warning's index.
ALTER TABLE public.ew_agency_submissions ADD COLUMN IF NOT EXISTS warning_code varchar(50);
ALTER TABLE public.ew_agency_submissions ADD COLUMN IF NOT EXISTS parent_submission_id bigint;
ALTER TABLE public.ew_agency_submissions ADD COLUMN IF NOT EXISTS revision int DEFAULT 1;
ALTER TABLE public.ew_agency_submissions ADD COLUMN IF NOT EXISTS is_update boolean DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_eas_warning_code ON public.ew_agency_submissions(warning_code);

-- Monitoring stream ①/②: OSINT + regional/sectorial detections.
CREATE TABLE IF NOT EXISTS public.scanner_detections (
  id              bigserial PRIMARY KEY,
  source_id       varchar(40),
  external_id     varchar(200),
  dedup_key       varchar(200) UNIQUE,
  title           text,
  summary         text,
  url             text,
  hazard_type     varchar(40),
  severity        varchar(20),
  reliability     varchar(20),
  region          varchar(120),
  district        varchar(120),
  latitude        double precision,
  longitude       double precision,
  published_at    timestamp,
  detected_at     timestamp DEFAULT now(),
  status          varchar(20) DEFAULT 'new',
  dispatched_as   varchar(40),
  dispatched_ref  varchar(80),
  assigned_entity varchar(16),
  incident_id     bigint,
  raw             json
);
CREATE INDEX IF NOT EXISTS idx_scandet_status ON public.scanner_detections(status);

-- Monitoring stream ③: detections routed to an entity for verification (the inbox).
CREATE TABLE IF NOT EXISTS public.scanner_entity_taskings (
  id            bigserial PRIMARY KEY,
  detection_id  bigint NOT NULL REFERENCES public.scanner_detections(id),
  agency        varchar(16) NOT NULL,
  hazard_type   varchar(40),
  region        varchar(120),
  status        varchar(20) NOT NULL DEFAULT 'awaiting',
  message       text,
  requested_at  timestamp NOT NULL DEFAULT now(),
  responded_submission_id bigint,
  responded_at  timestamp
);
CREATE INDEX IF NOT EXISTS idx_set_agency_status ON public.scanner_entity_taskings(agency, status);
CREATE INDEX IF NOT EXISTS idx_set_detection ON public.scanner_entity_taskings(detection_id);
