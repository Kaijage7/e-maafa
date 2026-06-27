package tz.go.pmo.dmis.response;

import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.SecurityUtils;
import tz.go.pmo.dmis.notification.NotificationService;

/**
 * The incident approval chain, ported from the Incident model's workflow methods
 * (submitToDAS/RAS, approveBy*, rollbackBy*, forwardBy*, resubmitBy*) which the
 * source drives through IncidentReportController's per-role dashboards.
 *
 * Escalation ladder (INCIDENT-WORKFLOW-PLAN.md; jurisdiction-scoped — each approver matched to the
 * incident's own area, national tiers act across all areas):
 * <pre>
 *   report → waiting_ddmc (DDMC = Dist DC, district entry gate) ─┐  no roll-back; escalate OR close-rumour
 *   district:  → waiting_ded  (DED, own district)                │
 *   region:    → waiting_rdmc (RDMC = Reg DC) → waiting_ras (RAS) │
 *   national:  → waiting_eocc (EOCC) → waiting_director (Director)│
 *                  → waiting_ps (PS / Permanent Secretary) → approved
 *   Every approver above the DDMC can roll back one level (rollback_count++, history logged).
 *   The DDMC may instead closeAsRumor() → closed_rumor, informing the district leadership (DED + DAS).
 * </pre>
 *
 * Stage gates here check BOTH the workflow position and role+jurisdiction:
 * {@link #assertStageAccess} requires the acting user to hold the stage's role and,
 * for area-scoped stages (DED↔district, RAS↔region), to belong to the incident's
 * own area. National tiers (Asst.Director/Director/PS) are not area-bound. Super
 * Admin overrides for local/break-glass sessions.
 */
@Service
public class IncidentWorkflowService {

    private static final Logger log = LoggerFactory.getLogger(IncidentWorkflowService.class);

    private final JdbcTemplate jdbc;
    private final NotificationService notifications;

    public IncidentWorkflowService(JdbcTemplate jdbc, NotificationService notifications) {
        this.jdbc = jdbc;
        this.notifications = notifications;
    }

    // Escalation ladder (INCIDENT-WORKFLOW-PLAN.md): report → DDMC → DED → RDMC → RAS → EOCC → Director → PS.
    /** Approver role that OWNS each review stage — only this role may approve/roll back at that stage. */
    private static final Map<String, Set<String>> STAGE_ROLES = Map.of(
            "waiting_ddmc", Set.of(Authz.DIST_DC),       // DDMC = District Disaster Coordinator (entry gate)
            "waiting_ded", Set.of(Authz.DED),
            "waiting_rdmc", Set.of(Authz.REG_DC),        // RDMC = Regional Disaster Coordinator
            "waiting_ras", Set.of(Authz.RAS),
            "waiting_eocc", Set.of(Authz.EOCC),
            "waiting_director", Set.of(Authz.DIRECTOR),
            "waiting_ps", Set.of(Authz.SECRETARY));

    private enum Scope { DISTRICT, REGION, NATIONAL }

    /** Jurisdiction each stage is scoped to. */
    private static final Map<String, Scope> STAGE_SCOPE = Map.of(
            "waiting_ddmc", Scope.DISTRICT,
            "waiting_ded", Scope.DISTRICT,
            "waiting_rdmc", Scope.REGION,
            "waiting_ras", Scope.REGION,
            "waiting_eocc", Scope.NATIONAL,
            "waiting_director", Scope.NATIONAL,
            "waiting_ps", Scope.NATIONAL);

    /** Approve advances to the next stage; the last stage marks the incident approved. */
    private static final Map<String, String> NEXT_STAGE = Map.of(
            "waiting_ddmc", "waiting_ded",
            "waiting_ded", "waiting_rdmc",
            "waiting_rdmc", "waiting_ras",
            "waiting_ras", "waiting_eocc",
            "waiting_eocc", "waiting_director",
            "waiting_director", "waiting_ps",
            "waiting_ps", "approved");

    /** Roll back to the previous approver. DDMC (the entry) is absent — it has no roll-back. */
    private static final Map<String, String> PREV_STAGE = Map.of(
            "waiting_ded", "waiting_ddmc",
            "waiting_rdmc", "waiting_ded",
            "waiting_ras", "waiting_rdmc",
            "waiting_eocc", "waiting_ras",
            "waiting_director", "waiting_eocc",
            "waiting_ps", "waiting_director");

