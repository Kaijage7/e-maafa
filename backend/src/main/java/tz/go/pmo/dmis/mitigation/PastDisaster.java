package tz.go.pmo.dmis.mitigation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;

/** The existing {@code past_disasters} table (shared Postgres) — the Disaster Repository record. */
@Getter
@Setter
@Entity
@Table(schema = "public", name = "past_disasters")
public class PastDisaster {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "event_name")
    private String eventName;
    @Column(name = "event_date")
    private LocalDate eventDate;
    @Column(name = "location_description")
    private String locationDescription;
    private BigDecimal latitude;
    private BigDecimal longitude;
    @Column(name = "hazard_id")
    private Long hazardId;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "hazard_id", insertable = false, updatable = false)
    private MitHazard hazard;
    @Column(name = "description_of_event")
    private String descriptionOfEvent;
    @Column(name = "impact_description")
    private String impactDescription;
    @Column(name = "lessons_learned")
    private String lessonsLearned;
    @Column(name = "source_of_information")
    private String sourceOfInformation;
    @Column(name = "report_document_path")
    private String reportDocumentPath;
    @Column(name = "created_at")
    private Instant createdAt;
    @Column(name = "updated_at")
    private Instant updatedAt;
}
