package tz.go.pmo.dmis.local;

/**
 * Shared local/dev test credentials. <b>Never</b> reference this class from production
 * (non-{@code local}) code paths. The constant password is for controlled local testing only.
 *
 * <p>Go-live: revoke per {@code docs/LOCAL-TEST-PASSWORD.md} and go-live runbook (force rotate,
 * disable demo accounts, never run {@code local} profile on the public edge).
 */
public final class LocalTestCredentials {

    private LocalTestCredentials() {
    }

    /**
     * Constant password for all local-profile seeded / re-seeded test accounts.
     * Intentionally contains the blocked base word {@code password} so production
     * {@link tz.go.pmo.dmis.common.security.PasswordPolicy} rejects it if anyone tries to
     * re-set it after a forced change.
     */
    public static final String PASSWORD = "Password@2026";
}
