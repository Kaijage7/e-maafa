package tz.go.pmo.dmis.service.impl;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.time.Instant;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.service.UserNotificationService;

/**
 * Next-level in-app notification feed: productive filters, category intelligence,
 * cursor pagination, severity-aware ordering, and full preferences control.
 * Source table: {@code public.resource_notifications} (unified feed V64).
 */
@Service
public class UserNotificationServiceImpl implements UserNotificationService {

    private static final Set<String> CATEGORIES = Set.of(
            "workflow", "early_warning", "approval", "logistics", "training", "scanner", "system");

    private static final Set<String> SEVERITIES = Set.of("critical", "high", "warning", "info", "success");

    /** Shared ORDER BY rank for severity (lower = higher priority). Must match keyset math. */
    private static final String SEV_RANK_SQL = """
            case lower(coalesce(severity,''))
              when 'critical' then 0 when 'danger' then 0
              when 'high' then 1 when 'major_warning' then 1 when 'major-warning' then 1
              when 'warning' then 2
              when 'success' then 4
              else 3 end
            """;

    private final JdbcTemplate jdbc;
    private final CurrentUserResolver currentUser;

    public UserNotificationServiceImpl(JdbcTemplate jdbc, CurrentUserResolver currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    @Override
    public Map<String, Object> feed(int limit, boolean unreadOnly, String type, String category,
                                    String severity, String q, Long beforeId) {
        long uid = requireActor();
        int lim = Math.min(Math.max(limit, 1), 100);
        String cat = clean(category);
        if (cat != null && !CATEGORIES.contains(cat)) {
            throw new BusinessRuleException(
                    "Unknown category '" + cat + "'. Use workflow, early_warning, approval, logistics, training, scanner or system.");
        }
        // Controlled vocabulary — unknown severity must not silently match info rows.
        String sev = parseSeverityFilter(severity);

        StringBuilder where = new StringBuilder("user_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(uid);
        if (unreadOnly) {
            where.append(" and is_read = false");
        }
        if (notBlank(type)) {
            where.append(" and lower(type) = lower(?)");
            params.add(type.trim());
        }
        if (cat != null) {
            // Category CASE must mirror deriveCategory() exactly (order + predicates).
            where.append(" and (").append(categorySqlExpr()).append(") = ?");
            params.add(cat);
        }
        if (sev != null) {
            where.append(" and lower(coalesce(severity,'')) in (").append(severityMatchSql(sev)).append(")");
        }
        if (notBlank(q)) {
            String qq = q.trim();
            if (qq.length() > 200) {
                throw new BusinessRuleException("Search query is too long (max 200 characters).");
            }
            where.append(" and (title ilike ? or message ilike ?)");
            String like = "%" + qq + "%";
            params.add(like);
            params.add(like);
        }
        // Keyset cursor aligned with ORDER BY (not bare id < ? — that duplicated/skipped rows).
        if (beforeId != null && beforeId > 0) {
            appendKeysetAfter(where, params, uid, beforeId);
        }

        // Unread first, then critical→warning→info, then newest. Fetch lim+1 for accurate has_more.
        String orderBy = "is_read asc, " + SEV_RANK_SQL + ", created_at desc, id desc";
        String sql = """
                select id, type, title, message, link, entity_type, entity_id, severity, is_read, created_at
                from public.resource_notifications
                where %s
                order by %s
                limit ?
                """.formatted(where, orderBy);
        params.add(lim + 1);
        List<Map<String, Object>> rows = jdbc.queryForList(sql, params.toArray());
        boolean hasMore = rows.size() > lim;
        if (hasMore) {
            rows = rows.subList(0, lim);
        }
        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> r : rows) {
            items.add(enrich(r));
        }

        Integer unread = jdbc.queryForObject(
                "select count(*) from public.resource_notifications where user_id = ? and is_read = false",
                Integer.class, uid);
        Long latestId = jdbc.query(
                "select id from public.resource_notifications where user_id = ? order by id desc limit 1",
                rs -> rs.next() ? rs.getLong(1) : null, uid);

        // Category counts for filter chips (scoped to actor).
        List<Map<String, Object>> catCounts = categoryCounts(uid);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("unread_count", unread == null ? 0 : unread);
        out.put("latest_id", latestId);
        out.put("limit", lim);
        out.put("has_more", hasMore);
        out.put("next_before_id", items.isEmpty() ? null : ((Number) items.get(items.size() - 1).get("id")).longValue());
        out.put("categories", catCounts);
        out.put("filters", Map.of(
                "unread", unreadOnly,
                "type", type == null ? "" : type,
                "category", cat == null ? "" : cat,
                "severity", sev == null ? "" : sev,
                "q", q == null ? "" : q));
        return out;
    }

    @Override
    @Transactional(readOnly = true, timeout = 10, isolation = Isolation.REPEATABLE_READ)
    public Map<String, Object> changes(long afterSequence, int limit) {
        if (afterSequence < 0) {
            throw new BusinessRuleException("after_sequence must be zero or a positive notification cursor.");
        }
        long uid = requireActor();
        int lim = Math.min(Math.max(limit, 1), 100);
        Long headValue = jdbc.queryForObject("""
                select coalesce((select last_sequence
                                   from platform.notification_sync_heads
                                  where user_id = ?), 0)
                """, Long.class, uid);
        long latestSequence = headValue == null ? 0 : headValue;
        if (afterSequence > latestSequence) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Notification cursor is ahead of this server; rebuild notification state from the current feed.");
        }

        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, sync_sequence, type, title, message, link, entity_type, entity_id,
                       severity, is_read, created_at
                  from public.resource_notifications
                 where user_id = ? and sync_sequence > ? and sync_sequence <= ?
                 order by sync_sequence asc
                 limit ?
                """, uid, afterSequence, latestSequence, lim + 1);
        boolean hasMore = rows.size() > lim;
        if (hasMore) {
            rows = rows.subList(0, lim);
        }
        List<Map<String, Object>> items = new ArrayList<>(rows.size());
        for (Map<String, Object> row : rows) {
            items.add(enrich(row));
        }
        // Deleted notices leave legitimate gaps. Once this bounded page is exhausted, advancing to
        // the captured per-user head prevents a client from polling the same empty gap forever.
        long nextAfterSequence = hasMore && !items.isEmpty()
                ? ((Number) items.getLast().get("sync_sequence")).longValue()
                : Math.max(afterSequence, latestSequence);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("items", items);
        out.put("after_sequence", afterSequence);
        out.put("next_after_sequence", nextAfterSequence);
        out.put("latest_sequence", latestSequence);
        out.put("has_more", hasMore);
        out.put("limit", lim);
        out.put("server_time", Instant.now().toString());
        return out;
    }

    /**
     * Continue after the row identified by {@code beforeId} under the feed ORDER BY.
     * Scoped to the actor so a foreign id cannot leak or shift another user's cursor.
     */
    private void appendKeysetAfter(StringBuilder where, List<Object> params, long uid, long beforeId) {
        List<Map<String, Object>> anchors = jdbc.queryForList("""
                select is_read, severity, created_at, id
                from public.resource_notifications
                where id = ? and user_id = ?
                """, beforeId, uid);
        if (anchors.isEmpty()) {
            // Unknown / foreign cursor → empty page (productive, no leak).
            where.append(" and false");
            return;
        }
        Map<String, Object> a = anchors.get(0);
        int readBit = Boolean.TRUE.equals(a.get("is_read")) ? 1 : 0;
        int sevRank = severityRank(str(a.get("severity")));
        Object createdAt = a.get("created_at");
        long id = ((Number) a.get("id")).longValue();

        // Sort: is_read ASC, sev_rank ASC, created_at DESC, id DESC
        // Next row is strictly after this position in that order.
        where.append("""
                 and (
                      (case when is_read then 1 else 0 end) > ?
                   or ((case when is_read then 1 else 0 end) = ? and (%s) > ?)
                   or ((case when is_read then 1 else 0 end) = ? and (%s) = ? and created_at < ?)
                   or ((case when is_read then 1 else 0 end) = ? and (%s) = ? and created_at = ? and id < ?)
                 )
                """.formatted(SEV_RANK_SQL, SEV_RANK_SQL, SEV_RANK_SQL));
        params.add(readBit);
        params.add(readBit);
        params.add(sevRank);
        params.add(readBit);
        params.add(sevRank);
        params.add(createdAt);
        params.add(readBit);
        params.add(sevRank);
        params.add(createdAt);
        params.add(id);
    }

    private static int severityRank(String raw) {
        String n = mapSeverity(raw);
        if (n == null) {
            return 3; // info / unknown
        }
        return switch (n) {
            case "critical" -> 0;
            case "high" -> 1;
            case "warning" -> 2;
            case "success" -> 4;
            default -> 3;
        };
    }

    @Override
    public Map<String, Object> unreadCount() {
        long uid = requireActor();
        Integer unread = jdbc.queryForObject(
                "select count(*) from public.resource_notifications where user_id = ? and is_read = false",
                Integer.class, uid);
        Long latestId = jdbc.query(
                "select id from public.resource_notifications where user_id = ? order by id desc limit 1",
                rs -> rs.next() ? rs.getLong(1) : null, uid);
        Map<String, Object> bySev = new LinkedHashMap<>();
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select lower(coalesce(nullif(trim(severity),''), 'info')) as sev, count(*) as n
                from public.resource_notifications
                where user_id = ? and is_read = false
                group by 1
                """, uid);
        int critical = 0, warning = 0, info = 0;
        for (Map<String, Object> r : rows) {
            String s = String.valueOf(r.get("sev")).toLowerCase(Locale.ROOT);
            int n = ((Number) r.get("n")).intValue();
            if (s.contains("critical") || s.equals("danger") || s.equals("high") || s.contains("major")) {
                critical += n;
            } else if (s.contains("warn")) {
                warning += n;
            } else {
                info += n;
            }
        }
        bySev.put("critical", critical);
        bySev.put("warning", warning);
        bySev.put("info", info);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("count", unread == null ? 0 : unread);
        out.put("latest_id", latestId);
        out.put("by_severity", bySev);
        return out;
    }

    @Override
    public Map<String, Object> markRead(long id) {
        long uid = requireActor();
        int n = jdbc.update("""
                update public.resource_notifications
                   set is_read = true, read_at = now(), updated_at = now()
                 where id = ? and user_id = ? and is_read = false
                """, id, uid);
        return Map.of("success", true, "updated", n);
    }

    @Override
    public Map<String, Object> markUnread(long id) {
        long uid = requireActor();
        int n = jdbc.update("""
                update public.resource_notifications
                   set is_read = false, read_at = null, updated_at = now()
                 where id = ? and user_id = ?
                """, id, uid);
        if (n == 0) {
            throw new BusinessRuleException("Notification not found.");
        }
        return Map.of("success", true);
    }

    @Override
    public Map<String, Object> markAllRead() {
        long uid = requireActor();
        int n = jdbc.update("""
                update public.resource_notifications
                   set is_read = true, read_at = now(), updated_at = now()
                 where user_id = ? and is_read = false
                """, uid);
        return Map.of("success", true, "updated", n);
    }

    @Override
    public Map<String, Object> dismiss(long id) {
        long uid = requireActor();
        int n = jdbc.update("delete from public.resource_notifications where id = ? and user_id = ?", id, uid);
        if (n == 0) {
            throw new BusinessRuleException("Notification not found.");
        }
        return Map.of("success", true, "dismissed", true);
    }

    @Override
    public Map<String, Object> myPreferences() {
        long uid = requireActor();
        Map<String, Object> row = jdbc.queryForMap("""
                select id, name, email, phone, notify_in_app, notify_email, notify_sms
                from public.users where id = ?
                """, uid);
        Map<String, Object> out = new LinkedHashMap<>(row);
        out.put("channels", List.of(
                Map.of("key", "notify_in_app", "label", "In-app", "description", "Show notices in the bell and notification centre"),
                Map.of("key", "notify_email", "label", "Email", "description", "Deliver eligible notices to your account email"),
                Map.of("key", "notify_sms", "label", "SMS", "description", "Deliver high-priority notices to your mobile (M-Gov)")));
        return out;
    }

    @Override
    public Map<String, Object> saveMyPreferences(Map<String, Object> body) {
        long uid = requireActor();
        boolean notifyInApp = boolOf(body.get("notify_in_app"), true);
        boolean notifyEmail = boolOf(body.get("notify_email"), true);
        boolean notifySms = boolOf(body.get("notify_sms"), false);
        String phone = body.get("phone") == null ? null : body.get("phone").toString().trim();
        if (phone != null && phone.isBlank()) {
            phone = null;
        }
        String effectivePhone = phone;
        if (effectivePhone == null) {
            effectivePhone = jdbc.query("select phone from public.users where id = ?",
                    rs -> rs.next() ? rs.getString(1) : null, uid);
        }
        if (phone != null && !validTanzanianMobile(phone)) {
            throw new BusinessRuleException("Enter a valid Tanzanian phone number, e.g. 0712345678 or +255712345678.");
        }
        if (notifySms && (effectivePhone == null || effectivePhone.isBlank())) {
            throw new BusinessRuleException("Add a phone number before enabling SMS notifications.");
        }
        if (notifySms && !validTanzanianMobile(effectivePhone)) {
            throw new BusinessRuleException("Enter a valid Tanzanian phone number before enabling SMS notifications.");
        }
        jdbc.update("""
                update public.users set
                    notify_in_app = ?, notify_email = ?, notify_sms = ?,
                    phone = coalesce(?, phone), updated_at = now()
                where id = ?
                """,
                notifyInApp, notifyEmail, notifySms, phone, uid);
        return Map.of("success", true, "message", "Notification preferences saved.");
    }

    // ── category intelligence (no schema change) ─────────────────────────────

    private static String deriveCategory(String type) {
        if (type == null || type.isBlank()) {
            return "system";
        }
        String t = type.toLowerCase(Locale.ROOT);
        if (t.contains("early_warning") || t.contains("ew_") || t.contains("bulletin") || t.startsWith("alert_")) {
            return "early_warning";
        }
        if (t.contains("approval") || t.contains("rollback")) {
            return "approval";
        }
        if (t.contains("dispatch") || t.contains("warehouse") || t.contains("allocation") || t.contains("resource")) {
            return "logistics";
        }
        if (t.contains("training")) {
            return "training";
        }
        if (t.contains("scanner") || t.contains("tasking")) {
            return "scanner";
        }
        if (t.contains("incident") || t.contains("workflow") || t.contains("task_")) {
            return "workflow";
        }
        if (t.contains("stakeholder")) {
            return "workflow";
        }
        return "system";
    }

    /**
     * SQL expression returning the same category key as {@link #deriveCategory(String)}.
     * Order is significant: first match wins (e.g. scanner_incident → scanner, not workflow).
     */
    private static String categorySqlExpr() {
        return """
                case
                  when lower(coalesce(type,'')) like '%early_warning%'
                    or lower(coalesce(type,'')) like 'ew\\_%' escape '\\'
                    or lower(coalesce(type,'')) like '%bulletin%'
                    or lower(coalesce(type,'')) like 'alert\\_%' escape '\\'
                    then 'early_warning'
                  when lower(coalesce(type,'')) like '%approval%'
                    or lower(coalesce(type,'')) like '%rollback%'
                    then 'approval'
                  when lower(coalesce(type,'')) like '%dispatch%'
                    or lower(coalesce(type,'')) like '%warehouse%'
                    or lower(coalesce(type,'')) like '%allocation%'
                    or lower(coalesce(type,'')) like '%resource%'
                    then 'logistics'
                  when lower(coalesce(type,'')) like '%training%'
                    then 'training'
                  when lower(coalesce(type,'')) like '%scanner%'
                    or lower(coalesce(type,'')) like '%tasking%'
                    then 'scanner'
                  when lower(coalesce(type,'')) like '%incident%'
                    or lower(coalesce(type,'')) like '%workflow%'
                    or lower(coalesce(type,'')) like 'task\\_%' escape '\\'
                    or lower(coalesce(type,'')) like '%stakeholder%'
                    then 'workflow'
                  else 'system'
                end
                """;
    }

    private List<Map<String, Object>> categoryCounts(long uid) {
        // Count unread per derived category in Java for consistency with deriveCategory().
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select type, count(*) filter (where is_read = false) as unread, count(*) as total
                from public.resource_notifications
                where user_id = ?
                group by type
                """, uid);
        Map<String, long[]> agg = new LinkedHashMap<>();
        for (String c : List.of("workflow", "early_warning", "approval", "logistics", "training", "scanner", "system")) {
            agg.put(c, new long[]{0, 0});
        }
        for (Map<String, Object> r : rows) {
            String cat = deriveCategory(str(r.get("type")));
            long[] a = agg.computeIfAbsent(cat, k -> new long[]{0, 0});
            a[0] += ((Number) r.get("unread")).longValue();
            a[1] += ((Number) r.get("total")).longValue();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, long[]> e : agg.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", e.getKey());
            row.put("label", categoryLabel(e.getKey()));
            row.put("unread", e.getValue()[0]);
            row.put("total", e.getValue()[1]);
            out.add(row);
        }
        return out;
    }

    private static String categoryLabel(String key) {
        return switch (key) {
            case "early_warning" -> "Early warning";
            case "approval" -> "Approvals";
            case "logistics" -> "Logistics";
            case "training" -> "Training";
            case "scanner" -> "Scanner";
            case "workflow" -> "Incidents & tasks";
            default -> "System";
        };
    }

    private static String categoryIcon(String key) {
        return switch (key) {
            case "early_warning" -> "fa-satellite-dish";
            case "approval" -> "fa-stamp";
            case "logistics" -> "fa-truck";
            case "training" -> "fa-chalkboard-user";
            case "scanner" -> "fa-satellite";
            case "workflow" -> "fa-diagram-project";
            default -> "fa-bell";
        };
    }

    private Map<String, Object> enrich(Map<String, Object> r) {
        Map<String, Object> m = new LinkedHashMap<>(r);
        String type = str(r.get("type"));
        String cat = deriveCategory(type);
        m.put("category", cat);
        m.put("category_label", categoryLabel(cat));
        m.put("category_icon", categoryIcon(cat));
        String sev = mapSeverity(str(r.get("severity")));
        m.put("severity_norm", sev == null ? "info" : sev);
        return m;
    }

    /**
     * Filter param: blank = no filter; known alias → bucket; anything else → 422
     * (never silently treat garbage as info).
     */
    private static String parseSeverityFilter(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String mapped = mapSeverity(raw);
        if (mapped == null || !SEVERITIES.contains(mapped)) {
            throw new BusinessRuleException(
                    "Unknown severity '" + raw.trim() + "'. Use critical, high, warning, info or success.");
        }
        return mapped;
    }

    /** Map stored or query severity into a controlled bucket; null if blank/unknown. */
    private static String mapSeverity(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String s = raw.trim().toLowerCase(Locale.ROOT);
        if (s.equals("critical") || s.equals("danger")) {
            return "critical";
        }
        if (s.equals("high") || s.equals("major_warning") || s.equals("major-warning") || s.equals("major")) {
            return "high";
        }
        if (s.equals("warning") || s.equals("warn")) {
            return "warning";
        }
        if (s.equals("success") || s.equals("ok")) {
            return "success";
        }
        if (s.equals("info") || s.equals("low") || s.equals("normal") || s.equals("medium")) {
            return "info";
        }
        return null;
    }

    private static String severityMatchSql(String sev) {
        return switch (sev) {
            case "critical" -> "'critical','danger'";
            case "high" -> "'high','major_warning','major-warning','major'";
            case "warning" -> "'warning','warn'";
            case "success" -> "'success','ok'";
            case "info" -> "'info','low','normal','medium',''";
            default -> throw new IllegalArgumentException("severity bucket: " + sev);
        };
    }

    private long requireActor() {
        Long id = currentUser.actingUserId();
        if (id == null) {
            throw new BusinessRuleException("Authenticated user identity is required.");
        }
        return id;
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String clean(String s) {
        if (s == null || s.isBlank()) {
            return null;
        }
        return s.trim().toLowerCase(Locale.ROOT);
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }

    private static boolean boolOf(Object o, boolean dflt) {
        if (o == null) {
            return dflt;
        }
        if (o instanceof Boolean b) {
            return b;
        }
        String s = o.toString();
        return "true".equalsIgnoreCase(s) || "1".equals(s) || "t".equalsIgnoreCase(s) || "on".equalsIgnoreCase(s);
    }

    private static boolean validTanzanianMobile(String phone) {
        if (phone == null) {
            return false;
        }
        return phone.replaceAll("[\\s-]", "").matches("^(\\+?255|0)[67]\\d{8}$");
    }
}
