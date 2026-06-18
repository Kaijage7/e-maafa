package tz.go.pmo.dmis.ew;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Cross-agency Early Warning integration bus — native re-platform of the Python file-bus
 * ({@code ew/output/bridge/latest_<agency>.json}). The Python authoring pages are UNTOUCHED; this is the
 * DMIS-native data integration the user asked for, starting with Early Warning:
 *
 * <ul>
 *   <li><b>Submit</b> — every warning entity posts its bulletin/assessment ({@code POST /agency/{a}/submission}).</li>
 *   <li><b>Interlink</b> — every entity can read each other's latest ({@code GET /agency/{a}/latest},
 *       {@code GET /agency/latest}); e.g. MoW reads TMA rainfall to inform flood forecasting.</li>
 *   <li><b>Overlay</b> — PMO-DMD reads ALL and consolidates into one realistic bulletin
 *       ({@code GET /dmd/consolidated}) with the Python's highest-alert-wins-per-area merge.</li>
 * </ul>
 */
@RestController
@RequestMapping("/v1/ew")
// Cross-agency reads (latest, consolidated, history) stay authenticated; the two WRITES are role-gated
// per method: submit = field/operator tier, withdraw = oversight (retracting a public alert).
@PreAuthorize("isAuthenticated()")
public class EwAgencySubmissionController {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> AGENCIES = Set.of("tma", "mow", "gst", "moh", "moa", "nemc", "mlf");
    /** Only TMA + MoW feed the hydromet alert-tier choropleth (faithful to the Python DMD); the rest are
     * a distinct hazard-overlay layer so PMO sees everything overlaid without conflating an earthquake or
     * disease outbreak with the rain/flood tier scale. */
    private static final Set<String> HYDROMET = Set.of("tma", "mow");
    private static final List<String> TIER_ORDER = List.of("MAJOR_WARNING", "WARNING", "ADVISORY");

    private static int rank(String level) {
        if (level == null) return 0;
        return switch (level.toUpperCase(Locale.ROOT)) {
            case "MAJOR_WARNING" -> 3;
            case "WARNING" -> 2;
            case "ADVISORY" -> 1;
            default -> 0;
        };
    }

    private final JdbcTemplate jdbc;
    /** region -> districts, keyed by a NORMALISED region name so case/spacing variants from different
     * geojson sources (e.g. "Dar es salaam" vs "Dar es Salaam") still expand. */
    private final Map<String, List<String>> regionDistricts;
    /** Resolves the authenticated caller's agency CODE (tma/mow/…) so an entity authors only its OWN
     *  bulletin; null for PMO/EOCC/national/admin logins, who may act for any agency. */
    private final JurisdictionScope jurisdiction;

    public EwAgencySubmissionController(JdbcTemplate jdbc, JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
        this.regionDistricts = loadRegionDistricts();
    }

    /**
     * Enforce that the caller may AUTHOR for this agency: an agency-bound login
     * ({@code currentAgencyCode()} non-null) may act only for its own code; a non-agency login
     * (null = PMO/EOCC/national/admin) may act for any — the PMO-tier override. Applies to WRITES only;
     * cross-agency READS stay open (entities interlink, e.g. MoW reads TMA). Uses the auth agent's
     * {@link JurisdictionScope#currentAgencyCode()} (the real JWT subject, not the dev role header).
     */
    private void assertAgencyWrite(String agency) {
        String mine = jurisdiction.currentAgencyCode();
        if (mine != null && !mine.equalsIgnoreCase(agency)) {
            throw new AccessDeniedException("Your agency may not author bulletins on behalf of another entity.");
        }
    }

