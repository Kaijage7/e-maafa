package tz.go.pmo.dmis.notification;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Communication Center overview — the one cross-channel rollup of everything the platform sends:
 * SMS ({@code sms_logs}), email ({@code email_logs}), in-app ({@code resource_notifications}) and
 * broadcast alerts ({@code alerts}). Real counts (no hardcoded bars), with per-channel success rate
 * and by-channel / by-type / by-corner breakdowns plus a recent-activity feed across all corners.
 */
@RestController
@RequestMapping("/v1/communication")
public class CommunicationOverviewController {

    private final JdbcTemplate jdbc;
    private final AudienceService audiences;

    public CommunicationOverviewController(JdbcTemplate jdbc, AudienceService audiences) {
        this.jdbc = jdbc;
        this.audiences = audiences;
    }

    /** Audiences the compose form can target (group counts) + the hazard and role sub-pickers. */
    @PreAuthorize("hasAuthority('communication_and_alerts.view')")
    @GetMapping("/audiences")
    public Map<String, Object> audiences() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("audiences", audiences.audiences());
        out.put("hazards", audiences.hazards());
        out.put("roles", audiences.roles());
        return out;
    }

    /** Map a notification_type to the originating corner — used for the by-corner breakdown. */
    private static final String CORNER = """
            case
              when notification_type like 'oh\\_%' escape '\\' then 'One Health'
              when notification_type like 'ew\\_%' escape '\\' then 'Early Warning'
              when notification_type = 'alert' then 'Response / Alerts'
              when notification_type like 'alert\\_%' escape '\\' then 'Subscribers'
              when notification_type like 'warehouse%' then 'Warehouse'
              when notification_type like 'stakeholder%' then 'Stakeholder'
              when notification_type like 'task%' or notification_type like 'approval%'
                   or notification_type like 'dispatch%' then 'Response'
              when notification_type like 'training%' then 'Preparedness'
              when notification_type = 'manual' then 'Manual / Compose'
              when notification_type in ('sms_test','channel_test') then 'Diagnostics'
              else 'Other'
            end""";

    @PreAuthorize("hasAuthority('communication_and_alerts.view')")
    @GetMapping("/overview")
    public Map<String, Object> overview(@RequestParam(defaultValue = "month") String range) {
        String since = since(range);
        Map<String, Object> out = new LinkedHashMap<>();

        Map<String, Object> sms = jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status in ('sent','delivered')) as sent,
                       count(*) filter (where status='delivered') as delivered,
                       count(*) filter (where status='pending') as pending,
                       count(*) filter (where status='failed') as failed
                from public.sms_logs where %s""".formatted(since));
        out.put("sms", withRate(sms));

        Map<String, Object> email = jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status in ('sent','delivered')) as sent,
                       count(*) filter (where status='delivered') as delivered,
                       count(*) filter (where status='pending') as pending,
                       count(*) filter (where status='failed') as failed
                from public.email_logs where %s""".formatted(since));
        out.put("email", withRate(email));

        Map<String, Object> inapp = jdbc.queryForMap(("""
                select count(*) as total, count(*) filter (where is_read=false) as unread
                from public.resource_notifications where %s""").formatted(since));
        out.put("inapp", inapp);

        Map<String, Object> alerts = jdbc.queryForMap(("""
                select count(*) as total, count(*) filter (where sent_at::date = current_date) as today
                from public.alerts where %s""").formatted(sinceCol(range, "coalesce(sent_at, created_at)")));
        out.put("alerts", alerts);

        out.put("by_channel", List.of(
                Map.of("channel", "SMS", "count", num(sms.get("total"))),
                Map.of("channel", "Email", "count", num(email.get("total"))),
                Map.of("channel", "In-App", "count", num(inapp.get("total"))),
                Map.of("channel", "Alerts", "count", num(alerts.get("total")))));

        out.put("by_type", jdbc.queryForList("""
                select notification_type, channel, count(*) as count from (
                  select coalesce(notification_type,'other') as notification_type, 'SMS' as channel from public.sms_logs where %s
                  union all
                  select coalesce(notification_type,'other'), 'Email' from public.email_logs where %s
                ) t group by notification_type, channel order by count desc limit 30""".formatted(since, since)));

        out.put("by_corner", jdbc.queryForList(("""
                select corner, count(*) as count from (
                  select %s as corner from public.sms_logs where %s
                  union all
                  select %s from public.email_logs where %s
                ) t group by corner order by count desc""").formatted(CORNER, since, CORNER, since)));

        out.put("recent", jdbc.queryForList("""
                select * from (
                  select 'SMS' as channel, coalesce(notification_type,'other') as type, recipient_phone as recipient, status, created_at from public.sms_logs
                  union all
                  select 'Email', coalesce(notification_type,'other'), recipient_email, status, created_at from public.email_logs
                  union all
                  select 'In-App', coalesce(type,'other'), title, case when is_read then 'read' else 'unread' end, created_at from public.resource_notifications
                ) t order by created_at desc limit 25"""));

        return out;
    }

    /** Add a success_rate (% of total that reached sent/delivered) to a channel stats map. */
    private static Map<String, Object> withRate(Map<String, Object> s) {
        long total = num(s.get("total"));
        long ok = num(s.get("sent"));
        s.put("success_rate", total == 0 ? 0 : Math.round(ok * 100.0 / total));
        return s;
    }

    private static long num(Object o) {
        return o instanceof Number n ? n.longValue() : 0;
    }

    /** Safe range predicate over created_at (range is a fixed enum, never interpolated user text). */
    private static String since(String range) {
        return sinceCol(range, "created_at");
    }

    private static String sinceCol(String range, String col) {
        return switch (range == null ? "month" : range.toLowerCase()) {
            case "today" -> col + " >= current_date";
            case "week" -> col + " >= now() - interval '7 days'";
            case "all" -> "1=1";
            default -> col + " >= date_trunc('month', now())";
        };
    }
}
