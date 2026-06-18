package tz.go.pmo.dmis.preparedness;

import java.util.List;

/** Payload for the Training Plans index: rows + four stat-card values. */
public record TrainingPlanResponse(List<Row> plans, Stats stats) {

    public record Stats(long total, long planned, long ongoing, long completed) {
    }

    public record Row(Long id, String trainingId, String title, String institution, List<String> scope,
                      List<String> audience, String venue, String period, String status,
                      boolean published, String drrPriority, boolean supportRequested, String sourceOfFund) {
    }
}
