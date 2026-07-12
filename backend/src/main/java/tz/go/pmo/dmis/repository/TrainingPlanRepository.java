package tz.go.pmo.dmis.repository;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import tz.go.pmo.dmis.entity.TrainingPlan;

/** Data access for training_plans. */
public interface TrainingPlanRepository extends JpaRepository<TrainingPlan, Long> {
    List<TrainingPlan> findAllByOrderByTrainingStartDateDesc();
}
