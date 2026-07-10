package tz.go.pmo.dmis.notification;

import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import tz.go.pmo.dmis.ew.MgovSmsService;

/**
 * F59: bounded automatic retry of failed/pending SMS (and failed email) log rows.
 * <ul>
 *   <li>SMS: re-send through {@link MgovSmsService} when gateway is configured</li>
 *   <li>Email: re-send through {@link MailService} when SMTP is configured</li>
 *   <li>Cap: {@code dmis.delivery.max-retries} (default 3)</li>
 *   <li>Age: only rows older than 2 minutes (avoid racing the original send) and younger than 48h</li>
 * </ul>
 * Does not invent DLR — only re-attempts gateway submission; handset confirmation stays on the DLR webhook.
 */
@Component
public class DeliveryRetryScheduler {

    private static final Logger log = LoggerFactory.getLogger(DeliveryRetryScheduler.class);

    private final JdbcTemplate jdbc;
    private final MgovSmsService sms;
    private final MailService mail;

    @Value("${dmis.delivery.max-retries:3}")
    private int maxRetries;

    @Value("${dmis.delivery.retry-enabled:true}")
    private boolean enabled;

    public DeliveryRetryScheduler(JdbcTemplate jdbc, MgovSmsService sms, MailService mail) {
        this.jdbc = jdbc;
        this.sms = sms;
        this.mail = mail;
    }

    @Scheduled(fixedDelayString = "${dmis.delivery.retry-delay-ms:120000}")
    public void retryFailedDeliveries() {
        if (!enabled) {
            return;
        }
        int smsRetried = retrySms();
        int emailRetried = retryEmail();
        if (smsRetried > 0 || emailRetried > 0) {
            log.info("delivery retry sweep: sms={}, email={}", smsRetried, emailRetried);
        }
    }

    private int retrySms() {
        if (!sms.isConfigured()) {
            return 0;
        }
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, recipient_phone, message, notification_type, notification_id, retry_count
                  from public.sms_logs
                 where status in ('failed','pending')
                   and retry_count < ?
                   and created_at < now() - interval '2 minutes'
                   and created_at > now() - interval '48 hours'
                   and coalesce(message,'') <> ''
                   and coalesce(recipient_phone,'') <> ''
                 order by created_at
                 limit 25
                """, maxRetries);
        int n = 0;
        for (Map<String, Object> row : rows) {
            long id = ((Number) row.get("id")).longValue();
            String phone = String.valueOf(row.get("recipient_phone"));
            String message = String.valueOf(row.get("message"));
            String type = row.get("notification_type") == null ? "retry" : String.valueOf(row.get("notification_type"));
            Long notifId = row.get("notification_id") == null ? null : ((Number) row.get("notification_id")).longValue();
            try {
                MgovSmsService.SmsResult r = sms.sendBulk(List.of(phone), message, type + "_retry", notifId);
                int retries = row.get("retry_count") == null ? 0 : ((Number) row.get("retry_count")).intValue();
                if (r.success()) {
                    jdbc.update("""
                            update public.sms_logs
                               set status = 'sent', sent_at = coalesce(sent_at, now()),
                                   external_id = coalesce(?, external_id),
                                   retry_count = ?, error_message = null, updated_at = now()
                             where id = ?
                            """, r.messageId(), retries + 1, id);
                } else {
                    jdbc.update("""
                            update public.sms_logs
                               set retry_count = ?, error_message = left(?, 500), updated_at = now()
                             where id = ?
                            """, retries + 1, r.message(), id);
                }
                n++;
            } catch (Exception e) {
                log.warn("SMS retry id={} failed: {}", id, e.toString());
                jdbc.update("update public.sms_logs set retry_count = retry_count + 1, updated_at = now() where id = ?", id);
            }
        }
        return n;
    }

    private int retryEmail() {
        if (!mail.isConfigured()) {
            return 0;
        }
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, recipient_email, subject, message, notification_type, notification_id, retry_count, sent_by
                  from public.email_logs
                 where status in ('failed','pending')
                   and retry_count < ?
                   and created_at < now() - interval '2 minutes'
                   and created_at > now() - interval '48 hours'
                   and coalesce(recipient_email,'') like '%@%'
                 order by created_at
                 limit 15
                """, maxRetries);
        int n = 0;
        for (Map<String, Object> row : rows) {
            long id = ((Number) row.get("id")).longValue();
            String to = String.valueOf(row.get("recipient_email"));
            String subject = row.get("subject") == null ? "e-MAAFA" : String.valueOf(row.get("subject"));
            String message = row.get("message") == null ? "" : String.valueOf(row.get("message"));
            String type = row.get("notification_type") == null ? "retry" : String.valueOf(row.get("notification_type"));
            Long notifId = row.get("notification_id") == null ? null : ((Number) row.get("notification_id")).longValue();
            Long sentBy = row.get("sent_by") == null ? null : ((Number) row.get("sent_by")).longValue();
            int retries = row.get("retry_count") == null ? 0 : ((Number) row.get("retry_count")).intValue();
            try {
                // Prefer plain body in logs; wrap for transport.
                MailService.MailResult r = mail.sendBulk(List.of(to), subject,
                        MailService.wrap(subject, message), type + "_retry", notifId, sentBy);
                if (r.success()) {
                    jdbc.update("""
                            update public.email_logs
                               set status = 'sent', sent_at = coalesce(sent_at, now()),
                                   retry_count = ?, error_message = null, updated_at = now()
                             where id = ?
                            """, retries + 1, id);
                } else {
                    jdbc.update("""
                            update public.email_logs
                               set retry_count = ?, error_message = left(?, 500), updated_at = now()
                             where id = ?
                            """, retries + 1, r.message(), id);
                }
                n++;
            } catch (Exception e) {
                log.warn("Email retry id={} failed: {}", id, e.toString());
                jdbc.update("update public.email_logs set retry_count = retry_count + 1, updated_at = now() where id = ?", id);
            }
        }
        return n;
    }
}
