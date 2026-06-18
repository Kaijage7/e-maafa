package tz.go.pmo.dmis.common.event;

import java.time.Instant;
import java.util.UUID;

/**
 * The durable, relayed form of a domain event that cross-module consumers subscribe to.
 *
 * <p>Consumers (notifications, repository read-model, ICP) listen for {@code OutboxEnvelope}
 * — never the raw in-transaction {@link DomainEvent} — so they only ever react to facts that
 * have actually committed. The {@code payload} is the JSON of the original event.
 */
public record OutboxEnvelope(
        String eventType,
        String aggregateType,
        UUID aggregateId,
        String payload,
        Instant occurredAt) {
}
