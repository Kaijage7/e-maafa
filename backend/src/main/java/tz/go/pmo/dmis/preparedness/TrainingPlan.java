package tz.go.pmo.dmis.preparedness;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import lombok.Getter;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Read-only view of the existing {@code training_plans} table (Preparedness). */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "training_plans")
public class TrainingPlan {
    @Id
    private Long id;
    @Column(name = "training_id")
    private String trainingId;
    @Column(name = "training_title")
    private String trainingTitle;
    @Column(name = "implementing_institution")
    private String implementingInstitution;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "geographical_scope")
    private String geographicalScope;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "targeted_audience")
    private String targetedAudience;
    private String venue;
    @Column(name = "training_start_date")
    private LocalDate trainingStartDate;
    @Column(name = "training_end_date")
    private LocalDate trainingEndDate;
    @Column(name = "source_of_fund")
    private String sourceOfFund;
    private String status;

    // Golden-thread links (V82): published to News/Events, pushed to DRR priorities, support requested.
    @Column(name = "published_at")
    private OffsetDateTime publishedAt;
    @Column(name = "drr_priority")
    private String drrPriority;
    @Column(name = "support_requested_at")
    private OffsetDateTime supportRequestedAt;
}
