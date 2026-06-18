package tz.go.pmo.dmis.preparedness;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

/** Read-only view of the existing {@code warehouses} table. */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "warehouses")
public class Warehouse {
    @Id
    private Long id;
    private String name;
    private String zone;
    @Column(name = "location_address")
    private String locationAddress;
    @Column(name = "city_or_region")
    private String cityOrRegion;
    private BigDecimal latitude;
    private BigDecimal longitude;
    @Column(name = "storage_capacity_sqm")
    private BigDecimal storageCapacitySqm;
    @Column(name = "contact_person_name")
    private String contactPersonName;
    @Column(name = "contact_person_phone")
    private String contactPersonPhone;
    @Column(name = "operational_status")
    private String operationalStatus;
    @Column(name = "region_id")
    private Long regionId;
    @Column(name = "district_id")
    private Long districtId;
}
