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
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * System Settings → User Management. Administers the {@code users} table and each user's SRS roles
 * ({@code model_has_roles}). Passwords are BCrypt-hashed the same way {@code AuthController} verifies
 * them. Roles drive both the sidebar (the module hub) and every {@code @PreAuthorize} check across
 * the platform, so this screen is the access-control front door.
 *
 * <p>Writes are gated to the administrators who govern accounts. A safety rail prevents deleting or
 * stripping the role of the last Super Admin (locking everyone out).</p>
 */
@RestController
@RequestMapping("/v1/settings/users")
@Tag(name = "Settings: User Management", description = "Users + role assignment")
@RequiredArgsConstructor
public class UserManagementController {

    private static final String CAN_WRITE = "hasAuthority('user_management.manage')";
    private static final String MODEL_TYPE = "App\\Models\\User";

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @GetMapping
    @Operation(summary = "Users with their roles + the role catalogue + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index(@RequestParam(required = false) String search,
                                     @RequestParam(required = false) String role) {
        StringBuilder where = new StringBuilder(" where 1=1");
        List<Object> args = new ArrayList<>();
        if (search != null && !search.isBlank()) {
            where.append(" and (u.name ilike ? or u.email ilike ?)");
            args.add("%" + search + "%");
            args.add("%" + search + "%");
        }
        if (role != null && !role.isBlank()) {
            where.append(" and exists (select 1 from public.model_has_roles m join public.roles r2 on r2.id = m.role_id"
                    + " where m.model_id = u.id and r2.name = ?)");
            args.add(role);
        }
        List<Map<String, Object>> users = jdbc.queryForList(
                "select u.id, u.name, u.email, u.email_verified_at as \"emailVerifiedAt\","
                        + " to_char(u.created_at,'DD Mon YYYY') as \"createdAt\","
                        + " coalesce((select string_agg(r.name, ', ' order by r.name)"
                        + "   from public.model_has_roles mhr join public.roles r on r.id = mhr.role_id"
                        + "   where mhr.model_id = u.id), '') as roles"
                        + " from public.users u" + where + " order by u.name", args.toArray());
        for (Map<String, Object> u : users) {
            String roles = String.valueOf(u.getOrDefault("roles", ""));
            u.put("roleList", roles.isEmpty() ? List.of() : List.of(roles.split(", ")));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("users", users);
        out.put("roles", jdbc.queryForList("select name from public.roles order by name", String.class));
        out.put("stats", jdbc.queryForMap(
                "select count(*) as total,"
                        + " (select count(*) from public.model_has_roles mhr join public.roles r on r.id = mhr.role_id"
                        + "   where r.name = 'Super Admin') as \"superAdmins\","
                        + " count(*) filter (where email_verified_at is not null) as verified from public.users"));
        return out;
    }

    @PostMapping
    @Operation(summary = "Create a user (BCrypt password) + assign roles")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> create(@RequestBody Map<String, Object> req) {
        String name = req(req, "name");
        String email = req(req, "email").toLowerCase();
        String password = req(req, "password");
        validatePassword(password);
        Long dup = jdbc.queryForObject("select count(*) from public.users where lower(email) = ?", Long.class, email);
        if (dup != null && dup > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A user with that email already exists");
        }
        // Self-heal the id sequence: the legacy seeder inserted users with explicit ids without
        // bumping users_id_seq, so a fresh insert can collide on the pkey. Advance it past max(id).
        jdbc.queryForObject("select setval('public.users_id_seq', greatest("
                + "coalesce((select max(id) from public.users), 1), (select last_value from public.users_id_seq)))",
                Long.class);
        Long id = jdbc.queryForObject(
                "insert into public.users(name, email, password, email_verified_at, created_at, updated_at)"
                        + " values (?,?,?, now(), now(), now()) returning id",
                Long.class, name, email, encoder.encode(password));
        setRoles(id, roleList(req.get("roles")));
        return Map.of("id", id, "message", "User created");
    }

    @PutMapping("/{id}")
    @Operation(summary = "Edit a user's name / email")
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> req) {
        find(id);
        String email = str(req.get("email"));
        if (email != null) {
            Long dup = jdbc.queryForObject(
                    "select count(*) from public.users where lower(email) = lower(?) and id <> ?", Long.class, email, id);
            if (dup != null && dup > 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Another user already has that email");
            }
        }
        jdbc.update("update public.users set name = coalesce(?,name), email = coalesce(lower(?),email),"
                + " updated_at = now() where id = ?", str(req.get("name")), email, id);
        return Map.of("message", "User updated");
    }

