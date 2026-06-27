package tz.go.pmo.dmis.ew;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.notification.MailService;

/**
 * EW boundary for the native dissemination + monitoring screens — a FAITHFUL port of the Laravel
 * EwDisseminationController + EwMonitoringController (routes/api.php /ew/*), preserving identical
 * request/response contracts. (Spring context-path is /api, so these map under /ew → /api/ew/*.)
 */
@RestController
@RequestMapping("/ew")
// Reads (stakeholder list, monitoring index) stay authenticated; each WRITE is role-gated per method below
// (dissemination, gateway test, field reports, update-request) — see the method-level @PreAuthorize.
@PreAuthorize("isAuthenticated()")
public class EwBoundaryController {

    private final JdbcTemplate jdbc;
    private final MgovSmsService mgov;
    private final MailService mail;   // real SMTP (the email branch was fabricating 'sent' without a send)
    private final JurisdictionScope jurisdiction;

    public EwBoundaryController(JdbcTemplate jdbc, MgovSmsService mgov, MailService mail,
                               JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.mgov = mgov;
        this.mail = mail;
        this.jurisdiction = jurisdiction;
    }

    // ── GET /ew/stakeholders — active stakeholders with contact info (EwDisseminationController@stakeholders)
    @GetMapping("/stakeholders")
    public Map<String, Object> stakeholders() {
        // Area-scope the directory exactly like /v1/stakeholders: shared-or-own (NULL area = national/shared).
        // National tier sees all; in-area officers see their own + shared; cross-area rows are hidden.
        StringBuilder where = new StringBuilder(" where s.is_active = true");
        List<Object> params = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("s", where, params);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select s.id, coalesce(s.organization, s.name) as organization, s.name, s.type, s.email, s.phone, " +
            "s.contact_person_name as contact_person, s.contact_person_phone, s.contact_person_email " +
            "from public.stakeholders s" + where + " order by organization",
            params.toArray());
        return Map.of("success", true, "count", rows.size(), "stakeholders", rows);
    }

    // ── POST /ew/disseminate — dual SMS (public vs leaders) + email (EwDisseminationController@disseminate)
    @PostMapping("/disseminate")
    @PreAuthorize("hasAuthority('early_warning.disseminate')")
    @SuppressWarnings("unchecked")
    public Map<String, Object> disseminate(@RequestBody Map<String, Object> body) {
        String bulletinNum = str(body.get("bulletin_number"));
        if (bulletinNum == null || bulletinNum.isBlank()) throw new BusinessRuleException("bulletin_number is required.");
        List<Object> channels = body.get("channels") instanceof List ? (List<Object>) body.get("channels") : List.of();
        List<Object> ids = body.get("stakeholder_ids") instanceof List ? (List<Object>) body.get("stakeholder_ids") : List.of();
        if (channels.isEmpty()) throw new BusinessRuleException("At least one channel (sms|email) is required.");
        if (ids.isEmpty()) throw new BusinessRuleException("At least one stakeholder is required.");

        List<Map<String, Object>> sts = jdbc.queryForList(
            "select type, email, phone, contact_person_phone, contact_person_email from public.stakeholders " +
            "where id in (" + ids.stream().map(x -> "?").reduce((a, b) -> a + "," + b).orElse("null") + ")",
            ids.toArray());

        int smsSent = 0, smsFailed = 0, emailSent = 0, emailFailed = 0;
        List<Map<String, Object>> details = new ArrayList<>();

        if (channels.contains("sms")) {
            Set<String> publicPhones = new LinkedHashSet<>(), leaderPhones = new LinkedHashSet<>();
            for (Map<String, Object> s : sts) {
                boolean leader = "government".equalsIgnoreCase(str(s.get("type")));
                Set<String> bucket = leader ? leaderPhones : publicPhones;
                addIf(bucket, s.get("phone")); addIf(bucket, s.get("contact_person_phone"));
            }
            String publicMsg = firstNonBlank(str(body.get("message_public")), str(body.get("message_sw")), str(body.get("message")));
            String leaderMsg = firstNonBlank(str(body.get("message_leaders")), str(body.get("message")), publicMsg);
            if (!publicPhones.isEmpty()) {
                Map<String, Object> r = sendBulkSms(publicPhones, clip("ONYO LA MAAFA #" + bulletinNum + ": " + n(publicMsg)), "ew_dissemination");
                boolean ok = (boolean) r.get("success"); if (ok) smsSent += publicPhones.size(); else smsFailed += publicPhones.size();
                details.add(Map.of("channel", "sms", "group", "public", "recipients", publicPhones.size(), "status", ok ? "sent" : "failed", "message_id", n(str(r.get("messageId")))));
            }
            if (!leaderPhones.isEmpty()) {
                Map<String, Object> r = sendBulkSms(leaderPhones, clip("TAARIFA YA MAAFA #" + bulletinNum + ": " + n(leaderMsg)), "ew_dissemination");
                boolean ok = (boolean) r.get("success"); if (ok) smsSent += leaderPhones.size(); else smsFailed += leaderPhones.size();
                details.add(Map.of("channel", "sms", "group", "leaders", "recipients", leaderPhones.size(), "status", ok ? "sent" : "failed", "message_id", n(str(r.get("messageId")))));
            }
        }
        if (channels.contains("email")) {
            Set<String> emails = new LinkedHashSet<>();
            for (Map<String, Object> s : sts) { addIf(emails, s.get("email")); addIf(emails, s.get("contact_person_email")); }
            if (!emails.isEmpty()) {
                // REAL SMTP send (was fabricating 'sent' without sending): MailService logs each in email_logs.
                String subject = "Early Warning Bulletin #" + bulletinNum;
                String bodyText = firstNonBlank(str(body.get("message_leaders")), str(body.get("message_public")),
                        str(body.get("message")), str(body.get("message_sw")));
                MailService.MailResult mr = mail.sendBulk(new ArrayList<>(emails), subject,
                        MailService.wrap(subject, n(bodyText)), "ew_dissemination", null, null);
                emailSent = mr.sent();
                emailFailed = mr.failed();
                String status = mail.isConfigured() ? (mr.sent() > 0 ? "sent" : "failed") : "pending";
                details.add(Map.of("channel", "email", "recipients", emails.size(), "status", status,
                        "sent", mr.sent(), "failed", mr.failed()));
            }
        }
        int totalSent = smsSent + emailSent, totalFailed = smsFailed + emailFailed;
        Map<String, Object> results = new LinkedHashMap<>();
        results.put("sms_sent", smsSent); results.put("email_sent", emailSent);
        results.put("sms_failed", smsFailed); results.put("email_failed", emailFailed); results.put("details", details);
        return Map.of("success", totalSent > 0,
            "message", "Disseminated to " + totalSent + " recipients" + (totalFailed > 0 ? " (" + totalFailed + " failed)" : ""),
            "results", results);
    }

    // ── POST /ew/sms-test — M-Gov gateway test (EwDisseminationController@testSms)
    @PostMapping("/sms-test")
    @PreAuthorize("hasAuthority('early_warning.disseminate')")
    public Map<String, Object> smsTest(@RequestBody Map<String, Object> body) {
        String phone = str(body.get("phone"));
        if (phone == null || phone.isBlank()) throw new BusinessRuleException("phone is required.");
        String message = firstNonBlank(str(body.get("message")), "e-MAAFA Test SMS");
        Map<String, Object> r = sendBulkSms(Set.of(phone), message, "sms_test");
        return Map.of("success", r.get("success"), "message", r.get("message"), "messageId", n(str(r.get("messageId"))), "phone", phone);
    }

    // ── GET /ew/monitoring/reports — focal-point reports (EwMonitoringController@index)
    @GetMapping("/monitoring/reports")
    public Map<String, Object> reports(@RequestParam(required = false) String bulletin_number,
                                       @RequestParam(required = false) String warning_code) {
        StringBuilder sql = new StringBuilder("select * from public.ew_focal_point_reports where 1=1");
        List<Object> args = new ArrayList<>();
        if (bulletin_number != null) { sql.append(" and bulletin_number = ?"); args.add(bulletin_number); }
        if (warning_code != null) { sql.append(" and warning_code = ?"); args.add(warning_code); }
        sql.append(" order by created_at desc limit 100");
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), args.toArray());
        return Map.of("success", true, "count", rows.size(), "reports", rows);
    }

    // ── POST /ew/monitoring/reports — store one (EwMonitoringController@store)
    @PostMapping("/monitoring/reports")
    @Transactional
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> storeReport(@RequestBody Map<String, Object> r) {
        Long id = insertReport(r);
        return Map.of("success", true, "message", "Report saved successfully.", "id", id);
    }

    // ── POST /ew/monitoring/reports/batch — store many (EwMonitoringController@storeBatch)
    @PostMapping("/monitoring/reports/batch")
    @Transactional
    @PreAuthorize("hasAuthority('early_warning.create')")
    @SuppressWarnings("unchecked")
    public Map<String, Object> storeBatch(@RequestBody Map<String, Object> body) {
        List<Object> reports = body.get("reports") instanceof List ? (List<Object>) body.get("reports") : List.of();
        if (reports.isEmpty()) throw new BusinessRuleException("reports array is required.");
        int saved = 0;
        for (Object o : reports) { if (o instanceof Map) { insertReport((Map<String, Object>) o); saved++; } }
        return Map.of("success", true, "message", saved + " reports saved successfully.", "count", saved);
    }

    // ── POST /ew/monitoring/request-update — SMS to focal points (EwMonitoringController@requestUpdate)
    @PostMapping("/monitoring/request-update")
    @PreAuthorize("hasAuthority('early_warning.disseminate')")
    @SuppressWarnings("unchecked")
    public Map<String, Object> requestUpdate(@RequestBody Map<String, Object> body) {
        String message = str(body.get("message"));
        if (message == null || message.isBlank()) throw new BusinessRuleException("message is required.");
        List<Object> phonesIn = body.get("phones") instanceof List ? (List<Object>) body.get("phones") : List.of();
        Set<String> phones = new LinkedHashSet<>();
        for (Object p : phonesIn) addIf(phones, p);
        if (phones.isEmpty()) return Map.of("success", false, "message", "No valid phone numbers provided.");
        Map<String, Object> r = sendBulkSms(phones, message, "ew_monitoring_request");
        return Map.of("success", r.get("success"), "message", "Update request sent to " + phones.size() + " focal points.", "recipients", phones.size());
    }

    // ── helpers ───────────────────────────────────────────────────────────────────────────────────
    private Long insertReport(Map<String, Object> r) {
        Long userId = currentUserId();
        Number id = jdbc.queryForObject(
            "insert into public.ew_focal_point_reports (bulletin_number, warning_code, focal_point_name, phone, " +
            "location, role, status, report_details, actions_taken, actions_planned, bulletin_received, " +
            "impact_verified, people_affected, households_evacuated, reported_by) " +
            "values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) returning id", Number.class,
            str(r.get("bulletin_number")), str(r.get("warning_code")), req(str(r.get("focal_point_name")), "focal_point_name"),
            str(r.get("phone")), str(r.get("location")), str(r.get("role")),
            firstNonBlank(str(r.get("status")), "awaiting"), str(r.get("report_details")),
            str(r.get("actions_taken")), str(r.get("actions_planned")), bool(r.get("bulletin_received")),
            bool(r.get("impact_verified")), intOrNull(r.get("people_affected")), intOrNull(r.get("households_evacuated")), userId);
        return id.longValue();
    }

    /** REAL send via the M-Gov gateway (MgovSmsService) + record each recipient in sms_logs with the ACTUAL
     * outcome (sent when the gateway confirms, failed on a gateway error, pending if no creds configured). */
    private Map<String, Object> sendBulkSms(Set<String> phones, String message, String type) {
        MgovSmsService.SmsResult r = mgov.sendBulk(new ArrayList<>(phones), message, type, null);
        return Map.of("success", r.success(), "message", r.message() == null ? "" : r.message(), "messageId", r.messageId() == null ? "" : r.messageId());
    }

    private Long currentUserId() {
        try {
            String name = tz.go.pmo.dmis.common.security.SecurityUtils.currentUserName();
            if (name != null && !name.isBlank() && !name.equalsIgnoreCase("System")) {
                List<Long> ids = jdbc.queryForList("select id from public.users where email = ? or name = ? limit 1", Long.class, name, name);
                if (!ids.isEmpty()) return ids.get(0);
            }
        } catch (Exception ignored) { }
        return null;
    }

    private static void addIf(Set<String> set, Object v) { String s = str(v); if (s != null && !s.isBlank()) set.add(s.trim()); }
    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
    private static String n(String s) { return s == null ? "" : s; }
    private static String firstNonBlank(String... xs) { for (String x : xs) if (x != null && !x.isBlank()) return x; return null; }
    private static String clip(String s) { return s.length() > 480 ? s.substring(0, 477) + "..." : s; }
    private static boolean bool(Object o) { return o instanceof Boolean b ? b : "true".equalsIgnoreCase(str(o)); }
    private static Integer intOrNull(Object o) {
        if (o instanceof Number num) return num.intValue();
        try { return o == null || str(o).isBlank() ? null : Integer.parseInt(str(o).trim()); } catch (Exception e) { return null; }
    }
    private static String req(String v, String field) { if (v == null || v.isBlank()) throw new BusinessRuleException(field + " is required."); return v; }
}
