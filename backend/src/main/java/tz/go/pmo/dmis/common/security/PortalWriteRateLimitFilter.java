package tz.go.pmo.dmis.common.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Set;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Abuse protection on the public, unauthenticated portal <b>write</b> surface
 * ({@code POST/PUT/PATCH/DELETE /v1/portal/**}: subscribe, unsubscribe, report-hazard, register).
 * These are {@code permitAll} and citizen-facing, so without a throttle they can be spammed.
 *
 * <p><b>GET is deliberately NOT throttled</b> — the public landing page polls portal read endpoints
 * (hero, news, gallery, map feed, counters) heavily, and rate-limiting those would degrade the site.
 * Only mutating methods are in scope. The cap is generous (default 30 / 60s per IP) so a real citizen
 * submitting a form is never blocked, while a script firing hundreds is. Tunable via
 * {@code dmis.security.ratelimit.portal.{enabled,max-attempts,window-seconds}}.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class PortalWriteRateLimitFilter extends AbstractRateLimitFilter {

    static final String PORTAL_PREFIX = "/v1/portal/";
    private static final Set<String> WRITE_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

    @Autowired
    public PortalWriteRateLimitFilter(
            @Value("${dmis.security.ratelimit.portal.enabled:true}") boolean enabled,
            @Value("${dmis.security.ratelimit.portal.max-attempts:30}") int maxAttempts,
            @Value("${dmis.security.ratelimit.portal.window-seconds:60}") long windowSeconds) {
        this(enabled, maxAttempts, windowSeconds, System::currentTimeMillis);
    }

    /** Visible for testing — an injectable clock makes the fixed window deterministic. */
    PortalWriteRateLimitFilter(boolean enabled, int maxAttempts, long windowSeconds, LongSupplier clock) {
        super(enabled, maxAttempts, windowSeconds, clock);
    }

    @Override
    protected boolean shouldLimit(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return uri != null
                && uri.contains(PORTAL_PREFIX)
                && WRITE_METHODS.contains(request.getMethod() == null ? "" : request.getMethod().toUpperCase());
    }
}
