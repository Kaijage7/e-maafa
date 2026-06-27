package tz.go.pmo.dmis.common.security;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Maps Keycloak realm roles ({@code realm_access.roles} in the JWT) onto Spring Security
 * authorities prefixed with {@code ROLE_}, so the DMIS roles (Director, DAS, Dist DC, ...)
 * can be enforced with {@code @PreAuthorize("hasRole('Director')")} at method level.
 */
public class KeycloakRealmRoleConverter implements Converter<Jwt, Collection<GrantedAuthority>> {

    @Override
    public Collection<GrantedAuthority> convert(Jwt jwt) {
        java.util.List<GrantedAuthority> authorities = new java.util.ArrayList<>();
        Map<String, Object> realmAccess = jwt.getClaimAsMap("realm_access");
        if (realmAccess != null && realmAccess.get("roles") instanceof Collection<?> roles) {
            roles.stream().map(Object::toString)
                    .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                    .forEach(authorities::add);
        }
        // Fine-grained permissions (module.action) become authorities as-is, for hasAuthority(...) RBAC.
        if (jwt.getClaim("permissions") instanceof Collection<?> perms) {
            perms.stream().map(Object::toString)
                    .map(SimpleGrantedAuthority::new)
                    .forEach(authorities::add);
        }
        return authorities;
    }
}
