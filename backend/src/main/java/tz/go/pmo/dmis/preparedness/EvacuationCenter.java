package tz.go.pmo.dmis.preparedness;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

/** Read-only view of the existing {@code evacuation_centers} table. */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "evacuation_centers")
public class EvacuationCenter {
    @Id
    private Long id;
    @Column(name = "ecentre_id")
    private String ecentreId;
    @Column(name = "centre_name")
    private String centreName;
    @Column(name = "centre_type")
    private String centreType;
    private String region;
    private String district;
    private String council;
    @Column(name = "capacity_people")
    private Integer capacityPeople;
    private String accessibility;
    private String status;
    private BigDecimal latitude;
    private BigDecimal longitude;
}
