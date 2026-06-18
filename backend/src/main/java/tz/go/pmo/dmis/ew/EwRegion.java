package tz.go.pmo.dmis.ew;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

/** Read-only view of the existing {@code regions} reference table. */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "regions")
public class EwRegion {
    @Id
    private Long id;
    private String name;
    private String code;
    @Column(name = "region_code")
    private String regionCode;
}
