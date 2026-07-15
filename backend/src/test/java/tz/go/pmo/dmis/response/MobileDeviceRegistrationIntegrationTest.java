package tz.go.pmo.dmis.response;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import tz.go.pmo.dmis.common.security.HermeticPostgresSupport;

/**
 * Proves that authenticated installations can register, refresh, and revoke without leaking push
 * tokens, and that a live token cannot be claimed by a second user.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class MobileDeviceRegistrationIntegrationTest extends HermeticPostgresSupport {

    private static final String ENDPOINT = "/v1/mobile/devices/current";
    /** Must start with alnum — matches server installation_id pattern. */
    private static final String PREFIX = "mobile-device-it-";

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper objectMapper;

    @AfterEach
    void clean() {
        jdbc.update("delete from platform.mobile_device_installations where installation_id like ?",
                PREFIX + "%");
    }

    @Test
    void registerRefreshAndRevokeCurrentInstallation() throws Exception {
        String installationId = PREFIX + UUID.randomUUID();
        String token = "fcm-token-" + UUID.randomUUID() + "-long-enough";

        MvcResult created = putDevice("Super Admin", null, body(installationId, "android", "fcm", token, "1.0.0"));
        assertThat(created.getResponse().getStatus()).isEqualTo(200);
        JsonNode first = objectMapper.readTree(created.getResponse().getContentAsString());
        assertThat(first.path("status").asText()).isEqualTo("active");
        assertThat(first.path("push_token_present").asBoolean()).isTrue();
        assertThat(first.has("push_token")).isFalse();
        assertThat(first.path("installation_id").asText()).isEqualTo(installationId);

        MvcResult refreshed = putDevice("Super Admin", null, body(installationId, "android", "fcm", token, "1.0.1"));
        assertThat(refreshed.getResponse().getStatus()).isEqualTo(200);
        assertThat(countRows(installationId)).isEqualTo(1);

        MvcResult revoked = mvc.perform(delete(ENDPOINT)
                        .header("X-Local-Roles", "Super Admin")
                        .header("X-Device-Installation", installationId))
                .andReturn();
        assertThat(revoked.getResponse().getStatus()).isEqualTo(200);
        JsonNode afterRevoke = objectMapper.readTree(revoked.getResponse().getContentAsString());
        assertThat(afterRevoke.path("status").asText()).isEqualTo("revoked");
        assertThat(afterRevoke.path("push_token_present").asBoolean()).isFalse();

        String provider = jdbc.queryForObject("""
                select push_provider from platform.mobile_device_installations
                 where installation_id = ?
                """, String.class, installationId);
        assertThat(provider).isEqualTo("none");
    }

    @Test
    void livePushTokenCannotBeClaimedByAnotherUser() throws Exception {
        String token = "fcm-shared-" + UUID.randomUUID() + "-long-enough";
        String firstInstall = PREFIX + UUID.randomUUID();
        String secondInstall = PREFIX + UUID.randomUUID();

        Long superAdmin = jdbc.queryForObject("""
                select min(mhr.model_id) from public.model_has_roles mhr
                join public.roles r on r.id = mhr.role_id where r.name = 'Super Admin'
                """, Long.class);
        Long otherUser = jdbc.queryForObject("""
                select min(id) from public.users where id <> coalesce(?, -1)
                """, Long.class, superAdmin);
        assertThat(otherUser).isNotNull();

        assertThat(putDevice("Super Admin", superAdmin,
                body(firstInstall, "android", "fcm", token, "1.0.0"))
                .getResponse().getStatus()).isEqualTo(200);

        MvcResult conflict = putDevice("Dist DC", otherUser,
                body(secondInstall, "android", "fcm", token, "1.0.0"));
        assertThat(conflict.getResponse().getStatus()).isEqualTo(409);
        assertThat(countRows(secondInstall)).isZero();
    }

    @Test
    void fcmRequiresTokenAndUnauthenticatedRequestsAreRejected() throws Exception {
        String installationId = PREFIX + UUID.randomUUID();

        MvcResult missingToken = putDevice("Super Admin", null,
                body(installationId, "ios", "apns", null, "2.0.0"));
        assertThat(missingToken.getResponse().getStatus()).isEqualTo(400);

        MvcResult anonymous = mvc.perform(put(ENDPOINT)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body(installationId, "web", "none", null, "2.0.0")))
                .andReturn();
        assertThat(anonymous.getResponse().getStatus()).isEqualTo(401);
    }

    @Test
    void databaseAlsoRejectsAProviderWithoutAToken() {
        Long userId = jdbc.queryForObject("select min(id) from public.users", Long.class);
        String installationId = PREFIX + UUID.randomUUID();

        assertThatThrownBy(() -> jdbc.update("""
                insert into platform.mobile_device_installations(
                    user_id, installation_id, platform, push_provider, push_token)
                values (?, ?, 'android', 'fcm', null)
                """, userId, installationId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private MvcResult putDevice(String roles, Long userId, String json) throws Exception {
        var request = put(ENDPOINT)
                .header("X-Local-Roles", roles)
                .contentType(MediaType.APPLICATION_JSON)
                .content(json);
        if (userId != null) {
            request.header("X-Local-User-Id", userId.toString());
        }
        return mvc.perform(request).andReturn();
    }

    private String body(String installationId, String platform, String provider, String token, String version)
            throws Exception {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("installation_id", installationId);
        map.put("platform", platform);
        map.put("push_provider", provider);
        map.put("app_version", version);
        if (token != null) {
            map.put("push_token", token);
        }
        return objectMapper.writeValueAsString(map);
    }

    private long countRows(String installationId) {
        Long count = jdbc.queryForObject(
                "select count(*) from platform.mobile_device_installations where installation_id = ?",
                Long.class, installationId);
        return count == null ? 0L : count;
    }
}
