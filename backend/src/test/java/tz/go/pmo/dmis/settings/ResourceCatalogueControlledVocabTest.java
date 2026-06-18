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
 * Proves the relief-resource catalogue is now a CONTROLLED vocabulary (the V65 reference tables):
 * the index serves authoritative `categories` + `units` lists, and create rejects an off-vocabulary
 * category or unit with 400 (server-side enforcement, not just the client select). The rejecting
 * POSTs throw before any INSERT, so they have no DB side effect.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class ResourceCatalogueControlledVocabTest {

    private static final String BASE = "/v1/settings/resources";
    private static final String ADMIN = "Super Admin";

    @Autowired
    private MockMvc mvc;

    @Test
    void indexServesAuthoritativeCategoryAndUnitVocabularies() throws Exception {
        mvc.perform(get(BASE).header("X-Local-Roles", ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.categories").isArray())
                .andExpect(jsonPath("$.categories[0]").exists())
                .andExpect(jsonPath("$.units").isArray())
                .andExpect(jsonPath("$.units[0]").exists());
    }

    @Test
    void createRejectsOffVocabularyCategory() throws Exception {
        mvc.perform(post(BASE).header("X-Local-Roles", ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Test item\",\"category\":\"Not A Real Category\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void createRejectsOffVocabularyUnit() throws Exception {
        // category is valid (in V65 seed) so we reach the unit check; the bogus unit is rejected pre-insert.
        mvc.perform(post(BASE).header("X-Local-Roles", ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"Test item\",\"category\":\"Food Items\",\"unitOfMeasure\":\"nonsense_unit\"}"))
                .andExpect(status().isBadRequest());
    }
}
