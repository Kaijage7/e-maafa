package tz.go.pmo.dmis.common.domain;

import jakarta.persistence.MappedSuperclass;
import jakarta.persistence.Transient;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import org.springframework.data.domain.AfterDomainEventPublication;
import org.springframework.data.domain.DomainEvents;
import tz.go.pmo.dmis.common.event.DomainEvent;

/**
 * Base class for aggregate roots — the entities that own a consistency boundary and may
 * raise {@link DomainEvent}s.
 *
 * <p>Events registered via {@link #registerEvent(DomainEvent)} are published by Spring
 * Data the moment the aggregate is saved (inside the surrounding transaction), where the
 * outbox appender persists them atomically with the state change.
 */
@MappedSuperclass
public abstract class AggregateRoot extends BaseEntity {

    @Transient
    private final transient List<DomainEvent> domainEvents = new ArrayList<>();

    protected void registerEvent(DomainEvent event) {
        domainEvents.add(event);
    }

    @DomainEvents
    Collection<DomainEvent> domainEvents() {
        return List.copyOf(domainEvents);
    }

    @AfterDomainEventPublication
    void clearDomainEvents() {
        domainEvents.clear();
    }
}