    /**
     * Enforce that the actor owns the incident's current stage — the correct ROLE and, for district/region
     * stages, the correct AREA (their own district/region). National stages are nation-wide. Super Admin is
     * the documented override. STRICT: an officer with no area assigned cannot action an area-scoped stage.
     * This is the role/jurisdiction check the source deferred to "the IAM layer".
     */
    private void assertStageAccess(String stage, Map<String, Object> incident) {
        Set<String> required = STAGE_ROLES.get(stage);
        if (required == null || required.isEmpty()) {
            return;
        }
        Set<String> mine = SecurityUtils.currentUserRoles();
        if (mine.contains(Authz.SUPER_ADMIN)) {
            return;
        }
        if (mine.stream().noneMatch(required::contains)) {
            throw new BusinessRuleException("This stage is owned by " + String.join(" / ", required)
                    + "; your role is not authorised to action it.");
        }
        Scope scope = STAGE_SCOPE.getOrDefault(stage, Scope.NATIONAL);
        if (scope == Scope.NATIONAL) {
            return;
        }
        Map<String, Object> me = jdbc.queryForMap(
                "select region_id, district_id from public.users where id = ?", actingUserId());
        if (scope == Scope.DISTRICT) {
            Long myDistrict = asLong(me.get("district_id"));
            if (myDistrict == null || !myDistrict.equals(asLong(incident.get("district_id")))) {
                throw new BusinessRuleException(
                        "This incident is in another district; only the DED for its own district can action it.");
            }
        } else { // REGION
            Long myRegion = asLong(me.get("region_id"));
            if (myRegion == null || !myRegion.equals(asLong(incident.get("region_id")))) {
                throw new BusinessRuleException(
                        "This incident is in another region; only the RAS for its own region can action it.");
            }
        }
    }

    private static Long asLong(Object o) {
        return o instanceof Number n ? n.longValue() : null;
    }

    /**
     * Area-ownership guard for the chain ENTRY points (submit / resubmit): an area officer may only push an
     * incident in their OWN district/region into the review chain — a wrong-area officer must not be able to
     * submit (or re-submit) another district's incident they cannot even read. Super Admin and national logins
     * (no area id) are exempt. Mirrors the scope half of {@link #assertStageAccess}.
     */
    private void assertActorInIncidentArea(Map<String, Object> incident) {
        if (SecurityUtils.currentUserRoles().contains(Authz.SUPER_ADMIN)) {
            return;
        }
        Map<String, Object> me = jdbc.queryForMap(
                "select region_id, district_id from public.users where id = ?", actingUserId());
        Long myDistrict = asLong(me.get("district_id"));
        Long myRegion = asLong(me.get("region_id"));
        if (myDistrict != null && !myDistrict.equals(asLong(incident.get("district_id")))) {
            throw new BusinessRuleException("This incident is in another district; you can only submit incidents in your own district.");
        }
        if (myDistrict == null && myRegion != null && !myRegion.equals(asLong(incident.get("region_id")))) {
            throw new BusinessRuleException("This incident is in another region; you can only submit incidents in your own region.");
        }
    }

    /**
     * Submit a draft (or rolled-back) incident into the chain. District-origin
     * incidents go to DAS, regional-origin ones directly to RAS — exactly the
     * source's submitToDAS()/submitToRAS() pair.
     */
    @Transactional
    public String submit(long incidentId, String comments) {
        Map<String, Object> incident = findOr404(incidentId);
        String from = (String) incident.get("workflow_status");
        if (!List.of("draft", "rolled_back_to_district", "rolled_back_to_regional").contains(from)) {
            throw new BusinessRuleException("This incident cannot be submitted from its current status.");
        }
        assertActorInIncidentArea(incident);   // only the incident's own area (or national) may submit it
        // Any report (citizen or officer) enters the ladder at its coordinator: a regional-origin report at the
        // RDMC, everything else at the DDMC (the district entry gate that confirms presence or closes a rumor).
        boolean regionalOrigin = "regional".equals(incident.get("origin_level"));
        String to = regionalOrigin ? "waiting_rdmc" : "waiting_ddmc";
        jdbc.update("""
                update public.incidents set workflow_status = ?, submitted_by_user_id = ?,
                    submitted_at = now(), updated_at = now()
                where id = ?
                """, to, actingUserId(), incidentId);
        logHistory(incidentId, "submitted", from, to, comments);
        notifyStage(incident, to);
        return to;
    }

