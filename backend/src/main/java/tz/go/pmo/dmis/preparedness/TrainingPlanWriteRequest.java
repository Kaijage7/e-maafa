package tz.go.pmo.dmis.preparedness;

import java.util.List;

/** Payload for creating a training plan. */
public record TrainingPlanWriteRequest(
        String title,
        String institution,
        String objective,
        List<String> scope,
        List<String> audience,
        String venue,
        String startDate,
        String endDate,
        String sourceOfFund,
        String status) {
}
