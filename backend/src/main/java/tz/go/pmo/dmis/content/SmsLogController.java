package tz.go.pmo.dmis.content;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.ew.MgovSmsService;
import tz.go.pmo.dmis.notification.AudienceService;

/**
 * SMS Management (Content Management) — the delivery log of every SMS the platform sends through the
 * M-Gov gateway (public alerts, stakeholder notifications, dissemination), with status
 * (pending/sent/delivered/failed), gateway id and error. Also the compose surface: send a message to
 * one number or in bulk, straight from here. Every send goes through {@link MgovSmsService}, which
 * records the {@code sms_logs} row — so a manual send shows up in this same log automatically.
 */
@RestController
@RequestMapping("/v1/content/sms-logs")
public class SmsLogController {

    private final JdbcTemplate jdbc;
    private final MgovSmsService sms;
    private final AudienceService audiences;

    public SmsLogController(JdbcTemplate jdbc, MgovSmsService sms, AudienceService audiences) {
        this.jdbc = jdbc;
        this.sms = sms;
        this.audiences = audiences;
    }

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String search,
                                     @RequestParam(required = false) String from,
                                     @RequestParam(required = false) String to) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> p = new ArrayList<>();
        if (status != null && !status.isBlank()) { where.append(" and status = ?"); p.add(status); }
        if (search != null && !search.isBlank()) {
            where.append(" and (recipient_phone ilike ? or message ilike ?)");
            p.add("%" + search + "%"); p.add("%" + search + "%");
        }
        if (from != null && !from.isBlank()) { where.append(" and created_at >= ?::timestamptz"); p.add(from); }
        if (to != null && !to.isBlank()) { where.append(" and created_at < (?::timestamptz + interval '1 day')"); p.add(to); }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("logs", jdbc.queryForList("""
                select id, notification_type, recipient_phone, message, status, external_id,
                       error_message, sent_at, delivered_at, retry_count, created_at
                from public.sms_logs where %s order by created_at desc limit 300
                """.formatted(where), p.toArray()));
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status='delivered') as delivered,
                       count(*) filter (where status='sent') as sent,
                       count(*) filter (where status='pending') as pending,
                       count(*) filter (where status='failed') as failed
                from public.sms_logs
                """));
        out.put("by_type", jdbc.queryForList(
                "select coalesce(notification_type,'other') as notification_type, count(*) as count from public.sms_logs group by notification_type order by count desc"));
        out.put("configured", sms.isConfigured());
        return out;
    }

    /**
     * Compose &amp; send an SMS to one or many recipients (comma/newline-separated numbers or a list).
     * Routes through the M-Gov gateway, which logs each recipient to {@code sms_logs} as 'manual'.
     */
    @PostMapping("/send")
    @PreAuthorize(Authz.COMMS_DISSEMINATE)
    public Map<String, Object> send(@RequestBody Map<String, Object> body) {
        // Manual / pasted (incl. from-Excel) numbers, plus any selected audience group resolved live.
        Set<String> recipientSet = new LinkedHashSet<>(Recipients.parse(body.get("recipients")));
        boolean audiencePicked = false;
        if (body.get("audience") instanceof Map<?, ?> a && a.get("type") != null) {
            audiencePicked = true;
            recipientSet.addAll(audiences.resolve(str(a.get("type")), str(a.get("hazard")), str(a.get("role"))).phones());
        }
        List<String> recipients = new ArrayList<>(recipientSet);
        String message = String.valueOf(body.getOrDefault("message", "")).trim();
        if (recipients.isEmpty()) {
            return Map.of("success", false, "message", audiencePicked
                    ? "The selected audience has no phone numbers on record — those users/records have no phone set. Pick another audience or enter numbers manually."
                    : "At least one recipient number is required (enter numbers or pick an audience).");
        }
        if (message.isBlank()) {
            return Map.of("success", false, "message", "Message text is required.");
        }
        MgovSmsService.SmsResult r = sms.sendBulk(recipients, message, "manual", null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", r.success());
        out.put("message", r.message() == null ? "" : r.message());
        out.put("sent", r.formatted() == null ? 0 : r.formatted().size());
        out.put("invalid", r.invalid() == null ? 0 : r.invalid().size());
        out.put("configured", sms.isConfigured());
        return out;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
