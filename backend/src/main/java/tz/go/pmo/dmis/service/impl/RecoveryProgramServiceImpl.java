package tz.go.pmo.dmis.service.impl;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.service.RecoveryProgramService;

/**
 * Recovery Programs (Recovery) — long-term recovery/reconstruction initiatives with a
 * Planning → Ongoing → Completed lifecycle.
 *
 * <p>F97: list rows, stats, breakdowns and form-data incidents share the same area predicate.
 * Mutations resolve the target program/incident and run {@link AreaGuard} before write.
 */
@Service
public class RecoveryProgramServiceImpl implements RecoveryProgramService {

    private static final List<String> STATUSES = List.of("Planning", "Ongoing", "Completed", "Suspended", "Cancelled");

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;

    public RecoveryProgramServiceImpl(JdbcTemplate jdbc, JurisdictionScope jurisdiction, AreaGuard areaGuard) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
    }

    @Override
    public Map<String, Object> index(String status,
                                     String search) {
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
        // Area scope via linked incident (null incident = national/cross-cutting, visible as shared).
        jurisdiction.appendAreaScopeWithCouncil("i", where, params);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("programs", jdbc.queryForList("""
                select p.id, p.program_name, p.description, p.program_type, p.status, p.start_date,
                       p.expected_completion_date, p.actual_completion_date, p.total_budget_allocated,
                       p.currency, p.geographic_scope, p.key_objectives_outcomes, p.incident_id,
                       a.name as lead_agency_name, coalesce(i.title,'—') as incident_title
                from public.recovery_programs p
                left join public.agencies a on a.id = p.lead_agency_id
                left join public.incidents i on i.id = p.incident_id
                where %s
                 order by case p.status when 'Ongoing' then 0 when 'Planning' then 1 when 'Completed' then 2 else 3 end,
                          p.created_at desc limit 200
                """.formatted(where), params.toArray()));

        // F97: stats + by_type use the same predicate/params as the visible list.
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where p.status='Ongoing') as ongoing,
                       count(*) filter (where p.status='Planning') as planning,
                       count(*) filter (where p.status='Completed') as completed,
                       coalesce(sum(p.total_budget_allocated),0) as total_budget
                from public.recovery_programs p
                left join public.incidents i on i.id = p.incident_id
                where %s
                """.formatted(where), params.toArray()));
        out.put("by_type", jdbc.queryForList("""
                select p.program_type, count(*) as count
                from public.recovery_programs p
                left join public.incidents i on i.id = p.incident_id
                where %s
                group by p.program_type order by count desc
                """.formatted(where), params.toArray()));

        out.put("agencies", jdbc.queryForList("select id, name from public.agencies order by name limit 200"));

        StringBuilder incidentWhere = new StringBuilder("coalesce(i.is_simulation,false)=false");
        List<Object> incidentParams = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("i", incidentWhere, incidentParams);
        out.put("incidents", jdbc.queryForList("""
                select i.id, i.title, i.region_name, i.district_name
                from public.incidents i
                where %s
                order by i.id desc limit 100
                """.formatted(incidentWhere), incidentParams.toArray()));
        return out;
    }

    @Transactional
    @Override
    public Map<String, Object> store(Map<String, Object> b) {
        String name = require(b.get("program_name"), "program_name");
        Boolean exists = jdbc.queryForObject(
                "select exists(select 1 from public.recovery_programs where program_name = ?)",
                Boolean.class, name);
        if (Boolean.TRUE.equals(exists)) {
            throw new BusinessRuleException("A recovery program with that name already exists.");
        }
        Long incidentId = num(b.get("incident_id"));
        if (incidentId != null) {
            areaGuard.assertOwnOrShared("public.incidents", incidentId);
        } else if (jurisdiction.currentTier() == JurisdictionScope.Tier.REGION
                || jurisdiction.currentTier() == JurisdictionScope.Tier.DISTRICT) {
            // Area officers must bind a recovery program to an in-area (or shared) incident.
            throw new BusinessRuleException(
                    "Link this program to an incident in your area, or ask a national officer to create a national programme.");
        }
        Long id = jdbc.queryForObject("""
                insert into public.recovery_programs(program_name, description, incident_id, program_type,
                    status, start_date, expected_completion_date, total_budget_allocated, currency,
                    lead_agency_id, geographic_scope, key_objectives_outcomes, created_at, updated_at)
                values (?,?,?,?,?,?::date,?::date,?,?,?,?,?, now(), now()) returning id
                """, Long.class, name, str(b.get("description")), incidentId,
                require(b.get("program_type"), "program_type"), statusOr(b.get("status"), "Planning"),
                str(b.get("start_date")), str(b.get("expected_completion_date")), dbl(b.get("total_budget_allocated")),
                strOr(b.get("currency"), "TZS"), num(b.get("lead_agency_id")), str(b.get("geographic_scope")),
                str(b.get("key_objectives_outcomes")));
        return Map.of("success", true, "id", id, "message", "Recovery program created.");
    }

    @Transactional
    @Override
    public Map<String, Object> setStatus(long id, Map<String, Object> b) {
        String status = statusOr(b.get("status"), null);
        if (status == null) {
            throw new BusinessRuleException("A valid status is required.");
        }
        Map<String, Object> program = findProgram(id);
        assertCanMutate(program);
        String completedClause = "Completed".equals(status) ? ", actual_completion_date = current_date" : "";
        if (jdbc.update("update public.recovery_programs set status = ?" + completedClause
                + ", updated_at=now() where id=?", status, id) == 0) {
            throw new ResourceNotFoundException("Program not found.");
        }
        return Map.of("success", true, "message", "Program marked " + status + ".");
    }

    private Map<String, Object> findProgram(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, incident_id, program_name, status from public.recovery_programs where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Program not found.");
        }
        return rows.get(0);
    }

    private void assertCanMutate(Map<String, Object> program) {
        Long incidentId = program.get("incident_id") instanceof Number n ? n.longValue() : num(program.get("incident_id"));
        if (incidentId != null) {
            areaGuard.assertOwnOrShared("public.incidents", incidentId);
            return;
        }
        // National / unlinked programme — area tiers may not mutate (404 hides existence of national row).
        if (jurisdiction.currentTier() == JurisdictionScope.Tier.REGION
                || jurisdiction.currentTier() == JurisdictionScope.Tier.DISTRICT) {
            throw new ResourceNotFoundException("Program not found.");
        }
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static String strOr(Object v, String d) {
        String s = str(v);
        return s == null ? d : s;
    }

    private static Long num(Object v) {
        String s = str(v);
        if (s == null) {
            return null;
        }
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            throw new BusinessRuleException("Expected a numeric identifier.");
        }
    }

    private static Double dbl(Object v) {
        String s = str(v);
        if (s == null) {
            return null;
        }
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            throw new BusinessRuleException("Expected a numeric amount.");
        }
    }

    private static String statusOr(Object v, String d) {
        String s = str(v);
        return s != null && STATUSES.contains(s) ? s : d;
    }

    private static String require(Object v, String f) {
        String s = str(v);
        if (s == null) {
            throw new BusinessRuleException("The " + f + " field is required.");
        }
        return s;
    }
}
