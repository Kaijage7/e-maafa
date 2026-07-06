package tz.go.pmo.dmis.common.security;

import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.HeadersConfigurer;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

/**
 * Production security hardening shared by both filter chains: an explicit CORS allow-list and
 * a standard set of security response headers (HSTS, anti-clickjacking, nosniff, referrer policy).
 * The full document Content-Security-Policy belongs on the host that serves the SPA's HTML (nginx);
 * here we set {@code frame-ancestors 'none'} as defence-in-depth for the API itself.
 */
@Configuration
public class SecurityHardeningConfig {

    /**
     * Explicit CORS allow-list. Origins come from {@code dmis.security.cors.allowed-origins}
     * (comma-separated). Under the {@code local} profile it falls back to the SPA dev origin; in any
     * non-local profile the origins MUST be configured explicitly — startup fails fast rather than
     * silently shipping the dev origin to production (VAPT-related hardening). The SPA authenticates with
     * a bearer token (not cookies), so credentials are not allowed.
     */
    @Bean
    CorsConfigurationSource corsConfigurationSource(
            @Value("${dmis.security.cors.allowed-origins:}") String allowedOrigins,
            org.springframework.core.env.Environment env) {
        List<String> origins = Arrays.stream(allowedOrigins.split(","))
                .map(String::trim).filter(s -> !s.isEmpty()).toList();
        boolean local = Arrays.asList(env.getActiveProfiles()).contains("local");
        if (origins.isEmpty()) {
            if (!local) {
                throw new IllegalStateException("dmis.security.cors.allowed-origins must be set to the "
                        + "production SPA origin(s) in a non-local profile — refusing to default to the dev origin.");
            }
            origins = List.of("http://localhost:4200", "http://127.0.0.1:4200"); // local dev only — both spellings of the ng-serve origin
        }
        CorsConfiguration cors = new CorsConfiguration();
        cors.setAllowedOrigins(origins);
        cors.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        cors.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Local-Roles", "Accept"));
        cors.setExposedHeaders(List.of("Content-Disposition"));
        cors.setAllowCredentials(false);
        cors.setMaxAge(3600L);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cors);
        return source;
    }

    /** Standard security headers, applied identically in both profiles. */
    public static Customizer<HeadersConfigurer<HttpSecurity>> securityHeaders() {
        return headers -> headers
                .httpStrictTransportSecurity(hsts -> hsts.includeSubDomains(true).maxAgeInSeconds(31_536_000))
                .frameOptions(HeadersConfigurer.FrameOptionsConfig::deny)
                .contentTypeOptions(Customizer.withDefaults())
                .referrerPolicy(rp -> rp.policy(ReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN))
                .contentSecurityPolicy(csp -> csp.policyDirectives("frame-ancestors 'none'"));
    }
}
