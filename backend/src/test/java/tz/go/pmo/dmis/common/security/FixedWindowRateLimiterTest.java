package tz.go.pmo.dmis.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class FixedWindowRateLimiterTest {

    @Test
    void distinctAddressTableFailsClosedAtCapacityAndRecoversAfterExpiry() {
        FixedWindowRateLimiter limiter = new FixedWindowRateLimiter(2, 60_000L);

        for (int i = 0; i < 50_000; i++) {
            assertThat(limiter.retryAfterSeconds("198.51.100." + i, 1_000L)).isZero();
        }

        assertThat(limiter.retryAfterSeconds("203.0.113.1", 1_000L)).isEqualTo(60L);
        // A known address retains its bucket and normal request allowance at table capacity.
        assertThat(limiter.retryAfterSeconds("198.51.100.1", 1_000L)).isZero();

        // Once the old window expires, opportunistic cleanup admits a new source again.
        assertThat(limiter.retryAfterSeconds("203.0.113.1", 61_001L)).isZero();
    }
}
