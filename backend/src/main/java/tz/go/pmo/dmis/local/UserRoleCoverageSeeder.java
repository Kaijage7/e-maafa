package tz.go.pmo.dmis.local;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Ensures EVERY SRS role is represented by at least one user, so User Management and the access
 * model are demonstrable end-to-end (the base {@code LocalDataSeeder} only seeds 5 of the 13).
 * Creates a demo account (BCrypt "password", email-verified) for each role that has no user and
 * assigns it, idempotently. {@code model_type} matches AuthController / UserManagementController.
 */
@Component
@Profile("local")
@Order(27)
@RequiredArgsConstructor
public class UserRoleCoverageSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(UserRoleCoverageSeeder.class);
    private static final String MODEL_TYPE = "App\\Models\\User";

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    /** Role → (display name, email) for the demo account that fills any uncovered role. */
    private static final Map<String, String[]> COVERAGE = buildCoverage();

    private static Map<String, String[]> buildCoverage() {
        Map<String, String[]> m = new LinkedHashMap<>();
        m.put("Secretary", new String[]{"Permanent Secretary", "secretary@pmo.go.tz"});
        m.put("Asst. Director", new String[]{"Assistant Director DMD", "asst.director@pmo.go.tz"});
        m.put("ICT Admin", new String[]{"ICT Administrator", "ict@pmo.go.tz"});
        m.put("Comms Officer", new String[]{"Communications Officer", "comms@pmo.go.tz"});
        m.put("RAS", new String[]{"Regional Admin Secretary", "ras@pmo.go.tz"});
        m.put("Reg DC", new String[]{"Regional Disaster Coordinator", "regdc@pmo.go.tz"});
        m.put("DAS", new String[]{"District Admin Secretary", "das@pmo.go.tz"});
        m.put("Partners", new String[]{"Partner Liaison", "partner@pmo.go.tz"});
        return m;
    }

    @Override
    public void run(String... args) {
        int created = 0;
        for (Map.Entry<String, String[]> e : COVERAGE.entrySet()) {
            Long roleId = roleId(e.getKey());
            if (roleId == null || roleHasUser(roleId) || emailTaken(e.getValue()[1])) {
                continue;
            }
            healUsersSeq();
            Long userId = jdbc.queryForObject(
                    "insert into public.users(name, email, password, email_verified_at, created_at, updated_at)"
                            + " values (?,?,?, now(), now(), now()) returning id",
                    Long.class, e.getValue()[0], e.getValue()[1], encoder.encode("password"));
            jdbc.update("insert into public.model_has_roles(role_id, model_type, model_id) values (?,?,?)"
                    + " on conflict do nothing", roleId, MODEL_TYPE, userId);
            created++;
        }
        if (created > 0) {
            log.info("user-role coverage: created {} demo accounts so every SRS role has a user", created);
        }
    }

    private boolean roleHasUser(long roleId) {
        Long n = jdbc.queryForObject(
                "select count(*) from public.model_has_roles where role_id = ?", Long.class, roleId);
        return n != null && n > 0;
    }

    private boolean emailTaken(String email) {
        Long n = jdbc.queryForObject(
                "select count(*) from public.users where lower(email) = lower(?)", Long.class, email);
        return n != null && n > 0;
    }

    private Long roleId(String name) {
        List<Long> ids = jdbc.queryForList("select id from public.roles where name = ?", Long.class, name);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /** Legacy seeder inserted users with explicit ids without bumping the sequence — advance it. */
    private void healUsersSeq() {
        jdbc.queryForList("select setval(pg_get_serial_sequence('public.users','id'), m)"
                + " from (select max(id) m from public.users) s where m is not null");
    }
}
