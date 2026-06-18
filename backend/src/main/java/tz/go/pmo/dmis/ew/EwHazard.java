package tz.go.pmo.dmis.ew;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

/** Read-only view of the existing {@code hazards} reference table. */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "hazards")
public class EwHazard {
    @Id
    private Long id;
    private String name;
    private String type;
}
