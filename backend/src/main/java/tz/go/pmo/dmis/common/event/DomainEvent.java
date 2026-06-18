package tz.go.pmo.dmis.common.event;

import java.time.Instant;
import java.util.UUID;

/**
 * A fact that has happened inside a bounded context.
 *
 * <p>Domain events are raised by aggregates, written to the transactional outbox in the
 * same database transaction as the state change that produced them, and later relayed to
 * interested consumers (the notifications backbone, the repository read-model, the ICP).
 * This is the connective tissue that lets modules react to one another without coupling.
 */
public interface DomainEvent {

    /** Stable, dotted event name, e.g. {@code registry.person.registered}. */
    String eventType();

    /** The aggregate type the event concerns, e.g. {@code Person}. */
    String aggregateType();

    /** The id of the aggregate the event concerns. */
    UUID aggregateId();

    /** When the fact occurred. */
    Instant occurredAt();
}
