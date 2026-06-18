package tz.go.pmo.dmis.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Local-profile persona filter. It lets developers and the E2E harness act as a chosen set of roles
 * via the {@code X-Local-Roles} header (comma-separated), without a Keycloak server — but it now
 * coexists with real bearer-token auth and real method security:
 *
 * <ul>
 *   <li><b>Yields to a real token.</b> If the request carries {@code Authorization: Bearer ...}, this
 *       filter does nothing and the resource-server JWT validation handles it — so the real login
 *       path is exercised end-to-end even locally.</li>
 *   <li><b>Real numeric subject.</b> For a tokenless request it resolves the {@code sub} to an actual
 *       {@code users.id} of someone holding the chosen role, so {@link CurrentUserResolver} attributes
 *       audit-who to a real user (not the {@code admin@example.com} fallback the old synthetic sub
 *       forced).</li>
 *   <li><b>Least-privilege testing.</b> With {@code X-Local-Roles=DAS} only the DAS gates pass — so
 *       {@code @PreAuthorize} 403s are observable locally. With no header it falls back to the full
 *       canonical role set ({@link Authz#ALL}) so existing flows and the puppeteer harness keep working.</li>
 * </ul>
 *
 * <p>Instantiated as a {@code @Component} (needs {@link JdbcTemplate}) only under the {@code local}
 * profile, and wired into {@link LocalSecurityConfig}. Never active in any shared/production profile.
 */
@Component
@Profile("local")
public class LocalAuthFilter extends OncePerRequestFilter {

    private final JdbcTemplate jdbc;
    /** role name -> a representative users.id, cached so the persona resolution isn't a per-request query. */
    private final Map<String, Long> roleUserCache = new ConcurrentHashMap<>();

    public LocalAuthFilter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");
        // A real signed JWT wins — let the resource-server filter validate it. We only yield for a
        // JWT-SHAPED bearer (header.payload.signature = two dots). Any other bearer shape must NOT
        // reach the JWT decoder (it would 401 as "malformed"); it falls through to the local persona.
        if (authHeader != null && authHeader.startsWith("Bearer ") && isJwtShaped(authHeader.substring(7))) {
            chain.doFilter(request, response);
            return;
        }
        SecurityContextHolder.getContext().setAuthentication(authFor(request.getHeader("X-Local-Roles")));
        chain.doFilter(request, response);
    }

    /** A JWS (the platform's signed token) has exactly two dots; the EW SSO HMAC token has one. */
    private static boolean isJwtShaped(String token) {
        return token != null && token.chars().filter(c -> c == '.').count() == 2;
    }

    private Authentication authFor(String rolesHeader) {
        List<String> roles = StringUtils.hasText(rolesHeader)
                ? Arrays.stream(rolesHeader.split(",")).map(String::trim).filter(StringUtils::hasText).toList()
                : List.of(Authz.ALL);
        Long subjectId = resolveSubjectId(roles);
        Jwt jwt = Jwt.withTokenValue("local")
                .header("alg", "none")
                .subject(Long.toString(subjectId))
                .claim("sub", Long.toString(subjectId))
                .build();
        List<GrantedAuthority> authorities = roles.stream()
                .map(role -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + role))
                .toList();
        return new JwtAuthenticationToken(jwt, authorities);
    }

    /** A real users.id for the first chosen role, so audit attribution is a genuine account. */
    private Long resolveSubjectId(List<String> roles) {
        String primary = roles.isEmpty() ? Authz.SUPER_ADMIN : roles.get(0);
        return roleUserCache.computeIfAbsent(primary, role -> {
            Long byRole = jdbc.query(
                    "select min(mhr.model_id) from public.model_has_roles mhr "
                            + "join public.roles r on r.id = mhr.role_id where r.name = ?",
                    rs -> rs.next() && rs.getObject(1) != null ? rs.getLong(1) : null, role);
            if (byRole != null) {
                return byRole;
            }
            Long admin = jdbc.query("select id from public.users where email = 'admin@example.com'",
                    rs -> rs.next() ? rs.getLong(1) : null);
            if (admin != null) {
                return admin;
            }
            Long min = jdbc.query("select min(id) from public.users",
                    rs -> rs.next() && rs.getObject(1) != null ? rs.getLong(1) : null);
            return min == null ? 1L : min;
        });
    }
}
