package tz.go.pmo.dmis.service.impl;

import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.service.ResourceReportService;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Resource Allocation Report service — faithful port of
 * {@code ResourceAllocationController@generateReport} + {@code response/resource-allocation/report.blade.php}.
 * A date-ranged report of resource requests: the four summary tiles (total / approved / rejected /
 * deployed), the total allocated value (Σ quantity_allocated × unit_cost), and the allocation
 * records table. Read-only. The "Resource Reports" item under Reports & Analytics.
 *
 * <p>Jurisdiction (area) scoping: allocations are incident-children (every row carries an
 * {@code incident_id}), so each aggregate joins the parent incident and applies
 * {@link JurisdictionScope#appendAreaScopeWithCouncil} on the incident alias {@code "i"}.
 * An area officer reports only on allocations whose incident is in their own district/LGA or region;
 * the national tier keeps the whole-country roll-up. No cross-region leakage via null-area rows.
 */
@Service
public class ResourceReportServiceImpl implements ResourceReportService {

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;

    public ResourceReportServiceImpl(JdbcTemplate jdbc, JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
    }

    @Override
    public Map<String, Object> index(String start_date, String end_date) {
        // National resource-allocation analytics is staff-only — a donor/partner account must not read it.
        if (jurisdiction.currentStakeholderId() != null) {
            throw new tz.go.pmo.dmis.common.error.ResourceNotFoundException("Not found.");
        }
        // Source default window: the previous month → today.
        LocalDate end = parseOr(end_date, LocalDate.now());
        LocalDate start = parseOr(start_date, end.minusMonths(1));
        if (start.isAfter(end)) {
            throw new BusinessRuleException("The start date must not be after the end date.");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("start_date", start.toString());
        out.put("end_date", end.toString());

        // inclusive of the end day
        LocalDate endExclusive = end.plusDays(1);

        StringBuilder summarySql = new StringBuilder("""
                select count(*) as total_requests,
                       count(*) filter (where ar.status = 'Approved') as approved,
                       count(*) filter (where ar.status = 'Rejected') as rejected,
                       count(*) filter (where ar.status = 'Deployed') as deployed,
                       coalesce(sum(coalesce(ar.quantity_allocated,0) * coalesce(r.unit_cost,0)),0) as total_value
                from public.allocated_resources ar
                left join public.resources r on r.id = ar.resource_id
                left join public.incidents i on i.id = ar.incident_id
                where ar.created_at >= ? and ar.created_at < ?
                  and not exists (select 1 from public.incidents s
                                   where s.id = ar.incident_id and s.is_simulation)""");
        List<Object> summaryParams = new ArrayList<>(List.of(start, endExclusive));
        jurisdiction.appendAreaScopeWithCouncil("i", summarySql, summaryParams);
        out.put("summary", jdbc.queryForMap(summarySql.toString(), summaryParams.toArray()));

        StringBuilder recordsSql = new StringBuilder("""
                select ar.id, ar.quantity_allocated, ar.quantity_requested, ar.status, ar.created_at,
                       ar.unit_of_measure, coalesce(i.title, '—') as incident_title,
                       r.name as resource_name, r.category as resource_category, r.unit_cost,
                       coalesce(ar.quantity_allocated,0) * coalesce(r.unit_cost,0) as line_value
                from public.allocated_resources ar
                left join public.incidents i on i.id = ar.incident_id
                left join public.resources r on r.id = ar.resource_id
                where ar.created_at >= ? and ar.created_at < ?
                  and not exists (select 1 from public.incidents s
                                   where s.id = ar.incident_id and s.is_simulation)""");
        List<Object> recordsParams = new ArrayList<>(List.of(start, endExclusive));
        jurisdiction.appendAreaScopeWithCouncil("i", recordsSql, recordsParams);
        recordsSql.append(" order by ar.created_at desc limit 500");
        out.put("records", jdbc.queryForList(recordsSql.toString(), recordsParams.toArray()));

        StringBuilder byStatusSql = new StringBuilder("""
                select coalesce(ar.status,'(none)') as status, count(*) as count
                from public.allocated_resources ar
                left join public.incidents i on i.id = ar.incident_id
                where ar.created_at >= ? and ar.created_at < ?
                  and not exists (select 1 from public.incidents s
                                   where s.id = ar.incident_id and s.is_simulation)""");
        List<Object> byStatusParams = new ArrayList<>(List.of(start, endExclusive));
        jurisdiction.appendAreaScopeWithCouncil("i", byStatusSql, byStatusParams);
        byStatusSql.append(" group by ar.status order by count desc");
        out.put("by_status", jdbc.queryForList(byStatusSql.toString(), byStatusParams.toArray()));

        StringBuilder byCategorySql = new StringBuilder("""
                select coalesce(r.category,'Uncategorised') as category, count(*) as count,
                       coalesce(sum(coalesce(ar.quantity_allocated,0)),0) as quantity
                from public.allocated_resources ar
                left join public.resources r on r.id = ar.resource_id
                left join public.incidents i on i.id = ar.incident_id
                where ar.created_at >= ? and ar.created_at < ?
                  and not exists (select 1 from public.incidents s
                                   where s.id = ar.incident_id and s.is_simulation)""");
        List<Object> byCategoryParams = new ArrayList<>(List.of(start, endExclusive));
        jurisdiction.appendAreaScopeWithCouncil("i", byCategorySql, byCategoryParams);
        byCategorySql.append(" group by r.category order by count desc");
        out.put("by_category", jdbc.queryForList(byCategorySql.toString(), byCategoryParams.toArray()));
        return out;
    }

    private static LocalDate parseOr(String s, LocalDate fallback) {
        if (s == null || s.isBlank()) {
            return fallback;
        }
        try {
            return LocalDate.parse(s.trim().substring(0, 10));
        } catch (Exception e) {
            throw new BusinessRuleException("Invalid date '" + s + "' — use YYYY-MM-DD.");
        }
    }
}
