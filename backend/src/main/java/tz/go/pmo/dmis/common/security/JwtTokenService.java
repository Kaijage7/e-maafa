package tz.go.pmo.dmis.common.security;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

/**
 * Mints the platform's bearer tokens. ONE place defines the claim shape so login and any future
 * token issuer cannot drift:
 * <ul>
 *   <li>{@code sub} = the numeric {@code public.users.id} (string form);</li>
 *   <li>{@code jti} = unique id for logout denylist;</li>
 *   <li>{@code realm_access.roles} + {@code permissions} for RBAC;</li>
 *   <li>{@code token_use} optional limited-purpose claim ({@code password_change}/{@code mfa_enroll}).</li>
 * </ul>
 */
@Service
public class JwtTokenService {

    private final JwtEncoder encoder;
    private final String issuer;
    private final long ttlMinutes;
    private final long limitedTtlMinutes;

    public JwtTokenService(JwtEncoder encoder,
                           @Value("${dmis.auth.jwt.issuer:dmis}") String issuer,
                           @Value("${dmis.auth.jwt.ttl-minutes:30}") long ttlMinutes,
                           @Value("${dmis.auth.jwt.limited-ttl-minutes:15}") long limitedTtlMinutes) {
        this.encoder = encoder;
        this.issuer = issuer;
        this.ttlMinutes = ttlMinutes;
        this.limitedTtlMinutes = limitedTtlMinutes;
    }

    /** Full session token (all roles + permissions). */
    public String mint(long userId, String name, String email, List<String> roles, List<String> permissions) {
        return mintInternal(userId, name, email, roles, permissions, null, ttlMinutes);
    }

    /**
     * Limited-purpose token with empty roles/permissions and a {@code token_use} claim.
     * Enforced by {@link RestrictedTokenUseFilter}.
     */
    public String mintLimited(long userId, String name, String email, String tokenUse) {
        return mintInternal(userId, name, email, List.of(), List.of(), tokenUse, limitedTtlMinutes);
    }

    private String mintInternal(long userId, String name, String email,
                                List<String> roles, List<String> permissions,
                                String tokenUse, long ttl) {
        Instant now = Instant.now();
        JwtClaimsSet.Builder builder = JwtClaimsSet.builder()
                .issuer(issuer)
                .issuedAt(now)
                .expiresAt(now.plus(ttl, ChronoUnit.MINUTES))
                .subject(Long.toString(userId))
                .id(UUID.randomUUID().toString())
                .claim("realm_access", Map.of("roles", roles == null ? List.of() : roles))
                .claim("permissions", permissions == null ? List.of() : permissions)
                .claim("name", name == null ? "" : name)
                .claim("preferred_username", email == null ? "" : email)
                .claim("email", email == null ? "" : email);
        if (tokenUse != null && !tokenUse.isBlank()) {
            builder.claim("token_use", tokenUse);
        }
        return encoder.encode(JwtEncoderParameters.from(
                        JwsHeader.with(org.springframework.security.oauth2.jose.jws.MacAlgorithm.HS256).build(),
                        builder.build()))
                .getTokenValue();
    }
}
