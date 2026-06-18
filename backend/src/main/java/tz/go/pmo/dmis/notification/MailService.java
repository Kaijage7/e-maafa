package tz.go.pmo.dmis.notification;

import jakarta.mail.internet.MimeMessage;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Service;

/**
 * Real email sender — Gmail SMTP via Spring's JavaMailSender (faithful equivalent of the Laravel
 * App\Services\EmailService / BulkEmailService). Sends HTML mail and records every attempt in
 * public.email_logs (mirror of sms_logs) so delivery is auditable. Credentials come from
 * spring.mail.* (env: MAIL_USERNAME / MAIL_PASSWORD) — a blank username ⇒ not configured ⇒ no send.
 */
@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final JavaMailSender mailSender;
    private final JdbcTemplate jdbc;

    @Value("${spring.mail.username:}") private String fromAddress;
    @Value("${dmis.mail.from-name:e-MAAFA DMIS}") private String fromName;

    public MailService(JavaMailSender mailSender, JdbcTemplate jdbc) {
        this.mailSender = mailSender;
        this.jdbc = jdbc;
    }

    public boolean isConfigured() {
        return fromAddress != null && !fromAddress.isBlank();
    }

    public record MailResult(boolean success, String message, int sent, int failed) {}

    /** A file to attach to a composed email. */
    public record Attachment(String filename, String contentType, byte[] data) {}

    /**
     * Compose &amp; send from the Communication Center: wrap the plain message into the branded HTML shell,
     * attach any files, send per-recipient, and log the PLAIN message to email_logs (so the delivery log is
     * readable text, never the raw HTML wrapper). Separate from {@link #sendBulk} so existing callers that
     * already pass pre-wrapped HTML are unchanged.
     */
    public MailResult sendComposed(List<String> recipients, String subject, String plainMessage,
                                   List<Attachment> attachments, Long sentBy) {
        if (recipients == null || recipients.isEmpty()) {
            return new MailResult(false, "No recipients", 0, 0);
        }
        String html = wrap(subject, plainMessage);
        boolean multipart = attachments != null && !attachments.isEmpty();
        if (!isConfigured()) {
            for (String to : recipients) {
                logEmail("manual", null, to, subject, plainMessage, "pending",
                        null, "Mail not configured (set MAIL_USERNAME / MAIL_PASSWORD).", sentBy);
            }
            return new MailResult(false, "Mail gateway not configured (set MAIL_USERNAME / MAIL_PASSWORD).", 0, recipients.size());
        }
        int sent = 0, failed = 0;
        for (String to : recipients) {
            if (to == null || to.isBlank() || !to.contains("@")) {
                logEmail("manual", null, to, subject, plainMessage, "failed", null, "Invalid address", sentBy);
                failed++;
                continue;
            }
            try {
                MimeMessage msg = mailSender.createMimeMessage();
                MimeMessageHelper helper = new MimeMessageHelper(msg, multipart, "UTF-8");
                helper.setTo(to.trim());
                helper.setSubject(subject);
                helper.setText(html, true);
                try {
                    helper.setFrom(fromAddress, fromName);
                } catch (Exception ignore) {
                    helper.setFrom(fromAddress);
                }
                if (multipart) {
                    for (Attachment a : attachments) {
                        helper.addAttachment(a.filename(), new ByteArrayResource(a.data()), a.contentType());
                    }
                }
                mailSender.send(msg);
                logEmail("manual", null, to, subject, plainMessage, "sent", "OK", null, sentBy);
                sent++;
            } catch (Exception e) {
                log.error("Composed email to {} failed", to, e);
                logEmail("manual", null, to, subject, plainMessage, "failed", null, String.valueOf(e), sentBy);
                failed++;
            }
        }
        log.info("Composed email '{}' → {} sent / {} failed ({} attachment(s))", subject, sent, failed,
                multipart ? attachments.size() : 0);
        return new MailResult(failed == 0, sent + " sent, " + failed + " failed", sent, failed);
    }

    /** Send one HTML email and log it. */
    public MailResult send(String to, String subject, String htmlBody, String notificationType, Long notificationId, Long sentBy) {
        return sendBulk(List.of(to), subject, htmlBody, notificationType, notificationId, sentBy);
    }

    /**
     * Send an HTML email to each recipient (separate message per recipient — no leaked address list),
     * recording each in email_logs. Returns an aggregate result.
     */
    public MailResult sendBulk(List<String> recipients, String subject, String htmlBody,
                               String notificationType, Long notificationId, Long sentBy) {
        if (recipients == null || recipients.isEmpty()) {
            return new MailResult(false, "No recipients", 0, 0);
        }
        if (!isConfigured()) {
            // Record as pending so the audit trail shows what WOULD have gone out once SMTP is set.
            for (String to : recipients) {
                logEmail(notificationType, notificationId, to, subject, htmlBody, "pending",
                        null, "Mail not configured (set MAIL_USERNAME / MAIL_PASSWORD).", sentBy);
            }
            return new MailResult(false, "Mail gateway not configured (set MAIL_USERNAME / MAIL_PASSWORD).", 0, recipients.size());
        }
        int sent = 0, failed = 0;
        for (String to : recipients) {
            if (to == null || to.isBlank() || !to.contains("@")) {
                logEmail(notificationType, notificationId, to, subject, htmlBody, "failed", null, "Invalid address", sentBy);
                failed++;
                continue;
            }
            try {
                MimeMessage msg = mailSender.createMimeMessage();
                MimeMessageHelper helper = new MimeMessageHelper(msg, false, "UTF-8");
                helper.setTo(to.trim());
                helper.setSubject(subject);
                helper.setText(htmlBody, true);
                try {
                    helper.setFrom(fromAddress, fromName);
                } catch (Exception ignore) {
                    helper.setFrom(fromAddress);
                }
                mailSender.send(msg);
                logEmail(notificationType, notificationId, to, subject, htmlBody, "sent", "OK", null, sentBy);
                sent++;
            } catch (Exception e) {
                log.error("Email send to {} failed", to, e);
                logEmail(notificationType, notificationId, to, subject, htmlBody, "failed", null, String.valueOf(e), sentBy);
                failed++;
            }
        }
        log.info("Email '{}' → {} sent / {} failed", subject, sent, failed);
        return new MailResult(failed == 0, sent + " sent, " + failed + " failed", sent, failed);
    }

    private void logEmail(String type, Long notifId, String to, String subject, String body,
                          String status, String response, String error, Long sentBy) {
        try {
            // email_logs.subject is varchar(255); truncate so a long subject can't abort the audit write
            // for a mail that actually went out (the message itself keeps the full subject).
            String subj = subject != null && subject.length() > 255 ? subject.substring(0, 255) : subject;
            jdbc.update("""
                    insert into public.email_logs(notification_type, notification_id, recipient_email, subject,
                        message, status, response_data, error_message, sent_at, sent_by, created_at, updated_at)
                    values (?,?,?,?,?,?,?,?, case when ? = 'sent' then now() else null end, ?, now(), now())
                    """, type, notifId, to, subj, body, status, response, error, status, sentBy);
        } catch (Exception e) {
            log.warn("email_logs write failed: {}", e.toString());
        }
    }

    /** Minimal HTML wrapper for plain-text notification bodies (branded e-MAAFA shell). */
    public static String wrap(String title, String body) {
        String safeBody = body == null ? "" : body.replace("\n", "<br>");
        return """
                <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
                  <div style="background:#0d6efd;color:#fff;padding:16px 20px;font-size:16px;font-weight:bold">e-MAAFA &mdash; Disaster Management Information System</div>
                  <div style="padding:20px;color:#1f2937">
                    <h2 style="margin:0 0 12px;font-size:18px;color:#111827">%s</h2>
                    <p style="line-height:1.6;font-size:14px">%s</p>
                  </div>
                  <div style="padding:12px 20px;background:#f8fafc;color:#64748b;font-size:12px;border-top:1px solid #e2e8f0">
                    Prime Minister's Office &mdash; Disaster Management Department. This is an automated message; please do not reply.
                  </div>
                </div>""".formatted(title == null ? "Notification" : title, safeBody);
    }
}
