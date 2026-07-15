package tz.go.pmo.dmis.graphql;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Collections;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * Loads the reviewed mobile/web GraphQL documents and their SHA-256 digests for allowlisting and
 * Apollo-style persisted-query lookup.
 */
@Component
public class PersistedOperationRegistry {

    private static final Logger log = LoggerFactory.getLogger(PersistedOperationRegistry.class);

    /** Root fields this product intentionally exposes on GraphQL. */
    public static final Set<String> ALLOWED_ROOT_FIELDS = Set.of(
            "mobileHome", "mobileSync", "incidentWorkspace");

    private final ObjectMapper json;
    private final Map<String, String> documentByHash = new LinkedHashMap<>();
    private final Map<String, String> nameByHash = new LinkedHashMap<>();

    public PersistedOperationRegistry(ObjectMapper json) {
        this.json = json;
    }

    @PostConstruct
    public void load() {
        try (InputStream in = new ClassPathResource("graphql/persisted-operations.json").getInputStream()) {
            JsonNode root = json.readTree(in);
            JsonNode operations = root.path("operations");
            if (!operations.isArray()) {
                throw new IllegalStateException("graphql/persisted-operations.json must contain an operations array");
            }
            for (JsonNode op : operations) {
                String name = text(op, "name");
                String document = text(op, "document");
                if (name == null || document == null) {
                    throw new IllegalStateException("Each persisted operation requires name and document");
                }
                String normalized = normalizeDocument(document);
                String hash = sha256Hex(normalized);
                documentByHash.put(hash, normalized);
                nameByHash.put(hash, name);
            }
            log.info("Loaded {} GraphQL persisted operations for allowlist lookup", documentByHash.size());
        } catch (Exception e) {
            throw new IllegalStateException("Failed to load GraphQL persisted operations registry", e);
        }
    }

    public Optional<String> documentForHash(String sha256Hex) {
        if (sha256Hex == null || sha256Hex.isBlank()) {
            return Optional.empty();
        }
        return Optional.ofNullable(documentByHash.get(sha256Hex.trim().toLowerCase(Locale.ROOT)));
    }

    public boolean isRegisteredDocument(String document) {
        if (document == null || document.isBlank()) {
            return false;
        }
        return documentByHash.containsKey(sha256Hex(normalizeDocument(document)));
    }

    public Map<String, String> registeredDocuments() {
        return Collections.unmodifiableMap(documentByHash);
    }

    public static String normalizeDocument(String document) {
        return document.trim().replaceAll("\\s+", " ");
    }

    public static String sha256Hex(String normalizedDocument) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(normalizedDocument.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull()) {
            return null;
        }
        String text = value.asText();
        return text == null || text.isBlank() ? null : text.trim();
    }
}
