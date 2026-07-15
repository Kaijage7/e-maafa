package tz.go.pmo.dmis.dto.response;

import java.util.List;

/** Typed, bounded read model for the first mobile/web GraphQL screen. */
public record MobileHomeResponse(
        String generatedAt,
        String syncCursor,
        String syncScopeKey,
        Viewer viewer,
        IncidentPage incidents,
        NotificationPage notifications) {

    public record Viewer(String id, String name, String email, List<String> roles, List<String> permissions) {
    }

    public record IncidentPage(List<Incident> items, int currentPage, int lastPage, int total) {
    }

    public record Incident(
            String id,
            String title,
            String status,
            String workflowStatus,
            String workflowStatusLabel,
            String severity,
            String hazardName,
            String districtName,
            String regionName,
            String locationDescription,
            String reportedAt,
            int allocationsCount,
            int tasksCount,
            boolean responseActive) {
    }

    public record NotificationPage(
            List<Notification> items,
            int unreadCount,
            String latestId,
            boolean hasMore,
            String nextBeforeId) {
    }

    public record Notification(
            String id,
            String type,
            String title,
            String message,
            String link,
            String entityType,
            String entityId,
            String severity,
            boolean read,
            String createdAt,
            String category,
            String categoryLabel,
            String categoryIcon) {
    }
}
