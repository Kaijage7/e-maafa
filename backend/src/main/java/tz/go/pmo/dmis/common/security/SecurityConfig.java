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
import org.springframework.security.web.SecurityFilterChain;

/**
 * Stateless security for every non-{@code local} profile: the API is an OAuth2 resource server.
 * It validates the platform's self-issued HS256 token via the {@code JwtDecoder} bean
 * ({@link JwtSecurityConfig}); the Keycloak {@code issuer-uri} remains a documented alternative but
 * is overridden by that bean. No sessions/cookies (CSRF disabled), and authorization is by SRS
 * roles enforced per endpoint with {@code @PreAuthorize} (method security on here).
 */
@Configuration
@Profile("!local")
@EnableMethodSecurity
public class SecurityConfig {

    private final JwtAuthenticationConverter jwtAuthenticationConverter;

    public SecurityConfig(JwtAuthenticationConverter jwtAuthenticationConverter) {
        this.jwtAuthenticationConverter = jwtAuthenticationConverter;
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
                .csrf(AbstractHttpConfigurer::disable)
                .cors(Customizer.withDefaults())
                .headers(SecurityHardeningConfig.securityHeaders())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                // Login brute-force throttling is handled by LoginRateLimitFilter (auto-registered).
                .authorizeHttpRequests(authorize -> authorize
                        .requestMatchers(SecurityPaths.publicMatchers()).permitAll()
                        .anyRequest().authenticated())
                .oauth2ResourceServer(oauth -> oauth.jwt(jwt -> jwt.jwtAuthenticationConverter(jwtAuthenticationConverter)))
                // Module-level permission gate runs after token auth populates the SecurityContext.
                .addFilterAfter(new ModuleGuardFilter(),
                        org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter.class);
        return http.build();
    }
}
