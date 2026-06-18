-- "Know Your Hazards" education cards, managed in Content Management (previously hardcoded in the
-- landing view). Bilingual descriptions + a configurable click-through link per card.
CREATE TABLE IF NOT EXISTS public.portal_hazard_cards (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100),
    icon VARCHAR(50),
    color VARCHAR(20),
    description_en TEXT,
    description_sw TEXT,
    link VARCHAR(255) DEFAULT '/education',
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
