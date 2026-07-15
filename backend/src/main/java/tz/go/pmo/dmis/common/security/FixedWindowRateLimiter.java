package tz.go.pmo.dmis.common.security;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * A small fixed-window rate limiter keyed by an arbitrary string (typically a client IP). Shared by
 * the rate-limit filters (login + public-portal writes) so the windowing logic lives in exactly
 * one place rather than being copy-pasted per filter.
 *
 * <p>State is in-memory and therefore <b>per instance</b>: adequate for the single-instance
 * deployment and as defence-in-depth, but a multi-instance deployment behind a load balancer should
 * additionally rate-limit at the edge / with a shared store. The map reclaims expired windows and
 * fails closed for new keys at a fixed capacity so a distinct-address spray cannot grow heap without
 * a bound.
 */
final class FixedWindowRateLimiter {

    private static final int MAX_TRACKED_KEYS = 50_000;

    private final int maxPermits;
    private final long windowMillis;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();
    private final Object admissionLock = new Object();

    FixedWindowRateLimiter(int maxPermits, long windowMillis) {
        this.maxPermits = Math.max(1, maxPermits);
        this.windowMillis = Math.max(1L, windowMillis);
    }

    /**
     * Records one hit for {@code key} at {@code now} (epoch millis) and reports the verdict.
     *
     * @return {@code 0} when the hit is within budget, otherwise the {@code Retry-After} seconds.
     */
    long retryAfterSeconds(String key, long now) {
        // A distributed or botnet-shaped burst can present more distinct socket addresses than the
        // application should retain in heap. Reclaim expired windows first, then fail closed for a
        // previously unseen key when the local defense-in-depth table is still at capacity. Existing
        // keys continue through their normal counters, so an address cannot evade its bucket by
        // forcing the table full. The shared ingress remains the primary distributed rate limiter.
        if (!windows.containsKey(key)) {
            synchronized (admissionLock) {
                if (!windows.containsKey(key)) {
                    if (windows.size() >= MAX_TRACKED_KEYS) {
                        pruneExpired(now);
                    }
                    if (windows.size() >= MAX_TRACKED_KEYS) {
                        return Math.max(1L, (windowMillis + 999L) / 1000L);
                    }
                    windows.put(key, new Window(now));
                    return 0L;
                }
            }
        }

        int[] count = new int[1];
        Window window = windows.compute(key, (k, existing) -> {
            if (existing == null || now - existing.start >= windowMillis) {
                Window fresh = new Window(now);
                count[0] = fresh.count;
                return fresh;
            }
            existing.count++;
            count[0] = existing.count;
            return existing;
        });
        pruneIfLarge(now);
        if (count[0] > maxPermits) {
            return Math.max(1L, (windowMillis - (now - window.start) + 999) / 1000);
        }
        return 0L;
    }

    private void pruneIfLarge(long now) {
        if (windows.size() > MAX_TRACKED_KEYS) {
            pruneExpired(now);
        }
    }

    private void pruneExpired(long now) {
        windows.entrySet().removeIf(entry -> now - entry.getValue().start >= windowMillis);
    }

    /** Fixed-window counter for one key. Mutated only inside {@code ConcurrentHashMap.compute}. */
    private static final class Window {
        private final long start;
        private int count;

        private Window(long start) {
            this.start = start;
            this.count = 1;
        }
    }
}
