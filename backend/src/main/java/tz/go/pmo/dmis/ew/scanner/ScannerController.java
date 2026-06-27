package tz.go.pmo.dmis.ew.scanner;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.notification.NotificationService;
import tz.go.pmo.dmis.notification.NotificationService.Notice;

/**
 * OSINT disaster-scanner API. Read-authenticated list/stats; triage (dismiss) + dispatch are operator actions.
 *
 * <p>Dispatch is a REAL router (not the old stamp-only stub), matching the intended monitoring flow:
 * <ul>
 *   <li><b>incident</b> — create a draft Incident in the national pipeline (public.incidents, workflow_status=
 *       'draft'); a focal point/officer then submits it and it rides the DAS→RAS→AsstDir→Director approval chain.</li>
 *   <li><b>entity</b> — an online hazard NOT reported by an entity (earthquake, El&nbsp;Niño…) or an external
 *       SHOC/IGAD/AU alert is routed to the RELEVANT warning entity via the hazard→entity map: a tasking is
 *       created (public.scanner_entity_taskings) and every user is notified to verify + issue an official
 *       assessment. The entity then authors its normal bulletin (closing the loop).</li>
 *   <li><b>dismiss</b> — false alarm / not actionable.</li>
 * </ul>
 */
@RestController
@RequestMapping("/v1/ew/scanner")
@PreAuthorize("isAuthenticated()")
public class ScannerController {

    private final DisasterScannerService scanner;
    private final JdbcTemplate jdbc;
    private final NotificationService notifications;

    public ScannerController(DisasterScannerService scanner, JdbcTemplate jdbc, NotificationService notifications) {
        this.scanner = scanner;
        this.jdbc = jdbc;
        this.notifications = notifications;
    }

    // hazard_type (scanner vocabulary, lowercase) → warning entity that owns it (reconciled with AGENCY_HAZARDS).
    private static final Map<String, String> HAZARD_TO_AGENCY = Map.ofEntries(
        Map.entry("flood", "mow"),
        Map.entry("heavy_rain", "tma"), Map.entry("strong_wind", "tma"), Map.entry("cyclone", "tma"), Map.entry("lightning", "tma"),
        Map.entry("earthquake", "gst"), Map.entry("landslide", "gst"), Map.entry("volcano", "gst"),
        Map.entry("disease", "moh"),
        Map.entry("drought", "moa"),
        Map.entry("fire", "nemc"), Map.entry("pollution", "nemc"), Map.entry("air_pollution", "nemc"),
        Map.entry("livestock", "mlf"), Map.entry("livestock_disease", "mlf"), Map.entry("fisheries", "mlf"));

    // hazard_type → a keyword to LIKE-match against public.hazards so a draft incident gets the right hazard_id.
    private static final Map<String, String> HAZARD_TO_KEYWORD = Map.ofEntries(
        Map.entry("flood", "flood"), Map.entry("heavy_rain", "rain"), Map.entry("strong_wind", "wind"),
        Map.entry("cyclone", "cyclone"), Map.entry("earthquake", "earthquake"), Map.entry("landslide", "landslide"),
        Map.entry("volcano", "volcan"), Map.entry("disease", "epidemic"), Map.entry("drought", "drought"),
        Map.entry("fire", "wildfire"), Map.entry("lightning", "lightning"), Map.entry("pollution", "industrial"));

    private static final Map<String, String> AGENCY_NAME = Map.of(
        "tma", "Tanzania Meteorological Authority", "mow", "Ministry of Water", "gst", "Geological Survey of Tanzania",
        "moh", "Ministry of Health", "moa", "Ministry of Agriculture", "nemc", "National Environment Management Council",
        "mlf", "Ministry of Livestock and Fisheries");

    /** Trigger a live scan of all OSINT sources; returns how many were captured + how many were new. */
    @PostMapping("/scan")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> scan(@RequestParam(defaultValue = "7") int days) {
        return scanner.scanAll(days);
    }

