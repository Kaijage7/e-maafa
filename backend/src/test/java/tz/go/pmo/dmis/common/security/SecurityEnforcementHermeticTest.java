package tz.go.pmo.dmis.common.security;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * F102: same role-gate proofs as {@link SecurityEnforcementTest}, but against a
 * <strong>hermetic</strong> Testcontainers Postgres (no localhost:5440 required).
 *
 * <p>Opt-in via {@code RUN_TESTCONTAINERS=true} so default developer {@code mvn test} stays
 * fast when Docker is busy/unavailable. CI with Docker should set the flag.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
@EnabledIfEnvironmentVariable(named = "RUN_TESTCONTAINERS", matches = "true")
class SecurityEnforcementHermeticTest extends HermeticPostgresSupport {

    private static final String WRITE = "/v1/settings/users";

    @Autowired
    private MockMvc mvc;

    @Test
    void tokenlessRequestIsUnauthorizedWhenGodModeOff() throws Exception {
        // Security reassessment: local-god-mode defaults false → no X-Local-Roles, no JWT → 401.
        mvc.perform(post(WRITE).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void wrongRolePersonaIsForbidden() throws Exception {
        mvc.perform(post(WRITE).contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Partners"))
                .andExpect(status().isForbidden());
    }

    @Test
    void fieldOfficerRoleIsForbiddenOnAdminWrite() throws Exception {
        mvc.perform(post(WRITE).contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminRoleClearsTheGate() throws Exception {
        mvc.perform(post(WRITE).contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Super Admin"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void recoveryProgramCreateDeniesFieldRole() throws Exception {
        mvc.perform(post("/v1/recovery/recovery-programs").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "DAS"))
                .andExpect(status().isForbidden());
    }

    @Test
    void ewDisseminateDeletedEndpointIsNotFound() throws Exception {
        // F01/F102: /ew/disseminate was removed. ModuleGuard may 403 a DAS before routing;
        // Super Admin clears the module gate so the missing handler yields 404 (not a live 200/2xx).
        mvc.perform(post("/v1/ew/disseminate").contentType(MediaType.APPLICATION_JSON).content("{}")
                        .header("X-Local-Roles", "Super Admin"))
                .andExpect(status().isNotFound());
    }
}
