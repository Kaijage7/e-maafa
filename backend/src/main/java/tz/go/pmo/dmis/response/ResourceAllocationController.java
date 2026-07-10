package tz.go.pmo.dmis.response;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Port of Response\ResourceAllocationController: the request → forward-to-PMO →
 * approve/reject → In Transit → Deployed → Delivered chain, with the approval
 * audit trail (approval_histories).
 * Stock figures come from the inventory_items ledger (single stock truth;
 * the source read a warehouse_stocks table for display only).
 *
 * <p>F90 — Deployed/Delivered to an <em>incident</em> is field consumption: stock was already
 * deducted at dispatch from the source warehouse. There is no destination store on the incident
 * site, so no second ledger row is created. Warehouse-to-warehouse transfers, borrows, procurement
 * deliveries, and donation receipts <em>do</em> update destination stock.</p>
 */
@RestController
@RequestMapping("/v1/response/allocations")
public class ResourceAllocationController {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> JOURNAL = new TypeReference<>() {};

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
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;
    private final SimulationGuard simulationGuard;
    private final DispatchSupportService stock;

    public ResourceAllocationController(JdbcTemplate jdbc, IncidentWorkflowService incidents,
                                        ApprovalWorkflowEngine approvals, JurisdictionScope jurisdiction,
                                        AreaGuard areaGuard, SimulationGuard simulationGuard,
                                        DispatchSupportService stock) {
        this.jdbc = jdbc;
        this.incidents = incidents;
        this.approvals = approvals;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
        this.simulationGuard = simulationGuard;
        this.stock = stock;
    }

    // ─── Index: the three operational queues + stock summary ───

    @GetMapping
    public Map<String, Object> index() {
        areaGuard.assertNotStakeholder();   // staff queues — partners use the bidding portal, not this
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> pending = queue("ar.status in ('Requested','Pending Approval')", "ar.created_at desc");
        List<Map<String, Object>> forwarded = queue("ar.status = 'Pending PMO Approval'", "ar.forwarded_at desc");
        List<Map<String, Object>> active = queue("ar.status in ('Approved','Deployed','In Transit')", "ar.updated_at desc");
        out.put("pending_requests", pending);
        out.put("forwarded_requests", forwarded);
        out.put("active_deployments", active);
        StringBuilder wsql = new StringBuilder("""
                select w.id, w.name, w.region_id, w.district_id,
                       r.name as region_name, d.name as district_name,
                       coalesce(sum(ii.quantity), 0) as total_items,
                       count(*) filter (where ii.quantity < 100) as critical_items
                from public.warehouses w
                left join public.regions r on r.id = w.region_id
                left join public.districts d on d.id = w.district_id
                left join public.inventory_items ii on ii.warehouse_id = w.id
                where 1=1""");
        List<Object> wparams = new ArrayList<>();
        jurisdiction.appendWarehouseScope("w", wsql, wparams);
        wsql.append(" group by w.id, w.name, w.region_id, w.district_id, r.name, d.name order by w.name");
        out.put("warehouse_inventory", jdbc.queryForList(wsql.toString(), wparams.toArray()));
        out.put("available_resources", jdbc.queryForList("""
                select r.category, count(distinct r.id) as total, coalesce(sum(ii.quantity), 0) as total_quantity
                from public.resources r
                left join public.inventory_items ii on ii.resource_id = r.id
                group by r.category order by r.category
                """));
        // Honest mode: when no live allocation traffic, the surface is preparedness stocking —
        // warehouses remain area-scoped; dispatch chains activate only against incidents.
        boolean hasOps = !pending.isEmpty() || !forwarded.isEmpty() || !active.isEmpty();
        out.put("opsMode", hasOps ? "incident_response" : "preparedness");
        out.put("opsModeNote", hasOps
                ? "Live resource requests/deployments are linked to incidents in your area; source warehouses prefer the incident district/region."
                : "No open allocation traffic — use Warehouse Ops for preparedness stocking. Area-scoped stores stay visible; incident linkage begins when a request is raised against an approved/active incident.");
        return out;
    }

