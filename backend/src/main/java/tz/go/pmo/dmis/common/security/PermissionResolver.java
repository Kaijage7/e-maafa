package tz.go.pmo.dmis.common.security;

import java.util.Collection;
import java.util.List;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Resolves a user's effective fine-grained permissions (the {@code module.action} names in
 * {@code public.permissions}) from the roles granted to them via {@code role_has_permissions}. These are
 * carried in the bearer token and mapped to authorities so {@code @PreAuthorize("hasAuthority('…')")} can
 * enforce capability — the RBAC layer that sits alongside the existing role names.
 */
@Component
public class PermissionResolver {

    private final JdbcTemplate jdbc;

    public PermissionResolver(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Effective permissions for a user id (union over all their roles). */
    public List<String> forUser(long userId) {
        return jdbc.queryForList(
                "select distinct p.name from public.model_has_roles mhr"
                        + " join public.role_has_permissions rhp on rhp.role_id = mhr.role_id"
                        + " join public.permissions p on p.id = rhp.permission_id"
                        + " where mhr.model_id = ? order by p.name",
                String.class, userId);
    }

    /** Every permission name (used by the local no-header god-mode persona so it keeps full access). */
    public List<String> all() {
        return jdbc.queryForList("select name from public.permissions order by name", String.class);
    }

    /** Effective permissions for a set of role names (used by the local-profile persona filter). */
    public List<String> forRoles(Collection<String> roles) {
        if (roles == null || roles.isEmpty()) {
            return List.of();
        }
        String placeholders = roles.stream().map(r -> "?").collect(Collectors.joining(","));
        return jdbc.queryForList(
                "select distinct p.name from public.roles r"
                        + " join public.role_has_permissions rhp on rhp.role_id = r.id"
                        + " join public.permissions p on p.id = rhp.permission_id"
                        + " where r.name in (" + placeholders + ") order by p.name",
                String.class, roles.toArray());
    }
}
