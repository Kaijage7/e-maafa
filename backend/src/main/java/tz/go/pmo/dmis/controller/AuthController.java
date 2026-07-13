package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.AuthService;
import tz.go.pmo.dmis.service.AuthService.ChangePasswordRequest;
import tz.go.pmo.dmis.service.AuthService.ForgotPasswordRequest;
import tz.go.pmo.dmis.service.AuthService.LoginRequest;
import tz.go.pmo.dmis.service.AuthService.LoginResponse;
import tz.go.pmo.dmis.service.AuthService.MfaVerifyRequest;
import tz.go.pmo.dmis.service.AuthService.ResetPasswordRequest;
import tz.go.pmo.dmis.service.AuthService.TotpDisableRequest;
import tz.go.pmo.dmis.service.AuthService.TotpEnableRequest;

/**
 * Identity — thin eGA controller. Path {@code /v1/auth} unchanged.
 * Logic in {@link AuthService}. TOTP helper in {@code service.support.TotpService}.
 */
@RestController
@RequestMapping("/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Identity", description = "Login, password lifecycle, optional TOTP 2FA")
public class AuthController {

    private final AuthService service;

    @PostMapping("/login")
    @Operation(summary = "Authenticate with email + password; may require TOTP or password change")
    public ResponseEntity<LoginResponse> login(@RequestBody LoginRequest request) {
        return service.login(request);
    }

    @PostMapping("/2fa/verify")
    @Operation(summary = "Complete MFA with TOTP code after login challenge")
    public ResponseEntity<LoginResponse> verifyMfa(@RequestBody MfaVerifyRequest req) {
        return service.verifyMfa(req);
    }

    @GetMapping("/2fa/status")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Whether TOTP is enabled for the current user")
    public Map<String, Object> twoFaStatus() {
        return service.twoFaStatus();
    }

    @PostMapping("/2fa/setup")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Begin TOTP enrollment (returns secret + otpauth URI)")
    public Map<String, Object> setupTotp() {
        return service.setupTotp();
    }

    @PostMapping("/2fa/enable")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Confirm TOTP enrollment with a code from the authenticator app")
    public Map<String, Object> enableTotp(@RequestBody TotpEnableRequest req) {
        return service.enableTotp(req);
    }

    @PostMapping("/2fa/disable")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Disable TOTP (password + current code required)")
    public Map<String, Object> disableTotp(@RequestBody TotpDisableRequest req) {
        return service.disableTotp(req);
    }

    @PostMapping("/forgot-password")
    @Operation(summary = "Request a password-reset email (always returns 200 to avoid email enumeration)")
    public ResponseEntity<Map<String, Object>> forgotPassword(@RequestBody ForgotPasswordRequest req) {
        return service.forgotPassword(req);
    }

    @PostMapping("/reset-password")
    @Operation(summary = "Set a new password using a one-time reset token")
    public ResponseEntity<Map<String, Object>> resetPassword(@RequestBody ResetPasswordRequest req) {
        return service.resetPassword(req);
    }

    @PostMapping("/logout")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Invalidate the current access token (denylist until expiry)")
    public ResponseEntity<Map<String, Object>> logout() {
        return service.logout();
    }

    @PostMapping("/change-password")
    @PreAuthorize("isAuthenticated()")
    @Operation(summary = "Change password (current password required unless must_change_password is set)")
    public ResponseEntity<Map<String, Object>> changePassword(@RequestBody ChangePasswordRequest req) {
        return service.changePassword(req);
    }
}
