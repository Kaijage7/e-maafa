package tz.go.pmo.dmis.response;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.SecurityUtils;
import tz.go.pmo.dmis.notification.NotificationService;

/**
 * Port of App\Services\ApprovalWorkflowService + the HasApprovalWorkflow trait —
 * the generalized, Settings-configurable approval engine:
 *
 * <pre>
 *   approval_workflow_modules        which model types run through the engine
 *   approval_workflow_configurations the role chain per module (level/order/skip)
 *   approval_workflows               per-record step instances (snapshot at init)
 *   resource_notifications           in-app notices to approvers and requesters
 * </pre>
 *
 * Lifecycle mirrors the source exactly: initialize snapshots the active chain
 * (skipping the requester's own role), approve advances step-by-step until
 * 'approved', reject ends at 'rejected', rollback sends to 'requires_revision',
 * resubmit resets every step to pending, fast-track approves all remaining steps.
 */
@Service
public class ApprovalWorkflowEngine {

    private static final Logger log = LoggerFactory.getLogger(ApprovalWorkflowEngine.class);

    /** Polymorphic type stored on step rows — kept as the Laravel FQCN for data parity. */
    static final String ALLOCATION_TYPE = "App\\Models\\AllocatedResource";

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService users; // reused for actingUserId()
    private final NotificationService notifications; // the ONE dispatcher (in-app feed + channels)

    public ApprovalWorkflowEngine(JdbcTemplate jdbc, IncidentWorkflowService users,
                                  NotificationService notifications) {
        this.jdbc = jdbc;
        this.users = users;
        this.notifications = notifications;
    }

    /**
     * Snapshot the module's active chain into per-record steps. The requester's own
     * role is skipped so nobody approves their own request (source rule).
     */
    @Transactional
    public void initialize(String moduleCode, long allocationId, String requesterRole) {
        Long moduleId = jdbc.query(
                "select id from public.approval_workflow_modules where module_code = ? and is_active = true",
                rs -> rs.next() ? rs.getLong(1) : null, moduleCode);
        if (moduleId == null) {
            log.warn("Approval workflow module not found or inactive: {}", moduleCode);
            return;
        }
        List<Map<String, Object>> configs = jdbc.queryForList("""
                select name, role_required, "order" from public.approval_workflow_configurations
                where module_id = ? and is_active = true order by "order", level
                """, moduleId);
        if (configs.isEmpty()) {
            log.warn("No active configurations found for module: {}", moduleCode);
            return;
        }
        int step = 1;
        for (Map<String, Object> config : configs) {
            if (requesterRole != null && requesterRole.equals(config.get("role_required"))) {
                continue; // requester never approves their own request
            }
            jdbc.update("""
                    insert into public.approval_workflows(module_id, approvable_type, approvable_id,
                        step_number, step_name, approver_role, status, "order", created_at, updated_at)
                    values (?,?,?,?,?,?,'pending',?,now(),now())
                    """, moduleId, ALLOCATION_TYPE, allocationId, step,
                    config.get("name"), config.get("role_required"), config.get("order"));
            step++;
        }
        jdbc.update("""
                update public.allocated_resources set workflow_status = 'pending_approval',
                    current_workflow_step = 1, workflow_initiated_at = now(), updated_at = now()
                where id = ?
                """, allocationId);
        notifyNextApprover(allocationId);
    }

    /** Approve the current step; advances or completes the chain. */
    @Transactional
    public Map<String, Object> approve(long allocationId, String remarks) {
        Map<String, Object> step = currentStepOrFail(allocationId);
        Long userId = users.actingUserId();
        assertNotRequester(allocationId, userId);   // maker ≠ checker (segregation of duties)
        assertStepRole(step);                       // only the role designated for THIS step may action it
        jdbc.update("""
                update public.approval_workflows set status = 'approved', user_id = ?, action_at = now(),
                    remarks = ?, updated_at = now() where id = ?
                """, userId, remarks, step.get("id"));

        Map<String, Object> next = nextPendingStep(allocationId);
        if (next != null) {
            jdbc.update("update public.allocated_resources set current_workflow_step = ?, updated_at = now() where id = ?",
                    next.get("step_number"), allocationId);
            notifyNextApprover(allocationId);
            return Map.of("workflow_status", "pending_approval", "next_step", next.get("step_name"));
        }
        completeAsApproved(allocationId);
        notifyRequester(allocationId, "approval_granted", "Request approved",
                "Your resource request has been fully approved and is ready for dispatch.");
        return Map.of("workflow_status", "approved");
    }

