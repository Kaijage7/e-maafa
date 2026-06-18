package tz.go.pmo.dmis.mitigation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * The existing {@code hazards} table (shared Postgres), as the Hazard Management screen uses it.
 * Writable columns are exactly the ones the existing forms write (name/type/category/severity_scale/
 * description + is_active toggle); the JSON detail columns are read-only here — no existing v2 form
 * writes them, so the platform must not either.
 */
@Getter
@Setter
@Entity
@Table(schema = "public", name = "hazards")
public class MitHazard {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String name;
    private String type;
    private String description;
    @Column(name = "severity_scale")
    private String severityScale;
    private String category;
    private String severity;
    private String frequency;
    @Column(name = "typical_duration")
    private String typicalDuration;
    @Column(name = "seasonal_pattern")
    private String seasonalPattern;
    @Column(name = "is_active")
    private Boolean isActive;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "warning_signs", insertable = false, updatable = false)
    private String warningSigns;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "impact_areas", insertable = false, updatable = false)
    private String impactAreas;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response_required", insertable = false, updatable = false)
    private String responseRequired;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "prevention_measures", insertable = false, updatable = false)
    private String preventionMeasures;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "historical_incidents", insertable = false, updatable = false)
    private String historicalIncidents;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "affected_sectors", insertable = false, updatable = false)
    private String affectedSectors;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "vulnerability_factors", insertable = false, updatable = false)
    private String vulnerabilityFactors;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;
}
