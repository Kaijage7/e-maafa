package tz.go.pmo.dmis.response;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Port of Response\ResourceApprovalController + the PMO bulk action from
 * PMOApprovalController, on top of {@link ApprovalWorkflowEngine}: the pending
 * queue (requests at the caller's stage), my-requests with notifications,
 * the show payload with the step timeline, and approve / fast-track / reject /
 * rollback / resubmit / update-source actions.
 *
 * Role/jurisdiction scoping (the source's position-based filtering) is the IAM
 * phase's concern; local sessions act as Super Admin, who sees and may action
 * every queue in the source as well.
 */
@RestController
@RequestMapping("/v1/response/approvals")
public class ResourceApprovalController {

    private final JdbcTemplate jdbc;
    private final ApprovalWorkflowEngine engine;
    private final IncidentWorkflowService users;

    public ResourceApprovalController(JdbcTemplate jdbc, ApprovalWorkflowEngine engine,
                                      IncidentWorkflowService users) {
        this.jdbc = jdbc;
        this.engine = engine;
        this.users = users;
    }

    // ─── Queues ───

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String search) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pending_approvals", list("""
                ar.status in ('Requested','Pending Approval') and ar.workflow_status = 'pending_approval'
                """, search, "ar.created_at desc"));
        out.put("all_requests", list("1=1", search, "ar.updated_at desc"));
        return out;
    }

    @GetMapping("/my-requests")
    public Map<String, Object> myRequests(@RequestParam(required = false) String search) {
        Long userId = users.actingUserId();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("my_requests", list("ar.requested_by = " + userId, search, "ar.created_at desc"));
        out.put("notifications", jdbc.queryForList("""
                select id, type, title, message, is_read, created_at from public.resource_notifications
                where user_id = ? order by created_at desc limit 20
                """, userId));
        // Source behavior: opening the page marks everything as read
        jdbc.update("update public.resource_notifications set is_read = true, read_at = now() where user_id = ? and is_read = false", userId);
        return out;
    }

    private List<Map<String, Object>> list(String where, String search, String order) {
        List<Object> params = new ArrayList<>();
        StringBuilder sql = new StringBuilder("""
                select ar.id, ar.status, ar.workflow_status, ar.current_workflow_step,
                    ar.quantity_requested, ar.unit_of_measure, ar.justification_for_request,
                    ar.rejection_reason, ar.created_at, ar.updated_at,
                    i.id as incident_id, i.title as incident_title, i.severity_level,
                    r.name as resource_name, r.category as resource_category, u.name as requested_by_name,
                    (select aw.step_name from public.approval_workflows aw
                       where aw.approvable_type = 'App\\Models\\AllocatedResource' and aw.approvable_id = ar.id
                         and aw.step_number = ar.current_workflow_step limit 1) as current_step_name
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                join public.resources r on r.id = ar.resource_id
                left join public.users u on u.id = ar.requested_by
                where 1=1 and """).append('(').append(where).append(')');
        if (search != null && !search.isBlank()) {
            sql.append(" and (r.name ilike ? or i.title ilike ? or coalesce(u.name,'') ilike ?)");
            String like = "%" + search + "%";
            params.add(like);
            params.add(like);
            params.add(like);
        }
        sql.append(" order by ").append(order).append(" limit 100");
        return jdbc.queryForList(sql.toString(), params.toArray());
    }

    // ─── Show + timeline ───

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        Map<String, Object> allocation = findOr404(id);
        Map<String, Object> out = new LinkedHashMap<>(jdbc.queryForMap("""
                select ar.*, i.title as incident_title, i.id as incident_pk, r.name as resource_name,
                       r.category as resource_category, ru.name as requested_by_name,
                       au.name as approved_by_name, rj.name as rejected_by_name, w.name as warehouse_name
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                join public.resources r on r.id = ar.resource_id
                left join public.users ru on ru.id = ar.requested_by
                left join public.users au on au.id = ar.approved_by
                left join public.users rj on rj.id = ar.rejected_by
                left join public.warehouses w on w.id = coalesce(ar.warehouse_id, ar.deployed_from_warehouse)
                where ar.id = ?
                """, id));
        out.put("workflow", engine.workflowStatus(id));
        out.put("warehouses", jdbc.queryForList("select id, name from public.warehouses order by name"));
        // Local sessions act as Super Admin (can approve/edit anything, as in the source)
        out.put("can_approve", "pending_approval".equals(allocation.get("workflow_status")));
        out.put("can_edit", "requires_revision".equals(allocation.get("workflow_status")));
        return out;
    }

    // ─── Actions ───

    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/approve")
    public Map<String, Object> approve(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        findOr404(id);
        Map<String, Object> result = engine.approve(id, remarks(body));
        boolean complete = "approved".equals(result.get("workflow_status"));
        return Map.of("success", true, "message", "Request approved successfully. "
                + (complete ? "Request fully approved and ready for dispatch!" : "Forwarded to next approver."),
                "workflow_status", result.get("workflow_status"));
    }

    @PreAuthorize(Authz.RESPONSE_OVERSIGHT)
    @PostMapping("/{id}/fast-track")
    public Map<String, Object> fastTrack(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        findOr404(id);
        engine.fastTrack(id, remarks(body));
        return Map.of("success", true,
                "message", "Request fully approved via fast track! The requestor has been notified.");
    }

    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/reject")
    public ResponseEntity<Map<String, Object>> reject(@PathVariable long id, @RequestBody Map<String, Object> body) {
        findOr404(id);
        String reason = strOf(body.get("rejection_reason"));
        if (reason == null || reason.length() > 500) {
            return ResponseEntity.unprocessableEntity().body(Map.of("success", false, "message", "Validation failed.",
                    "errors", Map.of("rejection_reason", List.of("The rejection reason field is required."))));
        }
        engine.reject(id, reason);
        return ResponseEntity.ok(Map.of("success", true, "message", "Request rejected. The requestor has been notified."));
    }

    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/rollback")
    public ResponseEntity<Map<String, Object>> rollback(@PathVariable long id, @RequestBody Map<String, Object> body) {
        findOr404(id);
        String reason = strOf(body.get("rollback_reason"));
        if (reason == null || reason.length() > 500) {
            return ResponseEntity.unprocessableEntity().body(Map.of("success", false, "message", "Validation failed.",
                    "errors", Map.of("rollback_reason", List.of("The rollback reason field is required."))));
        }
        engine.rollback(id, reason);
        return ResponseEntity.ok(Map.of("success", true, "message", "Request rolled back to requestor for revision."));
    }

    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/resubmit")
    public Map<String, Object> resubmit(@PathVariable long id) {
        findOr404(id);
        engine.resubmit(id);
        return Map.of("success", true, "message", "Request resubmitted successfully and sent for approval.");
    }

    /** Approvers may redirect the fulfilment source (warehouse/agency/procurement). */
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/update-source")
    @Transactional
    public Map<String, Object> updateSource(@PathVariable long id, @RequestBody Map<String, Object> body) {
        findOr404(id);
        String source = strOf(body.get("source"));
        if (source == null || !List.of("warehouse", "agency", "procurement").contains(source)) {
            throw new tz.go.pmo.dmis.common.error.BusinessRuleException("The selected source is invalid.");
        }
        Long warehouseId = body.get("warehouse_id") == null ? null
                : (long) Double.parseDouble(String.valueOf(body.get("warehouse_id")));
        jdbc.update("""
                update public.allocated_resources set source = ?, warehouse_id = ?,
                    source_details = case when ? = 'warehouse' and ? is not null then 'warehouse:' || ?
                                          when ? = 'warehouse' then 'warehouse:pending' else ? end,
                    updated_at = now()
                where id = ?
                """, source, warehouseId, source, warehouseId, warehouseId, source, source, id);
        return Map.of("success", true, "message", "Source updated successfully.");
    }

    /** PMO bulk approve (PMOApprovalController::bulkApprove) — fast-tracks each id. */
    @PreAuthorize(Authz.RESPONSE_OVERSIGHT)
    @PostMapping("/bulk-approve")
    public Map<String, Object> bulkApprove(@RequestBody Map<String, Object> body) {
        Object raw = body.get("ids");
        if (!(raw instanceof List<?> ids) || ids.isEmpty()) {
            throw new tz.go.pmo.dmis.common.error.BusinessRuleException("Select at least one request to approve.");
        }
        int done = 0;
        List<String> failures = new ArrayList<>();
        for (Object idObj : ids) {
            long id = (long) Double.parseDouble(String.valueOf(idObj));
            try {
                engine.fastTrack(id, strOf(body.get("remarks")));
                done++;
            } catch (Exception e) {
                failures.add("#" + id + ": " + e.getMessage());
            }
        }
        return Map.of("success", true, "approved", done, "failures", failures,
                "message", done + " request(s) approved." + (failures.isEmpty() ? "" : " Some items failed."));
    }

    // ─── helpers ───

    private Map<String, Object> findOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.allocated_resources where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Allocation not found.");
        }
        return rows.get(0);
    }

    private static String remarks(Map<String, Object> body) {
        return body == null ? null : strOf(body.get("remarks"));
    }

    private static String strOf(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
