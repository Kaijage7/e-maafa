package tz.go.pmo.dmis.ew;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Real M-Gov SMS gateway sender — faithful port of Laravel App\Services\BulkSmsService (the proven
 * national delivery path). Builds the {recipients,message,datetime,mobileServiceId,senderId,messageId}
 * payload, signs it HMAC-SHA256(base64) into the `hash` header with `sysId`, and POSTs to the M-Gov URL.
 * Credentials come from config (env): dmis.mgov.* — empty key/system-id ⇒ not configured ⇒ no send attempt.
 */
@Service
public class MgovSmsService {

    private static final Logger log = LoggerFactory.getLogger(MgovSmsService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    @Value("${dmis.mgov.url:https://mgov.gov.go.tz/gateway/sms/v2/send-sms}") private String url;
    @Value("${dmis.mgov.api-key:}") private String apiKey;
    @Value("${dmis.mgov.system-id:}") private String systemId;
    @Value("${dmis.mgov.mobile-service-id:}") private String mobileServiceId;
    @Value("${dmis.mgov.sender-id:15200}") private String senderId;

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    private final SmsAuditLogger audit;

    public MgovSmsService(SmsAuditLogger audit) {
        this.audit = audit;
    }

    public boolean isConfigured() {
        return apiKey != null && !apiKey.isBlank() && systemId != null && !systemId.isBlank();
    }

    public record SmsResult(boolean success, String message, String messageId, String response, List<String> formatted, List<String> invalid) {}

    /** Faithful BulkSmsService.sendBulk: format phones, single bulk request, return success + response. */
    public SmsResult sendBulk(List<String> recipients, String message) {
        List<String> formatted = new ArrayList<>(), invalid = new ArrayList<>();
        for (String r : recipients) {
            if (r == null || r.isBlank()) continue;
            String f = formatPhone(r);
            if (f != null) formatted.add(f); else invalid.add(r);
        }
        if (formatted.isEmpty()) return new SmsResult(false, "No valid phone numbers found", null, null, formatted, invalid);
        if (!isConfigured()) {
            return new SmsResult(false, "M-Gov gateway not configured (set dmis.mgov.api-key / system-id).", null, null, formatted, invalid);
        }
        String messageId = "bulk_msg_" + Long.toHexString(System.nanoTime());
        try {
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("recipients", String.join(",", formatted));
            data.put("message", message);
            data.put("datetime", LocalDateTime.now().format(DT));
            data.put("mobileServiceId", mobileServiceId);
            data.put("senderId", senderId);
            data.put("messageId", messageId);
            String payload = JSON.writeValueAsString(data);
            String hash = hmacBase64(apiKey, payload);

            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(30))
                .header("Content-Type", "application/json")
                .header("hash", hash)
                .header("sysId", systemId)
                .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                .build();
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            int code = resp.statusCode();
            String body = resp.body();
            log.info("M-Gov SMS {} → HTTP {} ({} recipients)", messageId, code, formatted.size());
            if (code >= 200 && code < 300) {
                JsonNode node = safeJson(body);
                boolean ok = node != null && node.path("success").asBoolean(false);
                if (ok) return new SmsResult(true, "Bulk SMS sent successfully", messageId, body, formatted, invalid);
                String sm = node != null ? node.path("statusMessage").asText("Unknown error") : ("Invalid response: " + body);
                return new SmsResult(false, "M-Gov Error: " + sm, messageId, body, formatted, invalid);
            }
            return new SmsResult(false, "HTTP Error " + code + ". Response: " + body, messageId, body, formatted, invalid);
        } catch (Exception e) {
            log.error("M-Gov SMS send failed", e);
            return new SmsResult(false, "Bulk SMS sending failed: " + e, messageId, null, formatted, invalid);
        }
    }

    /**
     * The tracked send path: transmit the bulk, then record one {@code sms_logs} row per recipient with the
     * real outcome. This is the single audit sink for every SMS the platform sends — callers pass their
     * {@code notificationType} (and optional {@code notificationId}) and rely on this, instead of each
     * inserting their own row. Logging failures are swallowed so a logging hiccup can never break a send
     * (required by the public unsubscribe path, whose send errors must stay silent).
     */
    public SmsResult sendBulk(List<String> recipients, String message, String notificationType, Long notificationId) {
        SmsResult r = sendBulk(recipients, message);
        try {
            audit.record(notificationType, notificationId, message, r.formatted(), r.invalid(),
                    r.success(), isConfigured(), r.messageId(), r.response(), r.success() ? null : r.message());
        } catch (Exception e) {
            log.error("sms_logs logging failed for type {}", notificationType, e);
        }
        return r;
    }

    /** Tracked send without an entity id. */
    public SmsResult sendBulk(List<String> recipients, String message, String notificationType) {
        return sendBulk(recipients, message, notificationType, null);
    }

    /** Tanzanian phone → 255XXXXXXXXX (matches Laravel formatPhoneNumber). */
    String formatPhone(String phone) {
        String p = phone.replaceAll("[\\s\\-+]", "");
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("^0?([67]\\d{8})$").matcher(p);
        if (m.matches()) return "255" + m.group(1);
        if (p.matches("^255[67]\\d{8}$")) return p;
        if (p.matches("^\\d{10,15}$")) return p;
        return null;
    }

    private static String hmacBase64(String key, String data) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return Base64.getEncoder().encodeToString(mac.doFinal(data.getBytes(StandardCharsets.UTF_8)));
    }

    private static JsonNode safeJson(String s) {
        try { return JSON.readTree(s); } catch (Exception e) { return null; }
    }
}
