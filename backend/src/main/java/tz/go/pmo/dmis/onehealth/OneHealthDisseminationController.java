package tz.go.pmo.dmis.onehealth;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import org.springframework.security.access.prepost.PreAuthorize;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.notification.ExternalDeliveryService;
import tz.go.pmo.dmis.notification.MailService;

/**
 * Port of OneHealth\OneHealthDisseminationController + the send/approve flows of
 * OneHealthService: dual-track creation (stakeholder/public), the approval gate
 * that triggers sending, per-recipient delivery logs, resend, and the recipients
 * lookup for the creation modal. Sending records recipients and counts exactly as
 * the source ("ONE HEALTH ALERT:" / "PMO-DMD ONE HEALTH PUBLIC ALERT:" bodies,
 * public SMS capped at 100); the M-Gov/SMTP gateway call itself is a deployment
 * concern and is logged locally.
 */
@RestController
@RequestMapping("/v1/onehealth")
public class OneHealthDisseminationController {

    private static final Logger log = LoggerFactory.getLogger(OneHealthDisseminationController.class);
    private static final int MAX_PUBLIC_RECIPIENTS = 100; // config('services.mgov.max_public_recipients', 100)

    private final JdbcTemplate jdbc;
    private final OneHealthEventService service;
    private final ObjectMapper objectMapper;
    private final Path storageRoot;
    private final ExternalDeliveryService delivery; // the one async SMS+SMTP sender (real gateway)
    private final AreaGuard areaGuard;
    private final JurisdictionScope jurisdiction;

    public OneHealthDisseminationController(JdbcTemplate jdbc, OneHealthEventService service,
                                            ObjectMapper objectMapper, ExternalDeliveryService delivery,
                                            AreaGuard areaGuard, JurisdictionScope jurisdiction,
                                            @Value("${dmis.storage.public-root:./storage}") String publicRoot) {
        this.jdbc = jdbc;
        this.service = service;
        this.objectMapper = objectMapper;
        this.delivery = delivery;
        this.areaGuard = areaGuard;
        this.jurisdiction = jurisdiction;
        this.storageRoot = Path.of(publicRoot);
    }

    // ─── Index ───

    @GetMapping("/disseminations")
    public Map<String, Object> index(@RequestParam(name = "dissemination_type", required = false) String type,
                                     @RequestParam(name = "approval_status", required = false) String approvalStatus,
                                     @RequestParam(required = false) String status,
                                     @RequestParam(defaultValue = "1") int page) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        if (notBlank(type)) {
            where.append(" and d.dissemination_type = ?");
            params.add(type);
        }
        if (notBlank(approvalStatus)) {
            where.append(" and d.approval_status = ?");
            params.add(approvalStatus);
        }
        if (notBlank(status)) {
            where.append(" and d.status = ?");
            params.add(status);
        }
        // Disseminations have no area column; scope via the parent event's region/district using the SAME
        // shared-or-own policy the OH events list uses (national/NULL-area events stay visible; other regions'
        // events are hidden) so an area officer never sees another region's disseminations.
        jurisdiction.appendAreaScopeSharedOrOwn("e", where, params);
        long total = jdbc.queryForObject(
                "select count(*) from public.oh_disseminations d join public.oh_events e on e.id = d.event_id where " + where,
                Long.class, params.toArray());
        int perPage = 15;
        int lastPage = (int) Math.max(1, Math.ceil(total / (double) perPage));
        int currentPage = Math.min(Math.max(1, page), lastPage);
        int offset = (currentPage - 1) * perPage;

