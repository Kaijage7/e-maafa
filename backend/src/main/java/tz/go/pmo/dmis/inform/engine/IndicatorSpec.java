package tz.go.pmo.dmis.inform.engine;

/**
 * The standardisation + aggregation spec for one indicator (or advanced sub-indicator),
 * exactly as the INFORM Tanzania Country Model workbook defines it. Pure data — no framework deps,
 * so the engine is unit-testable in isolation and reproduces the validated country-model arithmetic exactly.
 *
 * @param resolvedMin/Max the FROZEN reference range (workbook "Data range" or "Custom"), not recomputed.
 * @param sign  "Increase Risk" (higher raw = worse) or "Decrease Risk" (protective; inverted to 10-scaled).
 * @param weight component weighting (1 = normal unweighted INFORM; advanced baskets carry custom weights).
 * @param tier  "normal" (SADC indicator) or "advanced" (exploded EO sub-indicator).
 */
public record IndicatorSpec(
        String id,
        String dimension,
        String category,
        String component,
        String owner,
        String keyedAt,
        String transform,
        double resolvedMin,
        double resolvedMax,
        String sign,
        double weight,
        String use,
        String tier,
        String denominator,
        String outlier,
        Double fenceLo,
        Double fenceHi
) {
    /** Convenience for a plain normal indicator (no denominator/outlier). */
    public static IndicatorSpec normal(String id, String dimension, String category, String component,
                                       String owner, String keyedAt, String transform,
                                       double min, double max, String sign, double weight) {
        return new IndicatorSpec(id, dimension, category, component, owner, keyedAt, transform,
                min, max, sign, weight, "Yes", "normal", "None", "No", null, null);
    }
}
