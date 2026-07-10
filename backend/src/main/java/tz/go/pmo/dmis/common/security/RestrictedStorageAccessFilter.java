package tz.go.pmo.dmis.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.server.ResponseStatusException;

/**
 * F96: restricted {@code /storage/**} operational attachments already require authentication
 * ({@link SecurityPaths#RESTRICTED_STORAGE_PATHS}). This filter adds:
 * <ul>
 *   <li>module-ish authority checks by path prefix</li>
 *   <li>row-level area guard when the path embeds a known owner id
 *       ({@code /storage/assessments/{id}/…})</li>
 *   <li>row-level area guard for incident media when the relative path appears on an
 *       {@code incidents.photo_path}, {@code photo_paths} or {@code video_path} row</li>
 *   <li><strong>fail-closed on orphans:</strong> free-form filenames with no parent incident
 *       row are NOT found (404) for normal operators — no AreaGuard is possible without a parent.
 *       Super Admin only may still open them for emergency file recovery.</li>
 * </ul>
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 50)
public class RestrictedStorageAccessFilter extends OncePerRequestFilter {

    private static final Pattern ASSESSMENT_PATH = Pattern.compile(
            "^/api/storage/assessments/(\\d+)(?:/|$)");
    private static final Pattern INCIDENT_MEDIA_PATH = Pattern.compile(
            "^/api/storage/(incident_photos|incident_videos)/([^/?#]+)$");

    private final AreaGuard areaGuard;
    private final JdbcTemplate jdbc;

    public RestrictedStorageAccessFilter(AreaGuard areaGuard, JdbcTemplate jdbc) {
        this.areaGuard = areaGuard;
        this.jdbc = jdbc;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path == null) {
            return true;
        }
        // With context-path /api the URI includes /api
        String p = path.startsWith("/api") ? path : "/api" + path;
        return !p.startsWith("/api/storage/assessments/")
                && !p.startsWith("/api/storage/incident_photos/")
                && !p.startsWith("/api/storage/incident_videos/")
                && !p.startsWith("/api/storage/dissemination_uploads/")
                && !p.startsWith("/api/storage/warnings/")
                && !p.startsWith("/api/storage/knowledge/")
                && !p.startsWith("/api/storage/reports/");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !auth.isAuthenticated()) {
            response.sendError(HttpStatus.UNAUTHORIZED.value(), "Authentication required for this file.");
            return;
        }
        String path = request.getRequestURI();
        String p = path.startsWith("/api") ? path : "/api" + path;
        try {
            if (p.startsWith("/api/storage/assessments/")) {
                requireAnyAuthority(auth, "damage_assessment.view", "damage_assessment.manage",
                        "response.view", "incidents.view");
                Matcher m = ASSESSMENT_PATH.matcher(p);
                if (m.find()) {
                    long assessmentId = Long.parseLong(m.group(1));
                    Long n = jdbc.queryForObject(
                            "select count(*) from public.damage_assessments where id = ?",
                            Long.class, assessmentId);
                    if (n == null || n == 0) {
                        response.sendError(HttpStatus.NOT_FOUND.value(), "Assessment not found.");
                        return;
                    }
                    areaGuard.assertOwnOrShared("public.damage_assessments", assessmentId);
                }
            } else if (p.startsWith("/api/storage/incident_photos/")
                    || p.startsWith("/api/storage/incident_videos/")) {
                requireAnyAuthority(auth, "incidents.view", "incidents.manage", "response.view");
                guardIncidentMediaIfMapped(auth, p);
            } else if (p.startsWith("/api/storage/knowledge/")) {
                requireAnyAuthority(auth, "recovery.view", "recovery.manage", "knowledge_repository.view");
            } else if (p.startsWith("/api/storage/warnings/")) {
                // Real catalogue: view/create/disseminate/approve (no early_warning.manage / ew.view)
                requireAnyAuthority(auth, "early_warning.view", "early_warning.create",
                        "early_warning.disseminate", "early_warning.approve");
            } else if (p.startsWith("/api/storage/dissemination_uploads/")) {
                requireAnyAuthority(auth, "one_health.view", "one_health.disseminate", "one_health.manage");
            } else if (p.startsWith("/api/storage/reports/")) {
                requireAnyAuthority(auth, "reports.view", "reports_and_analytics.view", "dlna.view",
                        "damage_assessment.view");
            }
            filterChain.doFilter(request, response);
        } catch (ResponseStatusException ex) {
            int code = ex.getStatusCode().value();
            response.sendError(code, ex.getReason() == null ? "Forbidden" : ex.getReason());
        } catch (RuntimeException ex) {
            String msg = ex.getMessage() == null ? "Forbidden" : ex.getMessage();
            if (msg.toLowerCase().contains("not found")) {
                response.sendError(HttpStatus.NOT_FOUND.value(), msg);
            } else {
                response.sendError(HttpStatus.FORBIDDEN.value(), msg);
            }
        }
    }

    /**
     * When the relative storage path is registered on an incident media column, re-apply the same
     * area boundary as incident detail (strict own-area). Unmapped orphan filenames fail closed
     * (404) for non–Super Admin callers — manage alone is not enough to probe free-form names.
     */
    private void guardIncidentMediaIfMapped(Authentication auth, String apiPath) {
        Matcher m = INCIDENT_MEDIA_PATH.matcher(apiPath);
        if (!m.find()) {
            return;
        }
        String folder = m.group(1);
        String fileName = m.group(2);
        if (fileName.contains("..") || fileName.contains("/") || fileName.contains("\\")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid media path.");
        }
        String relative = folder + "/" + fileName;
        List<Long> ids = jdbc.queryForList("""
                select id from public.incidents
                 where photo_path = ?
                    or photo_path = ?
                    or video_path = ?
                    or video_path = ?
                    or cast(coalesce(photo_paths, '[]') as text) like ?
                 order by id
                 limit 5
                """, Long.class, relative, fileName, relative, fileName, "%" + fileName + "%");
        if (ids.isEmpty()) {
            // F96 deep residual closed: no parent row ⇒ no AreaGuard. Fail closed for ordinary
            // operators (including incidents.manage). Super Admin may open for emergency recovery.
            if (isSuperAdmin(auth)) {
                return;
            }
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "Media file is not linked to an incident record.");
        }
        // If multiple hits (rare path collision), every owner must be in-area; fail closed on first out-of-scope.
        for (Long incidentId : ids) {
            areaGuard.assertOwn("public.incidents", incidentId);
        }
    }

    private static void requireAnyAuthority(Authentication auth, String... authorities) {
        for (String a : authorities) {
            if (auth.getAuthorities().stream().anyMatch(ga -> a.equals(ga.getAuthority()))) {
                return;
            }
        }
        if (isSuperAdmin(auth)) {
            return;
        }
        throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                "Missing permission to read this operational attachment.");
    }

    private static boolean isSuperAdmin(Authentication auth) {
        if (auth == null) {
            return false;
        }
        return auth.getAuthorities().stream().anyMatch(ga -> {
            String a = ga.getAuthority();
            return a != null && (a.equals("Super Admin")
                    || a.equals("ROLE_Super Admin")
                    || a.equals("ROLE_SUPER_ADMIN")
                    || a.contains("Super Admin"));
        });
    }
}
