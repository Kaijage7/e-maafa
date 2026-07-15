package tz.go.pmo.dmis.local;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

class LocalTestPasswordSeederTest {

    @Test
    void resetsEveryIncidentFlowRoleOnlyThroughTheLocalSeeder() {
        RecordingJdbcTemplate jdbc = new RecordingJdbcTemplate();

        new LocalTestPasswordSeeder(jdbc).run();

        assertThat(jdbc.updateSql)
                .contains("public.model_has_roles")
                .contains("'Dist DC'")
                .contains("'Reg DC'")
                .contains("'EOCC'")
                .contains("'Secretary'");
        assertThat(jdbc.encodedPassword).isNotNull();
        assertThat(new BCryptPasswordEncoder().matches(
                LocalTestCredentials.PASSWORD, jdbc.encodedPassword)).isTrue();
    }

    private static final class RecordingJdbcTemplate extends JdbcTemplate {
        private String updateSql;
        private String encodedPassword;

        @Override
        public int update(String sql, Object... args) {
            this.updateSql = sql;
            this.encodedPassword = (String) args[0];
            return 0;
        }

        @Override
        public <T> List<T> queryForList(String sql, Class<T> elementType) {
            return List.of();
        }
    }
}
