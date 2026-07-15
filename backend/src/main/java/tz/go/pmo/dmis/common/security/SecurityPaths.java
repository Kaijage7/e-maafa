package tz.go.pmo.dmis.common.security;

import java.util.Arrays;
import org.springframework.security.web.servlet.util.matcher.PathPatternRequestMatcher;
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
            // Complete TOTP after MFA_REQUIRED — no full session yet (only challengeToken from login).
            // Rate-limited with login (LoginRateLimitFilter) to blunt code guessing.
            "/v1/auth/2fa/verify",
            // Self-service password reset (the caller has no session by definition). Both are
            // anti-enumeration (uniform responses) and rate-limited by LoginRateLimitFilter.
            "/v1/auth/forgot-password",
            "/v1/auth/reset-password",
            // Operational liveness/readiness probes only (not /actuator root / env / beans).
            "/actuator/health",
            "/actuator/health/**",
            // OpenAPI JSON — public only so controlled local/dev contract generation works;
            // production disables springdoc entirely (application-prod.yml). Swagger UI browser
            // assets are intentionally not packaged. Never expose /actuator/env or similar.
            "/v3/api-docs/**",
            // Citizen-facing portal — public by design (mirrors Laravel's public routes).
            "/v1/portal/**",
            // F59/F60: M-Gov (and compatible) SMS delivery-status callbacks — no JWT; optional shared secret.
            "/v1/webhooks/mgov/dlr",
            "/v1/webhooks/sms/dlr",
            // Public static uploads (news/gallery/publications/ew-product images served to the public site).
            // The RESTRICTED_STORAGE_PATHS carve-out below is matched FIRST in both chains, so operational
            // attachments (casualty photos etc.) under this same root are NOT covered by this permitAll.
            "/storage/**"
            // NOTE: the EW endpoints (/v1/ew/*) are deliberately NOT here — they require authentication
            // and method-level authorization like the rest of the API. The old Streamlit SSO callbacks
            // (the unauthenticated /user contract) have been retired, so no EW path is publicly open.
    };

    /**
     * Storage sub-paths that hold RESTRICTED operational attachments and must NOT be publicly readable
     * even though they live under the same {@code /storage} root as public portal content (VAPT ii
     * remediation — casualty/damage photos and other operational uploads were world-readable with zero
     * auth). These are carved out of the public {@code /storage/**} rule and require authentication.
     * Captured from the writing controllers so the list stays traceable — ADD a prefix here whenever a
     * module writes operational / PII attachments:
     * <ul>
     *   <li>{@code assessments/} — damage-assessment field photos (casualties/property/PII) — AssessmentController</li>
     *   <li>{@code incident_photos/}, {@code incident_videos/} — incident media — IncidentController</li>
     *   <li>{@code dissemination_uploads/} — One Health dissemination files — OneHealthDisseminationController</li>
     *   <li>{@code warnings/} — raw EW bulletin ingest attachments — EwBulletinIngestController</li>
     *   <li>{@code knowledge/} — Recovery knowledge repository documents — KnowledgeRepositoryController</li>
     * </ul>
     * The security chains enforce authentication for these prefixes before the static resource handler;
     * {@link RestrictedStorageAccessFilter} then adds module permissions, area checks for assessment and
     * mapped incident media, and fail-closed handling for unmapped incident-media filenames. Prefixes that
     * represent national/module documents rather than an area-owned row retain their module-level guard.
     */
    public static final String[] RESTRICTED_STORAGE_PATHS = {
            "/storage/assessments/**",
            "/storage/incident_photos/**",
            "/storage/incident_videos/**",
            "/storage/dissemination_uploads/**",
            "/storage/warnings/**",
            "/storage/knowledge/**",
            // Generated official documents (DlnaController.storeGenerated → generated_reports registry).
            "/storage/reports/**",
    };

    /** Restricted paths as path-pattern matchers (same static-resource reason as {@link #publicMatchers()}). */
    public static RequestMatcher[] restrictedStorageMatchers() {
        PathPatternRequestMatcher.Builder paths = PathPatternRequestMatcher.withDefaults();
        return Arrays.stream(RESTRICTED_STORAGE_PATHS)
                .map(paths::matcher)
                .toArray(RequestMatcher[]::new);
    }

    /**
     * The public paths as path-pattern matchers. We must NOT pass the raw strings to
     * {@code requestMatchers(String...)}: with Spring MVC on the classpath that builds
     * {@code MvcRequestMatcher}, which only matches paths backed by an {@code @RequestMapping}. The
     * static-resource path {@code /storage/**} (served by {@code ResourceHttpRequestHandler}, see
     * {@code PublicStorageConfig}) is invisible to the MVC introspector, so it would fall through to
     * {@code anyRequest().authenticated()} and 401 anonymously (masked in {@code local} only
     * because the persona authenticates the request). Path-pattern matching is path-based and also
     * avoids the deprecated Ant matcher scheduled for removal from Spring Security.
     */
    public static RequestMatcher[] publicMatchers() {
        PathPatternRequestMatcher.Builder paths = PathPatternRequestMatcher.withDefaults();
        return Arrays.stream(PUBLIC_PATHS)
                .map(paths::matcher)
                .toArray(RequestMatcher[]::new);
    }
}
