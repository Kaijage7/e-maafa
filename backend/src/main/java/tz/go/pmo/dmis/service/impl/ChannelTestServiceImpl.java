package tz.go.pmo.dmis.service.impl;

import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.notification.MailService;
import tz.go.pmo.dmis.service.ChannelTestService;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import tz.go.pmo.dmis.ew.MgovSmsService;

/**
 * Admin diagnostics: fire a real message down each channel (SMS / email) independently so an
 * operator can confirm the gateways are live without driving a whole business flow. Used by the
 * SMS/Email Management screen "Send test" buttons and during commissioning.
 */
@Service
public class ChannelTestServiceImpl implements ChannelTestService {

    private final MgovSmsService sms;
    private final MailService mail;

    public ChannelTestServiceImpl(MgovSmsService sms, MailService mail) {
        this.sms = sms;
        this.mail = mail;
    }

    @Override
    public Map<String, Object> testSms(Map<String, Object> body) {
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

    @Override
    public Map<String, Object> testEmail(Map<String, Object> body) {
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
