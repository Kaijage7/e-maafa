package tz.go.pmo.dmis.common.security;

import java.nio.file.Files;
import java.nio.file.Path;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.MountableFile;

/**
 * F102: shared hermetic Postgres for Spring integration tests that must not depend on the
 * developer's manually started {@code localhost:5440} instance.
 *
 * <p>DMIS Flyway migrations assume a strangler {@code public} schema (see
 * {@code db/baseline/baseline.sql}). Empty Postgres fails at V25. This support class therefore
 * loads the project baseline into the container on first start, then lets Flyway apply V123+.
 *
 * <p>Docker Engine 29 requires docker-java API ≥1.40 — see {@code src/test/resources/docker-java.properties}.
 */
@Testcontainers(disabledWithoutDocker = true)
public abstract class HermeticPostgresSupport {

    @Container
    @SuppressWarnings("resource")
    protected static final PostgreSQLContainer<?> POSTGRES = createPostgres();

    private static PostgreSQLContainer<?> createPostgres() {
        PostgreSQLContainer<?> c = new PostgreSQLContainer<>("postgres:16-alpine")
                .withDatabaseName("dmis_it")
                .withUsername("dmis_it")
                .withPassword("dmis_it");
        Path baseline = resolveBaseline();
        if (baseline != null) {
            c.withCopyFileToContainer(
                    MountableFile.forHostPath(baseline.toString()),
                    "/docker-entrypoint-initdb.d/01-baseline.sql");
        }
        return c;
    }

    /** Prefer backend-cwd ../db/baseline, then repo-root db/baseline. */
    private static Path resolveBaseline() {
        Path[] candidates = {
                Path.of("..", "db", "baseline", "baseline.sql").toAbsolutePath().normalize(),
                Path.of("db", "baseline", "baseline.sql").toAbsolutePath().normalize(),
                Path.of("dmis-platform", "db", "baseline", "baseline.sql").toAbsolutePath().normalize(),
        };
        for (Path p : candidates) {
            if (Files.isRegularFile(p)) {
                return p;
            }
        }
        return null;
    }

    @DynamicPropertySource
    static void datasourceProps(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        // Fail fast if container died rather than retrying Hikari for minutes.
        registry.add("spring.datasource.hikari.connection-timeout", () -> "5000");
        registry.add("spring.datasource.hikari.maximum-pool-size", () -> "4");
        // Baseline already records Flyway history through V122.
        registry.add("spring.flyway.baseline-on-migrate", () -> "true");
    }
}
