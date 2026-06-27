package tz.go.pmo.dmis.response;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.notification.ExternalDeliveryService;
import tz.go.pmo.dmis.notification.NotificationService;

/**
 * The consolidated Communication & Alert Center — the single merged port of
 * Response\CommunicationAlertsController + Response\AlertSystemController
 * (the source ran two parallel alert systems with diverging enums
 * and recipient logic; this is the one stream).
 *
 * Flow: compose (template → variable substitution) → resolve recipients from
 * the 8 group keys → write the alerts row → fan out one alert_recipients row
 * per recipient × channel (THE delivery log — deduped from the source's three
 * half-journals) → send/schedule. Locally every channel records a simulated
 * delivery; production swaps the channel senders (M-Gov SMS, mail, FCM)
 * without touching this flow.
 *
 * Also fixed: 'sectoral_focal', 'emergency_teams' and 'public' resolved to
 * nobody in the source — now mapped to MDA Focal, EOCC and the preparedness
 * alert_subscriptions registry respectively.
 */
@RestController
@RequestMapping("/v1/response/communication")
public class CommunicationController {

    private static final List<String> ALERT_TYPES = List.of("evacuation", "warning", "update", "all_clear", "custom");
    private static final List<String> SEVERITIES = List.of("low", "medium", "high", "critical");
    private static final List<String> CHANNELS = List.of("sms", "email", "app", "web");
    /** Verbatim group keys from the source's compose form, each mapped to real recipients. */
    private static final Map<String, List<String>> GROUP_ROLES = new LinkedHashMap<>();
    static {
        GROUP_ROLES.put("all_users", List.of());                       // special-cased: every account
        GROUP_ROLES.put("pmo_staff", List.of("Super Admin", "Admin", "Secretary", "Director", "Asst. Director"));
        GROUP_ROLES.put("regional_coordinators", List.of("RAS", "Reg DC"));
        GROUP_ROLES.put("district_coordinators", List.of("DAS", "Dist DC"));
        GROUP_ROLES.put("response_agencies", List.of("Partners"));
        GROUP_ROLES.put("sectoral_focal", List.of("MDA Focal"));       // was a stub
        GROUP_ROLES.put("emergency_teams", List.of("EOCC"));           // was a stub
        GROUP_ROLES.put("public", List.of());                          // special-cased: alert_subscriptions
    }

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final Logger log = LoggerFactory.getLogger(CommunicationController.class);

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService users;
    private final ExternalDeliveryService externalDelivery; // the one async SMS+SMTP sender (off the request thread)
    private final NotificationService notifications;        // the one in-app feed dispatcher
    private final JurisdictionScope jurisdiction;           // row-level area scoping for the operational history list
    private final AreaGuard areaGuard;                      // by-id read area guard (scoped-list/unscoped-detail leaks)

    public CommunicationController(JdbcTemplate jdbc, IncidentWorkflowService users,
                                   ExternalDeliveryService externalDelivery, NotificationService notifications,
                                   JurisdictionScope jurisdiction, AreaGuard areaGuard) {
        this.jdbc = jdbc;
        this.users = users;
        this.externalDelivery = externalDelivery;
        this.notifications = notifications;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
    }

    // ─── Dashboard + form data ───

