package tz.go.pmo.dmis.service.impl;

import static org.junit.jupiter.api.Assertions.assertThrows;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import tz.go.pmo.dmis.mitigation.RegionDataBuilder;

/**
 * Empty datasets are valid; database failures are not. These tests prevent mitigation/GIS read models
 * from converting an outage or bad query into believable zero counts and empty maps.
 */
class ReadModelFailurePropagationTest {

    @Test
    void mitigationDashboardPropagatesDatabaseFailureInsteadOfReturningFakeZeros() {
        MitigationDashboardServiceImpl service = new MitigationDashboardServiceImpl(
                new FailingJdbcTemplate(), null);

        assertThrows(DataAccessResourceFailureException.class, service::index);
    }

    @Test
    void gisMapPropagatesDatabaseFailureInsteadOfReturningAnEmptyOperationalMap() {
        GisMapServiceImpl service = new GisMapServiceImpl(new FailingJdbcTemplate(), null, null);

        assertThrows(DataAccessResourceFailureException.class, service::index);
    }

    @Test
    void regionBuilderPropagatesDatabaseFailureInsteadOfReturningAnEmptyChoropleth() {
        RegionDataBuilder builder = new RegionDataBuilder(new FailingJdbcTemplate(), new ObjectMapper());

        assertThrows(DataAccessResourceFailureException.class, builder::build);
    }

    /** No mocking agent or database: the JDBC seam deterministically models an unavailable datasource. */
    private static final class FailingJdbcTemplate extends JdbcTemplate {
        @Override
        public <T> T queryForObject(String sql, Class<T> requiredType) {
            throw failure();
        }

        @Override
        public List<Map<String, Object>> queryForList(String sql) {
            throw failure();
        }

        @Override
        public List<Map<String, Object>> queryForList(String sql, Object... args) {
            throw failure();
        }

        private static DataAccessResourceFailureException failure() {
            return new DataAccessResourceFailureException("database unavailable");
        }
    }
}
