package tz.go.pmo.dmis.common.security;

import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;

/**
 * Stateless helpers to read the authenticated actor's display name and roles from the security
 * context. The numeric {@code users.id} (the audit-actor id) is resolved by the canonical
 * {@link CurrentUserResolver} — the single subject contract is {@code sub = users.id}. The former
 * UUID {@code currentUserId()} helper was removed: it parsed {@code sub} as a UUID, which never
 * matches our numeric subject and had no callers.
 */
public final class SecurityUtils {

    private SecurityUtils() {
    }

    /** The acting user's display name ({@code name}/{@code preferred_username} claim), for audit columns. */
    public static String currentUserName() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof Jwt jwt) {
            String name = jwt.getClaimAsString("name");
            if (name == null || name.isBlank()) {
                name = jwt.getClaimAsString("preferred_username");
            }
            if (name != null && !name.isBlank()) {
                return name;
            }
        }
        return currentUserRoles().stream().findFirst().orElse("System");
    }

    /**
     * True if the authenticated actor carries the given authority — typically a matrix PERMISSION name (e.g.
     * {@code warehouse_and_stock.view_national}). The JWT carries permissions as authorities (the same set
     * {@code hasAuthority(...)} in {@code @PreAuthorize} matches), so this lets server-side data scoping be
     * gated by a real Roles-&-Permissions grant instead of hardcoded behaviour.
     */
    public static boolean hasAuthority(String authority) {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return false;
        }
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .anyMatch(authority::equals);
    }

    /** The acting user's role names (the {@code ROLE_} prefix stripped), for who-sees-what filtering. */
    public static Set<String> currentUserRoles() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null) {
            return Set.of();
        }
        return authentication.getAuthorities().stream()
                .map(GrantedAuthority::getAuthority)
                .filter(authority -> authority.startsWith("ROLE_"))
                .map(authority -> authority.substring("ROLE_".length()))
                .collect(Collectors.toSet());
    }
}
