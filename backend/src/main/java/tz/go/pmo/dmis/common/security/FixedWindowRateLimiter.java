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
 * additionally rate-limit at the edge / with a shared store. The map is bounded by opportunistically
 * evicting expired windows once it grows large.
 */
final class FixedWindowRateLimiter {

    private static final int MAX_TRACKED_KEYS = 50_000;

    private final int maxPermits;
    private final long windowMillis;
    private final Map<String, Window> windows = new ConcurrentHashMap<>();

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
            windows.entrySet().removeIf(entry -> now - entry.getValue().start >= windowMillis);
        }
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
