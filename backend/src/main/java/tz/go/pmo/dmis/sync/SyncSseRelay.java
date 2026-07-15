package tz.go.pmo.dmis.sync;

import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import reactor.core.publisher.Flux;
import reactor.core.publisher.FluxSink;
import tz.go.pmo.dmis.dto.response.SyncWakeup;

/**
 * Bounded invalidation relay shared by REST/SSE and GraphQL subscriptions. It transports no domain
 * row, and every node polls the shared committed head, so reconnect correctness never depends on
 * this process's memory or on either streaming transport being lossless.
 */
@Component
public class SyncSseRelay {

    private final JdbcTemplate jdbc;
    private final long timeoutMs;
    private final Duration graphQlSubscriptionTimeout;
    private final int maxConnections;
    private final int maxConnectionsPerActor;
    private final AtomicLong connectionIds = new AtomicLong();
    private final AtomicLong observedSequence = new AtomicLong(-1);
    private final AtomicInteger connectionCount = new AtomicInteger();
    private final Map<Long, Client> clients = new ConcurrentHashMap<>();
    private final Map<Long, AtomicInteger> actorCounts = new ConcurrentHashMap<>();

    public SyncSseRelay(
            JdbcTemplate jdbc,
            @Value("${dmis.sync.sse-timeout:10m}") Duration timeout,
            @Value("${dmis.sync.graphql-subscription-timeout:10m}") Duration graphQlSubscriptionTimeout,
            @Value("${dmis.sync.sse-max-connections:5000}") int maxConnections,
            @Value("${dmis.sync.sse-max-connections-per-actor:5}") int maxConnectionsPerActor) {
        if (timeout == null || timeout.isZero() || timeout.isNegative()) {
            throw new IllegalArgumentException("dmis.sync.sse-timeout must be greater than zero");
        }
        if (maxConnections < 1 || maxConnectionsPerActor < 1
                || maxConnectionsPerActor > maxConnections) {
            throw new IllegalArgumentException("Invalid DMIS sync SSE connection limits");
        }
        if (graphQlSubscriptionTimeout == null || graphQlSubscriptionTimeout.isZero()
                || graphQlSubscriptionTimeout.isNegative()) {
            throw new IllegalArgumentException(
                    "dmis.sync.graphql-subscription-timeout must be greater than zero");
        }
        this.jdbc = jdbc;
        this.timeoutMs = timeout.toMillis();
        this.graphQlSubscriptionTimeout = graphQlSubscriptionTimeout;
        this.maxConnections = maxConnections;
        this.maxConnectionsPerActor = maxConnectionsPerActor;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void initialize() {
        observedSequence.set(currentCursor());
    }

    public long currentCursor() {
        Long value = jdbc.queryForObject(
                "select last_cursor from platform.domain_sync_head where singleton = true", Long.class);
        return value == null ? 0 : value;
    }

    public SseEmitter register(long actorUserId, long afterSequence) {
        validate(actorUserId, afterSequence);
        long connectionId = reserve(actorUserId);
        SseClient client = new SseClient(
                connectionId, actorUserId, afterSequence, new SseEmitter(timeoutMs));
        clients.put(connectionId, client);
        client.emitter.onCompletion(() -> remove(client));
        client.emitter.onTimeout(() -> client.closeNormally());
        client.emitter.onError(error -> remove(client));
        try {
            sampleAndSend(client);
        } catch (RuntimeException initialReadFailed) {
            client.fail(initialReadFailed);
            throw initialReadFailed;
        }
        return client.emitter;
    }

    /**
     * Native foreground GraphQL subscription. LATEST overflow is intentional: an item is only a
     * stale-data signal and the newest cursor subsumes every earlier wake-up. Forced completion
     * revalidates the bearer token on the next WebSocket upgrade.
     */
    public Flux<SyncWakeup> subscribe(long actorUserId, long afterSequence) {
        validate(actorUserId, afterSequence);
        return Flux.<SyncWakeup>create(sink -> {
            GraphQlClient client = null;
            try {
                long connectionId = reserve(actorUserId);
                client = new GraphQlClient(connectionId, actorUserId, afterSequence, sink);
                GraphQlClient registered = client;
                clients.put(connectionId, registered);
                sink.onDispose(() -> remove(registered));
                sampleAndSend(registered);
            } catch (RuntimeException initialFailure) {
                if (client != null) {
                    client.fail(initialFailure);
                } else {
                    sink.error(initialFailure);
                }
            }
        }, FluxSink.OverflowStrategy.LATEST).take(graphQlSubscriptionTimeout);
    }

    private void validate(long actorUserId, long afterSequence) {
        if (actorUserId <= 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "A numeric platform user identity is required for live synchronization.");
        }
        if (afterSequence < 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "after_sequence must be zero or a positive sync cursor.");
        }
    }

    private long reserve(long actorUserId) {
        if (connectionCount.incrementAndGet() > maxConnections) {
            connectionCount.decrementAndGet();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Live synchronization capacity is temporarily full; retry with backoff.");
        }
        AtomicInteger actorCount = actorCounts.computeIfAbsent(actorUserId, ignored -> new AtomicInteger());
        if (actorCount.incrementAndGet() > maxConnectionsPerActor) {
            decrementActor(actorUserId, actorCount);
            connectionCount.decrementAndGet();
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many live synchronization connections for this account.");
        }
        return connectionIds.incrementAndGet();
    }

    private void sampleAndSend(Client client) {
        // Register before sampling. A concurrent poll can only produce a safe duplicate, which
        // sendIfAdvanced de-duplicates under the per-client monitor.
        long current = currentCursor();
        if (client.afterSequence() > current) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Live sync cursor is ahead of this server; take a new GraphQL snapshot.");
        }
        client.sendIfAdvanced(current);
    }

    @Scheduled(fixedDelayString = "${dmis.sync.relay-poll-ms:500}")
    public void poll() {
        // Do not create permanent database traffic on nodes with no connected incident viewers.
        if (clients.isEmpty()) return;
        long sequence = currentCursor();
        // A restored database can legitimately have a lower head. Existing clients may also hold
        // the old, higher lineage, so keeping their streams open would suppress every wake-up until
        // the restored database overtook that value. Terminate the content-free stream: reconnect
        // receives 409 for the stale cursor, clears it, and resumes from the restored server head.
        long previous = observedSequence.getAndSet(sequence);
        if (sequence < previous) {
            clients.values().forEach(client -> client.fail(
                    new IllegalStateException("The committed sync cursor moved backwards; reconnect.")));
            return;
        }
        if (sequence <= previous) return;
        clients.values().forEach(client -> client.sendIfAdvanced(sequence));
    }

    @Scheduled(fixedDelayString = "${dmis.sync.sse-heartbeat-ms:15000}")
    public void heartbeat() {
        for (Client client : clients.values()) {
            client.sendHeartbeat();
        }
    }

    @PreDestroy
    public void close() {
        for (Client client : clients.values()) {
            client.closeNormally();
        }
    }

    private void remove(Client client) {
        if (client.closed.compareAndSet(false, true)) {
            clients.remove(client.connectionId, client);
            connectionCount.decrementAndGet();
            AtomicInteger count = actorCounts.get(client.actorUserId);
            if (count != null) decrementActor(client.actorUserId, count);
        }
    }

    private void decrementActor(long actorUserId, AtomicInteger count) {
        if (count.decrementAndGet() <= 0) actorCounts.remove(actorUserId, count);
    }

    private abstract class Client {
        private final long connectionId;
        private final long actorUserId;
        private final AtomicLong lastSequence;
        private final AtomicBoolean closed = new AtomicBoolean();

        private Client(long connectionId, long actorUserId, long afterSequence) {
            this.connectionId = connectionId;
            this.actorUserId = actorUserId;
            this.lastSequence = new AtomicLong(afterSequence);
        }

        private long afterSequence() {
            return lastSequence.get();
        }

        private synchronized void sendIfAdvanced(long sequence) {
            if (closed.get() || sequence <= lastSequence.get()) return;
            try {
                sendWakeup(sequence, new SyncWakeup(Long.toString(sequence), Instant.now().toString()));
                lastSequence.set(sequence);
            } catch (IOException | IllegalStateException sendFailed) {
                remove(this);
                failTransport(sendFailed);
            }
        }

        private void sendHeartbeat() {
            if (closed.get()) return;
            try {
                heartbeatTransport();
            } catch (IOException | IllegalStateException closedTransport) {
                remove(this);
                failTransport(closedTransport);
            }
        }

        final synchronized void fail(Throwable reason) {
            if (closed.get()) return;
            remove(this);
            failTransport(reason);
        }

        final synchronized void closeNormally() {
            if (closed.get()) return;
            remove(this);
            completeTransport();
        }

        protected abstract void sendWakeup(long sequence, SyncWakeup wakeup) throws IOException;

        protected void heartbeatTransport() throws IOException {
            // GraphQL WebSocket keep-alive is handled by Spring's transport.
        }

        protected abstract void failTransport(Throwable reason);

        protected abstract void completeTransport();
    }

    private final class SseClient extends Client {
        private final SseEmitter emitter;

        private SseClient(long connectionId, long actorUserId, long afterSequence, SseEmitter emitter) {
            super(connectionId, actorUserId, afterSequence);
            this.emitter = emitter;
        }

        @Override
        protected void sendWakeup(long sequence, SyncWakeup wakeup) throws IOException {
            emitter.send(SseEmitter.event()
                    .id(Long.toString(sequence))
                    .name("sync")
                    .data(wakeup));
        }

        @Override
        protected void heartbeatTransport() throws IOException {
            emitter.send(SseEmitter.event().comment("keepalive"));
        }

        @Override
        protected void failTransport(Throwable reason) {
            emitter.completeWithError(reason);
        }

        @Override
        protected void completeTransport() {
            emitter.complete();
        }
    }

    private final class GraphQlClient extends Client {
        private final FluxSink<SyncWakeup> sink;

        private GraphQlClient(long connectionId, long actorUserId, long afterSequence,
                              FluxSink<SyncWakeup> sink) {
            super(connectionId, actorUserId, afterSequence);
            this.sink = sink;
        }

        @Override
        protected void sendWakeup(long sequence, SyncWakeup wakeup) {
            if (!sink.isCancelled()) sink.next(wakeup);
        }

        @Override
        protected void failTransport(Throwable reason) {
            if (!sink.isCancelled()) sink.error(reason);
        }

        @Override
        protected void completeTransport() {
            if (!sink.isCancelled()) sink.complete();
        }
    }
}
