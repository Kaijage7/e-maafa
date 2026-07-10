package tz.go.pmo.dmis.notification;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * F59/F60: inbound delivery-status webhook for the M-Gov SMS gateway (and compatible payloads).
 * <p>Public path (no JWT) — gated by shared secret
 * {@code dmis.mgov.dlr-secret} via header {@code X-MGov-Dlr-Secret} or body field {@code secret}.
 * <ul>
 *   <li><b>local</b> profile: empty secret allowed (dev wiring)</li>
 *   <li><b>any other profile (incl. prod)</b>: empty secret → 503 (endpoint not configured);
 *       wrong secret → 401</li>
 * </ul>
 * Payload is flexible — M-Gov DLR field names vary by gateway version:
 * messageId / message_id / external_id, status / deliveryStatus, msisdn / phone / recipient.
 */
@RestController
@RequestMapping("/v1/webhooks")
public class DeliveryStatusController {

    private static final Logger log = LoggerFactory.getLogger(DeliveryStatusController.class);

    private final JdbcTemplate jdbc;

    @Value("${dmis.mgov.dlr-secret:}")
    private String dlrSecret;

    @Value("${spring.profiles.active:}")
    private String activeProfiles;

    public DeliveryStatusController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping({"/mgov/dlr", "/sms/dlr"})
    public Map<String, Object> smsDlr(@RequestBody(required = false) Map<String, Object> body,
                                      @RequestHeader(value = "X-MGov-Dlr-Secret", required = false) String headerSecret) {
        Map<String, Object> payload = body == null ? Map.of() : body;
        assertSecret(headerSecret, str(payload.get("secret")));

        String externalId = first(payload, "messageId", "message_id", "external_id", "msgId", "bulkId");
        String phone = first(payload, "msisdn", "phone", "recipient", "recipient_phone", "mobile");
        String rawStatus = first(payload, "status", "deliveryStatus", "delivery_status", "state");
        String mapped = mapStatus(rawStatus);

        if (externalId == null && phone == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "DLR requires messageId/external_id and/or msisdn/phone.");
        }
        if (mapped == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unrecognized delivery status: " + rawStatus);
        }

        int updated = 0;
        if (externalId != null && phone != null) {
            String formatted = normalizePhone(phone);
            updated = jdbc.update("""
                    update public.sms_logs
                       set status = ?,
                           delivered_at = case when ? = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
                           error_message = case when ? = 'failed' then coalesce(?, error_message) else error_message end,
                           response_data = left(coalesce(response_data,'') || E'\\nDLR:' || ?, 4000),
                           updated_at = now()
                     where external_id = ?
                       and (recipient_phone = ? or recipient_phone = ? or recipient_phone like ?)
                       and status in ('sent','pending','failed')
                    """, mapped, mapped, mapped, str(payload.get("error")), rawStatus == null ? mapped : rawStatus,
                    externalId, phone, formatted, "%" + last9(formatted) + "%");
        } else if (externalId != null) {
            // Bulk messageId was stored on every recipient of the same send.
            updated = jdbc.update("""
                    update public.sms_logs
                       set status = ?,
                           delivered_at = case when ? = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
                           response_data = left(coalesce(response_data,'') || E'\\nDLR:' || ?, 4000),
                           updated_at = now()
                     where external_id = ?
                       and status in ('sent','pending')
                    """, mapped, mapped, rawStatus == null ? mapped : rawStatus, externalId);
        } else {
            String formatted = normalizePhone(phone);
            updated = jdbc.update("""
                    update public.sms_logs
                       set status = ?,
                           delivered_at = case when ? = 'delivered' then coalesce(delivered_at, now()) else delivered_at end,
                           updated_at = now()
                     where status in ('sent','pending')
                       and (recipient_phone = ? or recipient_phone = ? or recipient_phone like ?)
                       and created_at > now() - interval '48 hours'
                    """, mapped, mapped, phone, formatted, "%" + last9(formatted) + "%");
        }

        log.info("SMS DLR externalId={} phone={} status={} → {} row(s)", externalId, phone, mapped, updated);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("updated", updated);
        out.put("status", mapped);
        return out;
    }

    private void assertSecret(String headerSecret, String bodySecret) {
        boolean local = activeProfiles != null
                && java.util.Arrays.stream(activeProfiles.split(","))
                .map(String::trim)
                .anyMatch("local"::equalsIgnoreCase);
        if (dlrSecret == null || dlrSecret.isBlank()) {
            if (local) {
                // Local/dev only: accept so operators can wire the gateway without a second deploy.
                return;
            }
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "DLR webhook is not configured. Set DMIS_MGOV_DLR_SECRET for this environment.");
        }
        String provided = headerSecret != null && !headerSecret.isBlank() ? headerSecret : bodySecret;
        if (provided == null || !dlrSecret.equals(provided)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid DLR secret.");
        }
    }

    private static String mapStatus(String raw) {
        if (raw == null || raw.isBlank()) {
            return "delivered"; // many gateways POST only on success
        }
        String s = raw.trim().toLowerCase(Locale.ROOT);
        // SMPP/M-Gov variants: DELIVRD, DLVRD, delivered, DELIVERED, etc.
        if (s.contains("deliver") || s.equals("ok") || s.equals("success") || s.equals("2")
                || s.equals("dlvrd") || s.equals("delivrd") || s.equals("accepted_by_handset")) {
            return "delivered";
        }
        if (s.contains("fail") || s.contains("undeliv") || s.contains("reject") || s.contains("expire")
                || s.equals("4") || s.equals("5") || s.equals("8") || s.equals("9")) {
            return "failed";
        }
        if (s.contains("sent") || s.contains("submit") || s.contains("accept") || s.equals("1") || s.equals("3")) {
            return "sent";
        }
        if (s.contains("pend") || s.contains("queue")) {
            return "pending";
        }
        return null;
    }

    private static String first(Map<String, Object> body, String... keys) {
        for (String k : keys) {
            Object v = body.get(k);
            if (v != null && !String.valueOf(v).isBlank()) {
                return String.valueOf(v).trim();
            }
        }
        return null;
    }

    private static String normalizePhone(String phone) {
        if (phone == null) {
            return "";
        }
        String p = phone.replaceAll("[\\s\\-+]", "");
        if (p.matches("^0?([67]\\d{8})$")) {
            return "255" + p.replaceFirst("^0", "");
        }
        return p;
    }

    private static String last9(String phone) {
        if (phone == null) {
            return "";
        }
        return phone.length() <= 9 ? phone : phone.substring(phone.length() - 9);
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