    @PutMapping("/{id}/roles")
    @Operation(summary = "Replace a user's roles")
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> setUserRoles(@PathVariable long id, @RequestBody Map<String, Object> req) {
        find(id);
        List<String> roles = roleList(req.get("roles"));
        guardLastSuperAdmin(id, roles);
        setRoles(id, roles);
        return Map.of("message", "Roles updated");
    }

    @PostMapping("/{id}/password")
    @Operation(summary = "Reset a user's password")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> resetPassword(@PathVariable long id, @RequestBody Map<String, Object> req) {
        find(id);
        String password = req(req, "password");
        validatePassword(password);
        jdbc.update("update public.users set password = ?, updated_at = now() where id = ?",
                encoder.encode(password), id);
        return Map.of("message", "Password reset");
    }

    /** Minimum password policy: at least 8 characters including a letter and a digit. */
    private static void validatePassword(String password) {
        if (password == null || password.length() < 8
                || !password.matches(".*[A-Za-z].*") || !password.matches(".*\\d.*")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Password must be at least 8 characters and include a letter and a number.");
        }
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a user (cannot remove the last Super Admin)")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public void delete(@PathVariable long id) {
        find(id);
        guardLastSuperAdmin(id, List.of()); // deleting = stripping all roles
        jdbc.update("delete from public.model_has_roles where model_id = ? and model_type = ?", id, MODEL_TYPE);
        jdbc.update("delete from public.users where id = ?", id);
    }

    // ── helpers ──

    private void setRoles(long userId, List<String> roleNames) {
        jdbc.update("delete from public.model_has_roles where model_id = ? and model_type = ?", userId, MODEL_TYPE);
        for (String roleName : roleNames) {
            Long roleId = roleId(roleName);
            if (roleId != null) {
                jdbc.update("insert into public.model_has_roles(role_id, model_type, model_id) values (?,?,?)"
                        + " on conflict do nothing", roleId, MODEL_TYPE, userId);
            }
        }
    }

    /** Never let the system lose its last Super Admin (would lock everyone out of writes). */
    private void guardLastSuperAdmin(long userId, List<String> newRoles) {
        boolean isSuperAdmin = Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists (select 1 from public.model_has_roles mhr join public.roles r on r.id = mhr.role_id"
                        + " where mhr.model_id = ? and r.name = 'Super Admin')", Boolean.class, userId));
        if (!isSuperAdmin || newRoles.contains("Super Admin")) {
            return;
        }
        Long others = jdbc.queryForObject(
                "select count(distinct mhr.model_id) from public.model_has_roles mhr join public.roles r on r.id = mhr.role_id"
                        + " where r.name = 'Super Admin' and mhr.model_id <> ?", Long.class, userId);
        if (others == null || others == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This is the last Super Admin — assign Super Admin to another user first.");
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> roleList(Object v) {
        if (v instanceof List<?> list) {
            return list.stream().map(String::valueOf).filter(s -> !s.isBlank()).toList();
        }
        return List.of();
    }

    private Long roleId(String name) {
        List<Long> ids = jdbc.queryForList("select id from public.roles where name = ?", Long.class, name);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Map<String, Object> find(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select id from public.users where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
        }
        return rows.get(0);
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
