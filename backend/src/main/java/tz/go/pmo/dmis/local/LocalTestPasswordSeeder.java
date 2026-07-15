package tz.go.pmo.dmis.local;

import java.util.List;
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
 * Local-profile only: apply the constant test password {@link LocalTestCredentials#PASSWORD}
 * to known demo / seeded accounts so every tester signs in the same way.
 *
 * <p>Does <b>not</b> run under {@code prod}. Clears {@code must_change_password} on those
 * accounts so local login is not blocked by V196 cutover hygiene (that migration is for
 * production-bound dumps).
 */
@Component
@Profile("local")
@Order(1000)
@RequiredArgsConstructor
public class LocalTestPasswordSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(LocalTestPasswordSeeder.class);

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @Override
    public void run(String... args) {
        String hash = encoder.encode(LocalTestCredentials.PASSWORD);
        // Known local / demo identities + common local seed patterns.
        int n = jdbc.update("""
                update public.users
                   set password = ?,
                       must_change_password = false,
                       updated_at = now()
                 where lower(email) in (
                         'admin@example.com',
                         'eocc@pmo.go.tz',
                         'director@pmo.go.tz',
                         'dc@test.com',
                         'tma@meteo.go.tz',
                         'ded.dodoma@example.dev',
                         'rc.dodoma@example.dev',
                         'samwelherman85@gmail.com'
                       )
                    or email ilike '%@example.com'
                    or email ilike '%@example.dev'
                    or email ilike '%@test.com'
                    or coalesce(seeded_officer, false) = true
                    or exists (
                        select 1
                          from public.model_has_roles mhr
                          join public.roles role on role.id = mhr.role_id
                         where mhr.model_id = users.id
                           and mhr.model_type = 'App\\Models\\User'
                           and role.name in (
                               'Dist DC', 'DED', 'DAS', 'District Commissioner',
                               'District Planning Officer', 'District Logistic Officer',
                               'Reg DC', 'RAS', 'RC',
                               'Regional Planning Officer', 'Regional Logistic Officer',
                               'EOCC', 'Director', 'Secretary'
                           )
                    )
                """, hash);
        log.warn("LOCAL TEST CREDENTIALS: set password on {} account(s) to the constant "
                        + "local test password (see docs/LOCAL-TEST-PASSWORD.md). "
                        + "NEVER deploy spring.profiles.active=local to a public edge.",
                n);
        List<String> sample = jdbc.queryForList("""
                select email from public.users
                 where lower(email) in ('admin@example.com','eocc@pmo.go.tz','dc@test.com')
                 order by email
                """, String.class);
        if (!sample.isEmpty()) {
            log.info("LOCAL login sample: {} / (constant local test password)", sample.get(0));
        }
    }
}
