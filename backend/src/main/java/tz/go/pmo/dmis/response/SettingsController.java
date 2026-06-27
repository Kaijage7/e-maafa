package tz.go.pmo.dmis.response;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * R12 — System Settings hub. Administers the configurable parts of the Response module:
 *
 *   • Approval chains — the role chain the V24 generalized engine actually reads
 *     (approval_workflow_modules + approval_workflow_configurations). Editing a chain here
 *     changes how the live DAS→RAS→EOCC→Asst.Dir→Director approvals run (the user's directive
 *     that "the key part is approval flows well captured, linking with the System Settings module").
 *   • Resource catalogue — the resources every allocation/dispatch flow draws from.
 *   • Incident types — the hazard classification used across Response.
 *
 * (Alert templates are administered in the Communication Center, R9.)
 */
@RestController
@RequestMapping("/v1/response/settings")
public class SettingsController {

    private final JdbcTemplate jdbc;

    public SettingsController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ─── Approval chains (the live V24 engine config) ───

    @GetMapping("/approval-chains")
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

    @GetMapping("/approval-chains/{moduleId}")
    public Map<String, Object> approvalChain(@PathVariable long moduleId) {
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
    @PreAuthorize("hasAuthority('approval_workflows.manage')")
    @PostMapping("/approval-chains/{moduleId}/steps")
    @Transactional
    public Map<String, Object> saveChain(@PathVariable long moduleId, @RequestBody Map<String, Object> body) {
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

    @PreAuthorize("hasAuthority('approval_workflows.manage')")
    @PostMapping("/approval-chains/{moduleId}/toggle")
    @Transactional
    public Map<String, Object> toggleModule(@PathVariable long moduleId) {
        requireModule(moduleId);
        jdbc.update("update public.approval_workflow_modules set is_active = not is_active, updated_at = now() where id = ?", moduleId);
        return Map.of("success", true, "message", "Module status toggled.");
    }

    // ─── Resource catalogue ───

    @GetMapping("/resources")
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

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @PostMapping("/resources")
    @Transactional
    public Map<String, Object> createResource(@RequestBody Map<String, Object> body) {
        Long id = jdbc.queryForObject("""
                insert into public.resources(name, category, description, unit_of_measure, low_stock_threshold,
                    unit_cost, created_at, updated_at)
                values (?,?,?,?,?,?,now(),now()) returning id
                """, Long.class, require(body.get("name"), "name"), str(body.get("category")),
                str(body.get("description")), str(body.get("unit_of_measure")),
                intOrNull(body.get("low_stock_threshold")), numOrNull(body.get("unit_cost")));
        return Map.of("success", true, "id", id, "message", "Resource added to the catalogue.");
    }

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @PostMapping("/resources/{id}")
    @Transactional
    public Map<String, Object> updateResource(@PathVariable long id, @RequestBody Map<String, Object> body) {
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

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @DeleteMapping("/resources/{id}")
    @Transactional
    public Map<String, Object> deleteResource(@PathVariable long id) {
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

    @GetMapping("/incident-types")
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

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @PostMapping("/incident-types")
    @Transactional
    public Map<String, Object> createIncidentType(@RequestBody Map<String, Object> body) {
        Long id = jdbc.queryForObject("""
                insert into public.incident_types(name, description, default_severity, icon_class, created_at, updated_at)
                values (?,?,?,?,now(),now()) returning id
                """, Long.class, require(body.get("name"), "name"), str(body.get("description")),
                validIn(body.get("default_severity"), IncidentOptions.SEVERITY_LEVELS, "severity"),
                validIn(body.get("icon_class"), IncidentOptions.INCIDENT_ICONS, "icon"));
        return Map.of("success", true, "id", id, "message", "Incident type added.");
    }

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @PostMapping("/incident-types/{id}")
    @Transactional
    public Map<String, Object> updateIncidentType(@PathVariable long id, @RequestBody Map<String, Object> body) {
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

    @PreAuthorize("hasAuthority('resource_catalogue.manage')")
    @DeleteMapping("/incident-types/{id}")
    @Transactional
    public Map<String, Object> deleteIncidentType(@PathVariable long id) {
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
