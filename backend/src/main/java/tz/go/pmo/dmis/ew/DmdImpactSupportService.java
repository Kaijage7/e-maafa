package tz.go.pmo.dmis.ew;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.geo.GeoAliasService;
import tz.go.pmo.dmis.inform.domain.HazardSignal;
import tz.go.pmo.dmis.inform.domain.InformService;
import tz.go.pmo.dmis.inform.engine.RiskResult;

/**
 * Decision-support layers for PMO-DMD Impact Analysis (red / orange / yellow painting).
 *
 * <p><b>Does not change</b> entity consolidation, highest-alert-wins merge, or bulletin
 * ingest/publish. It attaches full INFORM dimensions (H / V / C), a selectable natural-hazard
 * focus (Flood when rainfall is forecast, Drought, Storm, …), operational EO hazard signals, and
 * institution exposure proxies (NBS, NIDA, LATRA, NAPA, IFMI/MoFP) so colours and directives are
 * risk-informed and almost realistic. PMO still decides overrides.</p>
 *
 * <p>Suggested tier never falls below the entity hydromet tier (science floor). Support layers may
 * only <em>upgrade</em> the suggestion when context justifies it.</p>
 */
@Service
@RequiredArgsConstructor
public class DmdImpactSupportService {

    /** Natural-hazard components available as focus lenses (strategic INFORM + advanced EO signals). */
    public static final List<String> HAZARD_FOCUSES = List.of(
            "auto", "flood", "drought", "landslide", "storm", "earthquake", "coastal", "overall");

    private static final Map<String, String> FOCUS_TO_COMPONENT = Map.of(
            "flood", "Flood",
            "drought", "Drought",
            "landslide", "Landslide",
            "storm", "Storms & Cyclone",
            "earthquake", "Earthquake",
            "coastal", "Coastal hazards");

    /** Entity product type keywords → preferred hazard focus. */
    private static final List<String[]> TYPE_TO_FOCUS = List.of(
            new String[]{"flood|heavy.?rain|rainfall|precip|inundat", "flood"},
            new String[]{"drought|dry.?spell|food.?security|crop.?fail", "drought"},
            new String[]{"landslide|mudslide|slope", "landslide"},
            new String[]{"cyclone|storm|wind|tropical", "storm"},
            new String[]{"earthquake|seismic|tremor", "earthquake"},
            new String[]{"coastal|storm.?surge|tsunami|sea.?level", "coastal"});

    private final JdbcTemplate jdbc;
    private final InformService informService;
    private final GeoAliasService geoAliases;

