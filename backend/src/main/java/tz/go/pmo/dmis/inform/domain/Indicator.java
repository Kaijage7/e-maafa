package tz.go.pmo.dmis.inform.domain;

import jakarta.persistence.*;
import tz.go.pmo.dmis.inform.engine.IndicatorSpec;

/**
 * The indicator REGISTRY row — the model is data-driven, so adding a parameter (normal or an advanced
 * basket member) is just an INSERT here, never a code change. {@code keyedAt} is the native resolution
 * (National / Adm1 / Adm2 / Council); values are stored at that level and resolved down to councils.
 */
@Entity
@Table(schema = "public", name = "inform_indicator")
public class Indicator {
    @Id
    public String id;
    public String dimension;
    public String category;
    public String component;
    public String owner;                 // owning institution acronym (TMA, NBS, MoW, …)
    @Column(name = "keyed_at")
    public String keyedAt;               // National | Adm1 | Adm2 | Council
    public String transform;             // None | Logarithm | Exponential
    @Column(name = "resolved_min")
    public Double resolvedMin;
    @Column(name = "resolved_max")
    public Double resolvedMax;
    public String sign;                  // Increase Risk | Decrease Risk
    public Double weight;
    @Column(name = "use_flag")
    public String use;
    public String tier;                  // normal | advanced
    public String denominator;
    public String outlier;
    @Column(name = "fence_lo")
    public Double fenceLo;
    @Column(name = "fence_hi")
    public Double fenceHi;
    public String name;

    public Indicator() {}

    /** Adapt the persisted registry row to the pure-engine spec. */
    public IndicatorSpec toSpec() {
        return new IndicatorSpec(id, dimension, category, component, owner, keyedAt,
                transform == null ? "None" : transform,
                resolvedMin == null ? Double.NaN : resolvedMin,
                resolvedMax == null ? Double.NaN : resolvedMax,
                sign, weight == null ? 1 : weight,
                use == null ? "Yes" : use,
                tier == null ? "normal" : tier,
                denominator == null ? "None" : denominator,
                outlier == null ? "No" : outlier,
                fenceLo, fenceHi);
    }
}
