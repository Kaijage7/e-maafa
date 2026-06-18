package tz.go.pmo.dmis.common.security;

import jakarta.servlet.http.HttpServletRequest;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Abuse protection on the authenticated EW <b>bulletin upload</b> surface — the multipart writes that each
 * persist a PDF (up to 10 MB) to disk: {@code POST /v1/ew/warnings/{id}/bulletin} (manual contingency upload)
 * and {@code POST /v1/ew/products} (engine store). These are EW_APPROVE/EW_INGEST-gated, but a buggy client
 * retrying in a loop — or a looping token — could fill {@code storage/public/ew-products} and clutter the
 * bulletin registry, so a throttle bounds the write rate.
 *
 * <p>Mirrors {@link PortalWriteRateLimitFilter}: a self-restricting pass-through, IP-keyed at HIGHEST_PRECEDENCE
 * (consistent with the rate-limit filter family). The cap is generous (default 20 / 60s) so an operator publishing
 * bulletins for several warnings is never blocked, while a runaway loop is. Tunable via
 * {@code dmis.security.ratelimit.ew.{enabled,max-attempts,window-seconds}}.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class EwUploadRateLimitFilter extends AbstractRateLimitFilter {

    @Autowired
    public EwUploadRateLimitFilter(
            @Value("${dmis.security.ratelimit.ew.enabled:true}") boolean enabled,
            @Value("${dmis.security.ratelimit.ew.max-attempts:20}") int maxAttempts,
            @Value("${dmis.security.ratelimit.ew.window-seconds:60}") long windowSeconds) {
        this(enabled, maxAttempts, windowSeconds, System::currentTimeMillis);
    }

    /** Visible for testing — an injectable clock makes the fixed window deterministic. */
    EwUploadRateLimitFilter(boolean enabled, int maxAttempts, long windowSeconds, LongSupplier clock) {
        super(enabled, maxAttempts, windowSeconds, clock);
    }

    @Override
    protected boolean shouldLimit(HttpServletRequest request) {
        String uri = request.getRequestURI();
        if (uri == null || !"POST".equalsIgnoreCase(request.getMethod())) {
            return false;
        }
        boolean manualBulletin = uri.contains("/v1/ew/warnings/") && uri.endsWith("/bulletin");
        boolean engineStore = uri.endsWith("/v1/ew/products");
        return manualBulletin || engineStore;
    }
}
