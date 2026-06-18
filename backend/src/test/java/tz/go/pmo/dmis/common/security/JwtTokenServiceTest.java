package tz.go.pmo.dmis.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;

/**
 * Pure (context-free) proof of the token contract: login mints a real signed JWT whose
 * subject is the numeric {@code users.id} and which carries the SRS roles, and the resource-server
 * decoder validates it — plus the fail-fast that refuses the dev/default secret outside {@code local}.
 */
class JwtTokenServiceTest {

    /** A valid HS256 secret (>= 32 bytes), distinct from the bundled dev default. */
    private static final String GOOD_SECRET = "test-secret-test-secret-test-secret-0123456789";

    private JwtEncoder encoder(String secret, String... profiles) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profiles);
        return new JwtSecurityConfig(env, secret).jwtEncoder();
    }

    private JwtDecoder decoder(String secret, String... profiles) {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles(profiles);
        return new JwtSecurityConfig(env, secret).jwtDecoder("dmis");
    }

    @Test
    void mintsTokenWhoseSubjectIsNumericUserIdAndCarriesRealmRoles() {
        String token = new JwtTokenService(encoder(GOOD_SECRET, "test"), "dmis", 720)
                .mint(42L, "Jane Doe", "jane@pmo.go.tz", List.of("Director", "EOCC"));

        Jwt jwt = decoder(GOOD_SECRET, "test").decode(token);

        assertThat(jwt.getSubject()).isEqualTo("42");
        assertThat(jwt.getClaimAsString("name")).isEqualTo("Jane Doe");
        assertThat(jwt.getClaimAsString("email")).isEqualTo("jane@pmo.go.tz");
        Map<String, Object> realm = jwt.getClaimAsMap("realm_access");
        assertThat(realm.get("roles")).isEqualTo(List.of("Director", "EOCC"));
        assertThat(jwt.getExpiresAt()).isAfter(jwt.getIssuedAt());
        assertThat(jwt.getClaimAsString("iss")).isEqualTo("dmis");
    }

    @Test
    void tokenSignedWithOneSecretIsRejectedByAnother() {
        String token = new JwtTokenService(encoder(GOOD_SECRET, "test"), "dmis", 720)
                .mint(1L, "A", "a@b.go.tz", List.of("Super Admin"));

        JwtDecoder otherKey = decoder("another-secret-another-secret-1234567890ab", "test");
        assertThatThrownBy(() -> otherKey.decode(token)).isInstanceOf(Exception.class);
    }

    @Test
    void nonLocalProfileRefusesBlankSecret() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");
        assertThatThrownBy(() -> new JwtSecurityConfig(env, ""))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void nonLocalProfileRefusesTheBundledDevDefaultSecret() {
        MockEnvironment env = new MockEnvironment();
        env.setActiveProfiles("prod");
        assertThatThrownBy(() -> new JwtSecurityConfig(env, JwtSecurityConfig.DEV_SECRET))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void localProfileAllowsBlankSecretUsingDevDefault() {
        // Must NOT throw; the round-trip works with the bundled dev default under local.
        String token = new JwtTokenService(encoder("", "local"), "dmis", 720)
                .mint(7L, "Dev", "dev@local", List.of("Super Admin"));
        assertThat(decoder("", "local").decode(token).getSubject()).isEqualTo("7");
    }
}
