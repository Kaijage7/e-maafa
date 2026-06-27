package tz.go.pmo.dmis.response;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
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
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.notification.NotificationService;

/**
 * Port of the stakeholder bidding & donation flows from
 * Admin\ResourceDispatchController — the third fulfilment channel:
 *
 * <pre>
 *   publish     allocation opens for bidding ('Requested to Stakeholders',
 *               bidding_status 'open', deadline; default window 7 days)
 *   bid         a stakeholder offers quantity/price/delivery date (Pending)
 *   accept      offer journalled onto source_details, allocation 'Sourcing'
 *   dismiss     offer rejected with a reason, stakeholder notified
 *   receive     goods arrive → bid 'Received', stock intaken to the chosen
 *               store, allocation 'Delivered' / 'Partially Fulfilled'
 *   close       pending offers withdrawn, allocation unpublished
 *   return      no active offers → back to 'Approved' for normal dispatch
 * </pre>
 *
 * One table backs two screens: the per-allocation bidding pool and the global
 * donations queue (the source's StakeholderDonation model aliases the same
 * stakeholder_resource_bids table). Source bugs fixed here: receive
 * wrote the temp-warehouse id into the zonal warehouse_id column, and
 * 'Received' was missing from the model's status list.
 */
@RestController
@RequestMapping("/v1/response/bidding")
public class StakeholderBiddingController {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> JOURNAL = new TypeReference<>() {};
    private static final List<String> PRIORITIES = List.of("low", "medium", "high", "critical");

    private final JdbcTemplate jdbc;
    private final DispatchSupportService stock;
    private final IncidentWorkflowService users;
    private final NotificationService notifications; // the notification dispatcher (in-app feed + channels)
    private final JurisdictionScope jurisdiction; // row-level area (region/district) visibility for area officers
    private final AreaGuard areaGuard; // by-id area guards (allocation via incident, warehouse own-or-shared)

    public StakeholderBiddingController(JdbcTemplate jdbc, DispatchSupportService stock,
                                        IncidentWorkflowService users, NotificationService notifications,
                                        JurisdictionScope jurisdiction, AreaGuard areaGuard) {
        this.jdbc = jdbc;
        this.stock = stock;
        this.users = users;
        this.notifications = notifications;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
    }

    /**
     * An allocation is area-scoped via its incident (the table has no region/district of its own). Mirrors
     * how the list paths use {@code appendAreaScopeSharedOrOwn("i")}: own + shared/unlinked incidents are
     * visible, national tier sees all; a cross-area allocation 404s.
     */
    private void guardAllocationArea(long allocationId) {
        areaGuard.assertParentOwnOrShared("public.allocated_resources", "incident_id", "public.incidents", allocationId);
    }

    /** A receive/procurement destination must be in the caller's area (shared/unlinked warehouses are visible). */
    private void guardDestinationArea(String destinationType, long destinationId) {
        String table = "temporary_warehouse".equals(destinationType)
                ? "public.temporary_warehouses" : "public.warehouses";
        areaGuard.assertOwnOrShared(table, destinationId);
    }

    // ─── Publish ───

    /** Open an allocation for stakeholder bidding (submitStakeholderRequest; no body = the quick 7-day publish). */
    @PostMapping("/allocations/{id}/publish")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> publish(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        guardAllocationArea(id);
        Map<String, Object> allocation = findAllocation(id);
        if (Boolean.TRUE.equals(allocation.get("published_for_stakeholder_bidding"))) {
            throw new BusinessRuleException("This resource is already published for stakeholder donations.");
        }
        LocalDate deadline = body != null && body.get("bid_deadline") != null
                ? LocalDate.parse(String.valueOf(body.get("bid_deadline")))
                : LocalDate.now().plusDays(7);
        if (!deadline.isAfter(LocalDate.now())) {
            throw new BusinessRuleException("The bid deadline must be a future date.");
        }
        String priority = body == null || body.get("priority") == null ? "medium" : String.valueOf(body.get("priority"));
        if (!PRIORITIES.contains(priority)) {
            throw new BusinessRuleException("The selected priority is invalid.");
        }
        jdbc.update("""
                update public.allocated_resources set published_for_stakeholder_bidding = true,
                    status = 'Requested to Stakeholders', bidding_status = 'open', bid_deadline = ?,
                    updated_at = now() where id = ?
                """, deadline, id);
        notifyStakeholderUsers(id, "stakeholder_request", "Resource donation request",
                "PMO requests donations of " + allocation.get("unit_of_measure") + " (priority: " + priority
                        + "). Bidding closes " + deadline + ".");
        return Map.of("success", true, "message",
                "Donation request published. Stakeholders can now submit offers until " + deadline + ".");
    }

    // ─── Bidding pool (per allocation) ───

    @GetMapping("/allocations/{id}/pool")
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> pool(@PathVariable long id) {
        guardAllocationArea(id);
        Map<String, Object> allocation = jdbc.queryForMap("""
                select ar.*, i.title as incident_title, r.name as resource_name
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                join public.resources r on r.id = ar.resource_id where ar.id = ?
                """, id);
        List<Map<String, Object>> bids = jdbc.queryForList("""
                select b.*, s.name as stakeholder_name, s.type as stakeholder_type
                from public.stakeholder_resource_bids b
                join public.stakeholders s on s.id = b.stakeholder_id
                where b.allocated_resource_id = ? and b.deleted_at is null
                order by case b.status when 'Pending' then 0 when 'Accepted' then 1 else 2 end, b.created_at desc
                """, id);
        double needed = dbl(allocation.get("quantity_allocated"));
        double accepted = sumWhere(bids, "Accepted");
        double pending = sumWhere(bids, "Pending");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("allocation", allocation);
        out.put("bids", bids);
        out.put("quantity_needed", needed);
        out.put("accepted_quantity", accepted);
        out.put("pending_quantity", pending);
        out.put("received_quantity", sumWhere(bids, "Received"));
        out.put("remaining_quantity", Math.max(0, needed - accepted));
        // Return-to-dispatch is only safe once no offer is still in play
        out.put("can_return_to_dispatch",
                Boolean.TRUE.equals(allocation.get("published_for_stakeholder_bidding")) && accepted + pending == 0);
        out.put("warehouses", jdbc.queryForList("""
                select id, name from public.warehouses
                where lower(operational_status) in ('operational','full','standby') order by name
                """));
        out.put("temporary_warehouses", jdbc.queryForList("""
                select id, name, level from public.temporary_warehouses
                where lower(operational_status) = 'active' and is_active = true order by name
                """));
        return out;
    }

