package tz.go.pmo.dmis.controller;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.graphql.GraphQlTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.graphql.test.tester.GraphQlTester;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import reactor.core.publisher.Flux;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.common.security.TokenDenylist;
import tz.go.pmo.dmis.config.GraphQlQueryLimitConfig;
import tz.go.pmo.dmis.config.GraphQlSecurityExceptionResolver;
import tz.go.pmo.dmis.dto.response.MobileHomeResponse;
import tz.go.pmo.dmis.dto.response.SyncWakeup;
import tz.go.pmo.dmis.service.MobileReadService;
import tz.go.pmo.dmis.sync.SyncSseRelay;

@GraphQlTest(
        controllers = MobileGraphQlController.class,
        properties = {
            "dmis.graphql.max-query-depth=3",
            "dmis.graphql.max-query-complexity=100",
            "dmis.graphql.request-timeout=5s",
            "dmis.graphql.websocket-revocation-check=10ms"
        })
@ContextConfiguration(classes = {
    MobileGraphQlController.class,
    GraphQlQueryLimitConfig.class,
    GraphQlSecurityExceptionResolver.class,
    MobileGraphQlControllerTest.MethodSecurityTestConfig.class
})
class MobileGraphQlControllerTest {

    @Autowired
    private GraphQlTester graphQlTester;

    @Autowired
    private MobileGraphQlController controller;

    @MockitoBean
    private MobileReadService service;

    @MockitoBean
    private SyncSseRelay syncRelay;

    @MockitoBean
    private CurrentUserResolver currentUser;

    @MockitoBean
    private TokenDenylist denylist;

    @Test
    @WithMockUser(authorities = "incidents.view")
    void authorizedIncidentViewerCanExecuteTheTypedMobileQuery() {
        when(service.mobileHome(2, 10, 5, 123L)).thenReturn(sample());

        graphQlTester.document("""
                        query MobileHome($page: Int!, $iLimit: Int!, $limit: Int!, $before: ID) {
                          mobileHome(
                            incidentPage: $page
                            incidentLimit: $iLimit
                            notificationLimit: $limit
                            notificationBeforeId: $before
                          ) {
                            generatedAt
                            syncCursor
                            syncScopeKey
                            viewer { id }
                            notifications { unreadCount }
                          }
                        }
                        """)
                .variable("page", 2)
                .variable("iLimit", 10)
                .variable("limit", 5)
                .variable("before", "123")
                .execute()
                .errors().verify()
                .path("mobileHome.syncCursor").entity(String.class).isEqualTo("314")
                .path("mobileHome.syncScopeKey").entity(String.class).isEqualTo("scope-key-42")
                .path("mobileHome.viewer.id").entity(String.class).isEqualTo("42")
                .path("mobileHome.notifications.unreadCount").entity(Integer.class).isEqualTo(0);

        verify(service).mobileHome(2, 10, 5, 123L);
    }

    @Test
    @WithMockUser(authorities = "early_warning.view")
    void resolverPermissionDeniesAUserWithoutIncidentView() {
        graphQlTester.document("query MobileHome { mobileHome { generatedAt } }")
                .execute()
                .errors().satisfy(errors -> {
                    assertFalse(errors.isEmpty());
                    org.junit.jupiter.api.Assertions.assertEquals(
                            "FORBIDDEN", errors.getFirst().getErrorType().toString());
                });

        verifyNoInteractions(service);
    }

    @Test
    @WithMockUser(authorities = "incidents.view")
    void excessiveDepthIsRejectedBeforeTheReadServiceRuns() {
        graphQlTester.document("""
                        query TooDeep {
                          mobileHome { incidents { items { id } } }
                        }
                        """)
                .execute()
                .errors().satisfy(errors -> assertFalse(errors.isEmpty()));

        verifyNoInteractions(service);
    }

