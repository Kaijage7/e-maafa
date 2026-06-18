-- Content Management: educational content + partner agencies.
-- Mirrors Laravel create_educational_contents_table + create_agencies_table. IF NOT EXISTS keeps prod untouched.

CREATE TABLE IF NOT EXISTS public.educational_contents (
    id BIGSERIAL PRIMARY KEY,
    title VARCHAR(255),
    content_type VARCHAR(100),          -- Guideline, Bulletin, Article …
    summary TEXT,
    full_content TEXT,
    author VARCHAR(255),
    publication_date DATE,
    target_audience VARCHAR(255),
    keywords VARCHAR(255),
    document_path VARCHAR(255),
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.agencies (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    acronym VARCHAR(50),
    agency_type VARCHAR(100),           -- Government, NGO, Private Sector …
    mandate_description TEXT,
    contact_person_name VARCHAR(255),
    contact_person_email VARCHAR(255),
    contact_person_phone VARCHAR(50),
    office_address TEXT,
    website VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