    /** lowercase, trim, collapse internal whitespace — tolerant region-name key. */
    private static String norm(String s) {
        return s == null ? "" : s.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    private static Map<String, List<String>> loadRegionDistricts() {
        try (var in = EwAgencySubmissionController.class.getResourceAsStream("/ew/region_districts.json")) {
            if (in == null) return Map.of();
            Map<String, List<String>> raw = JSON.readValue(in,
                new com.fasterxml.jackson.core.type.TypeReference<Map<String, List<String>>>() {});
            Map<String, List<String>> byNorm = new LinkedHashMap<>();
            raw.forEach((region, districts) -> byNorm.put(norm(region), districts));
            return byNorm;
        } catch (Exception e) {
            return Map.of();
        }
    }

    /** Expand an item to DISTRICT granularity: explicit districts ∪ (each region → all its districts).
     * Mirrors the Python tma_to_dmd_prefill region→district expansion so the DMD overlay is district-precise.
     * Region match is normalised (case/spacing-tolerant); an unmapped region is kept by name so nothing is dropped. */
    private List<String> expandToDistricts(Item it) {
        LinkedHashSet<String> out = new LinkedHashSet<>(it.districts());
        for (String r : it.regions()) {
            List<String> ds = regionDistricts.get(norm(r));
            if (ds != null && !ds.isEmpty()) out.addAll(ds);
            else if (r != null && !r.isBlank()) out.add(r);
        }
        return new ArrayList<>(out);
    }

    /** A normalised unit of work, flattened across the per-agency payload shapes (days/events/outbreaks). */
    private record Item(int day, String type, String alertLevel,
                        List<String> regions, List<String> districts, String description) {}

    /** Flatten any agency payload into a common list of items (the per-agency JSON shapes differ). */
    @SuppressWarnings("unchecked")
    private List<Item> flatten(Map<String, Object> payload) {
        List<Item> out = new ArrayList<>();
        if (payload == null) return out;
        Object daysObj = payload.get("days");
        if (daysObj instanceof List<?> days) {                 // TMA (hazards) / MoW (assessments)
            int idx = 0;
            for (Object dObj : days) {
                idx++;
                if (!(dObj instanceof Map)) continue;
                Map<String, Object> d = (Map<String, Object>) dObj;
                int dayNo = asInt(d.get("day_number"), idx);
                List<?> items = listOf(d.get("hazards"));
                if (items.isEmpty()) items = listOf(d.get("assessments"));
                for (Object it : items) addItem(out, dayNo, it);
            }
        } else {                                               // flat: events / outbreaks / assessments
            List<?> items = listOf(payload.get("events"));
            if (items.isEmpty()) items = listOf(payload.get("outbreaks"));
            if (items.isEmpty()) items = listOf(payload.get("assessments"));
            for (Object it : items) addItem(out, 0, it);
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private void addItem(List<Item> out, int day, Object itObj) {
        if (!(itObj instanceof Map)) return;
        Map<String, Object> it = (Map<String, Object>) itObj;
        // MoW assessments carry no type/disease/source — they're flood assessments keyed by basins.
        String type = firstNonBlank(str(it.get("type")), str(it.get("disease")), str(it.get("source")));
        if ((type == null || type.isBlank()) && !strList(it.get("basins")).isEmpty()) type = "FLOODS";
        // NORMALISE alert_level to a canonical tier so a typo/non-standard value ("RED", "Watch") can never
        // NPE the tier bucket in consolidated(); unknown non-null levels coerce to ADVISORY.
        String lvl = str(it.get("alert_level"));
        if (lvl != null) { lvl = lvl.trim().toUpperCase(Locale.ROOT); if (rank(lvl) == 0) lvl = "ADVISORY"; }
        out.add(new Item(day, type, lvl,
                strList(it.get("regions")), strList(it.get("districts")), str(it.get("description"))));
    }

    // ── Submit ──────────────────────────────────────────────────────────────────────────────────
    @PostMapping("/agency/{agency}/submission")
    @Transactional
    @PreAuthorize(Authz.EW_REPORT)
    @SuppressWarnings("unchecked")
    public Map<String, Object> submit(@PathVariable String agency,
                                      @RequestBody Map<String, Object> payload) throws Exception {
        String a = agency == null ? "" : agency.toLowerCase(Locale.ROOT);
        if (!AGENCIES.contains(a)) {
            throw new BusinessRuleException("Unknown warning entity: " + agency);
        }
        assertAgencyWrite(a);
        List<Item> items = flatten(payload);
        // VALIDATE before we touch storage: an empty/malformed payload must NOT supersede the agency's
        // last-good bulletin. Throwing here (before the supersede update) preserves the prior latest.
        if (items.isEmpty()) {
            throw new BusinessRuleException("Submission contains no usable hazards/events — nothing to store.");
        }
        if (items.stream().noneMatch(it -> !it.regions().isEmpty() || !it.districts().isEmpty())) {
            throw new BusinessRuleException("Submission has no affected regions or districts.");
        }

        // denormalise for overlays + consolidation
        Set<String> regions = new LinkedHashSet<>(), districts = new LinkedHashSet<>(), types = new LinkedHashSet<>();
        Map<String, Integer> counts = new LinkedHashMap<>();
        String topAlert = null;
        for (Item it : items) {
            regions.addAll(it.regions());
            districts.addAll(it.districts());
            if (it.type() != null && !it.type().isBlank()) types.add(it.type());
            String lvl = it.alertLevel() == null ? "ADVISORY" : it.alertLevel().toUpperCase(Locale.ROOT);
            counts.merge(lvl.toLowerCase(Locale.ROOT), 1, Integer::sum);
            if (rank(lvl) > rank(topAlert)) topAlert = lvl;
        }

        // supersede the previous latest, insert the new latest
        jdbc.update("update public.ew_agency_submissions set is_latest = false where agency = ? and is_latest = true", a);
        Long userId = currentUserId();
        Number id = jdbc.queryForObject(
            "insert into public.ew_agency_submissions " +
            "(agency, issue_date, issue_time, report_period, payload, regions, districts, hazard_types, " +
            " alert_summary, top_alert, item_count, submitted_by, is_latest) " +
            "values (?, ?::date, ?, ?, ?::json, ?::json, ?::json, ?::json, ?::json, ?, ?, ?, true) returning id",
            Number.class,
            a, safeDate(payload.get("issue_date")), str(payload.get("issue_time")), str(payload.get("report_period")),
            JSON.writeValueAsString(payload), JSON.writeValueAsString(new ArrayList<>(regions)),
            JSON.writeValueAsString(new ArrayList<>(districts)), JSON.writeValueAsString(new ArrayList<>(types)),
            JSON.writeValueAsString(counts), topAlert, items.size(), userId);

        return Map.of("ok", true, "id", id.longValue(), "agency", a,
            "items", items.size(), "top_alert", topAlert == null ? "" : topAlert,
            "regions", new ArrayList<>(regions), "districts", new ArrayList<>(districts));
    }

    // ── Monitoring stream ④: an entity posts an UPDATE on a hazard it already issued ─────────────────
    /** Update under the index of an already-issued warning (warning_code). Supersedes the agency's latest so
     *  consolidation sees the newest layer, and stamps is_update + warning_code + revision so Monitoring
     *  receives it and PMO can re-consolidate / revise the same warning_code. */
    @PostMapping("/agency/{agency}/update")
    @Transactional
    @PreAuthorize(Authz.EW_REPORT)
    @SuppressWarnings("unchecked")
    public Map<String, Object> update(@PathVariable String agency,
                                      @RequestParam("warningCode") String warningCode,
                                      @RequestBody Map<String, Object> payload) throws Exception {
        String a = agency == null ? "" : agency.toLowerCase(Locale.ROOT);
        if (!AGENCIES.contains(a)) throw new BusinessRuleException("Unknown warning entity: " + agency);
        assertAgencyWrite(a);
        if (warningCode == null || warningCode.isBlank()) throw new BusinessRuleException("warningCode is required for an update.");
        List<Item> items = flatten(payload);
        if (items.isEmpty()) throw new BusinessRuleException("Update contains no usable hazards/events — nothing to store.");

        Set<String> regions = new LinkedHashSet<>(), districts = new LinkedHashSet<>(), types = new LinkedHashSet<>();
        Map<String, Integer> counts = new LinkedHashMap<>();
        String topAlert = null;
        for (Item it : items) {
            regions.addAll(it.regions()); districts.addAll(it.districts());
            if (it.type() != null && !it.type().isBlank()) types.add(it.type());
            String lvl = it.alertLevel() == null ? "ADVISORY" : it.alertLevel().toUpperCase(Locale.ROOT);
            counts.merge(lvl.toLowerCase(Locale.ROOT), 1, Integer::sum);
            if (rank(lvl) > rank(topAlert)) topAlert = lvl;
        }

        List<Map<String, Object>> cur = jdbc.queryForList(
            "select id, revision from public.ew_agency_submissions where agency = ? and is_latest = true order by id desc limit 1", a);
        Long parentId = cur.isEmpty() ? null : ((Number) cur.get(0).get("id")).longValue();
        int revision = cur.isEmpty() ? 2 : (asInt(cur.get(0).get("revision"), 1) + 1);

        jdbc.update("update public.ew_agency_submissions set is_latest = false where agency = ? and is_latest = true", a);
        Long userId = currentUserId();
        Number id = jdbc.queryForObject(
            "insert into public.ew_agency_submissions " +
            "(agency, issue_date, issue_time, report_period, payload, regions, districts, hazard_types, " +
            " alert_summary, top_alert, item_count, submitted_by, is_latest, warning_code, parent_submission_id, revision, is_update) " +
            "values (?, ?::date, ?, ?, ?::json, ?::json, ?::json, ?::json, ?::json, ?, ?, ?, true, ?, ?, ?, true) returning id",
            Number.class,
            a, safeDate(payload.get("issue_date")), str(payload.get("issue_time")), str(payload.get("report_period")),
            JSON.writeValueAsString(payload), JSON.writeValueAsString(new ArrayList<>(regions)),
            JSON.writeValueAsString(new ArrayList<>(districts)), JSON.writeValueAsString(new ArrayList<>(types)),
            JSON.writeValueAsString(counts), topAlert, items.size(), userId, warningCode, parentId, revision);

        return Map.of("ok", true, "id", id.longValue(), "agency", a, "warning_code", warningCode,
            "revision", revision, "is_update", true, "top_alert", topAlert == null ? "" : topAlert,
            "regions", new ArrayList<>(regions));
    }

    /** Monitoring reads entity updates (by warning_code or agency). */
    @GetMapping("/agency/updates")
    public Map<String, Object> updates(@RequestParam(required = false) String warning_code,
                                       @RequestParam(required = false) String agency) {
        StringBuilder where = new StringBuilder("is_update = true");
        List<Object> args = new ArrayList<>();
        if (warning_code != null && !warning_code.isBlank()) { where.append(" and warning_code = ?"); args.add(warning_code); }
        if (agency != null && !agency.isBlank()) { where.append(" and agency = ?"); args.add(agency.toLowerCase(Locale.ROOT)); }
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select id, agency, warning_code, revision, top_alert, regions::text as regions, hazard_types::text as hazard_types, " +
            "issue_date, issue_time, is_latest, created_at from public.ew_agency_submissions where " + where +
            " order by created_at desc, id desc limit 200", args.toArray());
        return Map.of("updates", rows);
    }

    // ── Read one agency's latest (the envelope) ───────────────────────────────────────────────────
    @GetMapping("/agency/{agency}/latest")
    public Map<String, Object> latest(@PathVariable String agency) {
        String a = agency == null ? "" : agency.toLowerCase(Locale.ROOT);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select id, agency, bridge_ts, issue_date, issue_time, report_period, payload, regions, " +
            "districts, hazard_types, alert_summary, top_alert, item_count from public.ew_agency_submissions " +
            "where agency = ? and is_latest = true order by bridge_ts desc, id desc limit 1", a);
        if (rows.isEmpty()) {
            return Map.of("agency", a, "available", false);
        }
        return envelope(rows.get(0));
    }

    // ── Submission history for an agency (audit timeline) ─────────────────────────────────────────
    @GetMapping("/agency/{agency}/history")
    public Map<String, Object> history(@PathVariable String agency,
                                       @RequestParam(required = false, defaultValue = "20") int limit) {
        String a = agency == null ? "" : agency.toLowerCase(Locale.ROOT);
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select id, agency, bridge_ts, issue_date, issue_time, top_alert, item_count, regions, " +
            "districts, hazard_types, is_latest from public.ew_agency_submissions where agency = ? " +
            "order by bridge_ts desc, id desc limit ?", a, Math.min(Math.max(limit, 1), 200));
        for (Map<String, Object> r : rows) { r.put("regions", readList(r.get("regions")));
            r.put("districts", readList(r.get("districts"))); r.put("hazard_types", readList(r.get("hazard_types"))); }
        return Map.of("agency", a, "history", rows, "count", rows.size());
    }

