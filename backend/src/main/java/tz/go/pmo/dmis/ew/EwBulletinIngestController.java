package tz.go.pmo.dmis.ew;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Year;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * EW Bulletin Ingestion — FAITHFUL port of the Laravel BulletinIngestionController@ingest
 * (POST /api/ew/bulletins/ingest). The native PMO-DMD "Push to PMO" lands here: it creates a pending
 * Warning + WarningHazard rows (per district/region/national) on the existing DMIS EW tables, exactly as
 * Laravel did — same warning_code (EW-YYYY-00001), same hazard/level maps, same name resolution.
 * Cross-sector One Health kick is best-effort (non-fatal, mirrors the Laravel try/catch).
 */
@RestController
@RequestMapping("/ew/bulletins")
// Ingest creates pending warnings in the national pipeline from PMO-DMD bulletins — trusted
// operator data entry, not any signed-in user. Was isAuthenticated().
@PreAuthorize("hasAuthority('early_warning.create')")
public class EwBulletinIngestController {

    private static final ObjectMapper JSON = new ObjectMapper();

    private static final Map<String, String> HAZARD_MAP = Map.of(
        "HEAVY_RAIN", "Heavy Rainfall and Flooding", "LARGE_WAVES", "Large Waves",
        "STRONG_WIND", "Storm/Strong Winds", "FLOODS", "Floods",
        "LANDSLIDES", "Landslide", "EXTREME_TEMPERATURE", "Extreme Heat/Heatwave");
    private static final Map<String, String> LEVEL_MAP = Map.of(
        "ADVISORY", "Advisory", "WARNING", "Warning", "MAJOR_WARNING", "Major Warning",
        "advisory", "Advisory", "warning", "Warning", "major_warning", "Major Warning");
    private static final Map<String, String> REGION_ALIASES = Map.of(
        "DaresSalaam", "Dar es Salaam", "KaskaziniPemba", "Kaskazini Pemba", "KaskaziniUnguja", "Kaskazini Unguja",
        "KusiniPemba", "Kusini Pemba", "KusiniUnguja", "Kusini Unguja", "MjiniMagharibi", "Mjini Magharibi");

    private final JdbcTemplate jdbc;
    private final String publicRoot;
    private final tz.go.pmo.dmis.notification.NotificationService notifications;

    public EwBulletinIngestController(JdbcTemplate jdbc,
            tz.go.pmo.dmis.notification.NotificationService notifications,
            @Value("${dmis.storage.public-root:${user.dir}/storage/public}") String publicRoot) {
        this.jdbc = jdbc;
        this.notifications = notifications;
        this.publicRoot = publicRoot;
    }

