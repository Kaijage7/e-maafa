package tz.go.pmo.dmis.common.event;

import java.time.Instant;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Dispatches a single outbox event in its own transaction, so one poison event can never roll back a
 * whole relay batch. {@link #dispatch} publishes the envelope (consumers run inside this transaction)
 * and marks the row published atomically; {@link #recordFailure} isolates a failure and dead-letters
 * the row after too many attempts so it stops being replayed forever.
 */
@Component
@RequiredArgsConstructor
public class OutboxDispatcher {

    private final OutboxEventRepository outbox;
    private final ApplicationEventPublisher publisher;

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void dispatch(OutboxEvent event) {
        publisher.publishEvent(new OutboxEnvelope(
                event.getEventType(),
                event.getAggregateType(),
                event.getAggregateId(),
                event.getPayload(),
                event.getOccurredAt()));
        event.markPublished(Instant.now());
        outbox.save(event);
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void recordFailure(UUID eventId, String error, int maxAttempts) {
        outbox.findById(eventId).ifPresent(event -> {
            event.recordFailure(error);
            if (event.getAttempts() >= maxAttempts) {
                // Dead-letter: stop replaying a poison event. The row keeps its error for inspection.
                event.markPublished(Instant.now());
            }
            outbox.save(event);
        });
    }
}