    @GetMapping
    public Map<String, Object> index() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total_alerts,
                       count(*) filter (where sent_at::date = current_date) as sent_today,
                       count(*) filter (where status = 'scheduled') as scheduled,
                       count(*) filter (where status = 'failed') as failed
                from public.alerts
                """));
        out.put("delivery", jdbc.queryForMap("""
                select count(*) as total_deliveries,
                       count(*) filter (where status in ('sent','delivered','read')) as delivered,
                       count(*) filter (where status = 'failed') as failed,
                       round(100.0 * count(*) filter (where status in ('sent','delivered','read'))
                             / greatest(count(*), 1), 1) as delivery_rate
                from public.alert_recipients
                """));
        out.put("by_channel", jdbc.queryForList("""
                select delivery_method as channel, count(*) as count,
                       count(*) filter (where status = 'failed') as failed
                from public.alert_recipients group by delivery_method order by count desc
                """));
        out.put("recent_alerts", alertList("limit 10", true));   // dashboard preview — scope to the officer's area (shared-or-own)
        return out;
    }

    @GetMapping("/form-data")
    public Map<String, Object> formData() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("alert_types", ALERT_TYPES);
        out.put("severities", SEVERITIES);
        out.put("channels", CHANNELS);
        out.put("recipient_groups", groupSummaries());
        List<Map<String, Object>> templates = jdbc.queryForList(
                "select id, name, type, title, message, variables, is_active from public.alert_templates order by name");
        templates.forEach(t -> parseJsonField(t, "variables"));  // clean arrays, not PGobjects
        out.put("templates", templates);
        StringBuilder incidentSql = new StringBuilder(
                "select i.id, i.title, i.severity_level from public.incidents i"
                        + " where i.status not in ('Closed','Resolved')");
        List<Object> incidentParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("i", incidentSql, incidentParams);
        incidentSql.append(" order by i.reported_at desc limit 50");
        out.put("incidents", jdbc.queryForList(incidentSql.toString(), incidentParams.toArray()));
        return out;
    }

    /** The 8 group keys with live member counts, so the compose form shows real reach. */
    private List<Map<String, Object>> groupSummaries() {
        List<Map<String, Object>> groups = new ArrayList<>();
        for (String key : GROUP_ROLES.keySet()) {
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("key", key);
            g.put("label", key.replace('_', ' '));
            g.put("member_count", resolveRecipients(List.of(key)).size());
            groups.add(g);
        }
        return groups;
    }

    // ─── Compose / send ───

    /**
     * Create and dispatch (or schedule) an alert. Validation mirrors the
     * source's sendAlert(); the fan-out writes one alert_recipients row per
     * resolved recipient × selected channel.
     */
    @PostMapping("/alerts")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    // NOT @Transactional: fanOut writes the alert + recipient rows (auto-committed) then offloads the
    // SMS/SMTP send to the @Async ExternalDeliveryService — the request never holds a DB connection
    // across gateway I/O, and a rollback can't discard a record of a message that already went out.
    public Map<String, Object> sendAlert(@RequestBody Map<String, Object> body) throws Exception {
        String alertType = requireIn(body.get("alert_type"), ALERT_TYPES, "alert_type");
        String severity = requireIn(body.get("severity"), SEVERITIES, "severity");
        String title = requireMax(body.get("title"), 255, "title");
        String message = requireMax(body.get("message"), 1000, "message");
        List<String> groups = strList(body.get("recipient_groups"));
        List<String> channels = strList(body.get("channels"));
        if (groups.isEmpty()) {
            throw new BusinessRuleException("Select at least one recipient group.");
        }
        if (channels.isEmpty() || !CHANNELS.containsAll(channels)) {
            throw new BusinessRuleException("Select at least one valid channel (sms, email, app, web).");
        }
        for (String group : groups) {
            if (!GROUP_ROLES.containsKey(group)) {
                throw new BusinessRuleException("Unknown recipient group: " + group);
            }
        }
        String scheduledAt = str(body.get("scheduled_at"));
        boolean scheduled = scheduledAt != null;

        Long alertId = jdbc.queryForObject("""
                insert into public.alerts(incident_id, alert_type, severity, title, message, channels,
                    recipient_groups, created_by, scheduled_at, sent_at, status, created_at, updated_at)
                values (?,?,?,?,?,?::json,?::json,?,?::timestamptz, case when ? then null else now() end,
                        case when ? then 'scheduled' else 'sent' end, now(), now()) returning id
                """, Long.class,
                body.get("incident_id") == null ? null : (long) Double.parseDouble(String.valueOf(body.get("incident_id"))),
                alertType, severity, title, message,
                JSON.writeValueAsString(channels), JSON.writeValueAsString(groups),
                users.actingUserId(), scheduledAt, scheduled, scheduled);

        int fanout = 0;
        if (!scheduled) {
            fanout = fanOut(alertId, groups, channels, title, message, alertType, severity);
        }
        return Map.of("success", true, "id", alertId, "recipients", fanout,
                "message", scheduled
                        ? "Alert scheduled for " + scheduledAt + "."
                        : "Alert sent to " + fanout + " recipient deliveries across " + channels.size() + " channel(s).");
    }

    /**
     * Write the delivery log (one alert_recipients row per recipient × channel) and kick off real
     * delivery. 'app' writes the in-app bell feed synchronously (for user recipients); 'web' is the
     * public-portal display ('sent'); SMS/email rows are written 'pending' and the ACTUAL send is offloaded
     * to the @Async ExternalDeliveryService, which flips them to sent/failed from the gateway result — so
     * no network I/O runs on the request/scheduler thread and no DB connection is held across it. A
     * recipient with no usable contact is recorded 'failed'; a non-account subscriber gets no 'app' row.
     */
    private int fanOut(long alertId, List<String> groups, List<String> channels,
                       String title, String message, String alertType, String severity) {
        List<Map<String, Object>> recipients = resolveRecipients(groups);
        if (recipients.isEmpty()) {
            return 0;
        }

        // In-app — write the real bell feed for user recipients (the one dispatcher), synchronously.
        if (channels.contains("app")) {
            List<Long> userIds = recipients.stream().filter(r -> "user".equals(r.get("type")))
                    .map(r -> ((Number) r.get("id")).longValue()).distinct().toList();
            if (!userIds.isEmpty()) {
                notifications.notifyUsers(userIds, NotificationService.Notice.inApp(
                        "alert_" + (alertType == null ? "custom" : alertType), title, message,
                        "/m/response/communication", "alert", alertId, severityToken(severity)));
            }
        }

        int written = 0;
        List<String> smsPhones = new ArrayList<>();
        List<String> emailAddrs = new ArrayList<>();
        for (Map<String, Object> recipient : recipients) {
            boolean isUser = "user".equals(recipient.get("type"));
            String phone = str(recipient.get("phone"));
            String email = str(recipient.get("email"));
            for (String channel : channels) {
                String status;
                switch (channel) {
                    case "sms" -> {
                        if (phone != null && !phone.isBlank()) { smsPhones.add(phone); status = "pending"; }
                        else { status = "failed"; }                          // no number on file
                    }
                    case "email" -> {
                        if (email != null && email.contains("@")) { emailAddrs.add(email); status = "pending"; }
                        else { status = "failed"; }                          // no/invalid address
                    }
                    case "app" -> {
                        if (!isUser) { continue; }                           // subscribers have no in-app account → no row
                        status = "sent";
                    }
                    default -> status = "sent";                              // web: public-portal display
                }
                insertRecipient(alertId, recipient, channel, status);
                written++;
            }
        }

        // Offload the real SMS/SMTP send off the request thread; it updates the 'pending' rows above.
        List<String> uniqSms = smsPhones.stream().distinct().toList();
        List<String> uniqEmail = emailAddrs.stream().distinct().toList();
        if (!uniqSms.isEmpty() || !uniqEmail.isEmpty()) {
            externalDelivery.deliverAlert(alertId, uniqSms, uniqEmail, title, message, users.actingUserId());
        }
        return written;
    }

    private void insertRecipient(long alertId, Map<String, Object> r, String channel, String status) {
        jdbc.update("""
                insert into public.alert_recipients(alert_id, recipient_type, recipient_id, delivery_method,
                    status, sent_at, created_at, updated_at)
                values (?,?,?,?,?, case when ? = 'sent' then now() else null end, now(), now())
                """, alertId, r.get("type"), r.get("id"), channel, status, status);
    }

    /**
     * Dispatch alerts composed with a future {@code scheduled_at}. Without this they sat at
     * status='scheduled' forever (silently never sent). Runs every minute; claims each due alert
     * atomically (so an overlapping tick can't double-send), then fans it out through the real path.
     */
    @Scheduled(fixedDelay = 60000)
    public void dispatchScheduledAlerts() {
        List<Map<String, Object>> due;
        try {
            due = jdbc.queryForList(
                    "select * from public.alerts where status = 'scheduled' and scheduled_at <= now()"
                            + " order by scheduled_at limit 50");
        } catch (Exception e) {
            log.error("scheduled-alert poll failed", e);
            return;
        }
        for (Map<String, Object> a : due) {
            long id = ((Number) a.get("id")).longValue();
            // claim it first (status guard) so a concurrent tick / instance cannot dispatch it twice
            int claimed = jdbc.update(
                    "update public.alerts set status = 'sent', sent_at = now(), updated_at = now()"
                            + " where id = ? and status = 'scheduled'", id);
            if (claimed == 0) {
                continue;
            }
            try {
                int n = fanOut(id, jsonList(a.get("recipient_groups")), jsonList(a.get("channels")),
                        str(a.get("title")), str(a.get("message")), str(a.get("alert_type")), str(a.get("severity")));
                log.info("scheduled alert {} dispatched → {} recipient deliveries", id, n);
            } catch (Exception e) {
                // claimed 'sent' but fan-out failed — record the truth so it isn't stranded as sent/0-deliveries
                log.error("scheduled alert {} dispatch failed after claim", id, e);
                try {
                    jdbc.update("update public.alerts set status = 'failed', updated_at = now() where id = ?", id);
                } catch (Exception ignored) {
                    // best-effort; the error above is the record
                }
            }
        }
    }

    /** Parse a PG json/jsonb column (PGobject or String) into a List of strings. */
    @SuppressWarnings("unchecked")
    private static List<String> jsonList(Object v) {
        if (v == null) {
            return List.of();
        }
        try {
            String json = "PGobject".equals(v.getClass().getSimpleName())
                    ? String.valueOf(v.getClass().getMethod("getValue").invoke(v)) : String.valueOf(v);
            return json == null || json.isBlank() ? List.of() : JSON.readValue(json, List.class);
        } catch (Exception e) {
            return List.of();
        }
    }

    /** low|medium|high|critical → the bell's info|warning|critical styling token. */
    private static String severityToken(String severity) {
        if (severity == null) {
            return "info";
        }
        return switch (severity) {
            case "critical" -> "critical";
            case "high" -> "warning";
            default -> "info";
        };
    }

    /** Group keys → distinct recipients (users by role, subscribers for 'public'). */
    private List<Map<String, Object>> resolveRecipients(List<String> groups) {
        List<Map<String, Object>> recipients = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (String group : groups) {
            List<Map<String, Object>> rows;
            if ("all_users".equals(group)) {
                rows = jdbc.queryForList("select id, 'user' as type, phone, email from public.users");
            } else if ("public".equals(group)) {
                // the public reaches the preparedness subscription registry
                rows = jdbc.queryForList(
                        "select id, 'subscriber' as type, phone_number as phone, email"
                                + " from public.alert_subscriptions where is_active = true");
            } else {
                rows = jdbc.queryForList("""
                        select distinct u.id, 'user' as type, u.phone, u.email from public.users u
                        join public.model_has_roles mhr on mhr.model_id = u.id
                        join public.roles r on r.id = mhr.role_id
                        where r.name = any (?)
                        """, (Object) GROUP_ROLES.get(group).toArray(new String[0]));
            }
            for (Map<String, Object> row : rows) {
                if (seen.add(row.get("type") + ":" + row.get("id"))) {
                    Map<String, Object> rec = new LinkedHashMap<>();   // LinkedHashMap (not Map.of) — phone/email may be null
                    rec.put("id", row.get("id"));
                    rec.put("type", row.get("type"));
                    rec.put("phone", row.get("phone"));
                    rec.put("email", row.get("email"));
                    recipients.add(rec);
                }
            }
        }
        return recipients;
    }

    // ─── History / details / retry ───

    @GetMapping("/alerts")
    public Map<String, Object> history() {
        return Map.of("alerts", alertList("limit 100", true));   // operational history — scope to the officer's area
    }

    /**
     * @param scopeArea when true, restrict incident-tied alerts to the caller's own area (region/district
     *        officers); alerts not tied to an incident keep a NULL {@code i.region_id}/{@code i.district_id}
     *        and so stay visible (shared-or-own). National + non-area roles add no predicate (full set).
     */
    private List<Map<String, Object>> alertList(String limit, boolean scopeArea) {
        StringBuilder sql = new StringBuilder("""
                select a.*, i.title as incident_title, u.name as created_by_name,
                       (select count(*) from public.alert_recipients ar where ar.alert_id = a.id) as total_recipients,
                       (select count(*) from public.alert_recipients ar
                          where ar.alert_id = a.id and ar.status in ('sent','delivered','read')) as delivered_count,
                       (select count(*) from public.alert_recipients ar
                          where ar.alert_id = a.id and ar.status = 'failed') as failed_count
                from public.alerts a
                left join public.incidents i on i.id = a.incident_id
                left join public.users u on u.id = a.created_by
                where 1=1""");
        List<Object> params = new ArrayList<>();
        if (scopeArea) {
            jurisdiction.appendAreaScopeSharedOrOwn("i", sql, params);
        }
        sql.append(" order by a.created_at desc ").append(limit);
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), params.toArray());
        // Parse the json columns so the API returns clean arrays, not PGobjects.
        rows.forEach(r -> { parseJsonField(r, "channels"); parseJsonField(r, "recipient_groups"); });
        return rows;
    }

    /** Replace a PG json column value (PGobject / string) with a parsed List in place. */
    private static void parseJsonField(Map<String, Object> row, String key) {
        Object v = row.get(key);
        if (v == null) {
            return;
        }
        try {
            String json = v.getClass().getSimpleName().equals("PGobject")
                    ? String.valueOf(v.getClass().getMethod("getValue").invoke(v))
                    : String.valueOf(v);
            row.put(key, json == null ? null : JSON.readValue(json, List.class));
        } catch (Exception e) {
            row.put(key, null);
        }
    }

    @GetMapping("/alerts/{id}")
    public Map<String, Object> alertDetails(@PathVariable long id) {
        // Area guard mirroring the history list (alertList shared-or-own): an alert tied to another area's
        // incident 404s for region/district officers, while alerts with NULL incident_id stay shared-visible.
        StringBuilder where = new StringBuilder("a.id = ?");
        List<Object> params = new ArrayList<>();
        params.add(id);
        jurisdiction.appendAreaScopeSharedOrOwn("i", where, params);
        List<Map<String, Object>> alerts = jdbc.queryForList(
                "select a.*, i.title as incident_title, u.name as created_by_name"
                        + " from public.alerts a"
                        + " left join public.incidents i on i.id = a.incident_id"
                        + " left join public.users u on u.id = a.created_by where " + where, params.toArray());
        if (alerts.isEmpty()) {
            throw new ResourceNotFoundException("Alert not found.");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("alert", alerts.get(0));
        out.put("recipients", jdbc.queryForList("""
                select ar.*, case when ar.recipient_type = 'user' then u.name
                                  else s.full_name end as recipient_name
                from public.alert_recipients ar
                left join public.users u on ar.recipient_type = 'user' and u.id = ar.recipient_id
                left join public.alert_subscriptions s on ar.recipient_type = 'subscriber' and s.id = ar.recipient_id
                where ar.alert_id = ? order by ar.delivery_method, recipient_name limit 300
                """, id));
        out.put("channel_breakdown", jdbc.queryForList("""
                select delivery_method as channel, count(*) as total,
                       count(*) filter (where status in ('sent','delivered','read')) as delivered,
                       count(*) filter (where status = 'failed') as failed
                from public.alert_recipients where alert_id = ? group by delivery_method
                """, id));
        return out;
    }

    /**
     * Retry every failed delivery of an alert by RE-DISPATCHING through the one gateway (reuses the same
     * resolveRecipients + ExternalDeliveryService.deliverAlert path as the original send). Not @Transactional
     * — like sendAlert, the reset auto-commits so the @Async sender sees the 'pending' rows. Truthful status:
     * rows go failed → pending → sent/failed from the REAL gateway outcome. Previously this faked 'sent' with
     * a bare UPDATE and sent nothing.
     */
    @PostMapping("/alerts/{id}/resend-failed")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    public Map<String, Object> resendFailed(@PathVariable long id) {
        Map<String, Object> alert = jdbc.queryForMap(
                "select title, message, recipient_groups from public.alerts where id = ?", id);
        Map<String, Map<String, Object>> byKey = new LinkedHashMap<>();
        for (Map<String, Object> m : resolveRecipients(jsonList(alert.get("recipient_groups")))) {
            byKey.put(m.get("type") + ":" + m.get("id"), m);
        }
        List<Map<String, Object>> failed = jdbc.queryForList(
                "select id, recipient_type, recipient_id, delivery_method"
                        + " from public.alert_recipients where alert_id = ? and status = 'failed'", id);
        List<Long> retryIds = new ArrayList<>();
        List<String> smsPhones = new ArrayList<>();
        List<String> emailAddrs = new ArrayList<>();
        for (Map<String, Object> f : failed) {
            Map<String, Object> m = byKey.get(f.get("recipient_type") + ":" + f.get("recipient_id"));
            if (m == null) { continue; }                                   // recipient no longer in the alert's groups
            String method = str(f.get("delivery_method"));
            if ("sms".equals(method)) {
                String p = str(m.get("phone"));
                if (p != null && !p.isBlank()) { smsPhones.add(p); retryIds.add(((Number) f.get("id")).longValue()); }
            } else if ("email".equals(method)) {
                String e = str(m.get("email"));
                if (e != null && e.contains("@")) { emailAddrs.add(e); retryIds.add(((Number) f.get("id")).longValue()); }
            }
        }
        if (retryIds.isEmpty()) {
            return Map.of("success", true, "retried", 0,
                    "message", "No failed deliveries have a valid phone/email on file to retry.");
        }
        // Reset ONLY the retryable rows to 'pending' (auto-committed), then re-send via the real gateway —
        // ExternalDeliveryService flips these 'pending' rows to the true sent/failed outcome.
        String in = retryIds.stream().map(x -> "?").collect(java.util.stream.Collectors.joining(","));
        jdbc.update("update public.alert_recipients set status = 'pending', updated_at = now() where id in (" + in + ")",
                retryIds.toArray());
        externalDelivery.deliverAlert(id, smsPhones.stream().distinct().toList(),
                emailAddrs.stream().distinct().toList(), str(alert.get("title")), str(alert.get("message")),
                users.actingUserId());
        return Map.of("success", true, "retried", retryIds.size(),
                "message", retryIds.size() + " failed delivery(ies) re-queued through the gateway.");
    }

    // ─── Templates ───

    @PostMapping("/templates")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    @Transactional
    public Map<String, Object> saveTemplate(@RequestBody Map<String, Object> body) throws Exception {
        String name = requireMax(body.get("name"), 255, "name");
        String type = requireIn(body.get("alert_type") == null ? body.get("type") : body.get("alert_type"),
                ALERT_TYPES, "type");
        String title = requireMax(body.get("title"), 255, "title");
        String message = requireMax(body.get("message"), 1000, "message");
        Long id = jdbc.queryForObject("""
                insert into public.alert_templates(name, type, category, subject, content, title, message,
                    variables, is_active, created_by, created_at, updated_at)
                values (?,?,?,?,?,?,?,?::json, true, ?, now(), now()) returning id
                """, Long.class, name, type, type, title, message, title, message,
                JSON.writeValueAsString(extractVariables(title + " " + message)), users.actingUserId());
        return Map.of("success", true, "id", id, "message", "Template saved successfully.");
    }

    @PostMapping("/templates/{id}")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    @Transactional
    public Map<String, Object> updateTemplate(@PathVariable long id, @RequestBody Map<String, Object> body) throws Exception {
        String message = requireMax(body.get("message"), 1000, "message");
        int updated = jdbc.update("""
                update public.alert_templates set name = ?, type = ?, category = ?, title = ?, subject = ?,
                    message = ?, content = ?, variables = ?::json, updated_at = now() where id = ?
                """, requireMax(body.get("name"), 255, "name"),
                requireIn(body.get("type"), ALERT_TYPES, "type"), requireIn(body.get("type"), ALERT_TYPES, "type"),
                requireMax(body.get("title"), 255, "title"), requireMax(body.get("title"), 255, "title"),
                message, message, JSON.writeValueAsString(extractVariables(String.valueOf(body.get("title")) + " " + message)), id);
        if (updated == 0) {
            throw new ResourceNotFoundException("Template not found.");
        }
        return Map.of("success", true, "message", "Template updated successfully.");
    }

    @PostMapping("/templates/{id}/toggle")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    @Transactional
    public Map<String, Object> toggleTemplate(@PathVariable long id) {
        int updated = jdbc.update(
                "update public.alert_templates set is_active = not is_active, updated_at = now() where id = ?", id);
        if (updated == 0) {
            throw new ResourceNotFoundException("Template not found.");
        }
        return Map.of("success", true, "message", "Template status toggled.");
    }

    @DeleteMapping("/templates/{id}")
    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    @Transactional
    public Map<String, Object> deleteTemplate(@PathVariable long id) {
        if (jdbc.update("delete from public.alert_templates where id = ?", id) == 0) {
            throw new ResourceNotFoundException("Template not found.");
        }
        return Map.of("success", true, "message", "Template deleted.");
    }

    /** Fill {placeholders} from an incident + now — the compose form's preview. */
    @PostMapping("/templates/{id}/preview")
    @PreAuthorize("hasAuthority('communication_and_alerts.view')")   // read-only POST, but gated so the coverage test holds
    public Map<String, Object> previewTemplate(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        List<Map<String, Object>> templates = jdbc.queryForList(
                "select title, message from public.alert_templates where id = ?", id);
        if (templates.isEmpty()) {
            throw new ResourceNotFoundException("Template not found.");
        }
        Map<String, String> vars = new LinkedHashMap<>();
        vars.put("time", LocalTime.now().withSecond(0).withNano(0).toString());
        vars.put("date", LocalDate.now().toString());
        Object incidentId = body == null ? null : body.get("incident_id");
        if (incidentId != null) {
            // Area guard: a region/district officer can only preview against an incident in their own area
            // (incidents are STRICT-scoped); a foreign incident 404s instead of leaking its title/location.
            areaGuard.assertOwn("public.incidents", (long) Double.parseDouble(String.valueOf(incidentId)));
            List<Map<String, Object>> incidents = jdbc.queryForList("""
                    select i.title, i.severity_level, coalesce(i.location_description,'') as location,
                           coalesce(d.name,'') as district
                    from public.incidents i left join public.districts d on d.id = i.district_id
                    where i.id = ?
                    """, (long) Double.parseDouble(String.valueOf(incidentId)));
            if (!incidents.isEmpty()) {
                Map<String, Object> incident = incidents.get(0);
                vars.put("incident_title", String.valueOf(incident.get("title")));
                vars.put("severity", String.valueOf(incident.get("severity_level")));
                vars.put("location", String.valueOf(incident.get("location")));
                vars.put("district", String.valueOf(incident.get("district")));
            }
        }
        String title = String.valueOf(templates.get(0).get("title"));
        String message = String.valueOf(templates.get(0).get("message"));
        for (Map.Entry<String, String> var : vars.entrySet()) {
            title = title.replace("{" + var.getKey() + "}", var.getValue());
            message = message.replace("{" + var.getKey() + "}", var.getValue());
        }
        return Map.of("title", title, "message", message);
    }

    // ─── Analytics ───

    @GetMapping("/analytics")
    public Map<String, Object> analytics() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("periods", jdbc.queryForMap("""
                select count(*) filter (where created_at > now() - interval '24 hours') as last_24h,
                       count(*) filter (where created_at > now() - interval '7 days') as last_7d,
                       count(*) filter (where created_at > now() - interval '30 days') as last_30d
                from public.alerts
                """));
        out.put("by_type", jdbc.queryForList(
                "select alert_type, count(*) as count from public.alerts group by alert_type order by count desc"));
        out.put("by_severity", jdbc.queryForList(
                "select severity, count(*) as count from public.alerts group by severity order by count desc"));
        return out;
    }

    // ─── helpers ───

    /** Pull the {placeholder} names out of a template body. */
    private static List<String> extractVariables(String titleAndMessage) {
        List<String> variables = new ArrayList<>();
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile("\\{(\\w+)}").matcher(titleAndMessage);
        while (matcher.find()) {
            if (!variables.contains(matcher.group(1))) {
                variables.add(matcher.group(1));
            }
        }
        return variables;
    }

    private static List<String> strList(Object raw) {
        List<String> out = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                out.add(String.valueOf(item));
            }
        }
        return out;
    }

    private static String requireIn(Object v, List<String> allowed, String field) {
        String s = require(v, field);
        if (!allowed.contains(s)) {
            throw new BusinessRuleException("The selected " + field + " is invalid.");
        }
        return s;
    }

    private static String requireMax(Object v, int max, String field) {
        String s = require(v, field);
        if (s.length() > max) {
            throw new BusinessRuleException("The " + field + " may not be greater than " + max + " characters.");
        }
        return s;
    }

    private static String require(Object v, String field) {
        String s = str(v);
        if (s == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return s;
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
