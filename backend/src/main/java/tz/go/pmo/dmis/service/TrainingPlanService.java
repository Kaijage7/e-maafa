package tz.go.pmo.dmis.service;

import java.util.Map;
import tz.go.pmo.dmis.dto.request.TrainingPlanWriteRequest;
import tz.go.pmo.dmis.dto.response.TrainingPlanResponse;

/** Training plan registry (Preparedness). */
public interface TrainingPlanService {

    TrainingPlanResponse index();

    Map<String, Object> create(TrainingPlanWriteRequest request);

    Map<String, Object> detail(long id);

    Map<String, Object> update(long id, TrainingPlanWriteRequest request);

    Map<String, Object> publish(long id);

    Map<String, Object> pushPriority(long id, String priority);

    Map<String, Object> requestSupport(long id);
}
