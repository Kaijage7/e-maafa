package tz.go.pmo.dmis.portal;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Year;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.ew.MgovSmsService;
import tz.go.pmo.dmis.notification.MailService;

/**
 * Public portal data, reproducing PublicPortalController (Laravel) over the same tables:
 *
 * <ul>
 *   <li>{@link #landing()} — everything the landing page needs in ONE payload, mirroring
 *       {@code welcomeV2()}: active warnings + stats for the hero map, hazards, slides, gallery,
 *       settings, latest news/publications, emergency numbers and capability cards.</li>
 *   <li>{@link #newsArticle(String)} — one published article + related, mirroring {@code newsShow()}.</li>
 *   <li>{@link #publications(String)} — frameworks filtered by document type, mirroring {@code publications()}.</li>
 *   <li>{@link #submitHazardReport(Map)} — the citizen "Report Hazard" wizard write.</li>
 * </ul>
 *
 * Reads/writes go through JdbcTemplate: the portal is a thin, public, read-mostly surface and the
 * underlying tables are shared with Laravel (strangler migration), so no JPA entities are needed here.
 */
@Service
@RequiredArgsConstructor
public class PortalPublicService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    // Reuse the existing SMS + email channels to send the one-time unsubscribe confirmation code.
    private final MgovSmsService sms;
    private final MailService mail;

    // ---------------------------------------------------------------- landing

    @Transactional(readOnly = true)
    public Map<String, Object> landing() {
        // Active warnings for the hero map (flat early_warnings table — EarlyWarning::onMap)
        List<Map<String, Object>> warnings = jdbc.queryForList(
                "select ew.id, ew.warning_code as \"warningCode\", ew.hazard_type as \"hazardType\","
                        + " ew.severity_level as \"severityLevel\", ew.alert_message as \"alertMessage\","
                        + " ew.affected_regions as \"affectedRegions\", ew.affected_districts as \"affectedDistricts\","
                        + " ew.latitude, ew.longitude,"
                        + " ew.people_at_risk as \"peopleAtRisk\","
                        // Public hotlink to the published bulletin PDF: the EW engine's generated product is
                        // stored in ew_generated_products (served under /api/storage/**) and joined here by the
                        // shared warning_code. Null when no PDF was generated for this warning.
                        + " case when p.pdf_path is null then null else '/api/storage/' || p.pdf_path end as \"bulletinUrl\","
                        + " p.description as \"bulletinDescription\""
                        + " from public.early_warnings ew"
                        + " left join lateral (select pdf_path, description from public.ew_generated_products gp"
                        + "     where gp.warning_code = ew.warning_code and gp.pdf_path is not null"
                        + "     order by gp.generated_at desc limit 1) p on true"
                        + " where ew.show_on_map = true and ew.status = 'active'");

        // Hero-map status panel stats (emergency/warning/watch counts + people at risk)
        Map<String, Object> stats = new HashMap<>();
        stats.put("emergencyCount", warnings.stream().filter(w -> "Emergency".equals(w.get("severityLevel"))).count());
        stats.put("warningCount", warnings.stream().filter(w -> "Warning".equals(w.get("severityLevel"))).count());
        stats.put("watchCount", warnings.stream().filter(w -> "Watch".equals(w.get("severityLevel"))).count());
        stats.put("peopleAtRisk", warnings.stream()
                .mapToLong(w -> w.get("peopleAtRisk") == null ? 0 : ((Number) w.get("peopleAtRisk")).longValue()).sum());

        // Incidents on the public map — READ-ONLY consumption of the Response module's table.
        // PUBLIC-SAFE columns only (no casualty/reporter fields). Like the EW warnings, the public map
        // shows ONLY incidents an operator EXPLICITLY pinned (show_on_portal_map = true) — no auto-show by
        // status/approval — and only while still active: Closed/Resolved incidents drop off the public map.
        List<Map<String, Object>> incidents = safeList(
                "select id, title, severity_level as \"severityLevel\", status,"
                        + " workflow_status as \"workflowStatus\","
                        + " latitude, longitude, region_name as \"regionName\","
                        + " show_on_portal_map as \"pinnedToMap\""
                        + " from public.incidents"
                        + " where latitude is not null"
                        + "   and show_on_portal_map = true"             // operator explicitly pinned it
                        + "   and status not in ('Closed', 'Resolved')"  // and the situation is still active
                        + "   and coalesce(is_simulation, false) = false"
                        + " order by reported_at desc");

        // Bulletins an operator has explicitly published to the portal map (EOCC Bulletin → Publish → Map).
        // areaPoints carries one coordinate per PMO-selected district (name/lat/lng/level) so the map can
        // BLINK each specific affected district (the hotline mechanism), not just drop one pin at the centroid.
        List<Map<String, Object>> bulletins = safeList(
                "select id, title, severity, centroid_lat as \"centroidLat\", centroid_lng as \"centroidLng\","
                        + " '/api/storage/' || pdf_path as \"pdfUrl\","
                        + " envelope->>'area_points' as \"areaPointsJson\","
                        + " envelope->'days'->0->'hazards'->0->>'type' as \"hazardType\""
                        + " from public.ew_generated_products"
                        + " where is_published = true and show_on_map = true"
                        + "   and centroid_lat is not null and centroid_lng is not null"
                        + " order by generated_at desc limit 50");
        // Parse the per-district points JSON into real objects (and drop the raw string from the response).
        for (Map<String, Object> b : bulletins) {
            Object raw = b.remove("areaPointsJson");
            Object parsed = null;
            if (raw != null) {
                try { parsed = json.readValue(String.valueOf(raw), List.class); } catch (Exception ignored) { /* leave null */ }
            }
            b.put("areaPoints", parsed == null ? List.of() : parsed);
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("warnings", warnings);
        payload.put("incidents", incidents);
        payload.put("bulletins", bulletins);
        payload.put("stats", stats);
        payload.put("hazards", safeList("select id, name, type from public.hazards where is_active = true order by name"));
        payload.put("slides", safeList("select title, subtitle, slide_type as \"slideType\", background_image as \"backgroundImage\""
                + " from public.portal_slides where is_active = true order by sort_order"));
        payload.put("gallery", resolveImages(safeList("select image_path as \"imagePath\", caption, alt_text as \"altText\","
                + " marquee_row as \"marqueeRow\" from public.portal_gallery where is_active = true"
                + " order by marquee_row, sort_order"), "imagePath"));
        payload.put("settings", settingsMap());
        payload.put("latestNews", resolveImages(safeList("select title, slug, excerpt, image, category,"
                + " title_sw as \"title_sw\", excerpt_sw as \"excerpt_sw\","
                + " to_char(published_at, 'Mon DD, YYYY') as \"publishedAt\""
                + " from public.portal_news where is_active = true and published_at <= now()"
                + " order by published_at desc limit 6"), "image"));
        payload.put("latestPublications", safeList("select id, document_name as \"documentName\","
                + " document_type as \"documentType\", year_of_approval as \"yearOfApproval\","
                + " narrative_description as \"narrativeDescription\", attachment_path as \"attachmentPath\""
                + " from public.disaster_risk_frameworks order by created_at desc limit 6"));
        payload.put("stakeholderCount", safeCount("select count(*) from public.stakeholders"));
        payload.put("publicationCounts", publicationCounts());
        // Managed landing sections (Content Management → Portal Sections): hazard education cards,
        // capability cards and the topbar emergency numbers — all editable, all public.
        payload.put("hazardCards", safeList("select name, name_sw as \"nameSw\", icon, color, description_en as \"descriptionEn\","
                + " description_sw as \"descriptionSw\", link from public.portal_hazard_cards"
                + " where is_active = true order by sort_order, id"));
        payload.put("capabilities", readJsonList("capabilities.items"));
        payload.put("emergencyNumbers", readJsonList("emergency.numbers"));
        return payload;
    }

    /** Parses a JSON-list portal setting (capabilities.items / emergency.numbers). */
    private List<Map<String, Object>> readJsonList(String key) {
        try {
            String value = jdbc.queryForObject("select value from public.portal_settings where key=?", String.class, key);
            return json.readValue(value, json.getTypeFactory().constructCollectionType(List.class, Map.class));
        } catch (Exception e) {
            return List.of(); // frontend falls back to its built-in defaults
        }
    }

    // ------------------------------------------------------------------ news

    @Transactional(readOnly = true)
    public Map<String, Object> newsArticle(String slug) {
        List<Map<String, Object>> found = jdbc.queryForList(
                "select title, slug, excerpt, body, image, category,"
                        + " title_sw as \"title_sw\", excerpt_sw as \"excerpt_sw\", body_sw as \"body_sw\","
                        + " to_char(published_at, 'Mon DD, YYYY') as \"publishedAt\""
                        + " from public.portal_news where slug = ? and is_active = true and published_at <= now()", slug);
        if (found.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Article not found");
        }
        List<Map<String, Object>> related = jdbc.queryForList(
                "select title, slug, excerpt, image, category,"
                        + " title_sw as \"title_sw\", excerpt_sw as \"excerpt_sw\","
                        + " to_char(published_at, 'Mon DD, YYYY') as \"publishedAt\""
                        + " from public.portal_news where slug <> ? and is_active = true and published_at <= now()"
                        + " order by published_at desc limit 3", slug);
        return Map.of("article", resolveImages(found, "image").get(0), "related", resolveImages(related, "image"));
    }

    // ---------------------------------------------------------- publications

    /** Frameworks by document type (Policy / Strategy / Act / Guideline …), as /publications/{type}. */
    @Transactional(readOnly = true)
    public Map<String, Object> publications(String type) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, document_name as \"documentName\", document_type as \"documentType\","
                        + " year_of_approval as \"yearOfApproval\", narrative_description as \"narrativeDescription\","
                        + " attachment_path as \"attachmentPath\", external_link as \"externalLink\","
                        + " coalesce(language, 'en') as language from public.disaster_risk_frameworks"
                        + " where (? = '' or document_type = ?) order by year_of_approval desc nulls last, document_name",
                type == null ? "" : type, type == null ? "" : type);
        return Map.of("publications", rows, "counts", publicationCounts());
    }

    // ------------------------------------------------- live incident snapshot

    /**
     * Live, public-safe snapshot of an incident an operator has pushed to the portal (map / news): the
     * situation plus its <b>response status</b>, the <b>resources allocated</b> to it and recent updates —
     * re-queried on every call so it reflects current state as the incident is worked. Returns
     * {@code null} (→ 404) when the incident is not published, so un-pushed incidents are never exposed.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> incidentSnapshot(long id) {
        List<Map<String, Object>> found = jdbc.queryForList(
                "select i.id, i.title, i.severity_level as \"severityLevel\", i.status,"
                        + " i.workflow_status as \"workflowStatus\", i.latitude, i.longitude,"
                        + " i.region_name as \"regionName\", i.district_name as \"districtName\","
                        + " i.location_description as \"locationDescription\", i.description,"
                        + " i.action_taken as \"actionTaken\", i.emergency_needs as \"emergencyNeeds\","
                        + " i.deaths_total as \"deathsTotal\", i.injured_total as \"injuredTotal\","
                        + " i.missing_total as \"missingTotal\", i.displaced, i.children_affected as \"childrenAffected\","
                        + " i.reported_at as \"reportedAt\", i.updated_at as \"updatedAt\","
                        + " h.name as \"hazardName\", it.name as \"incidentType\""
                        + " from public.incidents i"
                        + " left join public.hazards h on h.id = i.hazard_id"
                        + " left join public.incident_types it on it.id = i.incident_type_id"
                        + " where i.id = ? and i.show_on_portal_map = true", id);
        if (found.isEmpty()) {
            return null;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("incident", found.get(0));
        out.put("resources", jdbc.queryForList(
                "select r.name as \"resource\", ar.quantity_allocated as \"quantity\","
                        + " ar.unit_of_measure as \"unit\", ar.status"
                        + " from public.allocated_resources ar join public.resources r on r.id = ar.resource_id"
                        + " where ar.incident_id = ? order by ar.id", id));
        out.put("updates", jdbc.queryForList(
                "select update_details as \"detail\", update_type as \"type\", created_at as \"at\""
                        + " from public.incident_updates where incident_id = ? order by created_at desc limit 20", id));
        // The escalation / response timeline (public-safe: the STAGE transitions + role + time — no user id,
        // ip or internal notes) so a citizen sees the incident being verified, escalated and responded to.
        out.put("escalation", jdbc.queryForList(
                "select action, from_status as \"from\", to_status as \"to\", performed_by_role as \"role\","
                        + " created_at as \"at\" from public.incident_workflow_histories"
                        + " where incident_id = ? order by created_at asc", id));
        return out;
    }

    // ---------------------------------------------------- citizen interactions

    /** Citizen "Report Hazard" wizard → public_hazard_reports (auto report code PHR-YYYY-NNNNN). A member of
     *  the public follows the normal triage flow. An INSTITUTION / SECTOR / MINISTRY / REGION (RAS) is a
     *  trusted official source: the report is auto-converted to an incident routed STRAIGHT to the EOCC stage
     *  (workflow_status='waiting_eocc'), skipping the district + region verification a public report climbs. */
    @Transactional
    public Map<String, Object> submitHazardReport(Map<String, Object> req) {
        String hazardType = str(req.get("hazardType"));
        String description = str(req.get("description"));
        if (hazardType == null || description == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hazard type and description are required");
        }
        String phone = str(req.get("reporterPhone"));
        if (phone != null && !phone.replaceAll("[\\s-]", "").matches("^(\\+?255|0)[67]\\d{8}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Please enter a valid Tanzanian phone number, e.g. 0712345678 or +255712345678.");
        }
        String email = str(req.get("reporterEmail"));
        if (email != null && !email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Please enter a valid email address, e.g. name@example.com.");
        }
        String reporterType = normReporterType(str(req.get("reporterType")));
        boolean official = !"public".equals(reporterType);
        String reporterOrg = official ? str(req.get("reporterOrg")) : null;

        Long n = jdbc.queryForObject("select count(*) from public.public_hazard_reports", Long.class);
        String code = String.format("PHR-%d-%05d", Year.now().getValue(), (n == null ? 0 : n) + 1);
        Long reportId = jdbc.queryForObject("insert into public.public_hazard_reports(report_code,hazard_type,"
                        + "description,location_description,latitude,longitude,urgency_level,reporter_name,"
                        + "reporter_phone,reporter_type,reporter_org,reporter_email,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,?,?,?,?,now(),now()) returning id", Long.class,
                code, hazardType, description, str(req.get("location")),
                num(req.get("latitude")), num(req.get("longitude")),
                str(req.get("urgency")) == null ? "Medium" : str(req.get("urgency")),
                str(req.get("reporterName")), str(req.get("reporterPhone")), reporterType, reporterOrg,
                email);

        if (!official) {
            return Map.of("reportCode", code,
                    "message", "Report submitted — thank you for keeping your community safe");
        }

        // Trusted official source → straight to EOCC: a waiting_eocc incident (skips the district + region steps).
        Long incidentTypeId = jdbc.query(
                "select id from public.incident_types where name ilike ? or ? ilike '%' || name || '%' limit 1",
                rs -> rs.next() ? rs.getLong(1) : null, "%" + hazardType + "%", hazardType);
        String src = capitalize(reporterType)
                + (reporterOrg == null || reporterOrg.isBlank() ? "" : " — " + reporterOrg)
                + " (official report via public portal)";
        Long incidentId = jdbc.queryForObject(
                "insert into public.incidents(title, description, incident_type_id, severity_level, status, "
                + "workflow_status, origin_level, location_description, latitude, longitude, reported_at, "
                + "reported_by_name, reported_by_contact, source_of_report, submitted_at, created_at, updated_at) "
                + "values (?,?,?,?, 'Reported', 'waiting_eocc', 'national', ?,?,?, now(), ?,?,?, now(), now(), now()) "
                + "returning id", Long.class,
                "Official report: " + hazardType + (str(req.get("location")) == null ? "" : " — " + str(req.get("location"))),
                description, incidentTypeId, urgencyToSeverity(str(req.get("urgency"))),
                str(req.get("location")), num(req.get("latitude")), num(req.get("longitude")),
                str(req.get("reporterName")), str(req.get("reporterPhone")), src);
        // (No incident_workflow_histories row: that table requires a user_id and a portal report has no acting
        // user. The incident's origin is fully captured in source_of_report + the linked PHR report below.)
        jdbc.update("update public.public_hazard_reports set status='converted', linked_incident_id=?, "
                + "updated_at=now() where id=?", incidentId, reportId);
        return Map.of("reportCode", code, "incidentId", incidentId,
                "message", "Official report received — routed straight to the EOCC as incident #" + incidentId + ".");
    }

    /** Normalise the wizard's "reported by" to one of: public | institution | sector | ministry | region.
     *  A region report is the regional authority (RAS) — like a sector/ministry it is a trusted official
     *  source and routes straight to the EOCC. */
    private static String normReporterType(String t) {
        if (t == null) return "public";
        String s = t.trim().toLowerCase();
        return ("institution".equals(s) || "sector".equals(s) || "ministry".equals(s) || "region".equals(s))
                ? s : "public";
    }
    private static String urgencyToSeverity(String urgency) {
        if (urgency == null) return "Moderate";
        String u = urgency.trim().toLowerCase();
        return "high".equals(u) ? "Major" : "low".equals(u) ? "Minor" : "Moderate";
    }
    private static String capitalize(String s) {
        return (s == null || s.isEmpty()) ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    /** Public alert subscription (the /subscribe page) → alert_subscriptions, consent required. */
    @Transactional
    public Map<String, Object> subscribe(Map<String, Object> req) {
        String fullName = str(req.get("fullName"));
        String phone = str(req.get("phone"));
        String email = str(req.get("email"));
        if (fullName == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Full name is required");
        }
        if (phone == null && email == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Provide a phone number or an email");
        }
        if (!Boolean.parseBoolean(String.valueOf(req.getOrDefault("consent", "false")))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Consent is required to receive alerts");
        }
        Long n = jdbc.queryForObject("select count(*) from public.alert_subscriptions", Long.class);
        String id = String.format("SUB-%d-%04d", Year.now().getValue(), (n == null ? 0 : n) + 1);
        jdbc.update("insert into public.alert_subscriptions(subscription_id,full_name,subscriber_location,"
                        + "communication_channels,phone_number,email,hazards_of_interest,alert_level_priority,"
                        + "languages,consent,is_active,subscribed_at,created_at,updated_at)"
                        + " values (?,?,?,?::jsonb,?,?,?::jsonb,?,?::jsonb,true,true,now(),now(),now())",
                id, fullName, str(req.get("location")), jsonArr(req.get("channels")), phone, email,
                jsonArr(req.get("hazards")), str(req.get("priority")), jsonArr(req.get("languages")));
        return Map.of("subscriptionId", id, "message", "Subscribed — you will receive alerts for your area");
    }

    /**
     * Public unsubscribe — STEP 1 (request a code). The old version deactivated EVERY
     * subscription matching a raw phone/email with no proof of ownership (an anonymous attacker could
     * silence a citizen's disaster alerts). Now we only send a one-time code to the claimed contact and
     * deactivate nothing here — the caller proves ownership by confirming the code ({@link #confirmUnsubscribe}).
     */
    @Transactional
    public Map<String, Object> unsubscribe(Map<String, Object> req) {
        String contact = str(req.get("contact"));
        if (contact == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter the phone number or email you subscribed with");
        }
        Long active = jdbc.queryForObject("select count(*) from public.alert_subscriptions"
                + " where (phone_number=? or email=?) and is_active=true", Long.class, contact, contact);
        if (active == null || active == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No active subscription found for that contact");
        }
        boolean isEmail = contact.contains("@");
        String code = String.format("%06d", new java.security.SecureRandom().nextInt(1_000_000));
        jdbc.update("insert into public.alert_unsubscribe_requests(contact, code_hash, channel, expires_at, created_at)"
                + " values (?,?,?, now() + interval '15 minutes', now())", contact, sha256(code), isEmail ? "email" : "sms");
        sendUnsubscribeCode(contact, isEmail, code);
        return Map.of("pending", true, "channel", isEmail ? "email" : "sms",
                "message", "We sent a 6-digit confirmation code to " + maskContact(contact, isEmail)
                        + ". Enter it to confirm you want to stop receiving alerts.");
    }

    /**
     * Public unsubscribe — STEP 2 (confirm). Verifies the one-time code that was sent to the contact, then
     * deactivates that contact's active subscriptions. A wrong, expired, or already-used code deactivates nothing.
     */
    @Transactional
    public Map<String, Object> confirmUnsubscribe(Map<String, Object> req) {
        String contact = str(req.get("contact"));
        String code = str(req.get("code"));
        if (contact == null || code == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Both the contact and the confirmation code are required");
        }
        // Optional reason (chosen from the CMS-controlled list, or a free-text "other"); capped to the column width.
        String reason = str(req.get("reason"));
        if (reason != null && reason.length() > 250) {
            reason = reason.substring(0, 250);
        }
        List<Map<String, Object>> rows = jdbc.queryForList("select id, code_hash, attempts"
                + " from public.alert_unsubscribe_requests where contact=? and consumed_at is null and expires_at > now()"
                + " order by created_at desc limit 1", contact);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "That code has expired or was not found — request a new one.");
        }
        Map<String, Object> r = rows.get(0);
        long reqId = ((Number) r.get("id")).longValue();
        int attempts = ((Number) r.get("attempts")).intValue();
        if (attempts >= 5) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Too many incorrect attempts — request a new code.");
        }
        if (!sha256(code).equals(str(r.get("code_hash")))) {
            jdbc.update("update public.alert_unsubscribe_requests set attempts = attempts + 1 where id=?", reqId);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Incorrect code. Please check and try again.");
        }
        jdbc.update("update public.alert_unsubscribe_requests set consumed_at=now() where id=?", reqId);
        int n = jdbc.update("update public.alert_subscriptions set is_active=false, unsubscribed_at=now(),"
                + " unsubscribe_reason=?, updated_at=now() where (phone_number=? or email=?) and is_active=true",
                reason, contact, contact);
        return Map.of("count", n, "message", "Unsubscribed — you will no longer receive alerts");
    }

    /** Public: the CMS-controlled list of unsubscribe reasons (managed in Content Management → Portal Management). */
    @Transactional(readOnly = true)
    public Map<String, Object> unsubscribeReasons() {
        List<Map<String, Object>> reasons;
        try {
            String value = jdbc.queryForObject(
                    "select value from public.portal_settings where key='unsubscribe.reasons'", String.class);
            reasons = json.readValue(value, json.getTypeFactory().constructCollectionType(List.class, Map.class));
        } catch (Exception e) {
            reasons = List.of();   // not seeded yet → the form simply shows a free-text reason
        }
        return Map.of("reasons", reasons);
    }

    /** Send the one-time unsubscribe code over the contact's own channel (failures are swallowed, never leaked). */
    private void sendUnsubscribeCode(String contact, boolean isEmail, String code) {
        String text = "Your e-MAAFA unsubscribe code is " + code + ". It expires in 15 minutes."
                + " If you did not request this, ignore this message and you will keep receiving alerts.";
        try {
            if (isEmail) {
                mail.send(contact, "e-MAAFA unsubscribe code",
                        MailService.wrap("Confirm unsubscribe", text), "alert_unsubscribe", null, null);
            } else {
                sms.sendBulk(List.of(contact), text, "alert_unsubscribe", null);
            }
        } catch (Exception ignored) {
            // Never surface send failures to the caller — that would leak whether a contact is subscribed.
        }
    }

    /** Mask a contact for the "we sent a code to …" message so the response never echoes the full PII. */
    private static String maskContact(String contact, boolean isEmail) {
        if (isEmail) {
            int at = contact.indexOf('@');
            return (at <= 1 ? "*" : contact.charAt(0) + "***") + contact.substring(Math.max(at, 0));
        }
        int len = contact.length();
        return len <= 4 ? "****" : "***" + contact.substring(len - 3);
    }

    private static String sha256(String s) {
        try {
            byte[] d = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(d.length * 2);
            for (byte b : d) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** Public "Register as Stakeholder" (landing) → stakeholders row pending verification. */
    @Transactional
    public Map<String, Object> registerStakeholder(Map<String, Object> req) {
        String name = str(req.get("name"));
        String organization = str(req.get("organization"));
        if (name == null || organization == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and organization are required");
        }
        String phone = str(req.get("phone"));
        String email = str(req.get("email"));
        if (phone != null && !phone.replaceAll("[\\s-]", "").matches("^(\\+?255|0)[67]\\d{8}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Enter a valid Tanzanian phone number (e.g. 0712 345 678) so we can send your confirmation.");
        }
        if (email != null && !email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a valid email address.");
        }
        Long id = jdbc.queryForObject("insert into public.stakeholders(name,organization,type,email,phone,region,district,country,"
                        + "is_active,is_verified,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,true,false,now(),now()) returning id", Long.class,
                name, organization, str(req.get("type")) == null ? "NGO" : str(req.get("type")),
                email, phone, str(req.get("region")),
                str(req.get("district")), str(req.get("country")));
        // Genuine confirmation via the same live M-Gov SMS / SMTP channels every other notification uses
        // (best-effort: the registration is saved regardless of whether the gateway accepts the message).
        String congrats = "Congratulations " + name + "! You are registered as a partner with PMO e-MAAFA "
                + "(Tanzania Disaster Management). Your details are under review — you will be notified once verified.";
        boolean smsSent = false;
        if (phone != null && !phone.isBlank()) {
            try { smsSent = sms.sendBulk(List.of(phone), congrats, "partner_register", id).success(); }
            catch (Exception ignore) { /* confirmation is best-effort; the record is already saved */ }
        }
        if (email != null && !email.isBlank()) {
            try { mail.send(email, "e-MAAFA — partner registration received",
                    MailService.wrap("Registration received", congrats), "partner_register", id, null); }
            catch (Exception ignore) { /* best-effort */ }
        }
        return Map.of("id", id, "smsSent", smsSent, "message",
                (phone != null && !phone.isBlank())
                        ? "Registration received — a confirmation SMS has been sent to " + phone
                          + ". PMO will verify your details shortly."
                        : "Registration received — pending verification by PMO.");
    }

    /** Public Tanzania regions for the stakeholder-registration cascade (reuses public.regions). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> regions() {
        return jdbc.queryForList("select id, name from public.regions order by name");
    }

    /** Public districts in a region for the registration cascade (reuses public.districts). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> districts(long regionId) {
        return jdbc.queryForList("select id, name from public.districts where region_id = ? order by name", regionId);
    }

    /** Public councils (LGAs) in a district for the location cascade (reuses public.councils). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> councils(long districtId) {
        return jdbc.queryForList("select id, name from public.councils where district_id = ? order by name", districtId);
    }

    /** Public wards in a council for the location cascade (reuses public.wards). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> wards(long councilId) {
        return jdbc.queryForList("select id, name from public.wards where council_id = ? order by name", councilId);
    }

    /** Published educational content for the public education portal. */
    @Transactional(readOnly = true)
    public Map<String, Object> education() {
        return Map.of("contents", safeList("select id, title, content_type as \"contentType\", summary, author,"
                + " title_sw as \"titleSw\", summary_sw as \"summarySw\","
                + " target_audience as \"targetAudience\", to_char(publication_date, 'DD Mon YYYY') as \"publicationDate\""
                + " from public.educational_contents where is_published = true order by publication_date desc nulls last"));
    }

    /** Public evacuation-center finder (FEMA shelter-finder pattern) — public-safe columns only. */
    @Transactional(readOnly = true)
    public Map<String, Object> shelters() {
        return Map.of("shelters", safeList(
                "select centre_name as \"name\", region, district, capacity_people as \"capacity\","
                        + " status, accessibility, latitude, longitude from public.evacuation_centers"
                        + " where latitude is not null order by region, centre_name"));
    }

    /**
     * C3 national hazard calendar: which hazards are likely in which months (Tanzania climatology).
     * Joined to portal_hazard_cards so the public view shows the bilingual name + the card icon/colour;
     * ordered by the card sort order then month so the frontend can lay out a hazard × 12-month grid.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> hazardCalendar() {
        return jdbc.queryForList(
                "select hc.hazard_name as \"hazardName\", c.name_sw as \"hazardNameSw\", c.icon, c.color,"
                        + " hc.month, hc.risk_level as \"riskLevel\", hc.season, hc.note"
                        + " from public.hazard_calendar hc"
                        + " left join public.portal_hazard_cards c on c.name = hc.hazard_name"
                        + " order by coalesce(c.sort_order, 99), hc.hazard_name, hc.month");
    }

    /**
     * Hazard education hub (/education/hazard/{name}): the hazard's card + its repository of
     * materials grouped by audience (children / adults / persons with disabilities; 'all'
     * materials appear in every group) + related published articles by keyword.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> hazardHub(String hazardName) {
        List<Map<String, Object>> card = jdbc.queryForList(
                "select name, name_sw as \"nameSw\", icon, color, description_en as \"descriptionEn\", description_sw as \"descriptionSw\""
                        + " from public.portal_hazard_cards where lower(name) = lower(?) and is_active = true", hazardName);
        if (card.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown hazard");
        }
        List<Map<String, Object>> materials = jdbc.queryForList(
                "select audience, material_type as \"materialType\", title, body,"
                        + " title_sw as \"titleSw\", body_sw as \"bodySw\", video_url as \"videoUrl\", phase,"
                        + " case when file_path is null then null"
                        + "      when file_path like 'images/%' then '/' || file_path"
                        + "      else '/api/storage/' || file_path end as \"fileUrl\""
                        + " from public.education_materials where lower(hazard) = lower(?) and is_active = true"
                        + " order by sort_order, id", hazardName);
        String pattern = "%" + hazardName.toLowerCase() + "%";
        List<Map<String, Object>> related;
        try {
            related = jdbc.queryForList(
                    "select id, title, content_type as \"contentType\", summary,"
                            + " title_sw as \"titleSw\", summary_sw as \"summarySw\""
                            + " from public.educational_contents"
                            + " where is_published = true and (lower(title) like ? or lower(keywords) like ?)"
                            + " order by publication_date desc limit 4", pattern, pattern);
        } catch (Exception e) {
            related = List.of();
        }
        return Map.of("hazard", card.get(0), "materials", materials, "related", related);
    }

    /** One published educational item (full content) for the public show page. */
    @Transactional(readOnly = true)
    public Map<String, Object> educationItem(long id) {
        List<Map<String, Object>> found = jdbc.queryForList(
                "select id, title, content_type as \"contentType\", summary, full_content as \"fullContent\","
                        + " title_sw as \"titleSw\", summary_sw as \"summarySw\", full_content_sw as \"fullContentSw\","
                        + " author, keywords, target_audience as \"targetAudience\","
                        + " to_char(publication_date, 'DD Mon YYYY') as \"publicationDate\""
                        + " from public.educational_contents where id=? and is_published=true", id);
        if (found.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Content not found");
        }
        return found.get(0);
    }

    /**
     * Public bilingual UI dictionary (key → {en, sw}) from the managed translations registry
     * (V46, maintained in System Settings → Translations). The portal's i18n service hydrates
     * from this over its built-in fallback labels, so an admin edit takes effect on the live site.
     * Resilient: an empty/absent table just yields an empty map (the frontend keeps its defaults).
     */
    @Transactional(readOnly = true)
    public Map<String, Object> i18n() {
        Map<String, Object> dict = new LinkedHashMap<>();
        try {
            for (Map<String, Object> r : jdbc.queryForList("select label_key, en, sw from public.translations")) {
                dict.put(String.valueOf(r.get("label_key")), Map.of("en", r.get("en"), "sw", r.get("sw")));
            }
        } catch (Exception ignored) {
            // translations table not present yet (pre-V46) — frontend uses its built-in labels
        }
        return dict;
    }

    private String jsonArr(Object v) {
        try {
            return json.writeValueAsString(v == null ? List.of() : v);
        } catch (Exception e) {
            return "[]";
        }
    }

    // -------------------------------------------------------------- internals

    /** Key→value of all portal settings (hero text, stat values, counters …). */
    private Map<String, String> settingsMap() {
        Map<String, String> map = new LinkedHashMap<>();
        try {
            jdbc.query("select key, value from public.portal_settings",
                    rs -> { map.put(rs.getString("key"), rs.getString("value")); });
        } catch (Exception ignored) {
            // table empty/missing locally — the frontend falls back to its defaults
        }
        return map;
    }

    private Map<String, Long> publicationCounts() {
        Map<String, Long> counts = new LinkedHashMap<>();
        try {
            jdbc.query("select document_type, count(*) as c from public.disaster_risk_frameworks group by document_type",
                    rs -> { counts.put(rs.getString("document_type"), rs.getLong("c")); });
        } catch (Exception ignored) {
            // frameworks table not present locally — counts stay empty
        }
        return counts;
    }

    private List<Map<String, Object>> safeList(String sql) {
        try {
            return jdbc.queryForList(sql);
        } catch (Exception e) {
            return List.of();
        }
    }

    /**
     * Laravel's PortalGallery::getImageUrlAttribute parity: legacy asset paths (images/…) are
     * served from the frontend bundle; uploaded paths live on the public disk at /api/storage/….
     * Applied server-side so every consumer receives a ready-to-use URL.
     */
    private static String imageUrl(Object path) {
        if (path == null || String.valueOf(path).isBlank()) {
            return null;
        }
        String p = String.valueOf(path);
        return p.startsWith("images/") ? "/" + p : "/api/storage/" + p;
    }

    /** Replaces a raw image-path field with its resolved URL on every row. */
    private static List<Map<String, Object>> resolveImages(List<Map<String, Object>> rows, String field) {
        rows.forEach(r -> r.put(field, imageUrl(r.get(field))));
        return rows;
    }

    private long safeCount(String sql) {
        try {
            Long n = jdbc.queryForObject(sql, Long.class);
            return n == null ? 0 : n;
        } catch (Exception e) {
            return 0;
        }
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Double num(Object v) {
        try {
            return v == null ? null : Double.valueOf(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
