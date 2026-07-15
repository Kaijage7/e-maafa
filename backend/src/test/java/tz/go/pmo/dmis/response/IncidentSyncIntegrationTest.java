package tz.go.pmo.dmis.response;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
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
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.HermeticPostgresSupport;
import tz.go.pmo.dmis.dto.response.SyncChangesResponse;
import tz.go.pmo.dmis.service.IncidentSyncService;

/** Real PostgreSQL proof for commit ordering, jurisdiction tombstones, paging and scope invalidation. */
@SpringBootTest
@ActiveProfiles("local")
class IncidentSyncIntegrationTest extends HermeticPostgresSupport {

    private static final String TITLE_PREFIX = "__incident_sync_it__";

    @Autowired private JdbcTemplate jdbc;
    @Autowired private IncidentSyncService sync;
    @Autowired private PlatformTransactionManager transactionManager;

    private final List<Long> incidentIds = new CopyOnWriteArrayList<>();

    @AfterEach
    void cleanControlledRows() {
        SecurityContextHolder.clearContext();
        for (Long id : incidentIds) {
            jdbc.update("delete from public.incident_workflow_histories where incident_id = ?", id);
            jdbc.update("delete from public.incidents where id = ?", id);
            jdbc.update("delete from platform.domain_sync_events "
                    + "where aggregate_type = 'incident' and aggregate_id = ?", id);
        }
        jdbc.update("delete from public.incidents where title like ?", TITLE_PREFIX + "%");
        incidentIds.clear();
    }

    @Test
    void pagesCommittedIncidentChangesWithoutSkipping() {
        UserArea national = nationalUser();
        authenticate(national.id(), "Super Admin");
        IncidentSyncService.SnapshotState start = sync.snapshotState();

        long first = insertIncident(nationalArea(), "page-one");
        long second = insertIncident(nationalArea(), "page-two");
        long third = insertIncident(nationalArea(), "page-three");

        SyncChangesResponse pageOne = sync.changes(start.cursor(), 2, start.scopeKey());
        assertThat(aggregateIds(pageOne)).containsExactly(first, second);
        assertThat(pageOne.hasMore()).isTrue();
        assertThat(pageOne.scopeKey()).isEqualTo(start.scopeKey());

        SyncChangesResponse pageTwo = sync.changes(pageOne.nextAfterSequence(), 2, start.scopeKey());
        assertThat(aggregateIds(pageTwo)).containsExactly(third);
        assertThat(pageTwo.hasMore()).isFalse();
    }

    @Test
    void movingIncidentEmitsOldScopeTombstoneAndNewScopeUpdate() {
        List<UserArea> users = twoDistrictUsers();
        UserArea former = users.get(0);
        UserArea destination = users.get(1);

        authenticate(former.id(), "DAS");
        IncidentSyncService.SnapshotState formerStart = sync.snapshotState();
        long incidentId = insertIncident(former, "scope-move");
        SyncChangesResponse created = sync.changes(formerStart.cursor(), 10, formerStart.scopeKey());
        assertThat(created.items()).extracting(SyncChangesResponse.Change::changeType)
                .containsExactly("created");

        authenticate(destination.id(), "DAS");
        IncidentSyncService.SnapshotState destinationStart = sync.snapshotState();

        jdbc.update("""
                update public.incidents
                   set region_id = ?, district_id = ?, council_id = ?, updated_at = now()
                 where id = ?
                """, destination.regionId(), destination.districtId(), destination.councilId(), incidentId);

        authenticate(former.id(), "DAS");
        SyncChangesResponse formerDelta = sync.changes(
                created.nextAfterSequence(), 10, formerStart.scopeKey());
        assertThat(formerDelta.items()).extracting(SyncChangesResponse.Change::changeType)
                .containsExactly("deleted");

        authenticate(destination.id(), "DAS");
        SyncChangesResponse destinationDelta = sync.changes(
                destinationStart.cursor(), 10, destinationStart.scopeKey());
        assertThat(destinationDelta.items()).extracting(SyncChangesResponse.Change::changeType)
                .containsExactly("updated");
        assertThat(aggregateIds(destinationDelta)).containsExactly(incidentId);
    }

