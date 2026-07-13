package tz.go.pmo.dmis.recovery;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
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
import org.springframework.security.access.prepost.PreAuthorize;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.service.support.DispatchSupportService;
import tz.go.pmo.dmis.service.support.SimulationGuard;

/**
 * Relief Distribution (Recovery) — port of the Laravel relief_distributions module: logs each relief
 * item handed to a beneficiary group, traceable to the incident/assessment and the distributing
 * agency, with a Pending Verification → Confirmed status. The recovery counterpart of the response
 * dispatch chain.
 */
@RestController
@RequestMapping("/v1/recovery/relief-distributions")
public class ReliefDistributionController {

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;
    private final DispatchSupportService stock;
    private final CurrentUserResolver users;
    private final SimulationGuard simulationGuard;

    public ReliefDistributionController(JdbcTemplate jdbc, JurisdictionScope jurisdiction,
                                        AreaGuard areaGuard, DispatchSupportService stock,
                                        CurrentUserResolver users, SimulationGuard simulationGuard) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
        this.stock = stock;
        this.users = users;
        this.simulationGuard = simulationGuard;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('recovery.view')")
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String search) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            where.append(" and d.confirmation_status = ?");
            params.add(status);
        }
        if (search != null && !search.isBlank()) {
            where.append(" and (d.beneficiary_name_or_group ilike ? or d.location_name ilike ? or r.name ilike ?)");
            params.add("%" + search + "%");
            params.add("%" + search + "%");
            params.add("%" + search + "%");
        }
        // Row-level area scope: an area officer sees rows tied to an incident in their own
        // region/district (plus incident-less / unassigned rows, which surface as i.* IS NULL via the
        // LEFT JOIN); national + non-area roles add nothing and keep the full view. Appended last in
        // the WHERE so its bind param trails the status/search params in '?' order.
        jurisdiction.appendAreaScopeWithCouncil("i", where, params);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("distributions", jdbc.queryForList("""
                select d.id, d.distribution_date, d.location_name, d.district_name, d.region_name,
                       d.quantity_distributed, d.unit_of_measure, d.beneficiary_name_or_group,
                       d.beneficiary_contact, d.confirmation_status, d.notes, d.incident_id,
                       d.damage_assessment_id, d.warehouse_id, d.temporary_warehouse_id,
                       d.stock_movement_id,
                       r.name as resource_name, r.category as resource_category,
                       a.name as agency_name, coalesce(i.title,'—') as incident_title,
                       u.name as distributed_by_name,
                       case when d.warehouse_id is not null then 'warehouse'
                            when d.temporary_warehouse_id is not null then 'temporary_warehouse'
                            else null end as source_type,
                       coalesce(w.name, tw.name) as source_name
                from public.relief_distributions d
                left join public.resources r on r.id = d.resource_id
                left join public.agencies a on a.id = d.distributing_agency_id
                left join public.incidents i on i.id = d.incident_id
                left join public.users u on u.id = d.distributed_by_user_id
                left join public.warehouses w on w.id = d.warehouse_id
                left join public.temporary_warehouses tw on tw.id = d.temporary_warehouse_id
                where %s order by d.distribution_date desc, d.id desc limit 300
                """.formatted(where), params.toArray()));
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where d.confirmation_status='Confirmed') as confirmed,
                       count(*) filter (where d.confirmation_status='Pending Verification') as pending,
                       count(distinct d.beneficiary_name_or_group) as beneficiary_groups,
                       coalesce(sum(d.quantity_distributed),0) as total_quantity
                from public.relief_distributions d
                left join public.resources r on r.id = d.resource_id
                left join public.incidents i on i.id = d.incident_id
                where %s
                """.formatted(where), params.toArray()));
        out.put("by_resource", jdbc.queryForList("""
                select coalesce(r.name,'—') as resource_name, count(*) as count,
                       coalesce(sum(d.quantity_distributed),0) as quantity
                from public.relief_distributions d
                left join public.resources r on r.id = d.resource_id
                left join public.incidents i on i.id = d.incident_id
                where %s
                group by r.name order by quantity desc limit 12
                """.formatted(where), params.toArray()));
        out.put("resources", jdbc.queryForList(
                "select id, name, unit_of_measure from public.resources order by name limit 300"));
        StringBuilder incidentWhere = new StringBuilder("coalesce(i.is_simulation,false)=false");
        List<Object> incidentParams = new ArrayList<>();
        jurisdiction.appendAreaScope("i", incidentWhere, incidentParams);
        out.put("incidents", jdbc.queryForList("""
                select i.id, i.title, i.region_name, i.district_name
                from public.incidents i
                where %s order by i.reported_at desc nulls last, i.id desc limit 200
                """.formatted(incidentWhere), incidentParams.toArray()));
        out.put("assessments", jdbc.queryForList("""
                select da.id, da.incident_id, da.assessment_type, da.assessment_date, da.status
                from public.damage_assessments da
                join public.incidents i on i.id = da.incident_id
                where %s order by da.assessment_date desc, da.id desc limit 300
                """.formatted(incidentWhere), incidentParams.toArray()));
        out.put("agencies", jdbc.queryForList("select id, name from public.agencies order by name limit 200"));
        out.put("stock_sources", stockSources());
        return out;
    }

    @PreAuthorize("hasAuthority('recovery.manage')")
    @PostMapping
    @Transactional
    public Map<String, Object> store(@RequestBody Map<String, Object> b) {
        long incidentId = requiredLong(b.get("incident_id"), "incident_id");
        areaGuard.assertOwn("public.incidents", incidentId);
        simulationGuard.assertNotSimulationIncident(incidentId, "recording a relief distribution");
        Map<String, Object> incident = jdbc.queryForMap("""
                select id, district_name, region_name from public.incidents where id = ?
                """, incidentId);
        long resourceId = requiredLong(b.get("resource_id"), "resource_id");
        int quantity = positiveWholeQuantity(b.get("quantity_distributed"));
        Source source = sourceFromBody(b);
        requireSourceVisible(source);
        if (stock.availableQuantity(source.stockType(), source.id(), resourceId) < quantity) {
            throw new BusinessRuleException("Insufficient stock at the selected source.");
        }
        Long assessmentId = assessmentId(incidentId, b.get("damage_assessment_id"));
        String unit = str(b.get("unit_of_measure"));
        if (unit == null) {
            unit = jdbc.query("select unit_of_measure from public.resources where id = ?",
                    rs -> rs.next() ? str(rs.getString(1)) : null, resourceId);
        }
        Long userId = users.actingUserId();
        Long id = jdbc.queryForObject("""
                insert into public.relief_distributions(incident_id, distribution_date, location_name,
                    district_name, region_name, damage_assessment_id, resource_id, quantity_distributed, unit_of_measure,
                    beneficiary_name_or_group, beneficiary_contact, distributing_agency_id,
                    distributed_by_user_id, warehouse_id, temporary_warehouse_id,
                    confirmation_status, notes, created_at, updated_at)
                values (?, coalesce(?::date, current_date), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        'Pending Verification', ?, now(), now())
                returning id
                """, Long.class, incidentId, str(b.get("distribution_date")),
                require(b.get("location_name"), "location_name"), strOr(b.get("district_name"), incident.get("district_name")),
                strOr(b.get("region_name"), incident.get("region_name")), assessmentId, resourceId, quantity,
                unit, require(b.get("beneficiary_name_or_group"), "beneficiary"),
                str(b.get("beneficiary_contact")), num(b.get("distributing_agency_id")), userId,
                source.warehouseId(), source.temporaryWarehouseId(), str(b.get("notes")));
        return Map.of("success", true, "id", id, "message", "Relief distribution recorded.");
    }

    @PreAuthorize("hasAuthority('recovery.manage')")
    @PostMapping("/{id}/confirm")
    @Transactional
    public Map<String, Object> confirm(@PathVariable long id) {
        Map<String, Object> d = findForUpdate(id);
        if ("Confirmed".equals(str(d.get("confirmation_status")))) {
            return Map.of("success", true, "message", "Distribution already confirmed.");
        }
        Long incidentId = asLong(d.get("incident_id"));
        if (incidentId == null) {
            throw new BusinessRuleException("A relief distribution must be linked to an incident before confirmation.");
        }
        areaGuard.assertOwn("public.incidents", incidentId);
        simulationGuard.assertNotSimulationIncident(incidentId, "confirming a relief distribution");
        Long resourceId = asLong(d.get("resource_id"));
        if (resourceId == null) {
            throw new BusinessRuleException("A relief distribution must have a resource before confirmation.");
        }
        int quantity = positiveWholeQuantity(d.get("quantity_distributed"));
        Source source = sourceFromRow(d);
        requireSourceVisible(source);
        stock.deductStock(source.stockType(), source.id(), resourceId, quantity);
        Long userId = users.actingUserId();
        Long movementId = jdbc.queryForObject("""
                insert into public.stock_movements(resource_id, quantity, movement_type,
                    from_warehouse_id, from_temporary_warehouse_id, warehouse_type, reason, notes,
                    incident_id, status, user_id, completed_at, completed_by, created_at, updated_at)
                values (?,?,'Removal',?,?,?,?,?,?,'Completed',?,now(),?,now(),now()) returning id
                """, Long.class, resourceId, quantity, source.warehouseId(), source.temporaryWarehouseId(),
                source.warehouseType(), "relief_distribution",
                "Relief distribution #" + id + " to " + d.get("beneficiary_name_or_group"),
                incidentId, userId, userId);
        if (jdbc.update("""
                update public.relief_distributions
                   set confirmation_status='Confirmed',
                       stock_movement_id=?,
                       distributed_by_user_id=coalesce(distributed_by_user_id, ?),
                       updated_at=now()
                 where id=?
                """, movementId, userId, id) == 0) {
            throw new ResourceNotFoundException("Distribution not found.");
        }
        return Map.of("success", true, "message", "Distribution confirmed.", "stock_movement_id", movementId);
    }

    private List<Map<String, Object>> stockSources() {
        StringBuilder whWhere = new StringBuilder("""
                ii.quantity > 0 and ii.warehouse_id is not null and ii.temporary_warehouse_id is null
                and (ii.warehouse_type is null or ii.warehouse_type <> 'temporary')
                """);
        List<Object> whParams = new ArrayList<>();
        jurisdiction.appendWarehouseScope("w", whWhere, whParams);
        StringBuilder twWhere = new StringBuilder("ii.quantity > 0 and ii.temporary_warehouse_id is not null");
        List<Object> twParams = new ArrayList<>();
        jurisdiction.appendWarehouseScope("tw", twWhere, twParams);
        List<Map<String, Object>> out = new ArrayList<>();
        out.addAll(jdbc.queryForList("""
                select 'warehouse' as source_type, w.id as source_id, w.name as source_name,
                       r.id as resource_id, r.name as resource_name, sum(ii.quantity) as available_quantity,
                       'Zonal Warehouse' as source_label
                from public.inventory_items ii
                join public.warehouses w on w.id = ii.warehouse_id
                join public.resources r on r.id = ii.resource_id
                where %s
                group by w.id, w.name, r.id, r.name
                """.formatted(whWhere), whParams.toArray()));
        out.addAll(jdbc.queryForList("""
                select 'temporary_warehouse' as source_type, tw.id as source_id, tw.name as source_name,
                       r.id as resource_id, r.name as resource_name, sum(ii.quantity) as available_quantity,
                       'Temporary Warehouse' as source_label
                from public.inventory_items ii
                join public.temporary_warehouses tw on tw.id = ii.temporary_warehouse_id
                join public.resources r on r.id = ii.resource_id
                where %s
                group by tw.id, tw.name, r.id, r.name
                """.formatted(twWhere), twParams.toArray()));
        return out;
    }

    private Map<String, Object> findForUpdate(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select * from public.relief_distributions where id = ? for update
                """, id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Distribution not found.");
        }
        return rows.get(0);
    }

    private Long assessmentId(long incidentId, Object raw) {
        Long explicit = num(raw);
        if (explicit != null) {
            Long count = jdbc.queryForObject("""
                    select count(*) from public.damage_assessments where id = ? and incident_id = ?
                    """, Long.class, explicit, incidentId);
            if (count == null || count == 0) {
                throw new ResourceNotFoundException("Damage assessment not found for this incident.");
            }
            return explicit;
        }
        List<Long> ids = jdbc.queryForList("""
                select id from public.damage_assessments
                where incident_id = ? order by case when status='Completed' then 0 else 1 end,
                    assessment_date desc, id desc limit 1
                """, Long.class, incidentId);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Source sourceFromBody(Map<String, Object> b) {
        return source(num(b.get("warehouse_id")), num(b.get("temporary_warehouse_id")));
    }

    private Source sourceFromRow(Map<String, Object> d) {
        return source(asLong(d.get("warehouse_id")), asLong(d.get("temporary_warehouse_id")));
    }

    private Source source(Long warehouseId, Long temporaryWarehouseId) {
        if ((warehouseId == null && temporaryWarehouseId == null) || (warehouseId != null && temporaryWarehouseId != null)) {
            throw new BusinessRuleException("Select exactly one source warehouse for this relief distribution.");
        }
        return new Source(warehouseId, temporaryWarehouseId);
    }

    private void requireSourceVisible(Source source) {
        if (source.warehouseId() != null) {
            areaGuard.assertWarehouseVisible("public.warehouses", source.warehouseId());
        } else {
            areaGuard.assertWarehouseVisible("public.temporary_warehouses", source.temporaryWarehouseId());
        }
    }

    private static String str(Object v) {
        if (v == null) { return null; }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
    private static Long num(Object v) {
        String s = str(v);
        if (s == null) { return null; }
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            throw new BusinessRuleException("Expected a numeric identifier.");
        }
    }
    private static Long requiredLong(Object v, String f) {
        Long n = num(v);
        if (n == null) { throw new BusinessRuleException("The " + f + " field is required."); }
        return n;
    }
    private static int positiveWholeQuantity(Object v) {
        String s = str(v);
        if (s == null) { throw new BusinessRuleException("The quantity distributed must be greater than 0."); }
        try {
            double d = Double.parseDouble(s);
            int rounded = (int) Math.rint(d);
            if (d <= 0 || Math.abs(d - rounded) > 0.000001) {
                throw new BusinessRuleException("The quantity distributed must be a positive whole number.");
            }
            return rounded;
        } catch (NumberFormatException e) {
            throw new BusinessRuleException("The quantity distributed must be numeric.");
        }
    }
    private static String require(Object v, String f) {
        String s = str(v);
        if (s == null) { throw new BusinessRuleException("The " + f + " field is required."); }
        return s;
    }
    private static String strOr(Object v, Object fallback) {
        String s = str(v);
        return s == null ? str(fallback) : s;
    }
    private static Long asLong(Object v) {
        return v instanceof Number n ? n.longValue() : num(v);
    }
    private record Source(Long warehouseId, Long temporaryWarehouseId) {
        long id() { return warehouseId != null ? warehouseId : temporaryWarehouseId; }
        String stockType() { return warehouseId != null ? "warehouse" : "temporary_warehouse"; }
        String warehouseType() { return warehouseId != null ? "zonal" : "temporary"; }
    }
}
