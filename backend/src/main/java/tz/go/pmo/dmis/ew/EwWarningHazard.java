package tz.go.pmo.dmis.ew;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

/** Read-only view of the existing {@code warning_hazards} table (level/likelihood/validity/area live here). */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "warning_hazards")
public class EwWarningHazard {
    @Id
    private Long id;
    @Column(name = "warning_id")
    private Long warningId;
    @Column(name = "hazard_id")
    private Long hazardId;
    @Column(name = "likelihood_of_occurrence")
    private String likelihood;
    @Column(name = "warning_level")
    private String warningLevel;
    @Column(name = "validity_start")
    private Instant validityStart;
    @Column(name = "validity_end")
    private Instant validityEnd;
    @Column(name = "region_id")
    private Long regionId;
    @Column(name = "district_id")
    private Long districtId;
    @Column(name = "deleted_at")
    private Instant deletedAt;
}
