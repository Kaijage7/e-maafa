package tz.go.pmo.dmis.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.ew.MgovSmsService;
import tz.go.pmo.dmis.notification.AudienceService;
import tz.go.pmo.dmis.notification.MailService;
import tz.go.pmo.dmis.notification.NotificationService;
import tz.go.pmo.dmis.service.EwProductsService;

/**
 * EW Generated Products — each generated 722E_4 bulletin PDF is stored and anchored
 * to its geography for list/map/download. Dissemination wires to Communication Center.
 * <p>Logic in service.impl (eGA). Acting user via {@link CurrentUserResolver}.
 * Index filters severity/type are productive; stats match the same filter.
 */
@Service
public class EwProductsServiceImpl implements EwProductsService {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> SEV_ORDER = List.of("ADVISORY", "WARNING", "MAJOR_WARNING");


    private final JdbcTemplate jdbc;
    private final String publicRoot;
    private final MgovSmsService sms;
    private final MailService mail;
    private final AudienceService audiences;
    private final NotificationService notifications;
    private final CurrentUserResolver users;

    public EwProductsServiceImpl(JdbcTemplate jdbc,
                                 @Value("${dmis.storage.public-root:${user.dir}/storage/public}") String publicRoot,
                                 MgovSmsService sms, MailService mail,
                                 AudienceService audiences, NotificationService notifications,
                                 CurrentUserResolver users) {
        this.jdbc = jdbc;
        this.publicRoot = publicRoot;
        this.sms = sms;
        this.mail = mail;
        this.audiences = audiences;
        this.notifications = notifications;
        this.users = users;
    }

    /** Store a generated bulletin: the PDF blob + its envelope/geo metadata. */
    @Transactional
    // the broader EW dissemination tier via the class-level gate above.
    @Override
    public Map<String, Object> store(MultipartFile pdf,
                                     String payloadJson) throws Exception {
        if (pdf == null || pdf.isEmpty()) {
            throw new BusinessRuleException("The generated PDF is required.");
        }
        // Parity with the manual upload: the stored bytes are served on the public portal, so reject anything
        // that is not a real PDF (read once, reuse for the write).
        byte[] bytes = pdf.getBytes();
        if (bytes.length < 1024 || !isPdf(bytes)) {
            throw new BusinessRuleException("The generated file is not a valid PDF.");
        }
        Map<String, Object> p = JSON.readValue(payloadJson, Map.class);

        // store the PDF under storage/public/ew-products/<uuid>.pdf
        String fileName = UUID.randomUUID() + ".pdf";
        String relPath = "ew-products/" + fileName;

        // A bulletin with no centroid is invisible on the public map (the portal requires centroid not null)
        // and publish never recomputes it — so fall back to the average region centroid of the affected
        // districts. This guarantees a coordinate even if the client couldn't resolve per-district points.
        Double cLat = dbl(p.get("centroid_lat"));
        Double cLng = dbl(p.get("centroid_lng"));
        if (cLat == null || cLng == null) {
            double[] fb = fallbackCentroid(parseRegions(p.get("regions")));
            if (fb != null) { cLat = fb[0]; cLng = fb[1]; }
        }

        // Insert FIRST, then write the file; clean up a partial file on write failure so a DB rollback never
        // strands an orphan PDF (and a write failure never leaves a row pointing at a missing file).
        Long id = jdbc.queryForObject("""
                insert into public.ew_generated_products(title, bulletin_type, warning_code, issue_date,
                    issue_time, severity, regions, envelope, centroid_lat, centroid_lng, pdf_path, file_name,
                    generated_at, created_at)
                values (?,?,?,?::date,?,?,?::json,?::json,?,?,?,?, now(), now()) returning id
                """, Long.class, str(p.get("title")), strOr(p.get("bulletin_type"), "722E_4"),
                str(p.get("warning_code")), str(p.get("issue_date")), str(p.get("issue_time")),
                str(p.get("severity")), jsonOrNull(p.get("regions")), jsonOrNull(p.get("envelope")),
                cLat, cLng, relPath,
                strOr(p.get("title"), "bulletin") + ".pdf");
        Path target = Path.of(publicRoot, "ew-products", fileName);
        try {
            Files.createDirectories(target.getParent());
            Files.write(target, bytes);
        } catch (Exception writeErr) {
            try { Files.deleteIfExists(target); } catch (Exception ignored) { }
            throw writeErr;
        }
        return Map.of("success", true, "id", id, "pdf_url", "/api/storage/" + relPath,
                "message", "Bulletin stored and added to the map.");
    }