    /**
     * @param districtLevels map of district display name → entity alert level
     * @param multiHazardDistricts districts also touched by non-hydromet overlays
     * @param hazardFocus auto|flood|drought|landslide|storm|earthquake|coastal|overall
     */
    public Map<String, Object> support(Map<String, String> districtLevels,
                                      Map<String, String> tierSources,
                                      List<String> multiHazardDistricts,
                                      String hazardFocus) {
        String focus = normalizeFocus(hazardFocus);
        // Deep INFORM profiles only for districts present on the entity map (not all 170+).
        Map<String, InformProfile> inform = loadInformProfilesFor(districtLevels.keySet());
        Map<String, int[]> readiness = loadReadinessByNormalizedName();

        List<Map<String, Object>> districts = new ArrayList<>();
        List<String> multi = multiHazardDistricts == null ? List.of() : multiHazardDistricts;

        // Global auto focus from the majority of entity tier sources when focus=auto
        String globalAutoFocus = resolveGlobalAutoFocus(tierSources, districtLevels);

        for (Map.Entry<String, String> e : districtLevels.entrySet()) {
            String name = e.getKey();
            if (name == null || name.isBlank()) {
                continue;
            }
            String entityLevel = normalizeLevel(e.getValue());
            String key = normalizeName(name);
            InformProfile iv = inform.get(key);
            if (iv == null) {
                String shortKey = normalizeName(name.replaceAll(
                        "(?i)\\s+(district|municipal|municipality|town|urban|council|city|dc|tc|mc)$", ""));
                iv = inform.getOrDefault(shortKey, InformProfile.empty());
            }
            // Institution exposure proxies derived from this district's INFORM components
            double[] exp = exposureFromProfile(iv);

            String districtFocus = focus;
            if ("auto".equals(focus)) {
                districtFocus = resolveDistrictAutoFocus(tierSources == null ? null : tierSources.get(name),
                        globalAutoFocus);
            }

            double risk = iv.risk;
            double hazard = iv.hazard;
            double vuln = iv.vulnerability;
            double coping = iv.coping;

            // Focused structural hazard component (INFORM Natural basket) + operational EO signal
            String componentName = FOCUS_TO_COMPONENT.get(districtFocus);
            double structuralHaz = componentName == null ? Double.NaN : iv.component(componentName);
            HazardSignal signal = componentName == null ? null : iv.signal(componentName);
            double eoSignal = signal == null ? Double.NaN : signal.signal();

            int[] rd = readiness.get(key);
            int ecCount = rd == null ? 0 : rd[0];
            int ecCap = rd == null ? 0 : rd[1];
            int openInc = rd == null ? 0 : rd[2];
            int warehouseCount = rd == null || rd.length < 4 ? 0 : rd[3];
            int inventoryUnits = rd == null || rd.length < 5 ? 0 : rd[4];

            // exp: [nbs, nida, latra, napa, ifmi] 0–10 style where known

            boolean multiHaz = multi.stream().anyMatch(d -> normalizeName(d).equals(key));
            List<String> reasons = new ArrayList<>();
            Map<String, Object> scoreBreak = new LinkedHashMap<>();

            int entityPts = entityPoints(entityLevel);
            reasons.add("Entity hydromet tier: " + label(entityLevel) + " (+" + entityPts + ")");
            scoreBreak.put("entityPts", entityPts);

            // ── INFORM structural: balanced H + V + C (not vulnerability alone) ──
            double informPts = 0;
            if (!Double.isNaN(hazard)) {
                double hPts = Math.min(12, hazard * 1.2);
                informPts += hPts;
                if (hazard >= 5.5) {
                    reasons.add(String.format(Locale.US, "INFORM Hazard & Exposure H=%.1f (+%.0f)", hazard, hPts));
                } else {
                    reasons.add(String.format(Locale.US, "INFORM H=%.1f", hazard));
                }
            }
            if (!Double.isNaN(vuln)) {
                double vPts = Math.min(12, vuln * 1.2);
                informPts += vPts;
                if (vuln >= 6.0) {
                    reasons.add(String.format(Locale.US, "INFORM Vulnerability V=%.1f (+%.0f)", vuln, vPts));
                } else {
                    reasons.add(String.format(Locale.US, "INFORM V=%.1f", vuln));
                }
            }
            if (!Double.isNaN(coping)) {
                double cPts = Math.min(10, coping * 1.0);
                informPts += cPts;
                if (coping >= 6.0) {
                    reasons.add(String.format(Locale.US,
                            "Weak coping capacity C=%.1f (lack of capacity) (+%.0f)", coping, cPts));
                } else {
                    reasons.add(String.format(Locale.US, "INFORM C (lack of coping)=%.1f", coping));
                }
            }
            if (!Double.isNaN(risk)) {
                reasons.add(String.format(Locale.US, "INFORM composite risk ∛(H·V·C)=%.1f", risk));
            }
            informPts = Math.min(34, informPts);
            scoreBreak.put("informStructuralPts", Math.round(informPts * 10) / 10.0);

            // ── Focused hazard (structural component + EO signal) ──
            double focusPts = 0;
            if (componentName != null) {
                if (!Double.isNaN(structuralHaz)) {
                    double p = Math.min(12, structuralHaz * 1.2);
                    focusPts += p;
                    reasons.add(String.format(Locale.US,
                            "Focused structural %s hazard component=%.1f (+%.0f)",
                            componentName, structuralHaz, p));
                }
                if (!Double.isNaN(eoSignal)) {
                    double p = Math.min(14, eoSignal * 1.4);
                    focusPts += p;
                    String rel = signal == null ? "" : " · reliability " + signal.reliability()
                            + " (" + signal.coveragePct() + "% coverage)";
                    reasons.add(String.format(Locale.US,
                            "Operational EO %s signal=%.1f (%s)%s (+%.0f)",
                            componentName, eoSignal, signal == null ? "—" : signal.status(), rel, p));
                }
                if (Double.isNaN(structuralHaz) && Double.isNaN(eoSignal)) {
                    reasons.add("Hazard focus '" + districtFocus + "' selected — no component/signal data for this district yet");
                }
            } else if ("overall".equals(districtFocus)) {
                reasons.add("Hazard focus=overall — using full INFORM H/V/C only (no single-hazard boost)");
            }
            focusPts = Math.min(26, focusPts);
            scoreBreak.put("hazardFocusPts", Math.round(focusPts * 10) / 10.0);
            scoreBreak.put("hazardFocus", districtFocus);

            // ── Institution exposure proxies (NBS / NIDA / LATRA / NAPA / IFMI) ──
            double exposurePts = 0;
            Map<String, Object> exposureDetail = new LinkedHashMap<>();
            exposurePts += exposureReason(reasons, exposureDetail, "NBS", exp[0],
                    "population / habitat / wealth (NBS INFORM indicators)", 4.0);
            exposurePts += exposureReason(reasons, exposureDetail, "NIDA", exp[1],
                    "people-at-risk / vulnerable groups proxy (NIDA registry feed not live — INFORM VG+Habitat)", 4.0);
            exposurePts += exposureReason(reasons, exposureDetail, "LATRA", exp[2],
                    "access & communications exposure (LATRA transport registry not live — INFORM Communication/Access)", 3.0);
            exposurePts += exposureReason(reasons, exposureDetail, "NAPA", exp[3],
                    "livelihoods / food security / poverty (NAPA agri-exposure via MoA + INFORM)", 4.0);
            exposurePts += exposureReason(reasons, exposureDetail, "IFMI", exp[4],
                    "financial dependency / income coping (IFMI via MoFP + NBS economic capacity)", 3.0);
            exposurePts = Math.min(18, exposurePts);
            scoreBreak.put("exposurePts", Math.round(exposurePts * 10) / 10.0);

            int multiPts = multiHaz ? 8 : 0;
            if (multiHaz) {
                reasons.add("Additional non-hydromet hazard overlay on this district (+8)");
            }
            scoreBreak.put("multiHazardPts", multiPts);

            int opsPts = 0;
            if (openInc > 0) {
                opsPts += Math.min(8, openInc * 3);
                reasons.add(openInc + " open incident(s) already in area (+" + Math.min(8, openInc * 3) + ")");
            }
            if (ecCount == 0 && entityPts >= 25) {
                opsPts += 4;
                reasons.add("No registered evacuation centre capacity found (+4)");
            } else if (ecCap > 0) {
                reasons.add("Evacuation capacity ~" + ecCap + " people (" + ecCount + " centre(s))");
            }
            if (warehouseCount > 0) {
                reasons.add(warehouseCount + " warehouse(s) registered"
                        + (inventoryUnits > 0 ? "; stock units ~" + inventoryUnits : ""));
            } else if (entityPts >= 25) {
                opsPts += 2;
                reasons.add("No permanent warehouse registered for district (+2 ops stress)");
            }
            scoreBreak.put("opsPts", opsPts);
            scoreBreak.put("warehouseCount", warehouseCount);
            scoreBreak.put("inventoryUnits", inventoryUnits);

            double score = Math.min(100, entityPts + informPts + focusPts + exposurePts + multiPts + opsPts);
            String suggested = suggestFromScore(score);
            // Science floor: never suggest below entity hydromet tier
            suggested = higherLevel(entityLevel, suggested);
            if (!suggested.equals(entityLevel) && rank(suggested) > rank(entityLevel)) {
                reasons.add("Suggested upgrade vs entity tier due to INFORM / focused hazard / exposure (PMO must confirm)");
            } else if (suggested.equals(entityLevel)) {
                reasons.add("Suggested colour matches entity tier — multi-parameter context supports this level");
            }

            List<String> directives = suggestDirectives(districtFocus, entityLevel, suggested,
                    risk, hazard, vuln, coping, structuralHaz, eoSignal, exp, openInc, ecCap);

            Map<String, Object> row = new LinkedHashMap<>();
            row.put("district", name);
            row.put("entityLevel", entityLevel);
            row.put("entitySource", tierSources == null ? null : tierSources.get(name));
            row.put("suggestedLevel", suggested);
            row.put("supportScore", Math.round(score * 10) / 10.0);
            row.put("scoreBreakdown", scoreBreak);
            row.put("hazardFocus", districtFocus);
            row.put("hazardFocusComponent", componentName);
            row.put("informRisk", nanToNull(risk));
            row.put("informHazard", nanToNull(hazard));
            row.put("informVulnerability", nanToNull(vuln));
            row.put("informCoping", nanToNull(coping));
            row.put("focusedStructuralHazard", nanToNull(structuralHaz));
            row.put("focusedEoSignal", nanToNull(eoSignal));
            row.put("focusedEoStatus", signal == null ? null : signal.status());
            row.put("focusedEoReliability", signal == null ? null : signal.reliability());
            row.put("focusedEoCoveragePct", signal == null ? null : signal.coveragePct());
            // All natural hazard components for transparency / UI drill-down
            row.put("naturalHazardComponents", iv.naturalComponents());
            row.put("hazardSignals", iv.signalSummaries());
            row.put("exposure", exposureDetail);
            row.put("evacuationCentres", ecCount);
            row.put("evacuationCapacity", ecCap);
            row.put("openIncidents", openInc);
            row.put("warehouses", warehouseCount);
            row.put("inventoryUnits", inventoryUnits);
            row.put("physicalExposureSource", "DMIS registers (EC/warehouse/inventory/incidents) — not footprint∩population");
            row.put("multiHazard", multiHaz);
            row.put("reasons", reasons);
            row.put("suggestedDirectives", directives);
            row.put("formula",
                    "score = entityPts + min(34, H+V+C) + min(26, focusHaz+EO) + min(18, exposure) "
                            + "+ multi(8) + ops; tier = max(entityTier, scoreTier); "
                            + "entityPts: MAJOR=55, WARNING=35, ADVISORY=20; "
                            + "scoreTier: ≥70 red, ≥45 orange, ≥20 yellow");
            districts.add(row);
        }

        districts.sort((a, b) -> Double.compare(
                ((Number) b.get("supportScore")).doubleValue(),
                ((Number) a.get("supportScore")).doubleValue()));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("modelVersion", "impact-support-v2");
        out.put("automation", "deterministic-support-layers");
        out.put("ai", false);
        out.put("hazardFocus", focus);
        out.put("hazardFocusResolved", "auto".equals(focus) ? globalAutoFocus : focus);
        out.put("hazardFocusOptions", hazardFocusOptions());
        out.put("note",
                "Supports PMO painting of red/orange/yellow with full INFORM H·V·C, selectable hazard "
                        + "focus (e.g. Flood under heavy rainfall), operational EO signals, and institution "
                        + "exposure proxies (NBS/NIDA/LATRA/NAPA/IFMI). Does not change entity consolidation "
                        + "or bulletin publish. Suggested levels never undercut entity hydromet tiers. "
                        + "PMO click-paint remains authoritative.");
        out.put("legend", Map.of(
                "MAJOR_WARNING", "Red — major impact / major warning",
                "WARNING", "Orange — warning impact",
                "ADVISORY", "Yellow — advisory impact",
                "NONE", "No impact paint"));
        out.put("designCapture", designCapture());
        out.put("institutionExposureNote", institutionExposureNote());
        out.put("districts", districts);
        out.put("count", districts.size());
        return out;
    }

