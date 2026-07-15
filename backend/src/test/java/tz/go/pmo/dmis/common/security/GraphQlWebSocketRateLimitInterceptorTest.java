package tz.go.pmo.dmis.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.net.InetSocketAddress;
import java.net.URI;
import java.security.Principal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.graphql.server.WebGraphQlInterceptor;
import org.springframework.graphql.server.WebGraphQlRequest;
import org.springframework.graphql.server.WebSocketGraphQlRequest;
import org.springframework.graphql.server.WebSocketSessionInfo;
import org.springframework.http.HttpHeaders;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.publisher.Mono;

class GraphQlWebSocketRateLimitInterceptorTest {

    @Test
    void limitsOperationsAcrossSocketsForTheSameAuthenticatedActor() {
        AtomicLong now = new AtomicLong(1_000L);
        AtomicInteger accepted = new AtomicInteger();
        GraphQlWebSocketRateLimitInterceptor interceptor =
                interceptor(2, Duration.ofMinutes(10), now);
        WebGraphQlInterceptor.Chain chain = request -> {
            accepted.incrementAndGet();
            return Mono.empty();
        };

        interceptor.intercept(request("socket-1", "42"), chain).block();
        interceptor.intercept(request("socket-2", "42"), chain).block();

        assertThatThrownBy(() -> interceptor.intercept(request("socket-3", "42"), chain).block())
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(429));
        assertThat(accepted).hasValue(2);

        // A different authenticated actor has an independent budget.
        interceptor.intercept(request("socket-4", "43"), chain).block();
        assertThat(accepted).hasValue(3);
    }

    @Test
    void ordinaryHttpGraphQlRequestsRemainOnTheExistingServletRateLimitPath() {
        GraphQlWebSocketRateLimitInterceptor interceptor =
                interceptor(1, Duration.ofMinutes(10), new AtomicLong(1_000L));
        AtomicInteger accepted = new AtomicInteger();
        WebGraphQlInterceptor.Chain chain = request -> {
            accepted.incrementAndGet();
            return Mono.empty();
        };
        WebGraphQlRequest http = new WebGraphQlRequest(
                URI.create("https://example.go.tz/api/graphql"),
                new HttpHeaders(), new LinkedMultiValueMap<>(),
                new InetSocketAddress("127.0.0.1", 1234), Map.of(),
                Map.of("query", "query { mobileHome { generatedAt } }"),
                "http-1", Locale.ENGLISH);

        interceptor.intercept(http, chain).block();
        interceptor.intercept(http, chain).block();

        assertThat(accepted).hasValue(2);
    }

    @Test
    void oldSocketCannotResubscribeUntilAReauthenticatedUpgradeCreatesANewSession() {
        AtomicLong now = new AtomicLong(1_000L);
        GraphQlWebSocketRateLimitInterceptor interceptor =
                interceptor(10, Duration.ofMinutes(10), now);
        AtomicInteger accepted = new AtomicInteger();
        WebGraphQlInterceptor.Chain chain = request -> {
            accepted.incrementAndGet();
            return Mono.empty();
        };

        interceptor.intercept(request("old-socket", "42"), chain).block();
        now.addAndGet(Duration.ofMinutes(10).toMillis());

        assertThatThrownBy(() -> interceptor.intercept(request("old-socket", "42"), chain).block())
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(401));

        interceptor.intercept(request("new-socket", "42"), chain).block();
        assertThat(accepted).hasValue(2);
    }

    @Test
    void expiredOrRevokedJwtCannotStartAnotherOperationOnAnOpenSocket() {
        long nowMillis = Instant.parse("2026-07-15T18:00:00Z").toEpochMilli();
        AtomicLong now = new AtomicLong(nowMillis);
        TokenDenylist denylist = new TokenDenylist();
        GraphQlWebSocketRateLimitInterceptor interceptor =
                new GraphQlWebSocketRateLimitInterceptor(
                        true, 10, 60, Duration.ofMinutes(10), now::get, denylist);
        WebGraphQlInterceptor.Chain chain = request -> Mono.empty();

        assertThatThrownBy(() -> interceptor.intercept(
                        request("expired", jwt("42", "expired-jti", nowMillis - 1)), chain).block())
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(401));

        denylist.revoke("revoked-jti", Instant.parse("2099-01-01T00:00:00Z"));
        assertThatThrownBy(() -> interceptor.intercept(
                        request("revoked", jwt("42", "revoked-jti", nowMillis + 60_000)), chain).block())
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(401));
    }

    @Test
    void websocketJwtMustHaveARevocableTokenId() {
        long expiresAtMillis = Instant.parse("2099-01-01T00:00:00Z").toEpochMilli();
        Jwt jwt = Jwt.withTokenValue("test-token-without-jti")
                .header("alg", "none")
                .subject("42")
                .issuedAt(Instant.ofEpochMilli(1_000L))
                .expiresAt(Instant.ofEpochMilli(expiresAtMillis))
                .build();
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(jwt, List.of(), "42");
        GraphQlWebSocketRateLimitInterceptor interceptor =
                interceptor(10, Duration.ofMinutes(10), new AtomicLong(1_000L));

        assertThatThrownBy(() -> interceptor.intercept(
                        request("missing-jti", authentication), request -> Mono.empty()).block())
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(
                        ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(401));
    }

    private static WebSocketGraphQlRequest request(String sessionId, String actor) {
        return request(sessionId, jwt(actor, sessionId + "-jti", Instant.parse("2099-01-01T00:00:00Z").toEpochMilli()));
    }

    private static WebSocketGraphQlRequest request(String sessionId, Principal principal) {
        WebSocketSessionInfo session = new WebSocketSessionInfo() {
            @Override public String getId() { return sessionId; }
            @Override public Map<String, Object> getAttributes() { return Map.of(); }
            @Override public URI getUri() { return URI.create("wss://example.go.tz/api/graphql"); }
            @Override public HttpHeaders getHeaders() { return new HttpHeaders(); }
            @Override public Mono<Principal> getPrincipal() { return Mono.just(principal); }
            @Override public InetSocketAddress getRemoteAddress() {
                return new InetSocketAddress("127.0.0.1", 1234);
            }
        };
        return new WebSocketGraphQlRequest(
                session.getUri(), session.getHeaders(), new LinkedMultiValueMap<>(),
                session.getRemoteAddress(), Map.of(),
                Map.of("query", "subscription { mobileSync(afterSequence: \"0\") { sequence } }"),
                sessionId + "-operation", Locale.ENGLISH, session);
    }

    private static JwtAuthenticationToken jwt(String actor, String jti, long expiresAtMillis) {
        Jwt jwt = Jwt.withTokenValue("test-token")
                .header("alg", "none")
                .subject(actor)
                .claim("jti", jti)
                .issuedAt(Instant.ofEpochMilli(1_000L))
                .expiresAt(Instant.ofEpochMilli(expiresAtMillis))
                .build();
        return new JwtAuthenticationToken(jwt, List.of(), actor);
    }

    private static GraphQlWebSocketRateLimitInterceptor interceptor(
            int maxOperations, Duration lifetime, AtomicLong now) {
        return new GraphQlWebSocketRateLimitInterceptor(
                true, maxOperations, 60, lifetime, now::get, new TokenDenylist());
    }
}
