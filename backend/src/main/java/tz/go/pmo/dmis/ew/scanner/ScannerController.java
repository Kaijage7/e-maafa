package tz.go.pmo.dmis.ew.scanner;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.geo.RegionCentroids;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
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
    private final JurisdictionScope scope;
    private final RegionCentroids centroids;

    public ScannerController(DisasterScannerService scanner, JdbcTemplate jdbc, NotificationService notifications,
                            JurisdictionScope scope, RegionCentroids centroids) {
        this.scanner = scanner;
        this.jdbc = jdbc;
        this.notifications = notifications;
        this.scope = scope;
        this.centroids = centroids;
    }

    /** Where each entity authors — TMA has no agency-event console, it uses the New Bulletin (alert-map) page. */
    private static String consolePath(String agency) {
        return "/m/preparedness/early-warnings/" + ("tma".equals(agency) ? "new-bulletin" : agency);
    }
    /** The agency that owns a tasking (404 if it does not exist). */
    private String taskingAgency(long id) {
        List<String> a = jdbc.queryForList("select agency from public.scanner_entity_taskings where id=?", String.class, id);
        if (a.isEmpty()) { throw new ResourceNotFoundException("Tasking not found."); }
        return a.get(0);
    }
    /** An agency-scoped login (users.agency_id set) may act ONLY on its own agency's taskings; a national /
     *  admin / EOCC login (no agency) may act on any. Prevents one entity answering for another. */
    private void assertOwnAgency(String taskingAgency) {
        String mine = scope.currentAgencyCode();
        if (mine != null && !mine.equalsIgnoreCase(taskingAgency)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "This tasking belongs to " + taskingAgency.toUpperCase(Locale.ROOT)
                    + " — you can only act on your own agency's taskings.");
        }
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
            case "incident": return routeToIncident(id, d, body);
            case "entity":   return routeToEntity(id, d, body);
            case "dismiss":
                jdbc.update("update public.scanner_detections set status='dismissed' where id=?", id);
                return Map.of("success", true, "id", id, "dispatched_as", "dismissed");
            default:
                return Map.of("success", false, "id", id, "message", "Unknown route '" + as + "' (use incident|entity|dismiss).");
        }
    }

    /** Route to the focal-point INCIDENT flow: create a draft incident that rides the national approval chain.
     *  The operator may override the detection's area (region/district) and severity in {@code body}; the chosen
     *  area sets origin_level (district→DED/DAS, region→RAS, else national) and therefore the first approver. */
    private Map<String, Object> routeToIncident(long id, Map<String, Object> d, Map<String, Object> body) {
        String hazardType = str(d.get("hazard_type"));
        Long hazardId = resolveHazardId(hazardType);
        String chosenRegion = body != null ? str(body.get("region")) : null;
        String chosenDistrict = body != null ? str(body.get("district")) : null;
        String region = (chosenRegion != null && !chosenRegion.isBlank()) ? chosenRegion.trim() : str(d.get("region"));
        String district = (chosenDistrict != null && !chosenDistrict.isBlank()) ? chosenDistrict.trim() : str(d.get("district"));
        Long regionId = resolveRegionId(region);
        Long districtId = resolveDistrictId(district, regionId);
        if (districtId != null && regionId == null) {                 // district chosen without region → derive region
            regionId = jdbc.queryForList("select region_id from public.districts where id=?", Long.class, districtId)
                .stream().findFirst().orElse(null);
            if (regionId != null && (region == null || region.isBlank())) {
                region = jdbc.queryForList("select name from public.regions where id=?", String.class, regionId)
                    .stream().findFirst().orElse(region);
            }
        }
        String chosenSev = body != null ? str(body.get("severity")) : null;
        String severity = mapIncidentSeverity((chosenSev != null && !chosenSev.isBlank()) ? chosenSev : str(d.get("severity")));
        String originLevel = districtId != null ? "district" : (regionId != null ? "region" : "national");
        // A scanner news detection often has NO coordinates; fall back to the chosen region's centroid so the
        // incident can actually be plotted / pushed to the public map (otherwise it is invisible there).
        Double lat = dbl(d.get("latitude"));
        Double lng = dbl(d.get("longitude"));
        if (lat == null) {
            double[] c = centroids.forRegion(region);
            if (c != null) { lat = c[0]; lng = c[1]; }
        }
        healSeq("incidents");
        Long incidentId = jdbc.queryForObject(
            "insert into public.incidents(title, hazard_id, region_id, region_name, district_id, district_name, latitude, longitude, "
                + "reported_at, description, severity_level, status, workflow_status, origin_level, source_of_report, created_at, updated_at) "
                + "values (?,?,?,?,?,?,?,?, now(), ?,?, 'Reported', 'draft', ?, 'Disaster Scanner', now(), now()) returning id",
            Long.class, str(d.get("title")), hazardId, regionId, region, districtId, district,
            lat, lng, str(d.get("summary")), severity, originLevel);
        jdbc.update("update public.scanner_detections set status='dispatched', dispatched_as='incident', "
            + "dispatched_ref=?, incident_id=? where id=?", "INC-" + incidentId, incidentId, id);
        String area = district != null && !district.isBlank() ? district : (region != null ? region : "national");
        notifications.notifyAllUsers(Notice.inApp("scanner_incident",
            "New incident from Disaster Scanner",
            str(d.get("title")) + " — " + area + " (" + originLevel + ", awaiting focal-point review).",
            "/m/response/incidents", "incident", incidentId, severity.toLowerCase(Locale.ROOT)));
        return Map.of("success", true, "id", id, "dispatched_as", "incident", "incident_id", incidentId,
            "origin_level", originLevel, "area", area,
            "message", "Created draft incident #" + incidentId + " for " + area + " — now in the "
                + originLevel + "-level focal-point / approval flow.");
    }

    /** Route a hazard to a warning entity for verification. The operator may pick the entity explicitly in
     *  {@code body.agency} (default = the hazard's owner) and attach urgency / source / an instruction. */
    private Map<String, Object> routeToEntity(long id, Map<String, Object> d, Map<String, Object> body) {
        String hazardType = str(d.get("hazard_type"));
        String chosen = body != null ? str(body.get("agency")) : null;
        String agency = (chosen != null && !chosen.isBlank())
            ? chosen.trim().toLowerCase(Locale.ROOT)
            : resolveAgency(hazardType, str(d.get("title")) + " " + str(d.get("summary")));
        if (agency == null) {
            return Map.of("success", false, "id", id,
                "message", "No warning entity owns hazard '" + hazardType + "'. Pick an entity, or route it as an incident.");
        }
        if (!AGENCY_NAME.containsKey(agency)) {
            return Map.of("success", false, "id", id, "message", "Unknown warning entity '" + agency + "'.");
        }
        String urgency = normalizeUrgency(body != null ? str(body.get("urgency")) : null);
        String source = body != null ? str(body.get("source")) : null;
        String instruction = body != null ? str(body.get("instruction")) : null;
        String region = str(d.get("region"));
        String hazardLabel = hazardType == null ? "hazard" : hazardType.replace('_', ' ');
        String message = (instruction != null && !instruction.isBlank()) ? instruction.trim()
            : "Online report of " + hazardLabel + (region != null ? " in " + region : "")
                + " — please verify and issue an official assessment.";
        Long taskingId = jdbc.queryForObject(
            "insert into public.scanner_entity_taskings(detection_id, agency, hazard_type, region, status, message, "
                + "urgency, source, instruction, requested_at) values (?,?,?,?, 'awaiting', ?,?,?,?, now()) returning id",
            Long.class, id, agency, hazardType, region, message, urgency, source, instruction);
        jdbc.update("update public.scanner_detections set status='dispatched', dispatched_as=?, assigned_entity=? where id=?",
            "entity:" + agency, agency, id);
        String urgTag = urgency != null ? "[" + urgency + "] " : "";
        notifications.notifyAllUsers(Notice.inApp("scanner_tasking",
            AGENCY_NAME.get(agency) + ": " + urgTag + "verify online " + hazardLabel + " report",
            message, consolePath(agency), "scanner_detection", id,
            "Immediate".equals(urgency) ? "critical" : "high"));
        return Map.of("success", true, "id", id, "dispatched_as", "entity", "agency", agency, "tasking_id", taskingId,
            "message", "Routed to " + AGENCY_NAME.get(agency) + (urgency != null ? " (" + urgency + ")" : "")
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
                + "t.urgency, t.source, t.instruction, t.acknowledged_at, "
                + "t.response_severity, t.response_message, t.response_action, t.response_attachment, "
                + "t.review_outcome, t.review_note, t.reviewed_at, "
                + "t.responded_submission_id, t.responded_at, d.id as detection_id, d.title, d.summary, d.url, "
                + "d.source_id, d.severity "
                + "from public.scanner_entity_taskings t join public.scanner_detections d on d.id = t.detection_id "
                + "where " + where + " order by t.requested_at desc limit 200", args.toArray());
        return Map.of("taskings", rows,
            "awaiting", jdbc.queryForObject("select count(*) from public.scanner_entity_taskings where status in ('awaiting','acknowledged','returned')", Integer.class),
            "responded", jdbc.queryForObject("select count(*) from public.scanner_entity_taskings where status='responded'", Integer.class));
    }

    /** Entity acknowledges receipt of a tasking (awaiting → acknowledged). */
    @PostMapping("/taskings/{id}/acknowledge")
    @Transactional
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> acknowledgeTasking(@PathVariable long id) {
        assertOwnAgency(taskingAgency(id));
        int n = jdbc.update("update public.scanner_entity_taskings set status='acknowledged', acknowledged_at=now() "
            + "where id=? and status='awaiting'", id);
        if (n == 0) throw new ResourceNotFoundException("Tasking not found or no longer awaiting.");
        return Map.of("success", true, "id", id, "status", "acknowledged");
    }

    /** The entity submits its official ASSESSMENT and re-sends the tasking for EOCC review
     *  (awaiting/acknowledged/returned → responded). This is the "work on it & resend" leg. */
    @PostMapping("/taskings/{id}/respond")
    @Transactional
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> respondTasking(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        assertOwnAgency(taskingAgency(id));
        Long submissionId = body != null ? parseLong(body.get("submission_id")) : null;
        String sev = body != null ? str(body.get("response_severity")) : null;
        String msg = body != null ? str(body.get("response_message")) : null;
        String act = body != null ? str(body.get("response_action")) : null;
        String att = body != null ? str(body.get("response_attachment")) : null;
        if ((msg == null || msg.isBlank()) && submissionId == null) {
            return Map.of("success", false, "id", id, "message", "Add your assessment before re-sending.");
        }
        int n = jdbc.update("update public.scanner_entity_taskings set status='responded', responded_submission_id=?, "
            + "response_severity=?, response_message=?, response_action=?, response_attachment=?, responded_at=now() "
            + "where id=? and status in ('awaiting','acknowledged','returned')",
            submissionId, sev, msg, act, att, id);
        if (n == 0) throw new ResourceNotFoundException("Tasking not found or not in a respondable state.");
        Map<String, Object> t = jdbc.queryForMap("select agency, hazard_type, region, detection_id "
            + "from public.scanner_entity_taskings where id=?", id);
        String hazard = str(t.get("hazard_type")) == null ? "hazard" : str(t.get("hazard_type")).replace('_', ' ');
        notifications.notifyAllUsers(Notice.inApp("scanner_response",
            AGENCY_NAME.getOrDefault(str(t.get("agency")), String.valueOf(t.get("agency")).toUpperCase(Locale.ROOT))
                + " responded — assessment for review",
            hazard + (t.get("region") != null ? " in " + t.get("region") : "")
                + " — official assessment submitted; review to accept or return.",
            "/m/preparedness/early-warnings/scanner", "scanner_detection", parseLong(t.get("detection_id")),
            "Critical".equalsIgnoreCase(sev) ? "critical" : "high"));
        return Map.of("success", true, "id", id, "status", "responded");
    }

    /** EOCC reviews an entity's response: accept (feeds Impact Analysis) or return for revision (entity reworks).
     *  responded → accepted | returned. */
    @PostMapping("/taskings/{id}/review")
    @Transactional
    @PreAuthorize("hasAuthority('early_warning.approve')")
    public Map<String, Object> reviewTasking(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        String outcome = body != null ? str(body.get("outcome")) : null;
        outcome = outcome == null ? "" : outcome.trim().toLowerCase(Locale.ROOT);
        if (!outcome.equals("accepted") && !outcome.equals("returned")) {
            return Map.of("success", false, "id", id, "message", "outcome must be 'accepted' or 'returned'.");
        }
        String note = body != null ? str(body.get("note")) : null;
        int n = jdbc.update("update public.scanner_entity_taskings set status=?, review_outcome=?, review_note=?, "
            + "reviewed_at=now() where id=? and status='responded'", outcome, outcome, note, id);
        if (n == 0) throw new ResourceNotFoundException("Tasking not found or not awaiting review.");
        Map<String, Object> t = jdbc.queryForMap("select agency, hazard_type, region, detection_id "
            + "from public.scanner_entity_taskings where id=?", id);
        String entity = AGENCY_NAME.getOrDefault(str(t.get("agency")), String.valueOf(t.get("agency")).toUpperCase(Locale.ROOT));
        String hazard = str(t.get("hazard_type")) == null ? "hazard" : str(t.get("hazard_type")).replace('_', ' ');
        String where = t.get("region") != null ? " in " + t.get("region") : "";
        if (outcome.equals("returned")) {
            notifications.notifyAllUsers(Notice.inApp("scanner_returned",
                entity + ": assessment returned for revision",
                hazard + where + " — " + (note != null && !note.isBlank() ? note : "please revise and re-send."),
                consolePath(str(t.get("agency"))), "scanner_detection", parseLong(t.get("detection_id")), "high"));
        } else {
            notifications.notifyAllUsers(Notice.inApp("scanner_accepted",
                entity + ": assessment accepted",
                hazard + where + " — verified & accepted by EOCC; the entity's assessment is recorded.",
                "/m/preparedness/early-warnings/scanner", "scanner_detection", parseLong(t.get("detection_id")), "low"));
        }
        return Map.of("success", true, "id", id, "status", outcome);
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
    private Long resolveDistrictId(String name, Long regionId) {
        if (name == null || name.isBlank()) return null;
        String nm = name.trim().toLowerCase(Locale.ROOT);
        List<Long> ids = regionId != null
            ? jdbc.queryForList("select id from public.districts where lower(name)=? and region_id=? limit 1", Long.class, nm, regionId)
            : jdbc.queryForList("select id from public.districts where lower(name)=? limit 1", Long.class, nm);
        return ids.isEmpty() ? null : ids.get(0);
    }
    /** Normalize to the e-MAAFA dispatch urgency standard; null if unrecognized/absent. */
    private static String normalizeUrgency(String u) {
        if (u == null) return null;
        switch (u.trim().toLowerCase(Locale.ROOT)) {
            case "immediate": return "Immediate";
            case "urgent":    return "Urgent";
            case "routine":   return "Routine";
            default:          return null;
        }
    }
    /** Map any severity word to the incident severity vocabulary (Minor/Moderate/Major/Critical). */
    private static String mapIncidentSeverity(String s) {
        if (s == null) return "Moderate";
        switch (s.trim().toLowerCase(Locale.ROOT)) {
            case "critical":            return "Critical";
            case "major": case "high":  return "Major";
            case "minor": case "low":   return "Minor";
            default:                    return "Moderate";   // medium / moderate / unknown
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