    /** Reject ends the chain at the current step. */
    @Transactional
    public void reject(long allocationId, String reason) {
        Map<String, Object> step = currentStepOrFail(allocationId);
        assertStepRole(step);   // only the role designated for THIS step may reject it
        jdbc.update("""
                update public.approval_workflows set status = 'rejected', user_id = ?, action_at = now(),
                    rejection_reason = ?, updated_at = now() where id = ?
                """, users.actingUserId(), reason, step.get("id"));
        jdbc.update("""
                update public.allocated_resources set workflow_status = 'rejected', status = 'Rejected',
                    rejected_by = ?, rejected_at = now(), rejection_reason = ?,
                    current_workflow_step = null, workflow_completed_at = now(), updated_at = now()
                where id = ?
                """, users.actingUserId(), reason, allocationId);
        notifyRequester(allocationId, "approval_rejected", "Request rejected", reason);
    }

    /** Rollback to the requester for corrections ('Requires Revision' in the queues). */
    @Transactional
    public void rollback(long allocationId, String reason) {
        assertStepRole(currentStepOrFail(allocationId)); // at a pending step + actioned by the step's role
        jdbc.update("""
                update public.allocated_resources set workflow_status = 'requires_revision',
                    status = 'Requires Revision', current_workflow_step = null, updated_at = now()
                where id = ?
                """, allocationId);
        notifyRequester(allocationId, "rollback", "Request needs revision", reason);
    }

    /** Resubmit after corrections: every step resets to pending, chain restarts at 1. */
    @Transactional
    public void resubmit(long allocationId) {
        String workflowStatus = jdbc.queryForObject(
                "select workflow_status from public.allocated_resources where id = ?", String.class, allocationId);
        if (!"requires_revision".equals(workflowStatus)) {
            throw new BusinessRuleException("Only requests that require revision can be resubmitted.");
        }
        jdbc.update("""
                update public.approval_workflows set status = 'pending', user_id = null, action_at = null,
                    remarks = null, rejection_reason = null, updated_at = now()
                where approvable_type = ? and approvable_id = ?
                """, ALLOCATION_TYPE, allocationId);
        jdbc.update("""
                update public.allocated_resources set workflow_status = 'pending_approval', status = 'Requested',
                    current_workflow_step = 1, workflow_initiated_at = now(), workflow_completed_at = null,
                    updated_at = now()
                where id = ?
                """, allocationId);
        notifyNextApprover(allocationId);
    }

    /** Fast-track (Super Admin): approve every remaining step at once. */
    @Transactional
    public void fastTrack(long allocationId, String remarks) {
        Long userId = users.actingUserId();
        assertNotRequester(allocationId, userId);   // maker ≠ checker (even an admin cannot fast-track their own request)
        String userName = jdbc.query("select name from public.users where id = ?",
                rs -> rs.next() ? rs.getString(1) : "Admin", userId);
        int updated = jdbc.update("""
                update public.approval_workflows set status = 'approved', user_id = ?, action_at = now(),
                    remarks = coalesce(?, 'Fast-tracked by ' || ?), updated_at = now()
                where approvable_type = ? and approvable_id = ? and status = 'pending'
                """, userId, remarks, userName, ALLOCATION_TYPE, allocationId);
        if (updated == 0) {
            throw new BusinessRuleException("No pending approval steps to fast track.");
        }
        completeAsApproved(allocationId);
        notifyRequester(allocationId, "approval_granted", "Request approved",
                "Your resource request was fast-tracked and fully approved.");
    }

    /** The full step list + progress, shaped like the source's getWorkflowStatus(). */
    public Map<String, Object> workflowStatus(long allocationId) {
        List<Map<String, Object>> steps = jdbc.queryForList("""
                select aw.step_number, aw.step_name, aw.approver_role, aw.status, aw.action_at,
                       aw.remarks, aw.rejection_reason, u.name as actioned_by
                from public.approval_workflows aw
                left join public.users u on u.id = aw.user_id
                where aw.approvable_type = ? and aw.approvable_id = ?
                order by aw.step_number
                """, ALLOCATION_TYPE, allocationId);
        long approved = steps.stream().filter(s -> "approved".equals(s.get("status"))).count();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("steps", steps);
        out.put("total_steps", steps.size());
        out.put("approved_steps", approved);
        out.put("progress", steps.isEmpty() ? 0 : Math.round(approved * 100.0 / steps.size()));
        return out;
    }

