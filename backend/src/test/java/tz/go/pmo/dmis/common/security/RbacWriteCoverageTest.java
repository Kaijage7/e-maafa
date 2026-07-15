package tz.go.pmo.dmis.common.security;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.context.annotation.ClassPathScanningCandidateComponentProvider;
import org.springframework.core.type.filter.AnnotationTypeFilter;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Regression guard against privilege escalation: every write endpoint (POST/PUT/PATCH/DELETE) in the
 * controller package must be protected by a <b>real role check</b>, not merely "logged in". A class-level scan, no Spring
 * context / no DB.
 *
 * <p><b>What changed (and why):</b> the previous version only asserted that <i>some</i> {@code @PreAuthorize}
 * was <i>present</i> — so {@code @PreAuthorize("isAuthenticated()")} passed, even though any logged-in
 * user (a read-only viewer, a partner) could then write national data. The go-production assessment proved
 * exactly that live. This version inspects the <b>effective expression</b> on each write and requires it to
 * bear a role test ({@code hasRole}/{@code hasAnyRole}/{@code hasAuthority}); bare {@code isAuthenticated()}
 * and {@code permitAll()} no longer count as authorization.
 *
 * <h3>Scope — every REST controller</h3>
 * Controllers were consolidated under {@code tz.go.pmo.dmis.controller}; scanning that package directly
 * keeps this guard effective when feature packages move. The strict role-check locks all protected writes
 * against regression and the non-zero assertion prevents a vacuous pass.
 * The only endpoints permitted to lack a role test are the explicitly documented public or per-user
 * operations below. Bare {@code isAuthenticated()} / {@code permitAll()} do not pass automatically.
 */
class RbacWriteCoverageTest {

    private static final String BASE = "tz.go.pmo.dmis";

    /** All application REST controllers live here; strict write checks apply to every controller. */
    private static final String CONTROLLER_PACKAGE = BASE + ".controller";

    /**
     * Controllers whose writes are intentionally NOT role-gated, by design — each justified. These are the
     * only writes in a swept module allowed to lack a role test.
     * <ul>
     *   <li>{@code PortalPublicController} — the public citizen surface (report a hazard, subscribe/unsubscribe
     *       to alerts, submit a contingency-plan idea); these MUST be reachable without an account and sit on
     *       the {@code SecurityPaths} public allowlist. Abuse-protected by {@link PortalWriteRateLimitFilter},
     *       and the unsubscribe is ownership-checked at the service layer.</li>
     * </ul>
     */
    private static final Set<String> INTENTIONAL_PUBLIC_CONTROLLERS = Set.of("PortalPublicController");

    /**
     * Explicit method-level exceptions that do not mutate shared application data:
     * <ul>
     *   <li>Auth operations are public identity entry points or authenticated changes to the caller's own account.</li>
     *   <li>The delivery-status callback is a public gateway webhook protected by a configured shared secret.</li>
     *   <li>Notification operations change only the caller's own read state/preferences.</li>
     *   <li>Mobile-device operations register or revoke only the authenticated caller's installation;
     *       the request cannot name another user and the service repeats the numeric-owner check.</li>
     *   <li>EW action statements are a read-only proposal calculation that uses POST only to accept a JSON body.</li>
     * </ul>
     * Keeping these at method granularity ensures a new write on the same controller is scanned by default.
     */
    private static final Set<String> INTENTIONAL_NON_ROLE_METHODS = Set.of(
            "AuthController#login",
            "AuthController#verifyMfa",
            "AuthController#setupTotp",
            "AuthController#enableTotp",
            "AuthController#disableTotp",
            "AuthController#forgotPassword",
            "AuthController#resetPassword",
            "AuthController#logout",
            "AuthController#changePassword",
            "DeliveryStatusController#smsDlr",
            "EwAgencyController#actionStatements",
            "MobileDeviceController#registerCurrent",
            "MobileDeviceController#revokeCurrent",
            "NotificationController#dismiss",
            "NotificationController#markRead",
            "NotificationController#markUnread",
            "NotificationController#markAllRead",
            "NotificationController#saveMyPreferences");

    @Test
    void everyWriteInSweptModulesHasARealRoleCheck() throws Exception {
        ClassPathScanningCandidateComponentProvider scanner =
                new ClassPathScanningCandidateComponentProvider(false);
        scanner.addIncludeFilter(new AnnotationTypeFilter(RestController.class));

        int inScopeWriteControllers = 0;
        List<String> violations = new ArrayList<>();
        for (BeanDefinition def : scanner.findCandidateComponents(CONTROLLER_PACKAGE)) {
            String className = def.getBeanClassName();
            if (className == null) {
                continue;
            }
            Class<?> controller = Class.forName(className, false, getClass().getClassLoader());
            String simpleName = controller.getSimpleName();
            if (INTENTIONAL_PUBLIC_CONTROLLERS.contains(simpleName)) {
                continue;
            }
            Method[] methods = controller.getDeclaredMethods();
            boolean hasWrite = Arrays.stream(methods).anyMatch(RbacWriteCoverageTest::isWrite);
            if (!hasWrite) {
                continue;
            }
            inScopeWriteControllers++;
            String classExpr = controller.isAnnotationPresent(PreAuthorize.class)
                    ? controller.getAnnotation(PreAuthorize.class).value() : null;
            for (Method m : methods) {
                if (!isWrite(m)) {
                    continue;
                }
                String methodKey = simpleName + "#" + m.getName();
                if (INTENTIONAL_NON_ROLE_METHODS.contains(methodKey)) {
                    continue;
                }
                // The effective gate: a method-level @PreAuthorize overrides the class-level one for that method.
                String expr = m.isAnnotationPresent(PreAuthorize.class)
                        ? m.getAnnotation(PreAuthorize.class).value() : classExpr;
                if (!isRoleBearing(expr)) {
                    violations.add(simpleName + "#" + m.getName() + "  [gate=" + (expr == null ? "NONE" : expr) + "]");
                }
            }
        }

        // Sanity: the scan actually found in-scope write controllers (guards against a vacuous pass).
        assertTrue(inScopeWriteControllers > 0, "scan found no write controllers in the swept modules");
        assertTrue(violations.isEmpty(),
                "Write endpoints in swept modules WITHOUT a real role check (a bare isAuthenticated()/permitAll() "
                        + "is NOT authorization — gate them with an Authz.* hasAnyRole(...) constant, or, if "
                        + "genuinely non-role-by-design, add the exact method to INTENTIONAL_NON_ROLE_METHODS with a reason):\n  "
                        + String.join("\n  ", violations));
    }

    /**
     * A {@code @PreAuthorize} value counts as authorization only if it tests a role/authority. Bare
     * {@code isAuthenticated()} / {@code permitAll()} / nothing do not — any logged-in user passes them.
     */
    private static boolean isRoleBearing(String expr) {
        if (expr == null || expr.isBlank()) {
            return false;
        }
        String e = expr.replace(" ", "");
        if (e.equals("isAuthenticated()") || e.equals("permitAll()") || e.equals("permitAll")) {
            return false;
        }
        return e.contains("hasRole(") || e.contains("hasAnyRole(")
                || e.contains("hasAuthority(") || e.contains("hasAnyAuthority(");
    }

    private static boolean isWrite(Method m) {
        return m.isAnnotationPresent(PostMapping.class) || m.isAnnotationPresent(PutMapping.class)
                || m.isAnnotationPresent(PatchMapping.class) || m.isAnnotationPresent(DeleteMapping.class);
    }
}
