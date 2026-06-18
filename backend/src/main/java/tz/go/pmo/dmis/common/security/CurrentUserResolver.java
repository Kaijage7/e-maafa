package tz.go.pmo.dmis.common.security;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Component;

/**
 * Resolves the acting user's {@code users.id}. Production Keycloak tokens carry the numeric id in the
 * subject; the local dev profile's synthetic subject is not numeric, so we fall back to the seeded
 * admin account (and finally the lowest id) — the same contract the response/onehealth services use,
 * centralised here so new code does not re-implement it.
 */
@Component
public class CurrentUserResolver {

    private final JdbcTemplate jdbc;

    public CurrentUserResolver(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Numeric users.id straight from the JWT subject, or null when the subject is non-numeric. */
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

    /** Acting users.id with admin/min fallback so per-user reads always resolve to a real account. */
    public Long actingUserId() {
        Long id = currentUserDbId();
        if (id != null) {
            return id;
        }
        Long admin = jdbc.query("select id from public.users where email = 'admin@example.com'",
                rs -> rs.next() ? rs.getLong(1) : null);
        if (admin != null) {
            return admin;
        }
        return jdbc.query("select min(id) from public.users",
                rs -> rs.next() && rs.getObject(1) != null ? rs.getLong(1) : null);
    }
}
