package tz.go.pmo.dmis.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Proof: the public unsubscribe no longer silences a citizen's alerts on a raw contact match.
 * Step 1 ({@code /unsubscribe}) only sends a one-time code and must NOT deactivate anything; a wrong
 * code at step 2 ({@code /unsubscribe-confirm}) must be rejected and still deactivate nothing. The
 * happy path (correct code) is exercised by the service logic; here we lock the security-critical
 * invariant. Self-cleaning + an {@code .invalid} address so no national data is polluted and no real
 * SMS/email is sent. Requires the local dev Postgres (the standard local dependency).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class PortalUnsubscribeConfirmationTest {

    @Autowired
    private MockMvc mvc;

    @Autowired
    private JdbcTemplate jdbc;

    @Test
    void unsubscribeRequestSendsCodeButDeactivatesNothingUntilConfirmed() throws Exception {
        String email = "f24probe." + System.nanoTime() + "@example.invalid";
        // Create a real subscription via the public path (avoids guessing the table's NOT NULL columns).
        mvc.perform(post("/v1/portal/subscribe").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"Probe\",\"email\":\"" + email + "\",\"consent\":true}"))
                .andExpect(status().isCreated());
        try {
            // STEP 1 — request: returns 200 (code sent) and must NOT deactivate the subscription.
            mvc.perform(post("/v1/portal/unsubscribe").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"contact\":\"" + email + "\"}"))
                    .andExpect(status().isOk());
            Integer stillActive = jdbc.queryForObject(
                    "select count(*) from public.alert_subscriptions where email=? and is_active=true",
                    Integer.class, email);
            assertEquals(1, stillActive, "IDOR fix: requesting unsubscribe must NOT deactivate without confirmation");

            // STEP 2 — wrong code: rejected, and still nothing deactivated.
            mvc.perform(post("/v1/portal/unsubscribe-confirm").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"contact\":\"" + email + "\",\"code\":\"000000\"}"))
                    .andExpect(status().isBadRequest());
            Integer stillActiveAfterBadCode = jdbc.queryForObject(
                    "select count(*) from public.alert_subscriptions where email=? and is_active=true",
                    Integer.class, email);
            assertEquals(1, stillActiveAfterBadCode, "a wrong confirmation code must deactivate nothing");
        } finally {
            jdbc.update("delete from public.alert_unsubscribe_requests where contact=?", email);
            jdbc.update("delete from public.alert_subscriptions where email=?", email);
        }
    }

    @Test
    void confirmWithCorrectCodeDeactivatesAndStoresReason() throws Exception {
        String email = "f24ok." + System.nanoTime() + "@example.invalid";
        mvc.perform(post("/v1/portal/subscribe").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"fullName\":\"OK\",\"email\":\"" + email + "\",\"consent\":true}"))
                .andExpect(status().isCreated());
        try {
            // Inject a pending request with a KNOWN code (real delivery is gateway-dependent; the hash is what matters).
            jdbc.update("insert into public.alert_unsubscribe_requests(contact, code_hash, channel, expires_at, created_at)"
                    + " values (?,?, 'email', now() + interval '15 minutes', now())", email, sha256("123456"));
            String reason = "I receive too many alerts";
            mvc.perform(post("/v1/portal/unsubscribe-confirm").contentType(MediaType.APPLICATION_JSON)
                            .content("{\"contact\":\"" + email + "\",\"code\":\"123456\",\"reason\":\"" + reason + "\"}"))
                    .andExpect(status().isOk());
            Integer active = jdbc.queryForObject(
                    "select count(*) from public.alert_subscriptions where email=? and is_active=true", Integer.class, email);
            assertEquals(0, active, "a correct code must deactivate the subscription");
            String stored = jdbc.queryForObject(
                    "select unsubscribe_reason from public.alert_subscriptions where email=? order by id desc limit 1",
                    String.class, email);
            assertEquals(reason, stored, "the chosen reason must be stored on the deactivated subscription");
        } finally {
            jdbc.update("delete from public.alert_unsubscribe_requests where contact=?", email);
            jdbc.update("delete from public.alert_subscriptions where email=?", email);
        }
    }

    @Test
    void unsubscribeReasonsEndpointServesTheCmsControlledList() throws Exception {
        mvc.perform(get("/v1/portal/unsubscribe-reasons"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.reasons").isArray())
                .andExpect(jsonPath("$.reasons[0].en").exists());
    }

    private static String sha256(String s) throws Exception {
        byte[] d = java.security.MessageDigest.getInstance("SHA-256")
                .digest(s.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        StringBuilder sb = new StringBuilder(d.length * 2);
        for (byte b : d) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
