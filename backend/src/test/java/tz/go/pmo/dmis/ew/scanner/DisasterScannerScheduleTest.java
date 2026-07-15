package tz.go.pmo.dmis.ew.scanner;

import static org.assertj.core.api.Assertions.assertThatCode;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;

class DisasterScannerScheduleTest {

    @Test
    void disabledScheduleReturnsWithoutScanningOrPersisting() {
        // No DataSource on purpose: any database work means the disabled guard failed.
        DisasterScannerService scanner = new DisasterScannerService(new JdbcTemplate());
        ReflectionTestUtils.setField(scanner, "scheduledEnabled", false);

        assertThatCode(scanner::scheduledSweep).doesNotThrowAnyException();
    }
}