    /**
     * Approve at the current review stage. Each stage advances exactly as the
     * source model does: DAS→RAS, RAS→Asst. Director, Asst. Director/Director→approved.
     */
    @Transactional
    public String approve(long incidentId, String comments, String recommendation) {
        Map<String, Object> incident = findOr404(incidentId);
        String from = (String) incident.get("workflow_status");
        assertStageAccess(from, incident);   // role + jurisdiction (own district / own region / national)
        String to = NEXT_STAGE.get(from);
        if (to == null) {
            throw new BusinessRuleException("This incident is not at an approvable stage.");
        }
        // Stamp the acting stage's reviewer columns where one exists (DED/RAS/Director/PS); the workflow
        // history is the full audit trail for every stage including the coordinator/EOCC stages.
        stampReviewer(incidentId, from, comments);
        jdbc.update("update public.incidents set workflow_status = ?, updated_at = now() where id = ?", to, incidentId);
        String note = recommendation == null || recommendation.isBlank()
                ? comments
                : ((comments == null ? "" : comments + " ") + "[recommendation: " + recommendation + "]");
        logHistory(incidentId, "approved", from, to, note);
        notifyStage(incident, to);
        return to;
    }

    /** Roll back one level; comments are mandatory in the source for every rollback. */
    @Transactional
    public String rollback(long incidentId, String comments, String byRole) {
        if (comments == null || comments.isBlank()) {
            throw new BusinessRuleException("The comments field is required.");
        }
        Map<String, Object> incident = findOr404(incidentId);
        String from = (String) incident.get("workflow_status");
        assertStageAccess(from, incident);   // role + jurisdiction (own district / own region / national)
        // Roll back to the previous approver in the ladder. The DDMC entry has no level below it, so it is
        // absent from PREV_STAGE — it closes a rumor instead of rolling back.
        String to = PREV_STAGE.get(from);
        if (to == null) {
            throw new BusinessRuleException(
                    "This stage cannot be rolled back — the DDMC entry has no level below it (close it as a rumor instead).");
        }
        String role = byRole != null ? byRole : String.join(" / ", STAGE_ROLES.getOrDefault(from, java.util.Set.of()));
        jdbc.update("""
                update public.incidents set workflow_status = ?, rollback_count = rollback_count + 1,
                    last_rollback_at = now(), last_rollback_by_role = ?, updated_at = now()
                where id = ?
                """, to, role, incidentId);
        logHistory(incidentId, "rolled_back", from, to, comments);
        notifyStage(incident, to);
        return to;
    }

    /**
     * DDMC gatekeeper: close an incident at the entry stage as a rumour / normal (non-disaster) case, and
     * inform the district leadership (DED + DAS) for the record. The DDMC has no roll-back; this is its other
     * outcome besides escalating to the DED.
     */
    @Transactional
    public void closeAsRumor(long incidentId, String comments) {
        Map<String, Object> incident = findOr404(incidentId);
        String from = (String) incident.get("workflow_status");
        if (!"waiting_ddmc".equals(from)) {
            throw new BusinessRuleException("Only an incident at the DDMC entry stage can be closed as a rumour/normal case.");
        }
        assertStageAccess(from, incident);   // the DDMC of the incident's own district
        jdbc.update("update public.incidents set workflow_status = 'closed_rumor', status = 'Closed', updated_at = now() where id = ?",
                incidentId);
        // history 'action' is a checked vocabulary (no 'closed'); a rumour-close is a rejection of an
        // un-credible report — the to_status 'closed_rumor' carries the specific meaning.
        logHistory(incidentId, "rejected", from, "closed_rumor",
                comments == null || comments.isBlank() ? "Closed by DDMC — rumour / normal case." : comments);
        notifyStage(incident, "closed_rumor");   // informs DED + DAS of the district (see resolveStageRecipients)
    }

