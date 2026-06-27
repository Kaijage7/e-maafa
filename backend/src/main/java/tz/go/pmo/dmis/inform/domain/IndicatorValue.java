package tz.go.pmo.dmis.inform.domain;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * A keyed indicator value at its native resolution. The operator keys {@code rawValue} (natural unit); the
 * standardiser locks {@code value0to10}. History is append-only: a new submission supersedes the prior latest
 * (sets {@code isLatest=false}) and inserts itself as the new {@code isLatest=true} row.
 */
@Entity
@Table(schema = "public", name = "inform_indicator_value")
public class IndicatorValue {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;
    @Column(name = "indicator_id")
    public String indicatorId;
    @Column(name = "area_code")
    public String areaCode;
    public String level;                 // the resolution this value is keyed at
    @Column(name = "raw_value")
    public Double rawValue;              // natural unit (the operator keys this)
    @Column(name = "value_0_10")
    public Double value0to10;            // the locked standardiser output
    @Column(name = "submitted_by")
    public String submittedBy;
    public String owner;
    public String status;
    @Column(name = "is_latest")
    public Boolean isLatest;
    public Instant ts;
    @Column(name = "approved_by")
    public String approvedBy;            // the PMO approver (kept distinct from the keyer)
    @Column(name = "approved_at")
    public Instant approvedAt;
    @Version
    public Long version;                 // optimistic lock — guards the supersede-prior-latest step under concurrency

    public IndicatorValue() {}
}
