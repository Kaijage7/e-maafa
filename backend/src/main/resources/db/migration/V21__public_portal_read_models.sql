-- Public portal content tables (Content Management feeds these; the public landing reads them).
-- Mirrors Laravel's 2026_03_25 create_portal_management_tables + 2026_04_09 create_portal_news_table.
-- IF NOT EXISTS keeps production (where Laravel already created them) untouched.

-- Key/value settings grouped by section (hero, stats, about, emergency, footer, capabilities)
CREATE TABLE IF NOT EXISTS public.portal_settings (
    id BIGSERIAL PRIMARY KEY,
    "group" VARCHAR(50),
    key VARCHAR(100) UNIQUE,
    value TEXT,
    type VARCHAR(20) DEFAULT 'text',
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Hero slider slides (slide_type: alerts | about | hazards | custom)
CREATE TABLE IF NOT EXISTS public.portal_slides (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255),
    subtitle VARCHAR(255),
    content JSONB,
    slide_type VARCHAR(30) DEFAULT 'custom',
    background_image VARCHAR(255),
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Photo gallery marquee (two rows scrolling in opposite directions)
CREATE TABLE IF NOT EXISTS public.portal_gallery (
    id BIGSERIAL PRIMARY KEY,
    image_path VARCHAR(255),
    caption VARCHAR(255),
    alt_text VARCHAR(255),
    category VARCHAR(50) DEFAULT 'events',
    sort_order INTEGER DEFAULT 0,
    marquee_row SMALLINT DEFAULT 1,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- News & events articles shown on the landing + /news/{slug}
CREATE TABLE IF NOT EXISTS public.portal_news (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255),
    slug VARCHAR(255) UNIQUE,
    excerpt VARCHAR(500),
    body TEXT,
    image VARCHAR(255),
    category VARCHAR(20) DEFAULT 'news',
    published_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Flat early_warnings table — the PUBLIC map's data source (EarlyWarning::onMap in Laravel).
-- Note: distinct from the normalised warnings/warning_hazards pair (source issue EW-1).
CREATE TABLE IF NOT EXISTS public.early_warnings (
    id BIGSERIAL PRIMARY KEY,
    warning_code VARCHAR(255),
    hazard_type VARCHAR(255),
    hazard_id BIGINT,
    severity_level VARCHAR(50),
    alert_message TEXT,
    affected_regions TEXT,
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    people_at_risk INTEGER,
    show_on_map BOOLEAN DEFAULT true,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

-- Citizen hazard reports submitted from the public landing (Report Hazard wizard)
CREATE TABLE IF NOT EXISTS public.public_hazard_reports (
    id BIGSERIAL PRIMARY KEY,
    report_code VARCHAR(255),
    hazard_type VARCHAR(255),
    description TEXT,
    location_description VARCHAR(255),
    latitude NUMERIC(10,7),
    longitude NUMERIC(10,7),
    urgency_level VARCHAR(50),
    reporter_name VARCHAR(255),
    reporter_phone VARCHAR(50),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