    // ─── Offers ───

    /**
     * Record a stakeholder's offer. In the source this arrives through the
     * stakeholder portal; the admin console exposes it for on-behalf-of entry
     * (e.g. offers phoned in during an emergency).
     */
    @PostMapping("/bids")
    @PreAuthorize("hasAuthority('resource_allocation.request')")
    @Transactional
    public Map<String, Object> submitBid(@RequestBody Map<String, Object> body) {
        long allocationId = lng(body.get("allocated_resource_id"), "allocated_resource_id");
        long stakeholderId = lng(body.get("stakeholder_id"), "stakeholder_id");
        recordBid(allocationId, stakeholderId, body);
        return Map.of("success", true, "message", "Offer submitted. PMO will review it shortly.");
    }

    /**
     * Self-service pledge from a logged-in partner. The donor organisation is resolved from the
     * authenticated user's linked stakeholder (never trusted from the request), so a partner can only
     * pledge as themselves. Requires the account to be linked to a stakeholder (Partner Directory →
     * Link login). This is the donor-facing counterpart to the admin's on-behalf {@code submitBid}.
     */
    @PostMapping("/pledge")
    @PreAuthorize("hasAuthority('resource_allocation.request')")
    @Transactional
    public Map<String, Object> pledge(@RequestBody Map<String, Object> body) {
        Long userId = users.actingUserId();
        List<Long> ids = userId == null ? List.of()
                : jdbc.queryForList("select id from public.stakeholders where user_id = ? and coalesce(is_active, true) = true",
                        Long.class, userId);
        if (ids.isEmpty()) {
            throw new BusinessRuleException("Your account is not linked to a partner organisation yet. "
                    + "Ask the administrator to link your login in the Partner Directory.");
        }
        long allocationId = lng(body.get("allocated_resource_id"), "allocated_resource_id");
        recordBid(allocationId, ids.get(0), body);
        return Map.of("success", true, "message", "Thank you — your pledge has been submitted. PMO will review it shortly.");
    }

    /** Shared offer recording: validates the allocation is open and within deadline, then files a Pending bid. */
    private void recordBid(long allocationId, long stakeholderId, Map<String, Object> body) {
        double quantity = positive(body.get("quantity_offered"));
        double unitPrice = body.get("unit_price") == null ? 0 : dbl(body.get("unit_price"));
        if (unitPrice < 0) {
            throw new BusinessRuleException("The unit price cannot be negative.");
        }
        // A partner login (bound to a stakeholder org) may only ever pledge as itself — a body-supplied
        // stakeholder_id for another organisation is rejected. Operators/PMO (no link) may file on-behalf-of.
        Long myStakeholder = jurisdiction.currentStakeholderId();
        if (myStakeholder != null && stakeholderId != myStakeholder) {
            throw new BusinessRuleException("You can only submit a pledge for your own organisation.");
        }
        // The allocation must be in the caller's area (scoped via its incident) — no cross-area bidding.
        guardAllocationArea(allocationId);
        Map<String, Object> allocation = findAllocation(allocationId);
        if (!Boolean.TRUE.equals(allocation.get("published_for_stakeholder_bidding"))) {
            throw new BusinessRuleException("This allocation is not open for stakeholder bidding.");
        }
        // Never solicit donations for an allocation that is already fulfilled/closed.
        if (List.of("Delivered", "Rejected", "Cancelled").contains(String.valueOf(allocation.get("status")))) {
            throw new BusinessRuleException("This allocation is " + allocation.get("status")
                    + " — it is no longer open for new offers.");
        }
        Object deadline = allocation.get("bid_deadline");
        if (deadline != null && LocalDate.parse(String.valueOf(deadline).substring(0, 10)).isBefore(LocalDate.now())) {
            throw new BusinessRuleException("The bidding deadline for this request has passed.");
        }
        jdbc.update("""
                insert into public.stakeholder_resource_bids(allocated_resource_id, stakeholder_id, resource_id,
                    quantity_offered, unit_price, delivery_date, status, notes, created_at, updated_at)
                values (?,?,?,?,?,?,'Pending',?,now(),now())
                """, allocationId, stakeholderId, allocation.get("resource_id"), quantity, unitPrice,
                parseDate(body.get("delivery_date")), str(body.get("notes")));
    }

