package tz.go.pmo.dmis.common.security;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import tz.go.pmo.dmis.graphql.PersistedOperationRegistry;

class GraphQlRequestSizeFilterTest {

    @Test
    void preservesAnAllowedBodyForTheGraphQlHandler() throws Exception {
        GraphQlRequestSizeFilter filter = GraphQlRequestSizeFilter.forTests(1024);
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
        GraphQlRequestSizeFilter filter = GraphQlRequestSizeFilter.forTests(1024);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        // Oversized body that still looks like a single object so shape validation is not the rejector.
        byte[] oversized = ("{\"q\":\"" + "x".repeat(1020) + "\"}").getBytes(StandardCharsets.UTF_8);
        org.junit.jupiter.api.Assertions.assertTrue(oversized.length > 1024);
        filter.doFilter(request("/api/graphql", oversized), response, chain);

        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE.value(), response.getStatus());
        assertEquals(null, chain.getRequest());
    }

    @Test
    void rejectsHttpBatchArraysWithBadRequestInsteadOfInternalError() throws Exception {
        GraphQlRequestSizeFilter filter = GraphQlRequestSizeFilter.forTests(1024);
        byte[] body = "[{\"query\":\"{ mobileHome { syncCursor } }\"}]".getBytes(StandardCharsets.UTF_8);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request("/api/graphql", body), response, chain);

        assertEquals(HttpStatus.BAD_REQUEST.value(), response.getStatus());
        org.junit.jupiter.api.Assertions.assertTrue(
                response.getContentAsString().contains("batch_not_supported"));
        assertEquals(null, chain.getRequest());
    }

    @Test
    void rejectsEmptyAndNonObjectBodies() throws Exception {
        GraphQlRequestSizeFilter filter = GraphQlRequestSizeFilter.forTests(1024);

        MockHttpServletResponse emptyResponse = new MockHttpServletResponse();
        filter.doFilter(request("/api/graphql", new byte[0]), emptyResponse, new MockFilterChain());
        assertEquals(HttpStatus.BAD_REQUEST.value(), emptyResponse.getStatus());
        org.junit.jupiter.api.Assertions.assertTrue(emptyResponse.getContentAsString().contains("empty_body"));

        MockHttpServletResponse badResponse = new MockHttpServletResponse();
        filter.doFilter(request("/api/graphql", "\"query\"".getBytes(StandardCharsets.UTF_8)),
                badResponse, new MockFilterChain());
        assertEquals(HttpStatus.BAD_REQUEST.value(), badResponse.getStatus());
        org.junit.jupiter.api.Assertions.assertTrue(
                badResponse.getContentAsString().contains("invalid_json_shape"));
    }

    @Test
    void expandsApolloPersistedQueryHashIntoRegisteredDocument() throws Exception {
        PersistedOperationRegistry registry = new PersistedOperationRegistry(new ObjectMapper());
        registry.load();
        String hash = registry.registeredDocuments().keySet().iterator().next();
        String expected = registry.registeredDocuments().get(hash);
        GraphQlRequestSizeFilter filter = new GraphQlRequestSizeFilter(65536, new ObjectMapper(), registry);
        byte[] body = ("{\"extensions\":{\"persistedQuery\":{\"version\":1,\"sha256Hash\":\""
                + hash + "\"}}}").getBytes(StandardCharsets.UTF_8);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();

        filter.doFilter(request("/api/graphql", body), response, chain);

        assertEquals(HttpStatus.OK.value(), response.getStatus());
        JsonNode rewritten = new ObjectMapper().readTree(chain.getRequest().getInputStream().readAllBytes());
        assertEquals(expected, rewritten.path("query").asText());
    }

    @Test
    void doesNotConsumeBodiesForRestEndpoints() throws Exception {
        GraphQlRequestSizeFilter filter = GraphQlRequestSizeFilter.forTests(1024);
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
