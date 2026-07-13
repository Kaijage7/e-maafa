package tz.go.pmo.dmis.response;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Port of Admin\ResourceDispatchController (2,662 lines) — the dispatch console:
 * fully-approved allocations grouped per incident, the source picker, the
 * warehouse-manager dispatch-approval gate, and the procurement chain.
 *
 * Flow, exactly as in the source:
 *   Approved allocation → choose source →
 *     warehouse / temporary_warehouse → dispatch_approvals row, status
 *       'Awaiting Dispatch Approval'; manager approves → FIFO stock deduction,
 *       'Dispatch' stock movement, status 'Dispatch Approved' (reject → back to
 *       'Approved' so another source can be tried)
 *     agency → immediate deduction, source_details journal entry, status
 *       'Sourcing' (partial) or 'In Transit' (fully covered)
 *     procurement / request_agency → journal entry in source_details, status
 *       'Sourcing'; procurement is then approved → delivered (possibly in
 *       parts, each intake adding warehouse stock) or cancelled.
 *
 * source_details is the allocation's append-only JSON fulfilment journal —
 * same shape as the Laravel array so existing production rows render as-is.
 */
@RestController
@RequestMapping("/v1/response/dispatch")
public class DispatchController {

    /** Allocation statuses that may appear on the dispatch board (source's $statuses). */
    private static final List<String> BOARD_STATUSES =
            List.of("Approved", "Sourcing", "Requested to Stakeholders", "Awaiting Dispatch Approval");

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> JOURNAL = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final DispatchSupportService sources;
    private final IncidentWorkflowService users;
    private final tz.go.pmo.dmis.notification.NotificationService notifications; // the ONE dispatcher
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;
    private final SimulationGuard simulationGuard; // table-top drills never move real stock

    public DispatchController(JdbcTemplate jdbc, DispatchSupportService sources, IncidentWorkflowService users,
                              tz.go.pmo.dmis.notification.NotificationService notifications, JurisdictionScope jurisdiction,
                              AreaGuard areaGuard, SimulationGuard simulationGuard) {
        this.jdbc = jdbc;
        this.sources = sources;
        this.users = users;
        this.notifications = notifications;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
        this.simulationGuard = simulationGuard;
    }

    // ─── Dashboard ───

