package tz.go.pmo.dmis.common.idempotency;

import java.io.DataOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.security.DigestOutputStream;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;

/**
 * Durable idempotency for retryable authenticated commands.
 *
 * <p>The claim and completed response join the caller's transaction. Consequently, a failed domain
 * transaction leaves no successful idempotency record, while a committed retry receives the exact
 * first JSON body. Keys are scoped to the real numeric JWT subject and operation, preventing one
 * user from probing or replaying another user's response.</p>
 */
@Service
public class ApiIdempotencyService {

    private static final Pattern KEY = Pattern.compile("^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$");
    private static final Pattern OPERATION = Pattern.compile("^[a-z0-9][a-z0-9._-]{2,99}$");
    private static final Pattern SHA256 = Pattern.compile("^[0-9a-f]{64}$");
    private static final TypeReference<Map<String, Object>> RESPONSE_TYPE = new TypeReference<>() { };

    private final JdbcTemplate jdbc;
    private final CurrentUserResolver currentUser;
    private final ObjectMapper objectMapper;
    private final Duration retention;
    private final int cleanupBatchSize;

    public ApiIdempotencyService(JdbcTemplate jdbc,
                                 CurrentUserResolver currentUser,
                                 ObjectMapper objectMapper,
                                 @Value("${dmis.idempotency.retention:90d}") Duration retention,
                                 @Value("${dmis.idempotency.cleanup-batch-size:10000}") int cleanupBatchSize) {
        if (retention == null || retention.isZero() || retention.isNegative()) {
            throw new IllegalArgumentException("dmis.idempotency.retention must be positive");
        }
        if (cleanupBatchSize < 1 || cleanupBatchSize > 100_000) {
            throw new IllegalArgumentException("dmis.idempotency.cleanup-batch-size must be between 1 and 100000");
        }
        this.jdbc = jdbc;
        this.currentUser = currentUser;
        this.objectMapper = objectMapper;
        this.retention = retention;
        this.cleanupBatchSize = cleanupBatchSize;
    }

    /** State returned to a command handler after atomically claiming or finding a key. */
    public record Claim(boolean enabled, boolean replay, long actorUserId, String operation,
                        String key, Map<String, Object> response) {
        private static Claim disabled() {
            return new Claim(false, false, -1, "", "", null);
        }
    }