        List<Object> listParams = new ArrayList<>(params);
        listParams.add(perPage);
        listParams.add(offset);
        List<Map<String, Object>> rows = new ArrayList<>();
        jdbc.query("""
                select d.id, d.event_id, d.dissemination_type, d.alert_message, d.approval_status, d.status,
                    d.sms_sent_count, d.email_sent_count, d.created_at, e.event_id as event_code, e.id as event_pk
                from public.oh_disseminations d
                join public.oh_events e on e.id = d.event_id
                where %s
                order by d.created_at desc
                limit ? offset ?
                """.formatted(where), rs -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("event_pk", rs.getLong("event_pk"));
            m.put("event_code", rs.getString("event_code"));
            m.put("dissemination_type", rs.getString("dissemination_type"));
            m.put("alert_message", OneHealthEventService.limit(rs.getString("alert_message"), 50));
            m.put("approval_status", rs.getString("approval_status"));
            m.put("status", rs.getString("status"));
            m.put("sms_sent_count", rs.getInt("sms_sent_count"));
            m.put("email_sent_count", rs.getInt("email_sent_count"));
            m.put("created_at", OneHealthEventService.formatDate(new java.sql.Date(rs.getTimestamp("created_at").getTime())));
            rows.add(m);
        }, listParams.toArray());

        // Stats roll-up must use the same area scope as the list (only filters that touch area are the
        // jurisdiction predicate on e; the dissemination_type/approval/status request filters are deliberately
        // excluded from the stats card, matching the original which aggregated the whole — now area-scoped — set).
        StringBuilder statsWhere = new StringBuilder("1=1");
        List<Object> statsParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("e", statsWhere, statsParams);
        Map<String, Object> stats = jdbc.queryForMap("""
                select count(*) as total,
                    count(*) filter (where d.approval_status = 'pending') as pending_approval,
                    count(*) filter (where d.status = 'sent') as sent,
                    count(*) filter (where d.status = 'failed') as failed
                from public.oh_disseminations d join public.oh_events e on e.id = d.event_id
                where %s
                """.formatted(statsWhere), statsParams.toArray());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", rows);
        out.put("currentPage", currentPage);
        out.put("lastPage", lastPage);
        out.put("total", total);
        out.put("firstItem", total == 0 ? null : offset + 1);
        out.put("lastItem", total == 0 ? null : offset + rows.size());
        out.put("stats", stats);
        return out;
    }

    // ─── Show ───

    @GetMapping("/disseminations/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        // Scope via the parent event's area (disseminations carry no area column); out-of-area 404s.
        areaGuard.assertParentOwnOrShared("public.oh_disseminations", "event_id", "public.oh_events", id);
        Map<String, Object> d = findOr404(id);
        long eventId = ((Number) d.get("event_id")).longValue();
        Map<String, Object> event = jdbc.queryForMap("select id, event_id, status from public.oh_events where id = ?", eventId);

        List<Map<String, Object>> stakeholders = jdbc.queryForList("""
                select s.id, s.organization, s.name, s.email, s.phone, ds.acknowledgement_status, ds.acknowledged_at
                from public.oh_dissemination_stakeholders ds
                join public.stakeholders s on s.id = ds.stakeholder_id
                where ds.dissemination_id = ?
                order by s.organization
                """, id);

        List<Map<String, Object>> logs = new ArrayList<>();
        jdbc.query("""
                select channel, recipient, status, created_at from public.oh_dissemination_logs
                where dissemination_id = ? order by id desc
                """, rs -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("channel", rs.getString("channel"));
            m.put("recipient", rs.getString("recipient"));
            m.put("status", rs.getString("status"));
            m.put("created_at", OneHealthEventService.formatDateTime(rs.getTimestamp("created_at")));
            logs.add(m);
        }, id);

        Map<String, Object> logStats = jdbc.queryForMap("""
                select count(*) as total,
                    count(*) filter (where status = 'sent') as sent,
                    count(*) filter (where status = 'delivered') as delivered,
                    count(*) filter (where status = 'failed') as failed,
                    count(*) filter (where status = 'pending') as pending
                from public.oh_dissemination_logs where dissemination_id = ?
                """, id);

        String approvedByName = name(d.get("approved_by"));
        String sentByName = name(d.get("sent_by"));

        Map<String, Object> out = new LinkedHashMap<>(d);
        out.put("channels", parseJsonArray(d.get("channels")));
        out.put("target_audience", parseJsonArray(d.get("target_audience")));
        out.put("approved_at", formatTs(d.get("approved_at")));
        out.put("sent_at", formatTs(d.get("sent_at")));
        out.put("created_at", formatTs(d.get("created_at")));
        out.remove("uploaded_recipients");
        out.put("event", event);
        out.put("stakeholders", stakeholders);
        for (Map<String, Object> s : stakeholders) {
            s.put("acknowledged_at", formatTs(s.get("acknowledged_at")));
        }
        out.put("logs", logs.size() > 50 ? logs.subList(0, 50) : logs);
        out.put("log_count", logs.size());
        out.put("log_stats", logStats);
        out.put("approved_by_name", approvedByName);
        out.put("sent_by_name", sentByName);
        out.put("can_approve", true); // local sessions act as Super Admin
        return out;
    }

    // ─── Store (dual track) ───

    @PreAuthorize("hasAuthority('one_health.disseminate')")
    @PostMapping(value = "/events/{eventId}/disseminations/stakeholder", consumes = {MediaType.MULTIPART_FORM_DATA_VALUE, MediaType.APPLICATION_JSON_VALUE})
    @Transactional
    public ResponseEntity<Map<String, Object>> storeStakeholder(@PathVariable long eventId,
            @RequestParam Map<String, String> form,
            @RequestParam(name = "stakeholder_ids", required = false) List<Long> stakeholderIds,
            @RequestParam(name = "channels", required = false) List<String> channels,
            @RequestPart(name = "recipient_file", required = false) MultipartFile recipientFile) {
        service.findEventOr404(eventId);
        // The dissemination inherits the event's area; block creating one on a cross-area event (404).
        areaGuard.assertOwnOrShared("public.oh_events", eventId);
        Map<String, List<String>> errors = new LinkedHashMap<>();
        String alertMessage = trim(form.get("alert_message"));
        String sector = trim(form.get("sector"));
        String directives = trim(form.get("directives"));
        if (alertMessage == null) {
            add(errors, "alert_message", "The alert message field is required.");
        }
        if (sector == null) {
            add(errors, "sector", "The sector field is required.");
        }
        if (directives == null) {
            add(errors, "directives", "The directives field is required.");
        } else if (directives.length() > 500) {
            add(errors, "directives", "The directives must not be greater than 500 characters.");
        }
        if ((stakeholderIds == null || stakeholderIds.isEmpty()) && (recipientFile == null || recipientFile.isEmpty())) {
            add(errors, "stakeholder_ids", "The stakeholder ids field is required when recipient file is not present.");
        }
        if (channels == null || channels.isEmpty()) {
            add(errors, "channels", "The channels field is required.");
        }
        String language = trim(form.get("language"));
        if (language != null && !List.of("en", "sw", "both").contains(language)) {
            add(errors, "language", "The selected language is invalid.");
        }
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed", "errors", errors));
        }

        Uploaded uploaded = storeRecipientFile(recipientFile);
        Long dissId = jdbc.queryForObject("""
                insert into public.oh_disseminations(event_id, dissemination_type, alert_message, alert_message_sw,
                    sector, directives, channels, language, approval_status, status, uploaded_file,
                    uploaded_recipients, sms_sent_count, email_sent_count, created_at, updated_at)
                values (?,'stakeholder',?,?,?,?,?::json,?,'pending','pending_approval',?,?::json,0,0,now(),now())
                returning id
                """, Long.class,
                eventId, alertMessage, trim(form.get("alert_message_sw")), sector, directives,
                toJson(channels), language == null ? "both" : language,
                uploaded.path(), uploaded.recipientsJson());
        if (stakeholderIds != null) {
            for (Long sId : stakeholderIds) {
                jdbc.update("""
                        insert into public.oh_dissemination_stakeholders(dissemination_id, stakeholder_id, created_at, updated_at)
                        values (?,?,now(),now()) on conflict do nothing
                        """, dissId, sId);
            }
        }
        int recipientCount = stakeholderIds == null ? 0 : stakeholderIds.size();
        int uploadCount = uploaded.count();
        String message = "Stakeholder dissemination created";
        if (recipientCount > 0) {
            message += " for " + recipientCount + " stakeholder(s)";
        }
        if (uploadCount > 0) {
            message += (recipientCount > 0 ? " and " : " with ") + uploadCount + " uploaded recipient(s)";
        }
        message += " and is pending approval.";
        return ResponseEntity.ok(Map.of("success", true, "message", message, "id", dissId));
    }

    @PreAuthorize("hasAuthority('one_health.disseminate')")
    @PostMapping(value = "/events/{eventId}/disseminations/public", consumes = {MediaType.MULTIPART_FORM_DATA_VALUE, MediaType.APPLICATION_JSON_VALUE})
    @Transactional
    public ResponseEntity<Map<String, Object>> storePublic(@PathVariable long eventId,
            @RequestParam Map<String, String> form,
            @RequestParam(name = "target_audience", required = false) List<String> targetAudience,
            @RequestParam(name = "channels", required = false) List<String> channels,
            @RequestPart(name = "recipient_file", required = false) MultipartFile recipientFile) {
        service.findEventOr404(eventId);
        // The dissemination inherits the event's area; block creating one on a cross-area event (404).
        areaGuard.assertOwnOrShared("public.oh_events", eventId);
        Map<String, List<String>> errors = new LinkedHashMap<>();
        String alertMessage = trim(form.get("alert_message"));
        String directives = trim(form.get("directives"));
        if (alertMessage == null) {
            add(errors, "alert_message", "The alert message field is required.");
        }
        if (directives == null) {
            add(errors, "directives", "The directives field is required.");
        } else if (directives.length() > 500) {
            add(errors, "directives", "The directives must not be greater than 500 characters.");
        }
        if ((targetAudience == null || targetAudience.isEmpty()) && (recipientFile == null || recipientFile.isEmpty())) {
            add(errors, "target_audience", "The target audience field is required when recipient file is not present.");
        }
        if (channels == null || channels.isEmpty()) {
            add(errors, "channels", "The channels field is required.");
        }
        String language = trim(form.get("language"));
        if (language != null && !List.of("en", "sw", "both").contains(language)) {
            add(errors, "language", "The selected language is invalid.");
        }
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed", "errors", errors));
        }

        Uploaded uploaded = storeRecipientFile(recipientFile);
        Long dissId = jdbc.queryForObject("""
                insert into public.oh_disseminations(event_id, dissemination_type, alert_message, alert_message_sw,
                    directives, target_audience, channels, language, approval_status, status, uploaded_file,
                    uploaded_recipients, sms_sent_count, email_sent_count, created_at, updated_at)
                values (?,'public',?,?,?,?::json,?::json,?,'pending','pending_approval',?,?::json,0,0,now(),now())
                returning id
                """, Long.class,
                eventId, alertMessage, trim(form.get("alert_message_sw")), directives,
                toJson(targetAudience == null ? List.of() : targetAudience), toJson(channels),
                language == null ? "both" : language, uploaded.path(), uploaded.recipientsJson());
        int uploadCount = uploaded.count();
        String message = "Public dissemination created";
        if (uploadCount > 0) {
            message += " with " + uploadCount + " uploaded recipient(s)";
        }
        message += " and is pending approval.";
        return ResponseEntity.ok(Map.of("success", true, "message", message, "id", dissId));
    }

    // ─── Approve / Reject ───

    @PreAuthorize("hasAuthority('one_health.approve')")
    @PostMapping("/disseminations/{id}/approve")
    @Transactional
    public ResponseEntity<Map<String, Object>> approve(@PathVariable long id, @org.springframework.web.bind.annotation.RequestBody Map<String, Object> body) {
        findOr404(id);
        String action = OneHealthEventService.strOf(body.get("approval_status"));
        if (action == null || !List.of("approved", "rejected").contains(action)) {
            return ResponseEntity.ok(Map.of("success", false, "message", "Invalid approval action"));
        }
        Long userId = service.actingUserId();
        String userName = jdbc.query("select name from public.users where id = ?",
                rs -> rs.next() ? rs.getString(1) : "Unknown", userId);
        jdbc.update("""
                update public.oh_disseminations set approval_status = ?, approval_remarks = ?,
                    approved_by = ?, approved_at = now(), status = ?, updated_at = now()
                where id = ?
                """, action, ucfirst(action) + " by " + userName, userId,
                "approved".equals(action) ? "approved" : "draft", id);

        if ("approved".equals(action)) {
            Map<String, Object> results = sendDissemination(id);
            return ResponseEntity.ok(Map.of("success", true,
                    "message", "Dissemination approved and sent.", "stats", results));
        }
        return ResponseEntity.ok(Map.of("success", true, "message", "Dissemination rejected."));
    }

    // ─── Acknowledge (stakeholder-session action; PMO sessions get the source 403) ───

    @PreAuthorize("hasAuthority('one_health.acknowledge')")
    @PostMapping("/disseminations/{id}/acknowledge")
    public ResponseEntity<Map<String, Object>> acknowledge(@PathVariable long id) {
        findOr404(id);
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("success", false, "message", "You are not associated with a stakeholder."));
    }

    // ─── Resend ───

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PostMapping("/disseminations/{id}/resend")
    @Transactional
    public Map<String, Object> resend(@PathVariable long id) {
        // resend dispatches REAL SMS/email — block cross-area resends (404), keeping the one_health.manage gate.
        areaGuard.assertParentOwnOrShared("public.oh_disseminations", "event_id", "public.oh_events", id);
        findOr404(id);
        Map<String, Object> results = sendDissemination(id);
        return Map.of("success", true, "message", "Dissemination resent successfully.", "stats", results);
    }

    // ─── Recipients lookup for the creation modal ───

    @GetMapping("/disseminations/recipients")
    public Map<String, Object> recipients(@RequestParam(name = "event_id") long eventId,
                                          @RequestParam String type) {
        Map<String, Object> ev = service.findEventOr404(eventId);
        List<Map<String, Object>> recipients;
        if ("stakeholder".equals(type)) {
            Long areaId = ev.get("area_of_concern_id") == null ? null : ((Number) ev.get("area_of_concern_id")).longValue();
            recipients = areaId == null ? List.of() : jdbc.queryForList("""
                    select s.id, s.organization, s.name, s.email, s.phone from public.stakeholders s
                    join public.oh_area_stakeholder asx on asx.stakeholder_id = s.id
                    where asx.area_of_concern_id = ? and s.is_active = true order by s.id
                    """, areaId);
        } else {
            recipients = jdbc.queryForList("""
                    select id, organization, name, email, phone from public.stakeholders
                    where is_active = true order by id
                    """);
        }
        return Map.of("success", true, "recipients", recipients);
    }

    // ─── OneHealthService::sendDissemination port ───

    private Map<String, Object> sendDissemination(long id) {
        Map<String, Object> d = findOr404(id);
        List<String> channels = parseJsonArray(d.get("channels"));
        String type = (String) d.get("dissemination_type");
        long eventId = ((Number) d.get("event_id")).longValue();
        int smsSent = 0;
        int emailSent = 0;

        if ("stakeholder".equals(type)) {
            List<Map<String, Object>> stakeholders = jdbc.queryForList("""
                    select s.email, s.phone, s.contact_person_phone from public.oh_dissemination_stakeholders ds
                    join public.stakeholders s on s.id = ds.stakeholder_id
                    where ds.dissemination_id = ?
                    """, id);
            if (channels.contains("email")) {
                Set<String> emails = new LinkedHashSet<>();
                for (Map<String, Object> s : stakeholders) {
                    if (s.get("email") != null) {
                        emails.add((String) s.get("email"));
                    }
                }
                for (String email : emails) {
                    logRecipient(id, "email", email);
                    log.info("OH dissemination {}: email 'One Health Alert' to {} [gateway wiring deferred]", id, email);
                }
                emailSent = emails.size();
            }
            if (channels.contains("sms")) {
                Set<String> phones = new LinkedHashSet<>();
                for (Map<String, Object> s : stakeholders) {
                    if (s.get("phone") != null) {
                        phones.add((String) s.get("phone"));
                    }
                    if (s.get("contact_person_phone") != null) {
                        phones.add((String) s.get("contact_person_phone"));
                    }
                }
                String smsBody = "ONE HEALTH ALERT: " + (d.get("directives") == null ? "" : d.get("directives"));
                for (String phone : phones) {
                    logRecipient(id, "sms", phone);
                    log.info("OH dissemination {}: SMS '{}' to {} [gateway wiring deferred]", id,
                            OneHealthEventService.limit(smsBody, 60), phone);
                }
                smsSent = phones.size();
            }
        } else {
            // Public track: active stakeholders in the event's region or with no region
            // stakeholders has a `region` TEXT column (no region_id) — the original region_id filter 500'd.
            // Match by the event's region NAME; null event-region falls back to all active stakeholders.
            String regionName = jdbc.query(
                    "select r.name from public.oh_events e left join public.regions r on r.id = e.region_id where e.id = ?",
                    rs -> rs.next() ? rs.getString(1) : null, eventId);
            if (channels.contains("sms")) {
                List<Map<String, Object>> rows = jdbc.queryForList("""
                        select phone, contact_person_phone from public.stakeholders
                        where is_active = true and (?::text is null or region is null or region = ?)
                        """, regionName, regionName);
                Set<String> phones = new LinkedHashSet<>();
                for (Map<String, Object> s : rows) {
                    if (s.get("phone") != null) {
                        phones.add((String) s.get("phone"));
                    }
                    if (s.get("contact_person_phone") != null) {
                        phones.add((String) s.get("contact_person_phone"));
                    }
                }
                List<String> capped = new ArrayList<>(phones).subList(0, Math.min(phones.size(), MAX_PUBLIC_RECIPIENTS));
                String smsBody = "PMO-DMD ONE HEALTH PUBLIC ALERT: " + (d.get("alert_message") == null ? "" : d.get("alert_message"));
                for (String phone : capped) {
                    logRecipient(id, "sms", phone);
                    log.info("OH dissemination {}: public SMS '{}' to {} [gateway wiring deferred]", id,
                            OneHealthEventService.limit(smsBody, 60), phone);
                }
                smsSent = capped.size();
            }
            if (channels.contains("email")) {
                List<String> emails = jdbc.queryForList(
                        "select distinct email from public.stakeholders where is_active = true and email is not null",
                        String.class);
                for (String email : emails) {
                    logRecipient(id, "email", email);
                }
                emailSent = emails.size();
            }
        }

        // Uploaded recipients (Excel/CSV import) are also notified on their provided contacts
        List<Map<String, Object>> uploaded = parseUploadedRecipients(d.get("uploaded_recipients"));
        for (Map<String, Object> r : uploaded) {
            Object phone = r.get("phone");
            Object email = r.get("email");
            if (channels.contains("sms") && phone != null && !String.valueOf(phone).isBlank()) {
                logRecipient(id, "sms", String.valueOf(phone));
                smsSent++;
            }
            if (channels.contains("email") && email != null && !String.valueOf(email).isBlank()) {
                logRecipient(id, "email", String.valueOf(email));
                emailSent++;
            }
        }

        Long userId = service.actingUserId();
        // Mark dispatched; per-recipient logs are 'pending' and counts start at 0 — the async gateway
        // sender writes the TRUTH (sent/failed + real counts). No more hardcoded 'sent'.
        jdbc.update("""
                update public.oh_disseminations set status = 'sent', sent_at = now(), sent_by = ?,
                    sms_sent_count = 0, email_sent_count = 0, updated_at = now()
                where id = ?
                """, userId, id);

        // Update event status if first dissemination
        String eventStatus = jdbc.queryForObject("select status from public.oh_events where id = ?", String.class, eventId);
        if ("directive_issued".equals(eventStatus) || "under_review".equals(eventStatus)) {
            service.updateEventStatus(eventId, eventStatus, "disseminated", userId, "Alert disseminated");
        }

        // Send through the REAL gateway AFTER this @Transactional approve/resend commits (so the 'pending'
        // logs are visible to the async updater) — no gateway I/O inside the tx, and the per-recipient logs
        // + counts become the truth instead of a hardcoded 'sent'.
        final List<String> outPhones = channels.contains("sms") ? jdbc.queryForList(
                "select recipient from public.oh_dissemination_logs where dissemination_id = ? and channel = 'sms' and status = 'pending'",
                String.class, id) : List.of();
        final List<String> outEmails = channels.contains("email") ? jdbc.queryForList(
                "select recipient from public.oh_dissemination_logs where dissemination_id = ? and channel = 'email' and status = 'pending'",
                String.class, id) : List.of();
        final String alertText = String.valueOf("stakeholder".equals(type)
                ? d.getOrDefault("directives", "") : d.getOrDefault("alert_message", ""));
        final String fSmsBody = ("stakeholder".equals(type) ? "ONE HEALTH ALERT: " : "PMO-DMD ONE HEALTH PUBLIC ALERT: ") + alertText;
        final String emailSubject = "PMO-DMD One Health Alert";
        final String emailHtml = MailService.wrap(emailSubject, alertText);
        if (!outPhones.isEmpty() || !outEmails.isEmpty()) {
            if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
                org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                        new org.springframework.transaction.support.TransactionSynchronization() {
                            @Override public void afterCommit() {
                                delivery.deliverOhDissemination(id, outPhones, outEmails, fSmsBody, emailSubject, emailHtml);
                            }
                        });
            } else {
                delivery.deliverOhDissemination(id, outPhones, outEmails, fSmsBody, emailSubject, emailHtml);
            }
        }

        Map<String, Object> results = new LinkedHashMap<>();
        results.put("sms_queued", smsSent);
        results.put("email_queued", emailSent);
        results.put("sms_sent", smsSent);   // queued count; live per-recipient status is in oh_dissemination_logs
        results.put("email_sent", emailSent);
        results.put("errors", List.of());
        return results;
    }

    /** One per-recipient delivery log, recorded 'pending'; the async gateway sender flips it to sent/failed. */
    private void logRecipient(long dissId, String channel, String recipient) {
        jdbc.update("""
                insert into public.oh_dissemination_logs(dissemination_id, channel, recipient, status, created_at, updated_at)
                values (?,?,?,'pending',now(),now())
                """, dissId, channel, recipient);
    }

    // ─── helpers ───

    private record Uploaded(String path, String recipientsJson, int count) { }

    /**
     * Stores the optional recipient list. CSV files are parsed (Name, Phone, Email,
     * Organization columns); xlsx/xls files are stored as-is — parsing them needs a
     * spreadsheet library (issues/onehealth.issues.md OH-14).
     */
    private Uploaded storeRecipientFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            return new Uploaded(null, null, 0);
        }
        try {
            Path dir = storageRoot.resolve("dissemination_uploads");
            Files.createDirectories(dir);
            String name = System.currentTimeMillis() + "_" + (file.getOriginalFilename() == null ? "recipients" : file.getOriginalFilename().replaceAll("[^A-Za-z0-9._-]", "_"));
            Path target = dir.resolve(name);
            file.transferTo(target.toAbsolutePath());
            String stored = "dissemination_uploads/" + name;

            if (name.toLowerCase().endsWith(".csv")) {
                List<Map<String, Object>> recipients = new ArrayList<>();
                List<String> lines = Files.readAllLines(target, StandardCharsets.UTF_8);
                for (int i = 1; i < lines.size(); i++) { // skip header
                    String[] cols = lines.get(i).split(",", -1);
                    if (cols.length == 0 || lines.get(i).isBlank()) {
                        continue;
                    }
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("name", cols.length > 0 ? cols[0].trim() : null);
                    r.put("phone", cols.length > 1 ? cols[1].trim() : null);
                    r.put("email", cols.length > 2 ? cols[2].trim() : null);
                    r.put("organization", cols.length > 3 ? cols[3].trim() : null);
                    recipients.add(r);
                }
                return new Uploaded(stored, objectMapper.writeValueAsString(recipients), recipients.size());
            }
            return new Uploaded(stored, null, 0);
        } catch (Exception e) {
            log.warn("recipient file store failed: {}", e.getMessage());
            return new Uploaded(null, null, 0);
        }
    }

    private Map<String, Object> findOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.oh_disseminations where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Dissemination not found.");
        }
        return rows.get(0);
    }

    private String name(Object userId) {
        if (userId == null) {
            return null;
        }
        return jdbc.query("select name from public.users where id = ?",
                rs -> rs.next() ? rs.getString(1) : null, ((Number) userId).longValue());
    }

    @SuppressWarnings("unchecked")
    private List<String> parseJsonArray(Object raw) {
        if (raw == null) {
            return List.of();
        }
        try {
            return objectMapper.readValue(String.valueOf(raw), List.class);
        } catch (Exception e) {
            return List.of();
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseUploadedRecipients(Object raw) {
        if (raw == null) {
            return List.of();
        }
        try {
            return objectMapper.readValue(String.valueOf(raw), List.class);
        } catch (Exception e) {
            return List.of();
        }
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return "[]";
        }
    }

    private static String formatTs(Object ts) {
        return ts instanceof java.sql.Timestamp t
                ? t.toLocalDateTime().format(java.time.format.DateTimeFormatter.ofPattern("dd MMM uuuu, HH:mm", java.util.Locale.ENGLISH))
                : null;
    }

    private static String trim(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String ucfirst(String s) {
        return s == null || s.isEmpty() ? s : s.substring(0, 1).toUpperCase(java.util.Locale.ROOT) + s.substring(1);
    }

    private static void add(Map<String, List<String>> errors, String field, String message) {
        errors.computeIfAbsent(field, k -> new ArrayList<>()).add(message);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.trim().isEmpty();
    }
}
