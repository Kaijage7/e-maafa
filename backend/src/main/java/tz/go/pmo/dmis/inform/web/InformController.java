package tz.go.pmo.dmis.inform.web;

import org.springframework.web.bind.annotation.*;
import tz.go.pmo.dmis.inform.domain.*;
import tz.go.pmo.dmis.inform.engine.RiskResult;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Read/write API for the INFORM model. Same /api/v1/... contract DMIS uses, so it folds in cleanly. */
@RestController
@RequestMapping("/v1/inform")
@org.springframework.security.access.prepost.PreAuthorize("hasAuthority('prevention_and_mitigation.view')")
public class InformController {

    private final IndicatorRepository indicators;
    private final AreaRepository areas;
    private final IndicatorValueRepository values;
    private final InformService service;

    public InformController(IndicatorRepository indicators, AreaRepository areas,
                            IndicatorValueRepository values, InformService service) {
        this.indicators = indicators;
        this.areas = areas;
        this.values = values;
        this.service = service;
    }

    /** The indicator registry. {@code ?owner=tma} scopes to a ministry's own indicators (the data-entry grid). */
    @GetMapping("/indicators")
    public List<Indicator> indicators(@RequestParam(required = false) String owner,
                                      @RequestParam(required = false) String tier) {
        if (owner != null && !owner.isBlank()) return indicators.findByOwnerIgnoreCase(owner);
        if (tier != null && !tier.isBlank()) return indicators.findByTier(tier);
        return indicators.findAll();
    }

    /** The area registry. {@code ?level=council} scopes to one administrative tier. */
    @GetMapping("/areas")
    public List<Area> areas(@RequestParam(required = false) String level) {
        if (level != null && !level.isBlank()) return areas.findByLevel(level);
        return areas.findAll();
    }

    /** Key a raw value for one indicator at one area → standardised, append-only latest row. */
    @org.springframework.security.access.prepost.PreAuthorize("hasAuthority('risk_index.create')")
    @PostMapping("/values")
    public IndicatorValue submit(@RequestBody Map<String, Object> body) {
        String indicatorId = str(body.get("indicatorId"));
        String areaCode = str(body.get("areaCode"));
        Double raw = num(body.get("raw"));
        Double value0to10 = num(body.get("value0to10"));   // direct 0-10 entry (scores / paste modes); null = raw mode
        String by = str(body.get("by"));
        return service.submit(indicatorId, areaCode, raw, value0to10, by);
    }

    /** The latest keyed values for an area (one row per indicator). */
    @GetMapping("/values")
    public List<IndicatorValue> values(@RequestParam String area) {
        return values.findByAreaCodeAndIsLatestTrue(area);
    }

    /** The PMO approval queue (pending submissions). {@code ?owner=tma} scopes to one sector. */
    @GetMapping("/pending")
    public List<PendingValue> pending(@RequestParam(required = false) String owner) {
        return service.pendingQueue(owner);
    }

    /** PMO approves a pending submission → it becomes the authoritative value feeding the composite/signals. */
    @org.springframework.security.access.prepost.PreAuthorize("hasAuthority('risk_index.approve')")
    @PostMapping("/values/{id}/approve")
    public IndicatorValue approve(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.approve(id, body == null ? null : str(body.get("by")));
    }

    /** PMO rejects a pending submission → archived, never feeds compute. */
    @org.springframework.security.access.prepost.PreAuthorize("hasAuthority('risk_index.approve')")
    @PostMapping("/values/{id}/reject")
    public IndicatorValue reject(@PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        return service.reject(id, body == null ? null : str(body.get("by")));
    }

    /** Batch strategic risk for a whole level (e.g. {@code ?level=council}) in one call — the map's data source. */
    @GetMapping("/risk")
    public List<Map<String, Object>> riskBatch(@RequestParam(defaultValue = "council") String level) {
        return service.riskByLevel(level);
    }

    /** Batch operational signals for a whole level — one call for the hazard-signal map layer. */
    @GetMapping("/signals")
    public List<Map<String, Object>> signalsBatch(@RequestParam(defaultValue = "council") String level) {
        return service.signalsByLevel(level);
    }

    /** The STRATEGIC INFORM risk: validated INFORM country-model composite (the prioritization headline). */
    @GetMapping("/risk/{areaCode}")
    public Map<String, Object> risk(@PathVariable String areaCode) {
        return riskMap(areaCode, "strategic", service.riskFor(areaCode));
    }

    /**
     * The OPERATIONAL product: decomposed, reliability-flagged Tanzania-EO hazard signals for an area —
     * deliberately separate from the strategic risk (not folded into the headline). One signal per hazard
     * component with EO data, each carrying its 0–10 signal, status band, and basket coverage/reliability.
     */
    @GetMapping("/signals/{areaCode}")
    public Map<String, Object> signals(@PathVariable String areaCode) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("area", areaCode);
        out.put("signals", service.signalsFor(areaCode));
        return out;
    }

    private static Map<String, Object> riskMap(String areaCode, String tier, RiskResult r) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("area", areaCode);
        out.put("tier", tier);
        out.put("hazard", r.hazard());
        out.put("vulnerability", r.vulnerability());
        out.put("coping", r.coping());
        out.put("risk", r.risk());
        out.put("components", r.component());
        out.put("categories", r.category());   // deep drill: category level (dimension → category → component → indicator)
        out.put("scores", r.score());          // deep drill: per-indicator standardised 0–10 leaves
        return out;
    }

    @GetMapping("/health")
    public Map<String, Object> health() {
        return Map.of("status", "ok", "service", "inform", "indicators", indicators.count());
    }

    private static String str(Object o) {
        return o == null ? null : o.toString();
    }

    private static Double num(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.doubleValue();
        String s = o.toString().trim();
        return s.isEmpty() ? null : Double.parseDouble(s);
    }
}
