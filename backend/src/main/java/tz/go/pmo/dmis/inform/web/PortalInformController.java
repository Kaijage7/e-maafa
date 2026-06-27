package tz.go.pmo.dmis.inform.web;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.inform.domain.Indicator;
import tz.go.pmo.dmis.inform.domain.InformService;
import tz.go.pmo.dmis.inform.domain.IndicatorRepository;

/**
 * PUBLIC, read-only INFORM endpoints for the citizen-facing portal. Mounted under {@code /v1/portal/**}
 * (already permit-all in {@link tz.go.pmo.dmis.common.security.SecurityPaths}) so no authentication and no
 * module guard apply — exactly like the other portal data. It only EXPOSES the validated strategic risk and
 * the EO hazard signals (no write, no registry edit, no pending queue), so the public view can never alter
 * the model. Numbers are the same engine output the authenticated section shows.
 */
@RestController
@RequestMapping("/v1/portal/inform")
public class PortalInformController {

    private final InformService service;
    private final IndicatorRepository indicators;

    public PortalInformController(InformService service, IndicatorRepository indicators) {
        this.service = service;
        this.indicators = indicators;
    }

    /**
     * Batch strategic INFORM risk for a whole level (default councils) — the public map + ranked table source.
     * Optional {@code metric} lens (risk | dim:hazard|vulnerability|coping | cat:&lt;name&gt; | comp:&lt;name&gt; | ind:&lt;id&gt;)
     * adds a {@code value} field per area so the choropleth + table can colour/rank by ANY indicator, not just risk.
     */
    @GetMapping("/risk")
    public List<Map<String, Object>> risk(@RequestParam(defaultValue = "council") String level,
                                          @RequestParam(required = false) String metric) {
        return service.riskByLevel(level, metric);
    }

    /** Batch operational EO hazard signals for a whole level — the public map's signals layer. */
    @GetMapping("/signals")
    public List<Map<String, Object>> signals(@RequestParam(defaultValue = "council") String level) {
        return service.signalsByLevel(level);
    }

    /**
     * Full INFORM profile for one area — the click-to-drill detail: the 3 dimensions plus every category,
     * component and per-indicator standardised score, so the public explorer can show the whole hierarchy.
     */
    @GetMapping("/risk/{areaCode}")
    public Map<String, Object> riskFor(@PathVariable String areaCode) {
        var r = service.riskFor(areaCode);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("area", areaCode);
        m.put("risk", r.risk());
        m.put("hazard", r.hazard());
        m.put("vulnerability", r.vulnerability());
        m.put("coping", r.coping());
        m.put("categories", r.category());   // category → 0–10
        m.put("components", r.component());   // component → 0–10
        m.put("scores", r.score());           // indicatorId → 0–10 (the leaves)
        return m;
    }

    /**
     * The INFORM indicator TREE: dimension → category → component → indicators (id/name/owner). Static structure
     * the explorer uses to drive the lens selector and label the drill panel. Built from the indicator registry.
     */
    @GetMapping("/structure")
    public List<Map<String, Object>> structure() {
        // dimension → category → component → indicators, insertion-ordered for a stable UI
        Map<String, Map<String, Map<String, List<Map<String, Object>>>>> tree = new LinkedHashMap<>();
        for (Indicator ind : indicators.findAll()) {
            if (ind.dimension == null || ind.category == null || ind.component == null) continue;
            tree.computeIfAbsent(ind.dimension, d -> new LinkedHashMap<>())
                .computeIfAbsent(ind.category, c -> new LinkedHashMap<>())
                .computeIfAbsent(ind.component, cp -> new ArrayList<>())
                .add(Map.of("id", ind.id,
                        "name", ind.name == null ? ind.id : ind.name,
                        "owner", ind.owner == null ? "" : ind.owner));
        }
        List<Map<String, Object>> dims = new ArrayList<>();
        for (var de : tree.entrySet()) {
            List<Map<String, Object>> cats = new ArrayList<>();
            for (var ce : de.getValue().entrySet()) {
                List<Map<String, Object>> comps = new ArrayList<>();
                for (var pe : ce.getValue().entrySet()) {
                    comps.add(Map.of("component", pe.getKey(), "indicators", pe.getValue()));
                }
                cats.add(Map.of("category", ce.getKey(), "components", comps));
            }
            dims.add(Map.of("dimension", de.getKey(), "key", dimKey(de.getKey()), "categories", cats));
        }
        return dims;
    }

    /** Map a data dimension label to the engine's dimension key (hazard/vulnerability/coping). */
    private static String dimKey(String dimension) {
        String d = dimension.toLowerCase();
        if (d.contains("hazard")) return "hazard";
        if (d.contains("vulnerab")) return "vulnerability";
        if (d.contains("coping")) return "coping";
        return dimension;
    }

    /** Lightweight stats for the public landing tiles (indicator count, etc.). */
    @GetMapping("/stats")
    public Map<String, Object> stats() {
        return Map.of("indicators", indicators.count(), "councils", 195, "regions", 31, "dimensions", 3);
    }
}
