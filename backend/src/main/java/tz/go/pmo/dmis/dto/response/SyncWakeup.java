package tz.go.pmo.dmis.dto.response;

/** Business-data-free SSE invalidation; clients recover actual rows through the REST delta cursor. */
public record SyncWakeup(String sequence, String occurredAt) {
}
