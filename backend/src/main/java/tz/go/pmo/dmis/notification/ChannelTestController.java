package tz.go.pmo.dmis.notification;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.ew.MgovSmsService;
import org.springframework.security.access.prepost.PreAuthorize;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Admin diagnostics: fire a real message down each channel (SMS / email) independently so an
 * operator can confirm the gateways are live without driving a whole business flow. Used by the
 * SMS/Email Management screen "Send test" buttons and during commissioning.
 */
@RestController
@RequestMapping("/v1/notifications/test")
public class ChannelTestController {

    private final MgovSmsService sms;
    private final MailService mail;

    public ChannelTestController(MgovSmsService sms, MailService mail) {
        this.sms = sms;
        this.mail = mail;
    }

    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    @PostMapping("/sms")
    public Map<String, Object> testSms(@RequestBody Map<String, Object> body) {
        String phone = str(body.get("phone"));
        String message = firstNonBlank(str(body.get("message")), "e-MAAFA DMIS test SMS.");
        Map<String, Object> out = new LinkedHashMap<>();
        if (phone == null || phone.isBlank()) {
            out.put("success", false);
            out.put("message", "phone is required");
            return out;
        }
        MgovSmsService.SmsResult r = sms.sendBulk(List.of(phone), message, "sms_test", null);
        out.put("success", r.success());
        out.put("message", r.message());
        out.put("messageId", r.messageId());
        out.put("configured", sms.isConfigured());
        return out;
    }

    @PreAuthorize("hasAuthority('communication_and_alerts.send')")
    @PostMapping("/email")
    public Map<String, Object> testEmail(@RequestBody Map<String, Object> body) {
        String to = str(body.get("email"));
        String subject = firstNonBlank(str(body.get("subject")), "e-MAAFA DMIS test email");
        String message = firstNonBlank(str(body.get("message")),
                "This is a test email from the e-MAAFA DMIS notification service. If you received it, email delivery is working.");
        Map<String, Object> out = new LinkedHashMap<>();
        if (to == null || to.isBlank() || !to.contains("@")) {
            out.put("success", false);
            out.put("message", "valid email is required");
            return out;
        }
        MailService.MailResult r = mail.send(to, subject, MailService.wrap(subject, message), "channel_test", null, null);
        out.put("success", r.success());
        out.put("message", r.message());
        out.put("sent", r.sent());
        out.put("failed", r.failed());
        out.put("configured", mail.isConfigured());
        return out;
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static String firstNonBlank(String a, String b) {
        return a != null && !a.isBlank() ? a : b;
    }
}
