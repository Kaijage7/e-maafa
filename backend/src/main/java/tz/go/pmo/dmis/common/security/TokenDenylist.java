package tz.go.pmo.dmis.common.security;

import java.time.Instant;
import java.util.Iterator;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.lang.Nullable;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * JWT denylist keyed by {@code jti}. Entries expire when the original token would have expired.
 *
 * <p><b>Authority:</b> when a {@link JwtDenylistStore} is present (normal Spring runtime), PostgreSQL
 * is authoritative so multi-node logout works. An in-memory map is a same-node L1 cache only.
 * Unit tests may construct a memory-only instance via {@link #memoryOnly()}.
 */
@Component
public class TokenDenylist {

    private static final Logger log = LoggerFactory.getLogger(TokenDenylist.class);

    private final ConcurrentHashMap<String, Instant> localUntil = new ConcurrentHashMap<>();
    @Nullable
    private final JwtDenylistStore store;

    @Autowired
    public TokenDenylist(JwtDenylistStore store) {
        this.store = store;
    }

    private TokenDenylist(@Nullable JwtDenylistStore store, boolean memoryOnly) {
        this.store = store;
    }

    /** Memory-only instance for pure unit tests (no DataSource). */
    public static TokenDenylist memoryOnly() {
        return new TokenDenylist(null, true);
    }

    public void revoke(String jti, Instant expiresAt) {
        if (jti == null || jti.isBlank()) {
            return;
        }
        Instant until = expiresAt == null ? Instant.now().plusSeconds(3600) : expiresAt;
        localUntil.put(jti, until);
        if (store == null) {
            return;
        }
        try {
            store.persist(jti, until);
        } catch (RuntimeException ex) {
            log.error("jwt denylist persist failed for jti={} (local revoke retained): {}",
                    jti, ex.getMessage(), ex);
        }
    }

    public boolean isRevoked(String jti) {
        if (jti == null || jti.isBlank()) {
            return false;
        }
        Instant now = Instant.now();
        Instant local = localUntil.get(jti);
        if (local != null) {
            if (local.isBefore(now)) {
                localUntil.remove(jti, local);
            } else {
                return true;
            }
        }
        if (store == null) {
            return false;
        }
        Instant until = store.findActiveUntil(jti);
        if (until != null) {
            localUntil.put(jti, until);
            return true;
        }
        return false;
    }

    @Scheduled(fixedDelayString = "${dmis.auth.denylist-sweep-ms:300000}")
    public void sweepExpired() {
        Instant now = Instant.now();
        for (Iterator<Map.Entry<String, Instant>> it = localUntil.entrySet().iterator(); it.hasNext(); ) {
            Map.Entry<String, Instant> e = it.next();
            if (e.getValue().isBefore(now)) {
                it.remove();
            }
        }
        if (store != null) {
            store.deleteExpired();
        }
    }

    boolean isDatabaseBacked() {
        return store != null;
    }
}
