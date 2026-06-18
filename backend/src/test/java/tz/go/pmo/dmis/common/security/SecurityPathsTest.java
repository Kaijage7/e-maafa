package tz.go.pmo.dmis.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.web.util.matcher.RequestMatcher;

/**
 * Locks the public allowlist: it must cover the static-resource path {@code /storage/**} (served by
 * {@code ResourceHttpRequestHandler}, not an {@code @RequestMapping}). Ant matching matches it;
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
        assertThat(isPublic("GET", "/v1/portal/landing")).isTrue();
        assertThat(isPublic("GET", "/swagger-ui.html")).isTrue();
        assertThat(isPublic("GET", "/actuator/health/readiness")).isTrue();
    }

    @Test
    void protectedWritesAreNotPublic() {
        assertThat(isPublic("POST", "/v1/settings/users")).isFalse();
        assertThat(isPublic("GET", "/v1/onehealth/events")).isFalse();
        assertThat(isPublic("GET", "/user")).isFalse();
    }
}
