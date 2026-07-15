package tz.go.pmo.dmis.common.security;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import tz.go.pmo.dmis.graphql.PersistedOperationRegistry;

/**
 * Stops oversized GraphQL documents and illegal request shapes before Spring GraphQL parses them.
 *
 * <p>Spring GraphQL deserializes a single {@code SerializableGraphQlRequest} object. A JSON array
 * (Apollo/HTTP batching) would otherwise throw {@code MismatchedInputException} and surface as a
 * generic 500. DMIS does not support multi-operation batching on the shared endpoint.</p>
 *
 * <p>When the client sends an Apollo persisted-query hash without a document body, this filter
 * injects the registered document so Spring GraphQL always receives a valid {@code query} field.</p>
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 5)
public class GraphQlRequestSizeFilter extends OncePerRequestFilter {

    private final int maxRequestBytes;
    private final ObjectMapper json;
    private final PersistedOperationRegistry registry;

    @Autowired
    public GraphQlRequestSizeFilter(
            @Value("${dmis.graphql.max-request-bytes:65536}") int maxRequestBytes,
            ObjectMapper json,
            PersistedOperationRegistry registry) {
        if (maxRequestBytes < 1024) {
            throw new IllegalArgumentException("dmis.graphql.max-request-bytes must be at least 1024");
        }
        this.maxRequestBytes = maxRequestBytes;
        this.json = json;
        this.registry = registry;
    }

    /** Test factory without Spring and without persisted-query expansion. */
    static GraphQlRequestSizeFilter forTests(int maxRequestBytes) {
        return new GraphQlRequestSizeFilter(maxRequestBytes, new ObjectMapper(), null);
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        if (!"POST".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String contextPath = request.getContextPath() == null ? "" : request.getContextPath();
        return !(contextPath + "/graphql").equals(request.getRequestURI());
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getContentLengthLong() > maxRequestBytes) {
            rejectTooLarge(response);
            return;
        }
        byte[] body = request.getInputStream().readNBytes(maxRequestBytes + 1);
        if (body.length > maxRequestBytes) {
            rejectTooLarge(response);
            return;
        }
        String shapeError = validateSingleObjectBody(body);
        if (shapeError != null) {
            rejectBadRequest(response, shapeError);
            return;
        }
        try {
            body = expandPersistedQuery(body);
        } catch (IOException parseError) {
            rejectBadRequest(response, "invalid_json_shape");
            return;
        }
        if (body.length > maxRequestBytes) {
            rejectTooLarge(response);
            return;
        }
        chain.doFilter(new CachedBodyRequest(request, body), response);
    }

    /**
     * @return null when the body is a single JSON object; otherwise a stable client error code
     */
    static String validateSingleObjectBody(byte[] body) {
        if (body == null || body.length == 0) {
            return "empty_body";
        }
        int i = 0;
        while (i < body.length) {
            byte b = body[i];
            if (b == ' ' || b == '\n' || b == '\r' || b == '\t') {
                i++;
                continue;
            }
            break;
        }
        if (i >= body.length) {
            return "empty_body";
        }
        byte first = body[i];
        if (first == '[') {
            return "batch_not_supported";
        }
        if (first != '{') {
            return "invalid_json_shape";
        }
        return null;
    }

    byte[] expandPersistedQuery(byte[] body) throws IOException {
        if (registry == null || body == null || body.length == 0) {
            return body;
        }
        JsonNode root = json.readTree(body);
        if (!(root instanceof ObjectNode object)) {
            return body;
        }
        JsonNode queryNode = object.get("query");
        boolean missingQuery = queryNode == null || queryNode.isNull()
                || !queryNode.isTextual() || queryNode.asText().isBlank();
        if (!missingQuery) {
            return body;
        }
        String hash = object.path("extensions").path("persistedQuery").path("sha256Hash").asText(null);
        if (hash == null || hash.isBlank()) {
            return body;
        }
        Optional<String> document = registry.documentForHash(hash);
        if (document.isEmpty()) {
            return body;
        }
        object.put("query", document.get());
        return json.writeValueAsBytes(object);
    }

    private static void rejectTooLarge(HttpServletResponse response) throws IOException {
        response.setStatus(HttpStatus.PAYLOAD_TOO_LARGE.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"error\":\"payload_too_large\",\"message\":\"GraphQL request is too large.\"}");
    }

    private static void rejectBadRequest(HttpServletResponse response, String error) throws IOException {
        response.setStatus(HttpStatus.BAD_REQUEST.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        String message = switch (error) {
            case "batch_not_supported" ->
                    "GraphQL HTTP batch arrays are not supported. Send one operation object per request.";
            case "empty_body" ->
                    "GraphQL request body is empty.";
            default ->
                    "GraphQL request must be a single JSON object with a query (or subscription) document.";
        };
        response.getWriter().write(
                "{\"error\":\"" + error + "\",\"message\":\"" + message + "\"}");
    }

    private static final class CachedBodyRequest extends HttpServletRequestWrapper {
        private final byte[] body;

        private CachedBodyRequest(HttpServletRequest request, byte[] body) {
            super(request);
            this.body = body;
        }

        @Override
        public int getContentLength() {
            return body.length;
        }

        @Override
        public long getContentLengthLong() {
            return body.length;
        }

        @Override
        public ServletInputStream getInputStream() {
            ByteArrayInputStream input = new ByteArrayInputStream(body);
            return new ServletInputStream() {
                @Override
                public int read() {
                    return input.read();
                }

                @Override
                public int read(byte[] bytes, int offset, int length) {
                    return input.read(bytes, offset, length);
                }

                @Override
                public boolean isFinished() {
                    return input.available() == 0;
                }

                @Override
                public boolean isReady() {
                    return true;
                }

                @Override
                public void setReadListener(ReadListener readListener) {
                    if (readListener == null) {
                        throw new IllegalArgumentException("readListener must not be null");
                    }
                    try {
                        if (isFinished()) {
                            readListener.onAllDataRead();
                        } else {
                            readListener.onDataAvailable();
                        }
                    } catch (IOException error) {
                        readListener.onError(error);
                    }
                }
            };
        }

        @Override
        public BufferedReader getReader() {
            String encoding = getCharacterEncoding();
            Charset charset = encoding == null ? StandardCharsets.UTF_8 : Charset.forName(encoding);
            return new BufferedReader(new InputStreamReader(getInputStream(), charset));
        }
    }
}