    /** Accept: journal the offer onto the allocation and move it to 'Sourcing'. */
    @PostMapping("/bids/{id}/accept")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @Transactional
    public Map<String, Object> accept(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> bid = findBid(id);
        guardAllocationArea(bidAllocationId(bid));
        requireStatus(bid, "Pending", "Only pending bids can be accepted.");
        String notes = str(body == null ? null : body.get("notes"));
        jdbc.update("update public.stakeholder_resource_bids set status = 'Accepted', notes = coalesce(?, notes), updated_at = now() where id = ?",
                notes, id);

        long allocationId = bidAllocationId(bid);
        Map<String, Object> allocation = findAllocation(allocationId);
        List<Map<String, Object>> journal = journal(allocation.get("source_details"));
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("source_type", "stakeholder_bid");
        entry.put("bid_id", id);
        entry.put("stakeholder_id", bid.get("stakeholder_id"));
        entry.put("stakeholder_name", stakeholderName(bid));
        entry.put("quantity_dispatched", dbl(bid.get("quantity_offered")));
        entry.put("unit_price", dbl(bid.get("unit_price")));
        entry.put("total_cost", dbl(bid.get("quantity_offered")) * dbl(bid.get("unit_price")));
        entry.put("delivery_date", String.valueOf(bid.get("delivery_date")));
        entry.put("accepted_by", users.actingUserId());
        entry.put("accepted_at", OffsetDateTime.now().toString());
        entry.put("notes", notes);
        journal.add(entry);
        saveJournal(allocationId, journal);
        jdbc.update("update public.allocated_resources set status = 'Sourcing', updated_at = now() where id = ?", allocationId);

        notifyBidResult(bid, true, null);
        return Map.of("success", true, "message",
                "Stakeholder donation accepted successfully. The stakeholder has been notified.");
    }

    /** Dismiss/reject a pending offer with a reason. */
    @PostMapping("/bids/{id}/dismiss")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @Transactional
    public Map<String, Object> dismiss(@PathVariable long id, @RequestBody Map<String, Object> body) {
        String reason = str(body.get("reason"));
        if (reason == null || reason.length() < 10) {
            throw new BusinessRuleException("The reason must be at least 10 characters.");
        }
        Map<String, Object> bid = findBid(id);
        guardAllocationArea(bidAllocationId(bid));
        requireStatus(bid, "Pending", "Only pending bids can be dismissed.");
        jdbc.update("update public.stakeholder_resource_bids set status = 'Rejected', notes = ?, updated_at = now() where id = ?",
                reason, id);
        notifyBidResult(bid, false, reason);
        return Map.of("success", true, "message", "Stakeholder bid dismissed. The stakeholder has been notified.");
    }

    /**
     * Goods arrived: bid → 'Received', stock intaken to the chosen store
     * (temp destinations leave warehouse_id null), allocation rolls
     * up to 'Delivered' or 'Partially Fulfilled' from the received total.
     */
    @PostMapping("/bids/{id}/receive")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> receive(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> bid = findBid(id);
        guardAllocationArea(bidAllocationId(bid));
        requireStatus(bid, "Accepted", "Only accepted bids can be marked as received.");
        String destinationType = str(body.get("destination_type")) == null ? "warehouse" : str(body.get("destination_type"));
        if (!List.of("warehouse", "temporary_warehouse").contains(destinationType)) {
            throw new BusinessRuleException("The selected destination type is invalid.");
        }
        Long destinationId = body.get("warehouse_id") != null ? lng(body.get("warehouse_id"), "warehouse_id")
                : body.get("temporary_warehouse_id") != null ? lng(body.get("temporary_warehouse_id"), "temporary_warehouse_id")
                : null;
        if (destinationId == null) {
            throw new BusinessRuleException("Please select a warehouse to receive the donation.");
        }
        // The destination store must be in the caller's area (shared/national warehouses are visible) — an
        // area officer cannot intake donations into another region's warehouse.
        guardDestinationArea(destinationType, destinationId);
        double received = body.get("received_quantity") != null
                ? positive(body.get("received_quantity")) : dbl(bid.get("quantity_offered"));
        long allocationId = bidAllocationId(bid);
        long resourceId = ((Number) bid.get("resource_id")).longValue();
        String stakeholder = stakeholderName(bid);

        jdbc.update("""
                update public.stakeholder_resource_bids set status = 'Received',
                    notes = coalesce(notes || E'\\n', '') || ?, updated_at = now() where id = ?
                """, "[Received] Quantity: " + fmt(received) + ". "
                        + (str(body.get("notes")) == null ? "Delivered by stakeholder." : str(body.get("notes"))), id);

        // Donation batch goes onto the single inventory_items ledger with donor traceability
        String resourceName = jdbc.queryForObject("select name from public.resources where id = ?", String.class, resourceId);
        jdbc.update("""
                insert into public.inventory_items(resource_id, warehouse_id, temporary_warehouse_id, warehouse_type,
                    item_name, quantity, batch_number, status, supplier_donor, received_date, notes,
                    created_at, updated_at)
                values (?,?,?,?,?,?,?, 'Good Condition', ?, current_date, ?, now(), now())
                """, resourceId,
                "warehouse".equals(destinationType) ? destinationId : null,
                "temporary_warehouse".equals(destinationType) ? destinationId : null,
                "warehouse".equals(destinationType) ? "zonal" : "temporary",
                resourceName, (int) received, "DON-" + id + "-" + LocalDate.now().toString().replace("-", ""),
                stakeholder, "Stakeholder donation. Bid ID: " + id);
        Long userId = users.actingUserId();
        jdbc.update("""
                insert into public.stock_movements(resource_id, quantity, movement_type, to_warehouse_id,
                    to_temporary_warehouse_id, allocation_id, supplier, notes, status, user_id,
                    completed_at, completed_by, created_at, updated_at)
                values (?,?,'Intake',?,?,?,?,?, 'Completed', ?, now(), ?, now(), now())
                """, resourceId, (int) received,
                "warehouse".equals(destinationType) ? destinationId : null,
                "temporary_warehouse".equals(destinationType) ? destinationId : null,
                allocationId, stakeholder,
                "Received from [Stakeholder: " + stakeholder + "]. Bid ID: " + id + ". Quantity: " + fmt(received),
                userId, userId);

        // Roll the allocation status up from everything received so far
        Double totalReceived = jdbc.queryForObject("""
                select coalesce(sum(quantity_offered),0) from public.stakeholder_resource_bids
                where allocated_resource_id = ? and status = 'Received'
                """, Double.class, allocationId);
        double allocated = dbl(findAllocation(allocationId).get("quantity_allocated"));
        if (totalReceived != null && totalReceived >= allocated) {
            jdbc.update("update public.allocated_resources set status = 'Delivered', delivered_at = now(), updated_at = now() where id = ?", allocationId);
        } else if (totalReceived != null && totalReceived > 0) {
            jdbc.update("update public.allocated_resources set status = 'Partially Fulfilled', updated_at = now() where id = ?", allocationId);
        }
        return Map.of("success", true, "message",
                "Bid marked as received. Quantity: " + fmt(received) + ". Stock added to inventory.");
    }

