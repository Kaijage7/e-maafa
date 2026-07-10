package tz.go.pmo.dmis.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Rejects JWTs whose {@code jti} was revoked via logout (or admin revoke). Wired
 * <em>inside</em> the security filter chain after the bearer filter (not as a bare servlet filter),
 * so the SecurityContext is already populated.
 */
@Component
public class TokenRevocationFilter extends OncePerRequestFilter {

    private final TokenDenylist denylist;

    public TokenRevocationFilter(TokenDenylist denylist) {
        this.denylist = denylist;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwtAuth) {
            Object principal = jwtAuth.getPrincipal();
            if (principal instanceof Jwt jwt) {
                String jti = jwt.getId();
                if (jti == null) {
                    jti = jwt.getClaimAsString("jti");
                }
                if (denylist.isRevoked(jti)) {
                    SecurityContextHolder.clearContext();
                    response.setStatus(HttpStatus.UNAUTHORIZED.value());
                    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
                    response.getWriter().write(
                            "{\"error\":\"token_revoked\",\"message\":\"Session ended. Please sign in again.\"}");
                    return;
                }
            }
        }
        chain.doFilter(request, response);
    }
}