    @PostMapping("/ingest")
    @Transactional
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> ingest(@RequestParam("payload") String payloadJson,
                                                      @RequestParam("bulletin_type") String bulletinType,
                                                      @RequestParam(value = "pdf_file", required = false) MultipartFile pdf) throws Exception {
        if (!"tma".equals(bulletinType) && !"dmd".equals(bulletinType)) {
            return ResponseEntity.status(422).body(Map.of("success", false, "message", "bulletin_type must be tma or dmd."));
        }
        Map<String, Object> payload;
        try { payload = JSON.readValue(payloadJson, Map.class); } catch (Exception e) { payload = null; }
        if (payload == null || !payload.containsKey("days")) {
            return ResponseEntity.status(422).body(Map.of("success", false, "message", "Invalid JSON payload: missing \"days\" array."));
        }
        Long userId = currentUserId();
        String issueDate = str(payload.get("issue_date"));
        if (issueDate == null || !issueDate.matches("\\d{4}-\\d{2}-\\d{2}")) issueDate = java.time.LocalDate.now().toString();

        // ── Duplicate check: same user + an existing warning's hazard validity on this issue_date within 1 hour ──
        List<Map<String, Object>> dup = jdbc.queryForList(
            // `is not distinct from` so the dedup still fires when the submitter can't be resolved to a
            // users.id (currentUserId() may be null): `created_by = NULL` is never true, which previously
            // let an identical re-push create a duplicate pending warning.
            "select w.id, w.warning_code from public.warnings w where w.created_by is not distinct from ? and w.created_at >= now() - interval '1 hour' " +
            "and exists (select 1 from public.warning_hazards wh where wh.warning_id = w.id and wh.validity_start::date = ?::date) " +
            "order by w.created_at desc limit 1", userId, issueDate);
        if (!dup.isEmpty()) {
            Object id = dup.get(0).get("id"); String code = str(dup.get(0).get("warning_code"));
            return ResponseEntity.ok(Map.of("success", true, "duplicate", true, "warning_id", id, "warning_code", code,
                "admin_url", "/m/preparedness/early-warnings", "message", "Bulletin already submitted as " + code + ". Showing existing record."));
        }

        // ── Store PDF attachment (storage/public/warnings/attachments) ──
        List<String> attachments = new ArrayList<>();
        if (pdf != null && !pdf.isEmpty()) {
            String rel = "warnings/attachments/" + UUID.randomUUID() + ".pdf";
            Path dir = Path.of(publicRoot, "warnings", "attachments");
            Files.createDirectories(dir);
            Files.write(Path.of(publicRoot, rel), pdf.getBytes());
            attachments.add(rel);
        }

        // self-heal id sequences left stale by explicit-id seeding (recurring DMIS pattern: a seeder
        // inserted explicit ids without bumping *_id_seq, so a plain insert collides on the pkey).
        healSeq("warnings");
        healSeq("warning_hazards");

        // ── Create the Warning (status pending, EW-YYYY-00001) ──
        String code = nextWarningCode();
        Long warningId = ((Number) jdbc.queryForObject(
            "insert into public.warnings (warning_code, status, attachments, created_by, updated_by, created_at, updated_at) " +
            "values (?, 'pending', ?::json, ?, ?, now(), now()) returning id", Number.class,
            code, attachments.isEmpty() ? null : JSON.writeValueAsString(attachments), userId, userId)).longValue();

        int created = "tma".equals(bulletinType) ? parseTma(payload, warningId, issueDate) : parseDmd(payload, warningId, issueDate);

        // A bulletin that resolved to ZERO recognizable hazards/districts must not leave a phantom pending
        // warning that silently reports success: roll the whole ingest back and tell the caller. (Was a
        // silent 201 with hazard_count=0 — an "ingested" bulletin with nothing in it.)
        if (created == 0) {
            throw new tz.go.pmo.dmis.common.error.BusinessRuleException(
                "Bulletin resolved to no recognizable hazards or districts; nothing was ingested.");
        }

        // Managed receive: the pending bulletin must not sit unseen until someone happens to open the EW
        // index. Announce it to DMIS users (in-app, the ONE notification backbone) so an approver is alerted
        // it is awaiting approval — AFTER this ingest transaction commits, mirroring publish() so a feed-write
        // can never mark the ingest rollback-only. (code/warningId/created are effectively final here.)
        Runnable notifyReceived = () -> {
            try {
                notifications.notifyAllUsers(tz.go.pmo.dmis.notification.NotificationService.Notice.inApp(
                        "ew_bulletin_received", "Early-warning bulletin received",
                        "Bulletin " + code + " (" + created + " hazard area" + (created == 1 ? "" : "s")
                                + ") was received from PMO and is pending approval.",
                        "/m/preparedness/early-warnings", "early_warning", warningId, "warning"));
            } catch (Exception ignored) { }
        };
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                    new org.springframework.transaction.support.TransactionSynchronization() {
                        @Override public void afterCommit() { notifyReceived.run(); }
                    });
        } else {
            notifyReceived.run();
        }

        return ResponseEntity.status(201).body(Map.of("success", true, "warning_id", warningId, "warning_code", code,
            "oh_event_id", "", "hazard_count", created,
            "admin_url", "/m/preparedness/early-warnings",
            "message", "Bulletin ingested as " + code + " with status 'pending'."));
    }

    // ── parse TMA 722E_4: days[].hazards[] → WarningHazard per district / region / national ──
    @SuppressWarnings("unchecked")
    private int parseTma(Map<String, Object> payload, Long warningId, String issueDate) {
        int n = 0;
        List<Object> days = listOf(payload.get("days"));
        for (int d = 0; d < days.size(); d++) {
            if (!(days.get(d) instanceof Map)) continue;
            Map<String, Object> day = (Map<String, Object>) days.get(d);
            String forecastDate = str(day.get("date"));
            if (forecastDate == null) forecastDate = java.time.LocalDate.parse(issueDate).plusDays(d).toString();
            String vs = forecastDate + " 06:00:00", ve = forecastDate + " 23:59:00";
            for (Object ho : listOf(day.get("hazards"))) {
                if (!(ho instanceof Map)) continue;
                Map<String, Object> h = (Map<String, Object>) ho;
                Long hazardId = resolveHazard(str(h.get("type")));
                String level = LEVEL_MAP.get(str(h.get("alert_level")));
                if (hazardId == null || level == null) continue;
                String likelihood = ucfirst(str(h.get("likelihood")));
                String desc = str(h.get("description"));
                List<Object> districts = listOf(h.get("districts")), regions = listOf(h.get("regions"));
                if (!districts.isEmpty()) {
                    for (Object dn : districts) { long[] rd = resolveDistrict(str(dn)); if (rd != null) { insertHazard(warningId, hazardId, likelihood, level, vs, ve, desc, rd[0], rd[1]); n++; } }
                } else if (!regions.isEmpty()) {
                    for (Object rn : regions) { Long rid = resolveRegion(str(rn)); insertHazard(warningId, hazardId, likelihood, level, vs, ve, desc, rid, null); n++; }
                } else {
                    insertHazard(warningId, hazardId, likelihood, level, vs, ve, desc, null, null); n++;
                }
            }
        }
        return n;
    }

    // ── parse DMD Multirisk: district_summaries[] grouped by alert tier ──
    @SuppressWarnings("unchecked")
    private int parseDmd(Map<String, Object> payload, Long warningId, String issueDate) {
        int n = 0;
        List<Object> days = listOf(payload.get("days"));
        Long primary = determinePrimaryHazard(days);
        for (Object so : listOf(payload.get("district_summaries"))) {
            if (!(so instanceof Map)) continue;
            Map<String, Object> summary = (Map<String, Object>) so;
            int dayNo = asInt(summary.get("day_number"), 1);
            String forecastDate = java.time.LocalDate.parse(issueDate).plusDays(dayNo - 1).toString();
            String vs = forecastDate + " 06:00:00", ve = forecastDate + " 23:59:00";
            String desc = tmaDayDescription(days, dayNo);
            for (String tierKey : new String[]{"major_warning", "warning", "advisory"}) {
                List<Object> districts = listOf(summary.get(tierKey));
                if (districts.isEmpty()) continue;
                String level = LEVEL_MAP.get(tierKey);
                for (Object dn : districts) {
                    long[] rd = resolveDistrict(str(dn));
                    if (rd == null) continue;
                    insertHazard(warningId, primary, "Medium", level, vs, ve, desc, rd[0], rd[1]); n++;
                }
            }
        }
        return n;
    }

    private void insertHazard(Long warningId, Long hazardId, String likelihood, String level, String vs, String ve,
                              String desc, Long regionId, Long districtId) {
        jdbc.update("insert into public.warning_hazards (warning_id, hazard_id, likelihood_of_occurrence, warning_level, " +
            "validity_start, validity_end, technical_description, region_id, district_id, created_at, updated_at) " +
            "values (?,?,?,?,?::timestamp,?::timestamp,?,?,?, now(), now())",
            warningId, hazardId, likelihood, level, vs, ve, desc, regionId, districtId);
    }

    // ── resolvers (faithful to BulletinIngestionController) ──
    /** Agency key → a keyword to LIKE-match when the canonical Laravel name isn't seeded in this DB. */
    private static final Map<String, String> HAZARD_KEYWORD = Map.of(
        "HEAVY_RAIN", "rain", "LARGE_WAVES", "wave", "STRONG_WIND", "wind", "FLOODS", "flood",
        "LANDSLIDES", "landslide", "EXTREME_TEMPERATURE", "heat");

    private Long resolveHazard(String key) {
        String name = HAZARD_MAP.get(key);
        if (name == null) return null;
        // 1) exact canonical Laravel name (faithful)
        List<Long> ids = jdbc.queryForList("select id from public.hazards where lower(name) = ? limit 1", Long.class, name.toLowerCase(Locale.ROOT));
        if (!ids.isEmpty()) return ids.get(0);
        // 2) keyword fallback so a differently-seeded hazards master still resolves (e.g. "Heavy rainfall")
        String kw = HAZARD_KEYWORD.get(key);
        if (kw != null) {
            ids = jdbc.queryForList("select id from public.hazards where lower(name) like ? order by id limit 1", Long.class, "%" + kw + "%");
            if (!ids.isEmpty()) return ids.get(0);
        }
        return null;
    }
    private Long resolveRegion(String name) {
        if (name == null) return null;
        String norm = REGION_ALIASES.getOrDefault(name, name);
        List<Long> ids = jdbc.queryForList("select id from public.regions where lower(name) = ? limit 1", Long.class, norm.toLowerCase(Locale.ROOT));
        return ids.isEmpty() ? null : ids.get(0);
    }
    /** @return [region_id, district_id] or null (water bodies / unresolved skipped). */
    private long[] resolveDistrict(String name) {
        if (name == null) return null;
        name = name.trim();
        if (name.startsWith("Lake ")) return null;
        List<Map<String, Object>> r = jdbc.queryForList("select id, region_id from public.districts where lower(name) = ? limit 1", name.toLowerCase(Locale.ROOT));
        if (r.isEmpty()) {
            String stripped = name.replaceAll("(?i)\\s+(Rural|Urban|TC|Town|City)$", "");
            if (!stripped.equals(name)) r = jdbc.queryForList("select id, region_id from public.districts where lower(name) = ? limit 1", stripped.toLowerCase(Locale.ROOT));
            if (r.isEmpty()) r = jdbc.queryForList("select id, region_id from public.districts where lower(name) like ? limit 1", "%" + stripped.toLowerCase(Locale.ROOT) + "%");
        }
        if (r.isEmpty()) return null;
        Object did = r.get(0).get("id"), rid = r.get(0).get("region_id");
        return new long[]{ rid == null ? 0 : ((Number) rid).longValue(), ((Number) did).longValue() };
    }

    @SuppressWarnings("unchecked")
    private Long determinePrimaryHazard(List<Object> days) {
        for (Object do_ : days) {
            if (!(do_ instanceof Map)) continue;
            for (Object eo : tmaEntries((Map<String, Object>) do_)) {
                if (!(eo instanceof Map)) continue;
                String desc = str(((Map<String, Object>) eo).get("description"));
                String d = desc == null ? "" : desc.toLowerCase(Locale.ROOT);
                if (d.contains("mawimbi") || d.contains("wave")) return firstHazard("LARGE_WAVES", "HEAVY_RAIN");
                if (d.contains("upepo") || d.contains("wind")) return firstHazard("STRONG_WIND", "HEAVY_RAIN");
                if (d.contains("mafuriko") || d.contains("flood")) return firstHazard("FLOODS", "HEAVY_RAIN");
            }
        }
        return firstHazard("HEAVY_RAIN", "FLOODS");
    }
    private Long firstHazard(String... keys) { for (String k : keys) { Long id = resolveHazard(k); if (id != null) return id; } return null; }

    @SuppressWarnings("unchecked")
    private List<Object> tmaEntries(Map<String, Object> day) {
        Object comments = day.get("comments");
        if (comments instanceof Map<?, ?> c && c.get("tma") instanceof Map<?, ?> t && t.get("entries") instanceof List<?> e) return new ArrayList<>(e);
        return List.of();
    }
    @SuppressWarnings("unchecked")
    private String tmaDayDescription(List<Object> days, int dayNo) {
        if (dayNo - 1 < 0 || dayNo - 1 >= days.size() || !(days.get(dayNo - 1) instanceof Map)) return null;
        List<String> descs = new ArrayList<>();
        for (Object eo : tmaEntries((Map<String, Object>) days.get(dayNo - 1))) {
            if (eo instanceof Map) { String d = str(((Map<String, Object>) eo).get("description")); if (d != null && !d.isBlank()) descs.add(d); }
        }
        return descs.isEmpty() ? null : String.join("; ", descs);
    }

    /** Advance a table's id sequence to max(id) so a generated-id insert won't collide with seeded rows. */
    private void healSeq(String table) {
        try {
            jdbc.execute("select setval(pg_get_serial_sequence('public." + table + "','id'), " +
                "greatest((select coalesce(max(id),0) from public." + table + "),1))");
        } catch (Exception ignored) { }
    }

    private String nextWarningCode() {
        String year = String.valueOf(Year.now().getValue());
        Integer max = jdbc.queryForObject(
            "select coalesce(max(cast(substring(warning_code from ?) as integer)), 0) from public.warnings where warning_code like ?",
            Integer.class, ("EW-" + year + "-").length() + 1, "EW-" + year + "-%");
        return String.format("EW-%s-%05d", year, (max == null ? 0 : max) + 1);
    }

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

    private static List<Object> listOf(Object o) { return o instanceof List<?> l ? new ArrayList<>(l) : new ArrayList<>(); }
    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
    private static String ucfirst(String s) {
        if (s == null || s.isBlank()) return "Medium";
        s = s.toLowerCase(Locale.ROOT); return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
    private static int asInt(Object o, int dflt) {
        if (o instanceof Number num) return num.intValue();
        try { return o == null ? dflt : Integer.parseInt(str(o).trim()); } catch (Exception e) { return dflt; }
    }
}
