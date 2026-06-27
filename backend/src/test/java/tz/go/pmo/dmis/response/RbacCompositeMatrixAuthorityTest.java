package tz.go.pmo.dmis.response;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Guards the V103 RBAC de-cheating for the composite gates (now matrix permissions). Probes are
 * method-level: DAS passes the module guard (it holds every {@code *.view}) but only the specific
 * action permission decides — so a 403 here proves the real action gate, not a coincidental block.
 * Non-existent ids make the AUTHORISED calls no-ops (authorisation fires before the body).
 * <ul>
 *   <li>{@code contingency_plans.manage} (operator tier incl. DAS) vs {@code contingency_plans.approve}
 *       (oversight tier, excl. DAS) — proves maker≠checker survived the conversion.</li>
 *   <li>{@code incidents.publish} (Comms yes, DAS no).</li>
 * </ul>
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class RbacCompositeMatrixAuthorityTest {

    @Autowired private MockMvc mvc;

    private int status(String url, String role) throws Exception {
        return mvc.perform(post(url).header("X-Local-Roles", role)
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn().getResponse().getStatus();
    }

    @Test
    void contingencyManageVsApproveKeepsMakerChecker() throws Exception {
        // manage: the operator tier includes DAS
        assertNotEquals(403, status("/v1/response/contingency-plans/999999999/submit", "DAS"),
                "DAS holds contingency_plans.manage (operator tier)");
        // approve: oversight tier EXCLUDES DAS -> must be 403 even though DAS can manage
        assertEquals(403, status("/v1/response/contingency-plans/999999999/approve", "DAS"),
                "DAS must NOT approve contingency plans (maker≠checker)");
        assertNotEquals(403, status("/v1/response/contingency-plans/999999999/approve", "Director"),
                "Director holds contingency_plans.approve");
    }

    @Test
    void incidentPublishMatchesMatrix() throws Exception {
        assertNotEquals(403, status("/v1/response/incidents/999999999/push-map", "Comms Officer"),
                "Comms Officer holds incidents.publish");
        assertEquals(403, status("/v1/response/incidents/999999999/push-map", "DAS"),
                "DAS must NOT publish incidents to the portal");
    }

    @Test
    void oneHealthDirectivesArePmoOnly() throws Exception {
        // issuing a directive is a PMO-DMD function (one_health.directive)
        String issue = "/v1/onehealth/events/999999999/directives";
        assertNotEquals(403, status(issue, "Director"), "Director (PMO) can issue OH directives");
        assertNotEquals(403, status(issue, "EOCC"), "EOCC (PMO) can issue OH directives");
        // non-PMO roles that hold one_health.manage (pass the OH module guard) must still be blocked here
        assertEquals(403, status(issue, "Reg DC"), "Reg DC (non-PMO) must NOT issue OH directives");
        assertEquals(403, status(issue, "Partners"), "Partners must NOT issue OH directives");
    }
}
