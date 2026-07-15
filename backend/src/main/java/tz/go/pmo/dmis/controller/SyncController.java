package tz.go.pmo.dmis.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.dto.response.SyncChangesResponse;
import tz.go.pmo.dmis.service.IncidentSyncService;
import tz.go.pmo.dmis.sync.SyncSseRelay;

/** Durable catch-up endpoint for the incident slice exposed through the mobile GraphQL snapshot. */
@RestController
@RequestMapping("/v1/sync")
@RequiredArgsConstructor
public class SyncController {

    private final IncidentSyncService sync;
    private final SyncSseRelay sseRelay;
    private final CurrentUserResolver currentUser;

    @GetMapping("/changes")
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public SyncChangesResponse changes(
            @RequestParam(name = "after_sequence", defaultValue = "0") long afterSequence,
            @RequestParam(name = "scope_key") String scopeKey,
            @RequestParam(defaultValue = "100") int limit) {
        return sync.changes(afterSequence, limit, scopeKey);
    }

    /**
     * Best-effort incident invalidation only. The event contains a committed global cursor, not a
     * domain row; clients always recover through {@link #changes(long, String, int)}.
     */
    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public ResponseEntity<SseEmitter> stream(
            @RequestParam(name = "after_sequence", defaultValue = "0") long afterSequence) {
        Long actorUserId = currentUser.currentUserDbId();
        if (actorUserId == null || actorUserId <= 0) {
            throw new AccessDeniedException("A numeric platform user identity is required for live synchronization.");
        }
        SseEmitter emitter = sseRelay.register(actorUserId, afterSequence);
        return ResponseEntity.ok()
                .header(HttpHeaders.CACHE_CONTROL, "no-cache, no-store, no-transform")
                .header("X-Accel-Buffering", "no")
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .body(emitter);
    }

}
