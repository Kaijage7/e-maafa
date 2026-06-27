package tz.go.pmo.dmis.inform.domain;

import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.inform.engine.IndicatorSpec;
import tz.go.pmo.dmis.inform.engine.InformEngine;
import tz.go.pmo.dmis.inform.engine.RiskResult;
import tz.go.pmo.dmis.inform.engine.Standardiser;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * Write/compute service over the value store. {@link #submit} standardises a keyed raw value through the same
 * locked engine the workbook uses, and keeps the history append-only (supersede prior latest → insert new latest).
 * {@link #riskFor} runs the full INFORM hierarchy over an area's OWN latest values (no resolve-down yet).
 */
@Service
public class InformService {

    private final IndicatorRepository indicators;
    private final IndicatorValueRepository values;
    private final AreaRepository areas;
    private final JurisdictionScope jurisdiction;

    public InformService(IndicatorRepository indicators, IndicatorValueRepository values, AreaRepository areas,
                         JurisdictionScope jurisdiction) {
        this.indicators = indicators;
        this.values = values;
        this.areas = areas;
        this.jurisdiction = jurisdiction;
    }

    /**
     * Sector-ownership guard (same model as the EW agency-write check): an agency-bound officer (e.g. a TMA user,
     * {@code currentAgencyCode()} = "tma") may key ONLY indicators owned by their own sector; a non-agency
     * login (PMO/EOCC/admin, code null) may key any. Owner codes equal the agency acronyms (TMA, MoA, GST…).
     */
    private void assertSectorWrite(String owner) {
        String mine = jurisdiction.currentAgencyCode();
        if (mine != null && owner != null && !mine.equalsIgnoreCase(owner)) {
            throw new AccessDeniedException(
                    "Your sector (" + mine.toUpperCase() + ") may not key values for " + owner + " indicators.");
        }
    }

    /** Raw-value entry (actual value → standardised). Backward-compatible overload. */
    @Transactional
    public IndicatorValue submit(String indicatorId, String areaCode, Double raw, String by) {
        return submit(indicatorId, areaCode, raw, null, by);
    }

    /**
     * Key a value for one indicator at one area. Two modes:
     *  • value0to10 == null → ACTUAL value: standardise {@code raw} via the indicator's spec (raw → 0-10).
     *  • value0to10 != null → DIRECT SCORE: a pre-standardised 0-10 score is keyed directly (clamped to [0,10]),
     *                          no standardiser — for the "Enter scores (0-10)" and "Paste 0-10" entry modes.
     * Supersede the prior latest for that (indicator, area) on approval; insert as PENDING. Owner/level from the indicator.
     */
    @Transactional
    public IndicatorValue submit(String indicatorId, String areaCode, Double raw, Double value0to10, String by) {
        Indicator indicator = indicators.findById(indicatorId)
                .orElseThrow(() -> new NoSuchElementException("unknown indicator: " + indicatorId));
        assertSectorWrite(indicator.owner);   // sector officer may key only their own sector's indicators
        Double scored;
        Double rawVal;
        if (value0to10 != null) {
            scored = Math.max(0.0, Math.min(10.0, value0to10));   // direct 0-10 entry, clamped to the scale
            rawVal = null;
        } else {
            scored = Standardiser.standardise(raw, indicator.toSpec(), null);
            rawVal = raw;
        }

        // GOVERNANCE: a keyed value enters as PENDING (isLatest=false) — it does NOT touch the authoritative
        // approved value the composite/signals use until a PMO approver signs off (see approve()).
        IndicatorValue v = new IndicatorValue();
        v.indicatorId = indicatorId;
        v.areaCode = areaCode;
        v.level = indicator.keyedAt;
        v.rawValue = rawVal;
        v.value0to10 = scored;
        v.submittedBy = by;
        v.owner = indicator.owner;
        v.status = "pending";
        v.isLatest = false;
        v.ts = Instant.now();
        return values.save(v);
    }

    /** The PMO approval queue (pending submissions, newest first), optionally scoped to one sector/owner. */
    @Transactional(readOnly = true)
    public List<PendingValue> pendingQueue(String owner) {
        List<IndicatorValue> rows = (owner == null || owner.isBlank())
                ? values.findByStatusOrderByTsDesc("pending")
                : values.findByStatusAndOwnerOrderByTsDesc("pending", owner);
        List<PendingValue> out = new ArrayList<>();
        for (IndicatorValue v : rows) {
            Indicator ind = indicators.findById(v.indicatorId).orElse(null);
            Area area = areas.findById(v.areaCode).orElse(null);
            out.add(new PendingValue(v.id, v.indicatorId,
                    ind == null ? v.indicatorId : ind.name, ind == null ? null : ind.component, v.owner,
                    v.areaCode, area == null ? v.areaCode : area.name,
                    v.rawValue, v.value0to10, v.submittedBy, v.ts == null ? null : v.ts.toString()));
        }
        return out;
    }

    /**
     * PMO approves a pending submission: it becomes the authoritative value (approved + isLatest), superseding
     * the prior approved-latest for that (indicator, area). Only after this does it feed the composite/signals.
     */
    @Transactional
    public IndicatorValue approve(Long valueId, String by) {
        IndicatorValue v = values.findById(valueId)
                .orElseThrow(() -> new NoSuchElementException("unknown value: " + valueId));
        if (!"pending".equals(v.status)) throw new IllegalStateException("value is not pending: " + valueId);
        for (IndicatorValue prior : values.findByIndicatorIdAndAreaCodeAndIsLatestTrue(v.indicatorId, v.areaCode)) {
            prior.isLatest = false;
            values.save(prior);
        }
        // Demote the prior latest in the DB BEFORE promoting the new row: the partial unique index
        // ux_inform_value_latest (indicator_id, area_code) WHERE is_latest forbids two latest rows, and
        // without this flush Hibernate may write the new is_latest=true before the old is_latest=false.
        values.flush();
        v.status = "approved";
        v.isLatest = true;
        v.approvedBy = (by == null || by.isBlank()) ? null : by;   // distinct audit field, not concatenated onto the keyer
        v.approvedAt = Instant.now();
        return values.save(v);
    }

    /** PMO rejects a pending submission: it is archived (rejected, never latest) and never touches compute. */
    @Transactional
    public IndicatorValue reject(Long valueId, String by) {
        IndicatorValue v = values.findById(valueId)
                .orElseThrow(() -> new NoSuchElementException("unknown value: " + valueId));
        if (!"pending".equals(v.status)) throw new IllegalStateException("value is not pending: " + valueId);
        v.status = "rejected";
        v.isLatest = false;
        return values.save(v);
    }

    /** The area's latest keyed values (one row per indicator). */
    @Transactional(readOnly = true)
    public List<IndicatorValue> latestFor(String areaCode) {
        return values.findByAreaCodeAndIsLatestTrue(areaCode);
    }

    /**
     * The STRATEGIC INFORM risk: the validated INFORM country-model composite, with RESOLVE-DOWN.
     * Values live at native resolution (National / Adm1 / Adm2 / Council), so an area pulls National
     * + its region's Adm1 + its district's Adm2. Uses NORMAL-tier indicators ONLY — the Tanzania-EO
     * (advanced tier) is deliberately kept OUT of this headline number and surfaced via {@link #signalsFor}
     * instead. (Research-backed: a thin/different-construct EO basket must not silently replace a validated
     * proxy, and structural risk is the wrong product to carry fast operational hazard signals.)
     */
    @Transactional(readOnly = true)
    public RiskResult riskFor(String areaCode) {
        Resolved r = resolve(areaCode);
        Map<String, Double> rawById = new LinkedHashMap<>();
        Map<String, IndicatorSpec> specs = new LinkedHashMap<>();
        for (Indicator ind : r.ind.values()) {
            if (!"normal".equals(ind.tier)) continue;             // strategic composite = SADC baseline only
            rawById.put(ind.id, r.raw.get(ind.id));
            specs.put(ind.id, ind.toSpec());
        }
        return InformEngine.computeFromRaw(rawById, specs, null);
    }

    /**
     * The OPERATIONAL product: decomposed, reliability-flagged Tanzania-EO hazard signals for an area.
     * One {@link HazardSignal} per natural-hazard component that has any EO data here (resolve-down), each
     * carrying its 0–10 EO signal, a coarse status band, and — critically — how COMPLETE the basket is
     * (coverage % of designed weight + a High/Moderate/Low reliability flag), so thin baskets inform
     * transparently without ever masquerading as the validated headline risk.
     */
    @Transactional(readOnly = true)
    public List<HazardSignal> signalsFor(String areaCode) {
        // designed totals per component across the full advanced registry (present + pending members)
        Map<String, Double> designedWeight = new LinkedHashMap<>();
        Map<String, Integer> designedCount = new LinkedHashMap<>();
        for (Indicator ind : indicators.findByTier("advanced")) {
            designedWeight.merge(ind.component, ind.weight == null ? 0 : ind.weight, Double::sum);
            designedCount.merge(ind.component, 1, Integer::sum);
        }

        // present EO members for this area (resolve-down), grouped by component
        Resolved r = resolve(areaCode);
        Map<String, List<Indicator>> byComponent = new LinkedHashMap<>();
        for (Indicator ind : r.ind.values()) {
            if (!"advanced".equals(ind.tier) || r.score.get(ind.id) == null) continue;
            byComponent.computeIfAbsent(ind.component, k -> new ArrayList<>()).add(ind);
        }

        List<HazardSignal> out = new ArrayList<>();
        for (var e : byComponent.entrySet()) {
            String component = e.getKey();
            double presentWeight = 0, weightedScore = 0;
            int present = 0;
            List<HazardSignal.Member> members = new ArrayList<>();
            for (Indicator ind : e.getValue()) {
                double w = ind.weight == null ? 0 : ind.weight;
                double score = r.score.get(ind.id);
                presentWeight += w; weightedScore += w * score; present++;
                members.add(new HazardSignal.Member(ind.id, ind.name, round1(score), ind.owner));
            }
            if (present == 0 || presentWeight == 0) continue;
            double signal = round1(weightedScore / presentWeight);
            double designed = designedWeight.getOrDefault(component, presentWeight);
            int coverage = designed <= 0 ? 100 : (int) Math.round(presentWeight / designed * 100);
            members.sort((a, b) -> Double.compare(b.score(), a.score()));
            out.add(new HazardSignal(component, signal, statusBand(signal), coverage, present,
                    designedCount.getOrDefault(component, present), reliabilityFlag(coverage), members));
        }
        out.sort((a, b) -> Double.compare(b.signal(), a.signal()));   // strongest signal first
        return out;
    }

    /** Batch strategic risk for every area at a level (e.g. all 195 councils) in ONE call — replaces the map's N+1. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> riskByLevel(String level) {
        return riskByLevel(level, null);
    }

    /** Batch strategic risk for every area at a level; when {@code metric} is set (dim:/cat:/comp:/ind:),
     *  each row also carries {@code value} = that lens's 0–10 score, so the map + ranked table can colour by ANY lens. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> riskByLevel(String level, String metric) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Area a : areas.findByLevel(level)) {
            RiskResult r = riskFor(a.code);
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("area", a.code);
            m.put("name", a.name);
            m.put("risk", r.risk());
            m.put("hazard", r.hazard());                 // dimension H — lets the map colour by dimension
            m.put("vulnerability", r.vulnerability());   // dimension V
            m.put("coping", r.coping());                 // dimension C (Lack of Coping Capacity)
            m.put("value", metricValue(r, metric));      // the active-lens value (defaults to overall risk)
            out.add(m);
        }
        return out;
    }

    /** Resolve a lens key (risk | dim:hazard|vulnerability|coping | cat:&lt;name&gt; | comp:&lt;name&gt; | ind:&lt;id&gt;) to its 0–10 score. */
    private Double metricValue(RiskResult r, String metric) {
        if (metric == null || metric.isBlank() || "risk".equals(metric)) return r.risk();
        int i = metric.indexOf(':');
        if (i < 0) return r.risk();
        String kind = metric.substring(0, i), key = metric.substring(i + 1);
        return switch (kind) {
            case "dim" -> switch (key) {
                case "hazard" -> r.hazard();
                case "vulnerability" -> r.vulnerability();
                case "coping" -> r.coping();
                default -> r.risk();
            };
            case "cat" -> r.category().get(key);
            case "comp" -> r.component().get(key);
            case "ind" -> r.score().get(key);
            default -> r.risk();
        };
    }

    /** Batch operational signals for every area at a level — one call for the whole hazard-signal map layer. */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> signalsByLevel(String level) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (Area a : areas.findByLevel(level)) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("area", a.code);
            m.put("name", a.name);
            m.put("signals", signalsFor(a.code));
            out.add(m);
        }
        return out;
    }

    // --- resolve-down: an area's latest values across National + its Adm1 + its Adm2 + its own code ---
    private record Resolved(Map<String, Indicator> ind, Map<String, Double> raw, Map<String, Double> score) {}

    private Resolved resolve(String areaCode) {
        if (!areas.existsById(areaCode)) throw new NoSuchElementException("unknown area: " + areaCode);
        String districtCode = null, regionCode = null;
        Area cur = areas.findById(areaCode).orElse(null);
        Set<String> guard = new HashSet<>();
        while (cur != null && guard.add(cur.code)) {
            if ("district".equals(cur.level)) districtCode = cur.code;
            else if ("region".equals(cur.level)) regionCode = cur.code;
            cur = cur.parentCode == null ? null : areas.findById(cur.parentCode).orElse(null);
        }
        List<String> sources = new ArrayList<>();
        sources.add("TZA");
        if (regionCode != null) sources.add(regionCode);
        if (districtCode != null) sources.add(districtCode);
        sources.add(areaCode);

        Map<String, Indicator> indById = new LinkedHashMap<>();
        Map<String, Double> raw = new LinkedHashMap<>();
        Map<String, Double> score = new LinkedHashMap<>();
        for (String src : sources) {
            for (IndicatorValue v : values.findByAreaCodeAndIsLatestTrueAndStatus(src, "approved")) {
                indicators.findById(v.indicatorId).ifPresent(ind -> {
                    indById.put(ind.id, ind);
                    raw.put(ind.id, v.rawValue);
                    score.put(ind.id, v.value0to10);
                });
            }
        }
        return new Resolved(indById, raw, score);
    }

    private static double round1(double x) { return Math.round(x * 10.0) / 10.0; }

    private static String statusBand(double s) {
        if (s < 2) return "Low";
        if (s < 4) return "Moderate";
        if (s < 6) return "Elevated";
        if (s < 8) return "High";
        return "Severe";
    }

    private static String reliabilityFlag(int coveragePct) {
        if (coveragePct >= 80) return "High";
        if (coveragePct >= 50) return "Moderate";
        return "Low";
    }
}
