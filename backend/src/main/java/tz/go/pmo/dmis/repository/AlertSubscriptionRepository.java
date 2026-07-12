package tz.go.pmo.dmis.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import tz.go.pmo.dmis.entity.AlertSubscription;

/** Data access for alert_subscriptions. */
public interface AlertSubscriptionRepository extends JpaRepository<AlertSubscription, Long> {
    List<AlertSubscription> findAllByOrderBySubscribedAtDesc();
}
