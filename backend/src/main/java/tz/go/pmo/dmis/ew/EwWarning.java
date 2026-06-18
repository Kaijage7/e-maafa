package tz.go.pmo.dmis.ew;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import org.hibernate.annotations.Immutable;

/** Read-only view of the existing {@code warnings} table. The platform reads warnings, never writes them. */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "warnings")
public class EwWarning {
    @Id
    private Long id;
    @Column(name = "warning_code")
    private String warningCode;
    private String status;
    @Column(name = "is_approved")
    private boolean approved;
    @Column(name = "approved_at")
    private Instant approvedAt;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "deleted_at")
    private Instant deletedAt;
}
