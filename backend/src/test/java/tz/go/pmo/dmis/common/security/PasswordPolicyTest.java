package tz.go.pmo.dmis.common.security;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.web.server.ResponseStatusException;

/**
 * Pins the shared password policy (VAPT vi/v): complexity floor AND the guessable-word check.
 * The live retest of 2026-07-05 proved {@code Password@123} passed the original exact-match
 * blocklist — these cases keep that class of "compliant but first-guess" passwords rejected.
 */
class PasswordPolicyTest {

    // ---- complexity floor ----

    @Test
    void rejectsNull() {
        assertThrows(ResponseStatusException.class, () -> PasswordPolicy.validate(null));
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "Sh0rt!x", // < 10 chars
            "alllowercase1!", // no uppercase
            "ALLUPPERCASE1!", // no lowercase
            "NoDigitsHere!!", // no digit
            "NoSpecials123abc", // no special character
    })
    void rejectsComplexityFailures(String password) {
        assertThrows(ResponseStatusException.class, () -> PasswordPolicy.validate(password));
    }

    // ---- guessable words: plain form (symbols dropped) ----

    @ParameterizedTest
    @ValueSource(strings = {
            "Password@123", // the classic VAPT first guess — passed the old exact-match list
            "Password@2026", // dressed-up "password"
            "Qwerty@12345",
            "Welcome@2026",
            "Administrator@1x",
            "Xy#1234567890", // sequential-digit run
    })
    void rejectsDressedUpCommonWords(String password) {
        assertThrows(ResponseStatusException.class, () -> PasswordPolicy.validate(password));
    }

    // ---- guessable words: leet form (@→a, 0→o, 1→i, 3→e, $→s, ...) ----

    @ParameterizedTest
    @ValueSource(strings = {
            "P@ssw0rd!123",
            "P@$$word2026",
            "L3tm3in!2026",
            "Adm1n#20261x",
    })
    void rejectsLeetVariants(String password) {
        assertThrows(ResponseStatusException.class, () -> PasswordPolicy.validate(password));
    }

    // ---- targeted system words (what a wordlist against THIS platform tries first) ----

    @ParameterizedTest
    @ValueSource(strings = {
            "Dmis@2026!xy",
            "Maafa#2026ab",
            "Tanzania@26x",
            "Dodoma@2026x",
            "Disaster@26x",
    })
    void rejectsSystemContextWords(String password) {
        assertThrows(ResponseStatusException.class, () -> PasswordPolicy.validate(password));
    }

    // ---- genuinely strong passwords still pass ----

    @ParameterizedTest
    @ValueSource(strings = {
            "Verify#Kite2026x",
            "Mlima!Kubwa77",
            "Tembo&Mvua#2026",
            "Kv9#mQ2$wLp4",
    })
    void acceptsStrongPasswords(String password) {
        assertDoesNotThrow(() -> PasswordPolicy.validate(password));
    }
}
