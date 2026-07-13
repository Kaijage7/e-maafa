package tz.go.pmo.dmis.service.impl;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.service.StakeholderCoordinationService;

/**
 * Read-only JDBC 360° stakeholder footprint. Paths/JSON unchanged from the former response package
 * controller. Never writes {@code stakeholders} (portal/settings own that registry).
 */
@Service
@RequiredArgsConstructor
public class StakeholderCoordinationServiceImpl implements StakeholderCoordinationService {

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> index() {
        Map<String, Object> out = new LinkedHashMap<>();
        // jurisdiction visibility: region/district officer sees their own area + shared partners; national sees all.
        StringBuilder area = new StringBuilder();
        List<Object> params = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("s", area, params);
        // Each stakeholder with a count of their footprint across the three pillars.
        out.put("stakeholders", jdbc.queryForList(
                "select s.id, s.name, s.organization, s.type, s.sector, s.region, s.district,"
                        + " s.is_active, s.is_verified,"
                        + " (select count(*) from public.incident_tasks t where t.stakeholder_id = s.id) as response_tasks,"
                        + " (select count(*) from public.stakeholder_resource_bids b where b.stakeholder_id = s.id) as donations,"
                        + " (select coalesce(sum(ar.quantity),0) from public.agency_resources ar"
                        + "    join public.agencies a on a.id = ar.agency_id"
                        + "    where a.name ilike '%' || coalesce(s.organization, s.name) || '%'"
                        + "       or coalesce(s.organization, s.name) ilike '%' || a.name || '%') as warehouse_stock"
                        + " from public.stakeholders s"
                        + " where coalesce(s.is_active, true)" + area
                        + " order by (select count(*) from public.incident_tasks t where t.stakeholder_id = s.id)"
                        + "          + (select count(*) from public.stakeholder_resource_bids b where b.stakeholder_id = s.id) desc,"
                        + "          s.organization nulls last, s.name"
                        + " limit 200",
                params.toArray()));
        // total_stakeholders is scoped to match the list; engagement counts stay global (cross-cutting linkage metrics).
        out.put("stats", jdbc.queryForMap(
                "select (select count(*) from public.stakeholders s where coalesce(s.is_active,true)" + area
                        + ") as total_stakeholders,"
                        + " (select count(distinct stakeholder_id) from public.incident_tasks where stakeholder_id is not null) as engaged_in_response,"
                        + " (select count(distinct stakeholder_id) from public.stakeholder_resource_bids) as engaged_in_recovery,"
                        + " (select count(*) from public.agency_resources) as agency_stock_lines",
                params.toArray()));
        return out;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> show(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.stakeholders where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Stakeholder not found.");
        }
        // jurisdiction: stakeholders are a shared-or-own registry (NULL area = national/shared).
        // Out-of-area partners must 404, mirroring the area-scoped list (appendAreaScopeSharedOrOwn).
        areaGuard.assertOwnOrShared("public.stakeholders", id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stakeholder", rows.get(0));

        // RESPONSE — DRF coordination lanes assigned to this stakeholder
        out.put("response_lanes", jdbc.queryForList("""
                select t.id, t.title, t.status, t.priority, t.progress_percent, t.is_72hr_critical,
                       f.number as drf_number, f.name as drf_name,
                       coalesce(i.title, ra.hazard_description) as activation_title, ra.posture
                from public.incident_tasks t
                join public.disaster_response_functions f on f.id = t.drf_id
                left join public.response_activations ra on ra.id = t.activation_id
                left join public.incidents i on i.id = t.incident_id
                where t.stakeholder_id = ? order by t.is_72hr_critical desc, f.number limit 100
                """, id));

        // RECOVERY — donations / resource bids offered
        out.put("recovery_donations", jdbc.queryForList("""
                select b.id, b.quantity_offered, b.unit_price, b.delivery_date, b.status,
                       r.name as resource_name, ar.unit_of_measure, i.title as incident_title
                from public.stakeholder_resource_bids b
                left join public.resources r on r.id = b.resource_id
                left join public.allocated_resources ar on ar.id = b.allocated_resource_id
                left join public.incidents i on i.id = ar.incident_id
                where b.stakeholder_id = ? order by b.created_at desc limit 100
                """, id));

        // WAREHOUSE — agency stock this organisation holds (matched by name)
        out.put("warehouse_stock", jdbc.queryForList("""
                select a.name as agency_name, r.name as resource_name, ar.quantity, ar.condition_status,
                       ar.location_description
                from public.agency_resources ar
                join public.agencies a on a.id = ar.agency_id
                join public.resources r on r.id = ar.resource_id
                join public.stakeholders s on s.id = ?
                where a.name ilike '%' || coalesce(s.organization, s.name) || '%'
                   or coalesce(s.organization, s.name) ilike '%' || a.name || '%'
                order by ar.quantity desc limit 100
                """, id));

        // Summary
        out.put("summary", jdbc.queryForMap("""
                select (select count(*) from public.incident_tasks where stakeholder_id = ?) as response_tasks,
                       (select count(*) from public.incident_tasks where stakeholder_id = ? and status='Completed') as response_completed,
                       (select count(*) from public.stakeholder_resource_bids where stakeholder_id = ?) as donations,
                       (select coalesce(sum(quantity_offered),0) from public.stakeholder_resource_bids
                          where stakeholder_id = ? and status in ('Accepted','Received')) as donated_quantity
                """, id, id, id, id));
        return out;
    }
}
