package tz.go.pmo.dmis.iam;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.common.security.JwtTokenService;
import tz.go.pmo.dmis.common.security.PasswordPolicy;
import tz.go.pmo.dmis.common.security.RestrictedTokenUseFilter;
import tz.go.pmo.dmis.common.security.TokenDenylist;
import tz.go.pmo.dmis.notification.MailService;

/**
 * Local email/password auth over {@code users} + Spatie-style roles.
 * <p>PSA (PMO, June 2026): strong password policy, self-service change/reset, optional TOTP 2FA,
 * and mandatory password change after admin-set secrets. Login never returns a full session until
 * password-change and (when enabled) TOTP steps succeed.
 */
@RestController
@RequestMapping("/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Identity", description = "Login, password lifecycle, optional TOTP 2FA")
public class AuthController {

    private final JdbcTemplate jdbc;
    private final JwtTokenService tokens;
    private final CurrentUserResolver currentUser;
    private final MailService mail;
    private final TotpService totp;
    private final TokenDenylist denylist;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final String decoyHash = encoder.encode("constant-time-decoy");
    private final java.security.SecureRandom secureRandom = new java.security.SecureRandom();

    @Value("${dmis.app.base-url:http://localhost:4200}")
    private String appBaseUrl;

    @Value("${dmis.auth.reset-token-ttl-minutes:60}")
    private long resetTtlMinutes;

    @Value("${dmis.auth.challenge-ttl-minutes:5}")
    private long challengeTtlMinutes;

    @Value("${dmis.auth.totp-issuer:e-MAAFA DMIS}")
    private String totpIssuer;

    /**
     * Comma-separated role names that must have TOTP enabled before a full session is allowed.
     * Empty = optional 2FA (local/dev default). Production should set Super Admin,Director,EOCC, etc.
     */
    @Value("${dmis.auth.force-2fa-roles:}")
    private String force2faRoles;

    // ─── records ───────────────────────────────────────────────────────────────

    public record LoginRequest(String email, String password) {}

    public record UserDto(String name, String email, List<String> roles, List<String> permissions,
                          String agency, boolean totpEnabled, boolean mustChangePassword) {}

    /**
     * Unified login result.
     * <ul>
     *   <li>{@code OK} — full JWT in {@code token}</li>
     *   <li>{@code MFA_REQUIRED} — password ok, need TOTP via {@code challengeToken}</li>
     *   <li>{@code MFA_ENROLL_REQUIRED} — password ok; role is in {@code dmis.auth.force-2fa-roles}
     *       and TOTP is not yet enabled (JWT issued so client can call setup/enable)</li>
     *   <li>{@code PASSWORD_CHANGE_REQUIRED} — limited JWT that only unlocks change-password</li>
     * </ul>
     */
    public record LoginResponse(String status, String token, String challengeToken, UserDto user, String message) {}

    public record MfaVerifyRequest(String challengeToken, String code) {}

    public record TotpEnableRequest(String code) {}

    public record TotpDisableRequest(String password, String code) {}

    public record ForgotPasswordRequest(String email) {}

    public record ResetPasswordRequest(String token, String newPassword) {}

    public record ChangePasswordRequest(String currentPassword, String newPassword) {}

    // ─── login ─────────────────────────────────────────────────────────────────

