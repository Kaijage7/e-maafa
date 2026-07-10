package tz.go.pmo.dmis.ew;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * PMO-DMD Action Guide Book statement proposals.
 *
 * <p>After impact colours are set (yellow / orange / red), this service looks up the official
 * {@code ACTION_GUIDE_BOOK} catalog by <b>hazard + alert level</b> and proposes ~3 editable
 * statements for comments, directives and public dissemination. It does <b>not</b> invent text
 * with generative AI — proposals are deterministic extracts/composites from the approved guide
 * (honest decision-support). PMO always edits before PDF push / EOCC / portal / SMS-email.</p>
 *
 * <p><b>No-harm scaling:</b> message intensity follows colour — Advisory (yellow) stays calm
 * preparedness language; Warning (orange) calls for action; Major Warning (red) is immediate
 * protection language. Flow for overlays, PDF, EOCC bulletin, portal and SMS/email is unchanged.</p>
 */
@Service
public class ActionGuideStatementService {

    private static final ObjectMapper JSON = new ObjectMapper();

    private final JdbcTemplate jdbc;

    private Map<String, Object> catalog = Map.of();
    private String loadError;

    public ActionGuideStatementService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostConstruct
    void load() {
        try (InputStream in = new ClassPathResource("ew/action-guide-book.json").getInputStream()) {
            catalog = JSON.readValue(in, new TypeReference<>() {});
            loadError = null;
        } catch (Exception e) {
            catalog = Map.of();
            loadError = e.getMessage();
        }
        // Best-effort seed of editable DB table from packaged catalog (Content Management).
        try {
            ensureSeeded();
        } catch (Exception ignored) {
            // table may not exist yet on first compile-only runs
        }
    }