    // ─── Pool lifecycle ───

    /** Unpublish with no active offers and return the allocation to normal dispatch. */
    @PostMapping("/allocations/{id}/return-to-dispatch")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> returnToDispatch(@PathVariable long id) {
        guardAllocationArea(id);
        findAllocation(id);
        Long active = jdbc.queryForObject("""
                select count(*) from public.stakeholder_resource_bids
                where allocated_resource_id = ? and status in ('Pending','Accepted') and deleted_at is null
                """, Long.class, id);
        if (active != null && active > 0) {
            throw new BusinessRuleException(
                    "Cannot return to dispatch while there are active bids. Please accept or reject all bids first.");
        }
        jdbc.update("""
                update public.allocated_resources set published_for_stakeholder_bidding = false,
                    status = 'Approved', bidding_status = 'closed', updated_at = now() where id = ?
                """, id);
        jdbc.update("""
                update public.stakeholder_resource_bids set status = 'Withdrawn',
                    notes = 'Returned to dispatch by administrator.', updated_at = now()
                where allocated_resource_id = ? and status = 'Rejected'
                """, id);
        return Map.of("success", true,
                "message", "Resource has been returned to dispatch. Stakeholder bidding has been cancelled.");
    }

    /** Close bidding: withdraw all pending offers, keep accepted ones, unpublish. */
    @PostMapping("/allocations/{id}/close-bidding")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> closeBidding(@PathVariable long id) {
        guardAllocationArea(id);
        findAllocation(id);
        int withdrawn = jdbc.update("""
                update public.stakeholder_resource_bids set status = 'Withdrawn',
                    notes = 'Bidding closed by administrator.', updated_at = now()
                where allocated_resource_id = ? and status = 'Pending'
                """, id);
        jdbc.update("""
                update public.allocated_resources set published_for_stakeholder_bidding = false,
                    bidding_status = 'closed', updated_at = now() where id = ?
                """, id);
        return Map.of("success", true, "withdrawn", withdrawn,
                "message", withdrawn > 0
                        ? "Stakeholder bidding has been closed. Pending bids have been withdrawn."
                        : "Stakeholder bidding has been closed. Resources can now be dispatched through other channels.");
    }

    // ─── Global donations queue + NDMF cash registry ───

