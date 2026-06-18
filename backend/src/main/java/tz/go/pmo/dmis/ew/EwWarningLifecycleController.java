package tz.go.pmo.dmis.ew;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * EW warning lifecycle — approve + publish. FAITHFUL port of Laravel Admin\EarlyWarningController@approve
 * and @publish: a pending bulletin (ingested from PMO-DMD) is approved, then PUBLISHED — which clones each
 * WarningHazard into the public {@code early_warnings} table with {@code show_on_map=true} so it reaches
 * the public portal map. Improvement over the Laravel source (which left coords null → defaulted to Dar):
 * a warned region with no point gets its real centroid (ew/region_centroids.json) so the portal map plots it.
 */
@RestController
@RequestMapping("/v1/ew/warnings")
// Approve + publish are the critical pending→public-map gate: oversight tier only (maker-checker on the
// public alert), so the operator who ingests/drafts a warning is not the one who releases it. Was isAuthenticated().
@PreAuthorize(Authz.EW_APPROVE)
public class EwWarningLifecycleController {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final int MIN_PDF_BYTES = 1024;     // a real bulletin PDF is never a few bytes
    private static final int MAX_DESC_LEN = 1000;      // public-facing hazard description cap (mirrors the UI)
    private final JdbcTemplate jdbc;
    private final Map<String, Map<String, Object>> centroids;
    private final tz.go.pmo.dmis.notification.NotificationService notifications;
    private final String publicRoot;