    /** Backward-compatible overload (auto hazard focus). */
    public Map<String, Object> support(Map<String, String> districtLevels,
                                      Map<String, String> tierSources,
                                      List<String> multiHazardDistricts) {
        return support(districtLevels, tierSources, multiHazardDistricts, "auto");
    }

    static Map<String, Object> designCapture() {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("title", "PMO-DMD Impact Analysis — multi-parameter decision support (v2)");
        d.put("purpose",
                "Help PMO paint red / orange / yellow more realistically using full INFORM dimensions, "
                        + "a hazard focus lens (Flood when rainfall is forecast, etc.), EO operational signals, "
                        + "and institution exposure proxies so colours and directives are risk-informed.");
        d.put("authority", "PMO click-paint and drawn shapes remain authoritative for the impact bulletin.");
        d.put("doesNotChange", List.of(
                "Entity agency bus submissions",
                "Highest-alert-wins consolidation per district/day",
                "Bulletin ingest / merge / publish path",
                "Entity narrative comments"));
        d.put("liveLayers", List.of(
                "Entity hydromet tier (science floor — never undercut)",
                "INFORM full dimensions: Hazard & Exposure (H), Vulnerability (V), Lack of Coping (C), composite risk",
                "Selectable hazard focus: Flood / Drought / Landslide / Storm / Earthquake / Coastal / overall / auto",
                "Strategic INFORM natural-hazard components + advanced EO hazard signals with reliability",
                "Institution exposure proxies: NBS, NIDA (proxy), LATRA (proxy), NAPA, IFMI/MoFP",
                "Multi-hazard overlays, open incidents, evacuation capacity"));
        d.put("formula",
                "score = entityPts + min(34, INFORM H+V+C) + min(26, focused structural + EO signal) "
                        + "+ min(18, institution exposure) + multiHazard(8) + ops; "
                        + "suggested = max(entityTier, scoreTier); "
                        + "entityPts: MAJOR=55, WARNING=35, ADVISORY=20; "
                        + "scoreTier: ≥70 red, ≥45 orange, ≥20 yellow");
        d.put("mapModes", List.of(
                "entity — hydromet fill from consolidation (default)",
                "support — suggested colours from this model",
                "inform-h — Hazard & Exposure dimension choropleth",
                "inform-v — Vulnerability dimension choropleth",
                "inform-c — Lack of Coping Capacity choropleth",
                "inform-risk — composite risk choropleth",
                "focus-hazard — selected natural-hazard component / EO signal"));
        d.put("workflow", List.of(
                "1. Entities push agency products to EOCC bus",
                "2. Consolidated day view loads highest-alert-wins tiers",
                "3. PMO picks hazard focus (or auto from product type, e.g. heavy rain → Flood)",
                "4. Impact-support loads H/V/C + focus hazard + exposures and suggests upgrades only",
                "5. PMO applies suggestions, reviews reasons/directives, click-paints, draws zones",
                "6. Generate Impact Bulletin → preview → publish (unchanged path)"));
        d.put("deferredHonestly", List.of(
                "Live NIDA identity-registry population-at-risk feed (currently INFORM vulnerable-groups proxy)",
                "Live LATRA road/fleet exposure registry (currently INFORM access/comms proxy)",
                "Live IFMI insurance micro-data (currently MoFP/NBS economic-capacity proxy)",
                "Satellite flood footprint / building exposure polygons (F114)",
                "AI free-text consolidation of entity issues (after factual layers only)"));
        d.put("rbac",
                "early_warning.view for overlay read; create/disseminate/approve for authoring and push. "
                        + "Controlled in System Settings → Roles & Permissions.");
        return d;
    }