    /**
     * Claim a key inside the command transaction, or return its previously committed response.
     * The header remains optional for legacy REST clients; mobile and current web clients must send it.
     */
    @Transactional
    public Claim claim(String rawKey, String operation, String requestFingerprint) {
        if (rawKey == null || rawKey.isBlank()) {
            return Claim.disabled();
        }
        String key = normalizeKey(rawKey);
        requireServerOperation(operation);
        if (!SHA256.matcher(requestFingerprint == null ? "" : requestFingerprint).matches()) {
            throw new IllegalArgumentException("request fingerprint must be lowercase SHA-256");
        }
        Long actor = currentUser.currentUserDbId();
        if (actor == null || actor <= 0) {
            throw new AccessDeniedException("A platform user identity is required for an idempotent command.");
        }

        // An expired key may be reused only after its prior response is outside the published window.
        jdbc.update("""
                delete from platform.api_idempotency_keys
                 where actor_user_id = ? and operation = ? and idempotency_key = ? and expires_at <= now()
                """, actor, operation, key);

        int inserted = jdbc.update("""
                insert into platform.api_idempotency_keys(
                    actor_user_id, operation, idempotency_key, request_fingerprint, expires_at)
                values (?,?,?,?,?)
                on conflict (actor_user_id, operation, idempotency_key) do nothing
                """, actor, operation, key, requestFingerprint,
                Timestamp.from(Instant.now().plus(retention)));
        if (inserted == 1) {
            return new Claim(true, false, actor, operation, key, null);
        }

        List<Map<String, Object>> rows = jdbc.queryForList("""
                select request_fingerprint, response_body, completed_at
                  from platform.api_idempotency_keys
                 where actor_user_id = ? and operation = ? and idempotency_key = ?
                """, actor, operation, key);
        if (rows.isEmpty() || rows.getFirst().get("completed_at") == null
                || rows.getFirst().get("response_body") == null) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "A request with this Idempotency-Key is still being processed; retry later.");
        }
        Map<String, Object> row = rows.getFirst();
        if (!requestFingerprint.equals(String.valueOf(row.get("request_fingerprint")))) {
            throw new BusinessRuleException(
                    "This Idempotency-Key was already used with a different incident payload. Generate a new key.");
        }
        jdbc.update("""
                update platform.api_idempotency_keys
                   set replay_count = replay_count + 1, last_replayed_at = now()
                 where actor_user_id = ? and operation = ? and idempotency_key = ?
                """, actor, operation, key);
        try {
            Map<String, Object> response = objectMapper.readValue(
                    String.valueOf(row.get("response_body")), RESPONSE_TYPE);
            return new Claim(true, true, actor, operation, key, response);
        } catch (IOException malformedStoredResponse) {
            throw new IllegalStateException("Stored idempotency response is unreadable", malformedStoredResponse);
        }
    }

    /** Store the first response in the same transaction as the command effect. */
    @Transactional
    public void complete(Claim claim, Map<String, Object> response) {
        if (claim == null || !claim.enabled() || claim.replay()) {
            return;
        }
        try {
            String json = objectMapper.writeValueAsString(response);
            int updated = jdbc.update("""
                    update platform.api_idempotency_keys
                       set response_body = ?::jsonb, completed_at = now()
                     where actor_user_id = ? and operation = ? and idempotency_key = ?
                       and completed_at is null
                    """, json, claim.actorUserId(), claim.operation(), claim.key());
            if (updated != 1) {
                throw new IllegalStateException("Idempotency claim was not completed exactly once");
            }
        } catch (com.fasterxml.jackson.core.JsonProcessingException serializationFailure) {
            throw new IllegalStateException("Command response could not be serialized", serializationFailure);
        }
    }

    /** Bounded cleanup; SKIP LOCKED lets multiple application instances safely share the work. */
    @Scheduled(cron = "${dmis.idempotency.cleanup-cron:0 17 * * * *}")
    @Transactional
    public void purgeExpired() {
        jdbc.update("""
                with expired as (
                    select actor_user_id, operation, idempotency_key
                      from platform.api_idempotency_keys
                     where expires_at <= now()
                     order by expires_at
                     for update skip locked
                     limit ?
                )
                delete from platform.api_idempotency_keys stored
                 using expired
                 where stored.actor_user_id = expired.actor_user_id
                   and stored.operation = expired.operation
                   and stored.idempotency_key = expired.idempotency_key
                """, cleanupBatchSize);
    }

    /**
     * Fingerprint the logical incident-create payload, including every uploaded byte. Map order is
     * canonicalized; list and photo order are retained because they can affect stored presentation.
     */
    public String fingerprintIncidentCreate(Map<String, String> form,
                                            List<String> infrastructureDamage,
                                            List<String> emergencyNeeds,
                                            List<MultipartFile> photos,
                                            MultipartFile video) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (DigestOutputStream digestOut = new DigestOutputStream(OutputStream.nullOutputStream(), digest);
                 DataOutputStream out = new DataOutputStream(digestOut)) {
                writeString(out, "incident.create.v1");
                List<Map.Entry<String, String>> entries = new ArrayList<>(form.entrySet());
                entries.sort(Comparator.comparing(Map.Entry::getKey));
                out.writeInt(entries.size());
                for (Map.Entry<String, String> entry : entries) {
                    writeString(out, entry.getKey());
                    writeString(out, entry.getValue());
                }
                writeStrings(out, infrastructureDamage);
                writeStrings(out, emergencyNeeds);
                List<MultipartFile> nonEmptyPhotos = photos == null ? List.of()
                        : photos.stream().filter(f -> f != null && !f.isEmpty()).toList();
                out.writeInt(nonEmptyPhotos.size());
                for (MultipartFile photo : nonEmptyPhotos) {
                    writeFile(out, photo);
                }
                if (video == null || video.isEmpty()) {
                    out.writeBoolean(false);
                } else {
                    out.writeBoolean(true);
                    writeFile(out, video);
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (IOException unreadableUpload) {
            throw new BusinessRuleException("An uploaded incident file could not be read. Select the file again and retry.");
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException("SHA-256 is unavailable", unavailable);
        }
    }

    private static String normalizeKey(String raw) {
        String key = raw.trim();
        // The IETF work-in-progress defines a Structured Field string (quoted); accept the widely
        // deployed unquoted form too so native HTTP libraries do not need special header encoding.
        if (key.length() >= 2 && key.startsWith("\"") && key.endsWith("\"")) {
            key = key.substring(1, key.length() - 1);
        }
        if (!KEY.matcher(key).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Idempotency-Key must be 16-128 characters using letters, digits, dot, colon, underscore or hyphen.");
        }
        return key;
    }

    private static void requireServerOperation(String operation) {
        if (operation == null || !OPERATION.matcher(operation).matches()) {
            throw new IllegalArgumentException("invalid server idempotency operation");
        }
    }

    private static void writeStrings(DataOutputStream out, List<String> values) throws IOException {
        List<String> safe = values == null ? List.of() : values;
        out.writeInt(safe.size());
        for (String value : safe) {
            writeString(out, value);
        }
    }

    private static void writeString(DataOutputStream out, String value) throws IOException {
        if (value == null) {
            out.writeInt(-1);
            return;
        }
        byte[] bytes = value.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        out.writeInt(bytes.length);
        out.write(bytes);
    }

    private static void writeFile(DataOutputStream out, MultipartFile file) throws IOException {
        // Both values influence the stored attachment path/metadata, so they are part of the logical
        // request in addition to every byte. A retry with renamed or retyped evidence is not identical.
        writeString(out, file.getOriginalFilename());
        writeString(out, file.getContentType());
        out.writeLong(file.getSize());
        try (InputStream input = file.getInputStream()) {
            input.transferTo(out);
        }
    }
}
