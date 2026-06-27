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
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Port of Admin\AnticipatoryActionPlanController — the per-area preparedness plans that
 * the Disaster Management Act 2022 and NDPRP 2022 require be activated for forecast-impact
 * areas BEFORE a disaster ("preparedness plans activated as per specific areas forecasted
 * to have impact"). Full CRUD + the source's approve/reject (gated on status='pending').
 *
 * The {@code matching} endpoint is the Command Post link: given a hazard and a set of
 * forecast-impact areas, return the active plans whose hazard and council/coverage match —
 * this is what the anticipatory-activation readiness panel renders.
 */
@RestController
@RequestMapping("/v1/response/anticipatory-plans")
public class AnticipatoryPlanController {

    private static final List<String> STATUSES = List.of("draft", "pending", "active", "archived");
    private static final ObjectMapper JSON = new ObjectMapper();

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService users;
    private final JurisdictionScope jurisdiction;

    public AnticipatoryPlanController(JdbcTemplate jdbc, IncidentWorkflowService users,
                                      JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.users = users;
        this.jurisdiction = jurisdiction;
    }

    /**
     * Resolve the plan's area from the councils registry (district_council -> region_id/district_id) and
     * enforce the caller's jurisdiction: a region/district officer may only create or edit a plan in their
     * own area; an unresolved council binds to the area officer's own area; national binds whatever the
     * council resolves to (possibly NULL = shared). Returns {regionId, districtId}, either may be null.
     */
    private Long[] resolveAndAssertArea(String council) {
        Long regionId = null;
        Long districtId = null;
        List<Map<String, Object>> cl = jdbc.queryForList(
                "select region_id, district_id from public.councils where lower(name) = lower(?) limit 1", council);
        if (!cl.isEmpty()) {
            regionId = num(cl.get(0).get("region_id"));
            districtId = num(cl.get(0).get("district_id"));
        }
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        Map<String, Object> area = jurisdiction.currentArea();
        if (tier == JurisdictionScope.Tier.DISTRICT) {
            Long myDistrict = num(area.get("district_id"));
            if (regionId == null && districtId == null) {        // unresolved council -> bind to own district
                districtId = myDistrict;
                regionId = num(area.get("region_id"));
            } else if (myDistrict == null || !myDistrict.equals(districtId)) {
                throw new BusinessRuleException("You can only manage anticipatory plans for your own district.");
            }
        } else if (tier == JurisdictionScope.Tier.REGION) {
            Long myRegion = num(area.get("region_id"));
            if (regionId == null) {                              // unresolved council -> bind to own region
                regionId = myRegion;
            } else if (myRegion == null || !myRegion.equals(regionId)) {
                throw new BusinessRuleException("You can only manage anticipatory plans for your own region.");
            }
        }
        return new Long[]{regionId, districtId};
    }

    private static Long num(Object v) {
        return v instanceof Number n ? n.longValue() : null;
    }

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String hazard,
                                     @RequestParam(required = false) String search) {
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
        if (search != null && !search.isBlank()) {
            where.append(" and (district_council ilike ? or coverage_location ilike ? or hazard_type ilike ?)");
            params.add("%" + search + "%");
            params.add("%" + search + "%");
            params.add("%" + search + "%");
        }
        // Area officers see only their own area's plans (or unassigned/national-shared); national sees all.
        jurisdiction.appendAreaScopeSharedOrOwn("", where, params);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("plans", jdbc.queryForList("""
                select id, hazard_type, district_council, coverage_location, affected_people, budget,
                       status, activation_window, focal_point_agency, created_at
                from public.anticipatory_action_plans
                where %s order by case status when 'active' then 0 when 'pending' then 1 when 'draft' then 2 else 3 end,
                        affected_people desc nulls last limit 200
                """.formatted(where), params.toArray()));
        StringBuilder statsW = new StringBuilder("1=1");
        List<Object> statsP = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("", statsW, statsP);
        out.put("stats", jdbc.queryForMap(
                "select count(*) as total, count(*) filter (where status = 'active') as active, "
                + "count(*) filter (where status = 'pending') as pending, "
                + "count(*) filter (where status = 'draft') as draft, "
                + "coalesce(sum(affected_people) filter (where status = 'active'), 0) as people_covered, "
                + "coalesce(sum(budget) filter (where status = 'active'), 0) as budget_active "
                + "from public.anticipatory_action_plans where " + statsW, statsP.toArray()));
        StringBuilder bhW = new StringBuilder("1=1");
        List<Object> bhP = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("", bhW, bhP);
        out.put("by_hazard", jdbc.queryForList(
                "select hazard_type, count(*) as count from public.anticipatory_action_plans where " + bhW
                + " group by hazard_type order by count desc", bhP.toArray()));
        return out;
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        return Map.of("plan", findOr404(id));
    }

    @PreAuthorize("hasAuthority('anticipatory_action_plans.create')")
    @PostMapping
    @Transactional
    public Map<String, Object> store(@RequestBody Map<String, Object> body) throws Exception {
        String hazard = require(body.get("hazard_type"), "hazard_type");
        String council = require(body.get("district_council"), "district_council");
        Long[] area = resolveAndAssertArea(council);   // bind region/district + enforce caller jurisdiction
        Long id = jdbc.queryForObject("""
                insert into public.anticipatory_action_plans(hazard_type, hazard_id, district_council,
                    region_id, district_id, coverage_location, affected_people, budget, description, status, trigger,
                    activation_window, action_activities_type, responsible_actor, communication_channel,
                    funding_source, closure_criteria, focal_point_name, focal_point_contact, focal_point_agency,
                    created_by, created_at, updated_at)
                values (?,?,?,?,?,?,?,?,?, 'draft', ?,?,?::json,?::json,?::json,?,?,?,?,?,?,now(),now())
                returning id
                """, Long.class, hazard, hazard, council, area[0], area[1],
                str(body.get("coverage_location")), intOrNull(body.get("affected_people")), numOrNull(body.get("budget")),
                str(body.get("description")), str(body.get("trigger")), intOrNull(body.get("activation_window")),
                jsonOrNull(body.get("action_activities_type")), jsonOrNull(body.get("responsible_actor")),
                jsonOrNull(body.get("communication_channel")), str(body.get("funding_source")),
                str(body.get("closure_criteria")), str(body.get("focal_point_name")),
                str(body.get("focal_point_contact")), str(body.get("focal_point_agency")), users.actingUserId());
        return Map.of("success", true, "id", id, "message", "Anticipatory action plan created.");
    }

    @PreAuthorize("hasAuthority('anticipatory_action_plans.create')")
    @PostMapping("/{id}")
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> body) throws Exception {
        findOr404(id);
        String hazard = require(body.get("hazard_type"), "hazard_type");
        String council = require(body.get("district_council"), "district_council");
        Long[] area = resolveAndAssertArea(council);   // re-bind region/district + enforce caller jurisdiction
        jdbc.update("""
                update public.anticipatory_action_plans set hazard_type = ?, district_council = ?,
                    region_id = ?, district_id = ?,
                    coverage_location = ?, affected_people = ?, budget = ?, description = ?, trigger = ?,
                    activation_window = ?, action_activities_type = ?::json, responsible_actor = ?::json,
                    communication_channel = ?::json, funding_source = ?, closure_criteria = ?,
                    focal_point_name = ?, focal_point_contact = ?, focal_point_agency = ?, updated_at = now()
                where id = ?
                """, hazard, council, area[0], area[1],
                str(body.get("coverage_location")), intOrNull(body.get("affected_people")), numOrNull(body.get("budget")),
                str(body.get("description")), str(body.get("trigger")), intOrNull(body.get("activation_window")),
                jsonOrNull(body.get("action_activities_type")), jsonOrNull(body.get("responsible_actor")),
                jsonOrNull(body.get("communication_channel")), str(body.get("funding_source")),
                str(body.get("closure_criteria")), str(body.get("focal_point_name")),
                str(body.get("focal_point_contact")), str(body.get("focal_point_agency")), id);
        return Map.of("success", true, "message", "Anticipatory action plan updated.");
    }

    /** Submit a draft plan for approval. */
    @PreAuthorize("hasAuthority('anticipatory_action_plans.create')")
    @PostMapping("/{id}/submit")
    @Transactional
    public Map<String, Object> submit(@PathVariable long id) {
        Map<String, Object> plan = findOr404(id);
        if (!"draft".equals(plan.get("status"))) {
            throw new BusinessRuleException("Only draft plans can be submitted for approval.");
        }
        jdbc.update("update public.anticipatory_action_plans set status = 'pending', updated_at = now() where id = ?", id);
        return Map.of("success", true, "message", "Plan submitted for approval.");
    }

    /** Approve a pending plan — it becomes active and available to anticipatory activations. */
    @PreAuthorize("hasAuthority('anticipatory_action_plans.approve')")
    @PostMapping("/{id}/approve")
    @Transactional
    public Map<String, Object> approve(@PathVariable long id) {
        Map<String, Object> plan = findOr404(id);
        if (!"pending".equals(plan.get("status"))) {
            throw new BusinessRuleException("Only pending plans can be approved.");
        }
        jdbc.update("""
                update public.anticipatory_action_plans set status = 'active', approved_by = ?,
                    approval_date = now(), updated_at = now() where id = ?
                """, users.actingUserId(), id);
        return Map.of("success", true, "message", "Plan approved and now active.");
    }

    @PreAuthorize("hasAuthority('anticipatory_action_plans.approve')")
    @PostMapping("/{id}/reject")
    @Transactional
    public Map<String, Object> reject(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> plan = findOr404(id);
        if (!"pending".equals(plan.get("status"))) {
            throw new BusinessRuleException("Only pending plans can be rejected.");
        }
        jdbc.update("update public.anticipatory_action_plans set status = 'draft', updated_at = now() where id = ?", id);
        return Map.of("success", true, "message", "Plan returned to draft"
                + (body != null && body.get("reason") != null ? ": " + body.get("reason") : "."));
    }

    @PreAuthorize("hasAuthority('anticipatory_action_plans.approve')")
    @PostMapping("/{id}/archive")
    @Transactional
    public Map<String, Object> archive(@PathVariable long id) {
        findOr404(id);
        jdbc.update("update public.anticipatory_action_plans set status = 'archived', updated_at = now() where id = ?", id);
        return Map.of("success", true, "message", "Plan archived.");
    }

    /**
     * Reusable matcher: active plans matching a hazard and any of the forecast-impact areas (matched on
     * hazard keyword — cyclone forecast → 'Cyclone'/'Floods' plans — and council/coverage text containing
     * any area name). Called directly by the Command Post readiness endpoint (no standalone HTTP route).
     */
    List<Map<String, Object>> matchingPlans(String hazard, List<String> areas) {
        // Pull the hazard keyword(s): a cyclone forecast also activates flood plans.
        List<String> hazardKeys = new ArrayList<>();
        String h = hazard == null ? "" : hazard.toLowerCase();
        if (h.contains("cyclone") || h.contains("storm")) {
            hazardKeys.add("Cyclone");
            hazardKeys.add("Floods");
        } else if (h.contains("flood") || h.contains("rain")) {
            hazardKeys.add("Floods");
        } else if (h.contains("drought")) {
            hazardKeys.add("Drought");
        } else if (h.contains("earthquake")) {
            hazardKeys.add("Earthquake");
        } else if (h.contains("tsunami")) {
            hazardKeys.add("Tsunami");
        } else if (h.contains("disease") || h.contains("outbreak") || h.contains("epidemic") || h.contains("cholera")) {
            hazardKeys.add("Disease Outbreak");
        } else if (h.contains("landslide")) {
            hazardKeys.add("Landslide");
        } else if (h.contains("fire")) {
            hazardKeys.add("Wildfire");
        }
        if (hazardKeys.isEmpty() && hazard != null && !hazard.isBlank()) {
            hazardKeys.add(hazard);
        }
        if (hazardKeys.isEmpty()) {
            return List.of();
        }
        // hazard IN (...) AND (area matches any council/coverage)  — both filters via SQL.
        StringBuilder sql = new StringBuilder("""
                select id, hazard_type, district_council, coverage_location, affected_people, budget,
                       activation_window, action_activities_type, responsible_actor, communication_channel,
                       closure_criteria, focal_point_agency
                from public.anticipatory_action_plans
                where status = 'active' and lower(hazard_type) = any (?)
                """);
        List<Object> params = new ArrayList<>();
        params.add(hazardKeys.stream().map(String::toLowerCase).toArray(String[]::new));
        if (areas != null && !areas.isEmpty()) {
            sql.append(" and (");
            for (int i = 0; i < areas.size(); i++) {
                sql.append(i == 0 ? "" : " or ");
                sql.append("district_council ilike ? or coalesce(coverage_location,'') ilike ?");
                params.add("%" + areas.get(i) + "%");
                params.add("%" + areas.get(i) + "%");
            }
            sql.append(")");
        }
        sql.append(" order by affected_people desc nulls last");
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), params.toArray());
        // PG json columns come back as PGobjects; parse them to real arrays so the API is clean.
        for (Map<String, Object> row : rows) {
            parseJsonField(row, "action_activities_type");
            parseJsonField(row, "responsible_actor");
            parseJsonField(row, "communication_channel");
        }
        return rows;
    }

    /** Replace a PG json column value (PGobject / string) with a parsed List in place. */
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

    // ── helpers ──

    private Map<String, Object> findOr404(long id) {
        StringBuilder where = new StringBuilder("id = ?");
        List<Object> params = new ArrayList<>();
        params.add(id);
        // A by-id read/mutation only resolves for a plan in the caller's own area (or unassigned/national).
        jurisdiction.appendAreaScopeSharedOrOwn("", where, params);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from public.anticipatory_action_plans where " + where, params.toArray());
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Anticipatory action plan not found.");
        }
        return rows.get(0);
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

    private static Integer intOrNull(Object v) {
        return v == null ? null : (int) Double.parseDouble(String.valueOf(v));
    }

    private static Double numOrNull(Object v) {
        return v == null ? null : Double.parseDouble(String.valueOf(v));
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
