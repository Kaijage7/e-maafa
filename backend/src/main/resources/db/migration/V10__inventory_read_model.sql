-- Read model over the existing resources + inventory_items tables (Preparedness / Emergency Supplies).
-- IF NOT EXISTS keeps production untouched. Subset of the real columns the index screen needs.
CREATE TABLE IF NOT EXISTS public.resources (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    category VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS public.inventory_items (
    id BIGSERIAL PRIMARY KEY,
    resource_id BIGINT,
    warehouse_id BIGINT,
    item_name VARCHAR(255),
    category VARCHAR(255),
    quantity INTEGER DEFAULT 0,
    batch_number VARCHAR(255),
    expiry_date DATE,
    status VARCHAR(255),
    minimum_threshold INTEGER DEFAULT 0,
    warehouse_type VARCHAR(255),
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
);
