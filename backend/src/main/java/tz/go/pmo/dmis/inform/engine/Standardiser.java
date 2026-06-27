package tz.go.pmo.dmis.inform.engine;

/**
 * INFORM standardisation: a raw natural-unit value → its 0–10 score, EXACTLY as the workbook
 *. Pipeline:
 *   (2) denominator → (3) Tukey outlier cap → (4) transform (log/exp) → (5) frozen min-max + polarity → clamp → round1.
 */
public final class Standardiser {
    private Standardiser() {}

    /** Excel ROUND(x,1): half away from zero. Scores are clamped to [0,10] (non-negative) so this is half-up. */
    public static double round1(double x) {
        return Math.floor(x * 10 + 0.5) / 10.0;
    }

    /** @return the 0–10 score, or null for "no data" / not-computable (excluded from aggregation, never 0). */
    public static Double standardise(Double raw, IndicatorSpec s, Double denomValue) {
        if (raw == null || s == null) return null;
        double x = raw;
        if (!Double.isFinite(x)) return null;

        // (2) denominator (per-capita / per-area); "None" → /1
        if (s.denominator() != null && !"None".equals(s.denominator())) {
            if (denomValue == null || !Double.isFinite(denomValue) || denomValue == 0) return null;
            x = x / denomValue;
        }
        // (3) Tukey fence cap (only when outlier detection is on)
        if ("Yes".equals(s.outlier()) && s.fenceLo() != null && s.fenceHi() != null
                && Double.isFinite(s.fenceLo()) && Double.isFinite(s.fenceHi())) {
            x = Math.max(Math.min(x, s.fenceHi()), s.fenceLo());
        }
        // (4) transform
        if ("Logarithm".equals(s.transform())) x = Math.log(0.001 + x);
        else if ("Exponential".equals(s.transform())) x = Math.exp(x);

        // (5) min-max to 0–10 against the FROZEN reference, with Decrease-Risk inversion
        double mn = s.resolvedMin(), mx = s.resolvedMax();
        if (!Double.isFinite(mn) || !Double.isFinite(mx) || mx == mn) return null;
        double sc = 10 * (x - mn) / (mx - mn);
        if (s.sign() != null && s.sign().startsWith("Decrease")) sc = 10 - sc;
        sc = Math.max(0, Math.min(10, sc));
        return round1(sc);
    }
}
