package tz.go.pmo.dmis.settings;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Regression test for the Location Management data-loss bug: editing a region used to write
 * {@code code = ?} from a field the form never sends, silently NULLing the authoritative short
 * {@code code} column on every save. This creates a throwaway region WITH a code, edits it the way
 * the real form does (no {@code code} in the body), and asserts the code survives — then deletes the
 * throwaway region so there is no lasting side effect.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class LocationCodePreservedOnEditTest {

    private static final String BASE = "/v1/settings/locations";
    private static final String ADMIN = "Super Admin";

    @Autowired
    private MockMvc mvc;

    @Test
    void editingARegionDoesNotNullItsShortCode() throws Exception {
        String created = mvc.perform(post(BASE + "/regions").header("X-Local-Roles", ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__vocab_test_region__\",\"code\":\"VTR\",\"regionCode\":\"VTR-01\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long id = ((Number) JsonPath.read(created, "$.id")).longValue();

        try {
            // edit exactly as the real form does — name/regionCode/population, NO `code`
            mvc.perform(put(BASE + "/regions/" + id).header("X-Local-Roles", ADMIN)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"__vocab_test_region__\",\"regionCode\":\"VTR-02\",\"population\":123}"))
                    .andExpect(status().isOk());

            String after = mvc.perform(get(BASE).header("X-Local-Roles", ADMIN))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString();
            List<String> codes = JsonPath.read(after, "$.regions[?(@.id==" + id + ")].code");
            Assertions.assertEquals(List.of("VTR"), codes, "the short code must survive an edit (was being nulled)");
        } finally {
            mvc.perform(delete(BASE + "/regions/" + id).header("X-Local-Roles", ADMIN));
        }
    }
}
