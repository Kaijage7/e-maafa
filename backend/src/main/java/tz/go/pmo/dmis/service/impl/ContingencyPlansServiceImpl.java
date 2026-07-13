package tz.go.pmo.dmis.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.service.ContingencyPlansService;

/**
 * Contingency plan registry and lifecycle. Logic moved from the former response package
 * controller; Angular paths/JSON unchanged. Acting user via {@link CurrentUserResolver}
 * (no Response workflow coupling — plans are strategic, not incident-ladder).
 */
@Service
@RequiredArgsConstructor
public class ContingencyPlansServiceImpl implements ContingencyPlansService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final JdbcTemplate jdbc;
    private final CurrentUserResolver users;

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> index(String status, String hazard) {
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
        plans.forEach(p -> {
            parseJsonField(p, "coverage_regions");
            parseJsonField(p, "sectors");
        });
        out.put("plans", plans);
        // Stats + by_hazard honour the same status/hazard filters as the list so query params are productive.
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status='active') as active,
                       count(*) filter (where status='pending') as pending,
                       count(*) filter (where status='draft') as draft,
                       coalesce(sum(budget) filter (where status='active'),0) as budget_active
                from public.contingency_plans where %s
                """.formatted(where), params.toArray()));
        out.put("by_hazard", jdbc.queryForList(
                "select hazard_type, count(*) as count from public.contingency_plans where " + where
                        + " group by hazard_type order by count desc", params.toArray()));
        return out;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> show(long id) {
        Map<String, Object> plan = findOr404(id);
        parseJsonField(plan, "coverage_regions");
        parseJsonField(plan, "sectors");
        return Map.of("plan", plan);
    }

    @Override
    @Transactional
    public Map<String, Object> store(Map<String, Object> body) throws Exception {
        Long id = jdbc.queryForObject("""
                insert into public.contingency_plans(publication_date, hazard_type, timeframe, coverage_regions,
                    sectors, budget, description, status, created_by, created_at, updated_at)
                values (current_date,?,?,?::json,?::json,?,?, 'draft', ?, now(), now()) returning id
                """, Long.class, require(body.get("hazard_type"), "hazard_type"), str(body.get("timeframe")),
                jsonOrNull(body.get("coverage_regions")), jsonOrNull(body.get("sectors")),
                numOrNull(body.get("budget")), str(body.get("description")), users.actingUserId());
        return Map.of("success", true, "id", id, "message", "Contingency plan created.");
    }

    @Override
    @Transactional
    public Map<String, Object> update(long id, Map<String, Object> body) throws Exception {
        findOr404(id);
        jdbc.update("""
                update public.contingency_plans set hazard_type = ?, timeframe = ?, coverage_regions = ?::json,
                    sectors = ?::json, budget = ?, description = ?, updated_at = now() where id = ?
                """, require(body.get("hazard_type"), "hazard_type"), str(body.get("timeframe")),
                jsonOrNull(body.get("coverage_regions")), jsonOrNull(body.get("sectors")),
                numOrNull(body.get("budget")), str(body.get("description")), id);
        return Map.of("success", true, "message", "Contingency plan updated.");
    }

    @Override
    @Transactional
    public Map<String, Object> submit(long id) {
        if (!"draft".equals(findOr404(id).get("status"))) {
            throw new BusinessRuleException("Only draft plans can be submitted.");
        }
        jdbc.update("update public.contingency_plans set status='pending', updated_at=now() where id=?", id);
        return Map.of("success", true, "message", "Plan submitted for approval.");
    }

    @Override
    @Transactional
    public Map<String, Object> approve(long id) {
        if (!"pending".equals(findOr404(id).get("status"))) {
            throw new BusinessRuleException("Only pending plans can be approved.");
        }
        jdbc.update("update public.contingency_plans set status='active', approved_by=?, approval_date=now(), updated_at=now() where id=?",
                users.actingUserId(), id);
        return Map.of("success", true, "message", "Contingency plan approved and active.");
    }

    @Override
    @Transactional
    public Map<String, Object> reject(long id) {
        if (!"pending".equals(findOr404(id).get("status"))) {
            throw new BusinessRuleException("Only pending plans can be rejected.");
        }
        jdbc.update("update public.contingency_plans set status='draft', updated_at=now() where id=?", id);
        return Map.of("success", true, "message", "Plan returned to draft.");
    }

    @Override
    @Transactional
    public Map<String, Object> archive(long id) {
        findOr404(id);
        jdbc.update("update public.contingency_plans set status='archived', updated_at=now() where id=?", id);
        return Map.of("success", true, "message", "Plan archived.");
    }

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
