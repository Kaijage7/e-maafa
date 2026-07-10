package tz.go.pmo.dmis.common.security;

import java.time.Instant;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * In-memory JWT denylist keyed by {@code jti}. Entries expire when the original token would have
 * expired, so memory stays bounded. Multi-instance deploys need a shared store (Redis) later —
 * this closes single-node logout/revocation for VAPT session findings.
 */
@Component
public class TokenDenylist {

    private final ConcurrentHashMap<String, Instant> revokedUntil = new ConcurrentHashMap<>();

    public void revoke(String jti, Instant expiresAt) {
        if (jti == null || jti.isBlank()) {
            return;
        }
        Instant until = expiresAt == null ? Instant.now().plusSeconds(3600) : expiresAt;
        revokedUntil.put(jti, until);
    }

    public boolean isRevoked(String jti) {
        if (jti == null || jti.isBlank()) {
            return false;
        }
        Instant until = revokedUntil.get(jti);
        if (until == null) {
            return false;
        }
        if (until.isBefore(Instant.now())) {
            revokedUntil.remove(jti, until);
            return false;
        }
        return true;
    }

    @Scheduled(fixedDelayString = "${dmis.auth.denylist-sweep-ms:300000}")
    public void sweepExpired() {
        Instant now = Instant.now();
        for (Iterator<Map.Entry<String, Instant>> it = revokedUntil.entrySet().iterator(); it.hasNext(); ) {
            Map.Entry<String, Instant> e = it.next();
            if (e.getValue().isBefore(now)) {
                it.remove();
            }
        }
    }
}
