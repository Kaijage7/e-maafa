package tz.go.pmo.dmis.settings;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * System Settings → Approval Workflows. Administers the V24 generalized approval engine:
 * each {@code approval_workflow_modules} row (e.g. Resource Allocation) owns an ordered chain of
 * {@code approval_workflow_configurations} levels (role + order + skip + active). This is the
 * single configuration source the {@code ApprovalWorkflowEngine} reads when initializing a
 * record's approval steps — editing a chain here changes who approves what, system-wide.
 *
 * <p>Reads are open to any signed-in officer; writes are gated to the administrators who govern
 * the approval doctrine.</p>
 */
@RestController
@RequestMapping("/v1/settings/approval-workflows")
@Tag(name = "Settings: Approval Workflows", description = "Configure the V24 approval engine chains")
@RequiredArgsConstructor
public class ApprovalWorkflowConfigController {

    private static final String CAN_WRITE = "hasAuthority('approval_workflows.manage')";

    private final JdbcTemplate jdbc;

    /** All modules, each with its ordered level chain + a count of records currently in flight. */
    @GetMapping
    @Operation(summary = "Modules + their approval chains + role catalogue")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        List<Map<String, Object>> modules = jdbc.queryForList(
                "select id, module_code as \"moduleCode\", module_name as \"moduleName\","
                        + " model_class as \"modelClass\", is_active as \"isActive\", description"
                        + " from public.approval_workflow_modules order by module_name");
        for (Map<String, Object> m : modules) {
            m.put("levels", jdbc.queryForList(
                    "select id, level, name, role_required as \"roleRequired\", \"order\","
                            + " is_active as \"isActive\", can_skip as \"canSkip\", skip_conditions as \"skipConditions\","
                            + " description from public.approval_workflow_configurations"
                            + " where module_id = ? order by \"order\", level", m.get("id")));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("modules", modules);
        out.put("roles", jdbc.queryForList("select name from public.roles order by name", String.class));
        return out;
    }

    // NB: there is intentionally NO "create module" endpoint. Approval modules are wired into the engine
    // in code (ApprovalWorkflowEngine is invoked with hardcoded module codes — today only
    // "resource_allocation"), so an admin-created module could never be initialised and would be dead
    // config. This screen configures the chains of the engine-wired modules; adding a new module is a
    // code change (wire the engine + seed it), not a runtime admin action.

