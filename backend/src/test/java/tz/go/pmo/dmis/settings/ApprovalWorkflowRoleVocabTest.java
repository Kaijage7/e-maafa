package tz.go.pmo.dmis.settings;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/**
 * Proves the approval-chain role is enforced server-side against the authoritative public.roles
 * vocabulary (previously only the client dropdown constrained it). The index serves the role list,
 * and editing a level with an off-vocabulary role is rejected with 400 — the role check runs before
 * any UPDATE, so the (non-existent) level id is never touched.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class ApprovalWorkflowRoleVocabTest {

    private static final String BASE = "/v1/settings/approval-workflows";
    private static final String ADMIN = "Super Admin";

    @Autowired
    private MockMvc mvc;

    @Test
    void indexServesAuthoritativeRoleVocabulary() throws Exception {
        mvc.perform(get(BASE).header("X-Local-Roles", ADMIN))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles").isArray())
                .andExpect(jsonPath("$.roles[0]").exists());
    }

    @Test
    void updateLevelRejectsOffVocabularyRole() throws Exception {
        mvc.perform(put(BASE + "/levels/999999").header("X-Local-Roles", ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"roleRequired\":\"Not A Real Role\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void chainLevelAddEditRemoveLifecycle() throws Exception {
        // module[0] is the seeded engine module (resource_allocation). Add a temp level, edit it with a
        // valid role, then remove it — net-zero on the operational chain; proves add/edit/remove work E2E.
        String idx = mvc.perform(get(BASE).header("X-Local-Roles", ADMIN))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        long moduleId = ((Number) JsonPath.read(idx, "$.modules[0].id")).longValue();

        String created = mvc.perform(post(BASE + "/" + moduleId + "/levels").header("X-Local-Roles", ADMIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"__aw_lifecycle_probe__\",\"roleRequired\":\"DAS\"}"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        long levelId = ((Number) JsonPath.read(created, "$.id")).longValue();
        try {
            mvc.perform(put(BASE + "/levels/" + levelId).header("X-Local-Roles", ADMIN)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"name\":\"__aw_lifecycle_probe2__\",\"roleRequired\":\"RAS\"}"))
                    .andExpect(status().isOk());
        } finally {
            mvc.perform(delete(BASE + "/levels/" + levelId).header("X-Local-Roles", ADMIN))
                    .andExpect(status().isNoContent());
        }
    }
}