    /** Catalog metadata for the UI (hazards, levels, no-harm scale) — no proposals yet. */
    public Map<String, Object> meta() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("available", !catalog.isEmpty());
        out.put("version", catalog.get("version"));
        out.put("source", catalog.get("source"));
        out.put("loadError", loadError);
        out.put("levels", catalog.get("levels"));
        out.put("noHarmScaling", catalog.get("noHarmScaling"));
        out.put("commonStatement", catalog.get("commonStatement"));
        List<Map<String, Object>> hazards = new ArrayList<>();
        Object raw = catalog.get("hazards");
        if (raw instanceof Map<?, ?> hm) {
            for (Object v : hm.values()) {
                if (v instanceof Map<?, ?> h) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", h.get("id"));
                    row.put("name", h.get("name"));
                    Object levels = h.get("levels");
                    if (levels instanceof Map<?, ?> lm) {
                        Map<String, Integer> counts = new LinkedHashMap<>();
                        for (Map.Entry<?, ?> e : lm.entrySet()) {
                            int n = 0;
                            if (e.getValue() instanceof Map<?, ?> lv && lv.get("rows") instanceof List<?> rows) {
                                n = rows.size();
                            }
                            counts.put(String.valueOf(e.getKey()), n);
                        }
                        row.put("rowCounts", counts);
                    }
                    hazards.add(row);
                }
            }
        }
        out.put("hazards", hazards);
        out.put("note",
                "Proposals are drawn from the official Action Guide Book by hazard + colour level. "
                        + "PMO edits before publish. Not generative AI — deterministic decision support.");
        return out;
    }

    /**
     * Propose ~3 statements for a painted impact colour + hazard + areas.
     *
     * @param body impactLevel (ADVISORY|WARNING|MAJOR_WARNING or yellow|orange|red),
     *             hazard (focus key or free text), areas (list of district names),
     *             language (en|sw|both), day, entitySource optional
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> propose(Map<String, Object> body) {
        if (catalog.isEmpty()) {
            return Map.of("success", false, "message",
                    "Action Guide Book catalog is not loaded: " + (loadError == null ? "missing resource" : loadError));
        }
        String level = normalizeLevel(str(body.get("impactLevel")), str(body.get("color")));
        String hazardQuery = firstNonBlank(str(body.get("hazard")), str(body.get("hazardFocus")),
                str(body.get("entitySource")), "heavy rainfall");
        List<String> areas = stringList(body.get("areas"));
        String lang = normalizeLang(str(body.get("language")));
        int limit = intOr(body.get("limit"), 3);

        Map<String, Object> matched = matchHazard(hazardQuery);
        String hazardName = matched == null ? "Heavy rainfall" : String.valueOf(matched.get("name"));
        String hazardId = matched == null ? "heavy_rainfall" : String.valueOf(matched.get("id"));

        List<Map<String, Object>> rows = rowsForEditable(hazardId, matched, level);
        Map<String, Object> levelMeta = levelMeta(level);
        Map<String, Object> scale = noHarmFor(level);
        Map<String, Object> common = loadCommon();

        List<Map<String, Object>> proposals = new ArrayList<>();
        // 1) Public / SMS-scale statement (no-harm: shorter for advisory, firmer for major)
        proposals.add(proposal(
                "public_sms",
                "Public alert statement (SMS / portal headline)",
                "Short public message scaled to colour — ready for dissemination channels after PMO edit.",
                buildPublicStatement(level, hazardName, areas, rows, common, lang, scale),
                level, hazardId, hazardName, areas, scale));

        // 2) Bulletin impact narrative (DMD comment)
        proposals.add(proposal(
                "bulletin_narrative",
                "Impact bulletin narrative (DMD comment)",
                "Impact points from the Action Guide for this colour — goes into the multirisk bulletin comment.",
                buildNarrative(level, hazardName, areas, rows, lang),
                level, hazardId, hazardName, areas, scale));

        // 3) Operational directives (DMC / authority actions)
        proposals.add(proposal(
                "operational_directives",
                "Operational directives (DMC / authorities)",
                "Committee and community actions from the guide — beside the map as PMO directives.",
                buildDirectives(level, hazardName, areas, rows, common, lang),
                level, hazardId, hazardName, areas, scale));

        // Optional 4th: bilingual pack if both
        if ("both".equals(lang) && proposals.size() < limit + 1) {
            proposals.add(proposal(
                    "bilingual_pack",
                    "Bilingual public pack (EN + SW)",
                    "Paired English and Kiswahili public statements for dual-language dissemination.",
                    buildBilingualPack(level, hazardName, areas, rows, common, scale),
                    level, hazardId, hazardName, areas, scale));
        }

        if (proposals.size() > limit) {
            proposals = new ArrayList<>(proposals.subList(0, Math.max(3, limit)));
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("ai", false);
        out.put("assistant", "action-guide-deterministic");
        out.put("modelVersion", "action-guide-statements-v1");
        out.put("catalogVersion", catalog.get("version"));
        out.put("impactLevel", level);
        out.put("levelMeta", levelMeta);
        out.put("noHarmScaling", scale);
        out.put("hazard", Map.of("id", hazardId, "name", hazardName, "query", hazardQuery));
        out.put("areas", areas);
        out.put("language", lang);
        out.put("rowCount", rows.size());
        out.put("proposals", proposals);
        out.put("guideActions", topActions(rows, lang, 6));
        out.put("guideImpacts", topImpacts(rows, lang, 6));
        out.put("commonStatement", common);
        out.put("editNote",
                "PMO may freely edit any proposal. Applying a proposal only fills the on-screen comment/"
                        + "directive boxes — it does not auto-publish, generate PDF, or send SMS/email.");
        out.put("flowNote",
                "Unchanged flow: overlays → impact paint → (optional statement assist) → Generate Impact "
                        + "Bulletin PDF → Publish to EOCC Bulletin → approve → portal map + SMS/email dissemination.");
        return out;
    }

    // ─── builders ───────────────────────────────────────────────────────────────

    private Map<String, Object> proposal(String id, String title, String purpose, String text,
                                         String level, String hazardId, String hazardName,
                                         List<String> areas, Map<String, Object> scale) {
        Map<String, Object> p = new LinkedHashMap<>();
        p.put("id", id);
        p.put("title", title);
        p.put("purpose", purpose);
        p.put("text", text);
        p.put("impactLevel", level);
        p.put("hazardId", hazardId);
        p.put("hazardName", hazardName);
        p.put("areas", areas);
        p.put("tone", scale == null ? null : scale.get("tone"));
        p.put("source", "ACTION_GUIDE_BOOK");
        p.put("editable", true);
        return p;
    }

    @SuppressWarnings("unchecked")
    private String buildPublicStatement(String level, String hazard, List<String> areas,
                                        List<Map<String, Object>> rows, Map<String, Object> common,
                                        String lang, Map<String, Object> scale) {
        String areaBit = formatAreas(areas);
        boolean sw = "sw".equals(lang);
        String toneLead = switch (level) {
            case "MAJOR_WARNING" -> sw
                    ? "ONYO KUBWA — Chukua hatua mara moja. "
                    : "MAJOR WARNING — Take action immediately. ";
            case "WARNING" -> sw
                    ? "ONYO — Chukua hatua. "
                    : "WARNING — Take action. ";
            default -> sw
                    ? "TAHADHARI — Jitayarishe. "
                    : "ADVISORY — Be prepared. ";
        };
        List<String> actions = actionLines(rows, lang, level.equals("MAJOR_WARNING") ? 3 : 2);
        String actionBit = actions.isEmpty() ? "" : " " + String.join(" ", actions);
        String commonBit = "";
        if (common != null) {
            String c = sw ? str(common.get("sw")) : str(common.get("en"));
            if (c != null && !c.isBlank()) {
                commonBit = " " + c;
            }
        }
        String hazardBit = sw ? ("Hatari: " + hazard + ".") : ("Hazard: " + hazard + ".");
        String areaClause = areaBit.isEmpty() ? ""
                : (sw ? (" Maeneo: " + areaBit + ".") : (" Areas: " + areaBit + "."));
        // No-harm: advisory stays shorter / calmer
        if ("ADVISORY".equals(level)) {
            String tail = sw
                    ? " Fuatilia taarifa rasmi kutoka mamlaka husika."
                    : " Follow updates from official sources.";
            return (toneLead + hazardBit + areaClause + actionBit + tail)
                    .replaceAll("\\s+", " ").trim();
        }
        return (toneLead + hazardBit + areaClause + commonBit + actionBit)
                .replaceAll("\\s+", " ").trim();
    }

    private String buildNarrative(String level, String hazard, List<String> areas,
                                  List<Map<String, Object>> rows, String lang) {
        String areaBit = formatAreas(areas);
        List<String> impacts = impactLines(rows, lang, 5);
        StringBuilder sb = new StringBuilder();
        sb.append(levelLabel(level)).append(" impact assessment — ").append(hazard);
        if (!areaBit.isEmpty()) {
            sb.append(" in ").append(areaBit);
        }
        sb.append(".\n");
        for (String imp : impacts) {
            sb.append("• ").append(imp).append('\n');
        }
        sb.append("Source: PMO-DMD Action Guide Book (").append(levelLabel(level)).append(").");
        return sb.toString().trim();
    }

    @SuppressWarnings("unchecked")
    private String buildDirectives(String level, String hazard, List<String> areas,
                                   List<Map<String, Object>> rows, Map<String, Object> common,
                                   String lang) {
        StringBuilder sb = new StringBuilder();
        String commonEn = common == null ? null : str(common.get("en"));
        if (commonEn != null && !commonEn.isBlank()) {
            sb.append(commonEn).append('\n');
        }
        sb.append("Hazard focus: ").append(hazard)
                .append(" · Level: ").append(levelLabel(level));
        if (!areas.isEmpty()) {
            sb.append(" · Districts: ").append(formatAreas(areas));
        }
        sb.append('\n');
        for (String a : actionLines(rows, lang, 6)) {
            sb.append("• ").append(a).append('\n');
        }
        if ("MAJOR_WARNING".equals(level)) {
            sb.append("• Activate district EOCs; pre-position relief; report status to PMO-DMD / EOCC.\n");
        } else if ("WARNING".equals(level)) {
            sb.append("• Brief ward/village committees; open temporary shelters if needed; update EOCC.\n");
        } else {
            sb.append("• Review contingency readiness; clear drains; monitor official forecasts.\n");
        }
        return sb.toString().trim();
    }

    @SuppressWarnings("unchecked")
    private String buildBilingualPack(String level, String hazard, List<String> areas,
                                      List<Map<String, Object>> rows, Map<String, Object> common,
                                      Map<String, Object> scale) {
        String en = buildPublicStatement(level, hazard, areas, rows, common, "en", scale);
        String sw = buildPublicStatement(level, hazard, areas, rows, common, "sw", scale);
        // Prefer SW common for sw public if catalog has it
        return "EN: " + en + "\n\nSW: " + sw;
    }

    private List<String> actionLines(List<Map<String, Object>> rows, String lang, int max) {
        List<String> out = new ArrayList<>();
        String key = "sw".equals(lang) ? "actionSw" : "actionEn";
        for (Map<String, Object> r : rows) {
            String a = str(r.get(key));
            if (a == null || a.isBlank()) {
                a = str(r.get("actionEn"));
            }
            if (a == null || a.isBlank()) {
                continue;
            }
            // First sentence only for SMS density
            String first = a.split("\\.(?:\\s|$)")[0].trim();
            if (!first.isEmpty() && !out.contains(first + ".")) {
                out.add(first.endsWith(".") ? first : first + ".");
            }
            if (out.size() >= max) {
                break;
            }
        }
        return out;
    }

    private List<String> impactLines(List<Map<String, Object>> rows, String lang, int max) {
        List<String> out = new ArrayList<>();
        String key = "sw".equals(lang) ? "impactSw" : "impactEn";
        for (Map<String, Object> r : rows) {
            String a = str(r.get(key));
            if (a == null || a.isBlank()) {
                a = str(r.get("impactEn"));
            }
            if (a != null && !a.isBlank()) {
                out.add(a);
            }
            if (out.size() >= max) {
                break;
            }
        }
        return out;
    }

    private List<Map<String, Object>> topActions(List<Map<String, Object>> rows, String lang, int max) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < rows.size() && out.size() < max; i++) {
            Map<String, Object> r = rows.get(i);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("en", r.get("actionEn"));
            m.put("sw", r.get("actionSw"));
            out.add(m);
        }
        return out;
    }

    private List<Map<String, Object>> topImpacts(List<Map<String, Object>> rows, String lang, int max) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (int i = 0; i < rows.size() && out.size() < max; i++) {
            Map<String, Object> r = rows.get(i);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("en", r.get("impactEn"));
            m.put("sw", r.get("impactSw"));
            out.add(m);
        }
        return out;
    }

    // ─── catalog lookup ─────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> matchHazard(String query) {
        if (query == null || query.isBlank()) {
            return firstHazard();
        }
        String q = query.toLowerCase(Locale.ROOT);
        Map<String, Object> hazards = (Map<String, Object>) catalog.get("hazards");
        Map<String, Object> aliases = (Map<String, Object>) catalog.getOrDefault("hazardAliases", Map.of());

        // alias id match
        for (Map.Entry<String, Object> e : aliases.entrySet()) {
            if (e.getValue() instanceof List<?> list) {
                for (Object a : list) {
                    if (q.contains(String.valueOf(a).toLowerCase(Locale.ROOT))) {
                        Map<String, Object> h = hazardById(hazards, e.getKey());
                        if (h != null) {
                            return h;
                        }
                    }
                }
            }
        }
        // name contains
        if (hazards != null) {
            for (Object v : hazards.values()) {
                if (v instanceof Map<?, ?> h) {
                    String name = String.valueOf(h.get("name")).toLowerCase(Locale.ROOT);
                    String id = String.valueOf(h.get("id")).toLowerCase(Locale.ROOT);
                    if (q.contains(name) || name.contains(q) || q.contains(id.replace('_', ' '))) {
                        return (Map<String, Object>) h;
                    }
                }
            }
        }
        // product type heuristics
        if (q.contains("flood") || q.contains("mow")) {
            return hazardById(hazards, "floods");
        }
        if (q.contains("rain") || q.contains("tma")) {
            return hazardById(hazards, "heavy_rainfall");
        }
        if (q.contains("drought") || q.contains("moa")) {
            return hazardById(hazards, "drought");
        }
        if (q.contains("quake") || q.contains("gst") || q.contains("tsunami")) {
            return hazardById(hazards, "earthquake_and_tsunami");
        }
        if (q.contains("wind") || q.contains("storm") || q.contains("cyclone")) {
            return hazardById(hazards, "strong_winds");
        }
        if (q.contains("landslide")) {
            return hazardById(hazards, "landslide");
        }
        if (q.contains("wave") || q.contains("coastal")) {
            return hazardById(hazards, "large_waves");
        }
        if (q.contains("fire") || q.contains("wildfire")) {
            return hazardById(hazards, "wildfire");
        }
        if (q.contains("health") || q.contains("moh") || q.contains("disease")) {
            return hazardById(hazards, "public_health");
        }
        return firstHazard();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> hazardById(Map<String, Object> hazards, String id) {
        if (hazards == null) {
            return null;
        }
        for (Object v : hazards.values()) {
            if (v instanceof Map<?, ?> h && id.equals(String.valueOf(h.get("id")))) {
                return (Map<String, Object>) h;
            }
        }
        // try by name slug
        for (Object v : hazards.values()) {
            if (v instanceof Map<?, ?> h) {
                String hid = String.valueOf(h.get("id"));
                if (hid != null && hid.replace("_", "").equalsIgnoreCase(id.replace("_", ""))) {
                    return (Map<String, Object>) h;
                }
            }
        }
        return null;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> firstHazard() {
        Object raw = catalog.get("hazards");
        if (raw instanceof Map<?, ?> hm && !hm.isEmpty()) {
            Object first = hm.values().iterator().next();
            if (first instanceof Map<?, ?> m) {
                return (Map<String, Object>) m;
            }
        }
        return null;
    }

    /**
     * Prefer Content Management DB rows (active) when present; fall back to packaged catalog.
     */
    private List<Map<String, Object>> rowsForEditable(String hazardId, Map<String, Object> hazard, String level) {
        try {
            List<Map<String, Object>> db = jdbc.queryForList("""
                    select impact_en as "impactEn", impact_sw as "impactSw",
                           action_en as "actionEn", action_sw as "actionSw"
                    from public.ew_action_guide_statements
                    where active = true and hazard_id = ? and impact_level = ?
                    order by sort_order, id
                    """, hazardId, level);
            if (!db.isEmpty()) {
                return db;
            }
        } catch (DataAccessException ignored) {
            // table not ready — catalog only
        }
        return rowsFor(hazard, level);
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> rowsFor(Map<String, Object> hazard, String level) {
        if (hazard == null) {
            return List.of();
        }
        Object levels = hazard.get("levels");
        if (!(levels instanceof Map<?, ?> lm)) {
            return List.of();
        }
        Object lv = lm.get(level);
        if (!(lv instanceof Map<?, ?> levelMap)) {
            return List.of();
        }
        Object rows = levelMap.get("rows");
        if (!(rows instanceof List<?> list)) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object r : list) {
            if (r instanceof Map<?, ?> m) {
                out.add((Map<String, Object>) m);
            }
        }
        return out;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> loadCommon() {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList("""
                    select statement_en as en, statement_sw as sw from public.ew_action_guide_common where id = 1
                    """);
            if (!rows.isEmpty()) {
                return rows.get(0);
            }
        } catch (DataAccessException ignored) {
            // fall through
        }
        Object c = catalog.get("commonStatement");
        return c instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    // ─── Content Management CRUD ────────────────────────────────────────────────

    /** List editable rows for admin UI (optional filters). */
    public Map<String, Object> adminList(String hazardId, String level) {
        ensureSeeded();
        StringBuilder sql = new StringBuilder("""
                select id, hazard_id as "hazardId", hazard_name as "hazardName", impact_level as "impactLevel",
                       sort_order as "sortOrder", impact_en as "impactEn", impact_sw as "impactSw",
                       action_en as "actionEn", action_sw as "actionSw", active,
                       updated_at as "updatedAt"
                from public.ew_action_guide_statements where 1=1
                """);
        List<Object> args = new ArrayList<>();
        if (hazardId != null && !hazardId.isBlank()) {
            sql.append(" and hazard_id = ?");
            args.add(hazardId.trim());
        }
        if (level != null && !level.isBlank()) {
            sql.append(" and impact_level = ?");
            args.add(normalizeLevel(level, null));
        }
        sql.append(" order by hazard_name, impact_level, sort_order, id");
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), args.toArray());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("rows", rows);
        out.put("count", rows.size());
        out.put("common", loadCommon());
        out.put("hazards", meta().get("hazards"));
        out.put("levels", catalog.get("levels"));
        return out;
    }

    public Map<String, Object> adminUpdate(long id, Map<String, Object> body, Long userId) {
        int n = jdbc.update("""
                update public.ew_action_guide_statements set
                    impact_en = coalesce(?, impact_en),
                    impact_sw = coalesce(?, impact_sw),
                    action_en = coalesce(?, action_en),
                    action_sw = coalesce(?, action_sw),
                    sort_order = coalesce(?, sort_order),
                    active = coalesce(?, active),
                    updated_by = ?,
                    updated_at = now()
                where id = ?
                """,
                str(body.get("impactEn")), str(body.get("impactSw")),
                str(body.get("actionEn")), str(body.get("actionSw")),
                body.get("sortOrder") instanceof Number ? ((Number) body.get("sortOrder")).intValue() : null,
                body.get("active") == null ? null : Boolean.parseBoolean(String.valueOf(body.get("active"))),
                userId, id);
        if (n == 0) {
            return Map.of("success", false, "message", "Row not found");
        }
        return Map.of("success", true, "id", id, "message", "Action guide statement updated");
    }

    public Map<String, Object> adminUpdateCommon(Map<String, Object> body, Long userId) {
        jdbc.update("""
                insert into public.ew_action_guide_common(id, statement_en, statement_sw, updated_by, updated_at)
                values (1, ?, ?, ?, now())
                on conflict (id) do update set
                    statement_en = coalesce(excluded.statement_en, ew_action_guide_common.statement_en),
                    statement_sw = coalesce(excluded.statement_sw, ew_action_guide_common.statement_sw),
                    updated_by = excluded.updated_by,
                    updated_at = now()
                """,
                str(body.get("en")) != null ? str(body.get("en")) : str(body.get("statementEn")),
                str(body.get("sw")) != null ? str(body.get("sw")) : str(body.get("statementSw")),
                userId);
        return Map.of("success", true, "common", loadCommon());
    }

    /** Seed/reseed from packaged JSON when table empty (or force=true replaces all). */
    @SuppressWarnings("unchecked")
    public Map<String, Object> ensureSeeded() {
        return seedFromCatalog(false);
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> seedFromCatalog(boolean force) {
        if (catalog.isEmpty()) {
            return Map.of("success", false, "message", "Catalog not loaded");
        }
        Long count;
        try {
            count = jdbc.queryForObject("select count(*) from public.ew_action_guide_statements", Long.class);
        } catch (DataAccessException e) {
            return Map.of("success", false, "message", "Table not available: " + e.getMessage());
        }
        if (!force && count != null && count > 0) {
            return Map.of("success", true, "seeded", false, "count", count, "message", "Already seeded");
        }
        if (force) {
            jdbc.update("delete from public.ew_action_guide_statements");
        }
        Object raw = catalog.get("hazards");
        int inserted = 0;
        if (raw instanceof Map<?, ?> hm) {
            for (Object v : hm.values()) {
                if (!(v instanceof Map<?, ?> h)) {
                    continue;
                }
                String hid = String.valueOf(h.get("id"));
                String hname = String.valueOf(h.get("name"));
                Object levels = h.get("levels");
                if (!(levels instanceof Map<?, ?> lm)) {
                    continue;
                }
                for (Map.Entry<?, ?> le : lm.entrySet()) {
                    String level = String.valueOf(le.getKey());
                    if (!(le.getValue() instanceof Map<?, ?> lv)) {
                        continue;
                    }
                    Object rows = lv.get("rows");
                    if (!(rows instanceof List<?> list)) {
                        continue;
                    }
                    int order = 0;
                    for (Object r : list) {
                        if (!(r instanceof Map<?, ?> row)) {
                            continue;
                        }
                        jdbc.update("""
                                insert into public.ew_action_guide_statements
                                  (hazard_id, hazard_name, impact_level, sort_order,
                                   impact_en, impact_sw, action_en, action_sw, active, created_at, updated_at)
                                values (?,?,?,?,?,?,?,?,true,now(),now())
                                """,
                                hid, hname, level, order++,
                                str(row.get("impactEn")), str(row.get("impactSw")),
                                str(row.get("actionEn")), str(row.get("actionSw")));
                        inserted++;
                    }
                }
            }
        }
        Object common = catalog.get("commonStatement");
        if (common instanceof Map<?, ?> c) {
            adminUpdateCommon(Map.of("en", str(c.get("en")), "sw", str(c.get("sw"))), null);
        }
        return Map.of("success", true, "seeded", true, "inserted", inserted);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> levelMeta(String level) {
        Object levels = catalog.get("levels");
        if (levels instanceof Map<?, ?> m && m.get(level) instanceof Map<?, ?> lm) {
            return (Map<String, Object>) lm;
        }
        return Map.of("labelEn", level);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> noHarmFor(String level) {
        Object nhs = catalog.get("noHarmScaling");
        if (nhs instanceof Map<?, ?> m && m.get(level) instanceof Map<?, ?> s) {
            return (Map<String, Object>) s;
        }
        return Map.of("tone", "calm_prepare", "scale", 1);
    }

    private static String levelLabel(String level) {
        return switch (level) {
            case "MAJOR_WARNING" -> "Major Warning";
            case "WARNING" -> "Warning";
            default -> "Advisory";
        };
    }

    private static String normalizeLevel(String level, String color) {
        String s = (level == null ? "" : level).trim().toUpperCase(Locale.ROOT).replace(' ', '_');
        if (s.contains("MAJOR") || s.equals("RED") || s.equals("L3") || s.equals("LEVEL_3") || s.equals("LEVEL3")) {
            return "MAJOR_WARNING";
        }
        if (s.contains("WARN") || s.equals("ORANGE") || s.equals("L2") || s.equals("LEVEL_2") || s.equals("LEVEL2")) {
            return "WARNING";
        }
        if (s.contains("ADVIS") || s.equals("YELLOW") || s.equals("L1") || s.equals("LEVEL_1") || s.equals("LEVEL1")) {
            return "ADVISORY";
        }
        String c = (color == null ? "" : color).trim().toLowerCase(Locale.ROOT);
        if (c.contains("red") || c.equals("#ff0000")) {
            return "MAJOR_WARNING";
        }
        if (c.contains("orange") || c.equals("#ffa500")) {
            return "WARNING";
        }
        if (c.contains("yellow") || c.equals("#ffff00")) {
            return "ADVISORY";
        }
        return "ADVISORY";
    }

    private static String normalizeLang(String lang) {
        if (lang == null || lang.isBlank()) {
            return "en";
        }
        String l = lang.trim().toLowerCase(Locale.ROOT);
        if (l.startsWith("sw") || l.equals("kiswahili")) {
            return "sw";
        }
        if (l.equals("both") || l.equals("bi") || l.equals("en+sw")) {
            return "both";
        }
        return "en";
    }

    private static String formatAreas(List<String> areas) {
        if (areas == null || areas.isEmpty()) {
            return "";
        }
        List<String> clean = areas.stream()
                .filter(a -> a != null && !a.isBlank())
                .map(String::trim)
                .distinct()
                .limit(12)
                .collect(Collectors.toList());
        if (clean.isEmpty()) {
            return "";
        }
        if (clean.size() == 1) {
            return clean.get(0);
        }
        if (clean.size() <= 4) {
            return String.join(", ", clean);
        }
        return String.join(", ", clean.subList(0, 3)) + " and " + (clean.size() - 3) + " other districts";
    }

    private static List<String> stringList(Object raw) {
        if (raw instanceof List<?> list) {
            List<String> out = new ArrayList<>();
            for (Object o : list) {
                if (o != null && !String.valueOf(o).isBlank()) {
                    out.add(String.valueOf(o).trim());
                }
            }
            return out;
        }
        if (raw instanceof String s && !s.isBlank()) {
            String[] parts = s.split("[,;\\n]+");
            List<String> out = new ArrayList<>();
            for (String p : parts) {
                if (!p.isBlank()) {
                    out.add(p.trim());
                }
            }
            return out;
        }
        return List.of();
    }

    private static String str(Object o) {
        if (o == null) {
            return null;
        }
        String s = String.valueOf(o).trim();
        return s.isEmpty() || "null".equalsIgnoreCase(s) ? null : s;
    }

    private static String firstNonBlank(String... xs) {
        for (String x : xs) {
            if (x != null && !x.isBlank()) {
                return x;
            }
        }
        return null;
    }

    private static int intOr(Object o, int def) {
        if (o instanceof Number n) {
            return n.intValue();
        }
        if (o != null) {
            try {
                return Integer.parseInt(String.valueOf(o));
            } catch (NumberFormatException ignored) {
                // fall through
            }
        }
        return def;
    }
}
