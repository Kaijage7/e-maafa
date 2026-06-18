package tz.go.pmo.dmis.recovery;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.security.access.prepost.PreAuthorize;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Reconstruction / Strategic Projects (Recovery) — port of the Laravel strategic_projects module:
 * the risk-managed infrastructure projects (category, sector, location, status, associated hazards
 * and management plan). The "build back better" reconstruction tracking of the Recovery phase.
 */
@RestController
@RequestMapping("/v1/recovery/strategic-projects")
public class StrategicProjectController {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> STATUSES = List.of("Mobilization", "Construction", "Operational",
            "Stopped", "Decommissioning", "Closure", "Other");

    private final JdbcTemplate jdbc;

    public StrategicProjectController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String sector,
                                     @RequestParam(required = false) String search) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> p = new ArrayList<>();
        if (status != null && !status.isBlank()) { where.append(" and project_status = ?"); p.add(status); }
        if (sector != null && !sector.isBlank()) { where.append(" and project_sector = ?"); p.add(sector); }
        if (search != null && !search.isBlank()) { where.append(" and (project_name ilike ? or entry_id ilike ?)"); p.add("%" + search + "%"); p.add("%" + search + "%"); }
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, entry_id, project_name, project_category, project_sector, location,
                       project_coverage, project_status, risk_hazard_type, risk_hazard_names,
                       impacts_identified, has_management_plan, budget, elements_at_risk, created_at
                from public.strategic_projects where %s order by created_at desc limit 200
                """.formatted(where), p.toArray());
        rows.forEach(r -> { parseJson(r, "location"); parseJson(r, "risk_hazard_names"); parseJson(r, "impacts_identified"); });
        out.put("projects", rows);
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where project_status='Construction') as construction,
                       count(*) filter (where project_status='Operational') as operational,
                       count(*) filter (where has_management_plan) as with_plan,
                       coalesce(sum(budget),0) as total_budget
                from public.strategic_projects
                """));
        out.put("by_sector", jdbc.queryForList(
                "select project_sector as sector, count(*) as count from public.strategic_projects group by project_sector order by count desc"));
        return out;
    }

    @PreAuthorize(Authz.RECOVERY_MANAGE)
    @PostMapping
    @Transactional
    public Map<String, Object> store(@RequestBody Map<String, Object> b) throws Exception {
        long seq = jdbc.queryForObject("select coalesce(max(id),0)+1 from public.strategic_projects", Long.class);
        String entryId = "SP-" + String.format("%04d", seq);
        Long id = jdbc.queryForObject("""
                insert into public.strategic_projects(entry_id, project_name, project_category, project_sector,
                    location, project_coverage, project_status, risk_hazard_type, risk_hazard_names,
                    impacts_identified, has_management_plan, budget, elements_at_risk, challenges,
                    action_taken, created_at, updated_at)
                values (?,?,?,?,?::json,?,?,?,?::json,?::json,?,?,?,?,?, now(), now()) returning id
                """, Long.class, entryId, require(b.get("project_name"), "project_name"),
                enumOr(b.get("project_category"), "Government"), enumOr(b.get("project_sector"), "Other"),
                jsonOrNull(b.get("location")), str(b.get("project_coverage")),
                statusOr(b.get("project_status")), str(b.get("risk_hazard_type")),
                jsonOrNull(b.get("risk_hazard_names")), jsonOrNull(b.get("impacts_identified")),
                bool(b.get("has_management_plan")), dbl(b.get("budget")), str(b.get("elements_at_risk")),
                str(b.get("challenges")), str(b.get("action_taken")));
        return Map.of("success", true, "id", id, "entry_id", entryId, "message", "Project " + entryId + " registered.");
    }

    @PreAuthorize(Authz.RECOVERY_MANAGE)
    @PostMapping("/{id}/status")
    @Transactional
    public Map<String, Object> setStatus(@PathVariable long id, @RequestBody Map<String, Object> b) {
        String s = str(b.get("status"));
        if (s == null || !STATUSES.contains(s)) {
            throw new BusinessRuleException("A valid project status is required.");
        }
        jdbc.update("update public.strategic_projects set project_status=?, updated_at=now() where id=?", s, id);
        return Map.of("success", true, "message", "Project status set to " + s + ".");
    }

    private static void parseJson(Map<String, Object> row, String key) {
        Object v = row.get(key);
        if (v == null) { return; }
        try {
            String json = v.getClass().getSimpleName().equals("PGobject")
                    ? String.valueOf(v.getClass().getMethod("getValue").invoke(v)) : String.valueOf(v);
            row.put(key, json == null ? List.of() : JSON.readValue(json, List.class));
        } catch (Exception e) { row.put(key, List.of()); }
    }
    private static String jsonOrNull(Object v) throws Exception { return v == null ? null : JSON.writeValueAsString(v); }
    private static String str(Object v) {
        if (v == null) { return null; }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
    private static Double dbl(Object v) { String s = str(v); return s == null ? null : Double.parseDouble(s); }
    private static boolean bool(Object v) { return v != null && (v.equals(true) || "true".equalsIgnoreCase(String.valueOf(v))); }
    private static String enumOr(Object v, String d) { String s = str(v); return s == null ? d : s; }
    private static String statusOr(Object v) { String s = str(v); return s != null && STATUSES.contains(s) ? s : "Mobilization"; }
    private static String require(Object v, String f) {
        String s = str(v);
        if (s == null) { throw new BusinessRuleException("The " + f + " field is required."); }
        return s;
    }
}
