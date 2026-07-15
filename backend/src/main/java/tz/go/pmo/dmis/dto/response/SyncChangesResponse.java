package tz.go.pmo.dmis.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.util.List;

/** Typed REST cursor page used by offline-first mobile/web clients. */
public record SyncChangesResponse(
        List<Change> items,
        @JsonProperty("after_sequence") long afterSequence,
        @JsonProperty("next_after_sequence") long nextAfterSequence,
        @JsonProperty("latest_sequence") long latestSequence,
        @JsonProperty("scope_key") String scopeKey,
        @JsonProperty("has_more") boolean hasMore,
        int limit,
        @JsonProperty("server_time") String serverTime) {

    public record Change(
            String sequence,
            @JsonProperty("event_type") String eventType,
            @JsonProperty("aggregate_type") String aggregateType,
            @JsonProperty("aggregate_id") String aggregateId,
            @JsonProperty("change_type") String changeType,
            @JsonProperty("occurred_at") String occurredAt) {
    }
}
