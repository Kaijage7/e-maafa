package tz.go.pmo.dmis.iam;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.JwtTokenService;

/**
 * Local login over the existing identity tables (users + Spatie roles), reproducing the existing
 * email/password auth. Verifies the BCrypt hash and returns the user with its SRS roles.
 */
@RestController
@RequestMapping("/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Identity", description = "Login (existing local auth)")
public class AuthController {

    private final JdbcTemplate jdbc;
    private final JwtTokenService tokens;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    // A constant decoy hash so login ALWAYS runs one bcrypt compare — even for an unknown email —
    // making the response time independent of whether the account exists (closes the A1 timing
    // oracle the auditor flagged: fast 401 = no user, slow 401 = user exists → email enumeration).
    private final String decoyHash = encoder.encode("constant-time-decoy");

    public record LoginRequest(String email, String password) {
    }

    public record UserDto(String name, String email, List<String> roles, List<String> permissions, String agency) {
    }

    public record LoginResponse(String token, UserDto user) {
    }

    @PostMapping("/login")
    @Operation(summary = "Authenticate with email + password (existing users table)")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        if (request.email() == null || request.password() == null) {
            return ResponseEntity.status(401).build();
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, name, email, password from public.users where lower(email) = lower(?)", request.email().trim());
        Map<String, Object> row = rows.isEmpty() ? null : rows.get(0);
        // Always run exactly one bcrypt compare (decoy hash when the user is unknown) → constant-time,
        // so an attacker cannot tell "no such user" from "wrong password" by response latency.
        String hash = row == null || row.get("password") == null ? decoyHash : (String) row.get("password");
        boolean passwordOk = encoder.matches(request.password(), hash);
        if (row == null || !passwordOk) {
            return ResponseEntity.status(401).build();
        }
        Long id = ((Number) row.get("id")).longValue();
        List<String> roles = jdbc.queryForList(
                "select r.name from public.model_has_roles mhr join public.roles r on r.id = mhr.role_id where mhr.model_id = ?",
                String.class, id);
        // Effective fine-grained permissions (module.action) granted via the user's roles — returned to the
        // client (menu + route guard) and carried in the token so the RBAC layer enforces with hasAuthority(...).
        List<String> permissions = jdbc.queryForList(
                "select distinct p.name from public.model_has_roles mhr"
                        + " join public.role_has_permissions rhp on rhp.role_id = mhr.role_id"
                        + " join public.permissions p on p.id = rhp.permission_id"
                        + " where mhr.model_id = ? order by p.name",
                String.class, id);
        // The agency this login authors for (EW entities — TMA/MoH/MoW/…), lowercased acronym, or null for
        // non-agency logins (PMO/EOCC/command/admin). The frontend uses it to lock an EW entity to its own
        // window; the backend already enforces it on writes via JurisdictionScope.currentAgencyCode().
        List<String> agencyRows = jdbc.queryForList(
                "select lower(a.acronym) from public.users u join public.agencies a on a.id = u.agency_id where u.id = ?",
                String.class, id);
        String agency = agencyRows.isEmpty() ? null : agencyRows.get(0);
        UserDto user = new UserDto((String) row.get("name"), (String) row.get("email"), roles, permissions, agency);
        // Mint a real signed JWT: sub = numeric users.id (the one subject contract the resource
        // server + CurrentUserResolver agree on), realm_access.roles = the SRS roles for hasAnyRole,
        // permissions = the fine-grained capabilities, name/email for the audit actor.
        String token = tokens.mint(id, (String) row.get("name"), (String) row.get("email"), roles, permissions);
        return ResponseEntity.ok(new LoginResponse(token, user));
    }
}
