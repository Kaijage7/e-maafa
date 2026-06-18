package tz.go.pmo.dmis.common.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Brute-force protection on the public login endpoint. {@code POST /v1/auth/login} is in
 * {@link SecurityPaths} (no authentication in front of it), so without a throttle an attacker can
 * spray credential guesses unbounded; each guess also drives an intentionally-slow bcrypt compare
 * ({@code AuthController}), making it a CPU-amplification vector too. This caps attempts per client IP
 * and returns {@code 429} with {@code Retry-After} once the cap is exceeded.
 *
 * <p>The path is matched with {@code getRequestURI().endsWith(...)} so it works both behind the
 * {@code /api} servlet context-path on the server and in context-less MockMvc tests. Tunable via
 * {@code dmis.security.ratelimit.login.{enabled,max-attempts,window-seconds}} (defaults: enabled,
 * 10 attempts / 60s). The windowing, client-IP resolution and 429 response live in
 * {@link AbstractRateLimitFilter} / {@link FixedWindowRateLimiter}.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class LoginRateLimitFilter extends AbstractRateLimitFilter {

    static final String LOGIN_PATH = "/v1/auth/login";

    @Autowired
    public LoginRateLimitFilter(
            @Value("${dmis.security.ratelimit.login.enabled:true}") boolean enabled,
            @Value("${dmis.security.ratelimit.login.max-attempts:10}") int maxAttempts,
            @Value("${dmis.security.ratelimit.login.window-seconds:60}") long windowSeconds) {
        this(enabled, maxAttempts, windowSeconds, System::currentTimeMillis);
    }

    /** Visible for testing — an injectable clock makes the fixed window deterministic. */
    LoginRateLimitFilter(boolean enabled, int maxAttempts, long windowSeconds, LongSupplier clock) {
        super(enabled, maxAttempts, windowSeconds, clock);
    }

    @Override
    protected boolean shouldLimit(HttpServletRequest request) {
        String uri = request.getRequestURI();
        return "POST".equalsIgnoreCase(request.getMethod()) && uri != null && uri.endsWith(LOGIN_PATH);
    }
}