    @PostMapping("/{moduleId}/toggle")
    @Operation(summary = "Activate / deactivate a module's chain")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> toggleModule(@PathVariable long moduleId) {
        int n = jdbc.update("update public.approval_workflow_modules set is_active = not is_active,"
                + " updated_at = now() where id = ?", moduleId);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Module not found");
        }
        return Map.of("message", "Module updated");
    }

    /** Append a level to a module's chain (order defaults to next in sequence). */
    @PostMapping("/{moduleId}/levels")
    @Operation(summary = "Add an approval level to a module")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> addLevel(@PathVariable long moduleId, @RequestBody Map<String, Object> req) {
        requireModule(moduleId);
        String name = req(req, "name");
        String role = req(req, "roleRequired");
        requireRole(role);
        // 'order' drives the engine sequence (move swaps it); 'level' is a stable, never-reused id
        // that satisfies the UNIQUE(module_id, level) constraint — compute the two independently.
        Integer nextOrder = jdbc.queryForObject(
                "select coalesce(max(\"order\"), 0) + 1 from public.approval_workflow_configurations"
                        + " where module_id = ?", Integer.class, moduleId);
        Integer nextLevel = jdbc.queryForObject(
                "select coalesce(max(level), 0) + 1 from public.approval_workflow_configurations"
                        + " where module_id = ?", Integer.class, moduleId);
        Long id = jdbc.queryForObject(
                "insert into public.approval_workflow_configurations(module_id, level, name, role_required,"
                        + " \"order\", is_active, can_skip, description, created_at, updated_at)"
                        + " values (?,?,?,?,?,true,?,?,now(),now()) returning id",
                Long.class, moduleId, nextLevel, name, role, nextOrder,
                Boolean.TRUE.equals(req.get("canSkip")), str(req.get("description")));
        return Map.of("id", id, "message", "Level added");
    }

    @PutMapping("/levels/{levelId}")
    @Operation(summary = "Edit an approval level (name, role, skip, active, description)")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> updateLevel(@PathVariable long levelId, @RequestBody Map<String, Object> req) {
        String role = str(req.get("roleRequired"));
        if (role != null) {
            requireRole(role);
        }
        int n = jdbc.update("update public.approval_workflow_configurations set"
                        + " name = coalesce(?, name), role_required = coalesce(?, role_required),"
                        + " can_skip = coalesce(?, can_skip), is_active = coalesce(?, is_active),"
                        + " skip_conditions = ?, description = coalesce(?, description), updated_at = now()"
                        + " where id = ?",
                str(req.get("name")), role, bool(req.get("canSkip")), bool(req.get("isActive")),
                str(req.get("skipConditions")), str(req.get("description")), levelId);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Level not found");
        }
        return Map.of("message", "Level updated");
    }

    /** Move a level up/down in its chain by swapping order with its neighbour. */
    @PostMapping("/levels/{levelId}/move")
    @Operation(summary = "Reorder a level within its chain (direction up|down)")
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> moveLevel(@PathVariable long levelId, @RequestBody Map<String, Object> req) {
        Map<String, Object> level = jdbc.queryForMap(
                "select id, module_id, \"order\" from public.approval_workflow_configurations where id = ?", levelId);
        int order = ((Number) level.get("order")).intValue();
        long moduleId = ((Number) level.get("module_id")).longValue();
        boolean up = "up".equals(req.get("direction"));
        List<Map<String, Object>> neighbour = jdbc.queryForList(
                "select id, \"order\" from public.approval_workflow_configurations"
                        + " where module_id = ? and \"order\" " + (up ? "< ?" : "> ?")
                        + " order by \"order\" " + (up ? "desc" : "asc") + " limit 1", moduleId, order);
        if (neighbour.isEmpty()) {
            return Map.of("message", "Already at the " + (up ? "top" : "bottom"));
        }
        int neighbourOrder = ((Number) neighbour.get(0).get("order")).intValue();
        long neighbourId = ((Number) neighbour.get(0).get("id")).longValue();
        // Swap ONLY "order" (the engine's sequence column, no unique constraint). 'level' stays put —
        // swapping it would transiently violate UNIQUE(module_id, level) mid-update.
        jdbc.update("update public.approval_workflow_configurations set \"order\" = ?, updated_at = now() where id = ?",
                neighbourOrder, levelId);
        jdbc.update("update public.approval_workflow_configurations set \"order\" = ?, updated_at = now() where id = ?",
                order, neighbourId);
        return Map.of("message", "Level moved " + (up ? "up" : "down"));
    }

    @DeleteMapping("/levels/{levelId}")
    @Operation(summary = "Remove an approval level")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void deleteLevel(@PathVariable long levelId) {
        jdbc.update("delete from public.approval_workflow_configurations where id = ?", levelId);
    }

    // ── helpers ──

    private void requireModule(long id) {
        Long n = jdbc.queryForObject(
                "select count(*) from public.approval_workflow_modules where id = ?", Long.class, id);
        if (n == null || n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Module not found");
        }
    }

    /** The required role must be a live row in the authoritative {@code public.roles} vocabulary. */
    private void requireRole(String role) {
        Long n = jdbc.queryForObject("select count(*) from public.roles where name = ?", Long.class, role);
        if (n == null || n == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown role \"" + role + "\" — choose one from the role list.");
        }
    }

    private static String req(Map<String, Object> m, String key) {
        String v = str(m.get(key));
        if (v == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " is required");
        }
        return v;
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Boolean bool(Object v) {
        return v == null ? null : Boolean.valueOf(String.valueOf(v));
    }
}
