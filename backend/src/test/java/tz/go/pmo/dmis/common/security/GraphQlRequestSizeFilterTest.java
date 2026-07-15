package tz.go.pmo.dmis.common.security;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class GraphQlRequestSizeFilterTest {

    @Test
    void preservesAnAllowedBodyForTheGraphQlHandler() throws Exception {
        GraphQlRequestSizeFilter filter = new GraphQlRequestSizeFilter(1024);
        byte[] body = "{\"query\":\"query MobileHome { mobileHome { generatedAt } }\"}"
                .getBytes(StandardCharsets.UTF_8);
        MockHttpServletRequest request = request("/api/graphql", body);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(HttpStatus.OK.value(), response.getStatus());
        assertArrayEquals(body, chain.getRequest().getInputStream().readAllBytes());
    }

    @Test
    void rejectsAnOversizedGraphQlBodyBeforeTheHandler() throws Exception {
        GraphQlRequestSizeFilter filter = new GraphQlRequestSizeFilter(1024);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request("/api/graphql", new byte[1025]), response, chain);

        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE.value(), response.getStatus());
        assertEquals(null, chain.getRequest());
    }

    @Test
    void doesNotConsumeBodiesForRestEndpoints() throws Exception {
        GraphQlRequestSizeFilter filter = new GraphQlRequestSizeFilter(1024);
        byte[] body = new byte[1025];
        MockHttpServletRequest request = request("/api/v1/auth/login", body);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request, response, chain);

        assertEquals(HttpStatus.OK.value(), response.getStatus());
        assertArrayEquals(body, chain.getRequest().getInputStream().readAllBytes());
    }

    private static MockHttpServletRequest request(String uri, byte[] body) {
        MockHttpServletRequest request = new MockHttpServletRequest("POST", uri);
        request.setContextPath("/api");
        request.setContentType("application/json");
        request.setContent(body);
        return request;
    }
}
