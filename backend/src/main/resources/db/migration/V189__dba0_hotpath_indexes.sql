-- space02 DBA-0.5 — hot-path indexes (expand-only, concurrent-safe names; IF NOT EXISTS).
-- Complements existing indexes without rewriting live write paths.

-- Allocations: status queues + area via incident join already has incident_id index
CREATE INDEX IF NOT EXISTS idx_allocated_resources_status_created
    ON public.allocated_resources (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_allocated_resources_status_updated
    ON public.allocated_resources (status, updated_at DESC);

-- EW agency bus: agency + latest issue time (submissions list)
CREATE INDEX IF NOT EXISTS idx_ew_sub_agency_issue
    ON public.ew_agency_submissions (agency, issue_date DESC NULLS LAST, created_at DESC);

-- Incidents: region + workflow (national/regional queues)
CREATE INDEX IF NOT EXISTS idx_incidents_region_status
    ON public.incidents (region_id, status)
    WHERE region_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_district_status
    ON public.incidents (district_id, status)
    WHERE district_id IS NOT NULL;

-- Budget commitments for finance/IFMIS export
CREATE INDEX IF NOT EXISTS idx_budget_commitments_status_updated
    ON public.budget_commitments (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_budget_commitments_incident
    ON public.budget_commitments (incident_id)
    WHERE incident_id IS NOT NULL;

-- Integration message ops
CREATE INDEX IF NOT EXISTS idx_integration_messages_system_created
    ON public.integration_messages (system_code, created_at DESC);
