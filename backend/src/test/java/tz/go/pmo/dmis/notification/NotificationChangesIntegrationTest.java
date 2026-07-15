package tz.go.pmo.dmis.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tz.go.pmo.dmis.common.security.HermeticPostgresSupport;

/** Real-DB proof that reconnect cursors are ordered, resumable and isolated to the JWT user. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class NotificationChangesIntegrationTest extends HermeticPostgresSupport {

    private static final String ENDPOINT = "/v1/notifications/changes";

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper objectMapper;
    @Autowired private PlatformTransactionManager transactionManager;

    private final List<Long> inserted = new CopyOnWriteArrayList<>();

    @AfterEach
    void cleanNotices() {
        for (Long id : inserted) {
            jdbc.update("delete from public.resource_notifications where id = ?", id);
        }
        inserted.clear();
    }

    @Test
    void catchesUpInAscendingPagesWithoutLeakingAnotherUsersNotice() throws Exception {
        List<Long> users = jdbc.queryForList("select id from public.users order by id limit 2", Long.class);
        assertThat(users).hasSize(2);
        long actor = users.get(0);
        long foreign = users.get(1);
        long after = maxNotificationSequence(actor);

        long first = insert(actor, "sync-first");
        insert(foreign, "foreign-secret");
        long second = insert(actor, "sync-second");
        long third = insert(actor, "sync-third");

        JsonNode pageOne = json(getChanges(actor, after, 2));
        assertThat(ids(pageOne)).containsExactly(first, second);
        assertThat(pageOne.path("has_more").asBoolean()).isTrue();
        long secondSequence = syncSequence(second);
        assertThat(pageOne.path("next_after_sequence").asLong()).isEqualTo(secondSequence);
        assertThat(pageOne.toString()).doesNotContain("foreign-secret");

        JsonNode pageTwo = json(getChanges(actor, secondSequence, 2));
        assertThat(ids(pageTwo)).containsExactly(third);
        assertThat(pageTwo.path("has_more").asBoolean()).isFalse();
        assertThat(pageTwo.path("next_after_sequence").asLong()).isEqualTo(syncSequence(third));
        assertThat(pageTwo.toString()).doesNotContain("foreign-secret");
    }

    @Test
    void rejectsNegativeCursor() throws Exception {
        Long actor = jdbc.queryForObject("select min(id) from public.users", Long.class);
        MvcResult result = getChanges(actor, -1, 20);

        assertThat(result.getResponse().getStatus()).isEqualTo(422);
        assertThat(result.getResponse().getContentAsString()).contains("after_sequence must be zero");
    }

    @Test
    void rejectsCursorAheadOfThisUsersCommittedHead() throws Exception {
        Long actor = jdbc.queryForObject("select min(id) from public.users", Long.class);
        long head = notificationHead(actor);

        MvcResult result = getChanges(actor, head + 1, 20);

        assertThat(result.getResponse().getStatus()).isEqualTo(409);
        assertThat(result.getResponse().getContentAsString()).contains("ahead of this server");
    }

    @Test
    void advancesPastADeletedNotificationGapInsteadOfPollingForever() throws Exception {
        Long actor = jdbc.queryForObject("select min(id) from public.users", Long.class);
        long after = notificationHead(actor);
        long deletedId = insert(actor, "deleted-before-catch-up");
        long deletedSequence = syncSequence(deletedId);
        jdbc.update("delete from public.resource_notifications where id = ?", deletedId);
        inserted.remove(deletedId);

        JsonNode page = json(getChanges(actor, after, 20));

        assertThat(page.path("items")).isEmpty();
        assertThat(page.path("latest_sequence").asLong()).isEqualTo(deletedSequence);
        assertThat(page.path("next_after_sequence").asLong()).isEqualTo(deletedSequence);
        assertThat(page.path("has_more").asBoolean()).isFalse();
    }

    @Test
    void perUserSequenceDoesNotCommitOutOfOrderAcrossConcurrentTransactions() throws Exception {
        Long actor = jdbc.queryForObject("select min(id) from public.users", Long.class);
        long after = maxNotificationSequence(actor);
        CountDownLatch firstInserted = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch secondStarted = new CountDownLatch(1);
        TransactionTemplate transactions = new TransactionTemplate(transactionManager);

        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<Long> delayed = pool.submit(() -> transactions.execute(status -> {
                long id = insert(actor, "delayed-first");
                firstInserted.countDown();
                await(releaseFirst);
                return id;
            }));
            assertThat(firstInserted.await(5, TimeUnit.SECONDS)).isTrue();

            Future<Long> follower = pool.submit(() -> {
                secondStarted.countDown();
                return transactions.execute(status -> insert(actor, "following-second"));
            });
            assertThat(secondStarted.await(5, TimeUnit.SECONDS)).isTrue();
            try {
                follower.get(250, TimeUnit.MILLISECONDS);
                throw new AssertionError("The following insert bypassed the per-user transaction lock");
            } catch (TimeoutException expectedWhileFirstTransactionIsOpen) {
                // Expected: the head-row lock is retained until the first insert commits.
            }

            releaseFirst.countDown();
            long firstId = delayed.get(5, TimeUnit.SECONDS);
            long secondId = follower.get(5, TimeUnit.SECONDS);

            assertThat(syncSequence(firstId)).isLessThan(syncSequence(secondId));
            JsonNode page = json(getChanges(actor, after, 10));
            assertThat(ids(page)).containsSubsequence(firstId, secondId);
        } finally {
            releaseFirst.countDown();
        }
    }

    private MvcResult getChanges(long actor, long after, int limit) throws Exception {
        return mvc.perform(get(ENDPOINT)
                        .header("X-Local-Roles", "Super Admin")
                        .header("X-Local-User-Id", Long.toString(actor))
                        .param("after_sequence", Long.toString(after))
                        .param("limit", Integer.toString(limit)))
                .andReturn();
    }

    private long insert(long userId, String title) {
        Long id = jdbc.queryForObject("""
                insert into public.resource_notifications(
                    user_id, type, title, message, channel, severity, is_read, created_at, updated_at)
                values (?, 'mobile_sync_test', ?, ?, 'database', 'info', false, now(), now())
                returning id
                """, Long.class, userId, title, title + " message");
        inserted.add(id);
        return id;
    }

    private long maxNotificationSequence(long userId) {
        Long value = jdbc.queryForObject(
                "select coalesce(max(sync_sequence), 0) from public.resource_notifications where user_id = ?",
                Long.class, userId);
        return value == null ? 0 : value;
    }

    private long notificationHead(long userId) {
        Long value = jdbc.queryForObject("""
                select coalesce((select last_sequence
                                   from platform.notification_sync_heads
                                  where user_id = ?), 0)
                """, Long.class, userId);
        return value == null ? 0 : value;
    }

    private long syncSequence(long id) {
        Long value = jdbc.queryForObject(
                "select sync_sequence from public.resource_notifications where id = ?", Long.class, id);
        return value == null ? 0 : value;
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while coordinating notification transaction", interrupted);
        }
    }

    private JsonNode json(MvcResult result) throws Exception {
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return objectMapper.readTree(result.getResponse().getContentAsByteArray());
    }

    private static List<Long> ids(JsonNode body) {
        List<Long> values = new ArrayList<>();
        body.path("items").forEach(item -> values.add(item.path("id").asLong()));
        return values;
    }

}
