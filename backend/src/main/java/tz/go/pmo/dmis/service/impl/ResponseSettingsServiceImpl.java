package tz.go.pmo.dmis.service.impl;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.response.IncidentOptions;
import tz.go.pmo.dmis.service.ResponseSettingsService;

/**
 * Response System Settings hub. Logic moved from the former response package
 * controller; Angular paths/JSON unchanged. {@link IncidentOptions} remains
 * a transitional response-package vocabulary helper.
 */
@Service
public class ResponseSettingsServiceImpl implements ResponseSettingsService {

    private final JdbcTemplate jdbc;

    public ResponseSettingsServiceImpl(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ─── Approval chains (the live V24 engine config) ───

    @Override
    public Map<String, Object> approvalChains() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("modules", jdbc.queryForList("""
                select m.id, m.module_code, m.module_name as name, m.model_class as model, m.is_active,
                       (select count(*) from public.approval_workflow_configurations c
                          where c.module_id = m.id and c.is_active = true) as step_count
                from public.approval_workflow_modules m order by m.module_code
                """));
        out.put("roles", jdbc.queryForList("select name from public.roles order by name"));
        return out;
    }

    @Override
    public Map<String, Object> approvalChain(long moduleId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("module", jdbc.queryForMap("select * from public.approval_workflow_modules where id = ?", moduleId));
        out.put("steps", jdbc.queryForList("""
                select id, level, name, role_required, "order", can_skip, is_active, description
                from public.approval_workflow_configurations
                where module_id = ? order by "order", level
                """, moduleId));
        out.put("roles", jdbc.queryForList("select name from public.roles order by name"));
        return out;
    }

    /** Replace a module's whole chain — the simplest faithful editor (delete + reinsert in order). */
    @Transactional
    @Override
    public Map<String, Object> saveChain(long moduleId, Map<String, Object> body) {
        requireModule(moduleId);
        if (!(body.get("steps") instanceof List<?> steps) || steps.isEmpty()) {
            throw new BusinessRuleException("At least one approval step is required.");
        }
        List<String> validRoles = jdbc.queryForList("select name from public.roles", String.class);
        jdbc.update("delete from public.approval_workflow_configurations where module_id = ?", moduleId);
        int order = 1;
        for (Object raw : steps) {
            @SuppressWarnings("unchecked")
            Map<String, Object> step = (Map<String, Object>) raw;
            String name = require(step.get("name"), "step name");
            String role = require(step.get("role_required"), "role_required");
            if (!validRoles.contains(role)) {
                throw new BusinessRuleException("Unknown role: " + role);
            }
            jdbc.update("""
                    insert into public.approval_workflow_configurations(module_id, level, name, role_required,
                        "order", can_skip, is_active, description, created_at, updated_at)
                    values (?,?,?,?,?,?, true, ?, now(), now())
                    """, moduleId, order, name, role, order,
                    Boolean.TRUE.equals(step.get("can_skip")), str(step.get("description")));
            order++;
        }
        return Map.of("success", true, "steps", order - 1,
                "message", "Approval chain updated. New requests will follow this " + (order - 1) + "-step chain.");
    }

    @Transactional
    @Override
    public Map<String, Object> toggleModule(long moduleId) {
        requireModule(moduleId);
        jdbc.update("update public.approval_workflow_modules set is_active = not is_active, updated_at = now() where id = ?", moduleId);
        return Map.of("success", true, "message", "Module status toggled.");
    }

    // ─── Resource catalogue ───

