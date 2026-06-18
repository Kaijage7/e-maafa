package tz.go.pmo.dmis.common.security;

import java.util.Arrays;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * The single allowlist of endpoints reachable without authentication, shared by both the
 * {@code !local} ({@link SecurityConfig}) and {@code local} ({@link LocalSecurityConfig}) filter
 * chains so the two profiles cannot drift. Everything not listed here requires a valid bearer token.
 */
public final class SecurityPaths {

    private SecurityPaths() {
    }

    public static final String[] PUBLIC_PATHS = {
            // Login itself must be reachable without a token (otherwise the resource server 401s the
            // very call that mints the token — the chicken-and-egg the !local profile would have hit).
            "/v1/auth/login",
            // Operational liveness/readiness probes.
            "/actuator/health/**",
            // API docs.
            "/v3/api-docs/**",
            "/swagger-ui/**",
            "/swagger-ui.html",
            // Citizen-facing portal — public by design (mirrors Laravel's public routes).
            "/v1/portal/**",
            // Public static uploads (news/gallery/publications images served to the public site).
            "/storage/**"
            // NOTE: the EW endpoints (/v1/ew/*) are deliberately NOT here — they require authentication
            // and method-level authorization like the rest of the API. The old Streamlit SSO callbacks
            // (the unauthenticated /user contract) have been retired, so no EW path is publicly open.
    };

    /**
     * The public paths as {@link AntPathRequestMatcher}s. We must NOT pass the raw strings to
     * {@code requestMatchers(String...)}: with Spring MVC on the classpath that builds
     * {@code MvcRequestMatcher}, which only matches paths backed by an {@code @RequestMapping}. The
     * static-resource path {@code /storage/**} (served by {@code ResourceHttpRequestHandler}, see
     * {@code PublicStorageConfig}) is invisible to the MVC introspector, so it would fall through to
     * {@code anyRequest().authenticated()} and 401 anonymously (masked in {@code local} only
     * because the persona authenticates the request). Ant matching is path-based and matches it.
     */
    public static RequestMatcher[] publicMatchers() {
        return Arrays.stream(PUBLIC_PATHS)
                .map(AntPathRequestMatcher::antMatcher)
                .toArray(RequestMatcher[]::new);
    }
}
