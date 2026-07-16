package tz.go.pmo.dmis.service.impl;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.dto.response.IncidentWorkspaceResponse;
import tz.go.pmo.dmis.dto.response.MobileHomeResponse;
import tz.go.pmo.dmis.dto.response.MobileReferenceResponse;
import tz.go.pmo.dmis.service.IncidentService;
import tz.go.pmo.dmis.service.IncidentSyncService;
import tz.go.pmo.dmis.service.MobileReadService;
import tz.go.pmo.dmis.service.UserNotificationService;

/**
 * Composes existing scoped application services into a typed mobile read model.
 * It deliberately performs no SQL and does not convert upstream failures into fake empty data.
 */
@Service
public class MobileReadServiceImpl implements MobileReadService {

    private static final int MAX_NOTIFICATION_PAGE_SIZE = 50;
    private static final int MAX_INCIDENT_PAGE_SIZE = 50;
    private static final int DEFAULT_INCIDENT_PAGE_SIZE = 15;
    private static final int MAX_WORKSPACE_CHILD_ROWS = 50;
    private static final int MAX_REFERENCE_ROWS = 5_000;

    private final IncidentService incidentService;
    private final UserNotificationService notificationService;
    private final IncidentSyncService syncService;

    public MobileReadServiceImpl(IncidentService incidentService, UserNotificationService notificationService,
                                 IncidentSyncService syncService) {
        this.incidentService = incidentService;
        this.notificationService = notificationService;
        this.syncService = syncService;
    }

    @Override
    @Transactional(readOnly = true, timeout = 15, isolation = Isolation.REPEATABLE_READ)
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public MobileHomeResponse mobileHome(
            int incidentPage, int incidentLimit, int notificationLimit, Long notificationBeforeId) {
        Authentication authentication = requireAuthentication();
        int safePage = Math.max(1, incidentPage);
        int safeIncidentLimit = Math.min(MAX_INCIDENT_PAGE_SIZE,
                Math.max(1, incidentLimit > 0 ? incidentLimit : DEFAULT_INCIDENT_PAGE_SIZE));
        int safeLimit = Math.min(MAX_NOTIFICATION_PAGE_SIZE, Math.max(1, notificationLimit));
        Long safeCursor = notificationBeforeId != null && notificationBeforeId > 0
                ? notificationBeforeId
                : null;

        // Capture BEFORE the snapshot reads. A concurrent commit may therefore be returned both in
        // the snapshot and later delta (safe duplicate), but it can never be absent from both (data loss).
        IncidentSyncService.SnapshotState syncState = syncService.snapshotState();
        // These services retain their existing jurisdiction and current-user restrictions.
        Map<String, Object> incidents = incidentService.index(null, null, null, safePage, safeIncidentLimit);
        Map<String, Object> notifications = notificationService.feed(
                safeLimit, false, null, null, null, null, safeCursor);

        return new MobileHomeResponse(
                Instant.now().toString(),
                Long.toString(syncState.cursor()),
                syncState.scopeKey(),
                viewer(authentication),
                incidentPage(incidents),
                notificationPage(notifications));
    }

    @Override
    @Transactional(readOnly = true, timeout = 15, isolation = Isolation.REPEATABLE_READ)
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public IncidentWorkspaceResponse incidentWorkspace(long incidentId) {
        if (incidentId < 1) {
            throw new IllegalArgumentException("incident id must be a positive number");
        }
        requireAuthentication();
        IncidentSyncService.SnapshotState syncState = syncService.snapshotState();
        // show() already enforces jurisdiction and returns 404 for out-of-area rows.
        Map<String, Object> source = incidentService.show(incidentId);
        Objects.requireNonNull(source, "Incident workspace source must not be null");
        @SuppressWarnings("unchecked")
        Map<String, Object> incident = (Map<String, Object>) source.get("incident");
        if (incident == null) {
            throw new IllegalStateException("Incident workspace is missing the incident object");
        }
        List<IncidentWorkspaceResponse.Task> tasks = mapTasks(source.get("tasks"));
        List<IncidentWorkspaceResponse.Allocation> allocations = mapAllocations(source.get("allocations"));
        return new IncidentWorkspaceResponse(
                Instant.now().toString(),
                Long.toString(syncState.cursor()),
                syncState.scopeKey(),
                detail(incident, tasks.size(), allocations.size()),
                tasks,
                allocations,
                listSize(source.get("updates")),
                listSize(source.get("workflow_histories")));
    }

