package tz.go.pmo.dmis.service.impl;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.InsufficientAuthenticationException;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import tz.go.pmo.dmis.dto.response.MobileHomeResponse;
import tz.go.pmo.dmis.service.IncidentService;
import tz.go.pmo.dmis.service.IncidentSyncService;
import tz.go.pmo.dmis.service.UserNotificationService;

class MobileReadServiceImplTest {

    private IncidentService incidentService;
    private UserNotificationService notificationService;
    private IncidentSyncService syncService;
    private MobileReadServiceImpl service;

    @BeforeEach
    void setUp() {
        incidentService = mock(IncidentService.class);
        notificationService = mock(UserNotificationService.class);
        syncService = mock(IncidentSyncService.class);
        when(syncService.snapshotState()).thenReturn(
                new IncidentSyncService.SnapshotState(314L, "scope-key-42"));
        service = new MobileReadServiceImpl(incidentService, notificationService, syncService);
        authenticate("42");
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void composesExistingScopedServicesAndBoundsMobileInputs() {
        Map<String, Object> incidentRow = Map.ofEntries(
                Map.entry("id", 901L),
                Map.entry("title", "Flooding at river crossing"),
                Map.entry("status", "active"),
                Map.entry("workflow_status", "district_review"),
                Map.entry("workflow_status_label", "District review"),
                Map.entry("severity_level", "high"),
                Map.entry("hazard_name", "Flood"),
                Map.entry("district_name", "Kilosa"),
                Map.entry("region_name", "Morogoro"),
                Map.entry("location_description", "Mkondoa bridge"),
                Map.entry("reported_at", "15 Jul 2026, 08:30"),
                Map.entry("allocations_count", 2L),
                Map.entry("tasks_count", 3L),
                Map.entry("response_active", true));
        when(incidentService.index(isNull(), isNull(), isNull(), org.mockito.ArgumentMatchers.eq(1)))
                .thenReturn(Map.of("data", List.of(incidentRow), "currentPage", 1, "lastPage", 2, "total", 16L));

        Map<String, Object> notificationRow = Map.ofEntries(
                Map.entry("id", 77L),
                Map.entry("type", "incident_submitted"),
                Map.entry("title", "Incident submitted"),
                Map.entry("message", "A district incident is awaiting review."),
                Map.entry("link", "/response/incidents/901"),
                Map.entry("entity_type", "incident"),
                Map.entry("entity_id", 901L),
                Map.entry("severity_norm", "warning"),
                Map.entry("is_read", false),
                Map.entry("created_at", "2026-07-15T08:31:00Z"),
                Map.entry("category", "workflow"),
                Map.entry("category_label", "Incidents & tasks"),
                Map.entry("category_icon", "fa-diagram-project"));
        when(notificationService.feed(50, false, null, null, null, null, null))
                .thenReturn(Map.of(
                        "items", List.of(notificationRow),
                        "unread_count", 4,
                        "latest_id", 77L,
                        "has_more", false,
                        "next_before_id", 77L));

        MobileHomeResponse response = service.mobileHome(-5, 500, -10L);

        assertEquals("42", response.viewer().id());
        assertEquals("314", response.syncCursor());
        assertEquals("scope-key-42", response.syncScopeKey());
        assertEquals("District Officer", response.viewer().name());
        assertEquals(List.of("DAS"), response.viewer().roles());
        assertEquals(List.of("incidents.view"), response.viewer().permissions());
        assertEquals("901", response.incidents().items().getFirst().id());
        assertEquals("high", response.incidents().items().getFirst().severity());
        assertEquals(16, response.incidents().total());
        assertEquals("77", response.notifications().latestId());
        assertFalse(response.notifications().items().getFirst().read());
        assertFalse(Instant.parse(response.generatedAt()).isAfter(Instant.now()));

        verify(incidentService).index(null, null, null, 1);
        verify(notificationService).feed(50, false, null, null, null, null, null);
    }

    @Test
    void rejectsNonJwtAuthenticationBeforeAnyReadServiceRuns() {
        SecurityContextHolder.clearContext();

        assertThrows(InsufficientAuthenticationException.class, () -> service.mobileHome(1, 20, null));
        verifyNoInteractions(incidentService, notificationService, syncService);
    }

    @Test
    void rejectsNonPlatformJwtSubjectBeforeSystemActorFallbackCanRun() {
        authenticate("external-keycloak-uuid");

        assertThrows(InsufficientAuthenticationException.class, () -> service.mobileHome(1, 20, null));
        verifyNoInteractions(incidentService, notificationService, syncService);
    }

    @Test
    void requiredUpstreamShapeMismatchFailsInsteadOfReturningFakeEmptyData() {
        when(incidentService.index(null, null, null, 1)).thenReturn(Map.of(
                "currentPage", 1, "lastPage", 1, "total", 0));
        when(notificationService.feed(20, false, null, null, null, null, null)).thenReturn(Map.of(
                "items", List.of(), "unread_count", 0, "has_more", false));

        IllegalStateException error = assertThrows(
                IllegalStateException.class, () -> service.mobileHome(1, 20, null));
        assertEquals("Required read-model field is missing: data", error.getMessage());
    }

    @Test
    void nullableNotificationCursorRemainsNull() {
        when(incidentService.index(null, null, null, 1)).thenReturn(Map.of(
                "data", List.of(), "currentPage", 1, "lastPage", 1, "total", 0));
        when(notificationService.feed(20, false, null, null, null, null, null)).thenReturn(Map.of(
                "items", List.of(), "unread_count", 0, "has_more", false));

        MobileHomeResponse response = service.mobileHome(1, 20, null);

        assertNull(response.notifications().latestId());
        assertNull(response.notifications().nextBeforeId());
    }

    private static void authenticate(String subject) {
        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "none")
                .subject(subject)
                .claim("name", "District Officer")
                .claim("email", "district.officer@example.go.tz")
                .build();
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(jwt, List.of(
                new SimpleGrantedAuthority("ROLE_DAS"),
                new SimpleGrantedAuthority("incidents.view")));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }
}
