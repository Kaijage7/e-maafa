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

class GraphQlRateLimitFilterTest {

    private final AtomicLong now = new AtomicLong(1_000_000L);

    @Test
    void throttlesOnlyGraphQlPostsAtTheConfiguredContextPath() throws Exception {
        GraphQlRateLimitFilter filter = new GraphQlRateLimitFilter(true, 2, 60, now::get);

        assertEquals(HttpStatus.OK.value(), status(filter, "POST", "/api/graphql", "/api"));
        assertEquals(HttpStatus.OK.value(), status(filter, "POST", "/api/graphql", "/api"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(), status(filter, "POST", "/api/graphql", "/api"));

        assertEquals(HttpStatus.OK.value(), status(filter, "GET", "/api/graphql", "/api"));
        assertEquals(HttpStatus.OK.value(), status(filter, "POST", "/api/v1/notifications", "/api"));
    }

    @Test
    void tracksClientAddressesIndependently() throws Exception {
        GraphQlRateLimitFilter filter = new GraphQlRateLimitFilter(true, 1, 60, now::get);

        assertEquals(HttpStatus.OK.value(), status(filter, "POST", "/api/graphql", "/api", "10.0.0.1"));
        assertEquals(HttpStatus.TOO_MANY_REQUESTS.value(),
                status(filter, "POST", "/api/graphql", "/api", "10.0.0.1"));
        assertEquals(HttpStatus.OK.value(), status(filter, "POST", "/api/graphql", "/api", "10.0.0.2"));
    }

    private int status(GraphQlRateLimitFilter filter, String method, String uri, String contextPath)
            throws ServletException, IOException {
        return status(filter, method, uri, contextPath, "10.0.0.1");
    }

    private int status(GraphQlRateLimitFilter filter, String method, String uri, String contextPath, String ip)
            throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setContextPath(contextPath);
        request.setRemoteAddr(ip);
        MockHttpServletResponse response = new MockHttpServletResponse();
        filter.doFilter(request, response, new MockFilterChain());
        return response.getStatus();
    }
}
