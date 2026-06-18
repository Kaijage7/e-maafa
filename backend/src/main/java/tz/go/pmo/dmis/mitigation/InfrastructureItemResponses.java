package tz.go.pmo.dmis.mitigation;

import java.util.List;
import java.util.Map;

/** Payloads for the Strategic Infrastructure screens, mirroring what the Blade views receive. */
public final class InfrastructureItemResponses {

    private InfrastructureItemResponses() {
    }

    public record Index(List<Row> infrastructureItems, Pagination pagination, Stats stats,
                        List<MapItem> mapItems, Map<String, List<String>> typeGroups,
                        List<String> statuses) {
    }

    public record Stats(long total, long operational, long maintenance, long atRisk) {
    }

    public record Pagination(int currentPage, int lastPage, long total, int firstItem, int lastItem) {
    }

    public record Row(Long id, String name, String type, String locationDescription, String address,
                      Integer capacity, String status) {
    }

    public record MapItem(Long id, String name, String type, double latitude, double longitude, String status) {
    }

    public record Detail(Long id, String name, String type, String locationDescription, String address,
                         Double latitude, Double longitude, Integer capacity, String contactPersonName,
                         String contactPersonPhone, String contactPersonEmail, String status,
                         String additionalInfo) {
    }
}
