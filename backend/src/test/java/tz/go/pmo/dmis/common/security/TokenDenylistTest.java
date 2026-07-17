package tz.go.pmo.dmis.common.security;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Instant;
import org.junit.jupiter.api.Test;

class TokenDenylistTest {

    @Test
    void memoryOnly_revokesUntilExpiry() {
        TokenDenylist denylist = TokenDenylist.memoryOnly();
        assertThat(denylist.isDatabaseBacked()).isFalse();
        Instant until = Instant.now().plusSeconds(600);
        denylist.revoke("jti-memory-1", until);
        assertThat(denylist.isRevoked("jti-memory-1")).isTrue();
        assertThat(denylist.isRevoked("other")).isFalse();
    }

    @Test
    void blankJtiIsIgnored() {
        TokenDenylist denylist = TokenDenylist.memoryOnly();
        denylist.revoke("  ", Instant.now().plusSeconds(60));
        denylist.revoke(null, Instant.now().plusSeconds(60));
        assertThat(denylist.isRevoked(null)).isFalse();
        assertThat(denylist.isRevoked("")).isFalse();
    }

    @Test
    void expiredLocalEntryIsNotRevoked() {
        TokenDenylist denylist = TokenDenylist.memoryOnly();
        denylist.revoke("jti-expired", Instant.now().minusSeconds(5));
        assertThat(denylist.isRevoked("jti-expired")).isFalse();
    }
}