    /**
     * Resource-sufficiency RESOLVE (the alternative to escalating). At the DED (district) or RAS (region)
     * stage, when resources have been provided locally (district budget / warehouses / mobilised
     * stakeholders) the approver resolves the incident here instead of escalating up — and the level above
     * is informed for the record (see {@code resolveStageRecipients} for "resolved"). Insufficient resources →
     * use {@link #approve} to escalate to the next tier instead.
     */
    @Transactional
    public String resolve(long incidentId, String comments) {
        Map<String, Object> incident = findOr404(incidentId);
        String from = (String) incident.get("workflow_status");
        if (!List.of("waiting_ded", "waiting_ras").contains(from)) {
            throw new BusinessRuleException(
                    "Only the DED (district) or RAS (region) may resolve an incident locally; other stages escalate or roll back.");
        }
        assertStageAccess(from, incident);   // role + jurisdiction (own district / own region)
        jdbc.update("update public.incidents set workflow_status = 'resolved', status = 'Resolved', updated_at = now() where id = ?",
                incidentId);
        logHistory(incidentId, "completed", from, "resolved",
                comments == null || comments.isBlank() ? "Resolved locally — resources sufficient." : comments);
        notifyStage(incident, "resolved");   // inform the levels above that it was handled
        return "resolved";
    }

    /**
     * Forward to a specific Assistant Director role or to the Director — the
     * source's forwardByNationalCoordinator / forwardByAssistantDirectorToDirector /
     * forwardByDirectorToAssistantDirector merged on the same stage rules.
     */
    @Transactional
    public String forward(long incidentId, String toRole, String recommendation) {
        List<String> validRoles = new java.util.ArrayList<>(IncidentOptions.ASSISTANT_DIRECTOR_ROLES);
        validRoles.add("Director");
        if (toRole == null || !validRoles.contains(toRole)) {
            throw new BusinessRuleException("The selected forward target role is invalid.");
        }
        Map<String, Object> incident = findOr404(incidentId);
        String from = (String) incident.get("workflow_status");
        assertStageAccess(from, incident);   // only the role that owns this stage may forward it
        if (!List.of("waiting_national_approval", "waiting_assistant_director_approval",
                "waiting_director_approval", "rolled_back_to_national").contains(from)) {
            throw new BusinessRuleException("This incident is not at a stage that can be forwarded.");
        }
        String to = "Director".equals(toRole)
                ? "waiting_director_approval"
                : "waiting_assistant_director_approval";
        jdbc.update("""
                update public.incidents set workflow_status = ?, assigned_to_role = ?, updated_at = now()
                where id = ?
                """, to, toRole, incidentId);
        stampReviewer(incidentId, from, null);
        logHistory(incidentId, "edited", from, to,
                "Forwarded to " + toRole + ". Recommendation: " + (recommendation == null ? "" : recommendation));
        notifyStage(incident, to);   // ping the reviewer it was forwarded to (Director / Asst.Director)
        return to;
    }

    /** Resubmit after a rollback — DAS variant from the source (rolled_back_to_das → RAS). */
    @Transactional
    public String resubmit(long incidentId, String comments) {
        Map<String, Object> incident = findOr404(incidentId);
        String from = (String) incident.get("workflow_status");
        String to = switch (from) {
            case "rolled_back_to_district" -> "waiting_ddmc";
            case "rolled_back_to_regional" -> "waiting_rdmc";
            case "rolled_back_to_das" -> "waiting_ded";
            case "rolled_back_to_national" -> "waiting_eocc";
            default -> throw new BusinessRuleException("This incident has not been rolled back, nothing to resubmit.");
        };
        assertActorInIncidentArea(incident);   // only the incident's own area (or national) may resubmit it
        jdbc.update("update public.incidents set workflow_status = ?, updated_at = now() where id = ?", to, incidentId);
        logHistory(incidentId, "resubmitted", from, to, comments);
        notifyStage(incident, to);   // the corrected incident now waits for the next approver — ping them
        return to;
    }