    @Test
    void cursorIsBoundToTheAuthenticatedActorAndScope() {
        List<UserArea> users = twoDistrictUsers();
        authenticate(users.get(0).id(), "DAS");
        IncidentSyncService.SnapshotState firstScope = sync.snapshotState();

        authenticate(users.get(1).id(), "DAS");
        assertThatThrownBy(() -> sync.changes(firstScope.cursor(), 10, firstScope.scopeKey()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value())
                        .isEqualTo(409));
    }

    @Test
    void retentionBoundaryIsResumableButAnOlderCursorMustRebuild() {
        UserArea national = nationalUser();
        authenticate(national.id(), "Super Admin");
        IncidentSyncService.SnapshotState start = sync.snapshotState();
        insertIncident(nationalArea(), "retention-boundary");
        long boundary = sync.snapshotState().cursor();
        Long originalFloor = jdbc.queryForObject(
                "select last_pruned_sequence from platform.sync_event_retention_state where singleton = true",
                Long.class);
        try {
            jdbc.update("update platform.sync_event_retention_state "
                    + "set last_pruned_sequence = ?, updated_at = now() where singleton = true", boundary);

            SyncChangesResponse exactBoundary = sync.changes(boundary, 10, start.scopeKey());
            assertThat(exactBoundary.items()).isEmpty();
            assertThat(exactBoundary.nextAfterSequence()).isEqualTo(boundary);

            assertThatThrownBy(() -> sync.changes(boundary - 1, 10, start.scopeKey()))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value())
                            .isEqualTo(410));
        } finally {
            jdbc.update("update platform.sync_event_retention_state "
                    + "set last_pruned_sequence = ?, updated_at = now() where singleton = true", originalFloor);
        }
    }

    @Test
    void cursorAheadOfTheCommittedServerHeadIsRejected() {
        UserArea national = nationalUser();
        authenticate(national.id(), "Super Admin");
        IncidentSyncService.SnapshotState state = sync.snapshotState();

        assertThatThrownBy(() -> sync.changes(state.cursor() + 1, 10, state.scopeKey()))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value())
                        .isEqualTo(409));
    }

    @Test
    void rolledBackIncidentDoesNotAdvanceTheCommittedCursorOrLeaveAnEvent() {
        UserArea national = nationalUser();
        authenticate(national.id(), "Super Admin");
        long start = sync.snapshotState().cursor();
        TransactionTemplate transactions = new TransactionTemplate(transactionManager);

        Long rolledBackId = transactions.execute(status -> {
            long id = insertIncident(nationalArea(), "rolled-back");
            status.setRollbackOnly();
            return id;
        });

        assertThat(sync.snapshotState().cursor()).isEqualTo(start);
        assertThat(jdbc.queryForObject(
                "select count(*) from public.incidents where id = ?", Long.class, rolledBackId))
                .isZero();
        assertThat(jdbc.queryForObject(
                "select count(*) from platform.domain_sync_events "
                        + "where aggregate_type = 'incident' and aggregate_id = ?",
                Long.class, rolledBackId))
                .isZero();
    }

    @Test
    void foreignScopeGapsAdvanceTheCursorWithoutLeakingTheForeignChange() {
        List<UserArea> users = twoDistrictUsers();
        UserArea viewer = users.get(0);
        UserArea foreign = users.get(1);
        authenticate(viewer.id(), "DAS");
        IncidentSyncService.SnapshotState start = sync.snapshotState();

        long foreignId = insertIncident(foreign, "foreign-gap");
        long visibleId = insertIncident(viewer, "visible-after-gap");

        SyncChangesResponse delta = sync.changes(start.cursor(), 10, start.scopeKey());
        assertThat(aggregateIds(delta)).containsExactly(visibleId).doesNotContain(foreignId);
        assertThat(delta.hasMore()).isFalse();
        assertThat(delta.nextAfterSequence()).isEqualTo(delta.latestSequence());

        SyncChangesResponse caughtUp = sync.changes(
                delta.nextAfterSequence(), 10, start.scopeKey());
        assertThat(caughtUp.items()).isEmpty();
        assertThat(caughtUp.nextAfterSequence()).isEqualTo(delta.latestSequence());
    }

    @Test
    void concurrentTransactionsCannotCommitPastAnEarlierCursor() throws Exception {
        UserArea national = nationalUser();
        authenticate(national.id(), "Super Admin");
        IncidentSyncService.SnapshotState start = sync.snapshotState();
        TransactionTemplate transactions = new TransactionTemplate(transactionManager);
        CountDownLatch firstInserted = new CountDownLatch(1);
        CountDownLatch releaseFirst = new CountDownLatch(1);
        CountDownLatch secondStarted = new CountDownLatch(1);

        try (ExecutorService pool = Executors.newFixedThreadPool(2)) {
            Future<Long> delayed = pool.submit(() -> transactions.execute(status -> {
                long id = insertIncident(nationalArea(), "delayed-first");
                firstInserted.countDown();
                await(releaseFirst);
                return id;
            }));
            assertThat(firstInserted.await(5, TimeUnit.SECONDS)).isTrue();

            Future<Long> follower = pool.submit(() -> {
                secondStarted.countDown();
                return transactions.execute(status -> insertIncident(nationalArea(), "following-second"));
            });
            assertThat(secondStarted.await(5, TimeUnit.SECONDS)).isTrue();
            try {
                follower.get(250, TimeUnit.MILLISECONDS);
                throw new AssertionError("The following incident bypassed the global sync cursor lock");
            } catch (TimeoutException expectedWhileFirstTransactionIsOpen) {
                // Expected: the domain-sync head lock remains held until the first transaction commits.
            }

            releaseFirst.countDown();
            long firstId = delayed.get(5, TimeUnit.SECONDS);
            long secondId = follower.get(5, TimeUnit.SECONDS);

            SyncChangesResponse delta = sync.changes(start.cursor(), 10, start.scopeKey());
            assertThat(aggregateIds(delta)).containsSubsequence(firstId, secondId);
        } finally {
            releaseFirst.countDown();
        }
    }

    private long insertIncident(UserArea area, String suffix) {
        Long id = jdbc.queryForObject("""
                insert into public.incidents(
                    title, location_description, status, severity_level, reported_at,
                    workflow_status, origin_level, region_id, district_id, council_id,
                    created_at, updated_at)
                values (?, 'Controlled sync test', 'Reported', 'Moderate', now(),
                        'draft', 'district', ?, ?, ?, now(), now())
                returning id
                """, Long.class, TITLE_PREFIX + suffix + "-" + UUID.randomUUID(),
                area.regionId(), area.districtId(), area.councilId());
        incidentIds.add(id);
        return id;
    }

    private UserArea nationalArea() {
        return new UserArea(-1, null, null, null);
    }

    private UserArea nationalUser() {
        Map<String, Object> row = jdbc.queryForMap("""
                select id, region_id, district_id, council_id
                  from public.users
                 order by id
                 limit 1
                """);
        return userArea(row);
    }

    private List<UserArea> twoDistrictUsers() {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select distinct on (district_id) id, region_id, district_id, council_id
                  from public.users
                 where district_id is not null
                 order by district_id, (council_id is null), id
                 limit 2
                """);
        assertThat(rows).hasSize(2);
        return rows.stream().map(IncidentSyncIntegrationTest::userArea).toList();
    }

    private static UserArea userArea(Map<String, Object> row) {
        return new UserArea(number(row.get("id")), numberOrNull(row.get("region_id")),
                numberOrNull(row.get("district_id")), numberOrNull(row.get("council_id")));
    }

    private static long number(Object value) {
        return ((Number) value).longValue();
    }

    private static Long numberOrNull(Object value) {
        return value == null ? null : number(value);
    }

    private static List<Long> aggregateIds(SyncChangesResponse response) {
        return response.items().stream().map(item -> Long.parseLong(item.aggregateId())).toList();
    }

    private static void authenticate(long userId, String role) {
        Jwt jwt = Jwt.withTokenValue("sync-test-token")
                .header("alg", "none")
                .subject(Long.toString(userId))
                .issuedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(600))
                .build();
        JwtAuthenticationToken authentication = new JwtAuthenticationToken(jwt, Set.of(
                new SimpleGrantedAuthority("ROLE_" + role),
                new SimpleGrantedAuthority("incidents.view")));
        SecurityContextHolder.getContext().setAuthentication(authentication);
    }

    private static void await(CountDownLatch latch) {
        try {
            latch.await();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while coordinating incident transactions", interrupted);
        }
    }

    private record UserArea(long id, Long regionId, Long districtId, Long councilId) {
    }
}