    private static Map<String, Object> institutionExposureNote() {
        Map<String, Object> n = new LinkedHashMap<>();
        n.put("NBS", "National Bureau of Statistics — INFORM economic capacity + habitat (income, IWI, informal settlements, urban population).");
        n.put("NIDA", "National Identification Authority — intended people-at-risk / identity exposure. Live NIDA API not wired; proxy = INFORM Vulnerable Groups + Habitat.");
        n.put("LATRA", "Land Transport Regulatory Authority — intended road/fleet exposure. Live LATRA feed not wired; proxy = INFORM Communication + access/health infrastructure stress.");
        n.put("NAPA", "National Adaptation / agri-livelihood exposure — MoA food security + livelihoods + poverty + drought agri signals.");
        n.put("IFMI", "Inclusive finance / micro-insurance resilience — MoFP dependency + NBS economic capacity as coping/exposure proxy until IFMI feed lands.");
        return n;
    }

    private static List<Map<String, String>> hazardFocusOptions() {
        List<Map<String, String>> opts = new ArrayList<>();
        opts.add(Map.of("key", "auto", "label", "Auto (from entity product)",
                "hint", "Heavy rainfall / flood products → Flood focus; drought products → Drought; etc."));
        opts.add(Map.of("key", "flood", "label", "Flood",
                "hint", "Use when heavy rainfall, riverine or flash-flood risk is the impact concern"));
        opts.add(Map.of("key", "drought", "label", "Drought",
                "hint", "Dry spell, crop stress, food-security impact"));
        opts.add(Map.of("key", "landslide", "label", "Landslide",
                "hint", "Slope failure under rain or seismic trigger"));
        opts.add(Map.of("key", "storm", "label", "Storms & Cyclone",
                "hint", "Wind, tropical storm / cyclone track"));
        opts.add(Map.of("key", "earthquake", "label", "Earthquake",
                "hint", "Seismic hazard focus (GST)"));
        opts.add(Map.of("key", "coastal", "label", "Coastal hazards",
                "hint", "Storm surge, coastal inundation"));
        opts.add(Map.of("key", "overall", "label", "Overall INFORM only",
                "hint", "No single-hazard boost — H/V/C + exposure only"));
        return opts;
    }

