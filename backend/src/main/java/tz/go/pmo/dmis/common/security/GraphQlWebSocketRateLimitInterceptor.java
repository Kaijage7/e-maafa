package tz.go.pmo.dmis.common.security;

import java.security.Principal;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.graphql.server.WebGraphQlInterceptor;
import org.springframework.graphql.server.WebGraphQlRequest;
import org.springframework.graphql.server.WebGraphQlResponse;
import org.springframework.graphql.server.WebSocketGraphQlRequest;
import org.springframework.graphql.server.WebSocketGraphQlInterceptor;
import org.springframework.graphql.server.WebSocketSessionInfo;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

/**
 * Per-operation security guard for GraphQL WebSockets. An established {@code graphql-transport-ws}
 * connection no longer crosses the servlet JWT/rate filters, so every operation rechecks JWT expiry,
 * logout revocation, maximum socket age, and the per-actor message budget here. A shared edge limit
 * and shared denylist are still required when production runs more than one application instance.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public final class GraphQlWebSocketRateLimitInterceptor implements WebSocketGraphQlInterceptor {

    private final boolean enabled;
    private final LongSupplier clock;
    private final FixedWindowRateLimiter limiter;
    private final TokenDenylist denylist;
    private final long maxSocketLifetimeMillis;
    private final Map<String, Long> sessionStartedAt = new ConcurrentHashMap<>();

    @Autowired
    public GraphQlWebSocketRateLimitInterceptor(
            @Value("${dmis.graphql.websocket-max-operations:300}") int maxOperations,
            @Value("${dmis.graphql.websocket-operation-window-seconds:60}") long windowSeconds,
            @Value("${dmis.sync.graphql-subscription-timeout:10m}") Duration maxSocketLifetime,
            TokenDenylist denylist) {
        this(true, maxOperations, windowSeconds, maxSocketLifetime, System::currentTimeMillis, denylist);
    }

    GraphQlWebSocketRateLimitInterceptor(
            boolean enabled, int maxOperations, long windowSeconds, Duration maxSocketLifetime,
            LongSupplier clock, TokenDenylist denylist) {
        if (maxSocketLifetime == null || maxSocketLifetime.isZero() || maxSocketLifetime.isNegative()) {
            throw new IllegalArgumentException(
                    "dmis.sync.graphql-subscription-timeout must be greater than zero");
        }
        this.enabled = enabled;
        this.clock = clock;
        this.denylist = denylist;
        this.maxSocketLifetimeMillis = maxSocketLifetime.toMillis();
        this.limiter = new FixedWindowRateLimiter(
                maxOperations, Math.max(1L, windowSeconds) * 1000L);
    }

    @Override
    public Mono<WebGraphQlResponse> intercept(WebGraphQlRequest request, Chain chain) {
        if (!enabled || !(request instanceof WebSocketGraphQlRequest webSocketRequest)) {
            return chain.next(request);
        }
        WebSocketSessionInfo session = webSocketRequest.getSessionInfo();
        return session.getPrincipal().switchIfEmpty(Mono.error(new ResponseStatusException(
                        HttpStatus.UNAUTHORIZED, "Authentication is required for GraphQL WebSocket operations.")))
                .flatMap(principal -> guard(principal, session, request, chain));
    }

    private Mono<WebGraphQlResponse> guard(
            Principal principal, WebSocketSessionInfo session,
            WebGraphQlRequest request, Chain chain) {
        if (!(principal instanceof JwtAuthenticationToken jwtAuthentication)) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "A JWT session is required for GraphQL WebSocket operations."));
        }
        long now = clock.getAsLong();
        Jwt jwt = jwtAuthentication.getToken();
        Instant expiresAt = jwt.getExpiresAt();
        if (expiresAt == null || expiresAt.toEpochMilli() <= now) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "The GraphQL WebSocket token has expired; reconnect."));
        }
        String jti = jwt.getId() == null ? jwt.getClaimAsString("jti") : jwt.getId();
        if (jti == null || jti.isBlank()) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "A revocable JWT identity is required for GraphQL WebSocket operations."));
        }
        if (denylist.isRevoked(jti)) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED, "The GraphQL WebSocket session was revoked; sign in again."));
        }
        long startedAt = sessionStartedAt.computeIfAbsent(session.getId(), ignored -> now);
        if (now - startedAt >= maxSocketLifetimeMillis) {
            return Mono.error(new ResponseStatusException(
                    HttpStatus.UNAUTHORIZED,
                    "The GraphQL WebSocket authentication window ended; reconnect."));
        }
        String name = principal.getName();
        String rateKey = name == null || name.isBlank()
                ? "session:" + session.getId()
                : "actor:" + name;
        if (enabled) {
            long retryAfter = limiter.retryAfterSeconds(rateKey, clock.getAsLong());
            if (retryAfter > 0) {
                return Mono.error(new ResponseStatusException(
                        HttpStatus.TOO_MANY_REQUESTS,
                        "Too many GraphQL WebSocket operations; retry after " + retryAfter + " seconds."));
            }
        }
        return chain.next(request);
    }

    @Override
    public void handleConnectionClosed(
            WebSocketSessionInfo sessionInfo, int statusCode, Map<String, Object> connectionInitPayload) {
        sessionStartedAt.remove(sessionInfo.getId());
    }
}
