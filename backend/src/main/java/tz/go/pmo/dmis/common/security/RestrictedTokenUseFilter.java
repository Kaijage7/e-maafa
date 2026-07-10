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
 * Enforces limited-purpose JWTs issued for forced password change or MFA enrollment.
 * Full session tokens have no {@code token_use} claim and pass through.
 * Wired inside the security filter chain after {@link TokenRevocationFilter}.
 */
@Component
public class RestrictedTokenUseFilter extends OncePerRequestFilter {

    public static final String USE_PASSWORD_CHANGE = "password_change";
    public static final String USE_MFA_ENROLL = "mfa_enroll";

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken jwtAuth)) {
            chain.doFilter(request, response);
            return;
        }
        Object principal = jwtAuth.getPrincipal();
        if (!(principal instanceof Jwt jwt)) {
            chain.doFilter(request, response);
            return;
        }
        String use = jwt.getClaimAsString("token_use");
        if (use == null || use.isBlank()) {
            chain.doFilter(request, response);
            return;
        }
        String path = request.getRequestURI();
        String ctx = request.getContextPath();
        if (ctx != null && !ctx.isEmpty() && path.startsWith(ctx)) {
            path = path.substring(ctx.length());
        }
        if (allowed(use, path, request.getMethod())) {
            chain.doFilter(request, response);
            return;
        }
        response.setStatus(HttpStatus.FORBIDDEN.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write(
                "{\"error\":\"restricted_token\",\"message\":\"This session can only complete "
                        + use.replace('_', ' ') + ". Finish that step, then sign in again.\"}");
    }

    private static boolean allowed(String use, String path, String method) {
        if (path == null) {
            return false;
        }
        // Always allow logout so a restricted session can be discarded.
        if ("POST".equalsIgnoreCase(method) && path.equals("/v1/auth/logout")) {
            return true;
        }
        if (USE_PASSWORD_CHANGE.equals(use)) {
            return path.equals("/v1/auth/change-password");
        }
        if (USE_MFA_ENROLL.equals(use)) {
            return path.startsWith("/v1/auth/2fa/") || path.equals("/v1/auth/change-password");
        }
        return false;
    }
}
