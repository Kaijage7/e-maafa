package tz.go.pmo.dmis.service.impl;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.service.support.ApprovalWorkflowEngine;
import tz.go.pmo.dmis.service.ResourceApprovalService;

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
 * <p>Logic lives in service.impl (eGA); paths/JSON unchanged. Acting user via
 * {@link CurrentUserResolver}; engine retained as transitional response hub.
 */
@Service
public class ResourceApprovalServiceImpl implements ResourceApprovalService {

    private final JdbcTemplate jdbc;
    private final ApprovalWorkflowEngine engine;
    private final CurrentUserResolver users;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;

    public ResourceApprovalServiceImpl(JdbcTemplate jdbc, ApprovalWorkflowEngine engine,
                                       CurrentUserResolver users,
                                       JurisdictionScope jurisdiction,
                                       AreaGuard areaGuard) {
        this.jdbc = jdbc;
        this.engine = engine;
        this.users = users;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
    }

    // ─── Queues ───

    @Override
    public Map<String, Object> index(String search) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pending_approvals", list("""
                ar.status in ('Requested','Pending Approval') and ar.workflow_status = 'pending_approval'
                """, search, "ar.created_at desc"));
        out.put("all_requests", list("1=1", search, "ar.updated_at desc"));
        return out;
    }

    @Override
    public Map<String, Object> myRequests(String search) {
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
        // Jurisdiction visibility: resource approvals inherit the parent incident's strict area. A district
        // officer sees only that district, a regional officer sees only that region, and national roles see all.
        jurisdiction.appendAreaScope("i", sql, params);
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

    @Override
    public Map<String, Object> show(long id) {
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
        out.put("warehouses", warehouseOptions());
        // Local sessions act as Super Admin (can approve/edit anything, as in the source)
        out.put("can_approve", "pending_approval".equals(allocation.get("workflow_status")));
        out.put("can_edit", "requires_revision".equals(allocation.get("workflow_status")));
        return out;
    }

    // ─── Actions ───

    @Override
    public Map<String, Object> approve(long id, Map<String, Object> body) {
        findOr404(id);
        Map<String, Object> result = engine.approve(id, remarks(body));
        boolean complete = "approved".equals(result.get("workflow_status"));
        return Map.of("success", true, "message", "Request approved successfully. "
                + (complete ? "Request fully approved and ready for dispatch!" : "Forwarded to next approver."),
                "workflow_status", result.get("workflow_status"));
    }

    @Override
    public Map<String, Object> fastTrack(long id, Map<String, Object> body) {
        findOr404(id);
        engine.fastTrack(id, remarks(body));
        return Map.of("success", true,
                "message", "Request fully approved via fast track! The requestor has been notified.");
    }

    @Override
    public Map<String, Object> reject(long id, Map<String, Object> body) {
        findOr404(id);
        String reason = strOf(body.get("rejection_reason"));
        if (reason == null || reason.length() > 500) {
            // FE validates client-side; server still enforces. ProblemDetail message is enough for Swal.
            throw new BusinessRuleException("The rejection reason field is required.");
        }
        engine.reject(id, reason);
        return Map.of("success", true, "message", "Request rejected. The requestor has been notified.");
    }

    @Override
    public Map<String, Object> rollback(long id, Map<String, Object> body) {
        findOr404(id);
        String reason = strOf(body.get("rollback_reason"));
        if (reason == null || reason.length() > 500) {
            throw new BusinessRuleException("The rollback reason field is required.");
        }
        engine.rollback(id, reason);
        return Map.of("success", true, "message", "Request rolled back to requestor for revision.");
    }

    @Override
    public Map<String, Object> resubmit(long id) {
        findOr404(id);
        engine.resubmit(id);
        return Map.of("success", true, "message", "Request resubmitted successfully and sent for approval.");
    }

    /** Approvers may redirect the fulfilment source (warehouse/agency/procurement). */
    @Override
    @Transactional
    public Map<String, Object> updateSource(long id, Map<String, Object> body) {
        Map<String, Object> allocation = findOr404(id);
        if (!"pending_approval".equals(allocation.get("workflow_status"))) {
            throw new BusinessRuleException(
                    "Only requests pending approval can have their fulfilment source changed.");
        }
        String source = strOf(body.get("source"));
        if (source == null || !List.of("warehouse", "agency", "procurement").contains(source)) {
            throw new BusinessRuleException("The selected source is invalid.");
        }
        Long warehouseId = body.get("warehouse_id") == null ? null
                : (long) Double.parseDouble(String.valueOf(body.get("warehouse_id")));
        if (!"warehouse".equals(source)) {
            warehouseId = null;
        }
        // The redirected fulfilment warehouse must be in the caller's area (NULL area = national/shared).
        // Out-of-area target 404s rather than letting an officer redirect into a foreign warehouse.
        if (warehouseId != null) {
            areaGuard.assertWarehouseVisible("public.warehouses", warehouseId);
        }
        String sourceDetails = "warehouse".equals(source)
                ? (warehouseId == null ? "warehouse:pending" : "warehouse:" + warehouseId)
                : source;
        jdbc.update("""
                update public.allocated_resources set source = ?, warehouse_id = ?, source_details = ?,
                    updated_at = now()
                where id = ?
                """, source, warehouseId, sourceDetails, id);
        return Map.of("success", true, "message", "Source updated successfully.");
    }

    /** PMO bulk approve (PMOApprovalController::bulkApprove) — fast-tracks each id. */
    @Override
    public Map<String, Object> bulkApprove(Map<String, Object> body) {
        Object raw = body.get("ids");
        if (!(raw instanceof List<?> ids) || ids.isEmpty()) {
            throw new BusinessRuleException("Select at least one request to approve.");
        }
        int done = 0;
        List<String> failures = new ArrayList<>();
        for (Object idObj : ids) {
            long id = (long) Double.parseDouble(String.valueOf(idObj));
            try {
                // Scope each id to the caller's area (via parent incident) before fast-tracking;
                // out-of-area ids surface as a per-id failure rather than being silently approved.
                findOr404(id);
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
        // Jurisdiction: an allocation is visible/actionable only when its parent incident is in the
        // caller's strict area (national sees all). Out-of-area resolves to 404, never 403.
        areaGuard.assertParentOwn("public.allocated_resources", "incident_id", "public.incidents", id);
        return rows.get(0);
    }

    private List<Map<String, Object>> warehouseOptions() {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        jurisdiction.appendWarehouseScope("w", where, params);
        String sql = "select w.id, w.name, w.region_id, w.district_id "
                + "from public.warehouses w where " + where + " order by w.name";
        return jdbc.queryForList(sql, params.toArray());
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
