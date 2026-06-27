package tz.go.pmo.dmis.reports;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Incident Reports — the comprehensive, analytical reporting view of incidents for Reports &
 * Analytics (distinct from the operational "Active Incidents" registry in the Response module).
 * A date-ranged, filterable report: summary tiles + human-loss totals, breakdowns by status /
 * severity / type / region / month, and the incident records table. Real incidents only
 * (is_simulation = false) so drills never distort the reported national picture — the same
 * simulation-isolation contract honoured by the Executive Watch.
 */
@RestController
@RequestMapping("/v1/reports/incidents")
public class IncidentReportController {

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;

    public IncidentReportController(JdbcTemplate jdbc, JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
    }

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String start_date,
                                     @RequestParam(required = false) String end_date,
                                     @RequestParam(required = false) String status,
                                     @RequestParam(required = false) String severity,
                                     @RequestParam(required = false) String region) {
        // National analytics is a staff/leadership report — a donor/partner account must not read it.
        if (jurisdiction.currentStakeholderId() != null) {
            throw new ResourceNotFoundException("Not found.");
        }
        LocalDate end = parseOr(end_date, LocalDate.now());
        LocalDate start = parseOr(start_date, end.minusMonths(12));
        if (start.isAfter(end)) {
            throw new BusinessRuleException("The start date must not be after the end date.");
        }

        StringBuilder where = new StringBuilder(
                "coalesce(i.is_simulation,false) = false and coalesce(i.reported_at, i.created_at) >= ? "
                        + "and coalesce(i.reported_at, i.created_at) < ?");
        List<Object> p = new ArrayList<>();
        p.add(start);
        p.add(end.plusDays(1));
        if (notBlank(status)) { where.append(" and i.status = ?"); p.add(status); }
        if (notBlank(severity)) { where.append(" and i.severity_level = ?"); p.add(severity); }
        if (notBlank(region)) { where.append(" and i.region_name ilike ?"); p.add("%" + region + "%"); }
        // Area officers report only their own area (or shared/national); national sees the whole country.
        // One append covers every breakdown below — they all share this where + args on alias i (incidents).
        jurisdiction.appendAreaScopeSharedOrOwn("i", where, p);
        Object[] args = p.toArray();
        String w = where.toString();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("start_date", start.toString());
        out.put("end_date", end.toString());

        out.put("summary", jdbc.queryForMap(("""
                select count(*) as total_incidents,
                       count(*) filter (where i.severity_level in ('Critical','Catastrophic')) as critical,
                       count(*) filter (where i.status not in ('Closed','Resolved')) as open_incidents,
                       coalesce(sum(i.deaths_total),0)  as deaths,
                       coalesce(sum(i.injured_total),0) as injured,
                       coalesce(sum(i.displaced),0)     as displaced,
                       coalesce(sum(i.children_affected),0) as children_affected
                from public.incidents i where %s
                """).formatted(w), args));

        out.put("by_status", jdbc.queryForList(("""
                select coalesce(i.status,'(none)') as label, count(*) as count
                from public.incidents i where %s group by i.status order by count desc
                """).formatted(w), args));

        out.put("by_severity", jdbc.queryForList(("""
                select coalesce(i.severity_level,'(none)') as label, count(*) as count
                from public.incidents i where %s
                group by i.severity_level
                order by case coalesce(i.severity_level,'') when 'Catastrophic' then 0 when 'Critical' then 1
                              when 'Major' then 2 when 'Moderate' then 3 when 'Minor' then 4 else 5 end
                """).formatted(w), args));

        out.put("by_type", jdbc.queryForList(("""
                select coalesce(t.name,'Unclassified') as label, count(*) as count
                from public.incidents i
                left join public.incident_types t on t.id = i.incident_type_id
                where %s group by t.name order by count desc
                """).formatted(w), args));

        out.put("by_region", jdbc.queryForList(("""
                select coalesce(nullif(i.region_name,''),'Unspecified') as label, count(*) as count
                from public.incidents i where %s group by i.region_name order by count desc limit 30
                """).formatted(w), args));

        out.put("by_month", jdbc.queryForList(("""
                select to_char(date_trunc('month', coalesce(i.reported_at, i.created_at)),'YYYY-MM') as label,
                       count(*) as count
                from public.incidents i where %s
                group by date_trunc('month', coalesce(i.reported_at, i.created_at))
                order by label
                """).formatted(w), args));

        out.put("records", jdbc.queryForList(("""
                select i.id, i.title, i.status, i.severity_level, i.region_name, i.district_name,
                       coalesce(i.reported_at, i.created_at) as reported_at, t.name as type_name,
                       i.deaths_total, i.injured_total, i.displaced
                from public.incidents i
                left join public.incident_types t on t.id = i.incident_type_id
                where %s order by coalesce(i.reported_at, i.created_at) desc limit 500
                """).formatted(w), args));

        // filter option lists (over the unfiltered real set)
        out.put("filter_options", Map.of(
                "statuses", jdbc.queryForList(
                        "select distinct status from public.incidents where status is not null and coalesce(is_simulation,false)=false order by 1", String.class),
                "severities", List.of("Catastrophic", "Critical", "Major", "Moderate", "Minor"),
                "regions", jdbc.queryForList(
                        "select distinct region_name from public.incidents where nullif(region_name,'') is not null and coalesce(is_simulation,false)=false order by 1", String.class)));
        return out;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
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
