package tz.go.pmo.dmis.response;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.mock.web.MockMultipartFile;
import tz.go.pmo.dmis.common.security.HermeticPostgresSupport;
import tz.go.pmo.dmis.common.idempotency.ApiIdempotencyService;

/**
 * Database-backed proof that a lost-response retry cannot create two incidents, including when two
 * identical requests arrive concurrently. It exercises the real security chain, migration, transaction,
 * jurisdiction service and response replay rather than a mocked repository.
 */
@SpringBootTest(properties = "dmis.idempotency.cleanup-batch-size=1")
@AutoConfigureMockMvc
@ActiveProfiles("local")
class MobileIncidentIdempotencyIntegrationTest extends HermeticPostgresSupport {

    private static final String ENDPOINT = "/v1/mobile/incidents";
    private static final String TITLE_PREFIX = "__mobile_idem_it__";

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private ApiIdempotencyService idempotencyService;

    private final Set<String> keys = ConcurrentHashMap.newKeySet();

    @AfterEach
    void cleanControlledRows() {
        for (String key : keys) {
            jdbc.update("delete from platform.api_idempotency_keys where idempotency_key = ?", key);
        }
        jdbc.update("""
                delete from public.incident_workflow_histories
                 where incident_id in (select id from public.incidents where title like ?)
                """, TITLE_PREFIX + "%");
        jdbc.update("delete from public.incidents where title like ?", TITLE_PREFIX + "%");
        keys.clear();
    }

    @Test
    void sequentialRetryReplaysOneCommittedIncident() throws Exception {
        String key = key();
        String title = TITLE_PREFIX + UUID.randomUUID();
        String body = request(title);

        MvcResult first = perform(key, body);
        MvcResult retry = perform(key, body);

        assertThat(first.getResponse().getStatus()).isEqualTo(201);
        assertThat(retry.getResponse().getStatus()).isEqualTo(201);
        assertThat(id(first)).isEqualTo(id(retry));
        assertThat(countIncidents(title)).isEqualTo(1);
        assertThat(countReceipts(key)).isEqualTo(1);
    }