    @Override
    public Map<String, Object> resources() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("resources", jdbc.queryForList("""
                select r.id, r.name, r.category, r.description, r.unit_of_measure, r.low_stock_threshold, r.unit_cost,
                       (select coalesce(sum(ii.quantity),0) from public.inventory_items ii where ii.resource_id = r.id) as in_stock
                from public.resources r order by r.category nulls last, r.name
                """));
        out.put("categories", jdbc.queryForList(
                "select distinct category from public.resources where category is not null order by category", String.class));
        return out;
    }

    @Transactional
    @Override
    public Map<String, Object> createResource(Map<String, Object> body) {
        Long id = jdbc.queryForObject("""
                insert into public.resources(name, category, description, unit_of_measure, low_stock_threshold,
                    unit_cost, created_at, updated_at)
                values (?,?,?,?,?,?,now(),now()) returning id
                """, Long.class, require(body.get("name"), "name"), str(body.get("category")),
                str(body.get("description")), str(body.get("unit_of_measure")),
                intOrNull(body.get("low_stock_threshold")), numOrNull(body.get("unit_cost")));
        return Map.of("success", true, "id", id, "message", "Resource added to the catalogue.");
    }

    @Transactional
    @Override
    public Map<String, Object> updateResource(long id, Map<String, Object> body) {
        int updated = jdbc.update("""
                update public.resources set name = ?, category = ?, description = ?, unit_of_measure = ?,
                    low_stock_threshold = ?, unit_cost = ?, updated_at = now() where id = ?
                """, require(body.get("name"), "name"), str(body.get("category")), str(body.get("description")),
                str(body.get("unit_of_measure")), intOrNull(body.get("low_stock_threshold")),
                numOrNull(body.get("unit_cost")), id);
        if (updated == 0) {
            throw new ResourceNotFoundException("Resource not found.");
        }
        return Map.of("success", true, "message", "Resource updated.");
    }

    @Transactional
    @Override
    public Map<String, Object> deleteResource(long id) {
        // Guard: a resource in use by allocations or stock must not be deleted (referential safety).
        Long inUse = jdbc.queryForObject("""
                select (select count(*) from public.allocated_resources where resource_id = ?)
                     + (select count(*) from public.inventory_items where resource_id = ?)
                """, Long.class, id, id);
        if (inUse != null && inUse > 0) {
            throw new BusinessRuleException("This resource is used by allocations or stock and cannot be deleted.");
        }
        if (jdbc.update("delete from public.resources where id = ?", id) == 0) {
            throw new ResourceNotFoundException("Resource not found.");
        }
        return Map.of("success", true, "message", "Resource removed from the catalogue.");
    }

    // ─── Incident types ───

    @Override
    public Map<String, Object> incidentTypes() {
        return Map.of(
                "incident_types", jdbc.queryForList("""
                        select it.id, it.name, it.description, it.default_severity, it.icon_class,
                               (select count(*) from public.incidents i where i.incident_type_id = it.id) as incident_count
                        from public.incident_types it order by it.name
                        """),
                "severities", IncidentOptions.SEVERITY_LEVELS,
                "icons", IncidentOptions.INCIDENT_ICONS);
    }

    @Transactional
    @Override
    public Map<String, Object> createIncidentType(Map<String, Object> body) {
        Long id = jdbc.queryForObject("""
                insert into public.incident_types(name, description, default_severity, icon_class, created_at, updated_at)
                values (?,?,?,?,now(),now()) returning id
                """, Long.class, require(body.get("name"), "name"), str(body.get("description")),
                validIn(body.get("default_severity"), IncidentOptions.SEVERITY_LEVELS, "severity"),
                validIn(body.get("icon_class"), IncidentOptions.INCIDENT_ICONS, "icon"));
        return Map.of("success", true, "id", id, "message", "Incident type added.");
    }

    @Transactional
    @Override
    public Map<String, Object> updateIncidentType(long id, Map<String, Object> body) {
        int updated = jdbc.update("""
                update public.incident_types set name = ?, description = ?, default_severity = ?, icon_class = ?,
                    updated_at = now() where id = ?
                """, require(body.get("name"), "name"), str(body.get("description")),
                validIn(body.get("default_severity"), IncidentOptions.SEVERITY_LEVELS, "severity"),
                validIn(body.get("icon_class"), IncidentOptions.INCIDENT_ICONS, "icon"), id);
        if (updated == 0) {
            throw new ResourceNotFoundException("Incident type not found.");
        }
        return Map.of("success", true, "message", "Incident type updated.");
    }

    @Transactional
    @Override
    public Map<String, Object> deleteIncidentType(long id) {
        Long inUse = jdbc.queryForObject(
                "select count(*) from public.incidents where incident_type_id = ?", Long.class, id);
        if (inUse != null && inUse > 0) {
            throw new BusinessRuleException("This incident type is in use by incidents and cannot be deleted.");
        }
        if (jdbc.update("delete from public.incident_types where id = ?", id) == 0) {
            throw new ResourceNotFoundException("Incident type not found.");
        }
        return Map.of("success", true, "message", "Incident type removed.");
    }

    // ─── Incident approval automation (the ladder-stage modes read by IncidentWorkflowService) ───

    /** The incident ladder stages an admin can automate, in flow order, with their human labels. */
    private static final List<Map<String, String>> AUTOMATION_TIERS = List.of(
            Map.of("stage", "waiting_ddmc", "label", "DDMC — District entry gate", "role", "Dist DC", "scope", "District"),
            Map.of("stage", "waiting_ded", "label", "DED — District approval", "role", "DED", "scope", "District"),
            Map.of("stage", "waiting_rdmc", "label", "RDMC — Regional coordinator", "role", "Reg DC", "scope", "Region"),
            Map.of("stage", "waiting_ras", "label", "RAS — Regional approval", "role", "RAS", "scope", "Region"),
            Map.of("stage", "waiting_eocc", "label", "EOCC — National operations", "role", "EOCC", "scope", "National"),
            Map.of("stage", "waiting_director", "label", "Director (DMD)", "role", "Director", "scope", "National"),
            Map.of("stage", "waiting_ps", "label", "PS — Permanent Secretary", "role", "Secretary", "scope", "National"));

    private static final java.util.Set<String> AUTOMATION_MODES = java.util.Set.of("manual", "auto", "skip_if_unstaffed");

    /** Current mode for each ladder stage + how many officers actually staff that role, for the settings screen. */
    @Override
    public Map<String, Object> approvalAutomation() {
        Map<String, String> configured = new LinkedHashMap<>();
        jdbc.queryForList("select key, value from public.portal_settings where \"group\" = 'incident_approval'")
                .forEach(r -> configured.put(String.valueOf(r.get("key")), String.valueOf(r.get("value"))));
        List<Map<String, Object>> tiers = new java.util.ArrayList<>();
        for (Map<String, String> t : AUTOMATION_TIERS) {
            String stage = t.get("stage");
            String mode = configured.getOrDefault(stage,
                    java.util.Set.of("waiting_ddmc", "waiting_ded", "waiting_rdmc").contains(stage) ? "skip_if_unstaffed" : "manual");
            Long officers = jdbc.queryForObject("""
                    select count(distinct u.id) from public.users u
                    join public.model_has_roles mhr on mhr.model_id = u.id
                    join public.roles r on r.id = mhr.role_id where r.name = ?
                    """, Long.class, t.get("role"));
            Map<String, Object> row = new LinkedHashMap<>(t);
            row.put("mode", mode);
            row.put("officers", officers == null ? 0 : officers);
            row.putAll(automationCoverage(t.get("scope"), t.get("role")));
            tiers.add(row);
        }
        return Map.of("tiers", tiers, "modes", List.of("manual", "auto", "skip_if_unstaffed"));
    }

    private Map<String, Object> automationCoverage(String scope, String role) {
        if ("District".equals(scope)) {
            Long covered = staffedAreaCount(role, "district_id");
            Long total = jdbc.queryForObject("select count(*) from public.districts", Long.class);
            return Map.of("coveredAreas", covered == null ? 0 : covered,
                    "totalAreas", total == null ? 0 : total,
                    "coverageLabel", "districts covered");
        }
        if ("Region".equals(scope)) {
            Long covered = staffedAreaCount(role, "region_id");
            Long total = jdbc.queryForObject("select count(*) from public.regions", Long.class);
            return Map.of("coveredAreas", covered == null ? 0 : covered,
                    "totalAreas", total == null ? 0 : total,
                    "coverageLabel", "regions covered");
        }
        return Map.of("coveredAreas", 0, "totalAreas", 0, "coverageLabel", "national desk");
    }

    private Long staffedAreaCount(String role, String areaColumn) {
        return jdbc.queryForObject("""
                select count(distinct u.%s) from public.users u
                join public.model_has_roles mhr on mhr.model_id = u.id
                join public.roles r on r.id = mhr.role_id
                where r.name = ? and u.%s is not null
                """.formatted(areaColumn, areaColumn), Long.class, role);
    }

    /** Save the stage modes. Body: { "waiting_ddmc": "skip_if_unstaffed", "waiting_ras": "manual", ... }. */
    @Transactional
    @Override
    public Map<String, Object> saveApprovalAutomation(Map<String, Object> body) {
        java.util.Set<String> validStages = new java.util.HashSet<>();
        AUTOMATION_TIERS.forEach(t -> validStages.add(t.get("stage")));
        int saved = 0;
        for (Map.Entry<String, Object> e : body.entrySet()) {
            String stage = e.getKey();
            String mode = str(e.getValue());
            if (!validStages.contains(stage)) {
                throw new BusinessRuleException("Unknown approval stage: " + stage);
            }
            if (mode == null || !AUTOMATION_MODES.contains(mode)) {
                throw new BusinessRuleException("Invalid mode for " + stage + " (use manual, auto or skip_if_unstaffed).");
            }
            // Upsert without relying on a unique constraint: update, else insert.
            int updated = jdbc.update(
                    "update public.portal_settings set value = ?, updated_at = now() where \"group\" = 'incident_approval' and key = ?",
                    mode, stage);
            if (updated == 0) {
                jdbc.update("insert into public.portal_settings (\"group\", key, value, type, created_at, updated_at) "
                        + "values ('incident_approval', ?, ?, 'string', now(), now())", stage, mode);
            }
            saved++;
        }
        return Map.of("success", true, "saved", saved, "message", "Approval automation updated.");
    }

    // ── helpers ──

    private void requireModule(long moduleId) {
        Long c = jdbc.queryForObject(
                "select count(*) from public.approval_workflow_modules where id = ?", Long.class, moduleId);
        if (c == null || c == 0) {
            throw new ResourceNotFoundException("Approval module not found.");
        }
    }

    private static String require(Object v, String field) {
        String s = str(v);
        if (s == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return s;
    }

    private static Integer intOrNull(Object v) {
        return v == null || String.valueOf(v).isBlank() ? null : (int) Double.parseDouble(String.valueOf(v));
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

    /** Validates an optional value against a controlled vocabulary; returns it (or null) for persistence. */
    private static String validIn(Object raw, List<String> allowed, String field) {
        String v = str(raw);
        if (v != null && !allowed.contains(v)) {
            throw new BusinessRuleException("Invalid " + field + ": \"" + v + "\".");
        }
        return v;
    }
}