    /**
     * Operational status actions bound by routes/response.php to controller methods
     * that do not exist in the source (escalate/verify/close — added here):
     * they move the OPERATIONAL status column and log to the same audit trail.
     */
    @Transactional
    public void setOperationalStatus(long incidentId, String newStatus, String comments) {
        Map<String, Object> incident = findOr404(incidentId);
        if (!IncidentOptions.STATUSES.contains(newStatus)) {
            throw new BusinessRuleException("The selected status is invalid.");
        }
        String from = (String) incident.get("status");
        jdbc.update("update public.incidents set status = ?, updated_at = now() where id = ?", newStatus, incidentId);
        logHistory(incidentId, "edited", from, newStatus,
                comments == null ? "Operational status changed to " + newStatus : comments);
    }

    // ── internals ──

    /** Stamps the reviewer columns matching the stage that acted. */
    private void stampReviewer(long incidentId, String stage, String comments) {
        Long userId = actingUserId();
        // Map the new ladder stages onto the existing reviewer columns (DED→das, RAS→ras, Director→director,
        // PS→national). The DDMC/RDMC/EOCC stages have no dedicated column — the workflow history is their record.
        switch (stage) {
            case "waiting_ded" -> jdbc.update(
                    "update public.incidents set das_reviewed_by_user_id = ?, das_reviewed_at = now(), das_comments = coalesce(?, das_comments) where id = ?",
                    userId, comments, incidentId);
            case "waiting_ras" -> jdbc.update(
                    "update public.incidents set ras_reviewed_by_user_id = ?, ras_reviewed_at = now(), ras_comments = coalesce(?, ras_comments) where id = ?",
                    userId, comments, incidentId);
            case "waiting_director" -> jdbc.update(
                    "update public.incidents set director_reviewed_by_user_id = ?, director_reviewed_at = now(), director_comments = coalesce(?, director_comments) where id = ?",
                    userId, comments, incidentId);
            case "waiting_ps" -> jdbc.update(
                    "update public.incidents set national_reviewed_by_user_id = ?, national_reviewed_at = now(), national_comments = coalesce(?, national_comments) where id = ?",
                    userId, comments, incidentId);
            default -> { }
        }
    }

    private void transition(long incidentId, String to, String byCol, String atCol, String commentsCol,
                            Long userId, String comments) {
        jdbc.update("update public.incidents set workflow_status = ?, %s = ?, %s = now(), %s = ?, updated_at = now() where id = ?"
                .formatted(byCol, atCol, commentsCol), to, userId, comments, incidentId);
    }

    void logHistory(long incidentId, String action, String from, String to, String comments) {
        Long userId = actingUserId();
        String role = jdbc.query("""
                select r.name from public.roles r
                join public.model_has_roles mhr on mhr.role_id = r.id and mhr.model_id = ?
                limit 1
                """, rs -> rs.next() ? rs.getString(1) : "Unknown", userId == null ? -1L : userId);
        jdbc.update("""
                insert into public.incident_workflow_histories(incident_id, user_id, from_status, to_status,
                    action, performed_by_role, comments, created_at, updated_at)
                values (?,?,?,?,?,?,?,now(),now())
                """, incidentId, userId, from, to, action, role, comments);
    }

