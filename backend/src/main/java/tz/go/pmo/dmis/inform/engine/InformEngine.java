package tz.go.pmo.dmis.inform.engine;

import java.util.*;

/**
 * The INFORM engine — raw values → risk, EXACTLY as the Tanzania Country Model workbook:
 *   standardise (per spec) → component = WEIGHTED mean (weight 1 = normal SADC; advanced baskets weighted,
 *   blanks skipped) → category = arithmetic MEAN → dimension = scaled GEOMEAN → risk = ∛(H·V·C).
 *
 * Same engine serves Normal and Advanced: pass the merged spec (normal ∪ advanced sub-indicators). With no
 * advanced data the basket is empty and a component equals its normal indicator → SADC-faithful unchanged.
 */
public final class InformEngine {
    private InformEngine() {}

    /** INFORM scaled geometric mean (Excel Box 6): category scores → dimension. */
    public static double sgm(Collection<Double> a) {
        List<Double> xs = a.stream().filter(v -> v != null && Double.isFinite(v)).toList();
        if (xs.isEmpty()) return Double.NaN;
        double prod = 1;
        for (double x : xs) prod *= ((10 - x) / 10 * 9) + 1;
        double geo = Math.pow(prod, 1.0 / xs.size());
        return (10 - geo) / 9 * 10;
    }

    private static Double mean(Collection<Double> a) {
        List<Double> xs = a.stream().filter(v -> v != null && Double.isFinite(v)).toList();
        if (xs.isEmpty()) return null;
        double s = 0;
        for (double x : xs) s += x;
        return s / xs.size();
    }

    private static String kind(String dimensionLabel) {
        String l = dimensionLabel == null ? "" : dimensionLabel.toLowerCase();
        if (l.contains("hazard")) return "H";
        if (l.contains("vulner")) return "V";
        if (l.contains("coping")) return "C";
        return null;
    }

    /**
     * @param rawById   indicatorId → raw natural-unit value (the values present for this area)
     * @param specs     indicatorId → spec (normal, or normal ∪ advanced for the advanced model)
     * @param denomById indicatorId → denominator (only for denominator indicators); may be null
     */
    public static RiskResult computeFromRaw(Map<String, Double> rawById,
                                            Map<String, IndicatorSpec> specs,
                                            Map<String, Double> denomById) {
        // (5) standardise every USED indicator that has a value
        Map<String, Double> score = new LinkedHashMap<>();
        for (var e : specs.entrySet()) {
            IndicatorSpec s = e.getValue();
            if (!"Yes".equals(s.use()) || !rawById.containsKey(e.getKey())) continue;
            Double v = Standardiser.standardise(rawById.get(e.getKey()), s,
                    denomById == null ? null : denomById.get(e.getKey()));
            if (v != null) score.put(e.getKey(), v);
        }
        // (6) component = WEIGHTED mean of its standardised indicators (weight 1 = unweighted SADC)
        Map<String, List<double[]>> compVals = new LinkedHashMap<>();
        Map<String, String[]> compMeta = new LinkedHashMap<>();   // component → [category, dimension]
        for (var id : score.keySet()) {
            IndicatorSpec s = specs.get(id);
            double w = Double.isFinite(s.weight()) && s.weight() > 0 ? s.weight() : 1;
            compVals.computeIfAbsent(s.component(), k -> new ArrayList<>()).add(new double[]{score.get(id), w});
            compMeta.put(s.component(), new String[]{s.category(), s.dimension()});
        }
        Map<String, Double> component = new LinkedHashMap<>();
        for (var e : compVals.entrySet()) {
            double tw = 0, sum = 0;
            for (double[] vw : e.getValue()) { tw += vw[1]; sum += vw[0] * vw[1]; }
            component.put(e.getKey(), tw > 0 ? sum / tw : null);
        }
        // (7) category = arithmetic MEAN of its components
        Map<String, List<Double>> catVals = new LinkedHashMap<>();
        Map<String, String> catDim = new LinkedHashMap<>();
        for (var e : component.entrySet()) {
            String[] m = compMeta.get(e.getKey());
            catVals.computeIfAbsent(m[0], k -> new ArrayList<>()).add(e.getValue());
            catDim.put(m[0], m[1]);
        }
        Map<String, Double> category = new LinkedHashMap<>();
        for (var e : catVals.entrySet()) category.put(e.getKey(), mean(e.getValue()));
        // (8) dimension = scaled GEOMEAN of its categories
        Map<String, List<Double>> dimVals = new LinkedHashMap<>();
        for (var e : category.entrySet())
            dimVals.computeIfAbsent(catDim.get(e.getKey()), k -> new ArrayList<>()).add(e.getValue());
        Map<String, Double> dim = new LinkedHashMap<>();
        for (var e : dimVals.entrySet()) {
            String k = kind(e.getKey());
            if (k != null) { double g = sgm(e.getValue()); dim.put(k, Double.isNaN(g) ? null : Standardiser.round1(g)); }
        }
        // (9) risk = cube-root of the three dimensions
        Double h = dim.get("H"), v = dim.get("V"), c = dim.get("C");
        Double risk = (h != null && v != null && c != null)
                ? Standardiser.round1(Math.pow(h, 1.0 / 3) * Math.pow(v, 1.0 / 3) * Math.pow(c, 1.0 / 3))
                : null;
        return new RiskResult(score, component, category, h, v, c, risk);
    }
}
