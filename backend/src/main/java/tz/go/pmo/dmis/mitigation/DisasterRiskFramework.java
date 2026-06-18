package tz.go.pmo.dmis.mitigation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** The existing {@code disaster_risk_frameworks} table (shared Postgres). */
@Getter
@Setter
@Entity
@Table(schema = "public", name = "disaster_risk_frameworks")
public class DisasterRiskFramework {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "repository_entry_id")
    private String repositoryEntryId;
    @Column(name = "document_type")
    private String documentType;
    @Column(name = "document_type_other")
    private String documentTypeOther;
    @Column(name = "document_name")
    private String documentName;
    @Column(name = "year_of_approval")
    private Integer yearOfApproval;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "hazard_types")
    private String hazardTypes;
    @Column(name = "geographic_scope")
    private String geographicScope;
    @Column(name = "narrative_description")
    private String narrativeDescription;
    private String status;
    @Column(name = "sectors_covered")
    private String sectorsCovered;
    @Column(name = "key_stakeholders")
    private String keyStakeholders;
    @Column(name = "implementation_period_start")
    private LocalDate implementationPeriodStart;
    @Column(name = "implementation_period_end")
    private LocalDate implementationPeriodEnd;
    @Column(name = "attachment_path")
    private String attachmentPath;
    @Column(name = "external_link")
    private String externalLink;

    /** Document language: en | sw — Swahili editions are separate library entries. */
    @Column(name = "language")
    private String language;
    @Column(name = "related_documents")
    private String relatedDocuments;
    @Column(name = "created_by")
    private Long createdBy;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;
}
