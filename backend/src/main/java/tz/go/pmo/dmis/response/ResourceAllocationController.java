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
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Port of Response\ResourceAllocationController: the request → forward-to-PMO →
 * approve/reject → In Transit → Deployed → Delivered chain, with the approval
 * audit trail (approval_histories).
 * Stock figures come from the inventory_items ledger (single stock truth;
 * the source read a warehouse_stocks table for display only).
 */
@RestController
@RequestMapping("/v1/response/allocations")
public class ResourceAllocationController {

    /** AllocatedResource::$statusOptions — operational vocabulary, verbatim. */
    static final List<String> STATUS_OPTIONS = List.of(
            "Requested", "Pending PMO Approval", "Pending Approval", "Approved", "In Transit",
            "Deployed", "Delivered", "Partially Fulfilled", "Fulfilled", "Sourcing", "Rejected",
            "Cancelled", "Returned", "Awaiting Dispatch Approval", "Dispatch Approved",
            "Requested to Stakeholders");

    /** updateStatus() transition matrix, verbatim. */
    private static final Map<String, List<String>> VALID_TRANSITIONS = Map.of(
            "Approved", List.of("In Transit"),
            "In Transit", List.of("Deployed", "Returned"),
            "Deployed", List.of("Delivered", "Returned"));

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService incidents;
    private final ApprovalWorkflowEngine approvals;

    public ResourceAllocationController(JdbcTemplate jdbc, IncidentWorkflowService incidents,
                                        ApprovalWorkflowEngine approvals) {
        this.jdbc = jdbc;
        this.incidents = incidents;
        this.approvals = approvals;
    }

    // ─── Index: the three operational queues + stock summary ───