    private List<Map<String, Object>> queue(String where, String order) {
        // Area officers see only allocations whose incident is in their own district/region (or shared);
        // national + non-area roles keep the full view. Scope rides on the incident the request serves.
        StringBuilder sql = new StringBuilder("""
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
                where 1=1""");
        // Seed the WHERE with 1=1 and parenthesise the caller predicate: an empty `where` no longer yields
        // "where  and ..." (a 500), and a future "a or b" predicate cannot widen the area-scope clause.
        if (where != null && !where.isBlank()) {
            sql.append(" and (").append(where).append(')');
        }
        List<Object> params = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("i", sql, params);
        sql.append(" order by ").append(order);
        return jdbc.queryForList(sql.toString(), params.toArray());
    }

    /** Eligible incidents (approved chain OR operationally active) + catalogue with live stock. */
    @GetMapping("/form-data")
    public Map<String, Object> formData() {
        areaGuard.assertNotStakeholder();   // staff allocation form — not for partners
        Map<String, Object> out = new LinkedHashMap<>();
        // Area officers may only target incidents in their own region/district; national tier sees all.
        // STRICT scope mirrors store()'s assertOwn on incidents (out-of-area incidents must not be pickable).
        // Table-top drill clones are NOT allocation targets; a full-scale exercise (allow_real_ops) is.
        StringBuilder isql = new StringBuilder("""
                select id, title, severity_level, status, workflow_status from public.incidents i
                where (workflow_status = 'approved' or status in ('Active Response','Verified'))
                  and (coalesce(i.is_simulation, false) = false
                       or exists (select 1 from public.response_activations ra
                                   where ra.incident_id = i.id and ra.allow_real_ops))""");
        List<Object> iparams = new ArrayList<>();
        jurisdiction.appendAreaScope("i", isql, iparams);
        isql.append(" order by severity_level asc, reported_at desc");
        out.put("incidents", jdbc.queryForList(isql.toString(), iparams.toArray()));
        out.put("resources", jdbc.queryForList("""
                select r.id, r.name, r.category, r.unit_of_measure,
                       coalesce(sum(ii.quantity), 0) as available_stock
                from public.resources r
                left join public.inventory_items ii on ii.resource_id = r.id
                group by r.id order by r.category, r.name
                """));
        // Area stamp + zone so the form can show which store serves which incident geography.
        StringBuilder whsql = new StringBuilder("""
                select w.id, w.name, w.zone, w.region_id, w.district_id,
                       r.name as region_name, d.name as district_name,
                       lower(coalesce(w.operational_status, 'operational')) as operational_status
                from public.warehouses w
                left join public.regions r on r.id = w.region_id
                left join public.districts d on d.id = w.district_id
                where 1=1""");
        List<Object> whparams = new ArrayList<>();
        jurisdiction.appendWarehouseScope("w", whsql, whparams);
        whsql.append(" order by w.name");
        out.put("warehouses", jdbc.queryForList(whsql.toString(), whparams.toArray()));
        out.put("urgency_levels", List.of("low", "medium", "high", "critical"));
        out.put("status_options", STATUS_OPTIONS);
        out.put("warehouseSelectionPolicy",
                "On request submit the system prefers an operational warehouse in the incident district, "
                        + "then the incident region, then a national/shared store visible to the caller. "
                        + "Approvers may refine the source before dispatch.");
        return out;
    }

    // ─── Store: one request → N allocation rows (one per resource line) ───

