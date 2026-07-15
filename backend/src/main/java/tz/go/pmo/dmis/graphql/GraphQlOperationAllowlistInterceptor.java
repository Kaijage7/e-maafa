package tz.go.pmo.dmis.graphql;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import graphql.language.Document;
import graphql.language.Field;
import graphql.language.OperationDefinition;
import graphql.language.Selection;
import graphql.parser.InvalidSyntaxException;
import graphql.parser.Parser;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.graphql.server.WebGraphQlInterceptor;
import org.springframework.graphql.server.WebGraphQlRequest;
import org.springframework.graphql.server.WebGraphQlResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

/**
 * Enforces the product GraphQL surface:
 * <ul>
 *   <li>only reviewed root fields ({@code mobileHome}, {@code mobileSync}, {@code incidentWorkspace});</li>
 *   <li>optional Apollo persisted-query hash lookup; and</li>
 *   <li>optional strict mode where the document body must match a registered hash.</li>
 * </ul>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 15)
public class GraphQlOperationAllowlistInterceptor implements WebGraphQlInterceptor {

    public enum Mode {
        /** Root fields must be allowlisted; any selection set is fine. */
        ROOT_FIELDS,
        /** Document body SHA-256 must match a registered persisted operation. */
        DOCUMENT
    }

    private final boolean enabled;
    private final Mode mode;
    private final boolean requireNamedOperations;
    private final PersistedOperationRegistry registry;
    private final ObjectMapper json;
    private final Parser parser = new Parser();

    public GraphQlOperationAllowlistInterceptor(
            PersistedOperationRegistry registry,
            ObjectMapper json,
            @Value("${dmis.graphql.allowlist-enabled:true}") boolean enabled,
            @Value("${dmis.graphql.allowlist-mode:root-fields}") String mode,
            @Value("${dmis.graphql.require-named-operations:false}") boolean requireNamedOperations) {
        this.registry = registry;
        this.json = json;
        this.enabled = enabled;
        this.mode = parseMode(mode);
        this.requireNamedOperations = requireNamedOperations;
    }

    @Override
    public Mono<WebGraphQlResponse> intercept(WebGraphQlRequest request, Chain chain) {
        if (!enabled) {
            return chain.next(request);
        }
        try {
            String document = resolveDocument(request);
            if (document == null || document.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "GraphQL document is required (or a registered persistedQuery sha256Hash).");
            }
            if (mode == Mode.DOCUMENT && !registry.isRegisteredDocument(document)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "GraphQL document is not on the persisted-operation allowlist.");
            }
            validateRootFields(document);
            String original = request.getDocument();
            if (original != null && document.equals(original)) {
                return chain.next(request);
            }
            return chain.next(withDocument(request, document));
        } catch (ResponseStatusException ex) {
            return Mono.error(ex);
        } catch (InvalidSyntaxException syntax) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "GraphQL document has invalid syntax.", syntax));
        }
    }

    private String resolveDocument(WebGraphQlRequest request) {
        String document = request.getDocument();
        if (document != null && !document.isBlank()) {
            return document;
        }
        String hash = persistedQueryHash(request.getExtensions());
        if (hash == null) {
            return document;
        }
        return registry.documentForHash(hash).orElse(null);
    }

    private String persistedQueryHash(Map<String, Object> extensions) {
        if (extensions == null || extensions.isEmpty()) {
            return null;
        }
        Object persisted = extensions.get("persistedQuery");
        if (persisted instanceof Map<?, ?> pq) {
            Object hash = pq.get("sha256Hash");
            return hash == null ? null : hash.toString();
        }
        try {
            JsonNode node = json.valueToTree(extensions).path("persistedQuery").path("sha256Hash");
            return node.isTextual() ? node.asText() : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static WebGraphQlRequest withDocument(WebGraphQlRequest source, String document) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("query", document);
        if (source.getOperationName() != null) {
            body.put("operationName", source.getOperationName());
        }
        if (source.getVariables() != null) {
            body.put("variables", source.getVariables());
        }
        if (source.getExtensions() != null) {
            body.put("extensions", source.getExtensions());
        }
        return new WebGraphQlRequest(
                source.getUri().toUri(),
                source.getHeaders(),
                source.getCookies(),
                source.getRemoteAddress(),
                source.getAttributes(),
                body,
                source.getId(),
                source.getLocale());
    }

    private void validateRootFields(String document) {
        Document parsed = parser.parseDocument(document);
        Set<String> roots = new LinkedHashSet<>();
        boolean sawNamed = false;
        boolean sawAnonymous = false;
        for (var def : parsed.getDefinitions()) {
            if (!(def instanceof OperationDefinition op)) {
                continue;
            }
            if (op.getName() != null && !op.getName().isBlank()) {
                sawNamed = true;
            } else {
                sawAnonymous = true;
            }
            if (op.getOperation() == OperationDefinition.Operation.MUTATION) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "GraphQL mutations are not supported on this surface.");
            }
            for (Selection<?> selection : op.getSelectionSet().getSelections()) {
                if (selection instanceof Field field) {
                    roots.add(field.getName());
                }
            }
        }
        if (roots.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "GraphQL operation must select at least one root field.");
        }
        for (String root : roots) {
            if (!PersistedOperationRegistry.ALLOWED_ROOT_FIELDS.contains(root)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "GraphQL root field is not allowlisted: " + root);
            }
        }
        if (requireNamedOperations && (sawAnonymous || !sawNamed)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Named GraphQL operations are required on this surface.");
        }
    }

    private static Mode parseMode(String mode) {
        if (mode == null || mode.isBlank()) {
            return Mode.ROOT_FIELDS;
        }
        return switch (mode.trim().toLowerCase(Locale.ROOT)) {
            case "document", "documents", "strict" -> Mode.DOCUMENT;
            case "root-fields", "root_fields", "fields" -> Mode.ROOT_FIELDS;
            default -> throw new IllegalArgumentException(
                    "dmis.graphql.allowlist-mode must be root-fields or document");
        };
    }
}
