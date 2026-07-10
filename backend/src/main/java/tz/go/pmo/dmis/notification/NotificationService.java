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

    /**
     * Public portal {@code alert_subscriptions} fan-out (F28/F83). These are NOT system users — they have no
     * in-app feed. Eligible active subscribers receive SMS and/or email according to their
     * {@code communication_channels}, filtered by location, hazard interest, and optional
     * {@code alert_level_priority} vs the warning severity. Empty channels = both SMS and email
     * (legacy rows, same as {@link AudienceService}).
     */
    public int notifyAlertSubscribers(Notice n, String regionHint, String hazardHint) {
        return notifyAlertSubscribers(n, regionHint, hazardHint, null);
    }

    /**
     * @param severityHint highest severity among published hazards (e.g. Watch / Warning / Emergency)
     *                     or warning level text (Advisory / Warning / Major Warning)
     */
    public int notifyAlertSubscribers(Notice n, String regionHint, String hazardHint, String severityHint) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, full_name, phone_number, email, communication_channels,
                       subscriber_location, hazards_of_interest, alert_level_priority
                  from public.alert_subscriptions
                 where coalesce(is_active, true) = true
                   and coalesce(consent, true) = true
                   and unsubscribed_at is null
                """);
        List<String> smsPhones = new ArrayList<>();
        List<String> emailAddrs = new ArrayList<>();
        int matched = 0;
        String region = regionHint == null ? "" : regionHint.trim().toLowerCase();
        String hazard = hazardHint == null ? "" : hazardHint.trim().toLowerCase();
        int eventRank = severityRank(severityHint);
        for (Map<String, Object> row : rows) {
            if (!subscriberMatches(row, region, hazard)) {
                continue;
            }
            if (!priorityMatches(str(row.get("alert_level_priority")), eventRank)) {
                continue;
            }
            matched++;
            String channels = String.valueOf(row.get("communication_channels") == null ? "" : row.get("communication_channels")).toLowerCase();
            // Empty / null channels → legacy both (must not silently skip delivery).
            boolean wantSms = channels.isBlank() || channels.equals("null") || channels.equals("[]") || channels.contains("sms");
            boolean wantEmail = channels.isBlank() || channels.equals("null") || channels.equals("[]")
                    || channels.contains("email") || channels.contains("mail");
            if (n.sms() && wantSms) {
                String phone = str(row.get("phone_number"));
                if (phone != null && !phone.isBlank()) {
                    smsPhones.add(phone.trim());
                }
            }
            if (n.email() && wantEmail) {
                String email = str(row.get("email"));
                if (email != null && email.contains("@")) {
                    emailAddrs.add(email.trim());
                }
            }
        }
        if (!smsPhones.isEmpty() || !emailAddrs.isEmpty()) {
            external.deliver(n, smsPhones.stream().distinct().toList(), emailAddrs.stream().distinct().toList());
        }
        log.info("notifyAlertSubscribers[{}] '{}' → {} matched, {} sms, {} email (regionHint={}, hazardHint={}, severity={})",
                n.type(), n.title(), matched, smsPhones.size(), emailAddrs.size(), regionHint, hazardHint, severityHint);
        return matched;
    }

    /**
     * Rank: higher = more severe. Subscribers who only want "Major Warning" skip Watch/Advisory.
     * "All Levels" / blank / "All" accept everything.
     */
    private static int severityRank(String severityHint) {
        if (severityHint == null || severityHint.isBlank()) {
            return 2; // unknown → treat as mid so "All" still matches
        }
        String s = severityHint.trim().toLowerCase();
        if (s.contains("emergency") || s.contains("major")) {
            return 3;
        }
        if (s.contains("warning") && !s.contains("advisory")) {
            return 2;
        }
        if (s.contains("watch") || s.contains("advisory") || s.contains("minor")) {
            return 1;
        }
        return 2;
    }

    private static boolean priorityMatches(String subscriberPriority, int eventRank) {
        if (subscriberPriority == null || subscriberPriority.isBlank()) {
            return true;
        }
        String p = subscriberPriority.trim().toLowerCase();
        if (p.equals("all") || p.equals("all levels") || p.contains("all level")) {
            return true;
        }
        int want = 1;
        if (p.contains("emergency") || p.contains("major")) {
            want = 3;
        } else if (p.contains("warning") && !p.contains("advisory")) {
            want = 2;
        } else if (p.contains("watch") || p.contains("advisory") || p.contains("minor")) {
            want = 1;
        } else {
            return true; // unknown preference → do not drop
        }
        // Subscriber min severity: deliver when event is at least as severe.
        return eventRank >= want;
    }

    /**
     * F78: proactive external push to the partner {@code stakeholders} registry on EW publish
     * (beyond in-app Partner accounts and the stakeholder-portal feed). SMS/email only — no in-app
     * feed for registry rows. When {@code regionHint} is non-blank, prefer stakeholders whose
     * region/district text or {@code region_id}/{@code district_id} name overlaps a token; national
     * rows (blank region and null region_id) always match.
     */
    public int notifyStakeholders(Notice n, String regionHint) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select s.id, s.name, s.organization, s.phone, s.email,
                       s.contact_person_phone, s.contact_person_email,
                       s.region, s.district, s.region_id, s.district_id,
                       r.name as region_name, d.name as district_name
                  from public.stakeholders s
                  left join public.regions r on r.id = s.region_id
                  left join public.districts d on d.id = s.district_id
                 where coalesce(s.is_active, true) = true
                """);
        List<String> smsPhones = new ArrayList<>();
        List<String> emailAddrs = new ArrayList<>();
        int matched = 0;
        String region = regionHint == null ? "" : regionHint.trim().toLowerCase();
        for (Map<String, Object> row : rows) {
            if (!stakeholderMatchesRegion(row, region)) {
                continue;
            }
            matched++;
            if (n.sms()) {
                addPhone(smsPhones, str(row.get("phone")));
                addPhone(smsPhones, str(row.get("contact_person_phone")));
            }
            if (n.email()) {
                addEmail(emailAddrs, str(row.get("email")));
                addEmail(emailAddrs, str(row.get("contact_person_email")));
            }
        }
        if (!smsPhones.isEmpty() || !emailAddrs.isEmpty()) {
            external.deliver(n, smsPhones.stream().distinct().toList(), emailAddrs.stream().distinct().toList());
        }
        log.info("notifyStakeholders[{}] '{}' → {} matched, {} sms, {} email (regionHint={})",
                n.type(), n.title(), matched, smsPhones.size(), emailAddrs.size(), regionHint);
        return matched;
    }

    private static boolean stakeholderMatchesRegion(Map<String, Object> row, String regionHint) {
        if (regionHint == null || regionHint.isBlank()) {
            return true; // national broadcast
        }
        String regionText = str(row.get("region"));
        String districtText = str(row.get("district"));
        String regionName = str(row.get("region_name"));
        String districtName = str(row.get("district_name"));
        boolean hasArea = (regionText != null && !regionText.isBlank())
                || (districtText != null && !districtText.isBlank())
                || row.get("region_id") != null
                || row.get("district_id") != null;
        if (!hasArea) {
            return true; // national partner — always notified
        }
        String hay = ((regionText == null ? "" : regionText) + " "
                + (districtText == null ? "" : districtText) + " "
                + (regionName == null ? "" : regionName) + " "
                + (districtName == null ? "" : districtName)).toLowerCase();
        for (String part : regionHint.split("[,;/]+")) {
            String p = part.trim().toLowerCase();
            if (p.length() >= 3 && hay.contains(p)) {
                return true;
            }
        }
        return false;
    }

    private static void addPhone(List<String> out, String phone) {
        if (phone != null && !phone.isBlank()) {
            out.add(phone.trim());
        }
    }

    private static void addEmail(List<String> out, String email) {
        if (email != null && email.contains("@")) {
            out.add(email.trim());
        }
    }

    private static boolean subscriberMatches(Map<String, Object> row, String region, String hazard) {
        // Location: blank / Tanzania / All = national. Else require overlap with any warned region token.
        String loc = str(row.get("subscriber_location"));
        if (loc != null && !loc.isBlank() && !region.isBlank()) {
            String l = loc.toLowerCase().trim();
            if (!l.equals("tanzania") && !l.equals("all") && !l.equals("nationwide")) {
                boolean locationHit = false;
                for (String part : region.split("[,;/]+")) {
                    String p = part.trim().toLowerCase();
                    if (p.isBlank()) {
                        continue;
                    }
                    if (l.contains(p) || p.contains(l)) {
                        locationHit = true;
                        break;
                    }
                }
                if (!locationHit) {
                    return false;
                }
            }
        }
        // Hazard interest: empty / null / [] = all hazards; else require token overlap.
        Object rawHaz = row.get("hazards_of_interest");
        if (rawHaz != null && !hazard.isBlank()) {
            String hz = String.valueOf(rawHaz).toLowerCase();
            if (!hz.isBlank() && !hz.equals("null") && !hz.equals("[]") && !hz.contains("all")) {
                // tokenise hazard summary words
                boolean any = false;
                for (String token : hazard.split("[,;/\\s]+")) {
                    if (token.length() >= 4 && hz.contains(token)) {
                        any = true;
                        break;
                    }
                }
                // common families
                if (!any && (hazard.contains("flood") && hz.contains("flood")
                        || hazard.contains("rain") && (hz.contains("rain") || hz.contains("flood"))
                        || hazard.contains("drought") && hz.contains("drought")
                        || hazard.contains("storm") && (hz.contains("storm") || hz.contains("wind"))
                        || hazard.contains("cholera") && (hz.contains("disease") || hz.contains("epidemic") || hz.contains("cholera")))) {
                    any = true;
                }
                if (!any) {
                    return false;
                }
            }
        }
        return true;
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
