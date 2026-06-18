package tz.go.pmo.dmis.preparedness;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

/** Read-only view of the existing {@code resources} reference table. */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "resources")
public class Resource {
    @Id
    private Long id;
    private String name;
    private String category;
    private Integer lowStockThreshold;
}