    // ── internals ──

    /**
     * Maker-checker: the user who submitted a request can NEVER approve or fast-track it, whatever the
     * chain configuration. This is the enforcement backstop — it holds even though the chain is currently
     * initialised with a null requester role (which by itself would leave the requester's role in their own
     * chain). Keyed on the person (requested_by), not the role, which is the correct segregation-of-duties test.
     */
    private void assertNotRequester(long allocationId, Long approverUserId) {
        if (approverUserId == null) {
            return;   // the unauthenticated path is already blocked upstream by @PreAuthorize
        }
        Long requesterId = jdbc.query(
                "select requested_by from public.allocated_resources where id = ?",
                rs -> rs.next() && rs.getObject(1) != null ? rs.getLong(1) : null, allocationId);
        if (approverUserId.equals(requesterId)) {
            throw new BusinessRuleException(
                    "You submitted this request, so you cannot approve it (segregation of duties).");
        }
    }

    /**
     * The current step may only be actioned by the role the chain designated for it (its {@code approver_role}).
     * Super Admin is the documented override (system administration). A step with no role requirement is open
     * to any operator (the controller's {@code RESPONSE_OPERATE} gate still applies). This makes the configured
     * DAS→RAS→Director chain actually binding, not just advisory.
     */
    private void assertStepRole(Map<String, Object> step) {
        String requiredRole = step == null ? null : (String) step.get("approver_role");
        if (requiredRole == null || requiredRole.isBlank()) {
            return;
        }
        Set<String> roles = SecurityUtils.currentUserRoles();
        if (roles.contains(Authz.SUPER_ADMIN) || roles.contains(requiredRole)) {
            return;
        }
        throw new BusinessRuleException(
                "This approval step is assigned to the '" + requiredRole + "' role; your role is not authorised to action it.");
    }

    private Map<String, Object> currentStepOrFail(long allocationId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select aw.* from public.approval_workflows aw
                join public.allocated_resources ar on ar.id = aw.approvable_id
                where aw.approvable_type = ? and aw.approvable_id = ?
                  and aw.step_number = ar.current_workflow_step and aw.status = 'pending'
                """, ALLOCATION_TYPE, allocationId);
        if (rows.isEmpty()) {
            throw new BusinessRuleException("This request has no pending approval step.");
        }
        return rows.get(0);
    }

    private Map<String, Object> nextPendingStep(long allocationId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select step_number, step_name from public.approval_workflows
                where approvable_type = ? and approvable_id = ? and status = 'pending'
                order by step_number limit 1
                """, ALLOCATION_TYPE, allocationId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void completeAsApproved(long allocationId) {
        jdbc.update("""
                update public.allocated_resources set workflow_status = 'approved', status = 'Approved',
                    approved_by = ?, approved_at = now(), current_workflow_step = null,
                    workflow_completed_at = now(), updated_at = now()
                where id = ?
                """, users.actingUserId(), allocationId);
    }

    /** In-app notification to every user holding the next step's role (via the one dispatcher). */
    private void notifyNextApprover(long allocationId) {
        Map<String, Object> next = nextPendingStepWithRole(allocationId);
        if (next == null) {
            return;
        }
        notifications.notifyRoles(List.of(String.valueOf(next.get("approver_role"))),
                NotificationService.Notice.inApp("approval_request", "Approval required",
                        "A resource request awaits your approval at step: " + next.get("step_name"),
                        "/m/response/approvals", "allocation", allocationId, "info"));
    }

    private Map<String, Object> nextPendingStepWithRole(long allocationId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select step_name, approver_role from public.approval_workflows
                where approvable_type = ? and approvable_id = ? and status = 'pending'
                order by step_number limit 1
                """, ALLOCATION_TYPE, allocationId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void notifyRequester(long allocationId, String type, String title, String message) {
        List<Long> requester = jdbc.queryForList(
                "select requested_by from public.allocated_resources where id = ? and requested_by is not null",
                Long.class, allocationId);
        if (requester.isEmpty()) {
            return;
        }
        notifications.notifyUser(requester.get(0),
                NotificationService.Notice.inApp(type, title, message,
                        "/m/response/approvals", "allocation", allocationId, "info"));
    }
}
