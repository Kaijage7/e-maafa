package tz.go.pmo.dmis.settings;

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
 * Proves the translation group is now a CONTROLLED vocabulary (the V66 reference table): the index
 * serves the authoritative `groups` list, and create rejects an off-vocabulary group with 400. The
 * rejecting POST sends a fresh unique key but throws on the group check before any INSERT, so it has
 * no DB side effect.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class TranslationGroupControlledVocabTest {

    private static final String BASE = "/v1/settings/translations";
    private static final String ADMIN = "Super Admin";

    @Autowired
    private MockMvc mvc;

    @Test
    void indexServesGovernedGroupVocabulary() throws Exception {
        mvc.perform(get(BASE).header("X-Local-Roles", ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.groups").isArray())
                .andExpect(jsonPath("$.groups[0]").exists());
    }

    @Test
    void createRejectsOffVocabularyGroup() throws Exception {
        mvc.perform(post(BASE).header("X-Local-Roles", ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"labelKey\":\"lbl__vocab_guard_probe__\",\"group\":\"Not A Real Group\","
                                + "\"en\":\"x\",\"sw\":\"y\"}"))
                .andExpect(status().isBadRequest());
    }
}
