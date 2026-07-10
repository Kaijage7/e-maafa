package tz.go.pmo.dmis.common.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * VAPT related (write API rate limit): throttle authenticated mutating API calls to blunt
 * credential-stuffed automation and mass-write abuse after a stolen session.
 * Defaults: 180 writes / 60s per client IP (GET/HEAD/OPTIONS excluded).
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class AuthenticatedWriteRateLimitFilter extends AbstractRateLimitFilter {

    @Autowired
    public AuthenticatedWriteRateLimitFilter(
            @Value("${dmis.security.ratelimit.write-enabled:true}") boolean enabled,
            @Value("${dmis.security.ratelimit.write-max:180}") int maxAttempts,
            @Value("${dmis.security.ratelimit.write-window-seconds:60}") long windowSeconds) {
        this(enabled, maxAttempts, windowSeconds, System::currentTimeMillis);
    }

    /** Test constructor. */
    AuthenticatedWriteRateLimitFilter(boolean enabled, int maxAttempts, long windowSeconds, LongSupplier clock) {
        super(enabled, maxAttempts, windowSeconds, clock);
    }

    @Override
    protected boolean shouldLimit(HttpServletRequest request) {
        String method = request.getMethod();
        if (method == null) {
            return false;
        }
        String m = method.toUpperCase();
        if ("GET".equals(m) || "HEAD".equals(m) || "OPTIONS".equals(m)) {
            return false;
        }
        String path = request.getRequestURI();
        if (path == null) {
            return false;
        }
        // Login/forgot already have their own limiter; portal writes too.
        if (path.contains("/v1/auth/login")
                || path.contains("/v1/auth/forgot-password")
                || path.contains("/v1/auth/reset-password")
                || path.contains("/v1/portal/")
                || path.contains("/v1/webhooks/")) {
            return false;
        }
        return path.contains("/v1/");
    }
}
