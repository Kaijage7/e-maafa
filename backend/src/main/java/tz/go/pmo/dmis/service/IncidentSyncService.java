package tz.go.pmo.dmis.service;

import tz.go.pmo.dmis.dto.response.SyncChangesResponse;

/** Durable, jurisdiction-scoped incident convergence API. */
public interface IncidentSyncService {

    record SnapshotState(long cursor, String scopeKey) {
    }

    SyncChangesResponse changes(long afterSequence, int limit, String expectedScopeKey);

    /** Global watermark + current actor scope captured before a GraphQL snapshot begins. */
    SnapshotState snapshotState();

    int pruneExpired();
}
