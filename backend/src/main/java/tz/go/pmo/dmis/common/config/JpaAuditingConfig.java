package tz.go.pmo.dmis.common.config;

import java.util.Optional;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * Supplies the current principal name for the {@code created_by} / {@code updated_by}
 * audit columns. Resolves the authenticated subject (Keycloak username/subject) or
 * falls back to {@code system} for unauthenticated background work (e.g. the outbox relay).
 */
@Configuration
public class JpaAuditingConfig {

    public static final String SYSTEM_ACTOR = "system";

    @Bean
    AuditorAware<String> auditorProvider() {
        return () -> {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || !auth.isAuthenticated() || "anonymousUser".equals(auth.getPrincipal())) {
                return Optional.of(SYSTEM_ACTOR);
            }
            return Optional.of(auth.getName());
        };
    }
}
