package tz.go.pmo.dmis.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * Locks the public allowlist: it must cover the static-resource path {@code /storage/**} (served by
 * {@code ResourceHttpRequestHandler}, not an {@code @RequestMapping}). Path-pattern matching covers it;
 * {@code MvcRequestMatcher} (what {@code requestMatchers(String...)} builds when MVC is present) does
 * not — which 401'd public files anonymously in the non-local profile.
 */
class SecurityPathsTest {

    private boolean isPublic(String method, String path) {
        MockHttpServletRequest request = new MockHttpServletRequest(method, path);
        request.setServletPath(path);
        return Arrays.stream(SecurityPaths.publicMatchers()).anyMatch((RequestMatcher m) -> m.matches(request));
    }

    @Test
    void staticStorageFilesArePublic() {
        assertThat(isPublic("GET", "/storage/publications/strategy.pdf")).isTrue();
        assertThat(isPublic("GET", "/storage/portal/news/img.png")).isTrue();
    }

    @Test
    void portalAndLoginAndDocsArePublic() {
        assertThat(isPublic("POST", "/v1/auth/login")).isTrue();
        // MFA_REQUIRED completion has no session — only challengeToken from login
        assertThat(isPublic("POST", "/v1/auth/2fa/verify")).isTrue();
        assertThat(isPublic("GET", "/v1/portal/landing")).isTrue();
        assertThat(isPublic("GET", "/v3/api-docs")).isTrue();
        assertThat(isPublic("GET", "/swagger-ui.html")).isFalse();
        assertThat(isPublic("GET", "/actuator/health/readiness")).isTrue();
        // F59/F60 DLR webhooks (optional shared secret enforced in controller, not JWT)
        assertThat(isPublic("POST", "/v1/webhooks/mgov/dlr")).isTrue();
        assertThat(isPublic("POST", "/v1/webhooks/sms/dlr")).isTrue();
    }

    @Test
    void protectedWritesAreNotPublic() {
        assertThat(isPublic("POST", "/v1/settings/users")).isFalse();
        // GraphQL shares one transport URL, so every operation must enter authenticated security
        // before field-level @PreAuthorize rules make the finer authorization decision.
        assertThat(isPublic("POST", "/graphql")).isFalse();
        assertThat(isPublic("GET", "/graphql")).isFalse();
        assertThat(isPublic("GET", "/v1/sync/stream")).isFalse();
        assertThat(isPublic("GET", "/v1/sync/changes")).isFalse();
        assertThat(isPublic("GET", "/v1/onehealth/events")).isFalse();
        assertThat(isPublic("GET", "/user")).isFalse();
        // Actuator env/beans must never be anonymous-public (only health probes).
        assertThat(isPublic("GET", "/actuator/env")).isFalse();
        assertThat(isPublic("GET", "/actuator")).isFalse();
    }

    @Test
    void restrictedStorageRequiresAuthMatcher() {
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/storage/assessments/1/x.png");
        request.setServletPath("/storage/assessments/1/x.png");
        boolean restricted = Arrays.stream(SecurityPaths.restrictedStorageMatchers())
                .anyMatch(m -> m.matches(request));
        assertThat(restricted).isTrue();
    }
}