    // ─── loaders ────────────────────────────────────────────────────────────────

    /**
     * Load full INFORM profiles (H/V/C + natural components + EO signals) only for districts that
     * appear on the entity impact map. Name→code match is a light SQL pass; risk/signals run only
     * for the matched handful of areas (not all 170+ districts).
     */
    private Map<String, InformProfile> loadInformProfilesFor(Set<String> districtNames) {
        Map<String, InformProfile> map = new LinkedHashMap<>();
        if (districtNames == null || districtNames.isEmpty()) {
            return map;
        }
        // space02 DBA-1.2: expand with geo_name_aliases so TMA/GADM/INFORM naming variants match
        Set<String> wanted = geoAliases.expandMatchKeys(districtNames);
        for (String n : districtNames) {
            if (n != null && !n.isBlank()) {
                wanted.add(normalizeName(n));
            }
        }
        // Direct INFORM codes from alias table when operators have linked them
        Map<String, String> informCodes = geoAliases.informCodesForNames(districtNames);
        for (Map.Entry<String, String> e : informCodes.entrySet()) {
            try {
                String code = e.getValue();
                RiskResult rr = informService.riskFor(code);
                List<HazardSignal> signals = informService.signalsFor(code);
                Map<String, Object> shell = new LinkedHashMap<>();
                shell.put("risk", rr.risk());
                shell.put("hazard", rr.hazard());
                shell.put("vulnerability", rr.vulnerability());
                shell.put("coping", rr.coping());
                InformProfile p = InformProfile.from(shell, rr, signals);
                putProfile(map, e.getKey(), p);
            } catch (Exception ignored) {
                // optional
            }
        }
        try {
            // Light name index from inform_area (council + district). Prefer district, then council.
            List<Map<String, Object>> areas = jdbc.queryForList("""
                    select code, name, level from public.inform_area
                    where level in ('district', 'council')
                    order by case when level = 'district' then 0 else 1 end, name
                    """);
            // code -> display name for matched areas only
            Map<String, String> matched = new LinkedHashMap<>();
            for (Map<String, Object> a : areas) {
                String name = String.valueOf(a.get("name"));
                String nk = normalizeName(name);
                String shortN = normalizeName(name.replaceAll(
                        "(?i)\\s+(district|municipal|municipality|town|urban|council|city|dc|tc|mc)$", ""));
                if (!wanted.contains(nk) && !wanted.contains(shortN)) {
                    continue;
                }
                String code = String.valueOf(a.get("code"));
                // first match wins (district before council due to order)
                matched.putIfAbsent(code, name);
            }
            for (Map.Entry<String, String> e : matched.entrySet()) {
                String code = e.getKey();
                String name = e.getValue();
                String areaNorm = normalizeName(name);
                try {
                    RiskResult rr = informService.riskFor(code);
                    List<HazardSignal> signals = informService.signalsFor(code);
                    Map<String, Object> shell = new LinkedHashMap<>();
                    shell.put("risk", rr.risk());
                    shell.put("hazard", rr.hazard());
                    shell.put("vulnerability", rr.vulnerability());
                    shell.put("coping", rr.coping());
                    InformProfile p = InformProfile.from(shell, rr, signals);
                    putProfile(map, name, p);
                    // Index under original entity district names that normalize-match this INFORM area
                    for (String orig : districtNames) {
                        if (orig == null || orig.isBlank()) {
                            continue;
                        }
                        String on = normalizeName(orig);
                        if (on.equals(areaNorm) || on.contains(areaNorm) || areaNorm.contains(on)) {
                            putProfile(map, orig, p);
                        }
                    }
                } catch (Exception ignored) {
                    // skip unresolvable area
                }
            }
        } catch (Exception ex) {
            // INFORM optional
        }
        return map;
    }

    private static void putProfile(Map<String, InformProfile> map, String name, InformProfile p) {
        String nk = normalizeName(name);
        if (!map.containsKey(nk) || p.betterThan(map.get(nk))) {
            map.put(nk, p);
        }
        String shortN = normalizeName(name.replaceAll(
                "(?i)\\s+(district|municipal|municipality|town|urban|council|city|dc|tc|mc)$", ""));
        if (!shortN.isEmpty() && !shortN.equals(nk)
                && (!map.containsKey(shortN) || p.betterThan(map.get(shortN)))) {
            map.put(shortN, p);
        }
    }

    /**
     * Institution exposure scores 0–10 from INFORM components.
     * Honest proxies where live NIDA/LATRA/IFMI feeds are not connected.
     * Order: NBS, NIDA, LATRA, NAPA, IFMI.
     */
    private static double[] exposureFromProfile(InformProfile p) {
        double nbs = meanFinite(p.component("Habitat"), p.component("Economic capacity"),
                p.component("Development & Poverty"));
        double nida = meanFinite(p.component("Children Health and Nutrition"),
                p.component("Displaced People"), p.component("Health Conditions"), p.component("Habitat"));
        double latra = meanFinite(p.component("Communication"), p.component("Access to health care"));
        double napa = meanFinite(p.component("Livelihoods"), p.component("Development & Poverty"),
                p.component("Drought"));
        double ifmi = meanFinite(p.component("Economic Dependency"), p.component("Economic capacity"));
        return new double[]{nbs, nida, latra, napa, ifmi};
    }

