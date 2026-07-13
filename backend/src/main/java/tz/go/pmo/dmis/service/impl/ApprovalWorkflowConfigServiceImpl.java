package tz.go.pmo.dmis.service.impl;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.service.ApprovalWorkflowConfigService;
import tz.go.pmo.dmis.settings.RoleCatalogue;

/**
 * JDBC admin for the V24 generalized approval engine chains. Paths and JSON shapes are
 * unchanged from the former settings package controller. Runtime approval steps are initialized
 * by {@code response.ApprovalWorkflowEngine} from the same tables (no Java type coupling).
 */
@Service
@RequiredArgsConstructor
public class ApprovalWorkflowConfigServiceImpl implements ApprovalWorkflowConfigService {

    private final JdbcTemplate jdbc;

    @Override
    @Transactional(readOnly = true)
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
        List<Map<String, Object>> roleDetails = RoleCatalogue.roleDetails(jdbc);
        out.put("modules", modules);
        out.put("roles", RoleCatalogue.names(roleDetails));
        out.put("roleDetails", roleDetails);
        out.put("roleGroups", RoleCatalogue.groups(roleDetails));
        return out;
    }

    @Override
    @Transactional
    public Map<String, Object> toggleModule(long moduleId) {
        int n = jdbc.update("update public.approval_workflow_modules set is_active = not is_active,"
                + " updated_at = now() where id = ?", moduleId);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Module not found");
        }
        return Map.of("message", "Module updated");
    }

    @Override
    @Transactional
    public Map<String, Object> addLevel(long moduleId, Map<String, Object> req) {
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

    @Override
    @Transactional
    public Map<String, Object> updateLevel(long levelId, Map<String, Object> req) {
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

    @Override
    @Transactional
    public Map<String, Object> moveLevel(long levelId, Map<String, Object> req) {
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

    @Override
    @Transactional
    public void deleteLevel(long levelId) {
        Map<String, Object> row;
        try {
            row = jdbc.queryForMap(
                    "select id, module_id from public.approval_workflow_configurations where id = ?", levelId);
        } catch (org.springframework.dao.EmptyResultDataAccessException missing) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Level not found");
        }
        long moduleId = ((Number) row.get("module_id")).longValue();
        jdbc.update("delete from public.approval_workflow_configurations where id = ?", levelId);
        // Compact "order" to 1..n so the engine sequence stays contiguous after removals / historical gaps.
        List<Long> remaining = jdbc.queryForList(
                "select id from public.approval_workflow_configurations where module_id = ? order by \"order\", level",
                Long.class, moduleId);
        int order = 1;
        for (Long id : remaining) {
            jdbc.update("update public.approval_workflow_configurations set \"order\" = ?, updated_at = now() where id = ?",
                    order++, id);
        }
    }

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
