package tz.go.pmo.dmis.common.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Hardens the public {@code /storage/**} static surface (served by {@link PublicStorageConfig}, permitAll).
 * Uploaded bulletin PDFs are fetched by anyone on the national portal origin, so a PDF/HTML polyglot that
 * slips past the {@code %PDF-} magic-byte check at upload must still never be sniffed into executable HTML:
 * {@code X-Content-Type-Options: nosniff} pins the declared content type and a {@code default-src 'none'}
 * CSP neutralises any script if a browser ever interprets the bytes as a document. Inline PDF viewing is
 * preserved (we do not force an attachment) — only MIME sniffing and script execution are removed.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class StorageSecurityHeadersFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        if (request.getRequestURI() != null && request.getRequestURI().contains("/storage/")) {
            response.setHeader("X-Content-Type-Options", "nosniff");
            response.setHeader("Content-Security-Policy", "default-src 'none'");
            response.setHeader("X-Frame-Options", "SAMEORIGIN");
        }
        chain.doFilter(request, response);
    }
}
