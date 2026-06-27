package tz.go.pmo.dmis.settings;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Guards the V102 RBAC de-cheating: the settings WRITE controllers are now gated on matrix permissions
 * ({@code hasAuthority}) instead of role composites, and the grants were corrected to match the access
 * the code actually allowed. This proves enforcement == matrix for the two clearest fixes:
 * <ul>
 *   <li>EOCC was shown {@code roles_and_permissions.manage} / {@code location_management.manage} in the
 *       matrix but the code blocked it — now both deny (403).</li>
 *   <li>Director was allowed locations by the role gate but not granted in the matrix — now granted (not 403).</li>
 *   <li>A field role (DAS) is denied; an admin (Super Admin) is allowed.</li>
 * </ul>
 * Probes use non-existent ids so the AUTHORISED calls are no-ops (authorisation fires before the body).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class RbacSettingsMatrixAuthorityTest {

    private static final String ROLES = "/v1/settings/roles/999999999/permissions";
    private static final String REGION = "/v1/settings/locations/regions/999999999";
    private static final String BODY = "{}";

    @Autowired private MockMvc mvc;

    private int status(String url, String role) throws Exception {
        return mvc.perform(put(url).header("X-Local-Roles", role)
                .contentType(MediaType.APPLICATION_JSON).content(BODY)).andReturn().getResponse().getStatus();
    }

    @Test
    void rolesAndPermissionsManageMatchesMatrix() throws Exception {
        assertEquals(403, status(ROLES, "EOCC"), "EOCC must NOT manage roles (matrix grant was removed)");
        assertEquals(403, status(ROLES, "DAS"), "DAS must NOT manage roles");
        assertNotEquals(403, status(ROLES, "Super Admin"), "Super Admin must be authorised to manage roles");
        assertNotEquals(403, status(ROLES, "ICT Admin"), "ICT Admin must be authorised to manage roles");
    }

    @Test
    void locationManageMatchesMatrix() throws Exception {
        assertNotEquals(403, status(REGION, "Director"), "Director must be authorised to manage locations (grant added)");
        assertNotEquals(403, status(REGION, "Super Admin"), "Super Admin must be authorised to manage locations");
        assertEquals(403, status(REGION, "EOCC"), "EOCC must NOT manage locations (matrix grant was removed)");
        assertEquals(403, status(REGION, "DAS"), "DAS must NOT manage locations");
    }
}
