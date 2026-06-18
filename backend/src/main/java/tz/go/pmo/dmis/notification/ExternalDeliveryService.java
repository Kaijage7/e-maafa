package tz.go.pmo.dmis.notification;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.ew.MgovSmsService;
import tz.go.pmo.dmis.notification.NotificationService.Notice;

/**
 * Off-thread SMS + email delivery for the NotificationService. Lives in its own bean so the
 * {@code @Async} proxy actually applies (self-invocation inside NotificationService would run
 * synchronously). Each send is recorded in sms_logs / email_logs.
 */
@Service
public class ExternalDeliveryService {

    private static final Logger log = LoggerFactory.getLogger(ExternalDeliveryService.class);

    private final JdbcTemplate jdbc;
    private final MgovSmsService sms;
    private final MailService mail;

    public ExternalDeliveryService(JdbcTemplate jdbc, MgovSmsService sms, MailService mail) {
        this.jdbc = jdbc;
        this.sms = sms;
        this.mail = mail;
    }

    @Async("notificationExecutor")
    public void deliver(Notice n, List<String> smsPhones, List<String> emailAddrs) {
        if (smsPhones != null && !smsPhones.isEmpty()) {
            try {
                String text = n.title() + (n.message() != null && !n.message().isBlank() ? ": " + n.message() : "");
                sms.sendBulk(smsPhones, text, n.type(), n.entityId());
            } catch (Exception e) {
                log.error("notify SMS delivery failed for type {}", n.type(), e);
            }
        }
        if (emailAddrs != null && !emailAddrs.isEmpty()) {
            try {
                String html = MailService.wrap(n.title(), (n.message() == null ? "" : n.message())
                        + (n.link() != null ? "\n\nOpen in e-MAAFA: " + n.link() : ""));
                mail.sendBulk(emailAddrs, "e-MAAFA: " + n.title(), html, n.type(), n.entityId(), null);
            } catch (Exception e) {
                log.error("notify email delivery failed for type {}", n.type(), e);
            }
        }
    }

    /**
     * Off-thread delivery for a Communication-Center alert: send the SMS + email bulks through the one
     * gateway, then flip the {@code alert_recipients} rows that {@code fanOut} left 'pending' to the real
     * outcome. Runs AFTER the (non-transactional) sendAlert committed those rows, so the connection is
     * never held across the M-Gov HTTP / SMTP I/O and a rolled-back tx can never discard a sent message.
     */
    @Async("notificationExecutor")
    public void deliverAlert(long alertId, List<String> smsPhones, List<String> emailAddrs,
                             String title, String message, Long actingUser) {
        String text = title + (message != null && !message.isBlank() ? ": " + message : "");
        if (smsPhones != null && !smsPhones.isEmpty()) {
            String status;
            try {
                MgovSmsService.SmsResult r = sms.sendBulk(smsPhones, text, "alert", alertId);
                status = r.success() ? "sent" : (sms.isConfigured() ? "failed" : "pending");
            } catch (Exception e) {
                log.error("alert {} SMS delivery failed", alertId, e);
                status = "failed";
            }
            updateAlertStatus(alertId, "sms", status);
        }
        if (emailAddrs != null && !emailAddrs.isEmpty()) {
            String status;
            try {
                MailService.MailResult mr = mail.sendBulk(emailAddrs, "e-MAAFA: " + title,
                        MailService.wrap(title, message), "alert", alertId, actingUser);
                status = mr.success() ? "sent" : (mail.isConfigured() ? "failed" : "pending");
            } catch (Exception e) {
                log.error("alert {} email delivery failed", alertId, e);
                status = "failed";
            }
            updateAlertStatus(alertId, "email", status);
        }
    }

    /** Flip the pending alert_recipients rows for one channel to the gateway outcome. */
    private void updateAlertStatus(long alertId, String channel, String status) {
        jdbc.update("update public.alert_recipients set status = ?, "
                + "sent_at = case when ? = 'sent' then now() else sent_at end, updated_at = now() "
                + "where alert_id = ? and delivery_method = ? and status = 'pending'",
                status, status, alertId, channel);
    }

    /**
     * Off-thread delivery for a One Health dissemination: send the SMS + email through the one gateway,
     * then flip the {@code oh_dissemination_logs} rows that sendDissemination left 'pending' to the real
     * outcome and write the true {@code sms_sent_count}/{@code email_sent_count}. Invoked after the
     * approve/resend transaction commits (so the 'pending' rows are visible) — no I/O inside the tx, and
     * no more "[gateway wiring deferred]" rows recorded as 'sent' when nothing went out.
     */
    @Async("notificationExecutor")
    public void deliverOhDissemination(long dissId, List<String> smsPhones, List<String> emailAddrs,
                                       String smsBody, String emailSubject, String emailHtml) {
        if (smsPhones != null && !smsPhones.isEmpty()) {
            String status;
            try {
                MgovSmsService.SmsResult r = sms.sendBulk(smsPhones, smsBody, "oh_dissemination", dissId);
                status = r.success() ? "sent" : (sms.isConfigured() ? "failed" : "pending");
            } catch (Exception e) {
                log.error("OH dissemination {} SMS delivery failed", dissId, e);
                status = "failed";
            }
            updateOhLogs(dissId, "sms", status);
            jdbc.update("update public.oh_disseminations set sms_sent_count = ?, updated_at = now() where id = ?",
                    "sent".equals(status) ? smsPhones.size() : 0, dissId);
        }
        if (emailAddrs != null && !emailAddrs.isEmpty()) {
            String status;
            try {
                MailService.MailResult mr = mail.sendBulk(emailAddrs, emailSubject, emailHtml, "oh_dissemination", dissId, null);
                status = mr.success() ? "sent" : (mail.isConfigured() ? "failed" : "pending");
            } catch (Exception e) {
                log.error("OH dissemination {} email delivery failed", dissId, e);
                status = "failed";
            }
            updateOhLogs(dissId, "email", status);
            jdbc.update("update public.oh_disseminations set email_sent_count = ?, updated_at = now() where id = ?",
                    "sent".equals(status) ? emailAddrs.size() : 0, dissId);
        }
    }

    private void updateOhLogs(long dissId, String channel, String status) {
        jdbc.update("update public.oh_dissemination_logs set status = ?, updated_at = now() "
                + "where dissemination_id = ? and channel = ? and status = 'pending'", status, dissId, channel);
    }
}
