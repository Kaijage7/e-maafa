package tz.go.pmo.dmis.mitigation;

import java.util.List;

/** Payloads for the Disaster Repository screens, mirroring what the Blade views receive. */
public final class PastDisasterResponses {

    private PastDisasterResponses() {
    }

    public record Index(List<Row> pastDisasters, Pagination pagination, Stats stats,
                        List<HazardOption> hazards, List<HazardTypeDatum> byHazardType,
                        List<YearDatum> byYear) {
    }

    public record Stats(long total, long last12Months, long withReports, long geoLocated) {
    }

    public record Pagination(int currentPage, int lastPage, long total, int firstItem, int lastItem) {
    }

    public record Row(Long id, String eventName, String eventDate, String locationDescription,
                      String hazardName, String reportDocumentPath) {
    }

    /** The index filter + form selects use the full hazard list ordered by name. */
    public record HazardOption(Long id, String name) {
    }

    public record HazardTypeDatum(String hazardName, long total) {
    }

    public record YearDatum(int year, long total) {
    }

    public record Detail(Long id, String eventName, String eventDate, String locationDescription,
                         Double latitude, Double longitude, Long hazardId, String hazardName,
                         String descriptionOfEvent, String impactDescription, String lessonsLearned,
                         String sourceOfInformation, String reportDocumentPath) {
    }
}