    /**
     * Upload a standalone bulletin PDF into the registry — a contingency document not produced by the EW
     * engine and not tied to a specific warning. Stored as a MANUAL product and left in Draft until
     * published. Publication here is an internal registry state; it does not change the warning_code
     * linkage that drives the public portal.
     */
    @Override
    @Transactional
    public Map<String, Object> upload(MultipartFile pdf,
                                      String title,
                                      String description) throws Exception {
        if (pdf == null || pdf.isEmpty()) {
            throw new BusinessRuleException("The bulletin PDF is required.");
        }
        byte[] bytes = pdf.getBytes();
        if (bytes.length < 1024 || !isPdf(bytes)) {
            throw new BusinessRuleException("The uploaded file is not a valid PDF.");
        }
        String displayTitle = strOr(title, "Uploaded Bulletin");
        String fileName = UUID.randomUUID() + ".pdf";
        String relPath = "ew-products/" + fileName;
        Long id = jdbc.queryForObject("""
                insert into public.ew_generated_products(title, bulletin_type, issue_date, severity, regions,
                    pdf_path, file_name, description, generated_by, generated_at, created_at)
                values (?, 'MANUAL', current_date, 'ADVISORY', '[]'::json, ?, ?, ?, ?, now(), now()) returning id
                """, Long.class, displayTitle, relPath, displayTitle + ".pdf", str(description), users.actingUserId());
        Path target = Path.of(publicRoot, "ew-products", fileName);
        try {
            Files.createDirectories(target.getParent());
            Files.write(target, bytes);
        } catch (Exception writeErr) {
            try { Files.deleteIfExists(target); } catch (Exception ignored) { }
            throw writeErr;
        }
        return Map.of("success", true, "id", id, "pdf_url", "/api/storage/" + relPath,
                "message", "Bulletin uploaded to the registry.");
    }

    /**
     * Publish a bulletin to one or both public targets: the Publications library (a downloadable
     * {@code disaster_risk_frameworks} document of type 'Bulletin') and/or the portal map. With neither
     * target selected the bulletin is unpublished (its Publications document is removed and it leaves
     * the map). Internal-only registry rows simply stay unpublished.
     */
    @Override
    @Transactional
    public Map<String, Object> setPublished(long id,
                                            Map<String, Object> body) {
        boolean toPublications = body != null && Boolean.TRUE.equals(body.get("publications"));
        boolean toMap = body != null && Boolean.TRUE.equals(body.get("map"));
        boolean published = toPublications || toMap;

        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, title, pdf_path, description, issue_date, warning_code from public.ew_generated_products where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Bulletin product not found.");
        }
        Map<String, Object> b = rows.get(0);
        Long userId = published ? users.actingUserId() : null;

        jdbc.update("""
                update public.ew_generated_products
                set is_published = ?, show_on_map = ?, published_at = case when ? then now() else null end,
                    published_by = ? where id = ?
                """, published, toMap, published, userId, id);

        // Keep early_warnings portal map in step with published bulletins so the citizen portal
        // shows the same national picture (warning pins + PDF) without a second manual map toggle.
        String warningCode = b.get("warning_code") == null ? null : String.valueOf(b.get("warning_code")).trim();
        if (warningCode != null && !warningCode.isBlank()) {
            if (toMap) {
                jdbc.update("""
                        update public.early_warnings
                        set show_on_map = true, updated_at = now()
                        where warning_code = ? and status = 'active'
                        """, warningCode);
            } else {
                // Only clear map pins when no other published product for this code remains on the map.
                Integer stillOnMap = jdbc.queryForObject("""
                        select count(*)::int from public.ew_generated_products
                        where warning_code = ? and coalesce(is_published,false)=true
                          and coalesce(show_on_map,false)=true and id <> ?
                        """, Integer.class, warningCode, id);
                if (stillOnMap == null || stillOnMap == 0) {
                    jdbc.update("""
                            update public.early_warnings
                            set show_on_map = false, updated_at = now()
                            where warning_code = ? and status = 'active'
                            """, warningCode);
                }
            }
        }