    /**
     * Per-district readiness: [ecCount, ecCapacityPeople, openIncidents, warehouseCount, inventoryUnits].
     * Live DMIS registers only — not footprint∩population.
     */
    private Map<String, int[]> loadReadinessByNormalizedName() {
        Map<String, int[]> map = new LinkedHashMap<>();
        try {
            for (Map<String, Object> r : jdbc.queryForList("""
                    select lower(trim(coalesce(district,''))) as d,
                           count(*)::int as n,
                           coalesce(sum(capacity_people),0)::int as cap
                    from public.evacuation_centers
                    where coalesce(district,'') <> ''
                      and lower(coalesce(status,'active')) not in ('inactive','closed','decommissioned')
                    group by 1
                    """)) {
                String d = String.valueOf(r.get("d"));
                map.put(normalizeName(d), new int[]{
                        ((Number) r.get("n")).intValue(),
                        ((Number) r.get("cap")).intValue(),
                        0, 0, 0
                });
            }
            for (Map<String, Object> r : jdbc.queryForList("""
                    select lower(trim(coalesce(district_name,''))) as d, count(*)::int as n
                    from public.incidents
                    where coalesce(is_simulation,false)=false
                      and lower(coalesce(status,'')) not in ('closed','resolved','cancelled','closed_rumor')
                      and coalesce(district_name,'') <> ''
                    group by 1
                    """)) {
                String d = normalizeName(String.valueOf(r.get("d")));
                int[] cur = map.getOrDefault(d, new int[]{0, 0, 0, 0, 0});
                cur[2] = ((Number) r.get("n")).intValue();
                map.put(d, cur);
            }
            // Permanent warehouses by district name (region/district FK)
            for (Map<String, Object> r : jdbc.queryForList("""
                    select lower(trim(coalesce(d.name, w.city_or_region, ''))) as d,
                           count(*)::int as n
                    from public.warehouses w
                    left join public.districts d on d.id = w.district_id
                    where lower(coalesce(w.operational_status,'')) not in ('closed','decommissioned')
                      and coalesce(d.name, w.city_or_region, '') <> ''
                    group by 1
                    """)) {
                String d = normalizeName(String.valueOf(r.get("d")));
                if (d.isBlank()) {
                    continue;
                }
                int[] cur = map.getOrDefault(d, new int[]{0, 0, 0, 0, 0});
                cur[3] = ((Number) r.get("n")).intValue();
                map.put(d, cur);
            }
            // Inventory units sitting in warehouses of each district
            for (Map<String, Object> r : jdbc.queryForList("""
                    select lower(trim(coalesce(d.name, w.city_or_region, ''))) as d,
                           coalesce(sum(ii.quantity),0)::int as units
                    from public.inventory_items ii
                    join public.warehouses w on w.id = ii.warehouse_id
                    left join public.districts d on d.id = w.district_id
                    where coalesce(d.name, w.city_or_region, '') <> ''
                    group by 1
                    """)) {
                String d = normalizeName(String.valueOf(r.get("d")));
                if (d.isBlank()) {
                    continue;
                }
                int[] cur = map.getOrDefault(d, new int[]{0, 0, 0, 0, 0});
                cur[4] = ((Number) r.get("units")).intValue();
                map.put(d, cur);
            }
        } catch (DataAccessException ignored) {
            // optional enrichment
        }
        return map;
    }

    // ─── scoring helpers ────────────────────────────────────────────────────────

