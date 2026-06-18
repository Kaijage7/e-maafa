package tz.go.pmo.dmis.common.event;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Reference consumer of relayed domain events: subscribes to every {@link OutboxEnvelope} the
 * relay forwards and logs it, proving the outbox → relay → consumer path end to end.
 *
 * <p>The real cross-module consumers — the notifications backbone, the repository read-model, the
 * Incident Command Post live view, identity resolution — plug in exactly the same way: an
 * {@code @EventListener(OutboxEnvelope)} that filters on {@link OutboxEnvelope#eventType()} and
 * reacts. Subscribing to the relayed envelope (not the raw in-transaction event) guarantees a
 * consumer only ever sees facts that have actually committed.
 */
@Component
public class DomainEventLogger {

    private static final Logger log = LoggerFactory.getLogger(DomainEventLogger.class);

    @EventListener
    void on(OutboxEnvelope envelope) {
        log.info("event {} [{} {}] occurred at {}",
                envelope.eventType(),
                envelope.aggregateType(),
                envelope.aggregateId(),
                envelope.occurredAt());
    }
}
