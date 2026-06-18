package tz.go.pmo.dmis.common.security;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.oauth2.server.resource.web.BearerTokenResolver;
import org.springframework.security.oauth2.server.resource.web.DefaultBearerTokenResolver;

/**
 * Resolves a bearer token for the resource server ONLY when it is structurally a JWS (the platform's
 * signed token: {@code header.payload.signature} — two dots). Any other bearer is reported as absent
 * so the resource-server {@code BearerTokenAuthenticationFilter} skips it instead of rejecting it as a
 * malformed JWT.
 *
 * <p>Used under the {@code local} profile (wired in {@code LocalSecurityConfig}): a non-JWS bearer is
 * made invisible to the resource server so the request falls through to the persona
 * ({@link LocalAuthFilter}) rather than being rejected at the JWT decoder as malformed.
 */
public final class JwtShapedBearerTokenResolver implements BearerTokenResolver {

    private final BearerTokenResolver delegate = new DefaultBearerTokenResolver();

    @Override
    public String resolve(HttpServletRequest request) {
        String token = delegate.resolve(request);
        if (token == null) {
            return null;
        }
        return token.chars().filter(c -> c == '.').count() == 2 ? token : null;
    }
}