    @Test
    void concurrentRetrySerializesOnTheUniqueReceipt() throws Exception {
        String key = key();
        String title = TITLE_PREFIX + UUID.randomUUID();
        String body = request(title);
        CountDownLatch start = new CountDownLatch(1);

        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<MvcResult> a = pool.submit(() -> {
                start.await();
                return perform(key, body);
            });
            Future<MvcResult> b = pool.submit(() -> {
                start.await();
                return perform(key, body);
            });
            start.countDown();

            MvcResult first = a.get();
            MvcResult second = b.get();
            assertThat(first.getResponse().getStatus()).isEqualTo(201);
            assertThat(second.getResponse().getStatus()).isEqualTo(201);
            assertThat(id(first)).isEqualTo(id(second));
        }
        assertThat(countIncidents(title)).isEqualTo(1);
        assertThat(countReceipts(key)).isEqualTo(1);
    }

    @Test
    void keyCannotBeReusedForAnotherPayload() throws Exception {
        String key = key();
        String firstTitle = TITLE_PREFIX + UUID.randomUUID();
        String secondTitle = TITLE_PREFIX + UUID.randomUUID();

        assertThat(perform(key, request(firstTitle)).getResponse().getStatus()).isEqualTo(201);
        MvcResult mismatch = perform(key, request(secondTitle));

        assertThat(mismatch.getResponse().getStatus()).isEqualTo(422);
        assertThat(mismatch.getResponse().getContentAsString()).contains("different incident payload");
        assertThat(countIncidents(firstTitle)).isEqualTo(1);
        assertThat(countIncidents(secondTitle)).isZero();
    }

    @Test
    void correctableValidationFailureDoesNotConsumeTheRetryKey() throws Exception {
        String key = key();
        String title = TITLE_PREFIX + UUID.randomUUID();
        Long hazardId = jdbc.queryForObject("select min(id) from public.hazards", Long.class);
        String missingLocation = objectMapper.writeValueAsString(java.util.Map.of(
                "title", title,
                "hazard_id", hazardId,
                "reported_at", OffsetDateTime.now().minusMinutes(1).withNano(0).toString(),
                "severity_level", "Moderate"));

        MvcResult invalid = perform(key, missingLocation);
        MvcResult corrected = perform(key, request(title));

        assertThat(invalid.getResponse().getStatus()).isEqualTo(422);
        assertThat(corrected.getResponse().getStatus()).isEqualTo(201);
        assertThat(countIncidents(title)).isEqualTo(1);
        assertThat(countReceipts(key)).isEqualTo(1);
    }

    @Test
    void mobileCreateRequiresAKeyAndTheIncidentCreatePermission() throws Exception {
        String title = TITLE_PREFIX + UUID.randomUUID();
        String body = request(title);

        MvcResult missingKey = mvc.perform(post(ENDPOINT)
                        .header("X-Local-Roles", "Super Admin")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();
        MvcResult partner = mvc.perform(post(ENDPOINT)
                        .header("X-Local-Roles", "Partners")
                        .header("Idempotency-Key", key())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();

        assertThat(missingKey.getResponse().getStatus()).isEqualTo(400);
        assertThat(partner.getResponse().getStatus()).isEqualTo(403);
        assertThat(countIncidents(title)).isZero();
    }

    @Test
    void mobileCreateRejectsATimezoneFreeTimestampBeforeMutation() throws Exception {
        String title = TITLE_PREFIX + UUID.randomUUID();
        Long hazardId = jdbc.queryForObject("select min(id) from public.hazards", Long.class);
        String body = objectMapper.writeValueAsString(java.util.Map.of(
                "title", title,
                "hazard_id", hazardId,
                "location_description", "Timezone contract test",
                "reported_at", "2026-07-15T08:30",
                "severity_level", "Moderate"));

        MvcResult result = perform(key(), body);

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(result.getResponse().getContentAsString()).contains("RFC 3339");
        assertThat(countIncidents(title)).isZero();
    }

    @Test
    void mobileCreateRejectsCalendarInvalidOffsetTimestampBeforeMutation() throws Exception {
        String title = TITLE_PREFIX + UUID.randomUUID();
        Long hazardId = jdbc.queryForObject("select min(id) from public.hazards", Long.class);
        String body = objectMapper.writeValueAsString(java.util.Map.of(
                "title", title,
                "hazard_id", hazardId,
                "location_description", "Timestamp semantic validation test",
                "reported_at", "2026-99-99T08:30:00+03:00",
                "severity_level", "Moderate"));

        MvcResult result = perform(key(), body);

        assertThat(result.getResponse().getStatus()).isEqualTo(400);
        assertThat(result.getResponse().getContentAsString()).contains("valid RFC 3339");
        assertThat(countIncidents(title)).isZero();
    }

    @Test
    void expiredReceiptCleanupIsBoundedPerRun() {
        String first = key();
        String second = key();
        Long actor = jdbc.queryForObject("select min(id) from public.users", Long.class);
        for (String key : java.util.List.of(first, second)) {
            jdbc.update("""
                    insert into platform.api_idempotency_keys(
                        actor_user_id, operation, idempotency_key, request_fingerprint,
                        created_at, expires_at)
                    values (?, 'incident.create', ?, ?, now() - interval '2 days', now() - interval '1 day')
                    """, actor, key, "0".repeat(64));
        }

        idempotencyService.purgeExpired();

        Long remaining = jdbc.queryForObject("""
                select count(*) from platform.api_idempotency_keys
                 where idempotency_key in (?, ?)
                """, Long.class, first, second);
        assertThat(remaining).isEqualTo(1);
    }

    @Test
    void multipartIncidentRejectsActiveContentMasqueradingAsAPhoto() throws Exception {
        String key = key();
        String title = TITLE_PREFIX + UUID.randomUUID();
        Long hazardId = jdbc.queryForObject("select min(id) from public.hazards", Long.class);
        MockMultipartFile activeContent = new MockMultipartFile(
                "photos", "evidence.html", "text/html", "<script>alert(1)</script>".getBytes());

        MvcResult result = mvc.perform(multipart("/v1/response/incidents")
                        .file(activeContent)
                        .header("X-Local-Roles", "Super Admin")
                        .header("Idempotency-Key", key)
                        .param("title", title)
                        .param("hazard_id", Long.toString(hazardId))
                        .param("location_description", "Controlled upload validation test")
                        .param("reported_at", OffsetDateTime.now().minusMinutes(1).withNano(0).toString())
                        .param("severity_level", "Moderate")
                        .param("status", "Reported"))
                .andReturn();

        assertThat(result.getResponse().getStatus()).isEqualTo(422);
        assertThat(result.getResponse().getContentAsString()).contains("valid JPEG, PNG or GIF");
        assertThat(countIncidents(title)).isZero();
    }

    private MvcResult perform(String key, String body) throws Exception {
        return mvc.perform(post(ENDPOINT)
                        .header("X-Local-Roles", "Super Admin")
                        .header("Idempotency-Key", key)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andReturn();
    }

    private String request(String title) throws Exception {
        Long hazardId = jdbc.queryForObject("select min(id) from public.hazards", Long.class);
        return objectMapper.writeValueAsString(java.util.Map.of(
                "title", title,
                "hazard_id", hazardId,
                "location_description", "Controlled mobile retry integration test",
                "reported_at", OffsetDateTime.now().minusMinutes(1).withNano(0).toString(),
                "severity_level", "Moderate"));
    }

    private String key() {
        String key = "mobile-it-" + UUID.randomUUID();
        keys.add(key);
        return key;
    }

    private long id(MvcResult result) throws Exception {
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsByteArray());
        return body.path("id").asLong();
    }

    private long countIncidents(String title) {
        Long count = jdbc.queryForObject("select count(*) from public.incidents where title = ?", Long.class, title);
        return count == null ? 0 : count;
    }

    private long countReceipts(String key) {
        Long count = jdbc.queryForObject(
                "select count(*) from platform.api_idempotency_keys where idempotency_key = ?", Long.class, key);
        return count == null ? 0 : count;
    }
}
