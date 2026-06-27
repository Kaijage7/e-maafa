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
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Recovery Programs (Recovery) — port of the Laravel recovery_programs module: the long-term
 * recovery/reconstruction initiatives (infrastructure rebuilding, livelihood support, …) with a
 * Planning → Ongoing → Completed lifecycle, budget, lead agency and objectives.
 */
@RestController
@RequestMapping("/v1/recovery/recovery-programs")
public class RecoveryProgramController {

    private static final List<String> STATUSES = List.of("Planning", "Ongoing", "Completed", "Suspended", "Cancelled");

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;

    public RecoveryProgramController(JdbcTemplate jdbc, JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('recovery.view')")
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String search) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            where.append(" and p.status = ?");
            params.add(status);
        }
        if (search != null && !search.isBlank()) {
            where.append(" and (p.program_name ilike ? or p.program_type ilike ?)");
            params.add("%" + search + "%");
            params.add("%" + search + "%");
        }
        // Area scope: an officer sees programs tied to an incident in their own area, plus programs not
        // bound to an area (no incident → i.region_id/district_id null = national/cross-cutting). National
        // and non-area roles keep the full view (predicate adds nothing).
        jurisdiction.appendAreaScopeSharedOrOwn("i", where, params);
        StringBuilder sql = new StringBuilder("""
                select p.id, p.program_name, p.description, p.program_type, p.status, p.start_date,
                       p.expected_completion_date, p.actual_completion_date, p.total_budget_allocated,
                       p.currency, p.geographic_scope, p.key_objectives_outcomes,
                       a.name as lead_agency_name, coalesce(i.title,'—') as incident_title
                from public.recovery_programs p
                left join public.agencies a on a.id = p.lead_agency_id
                left join public.incidents i on i.id = p.incident_id
                where """);
        sql.append(' ').append(where);
        sql.append("""
                 order by case p.status when 'Ongoing' then 0 when 'Planning' then 1 when 'Completed' then 2 else 3 end,
                          p.created_at desc limit 200
                """);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("programs", jdbc.queryForList(sql.toString(), params.toArray()));
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status='Ongoing') as ongoing,
                       count(*) filter (where status='Planning') as planning,
                       count(*) filter (where status='Completed') as completed,
                       coalesce(sum(total_budget_allocated),0) as total_budget
                from public.recovery_programs
                """));
        out.put("by_type", jdbc.queryForList(
                "select program_type, count(*) as count from public.recovery_programs group by program_type order by count desc"));
        out.put("agencies", jdbc.queryForList("select id, name from public.agencies order by name limit 200"));
        out.put("incidents", jdbc.queryForList(
                "select id, title from public.incidents where coalesce(is_simulation,false)=false order by id desc limit 100"));
        return out;
    }

    @PreAuthorize("hasAuthority('recovery.manage')")
    @PostMapping
    @Transactional
    public Map<String, Object> store(@RequestBody Map<String, Object> b) {
        String name = require(b.get("program_name"), "program_name");
        Boolean exists = jdbc.queryForObject("select exists(select 1 from public.recovery_programs where program_name = ?)", Boolean.class, name);
        if (Boolean.TRUE.equals(exists)) {
            throw new BusinessRuleException("A recovery program with that name already exists.");
        }
        Long id = jdbc.queryForObject("""
                insert into public.recovery_programs(program_name, description, incident_id, program_type,
                    status, start_date, expected_completion_date, total_budget_allocated, currency,
                    lead_agency_id, geographic_scope, key_objectives_outcomes, created_at, updated_at)
                values (?,?,?,?,?,?::date,?::date,?,?,?,?,?, now(), now()) returning id
                """, Long.class, name, str(b.get("description")), num(b.get("incident_id")),
                require(b.get("program_type"), "program_type"), statusOr(b.get("status"), "Planning"),
                str(b.get("start_date")), str(b.get("expected_completion_date")), dbl(b.get("total_budget_allocated")),
                strOr(b.get("currency"), "TZS"), num(b.get("lead_agency_id")), str(b.get("geographic_scope")),
                str(b.get("key_objectives_outcomes")));
        return Map.of("success", true, "id", id, "message", "Recovery program created.");
    }

    @PreAuthorize("hasAuthority('recovery.manage')")
    @PostMapping("/{id}/status")
    @Transactional
    public Map<String, Object> setStatus(@PathVariable long id, @RequestBody Map<String, Object> b) {
        String status = statusOr(b.get("status"), null);
        if (status == null) {
            throw new BusinessRuleException("A valid status is required.");
        }
        String completedClause = "Completed".equals(status) ? ", actual_completion_date = current_date" : "";
        if (jdbc.update("update public.recovery_programs set status = ?" + completedClause + ", updated_at=now() where id=?", status, id) == 0) {
            throw new ResourceNotFoundException("Program not found.");
        }
        return Map.of("success", true, "message", "Program marked " + status + ".");
    }

    private static String str(Object v) {
        if (v == null) { return null; }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
    private static String strOr(Object v, String d) { String s = str(v); return s == null ? d : s; }
    private static Long num(Object v) { String s = str(v); return s == null ? null : Long.parseLong(s); }
    private static Double dbl(Object v) { String s = str(v); return s == null ? null : Double.parseDouble(s); }
    private static String statusOr(Object v, String d) {
        String s = str(v);
        return s != null && STATUSES.contains(s) ? s : d;
    }
    private static String require(Object v, String f) {
        String s = str(v);
        if (s == null) { throw new BusinessRuleException("The " + f + " field is required."); }
        return s;
    }
}
