-- NBS national statistics endpoint (honest: planned bulk-reference, not live census API).
-- Population / socio-economic exposure handoff contracts only until MoU + dual-proved adapter.

INSERT INTO public.integration_endpoints (system_code, display_name, auth_type, status, direction, notes)
VALUES
    ('NBS', 'National Bureau of Statistics', 'api_key', 'planned', 'inbound',
     'Bulk population/housing reference by admin area. Not a real-time feed. '
         || 'DMIS interim denominators may use INFORM Habitat/poverty components until NBS load is dual-proved.')
ON CONFLICT (system_code) DO NOTHING;

-- Refresh honesty notes on sibling institution endpoints (no status change).
UPDATE public.integration_endpoints
SET notes = case system_code
    when 'NIDA' then
        'Verify-only design (yes/no + hashed ref). Never store full citizen dumps. Adapter contract live in API; feed not live.'
    when 'LATRA' then
        'Logistics/road exposure. DMIS logistics snapshot export available; live corridor/closure feed not connected.'
    when 'NAPA' then
        'Programme code mapping to recovery/strategic projects. Export map available; external NAPA ERP not live.'
    else notes
    end,
    updated_at = now()
WHERE system_code in ('NIDA', 'LATRA', 'NAPA');
