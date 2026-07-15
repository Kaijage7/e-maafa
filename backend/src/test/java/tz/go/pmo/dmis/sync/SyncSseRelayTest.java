package tz.go.pmo.dmis.sync;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import reactor.core.Disposable;
import tz.go.pmo.dmis.dto.response.SyncWakeup;

class SyncSseRelayTest {

    @Test
    void idleNodeDoesNotPollTheDatabase() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        SyncSseRelay relay = relay(jdbc, 10, 2);

        relay.poll();

        verifyNoInteractions(jdbc);
    }

    @Test
    void rejectsASecondConnectionWhenTheActorLimitIsReached() {
        JdbcTemplate jdbc = cursorJdbc(0L);
        SyncSseRelay relay = relay(jdbc, 2, 1);
        try {
            relay.register(41L, 0L);

            assertThatThrownBy(() -> relay.register(41L, 0L))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(error -> org.assertj.core.api.Assertions.assertThat(
                            ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(429));
        } finally {
            relay.close();
        }
    }

    @Test
    void rejectsConnectionsBeyondThePerNodeLimit() {
        JdbcTemplate jdbc = cursorJdbc(0L);
        SyncSseRelay relay = relay(jdbc, 1, 1);
        try {
            relay.register(41L, 0L);

            assertThatThrownBy(() -> relay.register(42L, 0L))
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(error -> org.assertj.core.api.Assertions.assertThat(
                            ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(503));
        } finally {
            relay.close();
        }
    }

    @Test
    void rejectsUnsafeConnectionConfiguration() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);

        assertThatThrownBy(() -> new SyncSseRelay(
                jdbc, Duration.ZERO, Duration.ofMinutes(1), 10, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SyncSseRelay(
                jdbc, Duration.ofMinutes(1), Duration.ZERO, 10, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new SyncSseRelay(
                jdbc, Duration.ofMinutes(1), Duration.ofMinutes(1), 1, 2))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void rejectsInvalidActorAndCursorBeforeAllocatingAConnection() {
        JdbcTemplate jdbc = cursorJdbc(10L);
        SyncSseRelay relay = relay(jdbc, 10, 2);

        assertThatThrownBy(() -> relay.register(0L, 0L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> org.assertj.core.api.Assertions.assertThat(
                        ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(403));
        assertThatThrownBy(() -> relay.register(41L, -1L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> org.assertj.core.api.Assertions.assertThat(
                        ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(422));

        relay.register(41L, 10L);
        relay.close();
    }

    @Test
    void rejectsCursorAheadOfTheCommittedHeadWithoutLeakingCapacity() {
        JdbcTemplate jdbc = cursorJdbc(10L);
        SyncSseRelay relay = relay(jdbc, 1, 1);

        assertThatThrownBy(() -> relay.register(41L, 11L))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> org.assertj.core.api.Assertions.assertThat(
                        ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(409));

        relay.register(41L, 10L);
        relay.close();
    }

    @Test
    void databaseRestoreDisconnectsTheOldCursorLineageAndReleasesCapacity() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), org.mockito.ArgumentMatchers.eq(Long.class)))
                .thenReturn(100L, 50L, 50L, 50L);
        SyncSseRelay relay = relay(jdbc, 1, 1);
        try {
            relay.initialize();
            relay.register(41L, 0L);

            relay.poll();

            // The restored lineage closed actor 41 instead of suppressing wake-ups behind 100.
            // Capacity must be reusable immediately by a new authorized connection.
            relay.register(42L, 0L);
        } finally {
            relay.close();
        }
    }

    @Test
    void graphQlSubscriptionReceivesTheCurrentHeadAndReleasesSharedCapacityOnCancel() {
        JdbcTemplate jdbc = cursorJdbc(10L);
        SyncSseRelay relay = relay(jdbc, 1, 1);
        List<SyncWakeup> wakeups = new CopyOnWriteArrayList<>();
        try {
            Disposable subscription = relay.subscribe(41L, 7L).subscribe(wakeups::add);

            assertThat(wakeups).extracting(SyncWakeup::sequence).containsExactly("10");
            subscription.dispose();

            // GraphQL and SSE share the same node/actor capacity rather than drifting apart.
            relay.register(42L, 10L);
        } finally {
            relay.close();
        }
    }

    @Test
    void graphQlSubscriptionReceivesCommittedAdvancesFromTheSamePollLoop() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), org.mockito.ArgumentMatchers.eq(Long.class)))
                .thenReturn(10L, 11L);
        SyncSseRelay relay = relay(jdbc, 2, 1);
        List<SyncWakeup> wakeups = new CopyOnWriteArrayList<>();
        try {
            Disposable subscription = relay.subscribe(41L, 10L).subscribe(wakeups::add);

            relay.poll();

            assertThat(wakeups).extracting(SyncWakeup::sequence).containsExactly("11");
            subscription.dispose();
        } finally {
            relay.close();
        }
    }

    @Test
    void graphQlAndSseConnectionsShareThePerActorLimit() {
        JdbcTemplate jdbc = cursorJdbc(0L);
        SyncSseRelay relay = relay(jdbc, 2, 1);
        try {
            relay.register(41L, 0L);

            assertThatThrownBy(() -> relay.subscribe(41L, 0L).blockFirst())
                    .isInstanceOf(ResponseStatusException.class)
                    .satisfies(error -> assertThat(
                            ((ResponseStatusException) error).getStatusCode().value()).isEqualTo(429));
        } finally {
            relay.close();
        }
    }

    private static JdbcTemplate cursorJdbc(long sequence) {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), org.mockito.ArgumentMatchers.eq(Long.class)))
                .thenReturn(sequence);
        return jdbc;
    }

    private static SyncSseRelay relay(JdbcTemplate jdbc, int maxConnections, int perActor) {
        return new SyncSseRelay(
                jdbc, Duration.ofMinutes(10), Duration.ofMinutes(10), maxConnections, perActor);
    }
}
