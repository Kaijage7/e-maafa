package tz.go.pmo.dmis.settings;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.ArrayList;
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
 * System Settings → Roles &amp; Permissions. Captures the access model that ties everything together:
 * users hold roles ({@code model_has_roles}); roles hold permissions ({@code role_has_permissions})
 * across the system's functional areas (V44 catalogue). The matrix here is the single place the
 * who-can-do-what policy is governed.
 *
 * <p>Honest scope: the Spring backend authorizes by ROLE ({@code hasAnyRole}); the permission rows
 * document and govern the model (and can drive finer-grained enforcement later). Guard rails keep
 * the Super Admin role intact and stop deletion of a role still held by users.</p>
 */
@RestController
@RequestMapping("/v1/settings/roles")
@Tag(name = "Settings: Roles & Permissions", description = "Roles, the permission catalogue and the matrix")
@RequiredArgsConstructor
public class RolePermissionController {

    private static final String CAN_WRITE = Authz.SYS_ADMIN;

    private final JdbcTemplate jdbc;

    /** Roles with user + permission counts (the registry). */
    @GetMapping
    @Operation(summary = "Roles + user/permission counts + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        List<Map<String, Object>> roles = jdbc.queryForList(
                "select r.id, r.name, r.description,"
                        + " (select count(*) from public.model_has_roles m where m.role_id = r.id) as \"userCount\","
                        + " (select count(*) from public.role_has_permissions rp where rp.role_id = r.id) as \"permissionCount\""
                        + " from public.roles r order by r.name");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("roles", roles);
        out.put("stats", jdbc.queryForMap(
                "select (select count(*) from public.roles) as roles,"
                        + " (select count(*) from public.permissions) as permissions,"
                        + " (select count(*) from public.role_has_permissions) as assignments"));
        return out;
    }

    /** The permission catalogue grouped by functional area — the matrix columns. */
    @GetMapping("/catalogue")
    @Operation(summary = "Permission catalogue grouped by module")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> catalogue() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, module, action, label from public.permissions order by module, id");
        List<Map<String, Object>> groups = new ArrayList<>();
        Map<String, List<Map<String, Object>>> byModule = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            byModule.computeIfAbsent(String.valueOf(r.get("module")), k -> new ArrayList<>()).add(Map.of(
                    "id", r.get("id"), "action", r.get("action"), "label", r.get("label")));
        }
        byModule.forEach((module, perms) -> groups.add(Map.of("module", module, "permissions", perms)));
        return Map.of("catalogue", groups);
    }

    /** One role with the set of permission ids it holds (drives the matrix checkboxes). */
    @GetMapping("/{id}")
    @Operation(summary = "Role + its permission ids")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> show(@PathVariable long id) {
        Map<String, Object> role = role(id);
        role.put("permissionIds", jdbc.queryForList(
                "select permission_id from public.role_has_permissions where role_id = ?", Long.class, id));
        return Map.of("role", role);
    }

    @PostMapping
    @Operation(summary = "Create a role")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> create(@RequestBody Map<String, Object> req) {
        String name = req(req, "name");
        Long dup = jdbc.queryForObject("select count(*) from public.roles where name = ?", Long.class, name);
        if (dup != null && dup > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A role with that name already exists");
        }
        // Self-heal roles_id_seq — the legacy seeder inserted roles with explicit ids without
        // bumping it, so a fresh insert can collide on the pkey. Advance past max(id).
        jdbc.queryForList("select setval(pg_get_serial_sequence('public.roles','id'), m)"
                + " from (select max(id) m from public.roles) s where m is not null");
        Long id = jdbc.queryForObject(
                "insert into public.roles(name, guard_name, description, created_at, updated_at)"
                        + " values (?, 'web', ?, now(), now()) returning id",
                Long.class, name, str(req.get("description")));
        return Map.of("id", id, "message", "Role created");
    }

    @PutMapping("/{id}")
    @Operation(summary = "Rename a role / edit its description")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> req) {
        role(id);
        jdbc.update("update public.roles set name = coalesce(?, name), description = ?, updated_at = now()"
                + " where id = ?", str(req.get("name")), str(req.get("description")), id);
        return Map.of("message", "Role updated");
    }

    /** Replace a role's permissions (the matrix save). */
    @PutMapping("/{id}/permissions")
    @Operation(summary = "Set a role's permissions")
    @Transactional
    @PreAuthorize(CAN_WRITE)
    @SuppressWarnings("unchecked")
    public Map<String, Object> setPermissions(@PathVariable long id, @RequestBody Map<String, Object> req) {
        role(id);
        List<Object> ids = req.get("permissionIds") instanceof List<?> list ? (List<Object>) list : List.of();
        jdbc.update("delete from public.role_has_permissions where role_id = ?", id);
        for (Object pid : ids) {
            jdbc.update("insert into public.role_has_permissions(permission_id, role_id) values (?,?)"
                    + " on conflict do nothing", Long.valueOf(String.valueOf(pid)), id);
        }
        return Map.of("message", "Permissions updated", "count", ids.size());
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a role (not Super Admin, not while held by users)")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public void delete(@PathVariable long id) {
        Map<String, Object> role = role(id);
        if ("Super Admin".equals(role.get("name"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The Super Admin role cannot be deleted.");
        }
        Long users = jdbc.queryForObject(
                "select count(*) from public.model_has_roles where role_id = ?", Long.class, id);
        if (users != null && users > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This role is held by " + users + " user(s) — reassign them first.");
        }
        jdbc.update("delete from public.role_has_permissions where role_id = ?", id);
        jdbc.update("delete from public.roles where id = ?", id);
    }

    // ── helpers ──

    private Map<String, Object> role(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, name, description from public.roles where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Role not found");
        }
        return new LinkedHashMap<>(rows.get(0));
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
}
