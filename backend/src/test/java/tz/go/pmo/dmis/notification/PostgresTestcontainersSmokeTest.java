package tz.go.pmo.dmis.notification;

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * F102 partial: proves hermetic Postgres via Testcontainers without the full Spring Boot context.
 * Full {@code @SpringBootTest} suite still needs either this pattern + Flyway bootstrap or a live
 * dev database — that broader migration is residual, not claimed done by this smoke.
 *
 * <p>Enable with {@code RUN_TESTCONTAINERS=true} so default {@code mvn test} stays fast/offline
 * when Docker is unavailable.
 */
@Testcontainers(disabledWithoutDocker = true)
@EnabledIfEnvironmentVariable(named = "RUN_TESTCONTAINERS", matches = "true")
class PostgresTestcontainersSmokeTest {

    @Container
    @SuppressWarnings("resource")
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("dmis_test")
            .withUsername("test")
            .withPassword("test");

    @Test
    void hermeticPostgresAcceptsQueries() throws Exception {
        assertThat(postgres.isRunning()).isTrue();
        try (Connection c = DriverManager.getConnection(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
             Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("select 1")) {
            assertThat(rs.next()).isTrue();
            assertThat(rs.getInt(1)).isEqualTo(1);
        }
    }
}
