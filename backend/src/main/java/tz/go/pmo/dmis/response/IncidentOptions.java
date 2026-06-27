package tz.go.pmo.dmis.response;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Option lists and workflow vocabulary for incidents — single source of truth,
 * ported verbatim from Admin\IncidentController (operational options) and the
 * Incident model (workflow statuses, infrastructure damage / emergency needs).
 */
public final class IncidentOptions {

    private IncidentOptions() {
    }

    /** Admin\IncidentController::$severityLevelOptions. */
    public static final List<String> SEVERITY_LEVELS =
            List.of("Minor", "Moderate", "Major", "Critical", "Unknown");

    /** Approved Font Awesome icon classes (bare, no style prefix) for the incident-type catalogue. */
    public static final List<String> INCIDENT_ICONS = List.of(
            "fa-water", "fa-house-flood-water", "fa-cloud-showers-heavy", "fa-fire", "fa-fire-flame-curved",
            "fa-wind", "fa-hurricane", "fa-tornado", "fa-volcano", "fa-mountain", "fa-house-crack",
            "fa-bolt", "fa-temperature-high", "fa-sun", "fa-snowflake", "fa-virus", "fa-biohazard",
            "fa-skull-crossbones", "fa-radiation", "fa-car-burst", "fa-ship", "fa-plane-up",
            "fa-explosion", "fa-triangle-exclamation");

    /**
     * Admin\IncidentController::$statusOptions — order matters: the registry sorts by
     * this operational priority (CASE expression), then newest reported_at.
     */
    public static final List<String> STATUSES = List.of(
            "Reported", "Pending Verification", "Verified", "Active Response",
            "Monitoring", "Escalated", "Resolved", "Closed", "Information Only");

    /** Admin\IncidentController::$sourceOfReportOptions. */
    public static final List<String> SOURCES_OF_REPORT = List.of(
            "Public Hotline", "Agency Report", "Field Officer Report", "Media Report",
            "EOCC Direct Log", "SMS Report", "Mobile App Report", "USSD Report", "Other");

    /** IncidentUpdate::$updateTypeOptions. */
    public static final List<String> UPDATE_TYPES = List.of(
            "General Update", "Action Taken", "Decision Logged", "Resource Status Update",
            "External Communication", "Observation", "Escalation Note", "Resolution Update", "Other");

    /** Incident::INFRASTRUCTURE_DAMAGE_OPTIONS (checkbox key → label). */
    public static final Map<String, String> INFRASTRUCTURE_DAMAGE = new LinkedHashMap<>();

    /** Incident::EMERGENCY_NEEDS_OPTIONS (multi-select key → label). */
    public static final Map<String, String> EMERGENCY_NEEDS = new LinkedHashMap<>();

    /** Incident::getWorkflowStatuses() (workflow_status → label). */
    public static final Map<String, String> WORKFLOW_STATUSES = new LinkedHashMap<>();

    /** Incident::ASSISTANT_DIRECTOR_ROLES — valid forward targets besides 'Director'. */
    public static final List<String> ASSISTANT_DIRECTOR_ROLES = List.of(
            "Asst. Director", "EOCC", "Assistant Director EOCC", "Assistant Director Operation",
            "Assistant Director Research", "Assistant Director One Health");

    static {
        INFRASTRUCTURE_DAMAGE.put("house_damaged", "House Damaged");
        INFRASTRUCTURE_DAMAGE.put("house_destroyed", "House Destroyed");
        INFRASTRUCTURE_DAMAGE.put("roads", "Roads");
        INFRASTRUCTURE_DAMAGE.put("bridge_damaged", "Bridge Damaged");
        INFRASTRUCTURE_DAMAGE.put("health_facility", "Health Facility");
        INFRASTRUCTURE_DAMAGE.put("power_line_affected", "Power Line Affected");
        INFRASTRUCTURE_DAMAGE.put("water_supply_system", "Water Supply System");
        INFRASTRUCTURE_DAMAGE.put("school", "School");

        EMERGENCY_NEEDS.put("emergency_shelter", "Emergency Shelter");
        EMERGENCY_NEEDS.put("food_and_water", "Food and Water");
        EMERGENCY_NEEDS.put("medical_assistance", "Medical Assistance");
        EMERGENCY_NEEDS.put("wash", "WASH");
        EMERGENCY_NEEDS.put("non_food_items", "Non-food Items");
        EMERGENCY_NEEDS.put("logistic_support", "Logistic Support");
        EMERGENCY_NEEDS.put("other", "Other (specify)");

        WORKFLOW_STATUSES.put("draft", "Draft");
        // Escalation ladder (INCIDENT-WORKFLOW-PLAN.md): DDMC → DED → RDMC → RAS → EOCC → Director → PS.
        WORKFLOW_STATUSES.put("waiting_ddmc", "Waiting for DDMC (District Coordinator)");
        WORKFLOW_STATUSES.put("waiting_ded", "Waiting for DED");
        WORKFLOW_STATUSES.put("waiting_rdmc", "Waiting for RDMC (Regional Coordinator)");
        WORKFLOW_STATUSES.put("waiting_ras", "Waiting for RAS");
        WORKFLOW_STATUSES.put("waiting_eocc", "Waiting for EOCC");
        WORKFLOW_STATUSES.put("waiting_director", "Waiting for Director (DMD)");
        WORKFLOW_STATUSES.put("waiting_ps", "Waiting for PS (Permanent Secretary)");
        WORKFLOW_STATUSES.put("closed_rumor", "Closed — Rumour / Normal Case");
        WORKFLOW_STATUSES.put("resolved", "Resolved (handled locally)");
        WORKFLOW_STATUSES.put("waiting_das_approval", "Waiting for DAS Approval");
        WORKFLOW_STATUSES.put("waiting_ras_approval", "Waiting for RAS Approval");
        WORKFLOW_STATUSES.put("waiting_national_approval", "Waiting for Asst. Director Review");
        WORKFLOW_STATUSES.put("waiting_assistant_director_approval", "Waiting for Asst. Director Approval");
        WORKFLOW_STATUSES.put("waiting_director_approval", "Waiting for Director");
        WORKFLOW_STATUSES.put("waiting_ps_approval", "Waiting for PS (Permanent Secretary)");
        WORKFLOW_STATUSES.put("approved", "Approved");
        WORKFLOW_STATUSES.put("rejected", "Rejected");
        WORKFLOW_STATUSES.put("rolled_back_to_district", "Rolled Back to District Coordinator");
        WORKFLOW_STATUSES.put("rolled_back_to_das", "Rolled Back to DAS");
        WORKFLOW_STATUSES.put("rolled_back_to_regional", "Rolled Back to Regional Coordinator");
        WORKFLOW_STATUSES.put("rolled_back_to_national", "Rolled Back to National Coordinator");
    }

    /** Registry sort: CASE status WHEN ... THEN priority — verbatim ordering rule. */
    public static String statusOrderCase() {
        StringBuilder sql = new StringBuilder("CASE status ");
        for (int i = 0; i < STATUSES.size(); i++) {
            sql.append("WHEN '").append(STATUSES.get(i)).append("' THEN ").append(i + 1).append(' ');
        }
        return sql.append("ELSE ").append(STATUSES.size() + 1).append(" END").toString();
    }

    public static String workflowStatusLabel(String status) {
        return WORKFLOW_STATUSES.getOrDefault(status, status == null ? "" : status);
    }
}
