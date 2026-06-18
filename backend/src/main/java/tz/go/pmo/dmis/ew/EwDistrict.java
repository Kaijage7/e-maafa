package tz.go.pmo.dmis.ew;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

/** Read-only view of the existing {@code districts} reference table. */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "districts")
public class EwDistrict {
    @Id
    private Long id;
    @Column(name = "region_id")
    private Long regionId;
    private String name;
    private String code;
}