    @Test
    @WithMockUser(authorities = "incidents.view")
    void aliasAmplificationIsRejectedBeforeTheReadServiceRuns() {
        graphQlTester.document("""
                        query AliasedHome {
                          first: mobileHome { generatedAt }
                          second: mobileHome { generatedAt }
                        }
                        """)
                .execute()
                .errors().satisfy(errors -> assertFalse(errors.isEmpty()));

        verifyNoInteractions(service);
    }

    @Test
    void authorizedMobileClientCanSubscribeFromItsOpaqueCursor() {
        Instant now = Instant.now();
        SecurityContextHolder.getContext().setAuthentication(
                jwt(now.minusSeconds(5), now.plusSeconds(300)));
        when(currentUser.currentUserDbId()).thenReturn(42L);
        when(syncRelay.subscribe(42L, 314L)).thenReturn(
                Flux.just(new SyncWakeup("315", "2026-07-15T18:00:00Z")));

        List<SyncWakeup> wakeups = graphQlTester.document("""
                        subscription MobileSync($after: ID!) {
                          mobileSync(afterSequence: $after) { sequence occurredAt }
                        }
                        """)
                .variable("after", "314")
                .executeSubscription()
                .toFlux("mobileSync", SyncWakeup.class)
                .collectList()
                .block();

        org.assertj.core.api.Assertions.assertThat(wakeups)
                .extracting(SyncWakeup::sequence)
                .containsExactly("315");
        verify(syncRelay).subscribe(42L, 314L);
    }

    @Test
    void subscriptionLifetimeCannotOutliveItsJwt() {
        Instant now = Instant.parse("2026-07-15T18:00:00Z");
        JwtAuthenticationToken authentication = jwt(now.minusSeconds(5), now.plusSeconds(30));

        org.assertj.core.api.Assertions.assertThat(
                        MobileGraphQlController.jwtRemainingLifetime(authentication, now))
                .isEqualTo(java.time.Duration.ofSeconds(30));
    }

    @Test
    void expiredJwtCannotStartASubscription() {
        Instant now = Instant.parse("2026-07-15T18:00:00Z");
        JwtAuthenticationToken authentication = jwt(now.minusSeconds(60), now);

        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> MobileGraphQlController.jwtRemainingLifetime(authentication, now));
    }

    @Test
    void logoutRevocationTerminatesAnActiveSubscription() {
        Instant now = Instant.now();
        JwtAuthenticationToken authentication = jwt(now.minusSeconds(5), now.plusSeconds(300));
        SecurityContextHolder.getContext().setAuthentication(authentication);
        when(currentUser.currentUserDbId()).thenReturn(42L);
        when(syncRelay.subscribe(42L, 314L)).thenReturn(Flux.never());
        when(denylist.isRevoked("mobile-subscription-jti")).thenReturn(true);

        controller.mobileSync(314L, authentication).blockLast(java.time.Duration.ofSeconds(1));

        verify(denylist).isRevoked("mobile-subscription-jti");
    }

    private static JwtAuthenticationToken jwt(Instant issuedAt, Instant expiresAt) {
        Jwt jwt = Jwt.withTokenValue("mobile-subscription-token")
                .header("alg", "HS256")
                .subject("42")
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("jti", "mobile-subscription-jti")
                .build();
        return new JwtAuthenticationToken(
                jwt, List.of(new SimpleGrantedAuthority("incidents.view")), "42");
    }

    private static MobileHomeResponse sample() {
        return new MobileHomeResponse(
                "2026-07-15T09:00:00Z",
                "314",
                "scope-key-42",
                new MobileHomeResponse.Viewer(
                        "42", "District Officer", "district.officer@example.go.tz",
                        List.of("DAS"), List.of("incidents.view")),
                new MobileHomeResponse.IncidentPage(List.of(), 1, 1, 0),
                new MobileHomeResponse.NotificationPage(List.of(), 0, null, false, null));
    }

    @TestConfiguration(proxyBeanMethods = false)
    @EnableMethodSecurity
    static class MethodSecurityTestConfig {
    }
}
