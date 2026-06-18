package tz.go.pmo.dmis.common.security;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import com.nimbusds.jose.proc.SecurityContext;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;

/**
 * Wires the self-issued JWT path: the platform both <em>mints</em> (login) and <em>validates</em>
 * (resource server) HS256 tokens signed with a single shared secret ({@code dmis.auth.jwt.secret}).
 * There is no external Keycloak instance, so this is the runnable, fully-testable identity story;
 * the Keycloak {@code issuer-uri} in application.yml stays as a documented alternative but is
 * overridden by the {@code JwtDecoder} bean here.
 *
 * <p><b>Fail-fast:</b> in any non-{@code local} profile, startup aborts if the secret is blank or
 * still the built-in dev default — a deployed instance must inject a real secret (env
 * {@code DMIS_AUTH_JWT_SECRET}). HS256 requires a key of at least 256 bits, so the secret must be
 * &ge; 32 bytes.
 */
@Configuration
public class JwtSecurityConfig {

    /** The built-in dev secret. Usable ONLY under the local profile; rejected fail-fast elsewhere. */
    static final String DEV_SECRET = "dmis-local-dev-jwt-secret-change-in-prod-please-0123456789abcdef";

    private final String effectiveSecret;

    public JwtSecurityConfig(Environment environment,
                             @Value("${dmis.auth.jwt.secret:}") String configuredSecret) {
        boolean local = Arrays.asList(environment.getActiveProfiles()).contains("local");
        String secret = configuredSecret == null ? "" : configuredSecret;
        if (local) {
            // Local dev may run without any configured secret — use the bundled dev default.
            this.effectiveSecret = secret.isBlank() ? DEV_SECRET : secret;
            return;
        }
        if (secret.isBlank() || DEV_SECRET.equals(secret)) {
            throw new IllegalStateException(
                    "dmis.auth.jwt.secret must be set to a real, non-default value (>= 32 bytes) in a "
                            + "non-local profile. Set env DMIS_AUTH_JWT_SECRET. Refusing to start with the dev default.");
        }
        if (secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException(
                    "dmis.auth.jwt.secret must be at least 32 bytes (256 bits) for HS256.");
        }
        this.effectiveSecret = secret;
    }

    private SecretKey secretKey() {
        return new SecretKeySpec(effectiveSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
    }

    @Bean
    org.springframework.security.oauth2.jwt.JwtEncoder jwtEncoder() {
        return new org.springframework.security.oauth2.jwt.NimbusJwtEncoder(
                new ImmutableSecret<SecurityContext>(secretKey()));
    }

    @Bean
    org.springframework.security.oauth2.jwt.JwtDecoder jwtDecoder(
            @Value("${dmis.auth.jwt.issuer:dmis}") String issuer) {
        org.springframework.security.oauth2.jwt.NimbusJwtDecoder decoder =
                org.springframework.security.oauth2.jwt.NimbusJwtDecoder.withSecretKey(secretKey())
                        .macAlgorithm(MacAlgorithm.HS256)
                        .build();
        decoder.setJwtValidator(
                org.springframework.security.oauth2.jwt.JwtValidators.createDefaultWithIssuer(issuer));
        return decoder;
    }

    /**
     * Shared converter so both profile filter chains map {@code realm_access.roles -> ROLE_*}
     * identically (consolidated — no per-config copy).
     */
    @Bean
    org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter jwtAuthenticationConverter() {
        var converter = new org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter();
        converter.setJwtGrantedAuthoritiesConverter(new KeycloakRealmRoleConverter());
        return converter;
    }
}