    /** Withdraw an agency's current bulletin (retract a false alert) — clears is_latest so it leaves the
     * cross-agency reads + the DMD consolidation. The superseded rows remain for audit. */
    @org.springframework.web.bind.annotation.DeleteMapping("/agency/{agency}/latest")
    @Transactional
    @PreAuthorize(Authz.EW_APPROVE)
    public Map<String, Object> withdraw(@PathVariable String agency) {
        String a = agency == null ? "" : agency.toLowerCase(Locale.ROOT);
        if (!AGENCIES.contains(a)) throw new BusinessRuleException("Unknown warning entity: " + agency);
        int n = jdbc.update("update public.ew_agency_submissions set is_latest = false where agency = ? and is_latest = true", a);
        return Map.of("ok", true, "agency", a, "withdrawn", n);
    }

    // ── Read every agency's latest at once (the cross-agency visibility map) ───────────────────────
    @GetMapping("/agency/latest")
    public Map<String, Object> allLatest(@RequestParam(required = false) String exclude) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select id, agency, bridge_ts, issue_date, issue_time, report_period, payload, regions, " +
            "districts, hazard_types, alert_summary, top_alert, item_count from public.ew_agency_submissions " +
            "where is_latest = true order by bridge_ts desc");
        Map<String, Object> byAgency = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            String a = String.valueOf(r.get("agency"));
            if (a.equalsIgnoreCase(exclude)) continue;
            if (!byAgency.containsKey(a)) byAgency.put(a, envelope(r));
        }
        return Map.of("agencies", byAgency, "count", byAgency.size());
    }

    // ── PMO-DMD consolidation: overlay all inputs, highest-alert-wins per area ─────────────────────
    @GetMapping("/dmd/consolidated")
    @SuppressWarnings("unchecked")
    public Map<String, Object> consolidated(@RequestParam(required = false, defaultValue = "5") int days) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select agency, payload from public.ew_agency_submissions where is_latest = true");

        // HYDROMET tier choropleth (TMA+MoW only): day -> district -> [level, agency, type]
        Map<Integer, Map<String, String[]>> perDay = new LinkedHashMap<>();
        // non-hydromet hazards (GST/MoH/MoA/NEMC) as a distinct overlay layer: day -> [{agency,type,...}]
        Map<Integer, List<Map<String, Object>>> overlays = new LinkedHashMap<>();
        Map<String, List<Map<String, Object>>> comments = new LinkedHashMap<>();
        for (int d = 1; d <= days; d++) { perDay.put(d, new LinkedHashMap<>()); overlays.put(d, new ArrayList<>()); }

        for (Map<String, Object> row : rows) {
            String agency = String.valueOf(row.get("agency"));
            boolean hydromet = HYDROMET.contains(agency);
            Map<String, Object> payload = readJson(row.get("payload"));
            for (Item it : flatten(payload)) {
                int day = it.day() <= 0 ? 1 : it.day();          // event-based agencies fold onto day 1
                if (day > days) continue;
                String lvl = it.alertLevel() == null ? "ADVISORY" : it.alertLevel().toUpperCase(Locale.ROOT);
                String type = it.type() == null ? "" : it.type();
                List<String> areas = expandToDistricts(it);     // DISTRICT granularity (regions expanded)
                List<String> narrativeAreas = !it.districts().isEmpty() ? it.districts() : it.regions();
                if (hydromet) {
                    Map<String, String[]> dayMap = perDay.get(day);
                    for (String area : areas) {
                        if (area == null || area.isBlank()) continue;
                        String[] cur = dayMap.get(area);
                        if (cur == null || rank(lvl) > rank(cur[0])) {      // highest-alert-wins, keep driver
                            dayMap.put(area, new String[]{lvl, agency, type});
                        }
                    }
                } else {
                    overlays.get(day).add(Map.of("agency", agency, "type", type, "alert_level", lvl,
                        "areas", narrativeAreas, "districts", areas,
                        "description", it.description() == null ? "" : it.description()));
                }
                if (it.description() != null && !it.description().isBlank()) {
                    comments.computeIfAbsent(agency, k -> new ArrayList<>())
                        .add(Map.of("day", day, "type", type, "alert_level", lvl,
                            "description", it.description(), "areas", narrativeAreas));
                }
            }
        }

        // shape per-day tier district lists + the driving hazard per tier district (tier_sources)
        List<Map<String, Object>> out = new ArrayList<>();
        for (int d = 1; d <= days; d++) {
            Map<String, List<String>> tiers = new LinkedHashMap<>();
            tiers.put("major_warning", new ArrayList<>());
            tiers.put("warning", new ArrayList<>());
            tiers.put("advisory", new ArrayList<>());
            Map<String, String> tierSources = new LinkedHashMap<>();
            for (Map.Entry<String, String[]> e : perDay.get(d).entrySet()) {
                String[] v = e.getValue();
                List<String> bucket = tiers.get(v[0].toLowerCase(Locale.ROOT));
                if (bucket == null) bucket = tiers.get("advisory");   // never NPE on a non-canonical level
                bucket.add(e.getKey());
                tierSources.put(e.getKey(), v[1].toUpperCase(Locale.ROOT) + ":" + v[2]);
            }
            out.add(Map.of("day", d, "tiers", tiers, "tier_sources", tierSources,
                "area_count", perDay.get(d).size(), "overlays", overlays.get(d)));
        }
        return Map.of("days", out, "comments", comments,
            "sources", rows.stream().map(r -> r.get("agency")).distinct().toList());
    }

    // ── helpers ───────────────────────────────────────────────────────────────────────────────────
    private Map<String, Object> envelope(Map<String, Object> r) {
        Map<String, Object> e = new LinkedHashMap<>();
        e.put("agency", r.get("agency"));
        e.put("available", true);
        e.put("bridge_ts", String.valueOf(r.get("bridge_ts")));
        e.put("issue_date", String.valueOf(r.get("issue_date")));
        e.put("issue_time", r.get("issue_time"));
        e.put("report_period", r.get("report_period"));
        e.put("top_alert", r.get("top_alert"));
        e.put("item_count", r.get("item_count"));
        e.put("regions", readList(r.get("regions")));
        e.put("districts", readList(r.get("districts")));
        e.put("hazard_types", readList(r.get("hazard_types")));
        e.put("alert_summary", readJson(r.get("alert_summary")));
        e.put("data", readJson(r.get("payload")));
        return e;
    }

    /** The authenticated submitter's users.id, or null — NEVER the arbitrary first user (that misattributes
     * every submission). Resolves the security principal (username/email) to users.id; null when it can't
     * be resolved (e.g. local profile with no JWT) rather than guessing. */
    private Long currentUserId() {
        try {
            String name = tz.go.pmo.dmis.common.security.SecurityUtils.currentUserName();
            if (name != null && !name.isBlank() && !name.equalsIgnoreCase("System")) {
                // public.users (V5) has only name/email — NOT username; match those real columns.
                List<Long> ids = jdbc.queryForList(
                    "select id from public.users where email = ? or name = ? limit 1", Long.class, name, name);
                if (!ids.isEmpty()) return ids.get(0);
            }
        } catch (Exception ignored) {
            // users table may not expose username/email in every profile — fall through to null
        }
        return null;
    }

    /** Extract the JSON string from a JDBC column value (json columns arrive as PGobject — read via
     * reflection to avoid a compile-time dependency on the driver package, matching EwProductController). */
    private static String jsonString(Object v) throws Exception {
        if (v == null) return null;
        return v.getClass().getSimpleName().equals("PGobject")
                ? String.valueOf(v.getClass().getMethod("getValue").invoke(v)) : String.valueOf(v);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> readJson(Object o) {
        try {
            String s = jsonString(o);
            if (s == null || s.isBlank()) return new LinkedHashMap<>();
            return JSON.readValue(s, Map.class);
        } catch (Exception ex) {
            return new LinkedHashMap<>();
        }
    }

    @SuppressWarnings("unchecked")
    private List<Object> readList(Object o) {
        try {
            String s = jsonString(o);
            if (s == null || s.isBlank()) return List.of();
            return JSON.readValue(s, List.class);
        } catch (Exception ex) {
            return List.of();
        }
    }

    private static List<?> listOf(Object o) {
        return o instanceof List<?> l ? l : List.of();
    }

    @SuppressWarnings("unchecked")
    private static List<String> strList(Object o) {
        List<String> out = new ArrayList<>();
        if (o instanceof List<?> l) {
            for (Object x : l) if (x != null) out.add(String.valueOf(x));
        }
        return out;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    /** Only pass a yyyy-MM-dd value to the ?::date cast; anything else → null (avoids a raw SQL 500). */
    private static String safeDate(Object o) {
        String s = str(o);
        return (s != null && s.matches("\\d{4}-\\d{2}-\\d{2}")) ? s : null;
    }

    private static String firstNonBlank(String... xs) {
        for (String x : xs) if (x != null && !x.isBlank()) return x;
        return null;
    }

    private static int asInt(Object o, int dflt) {
        if (o instanceof Number n) return n.intValue();
        try { return o == null ? dflt : Integer.parseInt(String.valueOf(o).trim()); }
        catch (Exception e) { return dflt; }
    }
}
