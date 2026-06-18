package tz.go.pmo.dmis.ew;

import java.util.List;

/** Payload for the Early Warning Systems index screen: the warning rows + the four stat-card values. */
public record EwIndexResponse(List<WarningRow> warnings, Stats stats) {

    public record Stats(long total, long active, long pending, long approvedToday) {
    }

    public record WarningRow(Long id, String warningCode, String status, String created, boolean onMap, List<HazardRow> hazards) {
    }

    public record HazardRow(String name, String level, String likelihood, String region,
                            String validityStart, String validityEnd) {
    }
}
