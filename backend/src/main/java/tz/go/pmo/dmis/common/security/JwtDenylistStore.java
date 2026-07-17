package tz.go.pmo.dmis.common.security;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * PostgreSQL authority for JWT revocation ({@code platform.jwt_denylist}, Flyway V214).
 * Separated from {@link TokenDenylist} so Spring can apply {@code REQUIRES_NEW} on a real proxy.
 */
@Repository
public class JwtDenylistStore {

    private static final Logger log = LoggerFactory.getLogger(JwtDenylistStore.class);

    private final JdbcTemplate jdbc;

    public JwtDenylistStore(JdbcTemplate jdbc) {
        this.jdbc = Objects.requireNonNull(jdbc, "JdbcTemplate is required for shared JWT denylist");
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void persist(String jti, Instant until) {
        int rows = jdbc.update(
                """
                INSERT INTO platform.jwt_denylist (jti, revoked_until)
                VALUES (?, ?)
                ON CONFLICT (jti) DO UPDATE
                  SET revoked_until = GREATEST(platform.jwt_denylist.revoked_until, EXCLUDED.revoked_until)
                """,
                jti,
                Timestamp.from(until));
        log.info("jwt denylist DB persist jti={} rows={}", jti, rows);
    }

    public Instant findActiveUntil(String jti) {
        try {
            return jdbc.query(
                    """
                    SELECT revoked_until FROM platform.jwt_denylist
                    WHERE jti = ? AND revoked_until > now()
                    """,
                    rs -> rs.next() ? rs.getTimestamp(1).toInstant() : null,
                    jti);
        } catch (DataAccessException ex) {
            log.error("jwt denylist read failed: {}", ex.getMessage());
            return null;
        }
    }

    public void deleteExpired() {
        try {
            jdbc.update("DELETE FROM platform.jwt_denylist WHERE revoked_until < now()");
        } catch (DataAccessException ex) {
            log.warn("jwt denylist sweep failed: {}", ex.getMessage());
        }
    }
}
