package tz.go.pmo.dmis.dto.response;

import java.util.List;

/** Bounded GraphQL composite for one jurisdiction-visible incident workspace. */
public record IncidentWorkspaceResponse(
        String generatedAt,
        String syncCursor,
        String syncScopeKey,
        IncidentDetail incident,
        List<Task> tasks,
        List<Allocation> allocations,
        int updatesCount,
        int workflowHistoriesCount) {

    public record IncidentDetail(
            String id,
            String title,
            String status,
            String workflowStatus,
            String workflowStatusLabel,
            String severity,
            String hazardName,
            String incidentTypeName,
            String districtName,
            String regionName,
            String councilName,
            String wardName,
            String locationDescription,
            String reportedAt,
            String description,
            Double latitude,
            Double longitude,
            int allocationsCount,
            int tasksCount,
            boolean responseActive) {
    }

    public record Task(
            String id,
            String title,
            String priority,
            String status,
            Integer progressPercent,
            String dueDate,
            String assignedToName) {
    }

    public record Allocation(
            String id,
            String resourceName,
            String quantityRequested,
            String quantityAllocated,
            String unit,
            String status) {
    }
}
