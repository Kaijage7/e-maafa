package tz.go.pmo.dmis.common.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;

class ModuleGuardFilterTest {

    private final ModuleGuardFilter filter = new ModuleGuardFilter();

    @Test
    void dashboardRequiresIncidentsView() throws Exception {
        setAuth("preparedness.view");
        MockHttpServletResponse response = perform("GET", "/api/v1/response/dashboard");
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("incidents.view");
    }

    @Test
    void dashboardAllowsIncidentsView() throws Exception {
        setAuth("incidents.view");
        MockHttpServletResponse response = perform("GET", "/api/v1/response/dashboard");
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void eoccRequiresCommandPostView() throws Exception {
        setAuth("incidents.view");
        MockHttpServletResponse response = perform("GET", "/api/v1/response/eocc");
        assertThat(response.getStatus()).isEqualTo(403);
        assertThat(response.getContentAsString()).contains("command_post.view");
    }

    @Test
    void mobileDevicesStayOpenToAnyAuthenticatedUser() throws Exception {
        setAuth("stakeholder_portal.view");
        MockHttpServletResponse response = perform("PUT", "/api/v1/mobile/devices/current");
        // No module map — filter must not invent a 403.
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void geoResolveStaysOpenToAnyAuthenticatedUser() throws Exception {
        setAuth("partners.view");
        MockHttpServletResponse response = perform("GET", "/api/v1/ops/geo/resolve");
        assertThat(response.getStatus()).isEqualTo(200);
    }

    @Test
    void exposureRequiresMappedOpsPermission() throws Exception {
        setAuth("tasks.view");
        MockHttpServletResponse response = perform("GET", "/api/v1/ops/exposure/area");
        assertThat(response.getStatus()).isEqualTo(403);
    }

    private static void setAuth(String authority) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(
                        "user", "n/a", List.of(new SimpleGrantedAuthority(authority))));
    }

    private MockHttpServletResponse perform(String method, String uri) throws Exception {
        MockHttpServletRequest request = new MockHttpServletRequest(method, uri);
        request.setContextPath("/api");
        request.setRequestURI(uri);
        MockHttpServletResponse response = new MockHttpServletResponse();
        MockFilterChain chain = new MockFilterChain();
        filter.doFilter(request, response, chain);
        if (response.getStatus() == 200 || response.getStatus() == 0) {
            // MockFilterChain does not set status; treat unblocked as 200.
            if (response.getStatus() == 0) {
                response.setStatus(200);
            }
        }
        SecurityContextHolder.clearContext();
        return response;
    }
}
