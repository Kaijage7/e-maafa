package tz.go.pmo.dmis.service.impl;

import tz.go.pmo.dmis.service.support.Recipients;

import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.service.EmailLogService;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import tz.go.pmo.dmis.notification.AudienceService;
import tz.go.pmo.dmis.notification.MailService;

/**
 * Email Management (Communication Center) — the delivery log of every email the platform sends through
 * the SMTP gateway, with status (pending/sent/delivered/failed), subject and error. The exact mirror
 * of {@link SmsLogController} over {@code email_logs}, plus a compose surface (send to one or many).
 * Every send goes through {@link MailService}, which records the {@code email_logs} row — so a manual
 * send shows up in this same log automatically.
 */
@Service
public class EmailLogServiceImpl implements EmailLogService {

    private final JdbcTemplate jdbc;
    private final MailService mail;
    private final AudienceService audiences;

    public EmailLogServiceImpl(JdbcTemplate jdbc, MailService mail, AudienceService audiences) {
        this.jdbc = jdbc;
        this.mail = mail;
        this.audiences = audiences;
    }

    @Override
    public Map<String, Object> index(String status,
                                     String search,
                                     String from,
                                     String to) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> p = new ArrayList<>();
        if (status != null && !status.isBlank()) { where.append(" and status = ?"); p.add(status); }
        if (search != null && !search.isBlank()) {
            where.append(" and (recipient_email ilike ? or subject ilike ? or message ilike ?)");
            p.add("%" + search + "%"); p.add("%" + search + "%"); p.add("%" + search + "%");
        }
        if (from != null && !from.isBlank()) { where.append(" and created_at >= ?::timestamptz"); p.add(from); }
        if (to != null && !to.isBlank()) { where.append(" and created_at < (?::timestamptz + interval '1 day')"); p.add(to); }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("logs", jdbc.queryForList("""
                select id, notification_type, recipient_email, subject, message, status, error_message,
                       sent_at, delivered_at, retry_count, created_at
                from public.email_logs where %s order by created_at desc limit 300
                """.formatted(where), p.toArray()));
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status='delivered') as delivered,
                       count(*) filter (where status='sent') as sent,
                       count(*) filter (where status='pending') as pending,
                       count(*) filter (where status='failed') as failed
                from public.email_logs
                """));
        out.put("by_type", jdbc.queryForList(
                "select coalesce(notification_type,'other') as notification_type, count(*) as count from public.email_logs group by notification_type order by count desc"));
        out.put("configured", mail.isConfigured());
        return out;
    }

    /**
     * Compose &amp; send an email to one or many recipients (comma/newline-separated addresses or a list).
     * Routes through {@link MailService}, which logs each recipient to {@code email_logs} as 'manual'.
     */
    @Override
    public Map<String, Object> send(Map<String, Object> body) {
        // Manual / pasted (incl. from-Excel) addresses, plus any selected audience group resolved live.
        Set<String> recipientSet = new LinkedHashSet<>(Recipients.parse(body.get("recipients")));
        boolean audiencePicked = false;
        if (body.get("audience") instanceof Map<?, ?> a && a.get("type") != null) {
            audiencePicked = true;
            recipientSet.addAll(audiences.resolve(str(a.get("type")), str(a.get("hazard")), str(a.get("role")),
                    tz.go.pmo.dmis.notification.AudienceService.agencyIdsFrom(a.get("agencyIds"))).emails());
        }
        List<String> recipients = new ArrayList<>(recipientSet);
        String subject = String.valueOf(body.getOrDefault("subject", "")).trim();
        String message = String.valueOf(body.getOrDefault("message", "")).trim();
        if (recipients.isEmpty()) {
            return Map.of("success", false, "message", audiencePicked
                    ? "The selected audience has no email addresses on record. Pick another audience or enter addresses manually."
                    : "At least one recipient email is required (enter addresses or pick an audience).");
        }
        if (message.isBlank()) {
            return Map.of("success", false, "message", "Message text is required.");
        }
        if (subject.isBlank()) {
            subject = "e-MAAFA Notification";
        }
        MailService.MailResult r = mail.sendComposed(recipients, subject, message, parseAttachments(body.get("attachments")), null);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", r.success());
        out.put("message", r.message() == null ? "" : r.message());
        out.put("sent", r.sent());
        out.put("failed", r.failed());
        out.put("configured", mail.isConfigured());
        return out;
    }

    /** Parse optional attachments: a list of {filename, contentType, content} where content is base64
     *  (a data-URL prefix like "data:...;base64," is tolerated). Bad/oversized entries are skipped. */
    private static List<MailService.Attachment> parseAttachments(Object raw) {
        List<MailService.Attachment> out = new ArrayList<>();
        if (!(raw instanceof List<?> list)) {
            return out;
        }
        for (Object o : list) {
            if (!(o instanceof Map<?, ?> m)) { continue; }
            String content = str(m.get("content"));
            if (content == null || content.isBlank()) { continue; }
            int comma = content.indexOf(",");
            if (content.startsWith("data:") && comma > 0) { content = content.substring(comma + 1); }
            try {
                byte[] data = java.util.Base64.getDecoder().decode(content.replaceAll("\\s", ""));
                if (data.length == 0 || data.length > 10 * 1024 * 1024) { continue; }   // cap 10MB
                String name = str(m.get("filename"));
                String type = str(m.get("contentType"));
                out.add(new MailService.Attachment(
                        name == null || name.isBlank() ? "attachment" : name,
                        type == null || type.isBlank() ? "application/octet-stream" : type,
                        data));
            } catch (IllegalArgumentException ignored) {
                // skip an attachment whose base64 won't decode rather than fail the whole send
            }
        }
        return out;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }
}