    @PreAuthorize("hasAuthority('resource_allocation.request')")
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
        } else {
            // Drill isolation: requesting real resources for a table-top simulation is blocked.
            simulationGuard.assertNotSimulationIncident(incidentId, "requesting resources");
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
        // Jurisdiction: an area officer may only request resources against an incident in their own
        // region/district (STRICT, mirrors how the queues/form-data scope incidents). Out of area → 404,
        // so a District-A officer cannot bind a request to District-B's incident.
        areaGuard.assertOwn("public.incidents", incidentId);
        boolean eligible = "approved".equals(incident.get("workflow_status"))
                || List.of("Active Response", "Verified").contains(incident.get("status"));
        if (!eligible) {
            throw new BusinessRuleException("Resources can only be requested for approved or active incidents.");
        }

        // Requester does not free-pick a source: warehouse is auto-suggested from the incident's
        // area (district → region → national/shared), then approvers refine before dispatch.
        // Never falls back to "first warehouse by id" — that mis-linked stock across areas.
        Long preferredWarehouse = resolvePreferredWarehouse(incident);
        Long userId = incidents.actingUserId();
        List<Long> created = new ArrayList<>();
        for (Map<String, Object> line : resources) {
            Long resourceId = longOf(line.get("resource_id"));
            Integer qty = intOf(line.get("quantity"));
            if (resourceId == null || qty == null || qty < 1) {
                continue;
            }
            // Optional per-line warehouse override must still be visible under warehouse scope
            // and should prefer the incident geography (validated below).
            Long lineWarehouse = longOf(line.get("warehouse_id"));
            Long warehouse = lineWarehouse != null ? assertWarehouseUsable(lineWarehouse, incident) : preferredWarehouse;
            String uom = jdbc.query("select coalesce(unit_of_measure, 'units') from public.resources where id = ?",
                    rs -> rs.next() ? rs.getString(1) : "units", resourceId);
            Long id = jdbc.queryForObject("""
                    insert into public.allocated_resources(incident_id, resource_id, quantity_requested,
                        quantity_allocated, unit_of_measure, status, allocation_date, allocated_by_user_id,
                        requested_by, justification_for_request, source_details, deployed_from_warehouse,
                        created_at, updated_at)
                    values (?,?,?,?,?,'Requested',current_date,?,?,?,?,?,now(),now()) returning id
                    """, Long.class,
                    incidentId, resourceId, qty, qty, uom, userId, userId, justification,
                    warehouse != null ? "warehouse:" + warehouse : "warehouse:pending",
                    warehouse);
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

    @PreAuthorize("hasAuthority('resource_allocation.request')")
    @PostMapping("/{id}/forward")
    @Transactional
    public Map<String, Object> forward(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> allocation = findOr404(id);
        // Scope via the served incident (shared-or-own, mirrors the queues): an area officer may forward only
        // an allocation whose incident is in their own area; out of area → 404.
        areaGuard.assertParentOwnOrShared("public.allocated_resources", "incident_id", "public.incidents", id);
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

    @PreAuthorize("hasAuthority('resource_allocation.approve')")
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

    @PreAuthorize("hasAuthority('resource_allocation.approve')")
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
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @PostMapping("/{id}/status")
    @Transactional
    public Map<String, Object> updateStatus(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> allocation = findOr404(id);
        // Scope via the served incident (shared-or-own, mirrors the queues): a dispatch officer may transition
        // only an allocation whose incident is in their own area; out of area → 404.
        areaGuard.assertParentOwnOrShared("public.allocated_resources", "incident_id", "public.incidents", id);
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
            case "Returned" -> returnDispatchedStock(allocation, notes);
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
        // F90 — honest contract: incident-site delivery is consumption, not a second warehouse.
        String stockNote = switch (newStatus) {
            case "Deployed", "Delivered" ->
                    "Incident delivery is field consumption — stock was already deducted at dispatch; "
                            + "no destination warehouse is created or topped up.";
            case "Returned" ->
                    "Returned quantities are re-intaken to the original source store when journalled.";
            default -> "No additional stock ledger change for this transition.";
        };
        return Map.of(
                "success", true,
                "message", "Resource status updated to " + newStatus + ". " + stockNote,
                "stockEffect", stockNote);
    }

    /** Deployment tracking timeline + audit history for the track view. */
    @GetMapping("/{id}/track")
    public Map<String, Object> track(@PathVariable long id) {
        areaGuard.assertNotStakeholder();   // staff deployment tracking — not for partners
        // Jurisdiction visibility: an area officer may track only an allocation whose incident is in their own
        // district/region (or shared/null-area); national tier sees all. Out of area → 404 (mirrors the queues).
        StringBuilder where = new StringBuilder("ar.id = ?");
        List<Object> params = new ArrayList<>();
        params.add(id);
        jurisdiction.appendAreaScopeSharedOrOwn("i", where, params);
        List<Map<String, Object>> found = jdbc.queryForList("""
                select ar.*, i.title as incident_title, i.id as incident_id, r.name as resource_name,
                       w.name as warehouse_name, u.name as requested_by_name
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                join public.resources r on r.id = ar.resource_id
                left join public.warehouses w on w.id = ar.deployed_from_warehouse
                left join public.users u on u.id = ar.requested_by
                """ + " where " + where, params.toArray());
        if (found.isEmpty()) {
            throw new ResourceNotFoundException("Allocation not found.");
        }
        Map<String, Object> allocation = found.get(0);
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

    /**
     * Prefer an operational warehouse for the incident's geography, still honouring matrix-controlled
     * warehouse visibility ({@link JurisdictionScope#appendWarehouseScope}).
     * <ol>
     *   <li>Same district as the incident</li>
     *   <li>Same region (district null or matching region)</li>
     *   <li>National / shared store (region_id null) if the role may see it</li>
     *   <li>Any other warehouse visible under the caller's warehouse scope</li>
     * </ol>
     * Returns null only when no warehouse is visible at all — source stays {@code warehouse:pending}
     * for the approver to set.
     */
    private Long resolvePreferredWarehouse(Map<String, Object> incident) {
        Long districtId = longOf(incident.get("district_id"));
        Long regionId = longOf(incident.get("region_id"));
        // If region is missing but district is set, resolve parent region for tier-2 match.
        if (regionId == null && districtId != null) {
            regionId = jdbc.query("select region_id from public.districts where id = ?",
                    rs -> rs.next() ? rs.getLong(1) : null, districtId);
        }

        if (districtId != null) {
            Long id = firstWarehouse("""
                    and w.district_id = ?
                    order by case when lower(coalesce(w.operational_status,'')) = 'operational' then 0 else 1 end,
                             w.id
                    limit 1
                    """, districtId);
            if (id != null) {
                return id;
            }
        }
        if (regionId != null) {
            // Prefer warehouses stamped to this region (district-specific first, then region-level).
            Long id = firstWarehouse("""
                    and w.region_id = ?
                    order by case when w.district_id is not null then 0 else 1 end,
                             case when lower(coalesce(w.operational_status,'')) = 'operational' then 0 else 1 end,
                             w.id
                    limit 1
                    """, regionId);
            if (id != null) {
                return id;
            }
        }
        // National / shared (null area) — only if appendWarehouseScope admits them for this role.
        Long shared = firstWarehouse("""
                and w.region_id is null and w.district_id is null
                order by case when lower(coalesce(w.operational_status,'')) = 'operational' then 0 else 1 end,
                         w.id
                limit 1
                """);
        if (shared != null) {
            return shared;
        }
        return firstWarehouse("""
                order by case when lower(coalesce(w.operational_status,'')) = 'operational' then 0 else 1 end,
                         w.id
                limit 1
                """);
    }

    private Long firstWarehouse(String tailSql, Object... extraParams) {
        StringBuilder sql = new StringBuilder("select w.id from public.warehouses w where 1=1");
        List<Object> params = new ArrayList<>();
        jurisdiction.appendWarehouseScope("w", sql, params);
        sql.append(' ').append(tailSql.trim());
        // Bind every placeholder including nulls (e.g. district_id = ? with null means no match).
        for (Object p : extraParams) {
            params.add(p);
        }
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), params.toArray());
        if (rows.isEmpty()) {
            return null;
        }
        Object id = rows.get(0).get("id");
        return id instanceof Number n ? n.longValue() : null;
    }

    /**
     * Caller-supplied warehouse on a request line must be visible under warehouse scope. Area match is
     * preferred but national officers may route from a shared store; out-of-scope → 404-style business rule.
     */
    private Long assertWarehouseUsable(long warehouseId, Map<String, Object> incident) {
        StringBuilder sql = new StringBuilder("select w.id from public.warehouses w where w.id = ?");
        List<Object> params = new ArrayList<>();
        params.add(warehouseId);
        jurisdiction.appendWarehouseScope("w", sql, params);
        List<Long> found = jdbc.queryForList(sql.toString(), Long.class, params.toArray());
        if (found.isEmpty()) {
            throw new BusinessRuleException("Selected warehouse is not visible in your warehouse scope.");
        }
        // Soft preference only — do not reject a visible national store for a district incident;
        // approvers remain free to refine source before dispatch.
        return warehouseId;
    }

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

    private void returnDispatchedStock(Map<String, Object> allocation, String notes) {
        String current = String.valueOf(allocation.get("status"));
        if (!List.of("In Transit", "Deployed").contains(current)) {
            throw new BusinessRuleException("Only in-transit or deployed allocations can be returned.");
        }
        long allocationId = ((Number) allocation.get("id")).longValue();
        long resourceId = ((Number) allocation.get("resource_id")).longValue();
        String resourceName = jdbc.queryForObject("select name from public.resources where id = ?",
                String.class, resourceId);
        List<Map<String, Object>> journal = journal(allocation.get("source_details"));
        Long userId = incidents.actingUserId();
        double totalReturned = 0;

        for (Map<String, Object> entry : journal) {
            double dispatched = dbl(entry.get("quantity_dispatched"));
            if (dispatched <= 0 || dbl(entry.get("returned_quantity")) >= dispatched) {
                continue;
            }
            String sourceType = strOf(entry.get("source_type"));
            Long sourceId = longOf(entry.get("source_id"));
            if (sourceType == null || sourceId == null) {
                continue;
            }
            double returnQty = dispatched - dbl(entry.get("returned_quantity"));
            switch (sourceType) {
                case "warehouse" -> {
                    stock.addStock("zonal", sourceId, resourceId, returnQty, resourceName, userId);
                    recordReturnMovement(resourceId, returnQty, allocationId, null, null, sourceId, null, notes);
                }
                case "temporary_warehouse" -> {
                    stock.addStock("temporary", sourceId, resourceId, returnQty, resourceName, userId);
                    recordReturnMovement(resourceId, returnQty, allocationId, null, null, null, sourceId, notes);
                }
                case "agency" -> {
                    int updated = jdbc.update("""
                            update public.agency_resources set quantity = quantity + ?, updated_at = now()
                            where id = ? and resource_id = ?
                            """, returnQty, sourceId, resourceId);
                    if (updated == 0) {
                        throw new BusinessRuleException("The original agency stock line no longer exists.");
                    }
                    recordReturnMovement(resourceId, returnQty, allocationId, null, null, null, null, notes);
                }
                default -> throw new BusinessRuleException("Cannot return stock for source type " + sourceType + ".");
            }
            entry.put("returned_quantity", dispatched);
            entry.put("returned_at", java.time.OffsetDateTime.now().toString());
            entry.put("returned_by", userId);
            if (notes != null) {
                entry.put("return_notes", notes);
            }
            totalReturned += returnQty;
        }

        if (totalReturned <= 0) {
            throw new BusinessRuleException("No dispatched stock was found to return.");
        }
        saveJournal(allocationId, journal);
    }

    private void recordReturnMovement(long resourceId, double quantity, long allocationId,
                                      Long fromWarehouseId, Long fromTempWarehouseId,
                                      Long toWarehouseId, Long toTempWarehouseId, String notes) {
        Long userId = incidents.actingUserId();
        jdbc.update("""
                insert into public.stock_movements(resource_id, quantity, movement_type, from_warehouse_id,
                    from_temporary_warehouse_id, to_warehouse_id, to_temporary_warehouse_id,
                    allocation_id, notes, status, user_id, completed_at, completed_by, created_at, updated_at)
                values (?,?,'Return',?,?,?,?,?,?, 'Completed', ?, now(), ?, now(), now())
                """, resourceId, (int) Math.round(quantity), fromWarehouseId, fromTempWarehouseId,
                toWarehouseId, toTempWarehouseId, allocationId,
                notes == null ? "Allocation returned to source." : notes, userId, userId);
    }

    private void saveJournal(long allocationId, List<Map<String, Object>> journal) {
        try {
            jdbc.update("update public.allocated_resources set source_details = ?, updated_at = now() where id = ?",
                    JSON.writeValueAsString(journal), allocationId);
        } catch (Exception e) {
            throw new BusinessRuleException("Could not record return details.");
        }
    }

    private static List<Map<String, Object>> journal(Object raw) {
        if (raw == null) {
            return new ArrayList<>();
        }
        String s = String.valueOf(raw).trim();
        if (!s.startsWith("[")) {
            return new ArrayList<>();
        }
        try {
            return JSON.readValue(s, JOURNAL);
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private static double dbl(Object v) {
        if (v == null) {
            return 0;
        }
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return 0;
        }
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
