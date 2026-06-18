package tz.go.pmo.dmis.common.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.security.config.Customizer;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.SecurityFilterChain;

/**
 * Local-only security. Unlike before, it is NOT a blanket {@code permitAll()} with method security
 * off — that silently disabled every {@code @PreAuthorize}. It now mirrors the real chain so the
 * gates are exercised where we actually run:
 *
 * <ul>
 *   <li>{@code @EnableMethodSecurity} ON — {@code @PreAuthorize} is enforced locally.</li>
 *   <li>The same self-issued HS256 token is validated (resource server + shared {@code JwtDecoder}),
 *       so the real login path works end-to-end locally.</li>
 *   <li>{@link LocalAuthFilter} authenticates tokenless requests from the {@code X-Local-Roles}
 *       persona (default = full role set), so the dev/E2E experience is preserved while real RBAC
 *       403s are observable with a single-role header.</li>
 *   <li>Same {@link SecurityPaths#PUBLIC_PATHS} allowlist, then {@code anyRequest().authenticated()}.</li>
 * </ul>
 *
 * <p>Active strictly under the {@code local} profile; must never be enabled in production.
 */
@Configuration
@Profile("local")
@EnableMethodSecurity
public class LocalSecurityConfig {

    private final LocalAuthFilter localAuthFilter;
    private final JwtAuthenticationConverter jwtAuthenticationConverter;

    public LocalSecurityConfig(LocalAuthFilter localAuthFilter,
                               JwtAuthenticationConverter jwtAuthenticationConverter) {
        this.localAuthFilter = localAuthFilter;
        this.jwtAuthenticationConverter = jwtAuthenticationConverter;
    }

    @Bean
    SecurityFilterChain localFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .headers(SecurityHardeningConfig.securityHeaders())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Login brute-force throttling is handled by LoginRateLimitFilter (auto-registered).
                // Persona auth for tokenless requests; runs before the bearer filter, and yields to a
                // real Authorization: Bearer header (see LocalAuthFilter) so both paths coexist.
                .addFilterBefore(localAuthFilter, BearerTokenAuthenticationFilter.class)
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(SecurityPaths.publicMatchers()).permitAll()
                        .anyRequest().authenticated())
                // Only JWS-shaped bearers reach the JWT decoder; the EW engine's HMAC SSO token is
                // hidden from it so it falls through to the persona instead of being 401'd.
                .oauth2ResourceServer(oauth -> oauth
                        .bearerTokenResolver(new JwtShapedBearerTokenResolver())
                        .jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter)));
        return http.build();
    }
}
