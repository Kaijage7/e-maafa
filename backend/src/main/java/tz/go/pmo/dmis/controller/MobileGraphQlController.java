package tz.go.pmo.dmis.controller;

import java.security.Principal;
import java.time.Duration;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.graphql.data.method.annotation.SubscriptionMapping;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Controller;
import reactor.core.publisher.Flux;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.common.security.TokenDenylist;
import tz.go.pmo.dmis.dto.response.IncidentWorkspaceResponse;
import tz.go.pmo.dmis.dto.response.MobileHomeResponse;
import tz.go.pmo.dmis.dto.response.SyncWakeup;
import tz.go.pmo.dmis.service.MobileReadService;
import tz.go.pmo.dmis.sync.SyncSseRelay;

/**
 * Read-only composite views for mobile and native clients.
 *
 * <p><b>Transport boundary:</b> GraphQL is used only for screen-shaped reads
 * ({@code mobileHome}, {@code incidentWorkspace}) and content-free foreground wake-up
 * ({@code mobileSync}). Commands, uploads, auth, offline cursor recovery, and web SSE stay on REST.
 * Resolvers call existing application services — no resolver-owned SQL or mutations.</p>
 *
 * <p>GraphQL requests share one URL, so URL-based module guards cannot identify the selected
 * field. Every resolver must therefore carry its own permission check.</p>
 */
@Controller
public class MobileGraphQlController {

    private final MobileReadService service;
    private final SyncSseRelay syncRelay;
    private final CurrentUserResolver currentUser;
    private final TokenDenylist denylist;
    private final Duration revocationCheckInterval;

    public MobileGraphQlController(
            MobileReadService service,
            SyncSseRelay syncRelay,
            CurrentUserResolver currentUser,
            TokenDenylist denylist,
            @Value("${dmis.graphql.websocket-revocation-check:5s}") Duration revocationCheckInterval) {
        if (revocationCheckInterval == null || revocationCheckInterval.isZero()
                || revocationCheckInterval.isNegative()) {
            throw new IllegalArgumentException(
                    "dmis.graphql.websocket-revocation-check must be greater than zero");
        }
        this.service = service;
        this.syncRelay = syncRelay;
        this.currentUser = currentUser;
        this.denylist = denylist;
        this.revocationCheckInterval = revocationCheckInterval;
    }

    @QueryMapping
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public MobileHomeResponse mobileHome(
            @Argument Integer incidentPage,
            @Argument Integer incidentLimit,
            @Argument Integer notificationLimit,
            @Argument Long notificationBeforeId) {
        return service.mobileHome(
                incidentPage == null ? 1 : incidentPage,
                incidentLimit == null ? 15 : incidentLimit,
                notificationLimit == null ? 20 : notificationLimit,
                notificationBeforeId);
    }

    @QueryMapping
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public IncidentWorkspaceResponse incidentWorkspace(@Argument String id) {
        if (id == null || id.isBlank()) {
            throw new IllegalArgumentException("incidentWorkspace requires a positive incident id");
        }
        try {
            long incidentId = Long.parseLong(id.trim());
            if (incidentId < 1) {
                throw new NumberFormatException("non-positive");
            }
            return service.incidentWorkspace(incidentId);
        } catch (NumberFormatException bad) {
            throw new IllegalArgumentException("incidentWorkspace id must be a positive number", bad);
        }
    }

    /**
     * Best-effort foreground invalidation for native GraphQL clients. It deliberately carries no
     * incident or notification row: reconnect and offline correctness come from the snapshot cursor
     * plus the scoped REST delta endpoint, never from an assumed lossless socket.
     */
    @SubscriptionMapping
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public Flux<SyncWakeup> mobileSync(@Argument Long afterSequence, Principal principal) {
        Duration jwtLifetime = jwtRemainingLifetime(principal, Instant.now());
        String jti = jwtId(principal);
        Long actorUserId = currentUser.currentUserDbId();
        if (actorUserId == null || actorUserId <= 0) {
            throw new AccessDeniedException(
                    "A numeric platform user identity is required for live synchronization.");
        }
        // SyncSseRelay separately enforces the configured socket/subscription maximum. This outer
        // bound closes the stream sooner when the JWT expires during an otherwise valid operation.
        Flux<Long> revoked = Flux.interval(Duration.ZERO, revocationCheckInterval)
                .filter(ignored -> denylist.isRevoked(jti))
                .take(1);
        return syncRelay.subscribe(actorUserId, afterSequence == null ? 0 : afterSequence)
                .take(jwtLifetime)
                .takeUntilOther(revoked);
    }

    static Duration jwtRemainingLifetime(Principal principal, Instant now) {
        if (!(principal instanceof JwtAuthenticationToken authentication)) {
            throw new AccessDeniedException("A JWT session is required for live synchronization.");
        }
        Instant expiresAt = authentication.getToken().getExpiresAt();
        if (expiresAt == null || !expiresAt.isAfter(now)) {
            throw new AccessDeniedException(
                    "The live synchronization token has expired; reconnect and sign in again.");
        }
        return Duration.between(now, expiresAt);
    }

    static String jwtId(Principal principal) {
        if (!(principal instanceof JwtAuthenticationToken authentication)) {
            throw new AccessDeniedException("A JWT session is required for live synchronization.");
        }
        String jti = authentication.getToken().getId();
        if (jti == null || jti.isBlank()) {
            jti = authentication.getToken().getClaimAsString("jti");
        }
        if (jti == null || jti.isBlank()) {
            throw new AccessDeniedException(
                    "A revocable JWT identity is required for live synchronization.");
        }
        return jti;
    }

}