    @PostMapping("/login")
    @Operation(summary = "Authenticate with email + password; may require TOTP or password change")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        if (request.email() == null || request.password() == null) {
            return ResponseEntity.status(401).build();
        }
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, name, email, password,
                       coalesce(totp_enabled,false) as totp_enabled,
                       totp_secret,
                       coalesce(must_change_password,false) as must_change_password
                from public.users where lower(email) = lower(?)
                """, request.email().trim());
        Map<String, Object> row = rows.isEmpty() ? null : rows.get(0);
        String hash = row == null || row.get("password") == null ? decoyHash : (String) row.get("password");
        boolean passwordOk = encoder.matches(request.password(), hash);
        if (row == null || !passwordOk) {
            return ResponseEntity.status(401).build();
        }
        long id = ((Number) row.get("id")).longValue();
        boolean mustChange = Boolean.TRUE.equals(row.get("must_change_password"));
        boolean totpOn = Boolean.TRUE.equals(row.get("totp_enabled"));

        if (mustChange) {
            // Limited-purpose JWT: only change-password (RestrictedTokenUseFilter). No module access.
            UserDto user = buildUser(row, id);
            String token = tokens.mintLimited(id, user.name(), user.email(),
                    RestrictedTokenUseFilter.USE_PASSWORD_CHANGE);
            return ResponseEntity.ok(new LoginResponse(
                    "PASSWORD_CHANGE_REQUIRED", token, null, user,
                    "You must set a new password before continuing."));
        }

        if (totpOn) {
            String challenge = issueChallenge(id, "mfa");
            UserDto partial = new UserDto(
                    (String) row.get("name"), (String) row.get("email"),
                    List.of(), List.of(), null, true, false);
            return ResponseEntity.ok(new LoginResponse(
                    "MFA_REQUIRED", null, challenge, partial,
                    "Enter the 6-digit code from your authenticator app."));
        }

        UserDto user = buildUser(row, id);
        // Force-2FA policy: privileged roles must enroll TOTP before a normal session.
        if (requiresForced2fa(user.roles()) && !totpOn) {
            String token = tokens.mintLimited(id, user.name(), user.email(),
                    RestrictedTokenUseFilter.USE_MFA_ENROLL);
            return ResponseEntity.ok(new LoginResponse(
                    "MFA_ENROLL_REQUIRED", token, null, user,
                    "Your role requires two-factor authentication. Enable 2FA (authenticator app) before continuing."));
        }

        String token = tokens.mint(id, user.name(), user.email(), user.roles(), user.permissions());
        return ResponseEntity.ok(new LoginResponse("OK", token, null, user, null));
    }

    private boolean requiresForced2fa(List<String> roles) {
        if (force2faRoles == null || force2faRoles.isBlank() || roles == null || roles.isEmpty()) {
            return false;
        }
        java.util.Set<String> forced = java.util.Arrays.stream(force2faRoles.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(java.util.stream.Collectors.toSet());
        for (String r : roles) {
            if (forced.contains(r)) {
                return true;
            }
        }
        return false;
    }

    @PostMapping("/2fa/verify")
    @Operation(summary = "Complete login with TOTP after MFA_REQUIRED")
    public ResponseEntity<LoginResponse> verifyMfa(@RequestBody MfaVerifyRequest req) {
        if (req.challengeToken() == null || req.code() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "challengeToken and code are required.");
        }
        Long userId = consumeChallenge(req.challengeToken().trim(), "mfa");
        if (userId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "This verification step expired or is invalid — sign in again.");
        }
        Map<String, Object> row = loadUser(userId);
        if (row == null || !Boolean.TRUE.equals(row.get("totp_enabled"))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Two-factor authentication is not enabled.");
        }
        String secret = (String) row.get("totp_secret");
        if (!totp.verify(secret, req.code())) {
            // Re-issue is not done — force full re-login on failed code (anti-bruteforce with rate limit filter).
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid authenticator code.");
        }
        UserDto user = buildUser(row, userId);
        String token = tokens.mint(userId, user.name(), user.email(), user.roles(), user.permissions());
        return ResponseEntity.ok(new LoginResponse("OK", token, null, user, null));
    }

    // ─── TOTP enrollment (authenticated) ───────────────────────────────────────

    @GetMapping("/2fa/status")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Whether 2FA is enabled for the current user")
    public Map<String, Object> twoFaStatus() {
        Long id = requireUserId();
        Map<String, Object> row = loadUser(id);
        boolean enabled = row != null && Boolean.TRUE.equals(row.get("totp_enabled"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", enabled);
        out.put("confirmedAt", row == null ? null : row.get("totp_confirmed_at"));
        return out;
    }

    @PostMapping("/2fa/setup")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Begin TOTP enrollment — returns secret + otpauth URI (not yet active)")
    public Map<String, Object> setupTotp() {
        Long id = requireUserId();
        Map<String, Object> row = loadUser(id);
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found.");
        }
        if (Boolean.TRUE.equals(row.get("totp_enabled"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Two-factor authentication is already enabled.");
        }
        String secret = totp.generateSecret();
        jdbc.update("update public.users set totp_secret = ?, totp_enabled = false, updated_at = now() where id = ?",
                secret, id);
        String email = (String) row.get("email");
        String uri = totp.otpAuthUri(totpIssuer, email, secret);
        return Map.of(
                "secret", secret,
                "otpauthUri", uri,
                "message", "Scan the otpauth URI (or enter the secret) in your authenticator app, then call /2fa/enable with a code.");
    }

    @PostMapping("/2fa/enable")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Confirm TOTP enrollment with a live code")
    public Map<String, Object> enableTotp(@RequestBody TotpEnableRequest req) {
        Long id = requireUserId();
        Map<String, Object> row = loadUser(id);
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found.");
        }
        String secret = (String) row.get("totp_secret");
        if (secret == null || secret.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Call /2fa/setup first.");
        }
        if (req.code() == null || !totp.verify(secret, req.code())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid authenticator code.");
        }
        jdbc.update("""
                update public.users
                   set totp_enabled = true, totp_confirmed_at = now(), updated_at = now()
                 where id = ?
                """, id);
        // If the session was mfa_enroll-limited, promote to a full token so the client can continue.
        Map<String, Object> refreshed = loadUser(id);
        UserDto user = buildUser(refreshed, id);
        String full = tokens.mint(id, user.name(), user.email(), user.roles(), user.permissions());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("enabled", true);
        out.put("message", "Two-factor authentication is now required at sign-in.");
        out.put("token", full);
        out.put("user", user);
        out.put("status", "OK");
        return out;
    }

    @PostMapping("/2fa/disable")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Disable TOTP (requires password + current code)")
    public Map<String, Object> disableTotp(@RequestBody TotpDisableRequest req) {
        Long id = requireUserId();
        Map<String, Object> row = loadUser(id);
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found.");
        }
        if (!Boolean.TRUE.equals(row.get("totp_enabled"))) {
            return Map.of("success", true, "enabled", false, "message", "Two-factor authentication was already off.");
        }
        String hash = (String) row.get("password");
        if (req.password() == null || hash == null || !encoder.matches(req.password(), hash)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Password is incorrect.");
        }
        if (req.code() == null || !totp.verify((String) row.get("totp_secret"), req.code())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid authenticator code.");
        }
        jdbc.update("""
                update public.users
                   set totp_enabled = false, totp_secret = null, totp_confirmed_at = null, updated_at = now()
                 where id = ?
                """, id);
        return Map.of("success", true, "enabled", false, "message", "Two-factor authentication has been disabled.");
    }

    // ─── password reset / change ───────────────────────────────────────────────

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
                return;
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
        } catch (Exception ignored) {
            // Best-effort; uniform response already sent.
        }
    }

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
        long userId = ((Number) userRows.get(0).get("id")).longValue();
        jdbc.update("""
                update public.users
                   set password = ?, must_change_password = false, updated_at = now()
                 where id = ?
                """, encoder.encode(req.newPassword()), userId);
        jdbc.update("update public.password_reset_tokens set used_at = now() where id = ?",
                ((Number) tokenRows.get(0).get("id")).longValue());
        return ResponseEntity.ok(Map.of("success", true,
                "message", "Password reset successfully — you can now sign in with the new password."));
    }

    @PostMapping("/logout")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "End this session (server-side JWT denylist by jti until natural expiry)")
    public ResponseEntity<Map<String, Object>> logout() {
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken jwtAuth
                && jwtAuth.getPrincipal() instanceof org.springframework.security.oauth2.jwt.Jwt jwt) {
            String jti = jwt.getId();
            if (jti == null) {
                jti = jwt.getClaimAsString("jti");
            }
            denylist.revoke(jti, jwt.getExpiresAt());
        }
        return ResponseEntity.ok(Map.of("success", true, "message", "Signed out."));
    }

    @PostMapping("/change-password")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Change your own password (verifies current + policy); clears must_change_password")
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
        jdbc.update("""
                update public.users
                   set password = ?, must_change_password = false, updated_at = now()
                 where id = ?
                """, encoder.encode(req.newPassword()), id);
        Map<String, Object> row = loadUser(id);
        UserDto user = buildUser(row, id);
        // Promote limited password_change token → full session (or refresh a normal session).
        String full = tokens.mint(id, user.name(), user.email(), user.roles(), user.permissions());
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("success", true);
        body.put("message", "Password changed successfully.");
        body.put("mustChangePassword", false);
        body.put("token", full);
        body.put("user", user);
        body.put("status", "OK");
        return ResponseEntity.ok(body);
    }

    // ─── helpers ───────────────────────────────────────────────────────────────

    private UserDto buildUser(Map<String, Object> row, long id) {
        List<String> roles = jdbc.queryForList(
                "select r.name from public.model_has_roles mhr join public.roles r on r.id = mhr.role_id where mhr.model_id = ?",
                String.class, id);
        List<String> permissions = jdbc.queryForList(
                "select distinct p.name from public.model_has_roles mhr"
                        + " join public.role_has_permissions rhp on rhp.role_id = mhr.role_id"
                        + " join public.permissions p on p.id = rhp.permission_id"
                        + " where mhr.model_id = ? order by p.name",
                String.class, id);
        List<String> agencyRows = jdbc.queryForList(
                "select lower(a.acronym) from public.users u join public.agencies a on a.id = u.agency_id where u.id = ?",
                String.class, id);
        String agency = agencyRows.isEmpty() ? null : agencyRows.get(0);
        boolean totpOn = Boolean.TRUE.equals(row.get("totp_enabled"));
        boolean mustChange = Boolean.TRUE.equals(row.get("must_change_password"));
        return new UserDto((String) row.get("name"), (String) row.get("email"), roles, permissions, agency,
                totpOn, mustChange);
    }

    private Map<String, Object> loadUser(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, name, email, password,
                       coalesce(totp_enabled,false) as totp_enabled,
                       totp_secret, totp_confirmed_at,
                       coalesce(must_change_password,false) as must_change_password
                from public.users where id = ?
                """, id);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private Long requireUserId() {
        Long id = currentUser.currentUserDbId();
        if (id == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        return id;
    }

    private String issueChallenge(long userId, String purpose) {
        byte[] raw = new byte[32];
        secureRandom.nextBytes(raw);
        String token = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        jdbc.update("""
                insert into public.auth_login_challenges (user_id, token_hash, purpose, expires_at)
                values (?, ?, ?, now() + make_interval(mins => ?))
                """, userId, sha256Hex(token), purpose, (int) challengeTtlMinutes);
        return token;
    }

    private Long consumeChallenge(String token, String purpose) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, user_id from public.auth_login_challenges
                where token_hash = ? and purpose = ? and used_at is null and expires_at > now()
                """, sha256Hex(token), purpose);
        if (rows.isEmpty()) {
            return null;
        }
        jdbc.update("update public.auth_login_challenges set used_at = now() where id = ?",
                ((Number) rows.get(0).get("id")).longValue());
        return ((Number) rows.get(0).get("user_id")).longValue();
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
}
