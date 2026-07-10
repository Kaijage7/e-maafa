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
import org.springframework.beans.factory.annotation.Value;
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
 * Local-profile persona filter. Coexists with real bearer-token auth and method security.
 *
 * <p><b>Security reassessment 2026-07-10:</b> default god-mode (tokenless Super Admin) is
 * <strong>OFF</strong>. Tokenless requests stay anonymous and protected APIs return 401 — same
 * posture as production for security assessment. Opt-in:
 * <ul>
 *   <li>{@code X-Local-Roles: DAS} (or Super Admin, …) injects that persona for E2E;</li>
 *   <li>{@code dmis.security.local-god-mode=true} restores legacy full-access without a header
 *       (dev convenience only — never production).</li>
 * </ul>
 */
@Component
@Profile("local")
public class LocalAuthFilter extends OncePerRequestFilter {

    private final JdbcTemplate jdbc;
    private final PermissionResolver permissions;
    private final boolean godModeDefault;
    private final Map<String, Long> roleUserCache = new ConcurrentHashMap<>();

    public LocalAuthFilter(JdbcTemplate jdbc,
                           PermissionResolver permissions,
                           @Value("${dmis.security.local-god-mode:false}") boolean godModeDefault) {
        this.jdbc = jdbc;
        this.permissions = permissions;
        this.godModeDefault = godModeDefault;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ") && isJwtShaped(authHeader.substring(7))) {
            chain.doFilter(request, response);
            return;
        }
        String rolesHeader = request.getHeader("X-Local-Roles");
        if (!StringUtils.hasText(rolesHeader) && !godModeDefault) {
            // Fail closed: no persona, no token → leave SecurityContext empty → 401 on protected paths.
            chain.doFilter(request, response);
            return;
        }
        SecurityContextHolder.getContext().setAuthentication(authFor(rolesHeader));
        chain.doFilter(request, response);
    }

    private static boolean isJwtShaped(String token) {
        return token != null && token.chars().filter(c -> c == '.').count() == 2;
    }

    private Authentication authFor(String rolesHeader) {
        boolean godMode = !StringUtils.hasText(rolesHeader);
        List<String> roles = godMode
                ? List.of(Authz.ALL)
                : Arrays.stream(rolesHeader.split(",")).map(String::trim).filter(StringUtils::hasText).toList();
        Long subjectId = resolveSubjectId(roles);
        Jwt jwt = Jwt.withTokenValue("local")
                .header("alg", "none")
                .subject(Long.toString(subjectId))
                .claim("sub", Long.toString(subjectId))
                .build();
        List<GrantedAuthority> authorities = new java.util.ArrayList<>(roles.stream()
                .map(role -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + role))
                .toList());
        (godMode ? permissions.all() : permissions.forRoles(roles))
                .forEach(p -> authorities.add(new SimpleGrantedAuthority(p)));
        return new JwtAuthenticationToken(jwt, authorities);
    }

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
            // Local E2E only: any Super Admin seat, else lowest real user id — never invent id=1.
            Long superAdmin = jdbc.query(
                    "select min(mhr.model_id) from public.model_has_roles mhr "
                            + "join public.roles r on r.id = mhr.role_id where r.name = 'Super Admin'",
                    rs -> rs.next() && rs.getObject(1) != null ? rs.getLong(1) : null);
            if (superAdmin != null) {
                return superAdmin;
            }
            Long min = jdbc.query("select min(id) from public.users",
                    rs -> rs.next() && rs.getObject(1) != null ? rs.getLong(1) : null);
            return min;
        });
    }
}
