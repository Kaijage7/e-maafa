-- space02 DBA-3 — Integration foundation (non-breaking).
-- Prepares honest adapter landing for NIDA/LATRA/NAPA/IFMIS/EW pull without dual-writing core tables.
-- Does NOT implement external clients; registry + message log + identity map only.

CREATE TABLE IF NOT EXISTS public.integration_endpoints (
    id              BIGSERIAL PRIMARY KEY,
    system_code     VARCHAR(40)  NOT NULL,          -- NIDA, LATRA, NAPA, IFMIS, TMA, MOW, ...
    display_name    VARCHAR(160) NOT NULL,
    base_url        TEXT,
    auth_type       VARCHAR(40)  NOT NULL DEFAULT 'none',  -- none|api_key|oauth2|mtls|hmac
    status          VARCHAR(32)  NOT NULL DEFAULT 'planned', -- planned|configured|live|disabled|error
    direction       VARCHAR(24)  NOT NULL DEFAULT 'bidirectional', -- inbound|outbound|bidirectional
    notes           TEXT,
    config_json     JSONB,
    last_success_at TIMESTAMPTZ,
    last_error_at   TIMESTAMPTZ,
    last_error      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_integration_endpoints_code UNIQUE (system_code)
);

CREATE TABLE IF NOT EXISTS public.integration_messages (
    id              BIGSERIAL PRIMARY KEY,
    endpoint_id     BIGINT REFERENCES public.integration_endpoints(id) ON DELETE SET NULL,
    system_code     VARCHAR(40)  NOT NULL,
    direction       VARCHAR(16)  NOT NULL,   -- inbound|outbound
    message_type    VARCHAR(80)  NOT NULL,   -- e.g. nida.verify, ifmis.commitment_export
    correlation_id  VARCHAR(120),
    idempotency_key VARCHAR(160),
    status          VARCHAR(32)  NOT NULL DEFAULT 'received', -- received|validated|applied|failed|rejected|retry
    http_status     INT,
    payload_hash    VARCHAR(64),
    payload_ref     TEXT,                    -- pointer/storage key — avoid large PII blobs in-row when possible
    error_detail    TEXT,
    attempts        INT          NOT NULL DEFAULT 0,
    next_retry_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_integration_messages_idem
    ON public.integration_messages (system_code, idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_integration_messages_corr
    ON public.integration_messages (correlation_id);

CREATE INDEX IF NOT EXISTS ix_integration_messages_status
    ON public.integration_messages (status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.external_identity_map (
    id              BIGSERIAL PRIMARY KEY,
    system_code     VARCHAR(40)  NOT NULL,
    external_id     VARCHAR(160) NOT NULL,
    local_table     VARCHAR(80)  NOT NULL,   -- e.g. users, stakeholders, agencies
    local_id        BIGINT       NOT NULL,
    meta_json       JSONB,
    verified_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_external_identity UNIQUE (system_code, external_id, local_table)
);

CREATE INDEX IF NOT EXISTS ix_external_identity_local
    ON public.external_identity_map (local_table, local_id);

-- Seed planned national/sector endpoints (honest: status=planned, no fake live URLs).
INSERT INTO public.integration_endpoints (system_code, display_name, auth_type, status, direction, notes)
VALUES
    ('TMA',   'Tanzania Meteorological Authority', 'api_key', 'planned', 'inbound',
     'EW entity bus already accepts submissions; optional official API pull adapter later.'),
    ('MOW',   'Ministry of Water', 'api_key', 'planned', 'inbound',
     'Same EW agency bus (mow). Hydromet tier contributor.'),
    ('GST',   'Geological Survey of Tanzania', 'api_key', 'planned', 'inbound', 'EW overlay agency.'),
    ('MOH',   'Ministry of Health', 'api_key', 'planned', 'inbound', 'EW + One Health path.'),
    ('MOA',   'Ministry of Agriculture', 'api_key', 'planned', 'inbound', 'EW agency bus.'),
    ('NEMC',  'National Environment Management Council', 'api_key', 'planned', 'inbound', 'EW agency bus.'),
    ('NIDA',  'National Identification Authority', 'oauth2', 'planned', 'outbound',
     'Verify-only design: yes/no + hashed ref. Never store full citizen dumps in DMIS.'),
    ('LATRA', 'Land Transport Regulatory Authority', 'api_key', 'planned', 'inbound',
     'Logistics/road exposure; currently INFORM/comms proxy in impact-support.'),
    ('NAPA',  'National Adaptation / planning programmes', 'api_key', 'planned', 'bidirectional',
     'Programme code mapping to recovery/strategic projects — not live ERP.'),
    ('IFMIS', 'National financial management (IFMIS/MUSE class)', 'api_key', 'planned', 'bidirectional',
     'DMIS remains disaster ops ledger; export commitments / import payment confirmations via adapters.'),
    ('MGOV',  'M-Gov SMS gateway', 'hmac', 'configured', 'outbound',
     'Real client in code; production keys + DLR registration are ops gates.'),
    ('SMTP',  'Email SMTP', 'none', 'configured', 'outbound',
     'Spring Mail; production credentials required.')
ON CONFLICT (system_code) DO NOTHING;
