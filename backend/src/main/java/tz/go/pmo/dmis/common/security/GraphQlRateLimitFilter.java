package tz.go.pmo.dmis.common.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Per-client defense-in-depth for the shared GraphQL endpoint. Query complexity controls work
 * inside one operation; this filter also limits operation frequency before parsing/execution.
 * Multi-instance production must retain a matching shared limit at the trusted edge.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class GraphQlRateLimitFilter extends AbstractRateLimitFilter {

    @Autowired
    public GraphQlRateLimitFilter(
            @Value("${dmis.security.ratelimit.graphql-enabled:true}") boolean enabled,
            @Value("${dmis.security.ratelimit.graphql-max:300}") int maxRequests,
            @Value("${dmis.security.ratelimit.graphql-window-seconds:60}") long windowSeconds) {
        this(enabled, maxRequests, windowSeconds, System::currentTimeMillis);
    }

    GraphQlRateLimitFilter(boolean enabled, int maxRequests, long windowSeconds, LongSupplier clock) {
        super(enabled, maxRequests, windowSeconds, clock);
    }

    @Override
    protected boolean shouldLimit(HttpServletRequest request) {
        if (!"POST".equalsIgnoreCase(request.getMethod())) {
            return false;
        }
        String contextPath = request.getContextPath() == null ? "" : request.getContextPath();
        return (contextPath + "/graphql").equals(request.getRequestURI());
    }
}
