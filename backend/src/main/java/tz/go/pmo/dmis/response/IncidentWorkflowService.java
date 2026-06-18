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
 * Chain (jurisdiction-scoped: approver per tier matched to the incident's own area;
 * only national tiers see/act across all areas):
 * <pre>
 *   district:  draft → waiting_das_approval (DED, own district) ┐
 *   regional:  waiting_ras_approval (RAS, own region) ──────────┤
 *   national:  waiting_assistant_director_approval (Asst.Director)
 *                  → waiting_director_approval (Director)
 *                  → waiting_ps_approval (PS / Permanent Secretary)
 *                  → approved
 *   Every reviewer can roll back one level (rollback_count incremented, history logged).
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

    /** Approver role that OWNS each review stage — only this role may approve/roll back at that stage. */
    private static final Map<String, Set<String>> STAGE_ROLES = Map.of(
            "waiting_das_approval", Set.of(Authz.DED),
            "rolled_back_to_das", Set.of(Authz.DED),
            "waiting_ras_approval", Set.of(Authz.RAS),
            "waiting_assistant_director_approval", Set.of(Authz.ASST_DIRECTOR),
            "waiting_director_approval", Set.of(Authz.DIRECTOR),
            "waiting_ps_approval", Set.of(Authz.SECRETARY),
            "waiting_national_approval", Set.of(Authz.DIRECTOR, Authz.SECRETARY, Authz.ASST_DIRECTOR));

    private enum Scope { DISTRICT, REGION, NATIONAL }

    /** Jurisdiction each stage is scoped to: district stages match the incident's district, region its region. */
    private static final Map<String, Scope> STAGE_SCOPE = Map.of(
            "waiting_das_approval", Scope.DISTRICT,
            "rolled_back_to_das", Scope.DISTRICT,
            "waiting_ras_approval", Scope.REGION,
            "waiting_assistant_director_approval", Scope.NATIONAL,
            "waiting_director_approval", Scope.NATIONAL,
            "waiting_ps_approval", Scope.NATIONAL,
            "waiting_national_approval", Scope.NATIONAL);

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
     * Submit a draft (or rolled-back) incident into the chain. District-origin
     * incidents go to DAS, regional-origin ones directly to RAS — exactly the
     * source's submitToDAS()/submitToRAS() pair.
     */
    @Transactional
    public String submit(long incidentId, String comments) {
        Map<String, Object> incident = findOr404(incidentId);
        String from = (String) incident.get("workflow_status");
        boolean districtOrigin = "district".equals(incident.get("origin_level"));

        List<String> submittable = districtOrigin
                ? List.of("draft", "rolled_back_to_district")
                : List.of("draft", "rolled_back_to_regional");
        if (!submittable.contains(from)) {
            throw new BusinessRuleException("This incident cannot be submitted from its current status.");
        }

        String to = districtOrigin ? "waiting_das_approval" : "waiting_ras_approval";
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
        Long userId = actingUserId();
        assertStageAccess(from, incident);   // role + jurisdiction (own district / own region / national)

        switch (from) {
            case "waiting_das_approval", "rolled_back_to_das" -> {
                transition(incidentId, "waiting_ras_approval",
                        "das_reviewed_by_user_id", "das_reviewed_at", "das_comments", userId, comments);
                logHistory(incidentId, "approved", from, "waiting_ras_approval", comments);
                notifyStage(incident, "waiting_ras_approval");
                return "waiting_ras_approval";
            }
            case "waiting_ras_approval" -> {
                transition(incidentId, "waiting_assistant_director_approval",
                        "ras_reviewed_by_user_id", "ras_reviewed_at", "ras_comments", userId, comments);
                logHistory(incidentId, "approved", from, "waiting_assistant_director_approval", comments);
                notifyStage(incident, "waiting_assistant_director_approval");
                return "waiting_assistant_director_approval";
            }
            case "waiting_assistant_director_approval" -> {
                jdbc.update("""
                        update public.incidents set workflow_status = 'waiting_director_approval',
                            assistant_director_reviewed_by_user_id = ?, assistant_director_reviewed_at = now(),
                            assistant_director_comments = ?, assistant_director_recommendation = ?, updated_at = now()
                        where id = ?
                        """, userId, comments, recommendation, incidentId);
                logHistory(incidentId, "approved", from, "waiting_director_approval", comments);
                notifyStage(incident, "waiting_director_approval");
                return "waiting_director_approval";
            }
            case "waiting_director_approval" -> {
                jdbc.update("""
                        update public.incidents set workflow_status = 'waiting_ps_approval',
                            director_reviewed_by_user_id = ?, director_reviewed_at = now(),
                            director_comments = ?, director_recommendation = ?, updated_at = now()
                        where id = ?
                        """, userId, comments, recommendation, incidentId);
                logHistory(incidentId, "approved", from, "waiting_ps_approval", comments);
                notifyStage(incident, "waiting_ps_approval");
                return "waiting_ps_approval";
            }
            case "waiting_ps_approval" -> {   // PS (Permanent Secretary) gives final national sign-off
                jdbc.update("""
                        update public.incidents set workflow_status = 'approved',
                            national_reviewed_by_user_id = ?, national_reviewed_at = now(),
                            national_comments = ?, updated_at = now()
                        where id = ?
                        """, userId, comments, incidentId);
                logHistory(incidentId, "approved", from, "approved", comments);
                notifyStage(incident, "approved");
                return "approved";
            }
            case "waiting_national_approval" -> { // legacy NC stage kept for parity
                jdbc.update("""
                        update public.incidents set workflow_status = 'approved',
                            national_reviewed_by_user_id = ?, national_reviewed_at = now(),
                            national_comments = ?, updated_at = now()
                        where id = ?
                        """, userId, comments, incidentId);
                logHistory(incidentId, "approved", from, "approved", comments);
                notifyStage(incident, "approved");
                return "approved";
            }
            default -> throw new BusinessRuleException("This incident is not at an approvable stage.");
        }
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
        boolean districtOrigin = "district".equals(incident.get("origin_level"));

        // Destination follows the source matrix: DAS→district; RAS→DAS or regional by
        // origin; Asst. Director→RAS; Director→Asst. Director.
        String to = switch (from) {
            case "waiting_das_approval" -> "rolled_back_to_district";
            case "waiting_ras_approval" -> districtOrigin ? "rolled_back_to_das" : "rolled_back_to_regional";
            case "waiting_assistant_director_approval" -> "waiting_ras_approval";
            case "waiting_director_approval" -> "waiting_assistant_director_approval";
            case "waiting_ps_approval" -> "waiting_director_approval";
            default -> throw new BusinessRuleException("This incident is not at a stage that can be rolled back.");
        };
        String role = byRole != null ? byRole : switch (from) {
            case "waiting_das_approval" -> Authz.DED;
            case "waiting_ras_approval" -> Authz.RAS;
            case "waiting_assistant_director_approval" -> Authz.ASST_DIRECTOR;
            case "waiting_ps_approval" -> Authz.SECRETARY;
            default -> Authz.DIRECTOR;
        };

        jdbc.update("""
                update public.incidents set workflow_status = ?, rollback_count = rollback_count + 1,
                    last_rollback_at = now(), last_rollback_by_role = ?,
                    assigned_to_role = case when ? in ('Asst. Director','Director') then null else assigned_to_role end,
                    updated_at = now()
                where id = ?
                """, to, role, role, incidentId);
        stampReviewer(incidentId, from, comments);
        logHistory(incidentId, "rolled_back", from, to, comments);
        notifyStage(incident, to);
        return to;
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
            case "rolled_back_to_das" -> "waiting_ras_approval";
            case "rolled_back_to_district" -> "waiting_das_approval";
            case "rolled_back_to_regional" -> "waiting_ras_approval";
            default -> throw new BusinessRuleException("This incident has not been rolled back, nothing to resubmit.");
        };
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
        switch (stage) {
            case "waiting_das_approval" -> jdbc.update(
                    "update public.incidents set das_reviewed_by_user_id = ?, das_reviewed_at = now(), das_comments = coalesce(?, das_comments) where id = ?",
                    userId, comments, incidentId);
            case "waiting_ras_approval" -> jdbc.update(
                    "update public.incidents set ras_reviewed_by_user_id = ?, ras_reviewed_at = now(), ras_comments = coalesce(?, ras_comments) where id = ?",
                    userId, comments, incidentId);
            case "waiting_assistant_director_approval" -> jdbc.update(
                    "update public.incidents set assistant_director_reviewed_by_user_id = ?, assistant_director_reviewed_at = now(), assistant_director_comments = coalesce(?, assistant_director_comments) where id = ?",
                    userId, comments, incidentId);
            case "waiting_director_approval" -> jdbc.update(
                    "update public.incidents set director_reviewed_by_user_id = ?, director_reviewed_at = now(), director_comments = coalesce(?, director_comments) where id = ?",
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
            case "waiting_das_approval", "rolled_back_to_das" ->
                    usersByRoleInArea(Authz.DED, "district_id", districtId);   // at/back-to the DISTRICT → DED acts
            case "waiting_ras_approval", "rolled_back_to_regional" ->
                    usersByRoleInArea(Authz.RAS, "region_id", regionId);       // at/back-to the REGION → RAS acts
            case "waiting_assistant_director_approval", "rolled_back_to_national" ->
                    usersByRole(Authz.ASST_DIRECTOR);
            case "waiting_director_approval" -> usersByRole(Authz.DIRECTOR);
            case "waiting_ps_approval" -> usersByRole(Authz.SECRETARY);
            // back below the district (to the original reporter to correct) — or finished: ping the reporter
            case "rolled_back_to_district", "approved" -> {
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
