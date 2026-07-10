-- F63: persist actual received quantity on stakeholder donation bids so allocation
-- roll-up sums real intake, not quantity_offered (partial deliveries were over-counted).
ALTER TABLE public.stakeholder_resource_bids
    ADD COLUMN IF NOT EXISTS received_quantity numeric(12, 2);

COMMENT ON COLUMN public.stakeholder_resource_bids.received_quantity IS
    'Actual quantity intaken at receive(); null until status=Received. Roll-up uses this, not quantity_offered.';
