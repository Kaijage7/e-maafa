package tz.go.pmo.dmis.preparedness;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.OffsetDateTime;
import lombok.Getter;
import org.hibernate.annotations.Immutable;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/** Read-only view of the existing {@code alert_subscriptions} table (Preparedness). */
@Getter
@Entity
@Immutable
@Table(schema = "public", name = "alert_subscriptions")
public class AlertSubscription {
    @Id
    private Long id;
    @Column(name = "subscription_id")
    private String subscriptionId;
    @Column(name = "full_name")
    private String fullName;
    @Column(name = "subscriber_location")
    private String subscriberLocation;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "communication_channels")
    private String communicationChannels;
    @Column(name = "phone_number")
    private String phoneNumber;
    private String email;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "hazards_of_interest")
    private String hazardsOfInterest;
    @Column(name = "alert_level_priority")
    private String alertLevelPriority;
    @JdbcTypeCode(SqlTypes.JSON)
    private String languages;
    private Boolean consent;
    @Column(name = "is_active")
    private Boolean isActive;
    @Column(name = "subscribed_at")
    private OffsetDateTime subscribedAt;
}