    Map<String, Object> findOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.incidents where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Incident not found.");
        }
        return rows.get(0);
    }

    /** users.id of the acting user; local-profile sessions resolve to the seeded admin. */
    Long actingUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            try {
                return Long.parseLong(jwt.getSubject());
            } catch (NumberFormatException localSubjectIsNotNumeric) {
                // fall through to the admin lookup below
            }
        }
        return jdbc.query("select id from public.users where email = 'admin@example.com'",
                rs -> rs.next() ? rs.getLong(1) : null);
    }

    // ─── Stage notifications: ping the officers who now own the incident (in-app + email, never SMS) ───

    /**
     * After a transition, notify the officers who now own the incident's new stage — area-scoped (the DED
     * of its district, the RAS of its region) or national (Asst.Director/Director/PS), plus the reporter on
     * final approval. In-app + email only; SMS stays silent by design. Never fails the workflow transaction.
     */
    private void notifyStage(Map<String, Object> incident, String stage) {
        try {
            List<Long> recipients = resolveStageRecipients(stage, incident);
            if (recipients.isEmpty()) {
                return;
            }
            long incidentId = ((Number) incident.get("id")).longValue();
            String title = str(incident.get("title"));
            String area = str(incident.get("district_name"));
            String region = str(incident.get("region_name"));
            String where = area == null ? region : (region == null ? area : area + ", " + region);
            String stageLabel = IncidentOptions.workflowStatusLabel(stage);
            boolean approved = "approved".equals(stage);
            String noticeTitle = approved ? "Incident approved: " + title
                    : "Incident needs your action: " + stageLabel;
            String message = approved
                    ? "Incident '" + title + "' (" + where + ") has completed the approval chain and is now APPROVED."
                    : "Incident '" + title + "' (" + where + ") has reached the '" + stageLabel
                      + "' stage and is pending your review.";
            String severity = "Critical".equalsIgnoreCase(str(incident.get("severity_level")))
                    ? "critical" : "warning";
            NotificationService.Notice notice = new NotificationService.Notice(
                    "incident_workflow", noticeTitle, message,
                    "/m/response/incidents/" + incidentId, "incident", incidentId, severity,
                    false, true);   // sms=false (silent) · email=true · in-app always delivered
            notifications.notifyUsers(recipients, notice);
        } catch (Exception notifyFailureMustNotBreakWorkflow) {
            log.warn("Incident stage-notify failed (workflow continues): {}",
                    notifyFailureMustNotBreakWorkflow.toString());
        }
    }

    /** Officers who own the given stage: district→DED of its district, region→RAS of its region,
     *  national→all Asst.Director/Director/PS, and the reporter on final approval. */
    private List<Long> resolveStageRecipients(String stage, Map<String, Object> incident) {
        Long regionId = asLong(incident.get("region_id"));
        Long districtId = asLong(incident.get("district_id"));
        return switch (stage) {
            case "waiting_ddmc" -> usersByRoleInArea(Authz.DIST_DC, "district_id", districtId);  // DDMC of the district
            case "waiting_ded" -> usersByRoleInArea(Authz.DED, "district_id", districtId);        // DED of the district
            case "waiting_rdmc" -> usersByRoleInArea(Authz.REG_DC, "region_id", regionId);        // RDMC of the region
            case "waiting_ras" -> usersByRoleInArea(Authz.RAS, "region_id", regionId);            // RAS of the region
            case "waiting_eocc" -> usersByRole(Authz.EOCC);
            case "waiting_director" -> usersByRole(Authz.DIRECTOR);
            case "waiting_ps" -> usersByRole(Authz.SECRETARY);
            // DDMC closed it as a rumour/normal case → inform the district leadership (DED + DAS) for the record.
            case "closed_rumor" -> {
                List<Long> r = new java.util.ArrayList<>(usersByRoleInArea(Authz.DED, "district_id", districtId));
                r.addAll(usersByRoleInArea(Authz.DAS, "district_id", districtId));
                yield r;
            }
            // resolved locally → inform the levels above (region RAS/RC + national EOCC) for the record.
            case "resolved" -> {
                List<Long> r = new java.util.ArrayList<>(usersByRoleInArea(Authz.RAS, "region_id", regionId));
                r.addAll(usersByRoleInArea(Authz.RC, "region_id", regionId));
                r.addAll(usersByRole(Authz.EOCC));
                yield r;
            }
            // finished, or rolled back to the legacy district entry: ping the original reporter.
            case "approved", "rolled_back_to_district" -> {
                Long reporter = asLong(incident.get("submitted_by_user_id"));
                yield reporter != null ? List.of(reporter) : List.of();
            }
            default -> List.of();
        };
    }

    private List<Long> usersByRoleInArea(String role, String areaColumn, Long areaId) {
        if (areaId == null) {
            return List.of();
        }
        return jdbc.queryForList(
                "select u.id from public.users u "
                + "join public.model_has_roles mhr on mhr.model_id = u.id "
                + "join public.roles r on r.id = mhr.role_id "
                + "where r.name = ? and u." + areaColumn + " = ?",
                Long.class, role, areaId);
    }

    private List<Long> usersByRole(String role) {
        return jdbc.queryForList(
                "select u.id from public.users u "
                + "join public.model_has_roles mhr on mhr.model_id = u.id "
                + "join public.roles r on r.id = mhr.role_id where r.name = ?",
                Long.class, role);
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
