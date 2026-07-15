package tz.go.pmo.dmis.controller;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.service.IncidentSyncService;
import tz.go.pmo.dmis.sync.SyncSseRelay;

class SyncControllerTest {

    @Test
    void streamUsesTheJwtActorAndDisablesProxyAndHttpBuffering() {
        IncidentSyncService sync = mock(IncidentSyncService.class);
        SyncSseRelay relay = mock(SyncSseRelay.class);
        CurrentUserResolver currentUser = mock(CurrentUserResolver.class);
        SseEmitter emitter = new SseEmitter();
        when(currentUser.currentUserDbId()).thenReturn(41L);
        when(relay.register(41L, 7L)).thenReturn(emitter);

        ResponseEntity<SseEmitter> response = new SyncController(sync, relay, currentUser).stream(7L);

        assertThat(response.getBody()).isSameAs(emitter);
        assertThat(response.getHeaders().getCacheControl()).isEqualTo("no-cache, no-store, no-transform");
        assertThat(response.getHeaders().getFirst("X-Accel-Buffering")).isEqualTo("no");
        assertThat(response.getHeaders().getContentType().toString()).isEqualTo("text/event-stream");
        verify(relay).register(41L, 7L);
    }

    @Test
    void streamNeverFallsBackToASystemActor() {
        IncidentSyncService sync = mock(IncidentSyncService.class);
        SyncSseRelay relay = mock(SyncSseRelay.class);
        CurrentUserResolver currentUser = mock(CurrentUserResolver.class);
        when(currentUser.currentUserDbId()).thenReturn(null);

        assertThatThrownBy(() -> new SyncController(sync, relay, currentUser).stream(0L))
                .isInstanceOf(AccessDeniedException.class);
    }
}
