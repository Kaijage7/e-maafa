package tz.go.pmo.dmis.common.config;

import java.util.Arrays;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Non-local startup honesty checks. Never invents data or marks integrations live.
 * <ul>
 *   <li>Refuses to start if demo-like accounts still have no forced password change
 *       (unless {@code dmis.security.allow-demo-accounts-in-prod=true} — emergency only).</li>
 *   <li>Logs a clear warning if any integration_endpoints row is {@code live}
 *       (ops must dual-prove before that status).</li>
 * </ul>
 */
@Component
@Order(50)
public class ProductionHonestyStartup implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(ProductionHonestyStartup.class);

    private final Environment env;
    private final JdbcTemplate jdbc;
    private final boolean allowDemoInProd;

    public ProductionHonestyStartup(Environment env, JdbcTemplate jdbc,
                                    @Value("${dmis.security.allow-demo-accounts-in-prod:false}") boolean allowDemoInProd) {
        this.env = env;
        this.jdbc = jdbc;
        this.allowDemoInProd = allowDemoInProd;
    }

    @Override
    public void run(ApplicationArguments args) {
        boolean local = Arrays.stream(env.getActiveProfiles()).anyMatch(p -> "local".equalsIgnoreCase(p));
        if (local) {
            log.info("Honesty startup: local profile — demo seeders may exist; not a public edge.");
            return;
        }

        // Demo accounts without forced password rotation are a cutover hazard.
        try {
            Long demoOpen = jdbc.queryForObject("""
                    select count(*) from public.users
                    where coalesce(must_change_password, false) = false
                      and (
                        email ilike '%@example.com'
                        or email ilike '%@example.dev'
                        or email ilike '%@test.com'
                      )
                    """, Long.class);
            if (demoOpen != null && demoOpen > 0) {
                String msg = "Found " + demoOpen
                        + " demo-like user(s) without must_change_password on a non-local profile. "
                        + "Rotate/delete them, or set dmis.security.allow-demo-accounts-in-prod=true only as emergency.";
                if (!allowDemoInProd) {
                    throw new IllegalStateException(msg);
                }
                log.warn("HONESTY OVERRIDE: {}", msg);
            } else {
                log.info("Honesty startup: no open demo-like accounts without password force-change.");
            }
        } catch (IllegalStateException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Honesty startup: could not audit demo users: {}", e.getMessage());
        }

        // live integrations must never be silent — warn loudly (do not auto-downgrade without ops).
        try {
            List<Map<String, Object>> live = jdbc.queryForList("""
                    select system_code, display_name from public.integration_endpoints
                    where status = 'live' order by system_code
                    """);
            if (!live.isEmpty()) {
                log.warn("HONESTY: {} integration_endpoints marked live — confirm dual-proof: {}",
                        live.size(), live);
            } else {
                log.info("Honesty startup: no integration_endpoints marked live (correct until dual-proved).");
            }
        } catch (Exception e) {
            log.debug("Honesty startup: integration_endpoints not readable yet: {}", e.getMessage());
        }

        // Multi-node logout requires shared denylist table (V214).
        try {
            Boolean present = jdbc.queryForObject(
                    "select exists (select 1 from information_schema.tables "
                            + "where table_schema = 'platform' and table_name = 'jwt_denylist')",
                    Boolean.class);
            if (Boolean.TRUE.equals(present)) {
                log.info("Honesty startup: platform.jwt_denylist present (shared logout across nodes).");
            } else {
                log.warn("HONESTY: platform.jwt_denylist missing — multi-node logout is node-local only "
                        + "until Flyway V214 applies.");
            }
        } catch (Exception e) {
            log.debug("Honesty startup: could not verify jwt_denylist: {}", e.getMessage());
        }
    }
}