    /** List detections, newest first, filterable by status / hazard_type / source. */
    @GetMapping("/detections")
    public Map<String, Object> detections(@RequestParam(required = false) String status,
                                          @RequestParam(required = false) String hazard,
                                          @RequestParam(required = false) String source,
                                          @RequestParam(defaultValue = "200") int limit) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> args = new ArrayList<>();
        if (status != null && !status.isBlank()) { where.append(" and status=?"); args.add(status); }
        if (hazard != null && !hazard.isBlank()) { where.append(" and hazard_type=?"); args.add(hazard); }
        if (source != null && !source.isBlank()) { where.append(" and source_id=?"); args.add(source); }
        args.add(Math.min(Math.max(limit, 1), 500));
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select id, source_id, title, summary, url, hazard_type, severity, reliability, region, district, "
                + "latitude, longitude, published_at, detected_at, status, dispatched_as, dispatched_ref, "
                + "assigned_entity, incident_id "
                + "from public.scanner_detections where " + where + " order by detected_at desc limit ?",
            args.toArray());
        return Map.of("detections", rows, "stats", stats());
    }

    @GetMapping("/stats")
    public Map<String, Object> statsEndpoint() { return stats(); }

    /**
     * Regional &amp; Sectorial Information intake (Monitoring stream ②): a regional disaster-management center
     * or a sector lead files a field report. It is stored as a detection (reliability='official') so it rides
     * the SAME triage as online detections — dispatch → entity (verify &amp; issue assessment) or → incident.
     */
    @PostMapping("/report")
    @Transactional
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> manualReport(@RequestBody Map<String, Object> r) {
        String title = str(r.get("title"));
        if (title == null || title.isBlank()) {
            return Map.of("success", false, "message", "A report title is required.");
        }
        String dedup = "manual-" + System.currentTimeMillis() + "-" + Math.abs(title.hashCode());
        Long id = jdbc.queryForObject(
            "insert into public.scanner_detections(source_id, dedup_key, title, summary, url, hazard_type, "
                + "severity, reliability, region, district, status, detected_at, published_at) "
                + "values (?,?,?,?,?,?,?,?,?,?, 'new', now(), now()) returning id",
            Long.class, strOr(r.get("source_id"), "regional_center"), dedup, title, str(r.get("summary")),
            str(r.get("url")), str(r.get("hazard_type")), strOr(r.get("severity"), "medium"),
            strOr(r.get("reliability"), "official"), str(r.get("region")), str(r.get("district")));
        return Map.of("success", true, "id", id, "status", "new",
            "message", "Regional/sectorial report logged — dispatch it to the responsible entity or raise an incident.");
    }

    /** Dismiss a detection (false alarm / not actionable). */
    @PostMapping("/{id}/dismiss")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> dismiss(@PathVariable long id) {
        int n = jdbc.update("update public.scanner_detections set status='dismissed' where id=? and status not in ('dispatched')", id);
        if (n == 0) throw new ResourceNotFoundException("Detection not found or already dispatched.");
        return Map.of("success", true, "id", id, "status", "dismissed");
    }

    /** Dispatch a detection: as ∈ {incident, entity, dismiss}. */
    @PostMapping("/{id}/dispatch")
    @Transactional
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> dispatch(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select id, title, summary, url, hazard_type, severity, region, district, latitude, longitude, status "
                + "from public.scanner_detections where id=?", id);
        if (rows.isEmpty()) throw new ResourceNotFoundException("Detection not found.");
        Map<String, Object> d = rows.get(0);
        if ("dispatched".equals(str(d.get("status")))) {
            return Map.of("success", false, "id", id, "message", "Already dispatched.");
        }
        String as = body != null && body.get("as") != null ? String.valueOf(body.get("as")).toLowerCase(Locale.ROOT) : "entity";
        switch (as) {
            case "incident": return routeToIncident(id, d);
            case "entity":   return routeToEntity(id, d);
            case "dismiss":
                jdbc.update("update public.scanner_detections set status='dismissed' where id=?", id);
                return Map.of("success", true, "id", id, "dispatched_as", "dismissed");
            default:
                return Map.of("success", false, "id", id, "message", "Unknown route '" + as + "' (use incident|entity|dismiss).");
        }
    }

    /** Route to the focal-point INCIDENT flow: create a draft incident that rides the national approval chain. */
    private Map<String, Object> routeToIncident(long id, Map<String, Object> d) {
        String hazardType = str(d.get("hazard_type"));
        Long hazardId = resolveHazardId(hazardType);
        String region = str(d.get("region"));
        Long regionId = resolveRegionId(region);
        String severity = mapSeverity(str(d.get("severity")));
        String originLevel = regionId != null ? "region" : "national";
        healSeq("incidents");
        Long incidentId = jdbc.queryForObject(
            "insert into public.incidents(title, hazard_id, region_id, region_name, latitude, longitude, reported_at, "
                + "description, severity_level, status, workflow_status, origin_level, source_of_report, created_at, updated_at) "
                + "values (?,?,?,?,?,?, now(), ?,?, 'Reported', 'draft', ?, 'Disaster Scanner', now(), now()) returning id",
            Long.class, str(d.get("title")), hazardId, regionId, region, dbl(d.get("latitude")), dbl(d.get("longitude")),
            str(d.get("summary")), severity, originLevel);
        jdbc.update("update public.scanner_detections set status='dispatched', dispatched_as='incident', "
            + "dispatched_ref=?, incident_id=? where id=?", "INC-" + incidentId, incidentId, id);
        notifications.notifyAllUsers(Notice.inApp("scanner_incident",
            "New incident from Disaster Scanner",
            str(d.get("title")) + (region != null ? " — " + region : "") + " (awaiting focal-point review).",
            "/m/response/incidents", "incident", incidentId, severity.toLowerCase(Locale.ROOT)));
        return Map.of("success", true, "id", id, "dispatched_as", "incident", "incident_id", incidentId,
            "message", "Created draft incident #" + incidentId + " — now in the focal-point / approval flow.");
    }

    /** Route an online-only hazard (or SHOC/IGAD/AU alert) to the RELEVANT warning entity for verification. */
    private Map<String, Object> routeToEntity(long id, Map<String, Object> d) {
        String hazardType = str(d.get("hazard_type"));
        String agency = resolveAgency(hazardType, str(d.get("title")) + " " + str(d.get("summary")));
        if (agency == null) {
            return Map.of("success", false, "id", id,
                "message", "No warning entity owns hazard '" + hazardType + "'. Route it as an incident instead.");
        }
        String region = str(d.get("region"));
        String hazardLabel = hazardType == null ? "hazard" : hazardType.replace('_', ' ');
        Long taskingId = jdbc.queryForObject(
            "insert into public.scanner_entity_taskings(detection_id, agency, hazard_type, region, status, message, requested_at) "
                + "values (?,?,?,?, 'awaiting', ?, now()) returning id",
            Long.class, id, agency, hazardType, region,
            "Online report of " + hazardLabel + (region != null ? " in " + region : "")
                + " — please verify and issue an official assessment.");
        jdbc.update("update public.scanner_detections set status='dispatched', dispatched_as=?, assigned_entity=? where id=?",
            "entity:" + agency, agency, id);
        notifications.notifyAllUsers(Notice.inApp("scanner_tasking",
            AGENCY_NAME.getOrDefault(agency, agency.toUpperCase(Locale.ROOT)) + ": verify online " + hazardLabel + " report",
            "Online report of " + hazardLabel + (region != null ? " in " + region : "")
                + " was not yet issued by an entity. Verify and issue an official assessment.",
            "/m/preparedness/early-warnings/" + agency, "scanner_detection", id, "high"));
        return Map.of("success", true, "id", id, "dispatched_as", "entity", "agency", agency,
            "tasking_id", taskingId, "message", "Routed to " + AGENCY_NAME.getOrDefault(agency, agency.toUpperCase(Locale.ROOT))
                + " for verification & official assessment.");
    }

    /** Entity inbox: online detections routed to a warning entity, awaiting its official assessment. */
    @GetMapping("/entity-taskings")
    public Map<String, Object> entityTaskings(@RequestParam(required = false) String agency,
                                              @RequestParam(required = false) String status) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> args = new ArrayList<>();
        if (agency != null && !agency.isBlank()) { where.append(" and t.agency=?"); args.add(agency); }
        if (status != null && !status.isBlank()) { where.append(" and t.status=?"); args.add(status); }
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select t.id, t.agency, t.hazard_type, t.region, t.status, t.message, t.requested_at, "
                + "t.responded_submission_id, t.responded_at, d.id as detection_id, d.title, d.summary, d.url, "
                + "d.source_id, d.severity "
                + "from public.scanner_entity_taskings t join public.scanner_detections d on d.id = t.detection_id "
                + "where " + where + " order by t.requested_at desc limit 200", args.toArray());
        return Map.of("taskings", rows,
            "awaiting", jdbc.queryForObject("select count(*) from public.scanner_entity_taskings where status='awaiting'", Integer.class));
    }

    /** Mark a tasking responded (the entity issued its official assessment / submission). */
    @PostMapping("/taskings/{id}/respond")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> respondTasking(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Long submissionId = body != null ? parseLong(body.get("submission_id")) : null;
        int n = jdbc.update("update public.scanner_entity_taskings set status='responded', responded_submission_id=?, "
            + "responded_at=now() where id=?", submissionId, id);
        if (n == 0) throw new ResourceNotFoundException("Tasking not found.");
        return Map.of("success", true, "id", id, "status", "responded");
    }

    // ── helpers ──
    private String resolveAgency(String hazardType, String text) {
        String t = text == null ? "" : text.toLowerCase(Locale.ROOT);
        if (t.contains("el nino") || t.contains("el niño") || t.contains("elnino")) return "moa";  // El Niño → agriculture (+ TMA)
        if (hazardType == null) return null;
        return HAZARD_TO_AGENCY.get(hazardType.toLowerCase(Locale.ROOT));
    }
    private Long resolveHazardId(String hazardType) {
        if (hazardType == null) return null;
        String kw = HAZARD_TO_KEYWORD.getOrDefault(hazardType.toLowerCase(Locale.ROOT), hazardType.toLowerCase(Locale.ROOT));
        List<Long> ids = jdbc.queryForList("select id from public.hazards where lower(name) like ? order by id limit 1",
            Long.class, "%" + kw + "%");
        return ids.isEmpty() ? null : ids.get(0);
    }
    private Long resolveRegionId(String name) {
        if (name == null || name.isBlank()) return null;
        List<Long> ids = jdbc.queryForList("select id from public.regions where lower(name) = ? limit 1",
            Long.class, name.trim().toLowerCase(Locale.ROOT));
        return ids.isEmpty() ? null : ids.get(0);
    }
    private static String mapSeverity(String s) {
        if (s == null) return "Medium";
        switch (s.toLowerCase(Locale.ROOT)) {
            case "critical": return "Critical";
            case "high": return "High";
            case "low": return "Low";
            default: return "Medium";
        }
    }
    private void healSeq(String table) {
        try {
            jdbc.execute("select setval(pg_get_serial_sequence('public." + table + "','id'), "
                + "greatest((select coalesce(max(id),0) from public." + table + "),1))");
        } catch (Exception ignored) { }
    }
    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
    private static String strOr(Object o, String dflt) { String s = str(o); return s == null || s.isBlank() ? dflt : s; }
    private static Double dbl(Object o) {
        if (o instanceof Number n) return n.doubleValue();
        try { return o == null ? null : Double.parseDouble(String.valueOf(o)); } catch (Exception e) { return null; }
    }
    private static Long parseLong(Object o) {
        if (o instanceof Number n) return n.longValue();
        try { return o == null ? null : Long.parseLong(String.valueOf(o).trim()); } catch (Exception e) { return null; }
    }

    private Map<String, Object> stats() {
        return jdbc.queryForMap(
            "select count(*) as total, "
                + "count(*) filter (where status='new') as new, "
                + "count(*) filter (where status='dispatched') as dispatched, "
                + "count(*) filter (where status='dismissed') as dismissed, "
                + "count(*) filter (where severity in ('critical','high')) as high_severity, "
                + "count(*) filter (where detected_at > now() - interval '24 hours') as last_24h "
                + "from public.scanner_detections");
    }
}
