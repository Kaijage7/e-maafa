package tz.go.pmo.dmis.inform.engine;

import java.util.Map;

/** Full INFORM hierarchy result for one area: standardised scores → components → categories → dimensions → risk. */
public record RiskResult(
        Map<String, Double> score,       // indicatorId  → 0–10
        Map<String, Double> component,   // component    → 0–10
        Map<String, Double> category,    // category     → 0–10
        Double hazard,                   // dimension H
        Double vulnerability,            // dimension V
        Double coping,                   // dimension C (Lack of Coping Capacity)
        Double risk                      // ∛(H·V·C)
) {}