    private static double exposureReason(List<String> reasons, Map<String, Object> detail,
                                         String institution, double score, String meaning, double maxPts) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("score", nanToNull(score));
        row.put("meaning", meaning);
        if (Double.isNaN(score)) {
            row.put("points", 0);
            row.put("available", false);
            detail.put(institution, row);
            return 0;
        }
        // Only contribute when exposure stress is material (≥4.0 on 0–10)
        double pts = score >= 4.0 ? Math.min(maxPts, (score - 3.0) * (maxPts / 5.0)) : 0;
        pts = Math.round(pts * 10) / 10.0;
        row.put("points", pts);
        row.put("available", true);
        detail.put(institution, row);
        if (pts > 0) {
            reasons.add(String.format(Locale.US, "%s exposure stress=%.1f — %s (+%.1f)",
                    institution, score, meaning, pts));
        } else {
            reasons.add(String.format(Locale.US, "%s exposure=%.1f (below material threshold)", institution, score));
        }
        return pts;
    }

    private static List<String> suggestDirectives(String focus, String entityLevel, String suggested,
                                                  double risk, double h, double v, double c,
                                                  double structuralHaz, double eoSignal,
                                                  double[] exp, int openInc, int ecCap) {
        List<String> d = new ArrayList<>();
        String tier = label(suggested);
        d.add("Impact colour justification: suggested " + tier
                + " from entity floor + INFORM H/V/C + focused " + focus + " hazard + institution exposures.");

        if ("flood".equals(focus) || (!Double.isNaN(structuralHaz) && structuralHaz >= 5 && "flood".equals(focus))) {
            d.add("Flood focus: pre-position boats/sandbags in low-lying wards; open evacuation centres near rivers and floodplains.");
            d.add("Issue public advisory on flash-flood risk after heavy rainfall; restrict river crossings.");
        }
        if ("drought".equals(focus)) {
            d.add("Drought focus: activate water-trucking / livestock watering points; monitor food-security with MoA extension.");
            d.add("Coordinate NAPA/MoA livelihoods support and IFMI-linked contingency cash where dependency is high.");
        }
        if ("storm".equals(focus)) {
            d.add("Storm focus: secure light structures; suspend maritime/small-craft operations; clear drainage before landfall.");
        }
        if ("landslide".equals(focus)) {
            d.add("Landslide focus: restrict steep-slope settlement movement; inspect roads/bridges with LATRA/works partners.");
        }
        if ("earthquake".equals(focus)) {
            d.add("Earthquake focus: GST aftershock monitoring; inspect critical infrastructure and schools/hospitals.");
        }
        if ("coastal".equals(focus)) {
            d.add("Coastal focus: evacuate exposed shoreline settlements; harbour masters to secure vessels.");
        }

        if (!Double.isNaN(v) && v >= 6.5) {
            d.add("High vulnerability (V=" + round1(v) + "): prioritise informal settlements and vulnerable groups (NBS/NIDA exposure).");
        }
        if (!Double.isNaN(c) && c >= 6.5) {
            d.add("Weak coping (C=" + round1(c) + "): surge EOCC support and external partner capacity into the district.");
        }
        if (!Double.isNaN(exp[3]) && exp[3] >= 6.0) {
            d.add("NAPA/livelihoods stress elevated — protect markets, seeds and food-relief corridors.");
        }
        if (!Double.isNaN(exp[2]) && exp[2] >= 6.0) {
            d.add("Access/comms stress (LATRA proxy) — prepare alternate routes and redundant alert channels (SMS/radio).");
        }
        if (openInc > 0) {
            d.add("Open incidents already running — fold new impact paint into existing response activations, do not duplicate EOCs.");
        }
        if (ecCap <= 0 && rank(suggested) >= 2) {
            d.add("No evacuation capacity on register — identify schools/faith buildings as temporary centres before colour is published.");
        }
        if (rank(suggested) >= 3) {
            d.add("Major (red) justification requires PMO confirmation of entity science + INFORM + exposure before public bulletin.");
        }
        return d;
    }

    private static String resolveGlobalAutoFocus(Map<String, String> tierSources,
                                                 Map<String, String> districtLevels) {
        if (tierSources == null || tierSources.isEmpty()) {
            return "flood"; // default hydromet rainy-season bias when unknown
        }
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String src : tierSources.values()) {
            String f = focusFromSource(src);
            if (f != null) {
                counts.merge(f, 1, Integer::sum);
            }
        }
        String best = "flood";
        int n = 0;
        for (Map.Entry<String, Integer> e : counts.entrySet()) {
            if (e.getValue() > n) {
                n = e.getValue();
                best = e.getKey();
            }
        }
        return best;
    }

    private static String resolveDistrictAutoFocus(String entitySource, String globalAuto) {
        String f = focusFromSource(entitySource);
        return f != null ? f : (globalAuto == null ? "flood" : globalAuto);
    }

    private static String focusFromSource(String source) {
        if (source == null || source.isBlank()) {
            return null;
        }
        String s = source.toLowerCase(Locale.ROOT);
        for (String[] pair : TYPE_TO_FOCUS) {
            if (s.matches(".*(" + pair[0] + ").*")) {
                return pair[1];
            }
        }
        // Agency hints: MoW often flood/hydro, TMA rain/flood, MoA drought, GST quake
        if (s.startsWith("mow") || s.contains("mow:")) {
            return "flood";
        }
        if (s.startsWith("moa") || s.contains("moa:")) {
            return "drought";
        }
        if (s.startsWith("gst") || s.contains("gst:")) {
            return "earthquake";
        }
        if (s.startsWith("tma") || s.contains("tma:")) {
            return "flood";
        }
        return null;
    }

    private static String normalizeFocus(String raw) {
        if (raw == null || raw.isBlank()) {
            return "auto";
        }
        String f = raw.trim().toLowerCase(Locale.ROOT).replace(' ', '_');
        if ("storms".equals(f) || "cyclone".equals(f) || "storms_cyclone".equals(f)) {
            return "storm";
        }
        if (HAZARD_FOCUSES.contains(f)) {
            return f;
        }
        // Never silently re-label garbage as auto → flood; FE must pick a real focus option.
        throw new BusinessRuleException(
                "Unknown hazardFocus '" + raw.trim() + "'. Use auto, flood, drought, landslide, storm, earthquake, coastal or overall.");
    }

    private static double meanFinite(double... xs) {
        double s = 0;
        int n = 0;
        for (double x : xs) {
            if (!Double.isNaN(x) && Double.isFinite(x)) {
                s += x;
                n++;
            }
        }
        return n == 0 ? Double.NaN : s / n;
    }

    private static String normalizeLevel(String lvl) {
        if (lvl == null || lvl.isBlank()) {
            return "ADVISORY";
        }
        String u = lvl.trim().toUpperCase(Locale.ROOT).replace(' ', '_');
        if (u.contains("MAJOR") || u.equals("EMERGENCY") || u.equals("RED")) {
            return "MAJOR_WARNING";
        }
        if (u.contains("WARN") || u.equals("ORANGE")) {
            return "WARNING";
        }
        if (u.equals("NONE") || u.equals("CLEAR")) {
            return "NONE";
        }
        return "ADVISORY";
    }

    private static int entityPoints(String level) {
        return switch (level) {
            case "MAJOR_WARNING" -> 55;
            case "WARNING" -> 35;
            case "ADVISORY" -> 20;
            default -> 0;
        };
    }

    private static String suggestFromScore(double score) {
        if (score >= 70) {
            return "MAJOR_WARNING";
        }
        if (score >= 45) {
            return "WARNING";
        }
        if (score >= 20) {
            return "ADVISORY";
        }
        return "NONE";
    }

    private static int rank(String level) {
        return switch (normalizeLevel(level)) {
            case "MAJOR_WARNING" -> 3;
            case "WARNING" -> 2;
            case "ADVISORY" -> 1;
            default -> 0;
        };
    }

    private static String higherLevel(String a, String b) {
        return rank(a) >= rank(b) ? normalizeLevel(a) : normalizeLevel(b);
    }

    private static String label(String level) {
        return normalizeLevel(level).replace('_', ' ');
    }

    static String normalizeName(String name) {
        if (name == null) {
            return "";
        }
        String s = name.toLowerCase(Locale.ROOT).trim();
        s = s.replaceAll("\\s+(district|municipal|municipality|town|urban|council|city|dc|tc|mc)$", "");
        s = s.replaceAll("[^a-z0-9]+", " ").trim();
        return s;
    }

    private static double num(Object o) {
        if (o == null) {
            return Double.NaN;
        }
        if (o instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return Double.parseDouble(o.toString());
        } catch (NumberFormatException e) {
            return Double.NaN;
        }
    }

    private static Object nanToNull(double v) {
        return Double.isNaN(v) ? null : Math.round(v * 10) / 10.0;
    }

    private static double round1(double v) {
        return Math.round(v * 10) / 10.0;
    }

    // ─── profile carrier ────────────────────────────────────────────────────────

    private static final Set<String> NATURAL = Set.of(
            "Flood", "Drought", "Landslide", "Storms & Cyclone", "Earthquake",
            "Coastal hazards", "Wildfire", "Volcano", "Environmental Degradation");

    private static final class InformProfile {
        final double risk;
        final double hazard;
        final double vulnerability;
        final double coping;
        final Map<String, Double> components;
        final Map<String, HazardSignal> signalsByComponent;

        InformProfile(double risk, double hazard, double vulnerability, double coping,
                      Map<String, Double> components, Map<String, HazardSignal> signals) {
            this.risk = risk;
            this.hazard = hazard;
            this.vulnerability = vulnerability;
            this.coping = coping;
            this.components = components == null ? Map.of() : components;
            this.signalsByComponent = signals == null ? Map.of() : signals;
        }

        static InformProfile empty() {
            return new InformProfile(Double.NaN, Double.NaN, Double.NaN, Double.NaN, Map.of(), Map.of());
        }

        static InformProfile from(Map<String, Object> riskRow, RiskResult rr, List<HazardSignal> signals) {
            double risk = num(riskRow.get("risk"));
            double h = num(riskRow.get("hazard"));
            double v = num(riskRow.get("vulnerability"));
            double c = num(riskRow.get("coping"));
            Map<String, Double> comps = new LinkedHashMap<>();
            if (rr != null && rr.component() != null) {
                comps.putAll(rr.component());
                if (rr.risk() != null) {
                    risk = rr.risk();
                }
                if (rr.hazard() != null) {
                    h = rr.hazard();
                }
                if (rr.vulnerability() != null) {
                    v = rr.vulnerability();
                }
                if (rr.coping() != null) {
                    c = rr.coping();
                }
            }
            Map<String, HazardSignal> sig = new LinkedHashMap<>();
            if (signals != null) {
                for (HazardSignal s : signals) {
                    sig.put(s.component(), s);
                }
            }
            return new InformProfile(risk, h, v, c, comps, sig);
        }

        double component(String name) {
            Double d = components.get(name);
            return d == null ? Double.NaN : d;
        }

        HazardSignal signal(String component) {
            return signalsByComponent.get(component);
        }

        Map<String, Object> naturalComponents() {
            Map<String, Object> out = new LinkedHashMap<>();
            for (String n : NATURAL) {
                Double d = components.get(n);
                if (d != null) {
                    out.put(n, Math.round(d * 10) / 10.0);
                }
            }
            return out;
        }

        List<Map<String, Object>> signalSummaries() {
            List<Map<String, Object>> out = new ArrayList<>();
            for (HazardSignal s : signalsByComponent.values()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("component", s.component());
                m.put("signal", s.signal());
                m.put("status", s.status());
                m.put("reliability", s.reliability());
                m.put("coveragePct", s.coveragePct());
                out.add(m);
            }
            out.sort((a, b) -> Double.compare(
                    ((Number) b.get("signal")).doubleValue(),
                    ((Number) a.get("signal")).doubleValue()));
            return out;
        }

        boolean betterThan(InformProfile other) {
            if (other == null) {
                return true;
            }
            double as = (Double.isNaN(risk) ? 0 : risk) + (Double.isNaN(vulnerability) ? 0 : vulnerability);
            double bs = (Double.isNaN(other.risk) ? 0 : other.risk)
                    + (Double.isNaN(other.vulnerability) ? 0 : other.vulnerability);
            return as > bs || components.size() > other.components.size();
        }
    }
}
