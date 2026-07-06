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
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.common.security.JwtTokenService;
import tz.go.pmo.dmis.common.security.PasswordPolicy;

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
    private final CurrentUserResolver currentUser;
    private final tz.go.pmo.dmis.notification.MailService mail;
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

    // ─── Self-service reset by email (SEC-7 follow-on / VAPT v) ───

    /** Frontend base for the emailed reset link — configured per environment, never hardcoded. */
    @org.springframework.beans.factory.annotation.Value("${dmis.app.base-url:http://localhost:4200}")
    private String appBaseUrl;

    @org.springframework.beans.factory.annotation.Value("${dmis.auth.reset-token-ttl-minutes:60}")
    private long resetTtlMinutes;

    private final java.security.SecureRandom secureRandom = new java.security.SecureRandom();

    public record ForgotPasswordRequest(String email) {
    }

    /**
     * Issues a password-reset link by email. Anti-enumeration: the response is IDENTICAL whether
     * or not the account exists, and the email work runs asynchronously so response timing does
     * not leak account existence either. Only the SHA-256 of the token is stored (single-use,
     * {@code dmis.auth.reset-token-ttl-minutes} validity); re-requesting supersedes earlier tokens.
     */
    @PostMapping("/forgot-password")
    @Operation(summary = "Request a password-reset link by email (uniform response, rate-limited)")
    public ResponseEntity<Map<String, Object>> forgotPassword(@RequestBody ForgotPasswordRequest req) {
        String email = req.email() == null ? "" : req.email().trim();
        if (!email.isBlank()) {
            java.util.concurrent.CompletableFuture.runAsync(() -> issueResetToken(email));
        }
        return ResponseEntity.ok(Map.of("success", true,
                "message", "If an account exists for that email, a password reset link has been sent."));
    }

    private void issueResetToken(String email) {
        try {
            List<Map<String, Object>> rows = jdbc.queryForList(
                    "select id, name, email from public.users where lower(email) = lower(?)", email);
            if (rows.isEmpty()) {
                return; // uniform response already sent — nothing to reveal
            }
            String canonical = (String) rows.get(0).get("email");
            byte[] raw = new byte[32];
            secureRandom.nextBytes(raw);
            String token = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
            jdbc.update("delete from public.password_reset_tokens where lower(email) = lower(?)", canonical);
            jdbc.update("""
                    insert into public.password_reset_tokens (email, token_hash, expires_at)
                    values (?, ?, now() + make_interval(mins => ?))
                    """, canonical, sha256Hex(token), (int) resetTtlMinutes);
            String link = appBaseUrl + "/reset-password?token=" + token;
            String body = "<p>Dear " + rows.get(0).get("name") + ",</p>"
                    + "<p>A password reset was requested for your e-MAAFA (DMIS) account. "
                    + "Use the link below to set a new password. The link is valid for "
                    + resetTtlMinutes + " minutes and can be used once.</p>"
                    + "<p><a href=\"" + link + "\">" + link + "</a></p>"
                    + "<p>If you did not request this, no action is needed — your password remains unchanged.</p>"
                    + "<p>Prime Minister's Office — Disaster Management Department</p>";
            mail.send(canonical, "e-MAAFA: Password reset", body, "password_reset", null, null);
        } catch (Exception e) {
            // Best-effort by design: the uniform response has already gone out; failures land in email_logs.
        }
    }

    public record ResetPasswordRequest(String token, String newPassword) {
    }

    /** Completes the reset: valid unexpired unused token + policy-compliant new password. */
    @PostMapping("/reset-password")
    @Operation(summary = "Set a new password using an emailed reset token (single-use, expiring)")
    public ResponseEntity<Map<String, Object>> resetPassword(@RequestBody ResetPasswordRequest req) {
        if (req.token() == null || req.token().isBlank() || req.newPassword() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "token and newPassword are required.");
        }
        List<Map<String, Object>> tokenRows = jdbc.queryForList("""
                select id, email from public.password_reset_tokens
                where token_hash = ? and used_at is null and expires_at > now()
                """, sha256Hex(req.token().trim()));
        if (tokenRows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This reset link is invalid, expired or already used — request a new one.");
        }
        String email = (String) tokenRows.get(0).get("email");
        List<Map<String, Object>> userRows = jdbc.queryForList(
                "select id, password from public.users where lower(email) = lower(?)", email);
        if (userRows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This reset link is invalid, expired or already used — request a new one.");
        }
        String currentHash = (String) userRows.get(0).get("password");
        if (currentHash != null && encoder.matches(req.newPassword(), currentHash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "New password must be different from the current one.");
        }
        PasswordPolicy.validate(req.newPassword());
        jdbc.update("update public.users set password = ?, updated_at = now() where id = ?",
                encoder.encode(req.newPassword()), ((Number) userRows.get(0).get("id")).longValue());
        jdbc.update("update public.password_reset_tokens set used_at = now() where id = ?",
                ((Number) tokenRows.get(0).get("id")).longValue());
        return ResponseEntity.ok(Map.of("success", true,
                "message", "Password reset successfully — you can now sign in with the new password."));
    }

    private static String sha256Hex(String value) {
        try {
            byte[] digest = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    public record ChangePasswordRequest(String currentPassword, String newPassword) {
    }

    /**
     * Self-service password change (VAPT v remediation): the authenticated user proves their current
     * password, the new one is checked against the shared {@link PasswordPolicy} and re-hashed with BCrypt.
     * No admin involvement, and the admin never learns the new secret.
     */
    @PostMapping("/change-password")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Change your own password (verifies the current password + enforces the policy)")
    public ResponseEntity<Map<String, Object>> changePassword(@RequestBody ChangePasswordRequest req) {
        Long id = currentUser.currentUserDbId();
        if (id == null) {
            return ResponseEntity.status(401).build();
        }
        if (req.currentPassword() == null || req.newPassword() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "currentPassword and newPassword are required.");
        }
        List<Map<String, Object>> rows = jdbc.queryForList("select password from public.users where id = ?", id);
        String hash = rows.isEmpty() ? null : (String) rows.get(0).get("password");
        if (hash == null || !encoder.matches(req.currentPassword(), hash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Current password is incorrect.");
        }
        if (encoder.matches(req.newPassword(), hash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "New password must be different from the current one.");
        }
        PasswordPolicy.validate(req.newPassword());
        jdbc.update("update public.users set password = ?, updated_at = now() where id = ?",
                encoder.encode(req.newPassword()), id);
        return ResponseEntity.ok(Map.of("success", true, "message", "Password changed successfully."));
    }
}
