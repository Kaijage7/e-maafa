package tz.go.pmo.dmis.common.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import jakarta.servlet.ServletException;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * Unit proof of the login throttle. A controllable clock makes the fixed window deterministic,
 * so there is no sleeping and no Spring context / DB needed.
 */
class LoginRateLimitFilterTest {

    private final AtomicLong now = new AtomicLong(1_000_000L);

    private LoginRateLimitFilter filter(boolean enabled, int maxAttempts, long windowSeconds) {
        return new LoginRateLimitFilter(enabled, maxAttempts, windowSeconds, now::get);
    }

    private int statusOfLoginAttempt(LoginRateLimitFilter filter, String ip) throws ServletException, IOException {
        return statusOf(filter, "POST", LoginRateLimitFilter.LOGIN_PATH, ip);
    }

    private int statusOf(LoginRateLimitFilter filter, String method, String uri, String ip)
            throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }

    @Test
    void allowsUpToTheLimitThenBlocksWithRetryAfter() throws Exception {
        LoginRateLimitFilter filter = filter(true, 3, 60);
        String ip = "10.0.0.1";

        for (int i = 0; i < 3; i++) {
            assertEquals(HttpStatus.OK.value(), statusOfLoginAttempt(filter, ip), "attempt " + (i + 1) + " within limit");
        }

        MockHttpServletRequest request = new MockHttpServletRequest("POST", LoginRateLimitFilter.LOGIN_PATH);
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());

        assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), response.getStatus(), "the 4th attempt is throttled");
        String retryAfter = response.getHeader(HttpHeaders.RETRY_AFTER);
        assertNotNull(retryAfter, "a Retry-After header is set");
        long seconds = Long.parseLong(retryAfter);
        assertTrue(seconds >= 1 && seconds <= 60, "Retry-After is within the window: " + seconds);
    }

    @Test
    void tracksEachClientIpIndependently() throws Exception {
        LoginRateLimitFilter filter = filter(true, 1, 60);

        assertEquals(HttpStatus.OK.value(), statusOfLoginAttempt(filter, "1.1.1.1"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), statusOfLoginAttempt(filter, "1.1.1.1"));
        // A different IP has its own untouched budget.
        assertEquals(HttpStatus.OK.value(), statusOfLoginAttempt(filter, "2.2.2.2"));
    }

    @Test
    void resetsAfterTheWindowExpires() throws Exception {
        LoginRateLimitFilter filter = filter(true, 1, 60);
        String ip = "3.3.3.3";

        assertEquals(HttpStatus.OK.value(), statusOfLoginAttempt(filter, ip));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), statusOfLoginAttempt(filter, ip));

        now.addAndGet(60_000L); // advance past the window
        assertEquals(HttpStatus.OK.value(), statusOfLoginAttempt(filter, ip), "the budget refills after the window");
    }

    @Test
    void neverThrottlesNonLoginRequests() throws Exception {
        LoginRateLimitFilter filter = filter(true, 1, 60);
        for (int i = 0; i < 5; i++) {
            assertEquals(HttpStatus.OK.value(), statusOf(filter, "POST", "/v1/settings/users", "9.9.9.9"));
        }
        // A GET to the login path is not a login attempt either.
        for (int i = 0; i < 5; i++) {
            assertEquals(HttpStatus.OK.value(), statusOf(filter, "GET", LoginRateLimitFilter.LOGIN_PATH, "9.9.9.9"));
        }
    }

    @Test
    void disabledFilterNeverThrottles() throws Exception {
        LoginRateLimitFilter filter = filter(false, 1, 60);
        String ip = "4.4.4.4";
        for (int i = 0; i < 5; i++) {
            assertEquals(HttpStatus.OK.value(), statusOfLoginAttempt(filter, ip));
        }
    }
}