    @GetMapping
    public Map<String, Object> index() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("pending_requests", queue("ar.status in ('Requested','Pending Approval')", "ar.created_at desc"));
        out.put("forwarded_requests", queue("ar.status = 'Pending PMO Approval'", "ar.forwarded_at desc"));
        out.put("active_deployments", queue("ar.status in ('Approved','Deployed','In Transit')", "ar.updated_at desc"));
        out.put("warehouse_inventory", jdbc.queryForList("""
                select w.id, w.name, coalesce(sum(ii.quantity), 0) as total_items,
                       count(*) filter (where ii.quantity < 100) as critical_items
                from public.warehouses w
                left join public.inventory_items ii on ii.warehouse_id = w.id
                group by w.id, w.name order by w.name
                """));
        out.put("available_resources", jdbc.queryForList("""
                select r.category, count(distinct r.id) as total, coalesce(sum(ii.quantity), 0) as total_quantity
                from public.resources r
                left join public.inventory_items ii on ii.resource_id = r.id
                group by r.category order by r.category
                """));
        return out;
    }

    private List<Map<String, Object>> queue(String where, String order) {
        return jdbc.queryForList("""
                select ar.id, ar.status, ar.quantity_requested, ar.quantity_allocated, ar.unit_of_measure,
                    ar.justification_for_request, ar.source_details, ar.allocation_date, ar.created_at,
                    ar.dispatched_at, ar.deployed_at, ar.delivered_at, ar.rejection_reason,
                    i.id as incident_id, i.title as incident_title, i.severity_level,
                    r.name as resource_name, r.category as resource_category,
                    ru.name as requested_by_name, fu.name as forwarded_by_name
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                join public.resources r on r.id = ar.resource_id
                left join public.users ru on ru.id = ar.requested_by
                left join public.users fu on fu.id = ar.forwarded_by
                where %s order by %s
                """.formatted(where, order));
    }

    /** Eligible incidents (approved chain OR operationally active) + catalogue with live stock. */
    @GetMapping("/form-data")
    public Map<String, Object> formData() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("incidents", jdbc.queryForList("""
                select id, title, severity_level, status, workflow_status from public.incidents
                where workflow_status = 'approved' or status in ('Active Response','Verified')
                order by severity_level asc, reported_at desc
                """));
        out.put("resources", jdbc.queryForList("""
                select r.id, r.name, r.category, r.unit_of_measure,
                       coalesce(sum(ii.quantity), 0) as available_stock
                from public.resources r
                left join public.inventory_items ii on ii.resource_id = r.id
                group by r.id order by r.category, r.name
                """));
        out.put("warehouses", jdbc.queryForList("select id, name, zone from public.warehouses order by name"));
        out.put("urgency_levels", List.of("low", "medium", "high", "critical"));
        out.put("status_options", STATUS_OPTIONS);
        return out;
    }

    // ─── Store: one request → N allocation rows (one per resource line) ───

    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping
    @Transactional
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> store(@RequestBody Map<String, Object> body) {
        Long incidentId = longOf(body.get("incident_id"));
        String justification = strOf(body.get("justification"));
        String urgency = strOf(body.get("urgency"));
        Object rawResources = body.get("resources");

        Map<String, List<String>> errors = new LinkedHashMap<>();
        if (incidentId == null) {
            errors.put("incident_id", List.of("The incident id field is required."));
        }
        if (justification == null) {
            errors.put("justification", List.of("The justification field is required."));
        } else if (justification.length() > 1000) {
            errors.put("justification", List.of("The justification must not be greater than 1000 characters."));
        }
        if (urgency == null || !List.of("low", "medium", "high", "critical").contains(urgency)) {
            errors.put("urgency", List.of("The selected urgency is invalid."));
        }
        List<Map<String, Object>> resources = rawResources instanceof List<?> l
                ? (List<Map<String, Object>>) l : List.of();
        if (resources.isEmpty()) {
            errors.put("resources", List.of("The resources field is required."));
        }
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed.", "errors", errors));
        }

        // Gate to approved/active incidents — verbatim source rule + message
        Map<String, Object> incident = incidents.findOr404(incidentId);
        boolean eligible = "approved".equals(incident.get("workflow_status"))
                || List.of("Active Response", "Verified").contains(incident.get("status"));
        if (!eligible) {
            throw new BusinessRuleException("Resources can only be requested for approved or active incidents.");
        }

        // The requester no longer picks a source: warehouse is auto-suggested (zone match
        // falls back to the first warehouse), approvers refine it later — source behavior.
        Long defaultWarehouse = jdbc.query("select id from public.warehouses order by id limit 1",
                rs -> rs.next() ? rs.getLong(1) : null);
        Long userId = incidents.actingUserId();
        List<Long> created = new ArrayList<>();
        for (Map<String, Object> line : resources) {
            Long resourceId = longOf(line.get("resource_id"));
            Integer qty = intOf(line.get("quantity"));
            if (resourceId == null || qty == null || qty < 1) {
                continue;
            }
            String uom = jdbc.query("select coalesce(unit_of_measure, 'units') from public.resources where id = ?",
                    rs -> rs.next() ? rs.getString(1) : "units", resourceId);
            Long id = jdbc.queryForObject("""
                    insert into public.allocated_resources(incident_id, resource_id, quantity_requested,
                        quantity_allocated, unit_of_measure, status, allocation_date, allocated_by_user_id,
                        requested_by, justification_for_request, source_details, created_at, updated_at)
                    values (?,?,?,?,?,'Requested',current_date,?,?,?,?,now(),now()) returning id
                    """, Long.class,
                    incidentId, resourceId, qty, qty, uom, userId, userId, justification,
                    defaultWarehouse != null ? "warehouse:" + defaultWarehouse : "warehouse:pending");
            // The generalized engine snapshots the configured role chain onto this request
            // (source: $allocation->initializeWorkflow($requesterRole))
            approvals.initialize("resource_allocation", id, null);
            created.add(id);
        }
        if (created.isEmpty()) {
            throw new BusinessRuleException("Select at least one resource with a quantity.");
        }

        // Verified incidents move into Active Response on first request — source behavior
        if ("Verified".equals(incident.get("status"))) {
            jdbc.update("update public.incidents set status = 'Active Response', updated_at = now() where id = ?", incidentId);
        }
        return ResponseEntity.ok(Map.of("success", true, "ids", created, "message",
                "Resource request submitted successfully. It is now pending approval from the District Administrative Secretary."));
    }

    // ─── Forward / Approve / Reject / Status / Track ───

    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/forward")
    @Transactional
    public Map<String, Object> forward(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> allocation = findOr404(id);
        if (!"Requested".equals(allocation.get("status"))) {
            throw new BusinessRuleException("Only requests with status \"Requested\" can be forwarded.");
        }
        Long userId = incidents.actingUserId();
        jdbc.update("""
                update public.allocated_resources set status = 'Pending PMO Approval',
                    forwarded_by = ?, forwarded_at = now(), updated_at = now() where id = ?
                """, userId, id);
        history(id, "forwarded", body == null ? null : strOf(body.get("remarks")), "Forwarded to PMO for approval");
        return Map.of("success", true, "message", "Request forwarded to PMO for approval.");
    }

    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/approve")
    @Transactional
    public Map<String, Object> approve(@PathVariable long id) {
        Map<String, Object> allocation = findOr404(id);
        if (!"Requested".equals(allocation.get("status"))) {
            throw new BusinessRuleException("This allocation cannot be approved in its current status.");
        }
        String source = (String) allocation.get("source_details");
        Long warehouse = source != null && source.startsWith("warehouse:") && !source.endsWith("pending")
                ? Long.parseLong(source.substring("warehouse:".length())) : null;
        // Keep the two approval engines in sync: if a configurable chain is
        // attached, fast-track it so its steps reflect this approval — otherwise the operational
        // status would say 'Approved' while the governance chain stayed 'pending_approval' (a
        // self-contradictory, dispatchable-yet-unapproved record / multi-level bypass).
        Long pendingSteps = jdbc.queryForObject("""
                select count(*) from public.approval_workflows
                where approvable_type = ? and approvable_id = ? and status = 'pending'
                """, Long.class, ApprovalWorkflowEngine.ALLOCATION_TYPE, id);
        if (pendingSteps != null && pendingSteps > 0) {
            approvals.fastTrack(id, "Quick-approved via resource allocation dashboard");
        }
        jdbc.update("""
                update public.allocated_resources set status = 'Approved', workflow_status = 'approved',
                    approved_by = ?, approved_at = now(),
                    deployed_from_warehouse = coalesce(?, deployed_from_warehouse), updated_at = now() where id = ?
                """, incidents.actingUserId(), warehouse, id);
        history(id, "approved", "Quick-approved via resource allocation dashboard", null);
        return Map.of("success", true, "message", "Resource allocation approved successfully.");
    }

    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/reject")
    @Transactional
    public ResponseEntity<Map<String, Object>> reject(@PathVariable long id, @RequestBody Map<String, Object> body) {
        findOr404(id);
        String reason = strOf(body.get("rejection_reason"));
        if (reason == null || reason.length() > 500) {
            return ResponseEntity.unprocessableEntity().body(Map.of("success", false, "message", "Validation failed.",
                    "errors", Map.of("rejection_reason", List.of("The rejection reason field is required."))));
        }
        jdbc.update("""
                update public.allocated_resources set status = 'Rejected', rejected_by = ?, rejected_at = now(),
                    rejection_reason = ?, updated_at = now() where id = ?
                """, incidents.actingUserId(), reason, id);
        history(id, "rejected", reason, null);
        return ResponseEntity.ok(Map.of("success", true, "message", "Resource request rejected."));
    }

    /** Deployment lifecycle transitions with the source's matrix and timestamps. */
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/status")
    @Transactional
    public Map<String, Object> updateStatus(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> allocation = findOr404(id);
        String newStatus = strOf(body.get("status"));
        String notes = strOf(body.get("notes"));
        if (newStatus == null || !List.of("In Transit", "Deployed", "Delivered", "Returned").contains(newStatus)) {
            throw new BusinessRuleException("The selected status is invalid.");
        }
        String current = (String) allocation.get("status");
        List<String> allowed = VALID_TRANSITIONS.getOrDefault(current, List.of());
        if (!allowed.isEmpty() && !allowed.contains(newStatus)) {
            throw new BusinessRuleException("Cannot transition from '" + current + "' to '" + newStatus + "'.");
        }
        Long userId = incidents.actingUserId();
        jdbc.update("update public.allocated_resources set status = ?, updated_at = now() where id = ?", newStatus, id);
        // Stamp the lifecycle timestamps the source sets per transition
        switch (newStatus) {
            case "In Transit" -> jdbc.update(
                    "update public.allocated_resources set dispatched_at = coalesce(dispatched_at, now()) where id = ?", id);
            case "Deployed" -> jdbc.update("""
                    update public.allocated_resources set deployed_at = now(),
                        received_by = coalesce(received_by, ?), received_at = coalesce(received_at, now())
                    where id = ?
                    """, userId, id);
            case "Delivered" -> jdbc.update(
                    "update public.allocated_resources set delivered_at = now() where id = ?", id);
            default -> { }
        }
        if (notes != null) {
            jdbc.update("""
                    update public.allocated_resources set allocation_notes =
                        trim(coalesce(allocation_notes, '') || E'\\n\\n' || to_char(now(), 'YYYY-MM-DD HH24:MI') || ': ' || ?)
                    where id = ?
                    """, notes, id);
        }
        history(id, "status_update", "Status changed to " + newStatus + (notes != null ? ": " + notes : ""), null);
        return Map.of("success", true, "message", "Resource status updated to " + newStatus + ".");
    }

    /** Deployment tracking timeline + audit history for the track view. */
    @GetMapping("/{id}/track")
    public Map<String, Object> track(@PathVariable long id) {
        findOr404(id); // unknown ids must 404, not leak a 500
        Map<String, Object> allocation = jdbc.queryForMap("""
                select ar.*, i.title as incident_title, i.id as incident_id, r.name as resource_name,
                       w.name as warehouse_name, u.name as requested_by_name
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                join public.resources r on r.id = ar.resource_id
                left join public.warehouses w on w.id = ar.deployed_from_warehouse
                left join public.users u on u.id = ar.requested_by
                where ar.id = ?
                """, id);
        Map<String, Object> out = new LinkedHashMap<>(allocation);
        out.put("timeline", Map.of(
                "requested", allocation.get("created_at"),
                "forwarded", allocation.get("forwarded_at") == null ? "" : allocation.get("forwarded_at"),
                "approved", allocation.get("approved_at") == null ? "" : allocation.get("approved_at"),
                "dispatched", allocation.get("dispatched_at") == null ? "" : allocation.get("dispatched_at"),
                "deployed", allocation.get("deployed_at") == null ? "" : allocation.get("deployed_at"),
                "delivered", allocation.get("delivered_at") == null ? "" : allocation.get("delivered_at")));
        out.put("history", jdbc.queryForList("""
                select ah.action, ah.remarks, ah.created_at, u.name as user_name
                from public.approval_histories ah left join public.users u on u.id = ah.user_id
                where ah.allocation_id = ? order by ah.created_at desc
                """, id));
        return out;
    }

    // ─── helpers ───

    private void history(long allocationId, String action, String remarks, String fallback) {
        jdbc.update("""
                insert into public.approval_histories(allocation_id, action, user_id, remarks, created_at, updated_at)
                values (?,?,?,?,now(),now())
                """, allocationId, action, incidents.actingUserId(), remarks != null ? remarks : fallback);
    }

    private Map<String, Object> findOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.allocated_resources where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Allocation not found.");
        }
        return rows.get(0);
    }

    private static String strOf(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Long longOf(Object v) {
        String s = strOf(v);
        return s == null ? null : (long) Double.parseDouble(s);
    }

    private static Integer intOf(Object v) {
        String s = strOf(v);
        return s == null ? null : (int) Double.parseDouble(s);
    }
}
