package tz.go.pmo.dmis.common.security;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
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
 *   <li>{@code sub} = the numeric {@code public.users.id} (string form) — the single subject
 *       contract {@link CurrentUserResolver} and the audit-actor resolution rely on;</li>
 *   <li>{@code realm_access.roles} = the user's SRS role names, which
 *       {@link KeycloakRealmRoleConverter} maps to {@code ROLE_*} authorities for {@code hasAnyRole};</li>
 *   <li>{@code name} / {@code preferred_username} / {@code email} = display + audit identity;</li>
 *   <li>{@code iss}/{@code iat}/{@code exp} = issuer + validity window enforced by the decoder.</li>
 * </ul>
 */
@Service
public class JwtTokenService {

    private final JwtEncoder encoder;
    private final String issuer;
    private final long ttlMinutes;

    public JwtTokenService(JwtEncoder encoder,
                           @Value("${dmis.auth.jwt.issuer:dmis}") String issuer,
                           @Value("${dmis.auth.jwt.ttl-minutes:720}") long ttlMinutes) {
        this.encoder = encoder;
        this.issuer = issuer;
        this.ttlMinutes = ttlMinutes;
    }

    /** Mint a signed HS256 token for the authenticated user. */
    public String mint(long userId, String name, String email, List<String> roles, List<String> permissions) {
        Instant now = Instant.now();
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .issuedAt(now)
                .expiresAt(now.plus(ttlMinutes, ChronoUnit.MINUTES))
                .subject(Long.toString(userId))
                .claim("realm_access", Map.of("roles", roles == null ? List.of() : roles))
                .claim("permissions", permissions == null ? List.of() : permissions)
                .claim("name", name == null ? "" : name)
                .claim("preferred_username", email == null ? "" : email)
                .claim("email", email == null ? "" : email)
                .build();
        return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(org.springframework.security.oauth2.jose.jws.MacAlgorithm.HS256).build(), claims))
                .getTokenValue();
    }
}
