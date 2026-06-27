package tz.go.pmo.dmis.response;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Contingency Plans — the strategic, sector-wide preparedness plans that sit alongside the
 * Anticipatory Action Plans (the risk-assessment plan_type was {anticipatory, contingency}).
 * Where an anticipatory plan is forecast-triggered and area-specific, a contingency plan is a
 * standing multi-region, multi-sector plan for a hazard over a timeframe. Port of the Laravel
 * ContingencyPlan model with the same draft→pending→active→archived lifecycle.
 */
@RestController
@RequestMapping("/v1/response/contingency-plans")
public class ContingencyPlanController {

    private static final List<String> STATUSES = List.of("draft", "pending", "active", "archived");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService users;

    public ContingencyPlanController(JdbcTemplate jdbc, IncidentWorkflowService users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String hazard) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            where.append(" and status = ?");
            params.add(status);
        }
        if (hazard != null && !hazard.isBlank()) {
            where.append(" and hazard_type ilike ?");
            params.add("%" + hazard + "%");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> plans = jdbc.queryForList("""
                select id, publication_date, hazard_type, timeframe, coverage_regions, sectors, budget,
                       description, status, created_at
                from public.contingency_plans where %s
                order by case status when 'active' then 0 when 'pending' then 1 when 'draft' then 2 else 3 end,
                         created_at desc limit 200
                """.formatted(where), params.toArray());
        plans.forEach(p -> { parseJsonField(p, "coverage_regions"); parseJsonField(p, "sectors"); });
        out.put("plans", plans);
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status='active') as active,
                       count(*) filter (where status='pending') as pending,
                       count(*) filter (where status='draft') as draft,
                       coalesce(sum(budget) filter (where status='active'),0) as budget_active
                from public.contingency_plans
                """));
        out.put("by_hazard", jdbc.queryForList(
                "select hazard_type, count(*) as count from public.contingency_plans group by hazard_type order by count desc"));
        return out;
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        Map<String, Object> plan = findOr404(id);
        parseJsonField(plan, "coverage_regions");
        parseJsonField(plan, "sectors");
        return Map.of("plan", plan);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('contingency_plans.manage')")
    @Transactional
    public Map<String, Object> store(@RequestBody Map<String, Object> body) throws Exception {
        Long id = jdbc.queryForObject("""
                insert into public.contingency_plans(publication_date, hazard_type, timeframe, coverage_regions,
                    sectors, budget, description, status, created_by, created_at, updated_at)
                values (current_date,?,?,?::json,?::json,?,?, 'draft', ?, now(), now()) returning id
                """, Long.class, require(body.get("hazard_type"), "hazard_type"), str(body.get("timeframe")),
                jsonOrNull(body.get("coverage_regions")), jsonOrNull(body.get("sectors")),
                numOrNull(body.get("budget")), str(body.get("description")), users.actingUserId());
        return Map.of("success", true, "id", id, "message", "Contingency plan created.");
    }

    @PostMapping("/{id}")
    @PreAuthorize("hasAuthority('contingency_plans.manage')")
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> body) throws Exception {
        findOr404(id);
        jdbc.update("""
                update public.contingency_plans set hazard_type = ?, timeframe = ?, coverage_regions = ?::json,
                    sectors = ?::json, budget = ?, description = ?, updated_at = now() where id = ?
                """, require(body.get("hazard_type"), "hazard_type"), str(body.get("timeframe")),
                jsonOrNull(body.get("coverage_regions")), jsonOrNull(body.get("sectors")),
                numOrNull(body.get("budget")), str(body.get("description")), id);
        return Map.of("success", true, "message", "Contingency plan updated.");
    }

    @PostMapping("/{id}/submit")
    @PreAuthorize("hasAuthority('contingency_plans.manage')")
    @Transactional
    public Map<String, Object> submit(@PathVariable long id) {
        if (!"draft".equals(findOr404(id).get("status"))) {
            throw new BusinessRuleException("Only draft plans can be submitted.");
        }
        jdbc.update("update public.contingency_plans set status='pending', updated_at=now() where id=?", id);
        return Map.of("success", true, "message", "Plan submitted for approval.");
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('contingency_plans.approve')")
    @Transactional
    public Map<String, Object> approve(@PathVariable long id) {
        if (!"pending".equals(findOr404(id).get("status"))) {
            throw new BusinessRuleException("Only pending plans can be approved.");
        }
        jdbc.update("update public.contingency_plans set status='active', approved_by=?, approval_date=now(), updated_at=now() where id=?",
                users.actingUserId(), id);
        return Map.of("success", true, "message", "Contingency plan approved and active.");
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAuthority('contingency_plans.approve')")
    @Transactional
    public Map<String, Object> reject(@PathVariable long id) {
        if (!"pending".equals(findOr404(id).get("status"))) {
            throw new BusinessRuleException("Only pending plans can be rejected.");
        }
        jdbc.update("update public.contingency_plans set status='draft', updated_at=now() where id=?", id);
        return Map.of("success", true, "message", "Plan returned to draft.");
    }

    @PostMapping("/{id}/archive")
    @PreAuthorize("hasAuthority('contingency_plans.approve')")
    @Transactional
    public Map<String, Object> archive(@PathVariable long id) {
        findOr404(id);
        jdbc.update("update public.contingency_plans set status='archived', updated_at=now() where id=?", id);
        return Map.of("success", true, "message", "Plan archived.");
    }

    // ── helpers ──

    private Map<String, Object> findOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.contingency_plans where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Contingency plan not found.");
        }
        return rows.get(0);
    }

    private static void parseJsonField(Map<String, Object> row, String key) {
        Object v = row.get(key);
        if (v == null) {
            return;
        }
        try {
            String json = v.getClass().getSimpleName().equals("PGobject")
                    ? String.valueOf(v.getClass().getMethod("getValue").invoke(v))
                    : String.valueOf(v);
            row.put(key, json == null ? List.of() : JSON.readValue(json, List.class));
        } catch (Exception e) {
            row.put(key, List.of());
        }
    }

    private static String jsonOrNull(Object v) throws Exception {
        return v == null ? null : JSON.writeValueAsString(v);
    }

    private static String require(Object v, String field) {
        String s = str(v);
        if (s == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return s;
    }

    private static Double numOrNull(Object v) {
        return v == null || String.valueOf(v).isBlank() ? null : Double.parseDouble(String.valueOf(v));
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
