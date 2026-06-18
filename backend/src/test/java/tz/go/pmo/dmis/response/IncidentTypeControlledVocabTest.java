package tz.go.pmo.dmis.response;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Proves the incident-type severity + icon are now CONTROLLED from the single canonical source
 * ({@link IncidentOptions}): the GET serves the canonical severities (incl. "Unknown", which the old
 * inline list dropped) and an icon catalogue, and create rejects an off-vocabulary severity. The
 * rejecting POST throws on the validity check before any INSERT, so it has no DB side effect.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class IncidentTypeControlledVocabTest {

    private static final String BASE = "/v1/response/settings/incident-types";
    private static final String ADMIN = "Super Admin";

    @Autowired
    private MockMvc mvc;

    @Test
    void servesCanonicalSeverityAndIconVocabularies() throws Exception {
        mvc.perform(get(BASE).header("X-Local-Roles", ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.severities").isArray())
                .andExpect(jsonPath("$.severities[4]").value("Unknown"))
                .andExpect(jsonPath("$.icons").isArray())
                .andExpect(jsonPath("$.icons[0]").exists());
    }

    @Test
    void createRejectsOffVocabularySeverity() throws Exception {
        mvc.perform(post(BASE).header("X-Local-Roles", ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Vocab probe\",\"default_severity\":\"SuperHigh\"}"))
                .andExpect(status().is4xxClientError());
    }
}
