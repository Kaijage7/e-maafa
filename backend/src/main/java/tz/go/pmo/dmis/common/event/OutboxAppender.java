package tz.go.pmo.dmis.common.event;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Persists every raised {@link DomainEvent} into the outbox.
 *
 * <p>Spring Data publishes an aggregate's events synchronously while it is being saved, so
 * this listener runs inside the same transaction — the outbox row and the state change commit
 * together (the transactional-outbox guarantee).
 */
@Component
@RequiredArgsConstructor
public class OutboxAppender {

    private final OutboxEventRepository outbox;
    private final ObjectMapper objectMapper;

    @EventListener
    void append(DomainEvent event) {
        String payload;
        try {
            payload = objectMapper.writeValueAsString(event);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Cannot serialise domain event " + event.eventType(), e);
        }
        outbox.save(new OutboxEvent(
                event.eventType(),
                event.aggregateType(),
                event.aggregateId(),
                payload,
                event.occurredAt()));
    }
}
