package tz.go.pmo.dmis.common.event;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Forwards committed outbox events to in-process consumers and marks them published.
 *
 * <p>Runs on a short fixed delay. It claims a batch of unpublished rows and dispatches each
 * <em>independently</em> (one transaction per event, via {@link OutboxDispatcher}), so a single
 * failing consumer cannot roll back and replay the whole batch. A repeatedly failing event is
 * dead-lettered after {@code MAX_ATTEMPTS} instead of looping forever. When the platform later grows
 * to multiple services, this is the single place that changes to push onto a message broker instead.
 */
@Component
@RequiredArgsConstructor
public class OutboxRelay {

    private static final Logger log = LoggerFactory.getLogger(OutboxRelay.class);
    private static final int MAX_ATTEMPTS = 5;

    private final OutboxEventRepository outbox;
    private final OutboxDispatcher dispatcher;

    @Scheduled(fixedDelayString = "${dmis.outbox.relay-delay-ms:2000}")
    public void relay() {
        List<OutboxEvent> batch = outbox.findTop100ByPublishedAtIsNullOrderByOccurredAtAsc();
        if (batch.isEmpty()) {
            return;
        }
        for (OutboxEvent event : batch) {
            try {
                dispatcher.dispatch(event);
            } catch (Exception e) {
                log.warn("outbox dispatch failed for {} ({}): {}", event.getId(), event.getEventType(), e.getMessage());
                dispatcher.recordFailure(event.getId(), e.getMessage(), MAX_ATTEMPTS);
            }
        }
        log.debug("Relayed {} outbox event(s)", batch.size());
    }
}
