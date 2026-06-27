package tz.go.pmo.dmis.common.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Module-level access control: maps a request path to the {@code <module>.view} permission its module
 * requires, and returns 403 "Access denied" if the authenticated user's role (configured in User
 * Management) does not grant it. This is the single enforcement point that makes module visibility
 * controllable from the Roles &amp; Permissions matrix — e.g. an MDA-Focal/EW login with only
 * {@code early_warning.view} can reach Early Warning but is denied Response, Recovery, etc.
 *
 * <p>Conservative by design: only paths with a known module mapping are guarded; everything else passes
 * (write-level authorization stays with the method {@code @PreAuthorize} gates). Unauthenticated requests
 * are left to the security chain (public allow-list / 401).
 */
public class ModuleGuardFilter extends OncePerRequestFilter {

    /** Longest-prefix wins; the context-path /api is already stripped from getRequestURI() below. */
    private static final Map<String, String> MODULE_PERMISSION = new LinkedHashMap<>();
    static {
        MODULE_PERMISSION.put("/v1/response/incidents", "incidents.view");
        MODULE_PERMISSION.put("/v1/response/approvals", "resource_allocation.view");
        MODULE_PERMISSION.put("/v1/response/allocations", "resource_allocation.view");
        MODULE_PERMISSION.put("/v1/response/dispatch", "resource_allocation.view");
        MODULE_PERMISSION.put("/v1/response/anticipatory-plans", "anticipatory_action_plans.view");
        MODULE_PERMISSION.put("/v1/response/contingency-plans", "contingency_plans.view");
        MODULE_PERMISSION.put("/v1/response/assessments", "damage_assessment.view");
        MODULE_PERMISSION.put("/v1/response/declarations", "disaster_declarations.view");
        MODULE_PERMISSION.put("/v1/response/coordination", "command_post.view");
        MODULE_PERMISSION.put("/v1/response/executive", "command_post.view");
        MODULE_PERMISSION.put("/v1/response/warehouse-ops", "warehouse_and_stock.view");
        MODULE_PERMISSION.put("/v1/ew", "early_warning.view");
        MODULE_PERMISSION.put("/ew", "early_warning.view");
        MODULE_PERMISSION.put("/v1/warehouses", "warehouse_and_stock.view");
        MODULE_PERMISSION.put("/v1/temporary-warehouses", "warehouse_and_stock.view");
        MODULE_PERMISSION.put("/v1/inventory", "warehouse_and_stock.view");
        MODULE_PERMISSION.put("/v1/training-plans", "preparedness.view");
        MODULE_PERMISSION.put("/v1/evacuation-centers", "preparedness.view");
        MODULE_PERMISSION.put("/v1/alert-subscriptions", "preparedness.view");
        MODULE_PERMISSION.put("/v1/onehealth", "one_health.view");
        MODULE_PERMISSION.put("/v1/recovery", "recovery.view");
        MODULE_PERMISSION.put("/v1/reports", "reports_and_analytics.view");
        MODULE_PERMISSION.put("/v1/repository", "reports_and_analytics.view");
        MODULE_PERMISSION.put("/v1/hazards", "prevention_and_mitigation.view");
        MODULE_PERMISSION.put("/v1/mitigation-measures", "prevention_and_mitigation.view");
        MODULE_PERMISSION.put("/v1/infrastructure-items", "prevention_and_mitigation.view");
        MODULE_PERMISSION.put("/v1/past-disasters", "prevention_and_mitigation.view");
        MODULE_PERMISSION.put("/v1/inform", "prevention_and_mitigation.view");
        MODULE_PERMISSION.put("/v1/settings/users", "user_management.view");
        MODULE_PERMISSION.put("/v1/settings/roles", "roles_and_permissions.view");
        MODULE_PERMISSION.put("/v1/settings/resources", "resource_catalogue.view");
        MODULE_PERMISSION.put("/v1/settings/locations", "location_management.view");
        MODULE_PERMISSION.put("/v1/content", "content_management.view");
        // Response sub-modules that were reachable by any authenticated role (audit 2026-06-21): gate their reads.
        MODULE_PERMISSION.put("/v1/response/tasks", "tasks.view");
        MODULE_PERMISSION.put("/v1/response/communication", "communication_and_alerts.view");
        MODULE_PERMISSION.put("/v1/response/stakeholder-coordination", "command_post.view");
        MODULE_PERMISSION.put("/v1/response/settings/approval-chains", "approval_workflows.view");
        MODULE_PERMISSION.put("/v1/response/settings/resources", "resource_catalogue.view");
        MODULE_PERMISSION.put("/v1/response/settings/incident-types", "resource_catalogue.view");
        MODULE_PERMISSION.put("/v1/settings/approval-workflows", "approval_workflows.view");
        MODULE_PERMISSION.put("/v1/settings/translations", "translations.view");
        // Modules that were method-gated but missing from the path map (matrix module-perm not enforced at the
        // filter). Mapped to a permission their endpoint holders already hold, so no access changes — it only
        // makes the matrix module the authoritative gate and stops a future un-@PreAuthorize'd endpoint leaking.
        MODULE_PERMISSION.put("/v1/finance", "budget_and_finance.view");
        MODULE_PERMISSION.put("/v1/response/bidding", "resource_allocation.view");
        MODULE_PERMISSION.put("/v1/response/support", "resource_allocation.view");
        MODULE_PERMISSION.put("/v1/response/public-reports", "incidents.view");
        // Risk Assessment lives under Prevention & Mitigation (its read list was only isAuthenticated()-gated,
        // i.e. open to any logged-in user). Gate the whole module on prevention_and_mitigation.view — same as
        // /v1/hazards and /v1/mitigation-measures. Safe: every risk_assessment.create/approve holder also has
        // prevention_and_mitigation.view, so the write endpoints are not double-gated out.
        MODULE_PERMISSION.put("/v1/risk-assessments", "prevention_and_mitigation.view");
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        String ctx = request.getContextPath();
        if (ctx != null && !ctx.isEmpty() && path.startsWith(ctx)) {
            path = path.substring(ctx.length());
        }
        String required = requiredPermission(path);
        if (required != null) {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && !hasAuthority(auth, required)) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json");
                response.getWriter().write("{\"error\":\"Access denied\",\"message\":\"You do not have access to this module.\",\"required\":\""
                        + required + "\"}");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private static String requiredPermission(String path) {
        String best = null;
        String bestPerm = null;
        for (Map.Entry<String, String> e : MODULE_PERMISSION.entrySet()) {
            String prefix = e.getKey();
            if ((path.equals(prefix) || path.startsWith(prefix + "/")) && (best == null || prefix.length() > best.length())) {
                best = prefix;
                bestPerm = e.getValue();
            }
        }
        return bestPerm;
    }

    private static boolean hasAuthority(Authentication auth, String permission) {
        for (GrantedAuthority a : auth.getAuthorities()) {
            if (permission.equals(a.getAuthority())) {
                return true;
            }
        }
        return false;
    }
}
