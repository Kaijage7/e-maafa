package tz.go.pmo.dmis.ew;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Writes the {@code sms_logs} audit rows for a send in a SEPARATE transaction ({@code REQUIRES_NEW}),
 * so an audit-write failure can never abort the caller's own transaction. This is what lets the
 * "logging never breaks a send" guarantee hold even for transactional callers (e.g. the public
 * unsubscribe flow, which is {@code @Transactional} and would otherwise be poisoned by a failed
 * insert). The recipient is clipped to the column width to avoid a varchar overflow.
 */
@Component
public class SmsAuditLogger {

    private static final Logger log = LoggerFactory.getLogger(SmsAuditLogger.class);
    private static final int PHONE_MAX = 20;   // sms_logs.recipient_phone is varchar(20)

    private final JdbcTemplate jdbc;

    public SmsAuditLogger(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** One sms_logs row per recipient: valid numbers at the real outcome, invalid as a failed row. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(String notificationType, Long notificationId, String message,
                       List<String> formatted, List<String> invalid,
                       boolean success, boolean configured, String messageId, String response, String error) {
        String status = success ? "sent" : (configured ? "failed" : "pending");
        String err = success ? null : error;
        for (String phone : formatted) {
            jdbc.update("""
                    insert into public.sms_logs(notification_type, notification_id, recipient_phone, message, status,
                        external_id, response_data, error_message, sent_at, retry_count, created_at, updated_at)
                    values (?,?,?,?,?,?,?,?, case when ?='sent' then now() else null end, 0, now(), now())
                    """, notificationType, notificationId, clip(phone), message, status,
                    messageId, response, err, status);
        }
        for (String bad : invalid) {
            jdbc.update("""
                    insert into public.sms_logs(notification_type, notification_id, recipient_phone, message, status,
                        external_id, response_data, error_message, sent_at, retry_count, created_at, updated_at)
                    values (?,?,?,?, 'failed', null, null, 'Invalid phone number', null, 0, now(), now())
                    """, notificationType, notificationId, clip(bad), message);
        }
    }

    private static String clip(String s) {
        return s != null && s.length() > PHONE_MAX ? s.substring(0, PHONE_MAX) : s;
    }
}
