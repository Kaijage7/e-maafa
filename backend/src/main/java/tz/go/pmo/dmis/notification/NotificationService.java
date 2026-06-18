package tz.go.pmo.dmis.notification;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * The ONE notification dispatcher. Every flow (incident, alert, early warning, CP/AAP activation,
 * dispatch to response teams, content publication, approvals) routes notifications through here.
 *
 * Each notice always lands in the per-user in-app feed (public.resource_notifications — the unified
 * feed, generalised in V64) for users who keep in-app on, and is additionally delivered over SMS
 * (M-Gov) and/or email (Gmail SMTP) according to (a) which channels the notice is eligible for and
 * (b) each user's own channel preferences set in System Settings. External delivery runs async so
 * the triggering request returns immediately.
 */
@Service
public class NotificationService {

    private static final Logger log = LoggerFactory.getLogger(NotificationService.class);

    private final JdbcTemplate jdbc;
    private final ExternalDeliveryService external;

    public NotificationService(JdbcTemplate jdbc, ExternalDeliveryService external) {
        this.jdbc = jdbc;
        this.external = external;
    }

    /**
     * A notification to dispatch. {@code sms}/{@code email} mark the channels this notice is ELIGIBLE
     * for; the per-user preference is the final gate. In-app is always eligible.
     */
    public record Notice(String type, String title, String message, String link,
                         String entityType, Long entityId, String severity,
                         boolean sms, boolean email) {

        public static Notice inApp(String type, String title, String message, String link, String entityType, Long entityId, String severity) {
            return new Notice(type, title, message, link, entityType, entityId, severity, false, false);
        }

        public static Notice all(String type, String title, String message, String link, String entityType, Long entityId, String severity) {
            return new Notice(type, title, message, link, entityType, entityId, severity, true, true);
        }

        public Notice withChannels(boolean sms, boolean email) {
            return new Notice(type, title, message, link, entityType, entityId, severity, sms, email);
        }
    }

    // ── Recipient selectors ──────────────────────────────────────────────────

    public int notifyUser(long userId, Notice n) {
        return dispatch(resolveUsers("u.id = " + userId), n);
    }

    public int notifyUsers(Collection<Long> userIds, Notice n) {
        if (userIds == null || userIds.isEmpty()) return 0;
        List<String> ids = userIds.stream().map(String::valueOf).toList();
        return dispatch(resolveUsers("u.id in (" + String.join(",", ids) + ")"), n);
    }

    /** Every user holding one of the given role names (Spatie model_has_roles). */
    public int notifyRoles(Collection<String> roles, Notice n) {
        if (roles == null || roles.isEmpty()) return 0;
        String in = String.join(",", roles.stream().map(r -> "'" + r.replace("'", "''") + "'").toList());
        String where = "u.id in (select mhr.model_id from public.model_has_roles mhr "
                + "join public.roles r on r.id = mhr.role_id where r.name in (" + in + "))";
        return dispatch(resolveUsers(where), n);
    }

    /** Everyone with an account (broad system broadcast, e.g. a published early warning). */
    public int notifyAllUsers(Notice n) {
        return dispatch(resolveUsers("1=1"), n);
    }

    // ── Core dispatch ────────────────────────────────────────────────────────

    private List<Map<String, Object>> resolveUsers(String whereClause) {
        return jdbc.queryForList(
                "select distinct u.id, u.name, u.email, u.phone, u.notify_in_app, u.notify_email, u.notify_sms "
                        + "from public.users u where " + whereClause);
    }

    private int dispatch(List<Map<String, Object>> users, Notice n) {
        if (users.isEmpty()) return 0;
        List<String> smsPhones = new ArrayList<>();
        List<String> emailAddrs = new ArrayList<>();
        int feed = 0;
        for (Map<String, Object> u : users) {
            long uid = ((Number) u.get("id")).longValue();
            boolean inApp = bool(u.get("notify_in_app"), true);
            if (inApp) {
                insertFeed(uid, n);
                feed++;
            }
            if (n.sms() && bool(u.get("notify_sms"), false)) {
                String phone = str(u.get("phone"));
                if (phone != null && !phone.isBlank()) smsPhones.add(phone);
            }
            if (n.email() && bool(u.get("notify_email"), true)) {
                String email = str(u.get("email"));
                if (email != null && email.contains("@")) emailAddrs.add(email);
            }
        }
        if (!smsPhones.isEmpty() || !emailAddrs.isEmpty()) {
            external.deliver(n, smsPhones, emailAddrs);
        }
        log.info("notify[{}] '{}' → {} in-app, {} sms, {} email", n.type(), n.title(), feed, smsPhones.size(), emailAddrs.size());
        return users.size();
    }

    private void insertFeed(long userId, Notice n) {
        jdbc.update("""
                insert into public.resource_notifications(user_id, type, title, message, channel,
                    link, entity_type, entity_id, severity, is_read, created_at, updated_at)
                values (?,?,?,?, 'database', ?,?,?,?, false, now(), now())
                """, userId, n.type(), n.title(), n.message(), n.link(), n.entityType(), n.entityId(), n.severity());
    }

    // ── helpers ──
    private static boolean bool(Object o, boolean dflt) {
        if (o == null) return dflt;
        if (o instanceof Boolean b) return b;
        String s = o.toString();
        return "t".equalsIgnoreCase(s) || "true".equalsIgnoreCase(s) || "1".equals(s);
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }
}
