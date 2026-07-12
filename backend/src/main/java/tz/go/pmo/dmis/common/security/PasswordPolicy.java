package tz.go.pmo.dmis.common.security;

import java.util.Locale;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * The single source of truth for the account password policy (VAPT vi remediation). Used by BOTH the
 * admin password-setting path ({@code settings/UserManagementController}) and the self-service change
 * path ({@code iam/AuthController}) so the two can never drift.
 *
 * <p>Policy: at least 10 characters, containing lowercase, uppercase, a digit AND a special character,
 * and not one of the well-known weak/common passwords (the auditor flagged {@code password123}-class
 * credentials being accepted). Local-profile seed fixtures set passwords directly and bypass this by design.
 */
public final class PasswordPolicy {

    private PasswordPolicy() {
    }

    /** A small blocklist of the most common weak passwords that would otherwise satisfy the complexity rule. */
    private static final Set<String> COMMON_PASSWORDS = Set.of(
            "password", "password1", "password12", "password123", "password1234", "passw0rd", "passw0rd1",
            "12345678", "123456789", "1234567890", "qwertyui", "qwerty123", "iloveyou1", "admin123",
            "administrator", "letmein123", "welcome123", "changeme1", "p@ssw0rd", "p@ssword1", "abcd1234",
            // Local/dev constant test password — must never be accepted as a production self-service secret.
            "password@2026", "Password@2026");

    /**
     * Core guessable words: a password whose NORMALIZED form (lowercased, leet substitutions applied,
     * symbols stripped) contains one of these is rejected, so trivial dress-ups like {@code Password@123}
     * or {@code P@ssw0rd!123} — which satisfy every complexity rule and are the first guesses in any
     * real wordlist — can't pass. Includes the names a TARGETED attacker tries against this system
     * (dmis / maafa / tanzania / dodoma / disaster). Deliberately errs toward over-blocking: a passphrase
     * containing "admin" or "password" is a poor secret for this platform even inside a longer string.
     */
    private static final Set<String> BASE_WORDS = Set.of(
            "password", "passwd", "qwerty", "letmein", "welcome", "iloveyou", "changeme",
            "admin", "secret", "default", "123456", "654321",
            "dmis", "maafa", "tanzania", "dodoma", "disaster");

    /** @throws ResponseStatusException {@code 400 Bad Request} if the password fails the policy. */
    public static void validate(String password) {
        boolean ok = password != null
                && password.length() >= 10
                && password.matches(".*[a-z].*")
                && password.matches(".*[A-Z].*")
                && password.matches(".*\\d.*")
                && password.matches(".*[^A-Za-z0-9].*")
                && !COMMON_PASSWORDS.contains(password.toLowerCase(Locale.ROOT))
                && !containsBaseWord(password);
        if (!ok) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Password must be at least 10 characters and include lowercase, uppercase, a number and a "
                            + "special character, and must not be a common or easily guessed password.");
        }
    }

    /**
     * Checks two normalized forms against {@link #BASE_WORDS}: the plain form (lowercase, symbols dropped —
     * catches {@code Password@123} → {@code password123}) and the leet form (standard substitutions applied
     * BEFORE dropping symbols — catches {@code P@ssw0rd!123} → {@code passwordii2e}). Substring match.
     */
    private static boolean containsBaseWord(String password) {
        String lower = password.toLowerCase(Locale.ROOT);
        String plain = lower.replaceAll("[^a-z0-9]", "");
        String leet = lower
                .replace('@', 'a').replace('$', 's').replace('!', 'i')
                .replace('0', 'o').replace('1', 'i').replace('3', 'e')
                .replace('4', 'a').replace('5', 's').replace('7', 't')
                .replaceAll("[^a-z0-9]", "");
        for (String word : BASE_WORDS) {
            if (plain.contains(word) || leet.contains(word)) {
                return true;
            }
        }
        return false;
    }
}
