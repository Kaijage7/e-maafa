package tz.go.pmo.dmis.common.security;

import static org.junit.jupiter.api.Assertions.assertEquals;

import jakarta.servlet.ServletException;
import java.io.IOException;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

/**
 * Unit proof of the public-portal write throttle. A controllable clock keeps the fixed window
 * deterministic (no sleeping, no Spring context). The most important assertion is that GET reads —
 * which the public site polls heavily — are never throttled.
 */
class PortalWriteRateLimitFilterTest {

    private final AtomicLong now = new AtomicLong(1_000_000L);

    private PortalWriteRateLimitFilter filter(boolean enabled, int maxAttempts, long windowSeconds) {
        return new PortalWriteRateLimitFilter(enabled, maxAttempts, windowSeconds, now::get);
    }

    private int statusOf(PortalWriteRateLimitFilter filter, String method, String uri, String ip)
            throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }

    @Test
    void throttlesPortalWritesBeyondTheLimit() throws Exception {
        PortalWriteRateLimitFilter filter = filter(true, 2, 60);
        String ip = "10.1.1.1";
        assertEquals(HttpStatus.OK.value(), statusOf(filter, "POST", "/v1/portal/report-hazard", ip));
        assertEquals(HttpStatus.OK.value(), statusOf(filter, "POST", "/v1/portal/report-hazard", ip));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), statusOf(filter, "POST", "/v1/portal/report-hazard", ip));
    }

    @Test
    void neverThrottlesPortalReads() throws Exception {
        PortalWriteRateLimitFilter filter = filter(true, 1, 60);
        // The landing page polls these constantly — they must always pass.
        for (int i = 0; i < 10; i++) {
            assertEquals(HttpStatus.OK.value(), statusOf(filter, "GET", "/v1/portal/landing", "8.8.8.8"));
        }
    }

    @Test
    void throttlesAllWriteMethodsOnPortal() throws Exception {
        for (String method : new String[] {"PUT", "PATCH", "DELETE"}) {
            PortalWriteRateLimitFilter filter = filter(true, 1, 60);
            String ip = "10.2.2.2";
            assertEquals(HttpStatus.OK.value(), statusOf(filter, method, "/v1/portal/subscribe", ip), method + " first");
            assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(),
                    statusOf(filter, method, "/v1/portal/subscribe", ip), method + " over limit");
        }
    }

    @Test
    void neverThrottlesNonPortalWrites() throws Exception {
        PortalWriteRateLimitFilter filter = filter(true, 1, 60);
        for (int i = 0; i < 5; i++) {
            assertEquals(HttpStatus.OK.value(), statusOf(filter, "POST", "/v1/settings/users", "9.9.9.9"));
        }
    }

    @Test
    void tracksEachClientIpIndependently() throws Exception {
        PortalWriteRateLimitFilter filter = filter(true, 1, 60);
        assertEquals(HttpStatus.OK.value(), statusOf(filter, "POST", "/v1/portal/subscribe", "1.1.1.1"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), statusOf(filter, "POST", "/v1/portal/subscribe", "1.1.1.1"));
        assertEquals(HttpStatus.OK.value(), statusOf(filter, "POST", "/v1/portal/subscribe", "2.2.2.2"));
    }

    @Test
    void disabledFilterNeverThrottles() throws Exception {
        PortalWriteRateLimitFilter filter = filter(false, 1, 60);
        for (int i = 0; i < 5; i++) {
            assertEquals(HttpStatus.OK.value(), statusOf(filter, "POST", "/v1/portal/subscribe", "4.4.4.4"));
        }
    }
}