    @Override
    @Transactional(readOnly = true, timeout = 15)
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public MobileReferenceResponse mobileReference() {
        requireAuthentication();
        // Reuse the existing form catalogue — no parallel vocab SQL in GraphQL.
        Map<String, Object> form = incidentService.formData();
        return new MobileReferenceResponse(
                Instant.now().toString(),
                refItems(form.get("hazards")),
                incidentTypeRefs(form.get("incident_types")),
                stringList(form.get("severity_levels")),
                stringList(form.get("sources_of_report")),
                stringList(form.get("infrastructure_damage_options")),
                stringList(form.get("emergency_needs_options")),
                refItems(form.get("regions")));
    }

    private static Authentication requireAuthentication() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || !(authentication.getPrincipal() instanceof Jwt jwt)) {
            throw new InsufficientAuthenticationException("Authenticated user identity is required.");
        }
        // UserNotificationService has system-actor fallbacks for scheduled jobs. A user-facing GraphQL
        // request must never reach those fallbacks, or it could read the system actor's notifications.
        try {
            if (jwt.getSubject() == null || Long.parseLong(jwt.getSubject()) < 1) {
                throw new NumberFormatException("non-positive subject");
            }
        } catch (NumberFormatException invalidSubject) {
            throw new InsufficientAuthenticationException(
                    "Authenticated user subject must identify a platform user.", invalidSubject);
        }
        return authentication;
    }

    private static MobileHomeResponse.Viewer viewer(Authentication authentication) {
        String id = null;
        String name = null;
        String email = null;
        Jwt jwt = (Jwt) authentication.getPrincipal();
        id = clean(jwt.getSubject());
        name = clean(jwt.getClaimAsString("name"));
        email = clean(jwt.getClaimAsString("email"));
        if (name == null) {
            name = clean(authentication.getName());
        }
        if (id == null || name == null) {
            throw new InsufficientAuthenticationException("Authenticated user claims are incomplete.");
        }

        Set<String> roles = new LinkedHashSet<>();
        Set<String> permissions = new LinkedHashSet<>();
        for (GrantedAuthority authority : authentication.getAuthorities()) {
            String value = clean(authority.getAuthority());
            if (value == null) {
                continue;
            }
            if (value.startsWith("ROLE_")) {
                roles.add(value.substring("ROLE_".length()));
            } else {
                permissions.add(value);
            }
        }
        return new MobileHomeResponse.Viewer(
                id, name, email, sorted(roles), sorted(permissions));
    }

    private static MobileHomeResponse.IncidentPage incidentPage(Map<String, Object> source) {
        Objects.requireNonNull(source, "Incident read model must not be null");
        List<MobileHomeResponse.Incident> items = new ArrayList<>();
        for (Map<String, Object> row : mapRows(source, "data")) {
            items.add(new MobileHomeResponse.Incident(
                    requiredId(row, "id"),
                    requiredString(row, "title"),
                    string(row.get("status")),
                    string(row.get("workflow_status")),
                    string(row.get("workflow_status_label")),
                    string(row.get("severity_level")),
                    string(row.get("hazard_name")),
                    string(row.get("district_name")),
                    string(row.get("region_name")),
                    string(row.get("location_description")),
                    string(row.get("reported_at")),
                    requiredInt(row, "allocations_count"),
                    requiredInt(row, "tasks_count"),
                    requiredBoolean(row, "response_active")));
        }
        return new MobileHomeResponse.IncidentPage(
                List.copyOf(items),
                requiredInt(source, "currentPage"),
                requiredInt(source, "lastPage"),
                requiredInt(source, "total"));
    }

    private static MobileHomeResponse.NotificationPage notificationPage(Map<String, Object> source) {
        Objects.requireNonNull(source, "Notification read model must not be null");
        List<MobileHomeResponse.Notification> items = new ArrayList<>();
        for (Map<String, Object> row : mapRows(source, "items")) {
            items.add(new MobileHomeResponse.Notification(
                    requiredId(row, "id"),
                    string(row.get("type")),
                    requiredString(row, "title"),
                    string(row.get("message")),
                    string(row.get("link")),
                    string(row.get("entity_type")),
                    id(row.get("entity_id")),
                    string(row.get("severity_norm")),
                    requiredBoolean(row, "is_read"),
                    string(row.get("created_at")),
                    string(row.get("category")),
                    string(row.get("category_label")),
                    string(row.get("category_icon"))));
        }
        return new MobileHomeResponse.NotificationPage(
                List.copyOf(items),
                requiredInt(source, "unread_count"),
                id(source.get("latest_id")),
                requiredBoolean(source, "has_more"),
                id(source.get("next_before_id")));
    }

    private static List<String> sorted(Collection<String> values) {
        return values.stream().sorted(Comparator.naturalOrder()).toList();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> mapRows(Map<String, Object> source, String field) {
        if (!source.containsKey(field)) {
            throw new IllegalStateException("Required read-model field is missing: " + field);
        }
        Object value = source.get(field);
        if (!(value instanceof List<?> rows)) {
            throw new IllegalStateException("Required read-model field is not a list: " + field);
        }
        List<Map<String, Object>> result = new ArrayList<>(rows.size());
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> map)) {
                throw new IllegalStateException("Read-model list contains a non-object row: " + field);
            }
            result.add((Map<String, Object>) map);
        }
        return result;
    }

    private static int requiredInt(Map<String, Object> source, String field) {
        Object value = required(source, field);
        if (value instanceof Number number) {
            return Math.toIntExact(number.longValue());
        }
        return Integer.parseInt(value.toString());
    }

    private static boolean requiredBoolean(Map<String, Object> source, String field) {
        Object value = required(source, field);
        if (value instanceof Boolean bool) {
            return bool;
        }
        String text = value.toString();
        if ("true".equalsIgnoreCase(text) || "1".equals(text)) {
            return true;
        }
        if ("false".equalsIgnoreCase(text) || "0".equals(text)) {
            return false;
        }
        throw new IllegalStateException("Required read-model field is not boolean: " + field);
    }

    private static String requiredId(Map<String, Object> source, String field) {
        return required(source, field).toString();
    }

    private static String requiredString(Map<String, Object> source, String field) {
        String value = required(source, field).toString();
        if (value.isBlank()) {
            throw new IllegalStateException("Required read-model field is blank: " + field);
        }
        return value;
    }

    private static Object required(Map<String, Object> source, String field) {
        if (!source.containsKey(field) || source.get(field) == null) {
            throw new IllegalStateException("Required read-model field is missing: " + field);
        }
        return source.get(field);
    }

    private static String id(Object value) {
        return value == null ? null : value.toString();
    }

    private static String string(Object value) {
        return value == null ? null : value.toString();
    }

    private static String clean(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static IncidentWorkspaceResponse.IncidentDetail detail(
            Map<String, Object> incident, int taskCount, int allocationCount) {
        boolean responseActive = false;
        Object active = incident.get("response_active");
        if (active instanceof Boolean b) {
            responseActive = b;
        } else if (active != null) {
            responseActive = "true".equalsIgnoreCase(active.toString()) || "1".equals(active.toString());
        }
        return new IncidentWorkspaceResponse.IncidentDetail(
                requiredId(incident, "id"),
                requiredString(incident, "title"),
                string(incident.get("status")),
                string(incident.get("workflow_status")),
                string(incident.get("workflow_status_label")),
                string(incident.get("severity_level")),
                string(incident.get("hazard_name")),
                string(incident.get("incident_type_name")),
                string(incident.get("district_name")),
                string(incident.get("region_name")),
                string(incident.get("council_name")),
                string(incident.get("ward_name")),
                string(incident.get("location_description")),
                string(incident.get("reported_at")),
                string(incident.get("description")),
                asDouble(incident.get("latitude")),
                asDouble(incident.get("longitude")),
                allocationCount,
                taskCount,
                responseActive);
    }

    @SuppressWarnings("unchecked")
    private static List<IncidentWorkspaceResponse.Task> mapTasks(Object raw) {
        if (!(raw instanceof List<?> rows)) {
            return List.of();
        }
        List<IncidentWorkspaceResponse.Task> out = new ArrayList<>();
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> map) || out.size() >= MAX_WORKSPACE_CHILD_ROWS) {
                continue;
            }
            Map<String, Object> m = (Map<String, Object>) map;
            out.add(new IncidentWorkspaceResponse.Task(
                    id(m.get("id")),
                    string(m.get("title")),
                    string(m.get("priority")),
                    string(m.get("status")),
                    asInteger(m.get("progress_percent")),
                    string(m.get("due_date")),
                    string(m.get("assigned_to_name"))));
        }
        return List.copyOf(out);
    }

    @SuppressWarnings("unchecked")
    private static List<IncidentWorkspaceResponse.Allocation> mapAllocations(Object raw) {
        if (!(raw instanceof List<?> rows)) {
            return List.of();
        }
        List<IncidentWorkspaceResponse.Allocation> out = new ArrayList<>();
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> map) || out.size() >= MAX_WORKSPACE_CHILD_ROWS) {
                continue;
            }
            Map<String, Object> m = (Map<String, Object>) map;
            out.add(new IncidentWorkspaceResponse.Allocation(
                    id(m.get("id")),
                    string(m.get("resource_name")),
                    string(m.get("quantity_requested")),
                    string(m.get("quantity_allocated")),
                    string(m.get("unit_of_measure")),
                    string(m.get("status"))));
        }
        return List.copyOf(out);
    }

    private static int listSize(Object raw) {
        return raw instanceof List<?> list ? list.size() : 0;
    }

    private static Double asDouble(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        try {
            return Double.parseDouble(value.toString());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static Integer asInteger(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private static List<MobileReferenceResponse.RefItem> refItems(Object raw) {
        if (!(raw instanceof List<?> rows)) {
            return List.of();
        }
        List<MobileReferenceResponse.RefItem> out = new ArrayList<>();
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> map) || out.size() >= MAX_REFERENCE_ROWS) {
                continue;
            }
            Map<String, Object> m = (Map<String, Object>) map;
            Object id = m.get("id");
            Object name = m.get("name");
            if (id == null || name == null || name.toString().isBlank()) {
                continue;
            }
            out.add(new MobileReferenceResponse.RefItem(id.toString(), name.toString()));
        }
        return List.copyOf(out);
    }

    @SuppressWarnings("unchecked")
    private static List<MobileReferenceResponse.IncidentTypeRef> incidentTypeRefs(Object raw) {
        if (!(raw instanceof List<?> rows)) {
            return List.of();
        }
        List<MobileReferenceResponse.IncidentTypeRef> out = new ArrayList<>();
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> map) || out.size() >= MAX_REFERENCE_ROWS) {
                continue;
            }
            Map<String, Object> m = (Map<String, Object>) map;
            Object id = m.get("id");
            Object name = m.get("name");
            if (id == null || name == null || name.toString().isBlank()) {
                continue;
            }
            Object severity = m.get("default_severity");
            if (severity == null) {
                severity = m.get("defaultSeverity");
            }
            out.add(new MobileReferenceResponse.IncidentTypeRef(
                    id.toString(),
                    name.toString(),
                    severity == null ? null : severity.toString()));
        }
        return List.copyOf(out);
    }

    private static List<String> stringList(Object raw) {
        if (!(raw instanceof List<?> rows)) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (Object row : rows) {
            if (row != null && !row.toString().isBlank() && out.size() < MAX_REFERENCE_ROWS) {
                out.add(row.toString());
            }
        }
        return List.copyOf(out);
    }
}
