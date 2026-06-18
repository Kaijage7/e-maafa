package tz.go.pmo.dmis.mitigation;

import java.util.List;

/**
 * Payload for the Hazard Management index screen: paginated registry rows + the four stat-card values
 * + the two chart datasets, mirroring what HazardController@index hands the Blade view.
 */
public record HazardIndexResponse(List<HazardRow> hazards, Pagination pagination, Stats stats,
                                  List<CategoryDatum> hazardsByCategory,
                                  List<SeverityFrequencyDatum> hazardsBySeverity) {

    public record Stats(long total, long natural, long humanInduced, long active) {
    }

    /** Laravel paginator fields the view renders ("Showing X to Y of Z" + page links). */
    public record Pagination(int currentPage, int lastPage, long total, int firstItem, int lastItem) {
    }

    public record HazardRow(Long id, String name, String type, String category, String severity,
                            String frequency, String seasonalPattern, boolean isActive) {
    }

    public record CategoryDatum(String category, long total) {
    }

    public record SeverityFrequencyDatum(String severity, String frequency, long total) {
    }
}
