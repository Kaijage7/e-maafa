package tz.go.pmo.dmis.preparedness;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

interface AlertSubscriptionRepository extends JpaRepository<AlertSubscription, Long> {
    List<AlertSubscription> findAllByOrderBySubscribedAtDesc();
}
