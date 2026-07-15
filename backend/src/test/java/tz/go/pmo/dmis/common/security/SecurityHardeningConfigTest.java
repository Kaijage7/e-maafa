package tz.go.pmo.dmis.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;

class SecurityHardeningConfigTest {

    @Test
    void productionCorsAllowsIdempotencyAndExposesCreatedResourceLocation() {
        MockEnvironment environment = new MockEnvironment();
        environment.setActiveProfiles("prod");
        CorsConfigurationSource source = new SecurityHardeningConfig()
                .corsConfigurationSource("https://app.example.go.tz", environment);
        MockHttpServletRequest request = new MockHttpServletRequest("OPTIONS", "/api/v1/mobile/incidents");
        request.setServletPath("/api/v1/mobile/incidents");

        CorsConfiguration cors = source.getCorsConfiguration(request);

        assertThat(cors).isNotNull();
        assertThat(cors.getAllowedHeaders()).contains("Idempotency-Key");
        assertThat(cors.getExposedHeaders()).contains("Location");
        assertThat(cors.getExposedHeaders()).doesNotContain("Idempotency-Replayed");
        assertThat(cors.getAllowedHeaders()).doesNotContain("X-Local-Roles", "X-Local-User-Id");
    }
}
