package tz.go.pmo.dmis.graphql;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.graphql.server.WebGraphQlInterceptor;
import org.springframework.graphql.server.WebGraphQlRequest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

class GraphQlOperationAllowlistInterceptorTest {

    private PersistedOperationRegistry registry;
    private GraphQlOperationAllowlistInterceptor rootFields;
    private GraphQlOperationAllowlistInterceptor documents;

    @BeforeEach
    void setUp() {
        registry = new PersistedOperationRegistry(new ObjectMapper());
        registry.load();
        rootFields = new GraphQlOperationAllowlistInterceptor(
                registry, new ObjectMapper(), true, "root-fields", false);
        documents = new GraphQlOperationAllowlistInterceptor(
                registry, new ObjectMapper(), true, "document", false);
    }

    @Test
    void allowsAllowlistedRootFieldQueries() {
        WebGraphQlRequest request = request("query { mobileHome { syncCursor } }", Map.of());
        AtomicReference<String> seen = new AtomicReference<>();
        rootFields.intercept(request, next -> {
            seen.set(next.getDocument());
            return Mono.empty();
        }).block();
        assertEquals("query { mobileHome { syncCursor } }", seen.get());
    }

    @Test
    void rejectsUnknownRootFields() {
        WebGraphQlRequest request = request("query { users { id } }", Map.of());
        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> rootFields.intercept(request, chainPassthrough()).block());
        assertEquals(HttpStatus.BAD_REQUEST, error.getStatusCode());
        assertTrue(error.getReason().contains("not allowlisted"));
    }

    @Test
    void documentModeAcceptsRegisteredDocumentsOnly() {
        String registered = registry.registeredDocuments().values().iterator().next();
        documents.intercept(request(registered, Map.of()), chainPassthrough()).block();

        ResponseStatusException error = assertThrows(ResponseStatusException.class,
                () -> documents.intercept(
                        request("query { mobileHome { syncCursor } }", Map.of()),
                        chainPassthrough()).block());
        assertTrue(error.getReason().contains("persisted-operation allowlist"));
    }

    @Test
    void registryMapsSha256ToRegisteredDocument() {
        String hash = registry.registeredDocuments().keySet().iterator().next();
        String expected = registry.registeredDocuments().get(hash);
        assertEquals(expected, registry.documentForHash(hash).orElseThrow());
    }

    private static WebGraphQlInterceptor.Chain chainPassthrough() {
        return request -> Mono.empty();
    }

    private static WebGraphQlRequest request(String document, Map<String, Object> extensions) {
        java.util.Map<String, Object> body = new java.util.LinkedHashMap<>();
        if (document != null) {
            body.put("query", document);
        }
        if (extensions != null && !extensions.isEmpty()) {
            body.put("extensions", extensions);
        }
        return new WebGraphQlRequest(
                java.net.URI.create("/graphql"),
                new HttpHeaders(),
                null,
                null,
                Map.of(),
                body,
                "test-id",
                null);
    }
}
