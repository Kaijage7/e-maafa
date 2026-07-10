package tz.go.pmo.dmis.common.security;

import java.util.Arrays;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Resolves the acting {@code users.id} honestly.
 * <ul>
 *   <li>Prefer numeric JWT subject (real login).</li>
 *   <li>Optional configured system actor email (ops-set, never a hardcoded demo).</li>
 *   <li>Else the lowest-id user with role Super Admin (real seat, if present).</li>
 *   <li>Never invents a user id. Never prefers {@code admin@example.com} in non-local profiles.</li>
 *   <li>Local profile only: last-resort min(users.id) for E2E when no Super Admin row exists.</li>
 * </ul>
 */
@Component
public class CurrentUserResolver {

    private final JdbcTemplate jdbc;
    private final Environment env;
    private final String systemActorEmail;

    public CurrentUserResolver(JdbcTemplate jdbc,
                               Environment env,
                               @Value("${dmis.auth.system-actor-email:}") String systemActorEmail) {
        this.jdbc = jdbc;
        this.env = env;
        this.systemActorEmail = systemActorEmail == null ? "" : systemActorEmail.trim();
    }

    /** Numeric users.id from the JWT subject, or null when the subject is non-numeric / missing. */
    public Long currentUserDbId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            try {
                return Long.parseLong(jwt.getSubject());
            } catch (Exception notNumeric) {
                return null;
            }
        }
        return null;
    }

    /**
     * Acting users.id for audit columns and automated jobs.
     * Returns {@code null} only if no real user can be resolved (callers must tolerate or fail closed).
     */
    public Long actingUserId() {
        Long id = currentUserDbId();
        if (id != null) {
            return id;
        }
        if (!systemActorEmail.isEmpty()) {
            Long byEmail = jdbc.query(
                    "select id from public.users where lower(email) = lower(?) limit 1",
                    rs -> rs.next() ? rs.getLong(1) : null,
                    systemActorEmail);
            if (byEmail != null) {
                return byEmail;
            }
        }
        Long superAdmin = jdbc.query("""
                select min(mhr.model_id)
                  from public.model_has_roles mhr
                  join public.roles r on r.id = mhr.role_id
                 where r.name = 'Super Admin'
                """, rs -> rs.next() && rs.getObject(1) != null ? rs.getLong(1) : null);
        if (superAdmin != null) {
            return superAdmin;
        }
        if (isLocalProfile()) {
            // Local/E2E only — never use min(id) as a silent national "system user".
            return jdbc.query("select min(id) from public.users",
                    rs -> rs.next() && rs.getObject(1) != null ? rs.getLong(1) : null);
        }
        return null;
    }

    /**
     * System actor for scheduled jobs (no security context). Same honesty rules as
     * {@link #actingUserId()} without JWT.
     */
    public Long systemActorUserId() {
        if (!systemActorEmail.isEmpty()) {
            Long byEmail = jdbc.query(
                    "select id from public.users where lower(email) = lower(?) limit 1",
                    rs -> rs.next() ? rs.getLong(1) : null,
                    systemActorEmail);
            if (byEmail != null) {
                return byEmail;
            }
        }
        Long superAdmin = jdbc.query("""
                select min(mhr.model_id)
                  from public.model_has_roles mhr
                  join public.roles r on r.id = mhr.role_id
                 where r.name = 'Super Admin'
                """, rs -> rs.next() && rs.getObject(1) != null ? rs.getLong(1) : null);
        if (superAdmin != null) {
            return superAdmin;
        }
        if (isLocalProfile()) {
            return jdbc.query("select min(id) from public.users",
                    rs -> rs.next() && rs.getObject(1) != null ? rs.getLong(1) : null);
        }
        return null;
    }

    private boolean isLocalProfile() {
        return Arrays.stream(env.getActiveProfiles()).anyMatch(p -> "local".equalsIgnoreCase(p));
    }
}