    public EwWarningLifecycleController(JdbcTemplate jdbc, tz.go.pmo.dmis.notification.NotificationService notifications,
            @Value("${dmis.storage.public-root:${user.dir}/storage/public}") String publicRoot) {
        this.jdbc = jdbc;
        this.notifications = notifications;
        this.publicRoot = publicRoot;
        this.centroids = loadCentroids();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Map<String, Object>> loadCentroids() {
        try (var in = EwWarningLifecycleController.class.getResourceAsStream("/ew/region_centroids.json")) {
            return in == null ? Map.of() : JSON.readValue(in, Map.class);
        } catch (Exception e) {
            return Map.of();
        }
    }

    // ── POST /{id}/approve — pending → approved (EarlyWarningController@approve) ──
    @PostMapping("/{id}/approve")
    @Transactional
    public Map<String, Object> approve(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        int n = jdbc.update(
            "update public.warnings set status='approved', is_approved=true, approved_at=now(), " +
            "approval_notes=?, updated_by=? where id=? and status='pending'",
            body == null ? null : str(body.get("notes")), currentUserId(), id);
        if (n == 0) {
            throw new BusinessRuleException("Only pending warnings can be approved.");
        }
        return Map.of("success", "Warning approved successfully.");
    }

    // ── POST /{id}/map — add/remove a published warning on the public portal map (early_warnings.show_on_map) ──
    @PostMapping("/{id}/map")
    @Transactional
    public Map<String, Object> setOnMap(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Object showRaw = body == null ? null : body.get("show");
        boolean show = Boolean.TRUE.equals(showRaw) || "true".equalsIgnoreCase(String.valueOf(showRaw));
        List<Map<String, Object>> wrows = jdbc.queryForList(
            "select warning_code from public.warnings where id=?", id);
        if (wrows.isEmpty()) {
            throw new ResourceNotFoundException("Warning not found.");
        }
        String code = str(wrows.get(0).get("warning_code"));
        int n = jdbc.update(
            "update public.early_warnings set show_on_map=?, updated_at=now() where warning_code=?", show, code);
        if (n == 0) {
            throw new BusinessRuleException("This warning is not published to the portal yet — publish it first.");
        }
        return Map.of("success", true, "onMap", show, "updated", n,
            "message", show ? "Added to the portal map." : "Removed from the portal map.");
    }

    // ── POST /{id}/bulletin — MANUAL contingency: upload a bulletin PDF for a warning when the EW engine
    //    isn't auto-generating. Stamped with the warning's code so it auto-links to the EOCC Bulletin + portal. ──
    @PostMapping("/{id}/bulletin")
    @Transactional
    public Map<String, Object> uploadBulletin(@PathVariable long id, @RequestParam("pdf") MultipartFile pdf,
            @RequestParam(value = "description", required = false) String description) throws Exception {
        // 1) The file must be present AND be a real PDF (not just a .pdf name) — it is served on the public
        //    portal, so a non-PDF / HTML-polyglot must never be stored. Read the bytes once, reuse for write.
        if (pdf == null || pdf.isEmpty()) {
            throw new BusinessRuleException("A PDF file is required.");
        }
        byte[] bytes = pdf.getBytes();
        if (bytes.length < MIN_PDF_BYTES || !isPdf(bytes)) {
            throw new BusinessRuleException("The file does not look like a valid PDF. Upload the bulletin as a PDF.");
        }

        // 2) Business-state gate (the frontend hides this action, but a direct POST must not bypass it):
        //    a public bulletin may only attach to an approved/published, non-deleted warning that has a code.
        List<Map<String, Object>> wrows = jdbc.queryForList(
            "select warning_code, status from public.warnings where id=? and deleted_at is null", id);
        if (wrows.isEmpty()) {
            throw new ResourceNotFoundException("Warning not found.");
        }
        String status = str(wrows.get(0).get("status"));
        if (!"approved".equalsIgnoreCase(status) && !"published".equalsIgnoreCase(status)) {
            throw new BusinessRuleException("Only approved or published warnings can carry a bulletin.");
        }
        String code = str(wrows.get(0).get("warning_code"));
        if (code == null || code.isBlank()) {
            throw new BusinessRuleException("This warning has no warning code yet, so a bulletin cannot be linked.");
        }

        // 3) Description: optional, trimmed, length-capped and stripped of control / bidi / zero-width chars
        //    (it is shown to the public — no invisible spoofing payloads, no unbounded blob).
        String cleanDesc = cleanDescription(description);

        // Derive a display title + severity from the published view (early_warnings) with safe fallbacks.
        String title = "Manual bulletin — " + code;
        String severity = "WARNING";
        List<Map<String, Object>> ew = jdbc.queryForList(
            "select hazard_type, severity_level from public.early_warnings where warning_code=? limit 1", code);
        if (!ew.isEmpty()) {
            String hz = str(ew.get(0).get("hazard_type"));
            if (hz != null && !hz.isBlank() && !"-".equals(hz)) { title = hz + " bulletin — " + code; }
            String sl = str(ew.get(0).get("severity_level"));
            severity = "Emergency".equalsIgnoreCase(sl) ? "MAJOR_WARNING"
                     : "Watch".equalsIgnoreCase(sl) ? "ADVISORY" : "WARNING";
        }

        // 4) REPLACE semantics: one authoritative manual bulletin per warning. Capture the prior manual
        //    PDFs, delete their rows now (rolls back with us if anything fails), and delete the files only
        //    AFTER commit so a rollback never strands the warning without its bulletin.
        List<String> supersededPaths = jdbc.queryForList(
            "select pdf_path from public.ew_generated_products where warning_code=? and bulletin_type='MANUAL'",
            String.class, code);
        jdbc.update("delete from public.ew_generated_products where warning_code=? and bulletin_type='MANUAL'", code);

        String fileName = UUID.randomUUID() + ".pdf";
        String relPath = "ew-products/" + fileName;
        String storedName = sanitizeFilename(pdf.getOriginalFilename(), fileName);

        // 5) Insert FIRST, then write the file; if the write fails, remove the partial file and rethrow so the
        //    transaction rolls back — no row ever points to a missing file, no file is ever orphaned by a DB error.
        Long pid = jdbc.queryForObject(
            "insert into public.ew_generated_products(title, bulletin_type, warning_code, issue_date, severity, "
                + "description, pdf_path, file_name, generated_by, generated_at, created_at) "
                + "values (?, 'MANUAL', ?, current_date, ?, ?, ?, ?, ?, now(), now()) returning id",
            Long.class, title, code, severity, cleanDesc, relPath, storedName, currentUserId());
        Path target = Path.of(publicRoot, "ew-products", fileName);
        try {
            Files.createDirectories(target.getParent());
            Files.write(target, bytes);
        } catch (Exception writeErr) {
            try { Files.deleteIfExists(target); } catch (Exception ignored) { }
            throw writeErr;                       // rolls back the insert + the supersede-delete
        }
        // delete the superseded files only on successful commit
        if (!supersededPaths.isEmpty()
                && org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override public void afterCommit() {
                        for (String old : supersededPaths) {
                            if (old == null || old.equals(relPath)) { continue; }
                            try { Files.deleteIfExists(Path.of(publicRoot, old)); } catch (Exception ignored) { }
                        }
                    }
                });
        }
        return Map.of("success", true, "id", pid, "warning_code", code, "pdf_url", "/api/storage/" + relPath,
            "message", "Bulletin uploaded and linked to " + code + " — now on the EOCC Bulletin and the portal warning.");
    }

    /** A real PDF starts with the %PDF- signature (0x25 0x50 0x44 0x46 0x2D). */
    private static boolean isPdf(byte[] b) {
        return b.length >= 5 && b[0] == 0x25 && b[1] == 0x50 && b[2] == 0x44 && b[3] == 0x46 && b[4] == 0x2D;
    }

    /** Trim, empty→null, cap length, and strip control + bidi/zero-width chars from public-facing text. */
    private static String cleanDescription(String s) {
        if (s == null) { return null; }
        String cleaned = s.replaceAll("[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]", "")
                          .replaceAll("[\\p{Cntrl}&&[^\\n\\r\\t]]", "")
                          .trim();
        if (cleaned.isEmpty()) { return null; }
        if (cleaned.length() > MAX_DESC_LEN) {
            throw new BusinessRuleException("The description is too long (max " + MAX_DESC_LEN + " characters).");
        }
        return cleaned;
    }

    /** Keep a friendly original name for display, but strip path separators / control / bidi chars and cap it. */
    private static String sanitizeFilename(String original, String fallback) {
        if (original == null || original.isBlank()) { return fallback; }
        String cleaned = original.replaceAll("[\\u200B-\\u200F\\u202A-\\u202E\\u2066-\\u2069\\uFEFF]", "")
                                 .replaceAll("[\\\\/\\p{Cntrl}]", "_").trim();
        if (cleaned.isEmpty()) { return fallback; }
        return cleaned.length() > 200 ? cleaned.substring(0, 200) : cleaned;
    }

    // ── POST /{id}/publish — approved → published + clone to early_warnings (EarlyWarningController@publish) ──
    @PostMapping("/{id}/publish")
    @Transactional
    public Map<String, Object> publish(@PathVariable long id) {
        List<Map<String, Object>> wrows = jdbc.queryForList(
            "select id, warning_code, status from public.warnings where id=?", id);
        if (wrows.isEmpty()) throw new ResourceNotFoundException("Warning not found.");
        Map<String, Object> w = wrows.get(0);
        if (!"approved".equalsIgnoreCase(str(w.get("status")))) {
            throw new BusinessRuleException("Warning must be approved before publishing.");
        }
        String code = str(w.get("warning_code"));
        jdbc.update("update public.warnings set status='published', updated_by=? where id=?", currentUserId(), id);

        List<Map<String, Object>> hazards = jdbc.queryForList(
            "select wh.hazard_id, wh.warning_level, wh.technical_description, wh.latitude, wh.longitude, " +
            "h.name hazard_name, h.type hazard_type, r.name region_name, d.name district_name " +
            "from public.warning_hazards wh " +
            "left join public.hazards h on h.id = wh.hazard_id " +
            "left join public.regions r on r.id = wh.region_id " +
            "left join public.districts d on d.id = wh.district_id " +
            "where wh.warning_id = ? and wh.deleted_at is null", id);

        int published = 0;
        for (Map<String, Object> wh : hazards) {
            String level = str(wh.get("warning_level"));
            String severity = switch (level == null ? "" : level) {
                case "Advisory" -> "Watch";
                case "Warning" -> "Warning";
                case "Major Warning" -> "Emergency";
                default -> "Watch";
            };
            String hazardType = str(wh.get("hazard_type"));
            if (hazardType == null || hazardType.isBlank()) hazardType = "Natural";
            if ("Technological".equalsIgnoreCase(hazardType)) hazardType = "Man-Made";
            String alertMsg = firstNonBlank(str(wh.get("technical_description")),
                "Warning issued for " + firstNonBlank(str(wh.get("hazard_name")), "unknown hazard"));
            String region = firstNonBlank(str(wh.get("region_name")), str(wh.get("district_name")));

            Double lat = num(wh.get("latitude")), lng = num(wh.get("longitude"));
            if ((lat == null || lng == null) && region != null) {
                Map<String, Object> c = centroids.get(norm(region));   // real centroid, not a Dar default
                if (c != null) { lat = num(c.get("lat")); lng = num(c.get("lng")); }
            }

            // Carry the district through (when the hazard area specified one) so the portal map colours the
            // specific district rather than the whole region; region-level areas leave this null.
            String district = str(wh.get("district_name"));
            jdbc.update(
                "insert into public.early_warnings (warning_code, hazard_type, hazard_id, severity_level, " +
                "alert_message, affected_regions, affected_districts, latitude, longitude, show_on_map, status, created_at, updated_at) " +
                // DMIS portal (PortalPublicService) shows early_warnings where status='active' + show_on_map
                "values (?,?,?,?,?,?,?,?,?, true, 'active', now(), now())",
                code, hazardType, wh.get("hazard_id"), severity, alertMsg, region, district, lat, lng);
            published++;
        }
        // The ONE notification backbone: announce the published warning to all DMIS users. Run it AFTER
        // this publish transaction COMMITS (registerSynchronization.afterCommit) so a feed-write can never
        // mark the publish tx rollback-only (the old inline try/catch gave false safety), and so the
        // broadcast's N inserts don't lengthen/hold the publish transaction.
        final String hazardSummary = hazards.stream().map(h -> str(h.get("hazard_name")))
                .filter(x -> x != null).distinct().collect(java.util.stream.Collectors.joining(", "));
        Runnable broadcast = () -> {
            try {
                notifications.notifyAllUsers(tz.go.pmo.dmis.notification.NotificationService.Notice.inApp(
                        "early_warning_published", "Early warning published",
                        "Warning " + code + (hazardSummary.isBlank() ? "" : " (" + hazardSummary + ")")
                                + " is now live on the public portal.",
                        "/m/preparedness/early-warnings", "early_warning", id, "warning"));
            } catch (Exception ignored) { }
        };
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override public void afterCommit() { broadcast.run(); }
                    });
        } else {
            broadcast.run();
        }
        // Cross-sector One Health kick (faithful to OneHealthService::createFromWarning) — non-fatal.
        // Note: Laravel calls this on BOTH ingest and publish (duplicate); we do it on publish only.
        String ohEventId = null;
        try { ohEventId = createOhEventFromWarning(id, code, currentUserId()); } catch (Exception ignored) { }

        return Map.of("success", "Warning published and visible on public portal.",
            "warning_code", code, "published", published, "oh_event_id", ohEventId == null ? "" : ohEventId);
    }

    // ── EW → One Health: auto-create an OH event from the published warning (OneHealthService.createFromWarning) ──
    private static final Map<String, String> OH_NAME_OVERRIDES = new java.util.LinkedHashMap<>() {{
        put("zoonotic", "ZOONOTIC"); put("rabies", "ZOONOTIC"); put("rift valley", "ZOONOTIC");
        put("anthrax", "ZOONOTIC"); put("avian", "ZOONOTIC"); put("epidemic", "EPT"); put("cholera", "EPT");
        put("plague", "EPT"); put("dengue", "EPT"); put("malaria", "EPT"); put("pest", "FOOD_SAFETY");
        put("locust", "FOOD_SAFETY"); put("armyworm", "FOOD_SAFETY"); put("aflatoxin", "FOOD_SAFETY");
        put("food contamination", "FOOD_SAFETY"); put("pollution", "CLIMATE_HEALTH"); put("chemical", "CLIMATE_HEALTH");
        put("radiation", "BIOSAFETY"); put("antimicrobial", "AMR");
    }};
    private static final Map<String, String> OH_PRIORITY = Map.of("Advisory", "medium", "Warning", "high", "Major Warning", "critical");
    private static final Map<String, String> OH_RISK = Map.of("Advisory", "moderate", "Warning", "high", "Major Warning", "very_high");

    private String createOhEventFromWarning(Long warningId, String code, Long publisherId) {
        // no duplicates: if an OH event is already linked to this warning, reuse it (defensive — publish is
        // status-gated so it runs once, but this guards any re-entry).
        List<String> existing = jdbc.queryForList(
            "select event_id from public.oh_events where source_warning_id = ? and deleted_at is null limit 1", String.class, warningId);
        if (!existing.isEmpty()) return existing.get(0);

        List<Map<String, Object>> hs = jdbc.queryForList(
            "select wh.hazard_id, wh.warning_level, wh.technical_description, wh.region_id, wh.district_id, " +
            "wh.latitude, wh.longitude, h.name hazard_name, h.type hazard_type, r.name region_name " +
            "from public.warning_hazards wh left join public.hazards h on h.id = wh.hazard_id " +
            "left join public.regions r on r.id = wh.region_id where wh.warning_id = ? and wh.deleted_at is null order by wh.id", warningId);
        Map<String, Object> first = hs.stream()
            .filter(h -> h.get("region_id") != null && str(h.get("hazard_name")) != null).findFirst().orElse(null);
        if (first == null) return null;                                   // no hazard with a region → skip (matches Laravel)

        Long areaId = resolveOhArea(str(first.get("hazard_name")), str(first.get("hazard_type")));
        List<Long> pmo = jdbc.queryForList(
            "select id from public.stakeholders where organization ilike '%disaster management%' and is_active = true order by id limit 1", Long.class);
        if (areaId == null || pmo.isEmpty()) return null;

        String level = firstNonBlank(str(first.get("warning_level")), "Advisory");
        String hazardNames = hs.stream().map(h -> str(h.get("hazard_name"))).filter(x -> x != null).distinct().collect(java.util.stream.Collectors.joining(", "));
        String regionNames = hs.stream().map(h -> str(h.get("region_name"))).filter(x -> x != null).distinct().collect(java.util.stream.Collectors.joining(", "));
        String tech = str(first.get("technical_description"));
        String desc = "Auto-generated from Early Warning " + code + ".\n\nHazard(s): " + hazardNames
            + "\nAffected Region(s): " + regionNames + (tech != null ? "\n\nTechnical Description:\n" + tech : "");

        try { jdbc.execute("select setval(pg_get_serial_sequence('public.oh_events','id'), greatest((select coalesce(max(id),0) from public.oh_events),1))"); } catch (Exception ignored) { }
        String eventId = nextOhEventCode();
        jdbc.update(
            "insert into public.oh_events (event_id, stakeholder_id, area_of_concern_id, event_title, event_type, " +
            "event_description, date_of_occurrence, region_id, district_id, latitude, longitude, status, priority_level, " +
            "risk_level, submitted_by, submitted_at, source_warning_id, created_at, updated_at) " +
            "values (?,?,?,?, 'ew_alert', ?, current_date, ?,?,?,?, 'submitted', ?,?,?, now(), ?, now(), now())",
            eventId, pmo.get(0), areaId, "EW Alert: " + hazardNames, desc,
            first.get("region_id"), first.get("district_id"), first.get("latitude"), first.get("longitude"),
            OH_PRIORITY.getOrDefault(level, "medium"), OH_RISK.getOrDefault(level, "moderate"), publisherId, warningId);
        return eventId;
    }

    private Long resolveOhArea(String hazardName, String hazardType) {
        String code = null;
        String low = hazardName == null ? "" : hazardName.toLowerCase(Locale.ROOT);
        for (Map.Entry<String, String> e : OH_NAME_OVERRIDES.entrySet()) {
            if (low.contains(e.getKey())) { code = e.getValue(); break; }
        }
        if (code == null) code = "CLIMATE_HEALTH";                        // type_defaults all → CLIMATE_HEALTH
        List<Long> ids = jdbc.queryForList("select id from public.oh_areas_of_concern where code = ? limit 1", Long.class, code);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private String nextOhEventCode() {
        String year = String.valueOf(java.time.Year.now().getValue());
        Integer max = jdbc.queryForObject(
            "select coalesce(max(cast(substring(event_id from ?) as integer)), 0) from public.oh_events where event_id like ?",
            Integer.class, ("OH-" + year + "-").length() + 1, "OH-" + year + "-%");
        return String.format("OH-%s-%05d", year, (max == null ? 0 : max) + 1);
    }

    // ── helpers ──
    private Long currentUserId() {
        try {
            String name = tz.go.pmo.dmis.common.security.SecurityUtils.currentUserName();
            if (name != null && !name.isBlank() && !name.equalsIgnoreCase("System")) {
                List<Long> ids = jdbc.queryForList("select id from public.users where email = ? or name = ? limit 1", Long.class, name, name);
                if (!ids.isEmpty()) return ids.get(0);
            }
            List<Long> any = jdbc.queryForList("select id from public.users order by id limit 1", Long.class);
            return any.isEmpty() ? null : any.get(0);
        } catch (Exception e) { return null; }
    }

    private static String norm(String s) { return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " "); }
    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
    private static String firstNonBlank(String... xs) { for (String x : xs) if (x != null && !x.isBlank()) return x; return null; }
    private static Double num(Object o) {
        if (o instanceof Number n) return n.doubleValue();
        try { return o == null || str(o).isBlank() ? null : Double.parseDouble(str(o).trim()); } catch (Exception e) { return null; }
    }
}
