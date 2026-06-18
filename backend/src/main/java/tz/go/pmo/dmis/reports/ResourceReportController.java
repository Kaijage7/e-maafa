package tz.go.pmo.dmis.reports;

import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;

/**
 * Resource Allocation Report — faithful port of
 * {@code ResourceAllocationController@generateReport} + {@code response/resource-allocation/report.blade.php}.
 * A date-ranged report of resource requests: the four summary tiles (total / approved / rejected /
 * deployed), the total allocated value (Σ quantity_allocated × unit_cost), and the allocation
 * records table. Read-only. The "Resource Reports" item under Reports & Analytics.
 */
@RestController
@RequestMapping("/v1/reports/resource-allocations")
public class ResourceReportController {

    private final JdbcTemplate jdbc;

    public ResourceReportController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String start_date,
                                     @RequestParam(required = false) String end_date) {
        // Source default window: the previous month → today.
        LocalDate end = parseOr(end_date, LocalDate.now());
        LocalDate start = parseOr(start_date, end.minusMonths(1));
        if (start.isAfter(end)) {
            throw new BusinessRuleException("The start date must not be after the end date.");
        }
        // inclusive of the end day
        Object[] range = { start, end.plusDays(1) };

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("start_date", start.toString());
        out.put("end_date", end.toString());

        out.put("summary", jdbc.queryForMap("""
                select count(*) as total_requests,
                       count(*) filter (where ar.status = 'Approved') as approved,
                       count(*) filter (where ar.status = 'Rejected') as rejected,
                       count(*) filter (where ar.status = 'Deployed') as deployed,
                       coalesce(sum(coalesce(ar.quantity_allocated,0) * coalesce(r.unit_cost,0)),0) as total_value
                from public.allocated_resources ar
                left join public.resources r on r.id = ar.resource_id
                where ar.created_at >= ? and ar.created_at < ?
                """, range));

        out.put("records", jdbc.queryForList("""
                select ar.id, ar.quantity_allocated, ar.quantity_requested, ar.status, ar.created_at,
                       ar.unit_of_measure, coalesce(i.title, '—') as incident_title,
                       r.name as resource_name, r.category as resource_category, r.unit_cost,
                       coalesce(ar.quantity_allocated,0) * coalesce(r.unit_cost,0) as line_value
                from public.allocated_resources ar
                left join public.incidents i on i.id = ar.incident_id
                left join public.resources r on r.id = ar.resource_id
                where ar.created_at >= ? and ar.created_at < ?
                order by ar.created_at desc limit 500
                """, range));

        out.put("by_status", jdbc.queryForList("""
                select coalesce(status,'(none)') as status, count(*) as count
                from public.allocated_resources
                where created_at >= ? and created_at < ?
                group by status order by count desc
                """, range));

        out.put("by_category", jdbc.queryForList("""
                select coalesce(r.category,'Uncategorised') as category, count(*) as count,
                       coalesce(sum(coalesce(ar.quantity_allocated,0)),0) as quantity
                from public.allocated_resources ar
                left join public.resources r on r.id = ar.resource_id
                where ar.created_at >= ? and ar.created_at < ?
                group by r.category order by count desc
                """, range));
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
