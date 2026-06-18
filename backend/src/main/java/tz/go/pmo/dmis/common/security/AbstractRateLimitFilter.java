package tz.go.pmo.dmis.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.function.LongSupplier;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Base for the per-client-IP rate-limit filters (login, public-portal writes). Each subclass only
 * declares <em>which</em> requests it guards via {@link #shouldLimit}; this base owns the common
 * plumbing — the enable flag, the {@link FixedWindowRateLimiter}, client-IP resolution, and the
 * {@code 429} response — so the windowing and HTTP details are written once.
 *
 * <p>Subclasses register as auto-detected servlet filters; each is a self-restricting pass-through
 * (every non-matching request returns immediately), so they add no behaviour to the rest of the app
 * and need no wiring into the security filter chains.
 */
abstract class AbstractRateLimitFilter extends OncePerRequestFilter {

    private final boolean enabled;
    private final LongSupplier clock;
    private final FixedWindowRateLimiter limiter;

    protected AbstractRateLimitFilter(boolean enabled, int maxPermits, long windowSeconds, LongSupplier clock) {
        this.enabled = enabled;
        this.clock = clock;
        this.limiter = new FixedWindowRateLimiter(maxPermits, Math.max(1L, windowSeconds) * 1000L);
    }

    /** True when this request is in scope for throttling (method + path). */
    protected abstract boolean shouldLimit(HttpServletRequest request);

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (!enabled || !shouldLimit(request)) {
            chain.doFilter(request, response);
            return;
        }
        long retryAfterSeconds = limiter.retryAfterSeconds(clientIp(request), clock.getAsLong());
        if (retryAfterSeconds > 0) {
            reject(response, retryAfterSeconds);
            return;
        }
        chain.doFilter(request, response);
    }

    /**
     * Trusted reverse-proxy addresses (comma-separated), from {@code DMIS_RATELIMIT_TRUSTED_PROXIES} or
     * {@code -Ddmis.security.ratelimit.trusted-proxies}. {@code X-Forwarded-For} is honoured ONLY when the
     * direct peer is one of these; otherwise the header is attacker-controlled and ignored. Empty by
     * default, so the key is the unspoofable socket address unless a trusted edge is explicitly configured.
     */
    private static final java.util.Set<String> TRUSTED_PROXIES = parseTrusted(
            System.getProperty("dmis.security.ratelimit.trusted-proxies",
                    System.getenv().getOrDefault("DMIS_RATELIMIT_TRUSTED_PROXIES", "")));

    private static java.util.Set<String> parseTrusted(String raw) {
        java.util.Set<String> set = new java.util.HashSet<>();
        if (raw != null) {
            for (String s : raw.split(",")) {
                if (!s.trim().isEmpty()) {
                    set.add(s.trim());
                }
            }
        }
        return set;
    }

    /**
     * Rate-limit key = the client address. To stop X-Forwarded-For spoofing from minting a fresh bucket
     * per request, the forwarded chain is trusted ONLY when the direct connection comes from a configured
     * trusted proxy; the key is then the right-most forwarded hop that is not itself a trusted proxy.
     * With no trusted proxy configured the key is the direct socket address (not client-controllable).
     */
    protected static String clientIp(HttpServletRequest request) {
        String peer = request.getRemoteAddr();
        String forwarded = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(forwarded) && TRUSTED_PROXIES.contains(peer)) {
            String[] hops = forwarded.split(",");
            for (int i = hops.length - 1; i >= 0; i--) {
                String hop = hops[i].trim();
                if (!hop.isEmpty() && !TRUSTED_PROXIES.contains(hop)) {
                    return hop;
                }
            }
        }
        return peer;
    }

    private static void reject(HttpServletResponse response, long retryAfterSeconds) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setHeader(HttpHeaders.RETRY_AFTER, Long.toString(retryAfterSeconds));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"error\":\"rate_limited\",\"message\":\"Too many requests. Please wait "
                        + retryAfterSeconds + "s and try again.\"}");
    }
}