    /** All bids across allocations (the source's "Stakeholder Donations" screen). */
    @GetMapping("/donations")
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> donations(@RequestParam(required = false) String status,
                                         @RequestParam(required = false) String search) {
        StringBuilder where = new StringBuilder("b.deleted_at is null");
        List<Object> params = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            where.append(" and b.status = ?");
            params.add(status);
        }
        if (search != null && !search.isBlank()) {
            where.append(" and (s.name ilike ? or r.name ilike ? or i.title ilike ?)");
            String like = "%" + search + "%";
            params.add(like);
            params.add(like);
            params.add(like);
        }
        // Area officers see only donations whose underlying request serves their own area (or shared/unlinked
        // rows, where i.* is null via the left join); national + non-area roles keep the full queue.
        jurisdiction.appendAreaScopeSharedOrOwn("i", where, params);
        // STAKEHOLDER ISOLATION: a partner login (bound to a stakeholder org) sees ONLY its OWN donations/bids,
        // never other organisations'. Operators / PMO (no stakeholder link) keep the management queue.
        Long myStakeholder = jurisdiction.currentStakeholderId();
        if (myStakeholder != null) {
            where.append(" and b.stakeholder_id = ?");
            params.add(myStakeholder);
        }
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select b.*, s.name as stakeholder_name, r.name as resource_name,
                       ar.unit_of_measure, i.title as incident_title
                from public.stakeholder_resource_bids b
                join public.stakeholders s on s.id = b.stakeholder_id
                left join public.resources r on r.id = b.resource_id
                left join public.allocated_resources ar on ar.id = b.allocated_resource_id
                left join public.incidents i on i.id = ar.incident_id
                where %s
                order by case b.status when 'Pending' then 0 else 1 end, b.created_at desc limit 200
                """.formatted(where), params.toArray());
        // Stats + the stakeholder filter list are scoped the same way (a partner sees only its own figures/org).
        StringBuilder statsWhere = new StringBuilder("deleted_at is null");
        List<Object> statsParams = new ArrayList<>();
        if (myStakeholder != null) { statsWhere.append(" and stakeholder_id = ?"); statsParams.add(myStakeholder); }
        Map<String, Object> stats = jdbc.queryForMap("select count(*) as total,"
                + " count(*) filter (where status = 'Pending') as pending,"
                + " count(*) filter (where status = 'Accepted') as accepted,"
                + " count(*) filter (where status = 'Received') as received,"
                + " count(*) filter (where status in ('Rejected','Withdrawn')) as closed"
                + " from public.stakeholder_resource_bids where " + statsWhere, statsParams.toArray());
        List<Map<String, Object>> stakeholderList = myStakeholder != null
                ? jdbc.queryForList("select id, name from public.stakeholders where id = ?", myStakeholder)
                : jdbc.queryForList("select id, name from public.stakeholders where coalesce(is_active, true) order by name");
        return Map.of("donations", rows, "stats", stats, "stakeholders", stakeholderList);
    }

    /**
     * Open needs for partner discovery: resource allocations published for donation that are still
     * awaiting fulfilment, plus trainings whose funding support has been requested but is unfunded.
     * Read-only — this lists what partners can help with; the bid/accept lifecycle stays on the admin
     * console. {@code still_needed} mirrors {@link #pool}'s definition (allocated minus what is already
     * committed); a bid is Accepted xor Received, so summing both never double-deducts.
     */
    @GetMapping("/open-needs")
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> openNeeds(@RequestParam(required = false) String region,
                                         @RequestParam(required = false) String category) {
        StringBuilder where = new StringBuilder(
                "ar.published_for_stakeholder_bidding = true and ar.bidding_status = 'open'"
                        + " and ar.bid_deadline::date >= current_date"
                        + " and ar.status not in ('Delivered','Cancelled','Rejected')"
                        + " and coalesce(i.is_simulation, false) = false");
        List<Object> params = new ArrayList<>();
        if (region != null && !region.isBlank()) {
            where.append(" and i.region_name ilike ?");
            params.add("%" + region + "%");
        }
        if (category != null && !category.isBlank()) {
            where.append(" and r.category ilike ?");
            params.add("%" + category + "%");
        }
        // Area officers see only open needs whose incident is in their own area (or shared); national +
        // non-area roles (incl. partners browsing for donations) keep the full national list of open needs.
        jurisdiction.appendAreaScopeSharedOrOwn("i", where, params);
        List<Map<String, Object>> allocations = jdbc.queryForList("""
                select ar.id, ar.status, ar.quantity_allocated, ar.unit_of_measure, ar.bid_deadline,
                       coalesce(sum(case when srb.status in ('Accepted','Received') then srb.quantity_offered else 0 end), 0) as committed_quantity,
                       greatest(ar.quantity_allocated
                                - coalesce(sum(case when srb.status in ('Accepted','Received') then srb.quantity_offered else 0 end), 0), 0) as still_needed,
                       r.id as resource_id, r.name as resource_name, r.category,
                       i.id as incident_id, i.title as incident_title, i.severity_level,
                       i.region_name, i.district_name
                from public.allocated_resources ar
                join public.resources r on r.id = ar.resource_id
                join public.incidents i on i.id = ar.incident_id
                left join public.stakeholder_resource_bids srb
                       on srb.allocated_resource_id = ar.id and srb.deleted_at is null
                where %s
                group by ar.id, r.id, i.id
                order by ar.bid_deadline asc, ar.id desc
                """.formatted(where), params.toArray());
        List<Map<String, Object>> trainings = jdbc.queryForList("""
                select id, training_id, training_title, implementing_institution, objective,
                       geographical_scope::text as geographical_scope,
                       targeted_audience::text as targeted_audience, venue,
                       training_start_date, training_end_date, support_requested_at
                from public.training_plans
                where support_requested_at is not null and (source_of_fund is null or source_of_fund = '')
                order by support_requested_at desc
                """);
        long urgent = allocations.stream()
                .filter(a -> a.get("bid_deadline") != null
                        && LocalDate.parse(String.valueOf(a.get("bid_deadline")).substring(0, 10))
                                .isBefore(LocalDate.now().plusDays(4)))
                .count();
        // Whether the caller is a partner linked to a stakeholder org (so the UI can offer "Donate").
        Long uid = users.actingUserId();
        boolean canPledge = uid != null && !jdbc.queryForList(
                "select 1 from public.stakeholders where user_id = ? and coalesce(is_active, true) = true", uid).isEmpty();

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("openAllocations", allocations.size());
        stats.put("unfundedTrainings", trainings.size());
        stats.put("urgent", urgent);
        stats.put("canPledge", canPledge);
        // Partner list for the on-behalf picker (staff recording a pledge for a partner who phoned it in).
        List<Map<String, Object>> stakeholders = jdbc.queryForList(
                "select id, name from public.stakeholders where coalesce(is_active, true) = true order by name");
        return Map.of("allocations", allocations, "trainings", trainings, "stats", stats, "stakeholders", stakeholders);
    }

    @GetMapping("/ndmf-donations")
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> ndmfDonations() {
        return Map.of("donations", jdbc.queryForList("""
                select d.*, u.name as recorded_by_name from public.ndmf_donations d
                left join public.users u on u.id = d.recorded_by
                order by d.donation_date desc, d.id desc limit 100
                """));
    }

    /** Record an NDMF cash donation (InventoryItemController::recordDonation). */
    @PostMapping("/ndmf-donations")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> recordNdmfDonation(@RequestBody Map<String, Object> body) {
        String donor = str(body.get("donor_name"));
        String currency = str(body.get("currency"));
        if (donor == null || currency == null || currency.length() != 3) {
            throw new BusinessRuleException("Donor name and a 3-letter currency are required.");
        }
        // A non-numeric amount must be REJECTED, not silently coerced to 0.00.
        double amount = positiveAmount(body.get("amount"));
        // Parse the date in Java so malformed input fails as a clean 400, not a raw ::date 500.
        java.time.LocalDate donationDate = parseDate(body.get("donation_date"));
        // Derive the reference from the row id (unique by construction) — never count(*)+1,
        // which races against the UNIQUE constraint. Insert with a unique temp ref, then finalise.
        Long id = jdbc.queryForObject("""
                insert into public.ndmf_donations(donor_name, amount, currency, donation_date, reference_number,
                    purpose, notes, status, recorded_by, created_at, updated_at)
                values (?,?,?,?,'TMP-' || gen_random_uuid(),?,?,'pending',?,now(),now()) returning id
                """, Long.class, donor, amount, currency.toUpperCase(), donationDate,
                str(body.get("purpose")), str(body.get("notes")), users.actingUserId());
        String reference = "NDMF-" + donationDate.getYear() + "-" + String.format("%05d", id);
        jdbc.update("update public.ndmf_donations set reference_number = ? where id = ?", reference, id);
        return Map.of("success", true, "reference_number", reference, "message", "Donation recorded successfully.");
    }

    // ─── NDMF fund ledger (cash IN balance + cash OUT disbursements) ───

    /** The fund's per-currency balance + the donation and disbursement ledgers. */
    @GetMapping("/ndmf-fund")
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> ndmfFund() {
        // Balance is strictly per currency: received/acknowledged cash IN minus paid cash OUT. The currency
        // key set is the UNION of both sides so a disburse-only currency is never hidden from the ledger.
        List<Map<String, Object>> balances = jdbc.queryForList("""
                with cur as (
                    select currency from public.ndmf_donations where status in ('received','acknowledged')
                    union select currency from public.ndmf_disbursements where status = 'paid'
                )
                select c.currency,
                    coalesce((select sum(amount) from public.ndmf_donations d
                              where d.currency = c.currency and d.status in ('received','acknowledged')), 0) as total_received,
                    coalesce((select sum(amount) from public.ndmf_disbursements x
                              where x.currency = c.currency and x.status = 'paid'), 0) as total_disbursed,
                    coalesce((select sum(amount) from public.ndmf_donations d
                              where d.currency = c.currency and d.status in ('received','acknowledged')), 0)
                    - coalesce((select sum(amount) from public.ndmf_disbursements x
                              where x.currency = c.currency and x.status = 'paid'), 0) as balance
                from cur c order by c.currency
                """);
        List<Map<String, Object>> donations = jdbc.queryForList("""
                select d.*, u.name as recorded_by_name from public.ndmf_donations d
                left join public.users u on u.id = d.recorded_by
                order by d.donation_date desc, d.id desc limit 200
                """);
        List<Map<String, Object>> disbursements = jdbc.queryForList("""
                select x.id, x.reference_number, x.purpose_type, x.amount, x.currency, x.disbursement_date,
                       x.status, x.payee, x.notes, x.training_plan_id, x.allocated_resource_id, x.resource_id,
                       x.quantity, u.name as disbursed_by_name, t.training_title, r.name as resource_name
                from public.ndmf_disbursements x
                left join public.users u on u.id = x.disbursed_by
                left join public.training_plans t on t.id = x.training_plan_id
                left join public.resources r on r.id = x.resource_id
                order by x.created_at desc limit 200
                """);
        return Map.of("balances", balances, "donations", donations, "disbursements", disbursements);
    }

    /** Advance a donation's arrival status (pending → received → acknowledged) so it counts toward the balance. */
    @PostMapping("/ndmf-donations/{id}/status")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> ndmfDonationStatus(@PathVariable long id, @RequestBody Map<String, Object> body) {
        String status = str(body.get("status"));
        if (!List.of("received", "acknowledged").contains(status)) {
            throw new BusinessRuleException("Status must be 'received' or 'acknowledged'.");
        }
        int n = "acknowledged".equals(status)
                ? jdbc.update("update public.ndmf_donations set status='acknowledged', acknowledged_by=?,"
                        + " acknowledged_at=now(), updated_at=now() where id=?", users.actingUserId(), id)
                : jdbc.update("update public.ndmf_donations set status='received', updated_at=now() where id=?", id);
        if (n == 0) {
            throw new ResourceNotFoundException("Donation not found.");
        }
        return Map.of("success", true, "message", "Donation marked " + status + ".");
    }

    /** Disburse NDMF cash to fund an unfunded training — sets its source_of_fund so it leaves Open Needs. */
    @PostMapping("/ndmf-disbursements/training")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> disburseTraining(@RequestBody Map<String, Object> body) {
        long trainingId = lng(body.get("training_plan_id"), "training_plan_id");
        double amount = positiveAmount(body.get("amount"));
        String currency = currency3(body.get("currency"));
        LocalDate date = parseDate(body.get("disbursement_date"));
        List<Map<String, Object>> trows = jdbc.queryForList(
                "select id, source_of_fund, support_requested_at from public.training_plans where id=? for update", trainingId);
        if (trows.isEmpty()) {
            throw new ResourceNotFoundException("Training not found.");
        }
        if (trows.get(0).get("support_requested_at") == null || str(trows.get(0).get("source_of_fund")) != null) {
            throw new BusinessRuleException("This training is not awaiting funding (already funded or no support requested).");
        }
        Long id = insertDisbursement("training", amount, currency, date, trainingId, null, null, null, null, null,
                str(body.get("payee")), str(body.get("notes")));
        if (id == null) {
            throw new BusinessRuleException("Insufficient NDMF balance in " + currency + ".");
        }
        String ref = "NDMF-DISB-" + date.getYear() + "-" + String.format("%05d", id);
        jdbc.update("update public.ndmf_disbursements set reference_number=? where id=?", ref, id);
        jdbc.update("update public.training_plans set source_of_fund=?, updated_at=now() where id=?",
                "NDMF Disbursement " + ref, trainingId);
        return Map.of("success", true, "reference_number", ref,
                "message", "Training funded from NDMF (" + ref + "). It has left Open Needs.");
    }

    /** Disburse NDMF cash to procure resources INTO the warehouse (reuses the normal stock-intake path). */
    @PostMapping("/ndmf-disbursements/procurement")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> disburseProcurement(@RequestBody Map<String, Object> body) {
        double amount = positiveAmount(body.get("amount"));
        String currency = currency3(body.get("currency"));
        LocalDate date = parseDate(body.get("disbursement_date"));
        long resourceId = lng(body.get("resource_id"), "resource_id");
        double q = positive(body.get("quantity"));
        if (q != Math.floor(q)) {
            throw new BusinessRuleException("Quantity must be a whole number of units.");
        }
        int qty = (int) q;
        String destinationType = str(body.get("destination_type")) == null ? "warehouse" : str(body.get("destination_type"));
        if (!List.of("warehouse", "temporary_warehouse").contains(destinationType)) {
            throw new BusinessRuleException("The selected destination type is invalid.");
        }
        Long whId = "warehouse".equals(destinationType) && body.get("warehouse_id") != null
                ? lng(body.get("warehouse_id"), "warehouse_id") : null;
        Long twhId = "temporary_warehouse".equals(destinationType) && body.get("temporary_warehouse_id") != null
                ? lng(body.get("temporary_warehouse_id"), "temporary_warehouse_id") : null;
        if (whId == null && twhId == null) {
            throw new BusinessRuleException("Please select a warehouse to receive the procured stock.");
        }
        // Procured stock may only land in a warehouse the caller's area can see (own or shared/national).
        guardDestinationArea(destinationType, whId != null ? whId : twhId);
        Long allocId = body.get("allocated_resource_id") == null ? null
                : lng(body.get("allocated_resource_id"), "allocated_resource_id");
        // If the procurement fulfils a specific allocation, that allocation must be in the caller's area
        // (scoped via its incident) — otherwise an officer could roll another region's allocation Delivered.
        if (allocId != null) {
            guardAllocationArea(allocId);
        }
        String payee = str(body.get("payee"));

        Long id = insertDisbursement("procurement", amount, currency, date, null, allocId, resourceId, qty, whId, twhId,
                payee, str(body.get("notes")));
        if (id == null) {
            throw new BusinessRuleException("Insufficient NDMF balance in " + currency + ".");
        }
        String ref = "NDMF-DISB-" + date.getYear() + "-" + String.format("%05d", id);
        jdbc.update("update public.ndmf_disbursements set reference_number=? where id=?", ref, id);

        // Intake the procured goods exactly as receive() does — onto the single inventory_items ledger + a
        // stock_movements Intake row (donor/supplier traceability preserved).
        String resourceName = jdbc.queryForObject("select name from public.resources where id=?", String.class, resourceId);
        jdbc.update("""
                insert into public.inventory_items(resource_id, warehouse_id, temporary_warehouse_id, warehouse_type,
                    item_name, quantity, batch_number, status, supplier_donor, received_date, notes, created_at, updated_at)
                values (?,?,?,?,?,?,?, 'Good Condition', ?, current_date, ?, now(), now())
                """, resourceId, whId, twhId, whId != null ? "zonal" : "temporary",
                resourceName, qty, "NDMF-" + ref, payee, "NDMF procurement, ref " + ref);
        Long userId = users.actingUserId();
        jdbc.update("""
                insert into public.stock_movements(resource_id, quantity, movement_type, to_warehouse_id,
                    to_temporary_warehouse_id, allocation_id, supplier, notes, status, user_id, completed_at,
                    completed_by, created_at, updated_at)
                values (?,?,'Intake',?,?,?,?,?, 'Completed', ?, now(), ?, now(), now())
                """, resourceId, qty, whId, twhId, allocId, payee, "NDMF procurement intake. Ref " + ref, userId, userId);

        // Roll the allocation up from the Intake movements actually recorded (NOT stakeholder bids).
        if (allocId != null) {
            Double totalIntake = jdbc.queryForObject("""
                    select coalesce(sum(quantity),0) from public.stock_movements
                    where allocation_id=? and movement_type='Intake' and status='Completed'
                    """, Double.class, allocId);
            double allocated = dbl(findAllocation(allocId).get("quantity_allocated"));
            if (totalIntake != null && totalIntake >= allocated) {
                jdbc.update("update public.allocated_resources set status='Delivered', delivered_at=now(), updated_at=now() where id=?", allocId);
            } else if (totalIntake != null && totalIntake > 0) {
                jdbc.update("update public.allocated_resources set status='Partially Fulfilled', updated_at=now() where id=?", allocId);
            }
        }
        return Map.of("success", true, "reference_number", ref,
                "message", "Procured " + qty + " " + resourceName + " into the warehouse from NDMF (" + ref + ").");
    }

    /** Void a disbursement: credits the cash back. Training returns to Open Needs; procured stock is NOT auto-reversed. */
    @PostMapping("/ndmf-disbursements/{id}/void")
    @PreAuthorize("hasAuthority('resource_allocation.dispatch')")
    @Transactional
    public Map<String, Object> voidDisbursement(@PathVariable long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, status, purpose_type, training_plan_id from public.ndmf_disbursements where id=? for update", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Disbursement not found.");
        }
        Map<String, Object> d = rows.get(0);
        if (!"paid".equals(d.get("status"))) {
            throw new BusinessRuleException("Only a paid disbursement can be voided.");
        }
        jdbc.update("update public.ndmf_disbursements set status='voided', voided_by=?, voided_at=now(), updated_at=now() where id=?",
                users.actingUserId(), id);
        String extra = "";
        if ("training".equals(d.get("purpose_type")) && d.get("training_plan_id") != null) {
            jdbc.update("update public.training_plans set source_of_fund=null, updated_at=now() where id=?", d.get("training_plan_id"));
            extra = " The training has returned to Open Needs.";
        } else if ("procurement".equals(d.get("purpose_type"))) {
            extra = " Note: stock already received into the warehouse is NOT reversed — make a separate inventory adjustment if the goods must be returned.";
        }
        return Map.of("success", true, "message", "Disbursement voided; cash credited back to the fund." + extra);
    }

    /**
     * Race-safe cash-out: a per-currency advisory lock serialises disbursements, and the row is written by a
     * single conditional INSERT…SELECT whose WHERE re-derives the live balance — so two concurrent requests
     * can never both drain the same balance. Returns the new id, or null when the balance is insufficient.
     */
    private Long insertDisbursement(String purposeType, double amount, String currency, LocalDate date,
                                    Long trainingId, Long allocId, Long resourceId, Integer qty, Long whId,
                                    Long twhId, String payee, String notes) {
        jdbc.queryForList("select pg_advisory_xact_lock(hashtext(?))", "ndmf_fund_" + currency);
        List<Long> ids = jdbc.queryForList("""
                insert into public.ndmf_disbursements(reference_number, purpose_type, amount, currency,
                    disbursement_date, status, training_plan_id, allocated_resource_id, resource_id, quantity,
                    warehouse_id, temporary_warehouse_id, payee, notes, disbursed_by, created_at, updated_at)
                select 'TMP-' || gen_random_uuid(), ?, ?, ?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?, ?, ?, now(), now()
                where ( coalesce((select sum(amount) from public.ndmf_donations
                                  where status in ('received','acknowledged') and currency = ?), 0)
                      - coalesce((select sum(amount) from public.ndmf_disbursements
                                  where status = 'paid' and currency = ?), 0) ) >= ?
                returning id
                """, Long.class, purposeType, amount, currency, date, trainingId, allocId, resourceId, qty, whId, twhId,
                payee, notes, users.actingUserId(), currency, currency, amount);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private static String currency3(Object v) {
        String c = str(v);
        if (c == null || c.length() != 3) {
            throw new BusinessRuleException("A valid 3-letter currency is required.");
        }
        return c.toUpperCase();
    }

    // ─── internals ───

    /** In-app notice to every user account linked to a stakeholder organisation (via the one dispatcher). */
    private void notifyStakeholderUsers(long allocationId, String type, String title, String message) {
        List<Long> ids = jdbc.queryForList(
                "select distinct user_id from public.stakeholders where user_id is not null", Long.class);
        notifications.notifyUsers(ids,
                NotificationService.Notice.inApp(type, title, message,
                        "/m/response/donations", "allocation", allocationId, "info"));
    }

    private void notifyBidResult(Map<String, Object> bid, boolean accepted, String reason) {
        Object userId = jdbc.queryForList("select user_id from public.stakeholders where id = ?",
                bid.get("stakeholder_id")).stream().findFirst().map(r -> r.get("user_id")).orElse(null);
        if (userId == null) {
            return;
        }
        String title = accepted ? "Your bid has been accepted" : "Update on your bid";
        String message = accepted
                ? "Your offer of " + fmt(dbl(bid.get("quantity_offered"))) + " units was accepted. Delivery expected by "
                        + bid.get("delivery_date") + "."
                : "Your offer of " + fmt(dbl(bid.get("quantity_offered"))) + " units was not selected."
                        + (reason == null ? " Thank you for your willingness to support." : " Reason: " + reason);
        Object allocId = bid.get("allocated_resource_id");
        notifications.notifyUser(((Number) userId).longValue(),
                NotificationService.Notice.inApp("stakeholder_bid_result", title, message,
                        "/m/response/donations", "allocation",
                        allocId == null ? null : ((Number) allocId).longValue(),
                        accepted ? "success" : "info"));
    }

    private String stakeholderName(Map<String, Object> bid) {
        return jdbc.queryForObject("select name from public.stakeholders where id = ?", String.class,
                bid.get("stakeholder_id"));
    }

    private static void requireStatus(Map<String, Object> bid, String expected, String message) {
        if (!expected.equals(bid.get("status"))) {
            throw new BusinessRuleException(message);
        }
    }

    /** The allocation a bid belongs to — guards the nullable link so an orphaned bid yields a clean 400, not an NPE. */
    private static long bidAllocationId(Map<String, Object> bid) {
        Object ref = bid.get("allocated_resource_id");
        if (ref == null) {
            throw new BusinessRuleException("This donation offer is not linked to a resource request, so it cannot be processed.");
        }
        return ((Number) ref).longValue();
    }

    private Map<String, Object> findBid(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from public.stakeholder_resource_bids where id = ? and deleted_at is null for update", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Bid not found.");
        }
        return rows.get(0);
    }

    private Map<String, Object> findAllocation(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.allocated_resources where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Allocation not found.");
        }
        return rows.get(0);
    }

    private List<Map<String, Object>> journal(Object sourceDetails) {
        if (sourceDetails == null) {
            return new ArrayList<>();
        }
        try {
            Object parsed = JSON.readValue(String.valueOf(sourceDetails), Object.class);
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
            throw new BusinessRuleException("Could not record bid details.");
        }
    }

    private static double sumWhere(List<Map<String, Object>> bids, String status) {
        return bids.stream().filter(b -> status.equals(b.get("status")))
                .mapToDouble(b -> dbl(b.get("quantity_offered"))).sum();
    }

    private static double positive(Object v) {
        double q = v instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(v));
        if (q <= 0) {
            throw new BusinessRuleException("Quantity must be greater than zero.");
        }
        return q;
    }

    /** A monetary amount that must be a real, positive number (never coerce to 0). */
    private static double positiveAmount(Object v) {
        double amount;
        try {
            amount = v instanceof Number n ? n.doubleValue() : Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            throw new BusinessRuleException("The amount must be a valid number.");
        }
        if (amount <= 0) {
            throw new BusinessRuleException("The amount must be greater than zero.");
        }
        return amount;
    }

    /** Parse a required date, rejecting malformed input as a clean business-rule error (not a 500). */
    private static java.time.LocalDate parseDate(Object v) {
        String s = str(v);
        if (s == null) {
            throw new BusinessRuleException("A valid date is required.");
        }
        try {
            return java.time.LocalDate.parse(s.length() > 10 ? s.substring(0, 10) : s);
        } catch (Exception e) {
            throw new BusinessRuleException("The date is not in a valid format (expected YYYY-MM-DD).");
        }
    }

    private static long lng(Object v, String field) {
        if (v == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return (long) Double.parseDouble(String.valueOf(v));
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

    private static String fmt(double v) {
        return v == Math.floor(v) ? String.valueOf((long) v) : String.valueOf(v);
    }
}