    /** Dispatch board: allocations grouped by incident, same-resource rows aggregated. */
    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) Long incident_id) {
        List<Object> params = new ArrayList<>(BOARD_STATUSES);
        String incidentFilter = "";
        if (incident_id != null) {
            incidentFilter = " and ar.incident_id = ?";
            params.add(incident_id);
        }
        // Area officers see only dispatches whose incident is in their own district/region (or shared);
        // national + non-area roles keep the full board. Scope rides on the served incident.
        StringBuilder sql = new StringBuilder("""
                select ar.id, ar.incident_id, ar.resource_id, ar.status, ar.quantity_requested,
                       ar.quantity_allocated, ar.unit_of_measure, ar.allocation_date, ar.source_details,
                       ar.created_at, i.title as incident_title, i.severity_level, i.status as incident_status,
                       r.name as resource_name, r.category as resource_category,
                       u.name as requested_by_name, au.name as approved_by_name
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                join public.resources r on r.id = ar.resource_id
                left join public.users u on u.id = ar.requested_by
                left join public.users au on au.id = ar.approved_by
                where ar.status in (?,?,?,?)""");
        sql.append(incidentFilter);
        jurisdiction.appendAreaScopeWithCouncil("i", sql, params);
        sql.append(" order by ar.allocation_date desc nulls last, ar.created_at desc");
        List<Map<String, Object>> allocations = jdbc.queryForList(sql.toString(), params.toArray());

        // Group by incident, then aggregate per resource (the source's groupedAllocations)
        Map<Long, Map<String, Object>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> a : allocations) {
            long incidentId = ((Number) a.get("incident_id")).longValue();
            Map<String, Object> incident = grouped.computeIfAbsent(incidentId, id -> {
                Map<String, Object> g = new LinkedHashMap<>();
                g.put("incident_id", id);
                g.put("incident_title", a.get("incident_title"));
                g.put("severity_level", a.get("severity_level"));
                g.put("resources", new LinkedHashMap<Long, Map<String, Object>>());
                return g;
            });
            @SuppressWarnings("unchecked")
            Map<Long, Map<String, Object>> resources = (Map<Long, Map<String, Object>>) incident.get("resources");
            long resourceId = ((Number) a.get("resource_id")).longValue();
            Map<String, Object> agg = resources.computeIfAbsent(resourceId, id -> {
                Map<String, Object> r = new LinkedHashMap<>();
                r.put("resource_id", id);
                r.put("resource_name", a.get("resource_name"));
                r.put("resource_category", a.get("resource_category"));
                r.put("unit_of_measure", a.get("unit_of_measure"));
                r.put("quantity_requested", 0d);
                r.put("quantity_allocated", 0d);
                r.put("dispatched_quantity", 0d);
                r.put("allocation_ids", new ArrayList<Long>());
                r.put("statuses", new ArrayList<String>());
                r.put("latest_allocation_id", id);
                return r;
            });
            agg.put("quantity_requested", dbl(agg.get("quantity_requested")) + dbl(a.get("quantity_requested")));
            agg.put("quantity_allocated", dbl(agg.get("quantity_allocated")) + dbl(a.get("quantity_allocated")));
            agg.put("dispatched_quantity", dbl(agg.get("dispatched_quantity"))
                    + journal(a.get("source_details")).stream().mapToDouble(d -> dbl(d.get("quantity_dispatched"))).sum());
            listOf(agg, "allocation_ids").add(((Number) a.get("id")).longValue());
            agg.put("latest_allocation_id", a.get("id"));
            List<Object> statuses = listOf(agg, "statuses");
            if (!statuses.contains(a.get("status"))) {
                statuses.add(a.get("status"));
            }
        }
        // Flatten the per-resource map into a list for the client
        List<Map<String, Object>> board = new ArrayList<>();
        for (Map<String, Object> g : grouped.values()) {
            @SuppressWarnings("unchecked")
            Map<Long, Map<String, Object>> resources = (Map<Long, Map<String, Object>>) g.get("resources");
            g.put("resources", new ArrayList<>(resources.values()));
            board.add(g);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("grouped", board);
        // Filter picker must use the same incident area scope as the board — never list foreign incidents.
        StringBuilder isql = new StringBuilder("""
                select distinct i.id, i.title from public.incidents i
                join public.allocated_resources ar on ar.incident_id = i.id and ar.status in (?,?,?,?)
                where 1=1""");
        List<Object> iparams = new ArrayList<>(BOARD_STATUSES);
        jurisdiction.appendAreaScopeWithCouncil("i", isql, iparams);
        isql.append(" order by i.title limit 50");
        out.put("incidents", jdbc.queryForList(isql.toString(), iparams.toArray()));
        out.put("stats", Map.of(
                "total_pending", count("ar.status in ('Approved','Sourcing')"),
                "awaiting_approval", count("ar.status = 'Awaiting Dispatch Approval'"),
                "in_transit", count("ar.status = 'In Transit'"),
                "deployed", count("ar.status = 'Deployed'"),
                "delivered", count("ar.status = 'Delivered'")));
        // Pending dispatch-manager gates only for allocations in the caller's area.
        StringBuilder pendsql = new StringBuilder("""
                select count(*) from public.dispatch_approvals da
                join public.allocated_resources ar on ar.id = da.allocated_resource_id
                join public.incidents i on i.id = ar.incident_id
                where da.status = 'Pending' and da.deleted_at is null""");
        List<Object> pendparams = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("i", pendsql, pendparams);
        out.put("pending_approval_count",
                jdbc.queryForObject(pendsql.toString(), Long.class, pendparams.toArray()));
        return out;
    }

    /** Source picker payload for one allocation (AJAX getAvailableSources + form context). */
    @GetMapping("/allocations/{id}/sources")
    public Map<String, Object> sourcesFor(@PathVariable long id) {
        Map<String, Object> allocation = findOr404(id);
        List<Map<String, Object>> journal = journal(allocation.get("source_details"));
        double dispatched = journal.stream().mapToDouble(d -> dbl(d.get("quantity_dispatched"))).sum();
        double quantityNeeded = Math.max(0, dbl(allocation.get("quantity_allocated")) - dispatched);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("allocation", allocation);
        out.put("journal", journal);
        out.put("quantity_needed", quantityNeeded);
        out.put("sources", sources.availableSources(
                ((Number) allocation.get("resource_id")).longValue(),
                ((Number) allocation.get("incident_id")).longValue()));
        // Same shared-or-own wall as availableSources agency channel (no foreign tagged agency lines).
        StringBuilder agencySql = new StringBuilder("""
                select ar.id, ar.agency_id, a.name as agency_name, ar.quantity as available_quantity,
                       ar.condition_status, ar.location_description
                from public.agency_resources ar
                join public.agencies a on a.id = ar.agency_id
                where ar.resource_id = ? and ar.quantity > 0
                """);
        List<Object> agencyParams = new ArrayList<>();
        agencyParams.add(allocation.get("resource_id"));
        jurisdiction.appendAreaScopeSharedOrOwn("ar", agencySql, agencyParams);
        agencySql.append(" order by a.name, ar.quantity desc");
        out.put("agency_request_options", jdbc.queryForList(agencySql.toString(), agencyParams.toArray()));
        return out;
    }

    // ─── Dispatch action ───

    /**
     * Dispatch from a stocked source. Warehouse-backed sources go through the
     * manager gate (no stock moves yet); agency stock dispatches immediately.
     */
    @PostMapping("/allocations/{id}/dispatch")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> dispatch(@PathVariable long id, @RequestBody Map<String, Object> body) {
        // Drill isolation (defence-in-depth): even a legacy table-top drill allocation cannot move real stock.
        simulationGuard.assertAllocationNotSimulation(id, "dispatching real stock");
        String sourceType = require(str(body.get("source_type")), "source_type");
        if (!List.of("warehouse", "temporary_warehouse", "agency").contains(sourceType)) {
            throw new BusinessRuleException("The selected source type is invalid.");
        }
        long sourceId = lng(body.get("source_id"), "source_id");
        double quantity = positive(body.get("quantity"));
        Map<String, Object> allocation = findOr404(id);
        if (!List.of("Approved", "Sourcing", "Requested to Stakeholders").contains((String) allocation.get("status"))) {
            throw new BusinessRuleException("This allocation cannot be dispatched. Current status: " + allocation.get("status"));
        }
        // Stocked sources must be visible under the caller's matrix — picker is scoped;
        // body.source_id must not bypass it (no cross-region stock draw via raw API).
        if ("warehouse".equals(sourceType)) {
            areaGuard.assertWarehouseVisible("public.warehouses", sourceId);
        } else if ("temporary_warehouse".equals(sourceType)) {
            areaGuard.assertWarehouseVisible("public.temporary_warehouses", sourceId);
        } else if ("agency".equals(sourceType)) {
            // Shared-or-own: own-area agency stock or national/untagged (NULL area) rows.
            areaGuard.assertOwnOrShared("public.agency_resources", sourceId);
        }
        // Validate against the REMAINING need, not the gross allocation: subtract what is already
        // journalled as dispatched AND what is already sitting in pending dispatch-approvals (procurement
        // in-flight) — otherwise repeated requests can commit more than was ever allocated.
        double allocated = dbl(allocation.get("quantity_allocated"));
        double alreadyDispatched = journal(allocation.get("source_details")).stream()
                .mapToDouble(d -> dbl(d.get("quantity_dispatched"))).sum();
        double pendingApprovals = dbl(jdbc.queryForObject(
                "select coalesce(sum(quantity), 0) from public.dispatch_approvals"
                        + " where allocated_resource_id = ? and status = 'Pending'", Double.class, id));
        double remaining = allocated - alreadyDispatched - pendingApprovals;
        if (quantity > remaining + 1e-9) {
            throw new BusinessRuleException("Dispatch quantity exceeds the remaining need — only "
                    + fmt(remaining) + " of " + fmt(allocated) + " left to source (the rest is already"
                    + " dispatched or pending approval).");
        }
        long resourceId = ((Number) allocation.get("resource_id")).longValue();
        if (sources.availableQuantity(sourceType, sourceId, resourceId) < quantity) {
            throw new BusinessRuleException("Insufficient stock at selected source.");
        }

        if (DispatchSupportService.APPROVAL_REQUIRED_SOURCES.contains(sourceType)) {
            // Manager gate: record the request, stock moves only on approval
            jdbc.update("""
                    insert into public.dispatch_approvals(allocated_resource_id, source_type, source_id,
                        quantity, requested_by, status, notes, created_at, updated_at)
                    values (?,?,?,?,?,'Pending',?,now(),now())
                    """, id, "warehouse".equals(sourceType) ? "Warehouse" : "Temporary Warehouse",
                    sourceId, quantity, users.actingUserId(), str(body.get("notes")));
            jdbc.update("update public.allocated_resources set status = 'Awaiting Dispatch Approval', updated_at = now() where id = ?", id);
            // F77: notify warehouse/stock managers via the ONE notification backbone (not silent insert).
            String resName = jdbc.queryForObject("select name from public.resources where id = ?", String.class, resourceId);
            notifications.notifyRoles(java.util.List.of("EOCC", "Director", "Asst. Director", "Super Admin"),
                    tz.go.pmo.dmis.notification.NotificationService.Notice.inApp(
                            "dispatch_approval_needed",
                            "Dispatch approval needed",
                            (resName == null ? "Stock" : resName) + " ×" + quantity
                                    + " requested from warehouse source #" + sourceId
                                    + " for allocation #" + id + ".",
                            "/m/response/dispatch", "allocation", id, "warning"));
            return Map.of("success", true,
                    "message", "Dispatch request submitted and pending approval from the source manager.");
        }

        // Agency stock: deduct now and journal the dispatch
        sources.deductStock(sourceType, sourceId, resourceId, quantity);
        String sourceName = jdbc.queryForObject("""
                select a.name from public.agency_resources ar join public.agencies a on a.id = ar.agency_id where ar.id = ?
                """, String.class, sourceId);
        recordMovement(resourceId, quantity, "Deduction", null, null, id,
                "Direct dispatch from agency: " + sourceName);
        appendJournalAndAdvance(allocation, entry -> {
            entry.put("source_type", sourceType);
            entry.put("source_id", sourceId);
            entry.put("source_name", sourceName);
            entry.put("quantity_dispatched", quantity);
            entry.put("notes", str(body.get("notes")));
            entry.put("estimated_arrival", str(body.get("estimated_arrival")));
        });
        return Map.of("success", true, "message", "Resource dispatched successfully.");
    }

    // ─── Dispatch approvals (the warehouse manager's queue) ───

    @GetMapping("/approvals")
    public Map<String, Object> approvals() {
        // Same incident-area wall as the dispatch board — district/region officers must not see
        // foreign-area warehouse dispatch gates (or act on them via the list UI).
        StringBuilder sql = new StringBuilder("""
                select da.*, ar.incident_id, ar.quantity_allocated, ar.unit_of_measure,
                       i.title as incident_title, r.name as resource_name, ru.name as requested_by_name,
                       case when da.source_type = 'Warehouse'
                            then (select w.name from public.warehouses w where w.id = da.source_id)
                            else (select tw.name from public.temporary_warehouses tw where tw.id = da.source_id)
                       end as source_name
                from public.dispatch_approvals da
                join public.allocated_resources ar on ar.id = da.allocated_resource_id
                join public.incidents i on i.id = ar.incident_id
                join public.resources r on r.id = ar.resource_id
                left join public.users ru on ru.id = da.requested_by
                where da.deleted_at is null""");
        List<Object> params = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("i", sql, params);
        sql.append(" order by case da.status when 'Pending' then 0 else 1 end, da.created_at desc limit 200");
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), params.toArray());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("approvals", rows);
        out.put("pending_count", rows.stream().filter(r -> "Pending".equals(r.get("status"))).count());
        // Counts follow the same area scope (not national soft leak for area seats).
        StringBuilder daySql = new StringBuilder("""
                select count(*) from public.dispatch_approvals da
                join public.allocated_resources ar on ar.id = da.allocated_resource_id
                join public.incidents i on i.id = ar.incident_id
                where da.status = 'Approved' and da.approved_at::date = current_date""");
        List<Object> dayParams = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("i", daySql, dayParams);
        out.put("approved_today", jdbc.queryForObject(daySql.toString(), Long.class, dayParams.toArray()));
        StringBuilder procSql = new StringBuilder("""
                select count(*) from public.dispatch_approvals da
                join public.allocated_resources ar on ar.id = da.allocated_resource_id
                join public.incidents i on i.id = ar.incident_id
                where da.status in ('Approved','Rejected')""");
        List<Object> procParams = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("i", procSql, procParams);
        out.put("total_processed", jdbc.queryForObject(procSql.toString(), Long.class, procParams.toArray()));
        return out;
    }

    /**
     * Manager approves: FIFO stock deduction + 'Dispatch' movement + allocation
     * to 'Dispatch Approved'. Guarded by a row lock so a double-submit cannot
     * deduct twice (the source's lockForUpdate + isPending check).
     */
    @PostMapping("/approvals/{id}/approve")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @Transactional
    public Map<String, Object> approveDispatch(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> approval = lockApproval(id);
        if (!"Pending".equals(approval.get("status"))) {
            throw new BusinessRuleException("This dispatch request has already been processed.");
        }
        long allocationId = ((Number) approval.get("allocated_resource_id")).longValue();
        Map<String, Object> allocation = findOr404(allocationId);
        long resourceId = ((Number) allocation.get("resource_id")).longValue();
        long sourceId = ((Number) approval.get("source_id")).longValue();
        // Normalize the stored capitalised type back to the ledger key
        String sourceType = "Warehouse".equals(approval.get("source_type")) ? "warehouse" : "temporary_warehouse";
        double quantity = dbl(approval.get("quantity"));
        Long userId = users.actingUserId();
        // Maker ≠ checker on the warehouse manager gate (same person cannot request and release stock).
        assertNotDispatchRequester(approval, userId);

        sources.deductStock(sourceType, sourceId, resourceId, quantity);
        jdbc.update("""
                update public.dispatch_approvals set status = 'Approved', approved_by = ?, approved_at = now(),
                    notes = coalesce(?, notes), updated_at = now() where id = ?
                """, userId, str(body == null ? null : body.get("notes")), id);
        recordMovement(resourceId, quantity, "Dispatch",
                "warehouse".equals(sourceType) ? sourceId : null,
                "temporary_warehouse".equals(sourceType) ? sourceId : null,
                allocationId, "Dispatch from " + approval.get("source_type") + " approved. Dispatch approval ID: " + id);

        String sourceName = sourceName(sourceType, sourceId);
        appendJournalAndAdvance(allocation, entry -> {
            entry.put("source_type", sourceType);
            entry.put("source_id", sourceId);
            entry.put("source_name", sourceName);
            entry.put("quantity_dispatched", quantity);
            entry.put("dispatch_approval_id", id);
        });
        // The source pins the post-approval status to 'Dispatch Approved' (ready for transit)
        jdbc.update("update public.allocated_resources set status = 'Dispatch Approved', updated_at = now() where id = ?", allocationId);
        notify(allocation.get("requested_by"), allocationId, "dispatch_approved", "Dispatch approved",
                "Your dispatch request from " + sourceName + " was approved. Stock has been deducted.");
        return Map.of("success", true, "message", "Dispatch request approved successfully. Stock has been deducted.");
    }

    /** Manager rejects: nothing moves; allocation returns to 'Approved' for another source. */
    @PostMapping("/approvals/{id}/reject")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @Transactional
    public Map<String, Object> rejectDispatch(@PathVariable long id, @RequestBody Map<String, Object> body) {
        String reason = str(body.get("reason"));
        if (reason == null || reason.length() < 10) {
            throw new BusinessRuleException("The rejection reason must be at least 10 characters.");
        }
        Map<String, Object> approval = lockApproval(id);
        if (!"Pending".equals(approval.get("status"))) {
            throw new BusinessRuleException("This dispatch request has already been processed.");
        }
        // Same SoD as approve: the officer who opened the dispatch gate cannot also reject it as "manager".
        assertNotDispatchRequester(approval, users.actingUserId());
        long allocationId = ((Number) approval.get("allocated_resource_id")).longValue();
        jdbc.update("""
                update public.dispatch_approvals set status = 'Rejected', rejected_by = ?, rejected_at = now(),
                    rejection_reason = ?, updated_at = now() where id = ?
                """, users.actingUserId(), reason, id);
        jdbc.update("update public.allocated_resources set status = 'Approved', updated_at = now() where id = ?", allocationId);
        Map<String, Object> allocation = findOr404(allocationId);
        notify(allocation.get("requested_by"), allocationId, "dispatch_rejected", "Dispatch rejected",
                "Your dispatch request was rejected: " + reason + " You may dispatch from another source.");
        return Map.of("success", true, "message", "Dispatch request rejected. The requester has been notified.");
    }

    // ─── Procurement chain ───

    /** Submit an allocation to procurement; tracked inside source_details. */
    @PostMapping("/allocations/{id}/procurement")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> submitProcurement(@PathVariable long id, @RequestBody Map<String, Object> body) {
        double quantity = positive(body.get("quantity"));
        String urgency = urgencyOrDefault(body.get("urgency"));
        Map<String, Object> allocation = findOr404(id);
        List<Map<String, Object>> journal = journal(allocation.get("source_details"));
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("source_type", "procurement");
        entry.put("quantity", quantity);
        entry.put("estimated_cost", body.get("estimated_cost"));
        entry.put("preferred_vendor", str(body.get("preferred_vendor")));
        entry.put("notes", str(body.get("notes")));
        entry.put("urgency", urgency);
        entry.put("status", "Pending Procurement");
        entry.put("requested_by", users.actingUserId());
        entry.put("requested_at", OffsetDateTime.now().toString());
        journal.add(entry);
        saveJournal(id, journal);
        jdbc.update("update public.allocated_resources set status = 'Sourcing', updated_at = now() where id = ?", id);
        return Map.of("success", true,
                "message", "Procurement request submitted successfully. The procurement team has been notified.");
    }

    /** All allocations carrying a procurement journal entry, flattened for the queue. */
    @GetMapping("/procurement-requests")
    public Map<String, Object> procurementRequests() {
        // Same incident-area wall as the dispatch board — Dist must not see Dar procurement rows.
        StringBuilder sql = new StringBuilder("""
                select ar.id, ar.source_details, ar.status, ar.unit_of_measure, i.title as incident_title,
                       r.name as resource_name, u.name as requested_by_name
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                join public.resources r on r.id = ar.resource_id
                left join public.users u on u.id = ar.requested_by
                where ar.source_details is not null and ar.source_details::text like '%procurement%'
                """);
        List<Object> params = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("i", sql, params);
        sql.append(" order by ar.updated_at desc limit 200");
        List<Map<String, Object>> requests = new ArrayList<>();
        for (Map<String, Object> a : jdbc.queryForList(sql.toString(), params.toArray())) {
            for (Map<String, Object> d : journal(a.get("source_details"))) {
                if ("procurement".equals(d.get("source_type"))) {
                    Map<String, Object> row = new LinkedHashMap<>(d);
                    row.put("allocation_id", a.get("id"));
                    row.put("allocation_status", a.get("status"));
                    row.put("incident_title", a.get("incident_title"));
                    row.put("resource_name", a.get("resource_name"));
                    row.put("unit_of_measure", a.get("unit_of_measure"));
                    row.put("requested_by_name", a.get("requested_by_name"));
                    requests.add(row);
                }
            }
        }
        return Map.of("requests", requests);
    }

    @PostMapping("/procurement/{allocationId}/approve")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @Transactional
    public Map<String, Object> approveProcurement(@PathVariable long allocationId,
                                                  @RequestBody(required = false) Map<String, Object> body) {
        mutateProcurement(allocationId, d -> {
            d.put("status", "Procurement Approved");
            d.put("approved_by", users.actingUserId());
            d.put("approved_at", OffsetDateTime.now().toString());
            d.put("approval_notes", str(body == null ? null : body.get("notes")));
        });
        return Map.of("success", true, "message", "Procurement request approved successfully.");
    }

    /**
     * Record a (possibly partial) procurement delivery: track totals on the journal
     * entry and intake the received quantity into the destination warehouse.
     */
    @PostMapping("/procurement/{allocationId}/deliver")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> deliverProcurement(@PathVariable long allocationId, @RequestBody Map<String, Object> body) {
        String destinationType = require(str(body.get("destination_type")), "destination_type");
        if (!List.of("warehouse", "temporary_warehouse").contains(destinationType)) {
            throw new BusinessRuleException("The selected destination type is invalid.");
        }
        double delivered = positive(body.get("actual_quantity"));
        long destinationId = lng(body.get("warehouse_id") != null ? body.get("warehouse_id")
                : body.get("temporary_warehouse_id"), "warehouse_id");
        Map<String, Object> allocation = findOr404(allocationId);
        // Destination must be visible under the caller's warehouse matrix (picker is scoped; body is not trusted).
        if ("warehouse".equals(destinationType)) {
            areaGuard.assertWarehouseVisible("public.warehouses", destinationId);
        } else {
            areaGuard.assertWarehouseVisible("public.temporary_warehouses", destinationId);
        }
        long resourceId = ((Number) allocation.get("resource_id")).longValue();
        String destinationName = sourceName(destinationType, destinationId);

        double[] totals = new double[2]; // requested, newTotalDelivered — filled inside the mutation
        mutateProcurement(allocationId, d -> {
            double requested = dbl(d.get("quantity"));
            double total = dbl(d.get("total_delivered")) + delivered;
            totals[0] = requested;
            totals[1] = total;
            d.put("status", total >= requested ? "Delivered" : "In Procurement");
            d.put("total_delivered", total);
            d.put("remaining_quantity", Math.max(0, requested - total));
            d.put("actual_cost", body.get("actual_cost"));
            d.put("last_delivery_by", users.actingUserId());
            d.put("last_delivered_at", OffsetDateTime.now().toString());
            d.put("last_delivery_notes", str(body.get("delivery_notes")));
            d.put("destination_type", destinationType);
            d.put("destination_id", destinationId);
            d.put("destination_name", destinationName);
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> deliveries = d.get("deliveries") instanceof List<?> l
                    ? (List<Map<String, Object>>) l : new ArrayList<>();
            Map<String, Object> rec = new LinkedHashMap<>();
            rec.put("delivered_by", users.actingUserId());
            rec.put("delivered_at", OffsetDateTime.now().toString());
            rec.put("quantity", delivered);
            rec.put("destination_name", destinationName);
            rec.put("notes", str(body.get("delivery_notes")));
            deliveries.add(rec);
            d.put("deliveries", deliveries);
        });

        // Stock the received goods and journal the intake
        String resourceName = jdbc.queryForObject("select name from public.resources where id = ?", String.class, resourceId);
        sources.addStock("warehouse".equals(destinationType) ? "zonal" : "temporary",
                destinationId, resourceId, delivered, resourceName, users.actingUserId());
        Long userId = users.actingUserId();
        jdbc.update("""
                insert into public.stock_movements(resource_id, quantity, movement_type, to_warehouse_id,
                    to_temporary_warehouse_id, allocation_id, notes, status, user_id,
                    completed_at, completed_by, created_at, updated_at)
                values (?,?,'Intake',?,?,?,?, 'Completed', ?, now(), ?, now(), now())
                """, resourceId, (int) delivered,
                "warehouse".equals(destinationType) ? destinationId : null,
                "temporary_warehouse".equals(destinationType) ? destinationId : null,
                allocationId,
                "Procured items received - " + (str(body.get("delivery_notes")) == null ? "" : str(body.get("delivery_notes"))),
                userId, userId);

        boolean complete = totals[1] >= totals[0];
        return Map.of("success", true, "complete", complete, "message", complete
                ? "Delivery complete! %s of %s units received. Stock added to %s.".formatted(fmt(totals[1]), fmt(totals[0]), destinationName)
                : "Partial delivery recorded: %s units. Total: %s/%s. Stock added to %s.".formatted(fmt(delivered), fmt(totals[1]), fmt(totals[0]), destinationName));
    }

    @PostMapping("/procurement/{allocationId}/cancel")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @Transactional
    public Map<String, Object> cancelProcurement(@PathVariable long allocationId, @RequestBody Map<String, Object> body) {
        String reason = str(body.get("reason"));
        if (reason == null || reason.length() < 10) {
            throw new BusinessRuleException("The cancellation reason must be at least 10 characters.");
        }
        mutateProcurement(allocationId, d -> {
            d.put("status", "Cancelled");
            d.put("cancelled_by", users.actingUserId());
            d.put("cancelled_at", OffsetDateTime.now().toString());
            d.put("cancellation_reason", reason);
        });
        return Map.of("success", true, "message", "Procurement request cancelled.");
    }

    /** Procurement tracking payload: the journal entry + destinations for the deliver form. */
    @GetMapping("/procurement/{allocationId}/track")
    public Map<String, Object> trackProcurement(@PathVariable long allocationId) {
        findOr404(allocationId); // same 404 guard as the regression-sweep fixes
        Map<String, Object> allocation = jdbc.queryForMap("""
                select ar.*, i.title as incident_title, r.name as resource_name
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                join public.resources r on r.id = ar.resource_id where ar.id = ?
                """, allocationId);
        Map<String, Object> procurement = journal(allocation.get("source_details")).stream()
                .filter(d -> "procurement".equals(d.get("source_type"))).findFirst()
                .orElseThrow(() -> new ResourceNotFoundException("No procurement details found for this allocation."));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("allocation", allocation);
        out.put("procurement", procurement);
        StringBuilder wh = new StringBuilder("select id, name from public.warehouses w where 1=1");
        List<Object> whp = new ArrayList<>();
        jurisdiction.appendWarehouseScope("w", wh, whp);
        wh.append(" order by name");
        out.put("warehouses", jdbc.queryForList(wh.toString(), whp.toArray()));
        StringBuilder tw = new StringBuilder(
                "select id, name, level from public.temporary_warehouses t where is_active = true");
        List<Object> twp = new ArrayList<>();
        jurisdiction.appendWarehouseScope("t", tw, twp);
        tw.append(" order by level, name");
        out.put("temporary_warehouses", jdbc.queryForList(tw.toString(), twp.toArray()));
        return out;
    }

    // ─── Agency request (national channel; journal entry, no immediate stock move) ───

    @PostMapping("/allocations/{id}/agency-request")
    @PreAuthorize("hasAuthority('resource_allocation.request')")
    @Transactional
    public Map<String, Object> submitAgencyRequest(@PathVariable long id, @RequestBody Map<String, Object> body) {
        long agencyResourceId = lng(body.get("agency_resource_id"), "agency_resource_id");
        double quantity = positive(body.get("quantity"));
        Map<String, Object> allocation = findOr404(id);
        // Same operational gate as warehouse/procurement dispatch — only approved (or already sourcing) needs.
        if (!List.of("Approved", "Sourcing", "Requested to Stakeholders").contains(String.valueOf(allocation.get("status")))) {
            throw new BusinessRuleException("This allocation cannot request agency stock. Current status: "
                    + allocation.get("status"));
        }
        // Shared-or-own: body.agency_resource_id must not reach a foreign-area tagged agency line.
        areaGuard.assertOwnOrShared("public.agency_resources", agencyResourceId);
        List<Map<String, Object>> agencyRows = jdbc.queryForList("""
                select ar.id, ar.agency_id, ar.quantity, a.name as agency_name, r.name as resource_name
                from public.agency_resources ar
                join public.agencies a on a.id = ar.agency_id
                join public.resources r on r.id = ar.resource_id
                where ar.id = ? and ar.resource_id = ?
                """, agencyResourceId, allocation.get("resource_id"));
        if (agencyRows.isEmpty()) {
            throw new BusinessRuleException("Select an agency stock line for this allocated resource.");
        }
        Map<String, Object> agency = agencyRows.get(0);
        if (dbl(agency.get("quantity")) + 1e-9 < quantity) {
            throw new BusinessRuleException("Requested quantity exceeds the agency stock line ("
                    + fmt(dbl(agency.get("quantity"))) + " available).");
        }
        List<Map<String, Object>> journal = journal(allocation.get("source_details"));
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("source_type", "request_agency");
        entry.put("agency_resource_id", agencyResourceId);
        entry.put("agency_id", agency.get("agency_id"));
        entry.put("agency_name", agency.get("agency_name"));
        entry.put("quantity", quantity);
        entry.put("urgency", urgencyOrDefault(body.get("urgency")));
        entry.put("notes", str(body.get("notes")));
        entry.put("status", "Pending Agency Response");
        entry.put("requested_by", users.actingUserId());
        entry.put("requested_at", OffsetDateTime.now().toString());
        journal.add(entry);
        saveJournal(id, journal);
        jdbc.update("update public.allocated_resources set status = 'Sourcing', updated_at = now() where id = ?", id);
        int notified = notifyAgency(agency.get("agency_id"), id, agency.get("resource_name"), quantity, urgencyOrDefault(body.get("urgency")));
        String message = notified > 0
                ? "Agency request submitted successfully. " + notified + " agency user(s) notified."
                : "Agency request submitted successfully. No linked agency user account was found; follow up with the agency contact.";
        return Map.of("success", true, "message", message, "notified", notified);
    }

    // ─── internals ───

    /** Append a dispatch record to source_details and advance Sourcing → In Transit when covered. */
    private void appendJournalAndAdvance(Map<String, Object> allocation,
                                         java.util.function.Consumer<Map<String, Object>> fill) {
        long id = ((Number) allocation.get("id")).longValue();
        List<Map<String, Object>> journal = journal(allocation.get("source_details"));
        Map<String, Object> entry = new LinkedHashMap<>();
        fill.accept(entry);
        entry.put("dispatched_by", users.actingUserId());
        entry.put("dispatched_at", OffsetDateTime.now().toString());
        journal.add(entry);
        double totalDispatched = journal.stream().mapToDouble(d -> dbl(d.get("quantity_dispatched"))).sum();
        String status = totalDispatched >= dbl(allocation.get("quantity_allocated")) ? "In Transit"
                : "Approved".equals(allocation.get("status")) ? "Sourcing" : (String) allocation.get("status");
        saveJournal(id, journal);
        jdbc.update("""
                update public.allocated_resources set status = ?, dispatched_by = ?, dispatched_at = now(),
                    updated_at = now() where id = ?
                """, status, users.actingUserId(), id);
    }

    /** Rewrite the single procurement entry inside an allocation's journal. */
    private void mutateProcurement(long allocationId, java.util.function.Consumer<Map<String, Object>> mutate) {
        Map<String, Object> allocation = findOr404(allocationId);
        List<Map<String, Object>> journal = journal(allocation.get("source_details"));
        boolean found = false;
        for (Map<String, Object> d : journal) {
            if ("procurement".equals(d.get("source_type"))) {
                mutate.accept(d);
                found = true;
            }
        }
        if (!found) {
            throw new ResourceNotFoundException("No procurement request found for this allocation.");
        }
        saveJournal(allocationId, journal);
    }

    private List<Map<String, Object>> journal(Object sourceDetails) {
        if (sourceDetails == null) {
            return new ArrayList<>();
        }
        try {
            String raw = String.valueOf(sourceDetails);
            // Production rows are sometimes double-encoded ("\"[...]\"") — unwrap once
            Object parsed = JSON.readValue(raw, Object.class);
            if (parsed instanceof String inner) {
                parsed = JSON.readValue(inner, Object.class);
            }
            return parsed instanceof List<?> ? JSON.convertValue(parsed, JOURNAL) : new ArrayList<>();
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private void saveJournal(long allocationId, List<Map<String, Object>> journal) {
        try {
            jdbc.update("update public.allocated_resources set source_details = ?, updated_at = now() where id = ?",
                    JSON.writeValueAsString(journal), allocationId);
        } catch (Exception e) {
            throw new BusinessRuleException("Could not record dispatch details.");
        }
    }

    private void recordMovement(long resourceId, double quantity, String type, Long fromWarehouse,
                                Long fromTempWarehouse, Long allocationId, String notes) {
        Long userId = users.actingUserId();
        jdbc.update("""
                insert into public.stock_movements(resource_id, quantity, movement_type, from_warehouse_id,
                    from_temporary_warehouse_id, allocation_id, notes, status, user_id,
                    completed_at, completed_by, created_at, updated_at)
                values (?,?,?,?,?,?,?, 'Completed', ?, now(), ?, now(), now())
                """, resourceId, (int) quantity, type, fromWarehouse, fromTempWarehouse,
                allocationId, notes, userId, userId);
    }

    private void notify(Object userId, long allocationId, String type, String title, String message) {
        if (userId == null) {
            return;
        }
        notifications.notifyUser(((Number) userId).longValue(),
                tz.go.pmo.dmis.notification.NotificationService.Notice.inApp(type, title, message,
                        "/m/response/resource-dispatch", "allocation", allocationId, "info"));
    }

    private int notifyAgency(Object agencyId, long allocationId, Object resourceName, double quantity, String urgency) {
        if (!(agencyId instanceof Number n)) {
            return 0;
        }
        List<Long> userIds = jdbc.queryForList("select id from public.users where agency_id = ?", Long.class, n.longValue());
        return notifications.notifyUsers(userIds,
                tz.go.pmo.dmis.notification.NotificationService.Notice.inApp(
                        "agency_resource_request",
                        "Agency resource request",
                        "PMO requested " + fmt(quantity) + " " + resourceName + " (" + urgency + ").",
                        "/m/response/resource-dispatch",
                        "allocation",
                        allocationId,
                        "warning"));
    }

    private Map<String, Object> lockApproval(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from public.dispatch_approvals where id = ? and deleted_at is null for update", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Dispatch approval not found.");
        }
        return rows.get(0);
    }

    private String sourceName(String type, long id) {
        List<String> names = jdbc.queryForList("warehouse".equals(type)
                ? "select name from public.warehouses where id = ?"
                : "select name from public.temporary_warehouses where id = ?", String.class, id);
        return names.isEmpty() ? "Unknown Source" : names.get(0);
    }

    private Map<String, Object> findOr404(long id) {
        // Same area wall as the board: out-of-area allocations 404 (no cross-region dispatch actions).
        StringBuilder sql = new StringBuilder("""
                select ar.* from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                where ar.id = ?""");
        List<Object> params = new ArrayList<>();
        params.add(id);
        jurisdiction.appendAreaScopeWithCouncil("i", sql, params);
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), params.toArray());
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Allocation not found.");
        }
        return rows.get(0);
    }

    /**
     * Warehouse manager gate: the user who submitted the dispatch request must not also approve/reject it.
     * Super Admin is not exempt — same SoD rule as the resource multi-step chain (person-keyed, not role-keyed).
     */
    private void assertNotDispatchRequester(Map<String, Object> approval, Long actorUserId) {
        if (actorUserId == null || approval.get("requested_by") == null) {
            return;
        }
        long requester = ((Number) approval.get("requested_by")).longValue();
        if (actorUserId == requester) {
            throw new BusinessRuleException(
                    "You submitted this dispatch request, so you cannot approve or reject it (segregation of duties).");
        }
    }

    /** Counts allocations in the caller's incident area only ({@code where} must use alias {@code ar.}). */
    private long count(String where) {
        StringBuilder sql = new StringBuilder("""
                select count(*) from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                where 1=1""");
        if (where != null && !where.isBlank()) {
            sql.append(" and (").append(where).append(')');
        }
        List<Object> params = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("i", sql, params);
        Long c = jdbc.queryForObject(sql.toString(), Long.class, params.toArray());
        return c == null ? 0 : c;
    }

    private static String urgencyOrDefault(Object v) {
        String u = str(v);
        if (u == null) {
            return "medium";
        }
        if (!List.of("low", "medium", "high", "critical").contains(u)) {
            throw new BusinessRuleException("The selected urgency is invalid.");
        }
        return u;
    }

    private static double positive(Object v) {
        double q = v instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(v));
        // F64 — whole units only (matches integer inventory ledger)
        return DispatchSupportService.requireWholeUnits(q);
    }

    private static long lng(Object v, String field) {
        if (v == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return (long) Double.parseDouble(String.valueOf(v));
    }

    private static String require(String v, String field) {
        if (v == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return v;
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static double dbl(Object v) {
        return v instanceof Number n ? n.doubleValue() : 0;
    }

    @SuppressWarnings("unchecked")
    private static List<Object> listOf(Map<String, Object> map, String key) {
        return (List<Object>) map.get(key);
    }

    private static String fmt(double v) {
        return v == Math.floor(v) ? String.valueOf((long) v) : String.valueOf(v);
    }
}
