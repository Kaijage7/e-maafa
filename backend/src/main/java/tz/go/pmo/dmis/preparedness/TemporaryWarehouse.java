package tz.go.pmo.dmis.preparedness;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.LocalDate;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

/** Read-only view of the existing {@code temporary_warehouses} table (Preparedness). */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "temporary_warehouses")
public class TemporaryWarehouse {
    @Id
    private Long id;
    private String name;
    private String code;
    private String level;
    @Column(name = "region_id")
    private Long regionId;
    @Column(name = "district_id")
    private Long districtId;
    @Column(name = "council_id")
    private Long councilId;
    @Column(name = "location_description")
    private String locationDescription;
    private BigDecimal latitude;
    private BigDecimal longitude;
    @Column(name = "contact_person_name")
    private String contactPersonName;
    @Column(name = "contact_person_phone")
    private String contactPersonPhone;
    @Column(name = "operational_status")
    private String operationalStatus;
    @Column(name = "is_active")
    private Boolean isActive;
    @Column(name = "established_date")
    private LocalDate establishedDate;
}