        // Publications target: upsert (or remove) a public 'Bulletin' document keyed back to this product.
        String repoKey = "EOCC-BULLETIN-" + id;
        if (toPublications) {
            int updated = jdbc.update("""
                    update public.disaster_risk_frameworks
                    set document_name = ?, attachment_path = ?, narrative_description = ?, status = 'published',
                        updated_at = now() where repository_entry_id = ?
                    """, str(b.get("title")), str(b.get("pdf_path")), str(b.get("description")), repoKey);
            if (updated == 0) {
                jdbc.update("""
                        insert into public.disaster_risk_frameworks(repository_entry_id, document_type, document_name,
                            attachment_path, narrative_description, status, year_of_approval, created_by,
                            created_at, updated_at, language)
                        values (?, 'Bulletin', ?, ?, ?, 'published', extract(year from current_date)::int, ?, now(), now(), 'en')
                        """, repoKey, str(b.get("title")), str(b.get("pdf_path")), str(b.get("description")), userId);
            }
        } else {
            jdbc.update("delete from public.disaster_risk_frameworks where repository_entry_id = ?", repoKey);
        }

        return Map.of("success", true, "id", id, "is_published", published,
                "publications", toPublications, "map", toMap,
                "message", published
                        ? "Bulletin published" + (toPublications && toMap ? " to Publications and the map."
                                : toPublications ? " to Publications." : " to the map.")
                        : "Bulletin unpublished.");
    }

    /**
     * Disseminate a published bulletin to people in its affected areas — this is the wire from EOCC
     * Bulletin into the Communication Center. Sends an SMS short-message + (optionally) emails the
     * bulletin PDF to the resolved audience, and fires an in-app notice to the area coordinators. Every
     * SMS/email is logged to {@code sms_logs}/{@code email_logs} (notification_type='ew_dissemination'),
     * so the sends show up in the Communication Center exactly like any other dispatch.
     *
     * <p>Audiences (default = all): {@code area} (subscribers + stakeholders registered in the affected
     * districts/regions), {@code hazard} (subscribers who opted in for this hazard), {@code coordinators}
     * (RAS/Reg DC/DAS/Dist DC in the affected areas — reachable once users carry an area). Manual
     * recipients may be added. Gated by COMMS_DISSEMINATE — the same tier as the Communication Center.
     */
    @Override
    public Map<String, Object> disseminate(long id,
                                           Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, title, warning_code, severity, regions, pdf_path, "
                        + " envelope->'days'->0->'hazards'->0->>'type' as hazard_type "
                        + "from public.ew_generated_products where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Bulletin product not found.");
        }
        Map<String, Object> prod = rows.get(0);
        String title = str(prod.get("title"));
        String severity = strOr(prod.get("severity"), "ADVISORY");
        String warningCode = str(prod.get("warning_code"));
        String pdfPath = str(prod.get("pdf_path"));
        String hazard0 = str(prod.get("hazard_type"));

        List<String> channels = asStrList(b.get("channels"));
        boolean wantSms = channels.isEmpty() || channels.contains("sms");
        boolean wantEmail = channels.isEmpty() || channels.contains("email");

        List<String> aud = asStrList(b.get("audiences"));
        if (aud.isEmpty()) { aud = List.of("area", "hazard", "coordinators"); }

        // Affected administrative areas = the bulletin's districts ∪ their parent regions (so region-level
        // subscribers are reached too). Empty regions → no area audience (manual recipients still work).
        List<String> districts = parseRegions(prod.get("regions"));
        Set<String> areas = new LinkedHashSet<>(districts);
        areas.addAll(parentRegions(districts));

        Set<String> phones = new LinkedHashSet<>();
        Set<String> emails = new LinkedHashSet<>();
        if (aud.contains("area")) {
            AudienceService.Audience a = audiences.resolveAreas(areas);
            phones.addAll(a.phones()); emails.addAll(a.emails());
        }
        if (aud.contains("hazard")) {
            String hazard = strOr(b.get("hazard"), hazard0);
            if (hazard != null) {
                AudienceService.Audience a = audiences.resolve("subscribers_by_hazard", hazard, null);
                phones.addAll(a.phones()); emails.addAll(a.emails());
            }
        }
        List<Long> coordinatorIds = List.of();
        if (aud.contains("coordinators")) {
            AudienceService.Audience a = audiences.resolveAreaCoordinators(areas);
            phones.addAll(a.phones()); emails.addAll(a.emails());
            coordinatorIds = audiences.coordinatorUserIds(areas);
        }
        // Manual extras (list, or comma/newline/semicolon string) — emails routed by '@'.
        for (String r : asStrList(b.get("recipients"))) {
            if (r.contains("@")) { emails.add(r); } else { phones.add(r); }
        }

        Map<String, Object> result = new LinkedHashMap<>();

        if (wantSms && !phones.isEmpty()) {
            String smsMsg = strOr(b.get("sms_message"), defaultSms(severity, hazard0, districts, warningCode));
            if (smsMsg.length() > 450) { smsMsg = smsMsg.substring(0, 450); }
            MgovSmsService.SmsResult r = sms.sendBulk(new ArrayList<>(phones), smsMsg, "ew_dissemination", null);
            result.put("sms", Map.of("attempted", phones.size(), "valid", r.formatted().size(),
                    "invalid", r.invalid().size(), "success", r.success(),
                    "messageId", r.messageId() == null ? "" : r.messageId()));
        } else {
            result.put("sms", Map.of("attempted", 0, "skipped", true));
        }

        if (wantEmail && !emails.isEmpty()) {
            String subject = strOr(b.get("email_subject"), title == null ? "Early Warning Bulletin" : title);
            String message = strOr(b.get("email_message"), defaultEmail(severity, hazard0, districts, warningCode));
            List<MailService.Attachment> atts = new ArrayList<>();
            boolean attach = !Boolean.FALSE.equals(b.get("attach_pdf"));
            if (attach && pdfPath != null) {
                try {
                    byte[] pdf = Files.readAllBytes(Path.of(publicRoot, pdfPath));
                    atts.add(new MailService.Attachment(safeFile(title) + ".pdf", "application/pdf", pdf));
                } catch (Exception e) { /* file missing → send the email without the attachment */ }
            }
            MailService.MailResult r = mail.sendComposed(new ArrayList<>(emails), subject, message, atts, users.actingUserId());
            result.put("email", Map.of("attempted", emails.size(), "sent", r.sent(), "failed", r.failed(), "success", r.success()));
        } else {
            result.put("email", Map.of("attempted", 0, "skipped", true));
        }

        int inApp = 0;
        if (!coordinatorIds.isEmpty()) {
            String link = pdfPath == null ? null : "/api/storage/" + pdfPath;
            inApp = notifications.notifyUsers(coordinatorIds, NotificationService.Notice.inApp(
                    "ew_bulletin_disseminated",
                    "Early Warning disseminated" + (warningCode == null ? "" : " (" + warningCode + ")"),
                    (title == null ? "An early-warning bulletin" : title) + " was disseminated to your area.",
                    link, "ew_product", id, severity));
        }
        result.put("inApp", Map.of("coordinators", inApp));

        result.put("success", true);
        result.put("areas", new ArrayList<>(areas));
        result.put("recipients", Map.of("sms", phones.size(), "email", emails.size()));
        result.put("message", "Dissemination sent — track delivery in the Communication Center.");
        return result;
    }

    /** List products for the map + registry (newest first). */
    @Override
    public Map<String, Object> index(String severity,
                                     String type) {
        StringBuilder where = new StringBuilder("1=1");
        java.util.List<Object> args = new java.util.ArrayList<>();
        if (severity != null && !severity.isBlank()) { where.append(" and p.severity = ?"); args.add(severity); }
        if (type != null && !type.isBlank()) { where.append(" and p.bulletin_type = ?"); args.add(type); }
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> rows = jdbc.queryForList(("""
                select p.id, p.title, p.bulletin_type, p.warning_code, w.status as warning_status,
                       p.issue_date, p.issue_time, p.severity, p.regions,
                       p.centroid_lat, p.centroid_lng, p.pdf_path, p.generated_at, p.description,
                       p.is_published, p.published_at, p.show_on_map,
                       exists(select 1 from public.disaster_risk_frameworks drf
                              where drf.repository_entry_id = 'EOCC-BULLETIN-' || p.id) as on_publications,
                       p.envelope->'days'->0->'hazards'->0->>'type' as hazard_type
                from public.ew_generated_products p
                left join public.warnings w on lower(w.warning_code) = lower(p.warning_code)
                                           and w.deleted_at is null
                where %s order by p.generated_at desc limit 300
                """).formatted(where), args.toArray());
        rows.forEach(r -> { parseJson(r, "regions"); r.put("pdf_url", "/api/storage/" + r.get("pdf_path")); });
        out.put("products", rows);
        // Stats use the same WHERE as the list (productive when severity/type filters apply).
        out.put("stats", jdbc.queryForMap(("""
                select count(*) as total,
                       count(*) filter (where p.severity='MAJOR_WARNING') as major,
                       count(*) filter (where p.severity='WARNING') as warning,
                       count(*) filter (where p.severity='ADVISORY') as advisory,
                       count(*) filter (where p.issue_date = current_date) as today
                from public.ew_generated_products p
                where %s
                """).formatted(where), args.toArray()));
        return out;
    }

    /** One product with its full envelope (areas+levels+delineations) — for the map detail / build-on. */
    @Override
    public Map<String, Object> show(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from public.ew_generated_products where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Bulletin product not found.");
        }
        Map<String, Object> r = rows.get(0);
        parseJson(r, "regions");
        parseJson(r, "envelope");
        r.put("pdf_url", "/api/storage/" + r.get("pdf_path"));
        return Map.of("product", r);
    }

    // ── helpers ──
    private static void parseJson(Map<String, Object> row, String key) {
        Object v = row.get(key);
        if (v == null) { return; }
        try {
            String json = v.getClass().getSimpleName().equals("PGobject")
                    ? String.valueOf(v.getClass().getMethod("getValue").invoke(v)) : String.valueOf(v);
            row.put(key, json == null ? null : JSON.readValue(json, Object.class));
        } catch (Exception e) { /* leave as-is */ }
    }
    private static boolean isPdf(byte[] b) {
        return b.length >= 5 && b[0] == 0x25 && b[1] == 0x50 && b[2] == 0x44 && b[3] == 0x46 && b[4] == 0x2D;
    }

    private static String jsonOrNull(Object v) throws Exception { return v == null ? null : JSON.writeValueAsString(v); }
    private static String str(Object v) {
        if (v == null) { return null; }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
    private static String strOr(Object v, String d) { String s = str(v); return s == null ? d : s; }
    private static Double dbl(Object v) {
        String s = str(v);
        try { return s == null ? null : Double.parseDouble(s); } catch (Exception e) { return null; }
    }

    // ── dissemination helpers ──
    /** A JSON list, or a comma/newline/semicolon-separated string, → a clean list of trimmed values. */
    private static List<String> asStrList(Object v) {
        List<String> out = new ArrayList<>();
        if (v instanceof Collection<?> c) {
            for (Object o : c) { String s = str(o); if (s != null) { out.add(s); } }
        } else {
            String s = str(v);
            if (s != null) { for (String p : s.split("[,;\\n]")) { String t = p.trim(); if (!t.isEmpty()) { out.add(t); } } }
        }
        return out;
    }

    /** The bulletin's {@code regions} JSON (array of district names) → a list. */
    private List<String> parseRegions(Object v) {
        if (v == null) { return List.of(); }
        try {
            String s = v.getClass().getSimpleName().equals("PGobject")
                    ? String.valueOf(v.getClass().getMethod("getValue").invoke(v)) : String.valueOf(v);
            if (s == null || s.isBlank()) { return List.of(); }
            Object parsed = JSON.readValue(s, Object.class);
            List<String> out = new ArrayList<>();
            if (parsed instanceof List<?> l) {
                for (Object o : l) { if (o != null) { String t = String.valueOf(o).trim(); if (!t.isEmpty()) { out.add(t); } } }
            }
            return out;
        } catch (Exception e) { return List.of(); }
    }

    /** Region name (lowercased) → [lat, lng], loaded once from the same resource the warning publish uses. */
    private static final Map<String, double[]> REGION_CENTROIDS = loadRegionCentroids();

    @SuppressWarnings("unchecked")
    private static Map<String, double[]> loadRegionCentroids() {
        Map<String, double[]> out = new java.util.HashMap<>();
        try (var in = EwProductsServiceImpl.class.getResourceAsStream("/ew/region_centroids.json")) {
            if (in == null) { return out; }
            Map<String, Map<String, Object>> raw = JSON.readValue(in, Map.class);
            for (Map.Entry<String, Map<String, Object>> e : raw.entrySet()) {
                Object lat = e.getValue().get("lat");
                Object lng = e.getValue().get("lng");
                if (lat instanceof Number && lng instanceof Number) {
                    out.put(e.getKey().toLowerCase(Locale.ROOT),
                            new double[]{((Number) lat).doubleValue(), ((Number) lng).doubleValue()});
                }
            }
        } catch (Exception ignored) { /* no centroids → no fallback (centroid simply stays null) */ }
        return out;
    }

    /** Average parent-region centroid of the affected districts — a guaranteed coordinate so a bulletin is
     *  never permanently hidden from the public map. Null only when nothing resolves. */
    private double[] fallbackCentroid(List<String> districts) {
        if (districts == null || districts.isEmpty() || REGION_CENTROIDS.isEmpty()) { return null; }
        double lat = 0;
        double lng = 0;
        int n = 0;
        for (String rg : parentRegions(districts)) {
            double[] c = REGION_CENTROIDS.get(rg.toLowerCase(Locale.ROOT));
            if (c != null) { lat += c[0]; lng += c[1]; n++; }
        }
        return n == 0 ? null : new double[]{lat / n, lng / n};
    }

    /** Parent region names for the given districts, so region-level subscribers are reached. Never throws. */
    private List<String> parentRegions(List<String> districts) {
        if (districts == null || districts.isEmpty()) { return List.of(); }
        String in = districts.stream().map(x -> "?").collect(Collectors.joining(","));
        Object[] args = districts.stream().map(s -> s.toLowerCase(Locale.ROOT)).toArray();
        try {
            return jdbc.queryForList(
                    "select distinct rg.name from public.districts d join public.regions rg on rg.id = d.region_id "
                            + "where lower(d.name) in (" + in + ")", String.class, args);
        } catch (Exception e) { return List.of(); }
    }

    private static String defaultSms(String severity, String hazard, List<String> districts, String code) {
        String area = districts.isEmpty() ? "maeneo husika"
                : String.join(", ", districts.subList(0, Math.min(4, districts.size())));
        String sev = severity == null ? "" : severity.replace('_', ' ');
        return "ONYO LA MAAFA" + (code == null ? "" : " #" + code) + ": " + sev
                + (hazard == null ? "" : " — " + hazard) + ". Maeneo: " + area + ". Chukua tahadhari. (e-MAAFA)";
    }

    private static String defaultEmail(String severity, String hazard, List<String> districts, String code) {
        String area = districts.isEmpty() ? "the affected areas" : String.join(", ", districts);
        return "An early-warning bulletin has been issued" + (code == null ? "" : " (" + code + ")") + ".\n\n"
                + "Severity: " + (severity == null ? "" : severity.replace('_', ' ')) + "\n"
                + (hazard == null ? "" : "Hazard: " + hazard + "\n")
                + "Areas: " + area + "\n\nPlease see the attached bulletin and take appropriate precautions.";
    }

    private static String safeFile(String title) {
        String base = title == null || title.isBlank() ? "bulletin" : title;
        return base.replaceAll("[^A-Za-z0-9._-]+", "_");
    }
}
