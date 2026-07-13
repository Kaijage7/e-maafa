package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;

/**
 * Identity: login, password lifecycle, optional TOTP 2FA.
 * Paths/JSON unchanged ({@code /v1/auth/*}).
 */
public interface AuthService {

    record LoginRequest(String email, String password) {}

    record UserDto(String name, String email, List<String> roles, List<String> permissions,
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
    record LoginResponse(String status, String token, String challengeToken, UserDto user, String message) {}

    record MfaVerifyRequest(String challengeToken, String code) {}

    record TotpEnableRequest(String code) {}

    record TotpDisableRequest(String password, String code) {}

    record ForgotPasswordRequest(String email) {}

    record ResetPasswordRequest(String token, String newPassword) {}

    record ChangePasswordRequest(String currentPassword, String newPassword) {}

    ResponseEntity<LoginResponse> login(LoginRequest request);

    ResponseEntity<LoginResponse> verifyMfa(MfaVerifyRequest req);

    Map<String, Object> twoFaStatus();

    Map<String, Object> setupTotp();

    Map<String, Object> enableTotp(TotpEnableRequest req);

    Map<String, Object> disableTotp(TotpDisableRequest req);

    ResponseEntity<Map<String, Object>> forgotPassword(ForgotPasswordRequest req);

    ResponseEntity<Map<String, Object>> resetPassword(ResetPasswordRequest req);

    ResponseEntity<Map<String, Object>> logout();

    ResponseEntity<Map<String, Object>> changePassword(ChangePasswordRequest req);
}
