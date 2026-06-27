package tz.go.pmo.dmis.inform.domain;

import java.util.List;

/**
 * One decomposed, reliability-flagged Tanzania-EO hazard signal for an area — the OPERATIONAL product,
 * deliberately kept OUT of the strategic INFORM composite (see research: INFORM Risk is structural/strategic;
 * dynamic hazard signals belong in a separate early-warning/anticipatory-action layer). This is NOT a risk
 * score that competes with the headline — it is a per-hazard EO signal plus how complete/reliable it is.
 *
 * @param component       the hazard component (Drought, Flood, Landslide, Storms & Cyclone, Earthquake, …)
 * @param signal          0–10 weighted mean of the EO members actually present (renormalised over present)
 * @param status          coarse band of {@code signal}: Low | Moderate | Elevated | High | Severe
 * @param coveragePct     present designed-weight ÷ total designed-weight, as a percentage (the reliability core)
 * @param membersPresent  how many designed EO sub-indicators have data here
 * @param membersDesigned how many the basket is designed to have
 * @param reliability     High (≥80%) | Moderate (≥50%) | Low (<50%) — the INFORM-style data-thinness flag
 * @param members         the present sub-indicators (id, name, 0–10 score, owning institution)
 */
public record HazardSignal(
        String component,
        double signal,
        String status,
        int coveragePct,
        int membersPresent,
        int membersDesigned,
        String reliability,
        List<Member> members) {

    public record Member(String id, String name, double score, String owner) {}
}
