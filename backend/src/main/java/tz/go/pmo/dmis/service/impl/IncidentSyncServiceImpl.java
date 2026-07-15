package tz.go.pmo.dmis.service.impl;

import java.sql.Timestamp;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.dto.response.SyncChangesResponse;
import tz.go.pmo.dmis.service.IncidentSyncService;

/** PostgreSQL-backed incident cursor. No in-memory state is authoritative. */
@Service
public class IncidentSyncServiceImpl implements IncidentSyncService {

    private static final int MAX_PAGE_SIZE = 100;

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;
    private final CurrentUserResolver currentUser;
    private final Duration retention;
    private final int cleanupBatchSize;

    public IncidentSyncServiceImpl(
            JdbcTemplate jdbc,
            JurisdictionScope jurisdiction,
            CurrentUserResolver currentUser,
            @Value("${dmis.sync.retention:90d}") Duration retention,
            @Value("${dmis.sync.cleanup-batch-size:10000}") int cleanupBatchSize) {
        if (retention == null || retention.isNegative() || retention.isZero()) {
            throw new IllegalArgumentException("dmis.sync.retention must be greater than zero");
        }
        if (cleanupBatchSize < 1 || cleanupBatchSize > 100_000) {
            throw new IllegalArgumentException("dmis.sync.cleanup-batch-size must be between 1 and 100000");
        }
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
        this.currentUser = currentUser;
        this.retention = retention;
        this.cleanupBatchSize = cleanupBatchSize;
    }

    @Override
    @Transactional(readOnly = true, timeout = 15, isolation = Isolation.REPEATABLE_READ)
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public SyncChangesResponse changes(long afterSequence, int limit, String expectedScopeKey) {
        if (afterSequence < 0) {
            throw new BusinessRuleException("after_sequence must be zero or a positive sync cursor.");
        }
        String activeScopeKey = currentScopeKey();
        if (expectedScopeKey == null || expectedScopeKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "scope_key is required; take a new GraphQL snapshot if it is unavailable.");
        }
        if (!MessageDigest.isEqual(activeScopeKey.getBytes(StandardCharsets.US_ASCII),
                                   expectedScopeKey.trim().getBytes(StandardCharsets.US_ASCII))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Sync authorization or jurisdiction changed; discard the local read cache and take a new GraphQL snapshot.");
        }
        int safeLimit = Math.min(Math.max(limit, 1), MAX_PAGE_SIZE);
        long retentionFloor = jdbc.queryForObject(
                "select last_pruned_sequence from platform.sync_event_retention_state where singleton = true",
                Long.class);
        // A client that has already committed the last pruned event is safe to continue AFTER it.
        if (retentionFloor > 0 && afterSequence < retentionFloor) {
            throw new ResponseStatusException(HttpStatus.GONE,
                    "Sync cursor has expired; discard the local read cache and take a new GraphQL snapshot.");
        }

        Long headValue = jdbc.queryForObject(
                "select last_cursor from platform.domain_sync_head where singleton = true", Long.class);
        long latest = headValue == null ? 0 : headValue;
        if (afterSequence > latest) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Sync cursor is ahead of this server; take a new GraphQL snapshot.");
        }

        StringBuilder scope = new StringBuilder(" where e.required_permission = 'incidents.view'");
        List<Object> scopeParams = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("e", scope, scopeParams);

        String sql = """
                select e.sync_sequence, e.event_type, e.aggregate_type, e.aggregate_id, e.change_type, e.occurred_at
                  from platform.domain_sync_events e
                %s and e.sync_sequence > ? and e.sync_sequence <= ?
                 order by e.sync_sequence asc
                 limit ?
                """.formatted(scope);
        List<Object> params = new ArrayList<>(scopeParams);
        params.add(afterSequence);
        params.add(latest);
        params.add(safeLimit + 1);
        List<Map<String, Object>> rows = jdbc.queryForList(sql, params.toArray());
        boolean hasMore = rows.size() > safeLimit;
        if (hasMore) {
            rows = rows.subList(0, safeLimit);
        }

        List<SyncChangesResponse.Change> items = rows.stream().map(this::toChange).toList();
        long next = hasMore && !items.isEmpty()
                ? Long.parseLong(items.getLast().sequence())
                : Math.max(afterSequence, latest);
        return new SyncChangesResponse(
                items, afterSequence, next, latest, activeScopeKey, hasMore, safeLimit, Instant.now().toString());
    }

    @Override
    @Transactional(readOnly = true, timeout = 10, isolation = Isolation.REPEATABLE_READ)
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public SnapshotState snapshotState() {
        Long value = jdbc.queryForObject(
                "select last_cursor from platform.domain_sync_head where singleton = true", Long.class);
        return new SnapshotState(value == null ? 0 : value, currentScopeKey());
    }

    @Override
    @Scheduled(cron = "${dmis.sync.cleanup-cron:0 29 * * * *}")
    @Transactional(timeout = 30)
    public int pruneExpired() {
        Instant cutoff = Instant.now().minus(retention);
        Integer pruned = jdbc.queryForObject("""
                with doomed as (
                    select sync_sequence
                      from platform.domain_sync_events
                     where occurred_at < ?
                     order by sync_sequence
                     limit ?
                     for update skip locked
                ), deleted as (
                    delete from platform.domain_sync_events e
                     using doomed d
                     where e.sync_sequence = d.sync_sequence
                    returning e.sync_sequence
                ), watermark as (
                    insert into platform.sync_event_retention_state (singleton, last_pruned_sequence, updated_at)
                    select true, max(sync_sequence), now() from deleted having count(*) > 0
                    on conflict (singleton) do update
                        set last_pruned_sequence = greatest(
                                platform.sync_event_retention_state.last_pruned_sequence,
                                excluded.last_pruned_sequence),
                            updated_at = excluded.updated_at
                    returning 1
                )
                select count(*)::integer from deleted
                """, Integer.class, Timestamp.from(cutoff), cleanupBatchSize);
        return pruned == null ? 0 : pruned;
    }

    private SyncChangesResponse.Change toChange(Map<String, Object> row) {
        return new SyncChangesResponse.Change(
                row.get("sync_sequence").toString(),
                row.get("event_type").toString(),
                row.get("aggregate_type").toString(),
                row.get("aggregate_id").toString(),
                row.get("change_type").toString(),
                row.get("occurred_at").toString());
    }

    private String currentScopeKey() {
        Long actor = currentUser.currentUserDbId();
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (actor == null || actor <= 0 || authentication == null || !authentication.isAuthenticated()) {
            throw new AccessDeniedException("A platform user identity is required for synchronization.");
        }
        JurisdictionScope.AreaFilter area = jurisdiction.strictAreaFilter();
        String authorities = authentication.getAuthorities().stream()
                .map(authority -> authority.getAuthority() == null ? "" : authority.getAuthority())
                .sorted()
                .collect(Collectors.joining(","));
        String canonical = actor + "|" + area.scope() + "|" + value(area.regionId()) + "|"
                + value(area.districtId()) + "|" + value(area.councilId()) + "|" + authorities;
        try {
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException unavailable) {
            throw new IllegalStateException("SHA-256 is unavailable", unavailable);
        }
    }

    private static String value(Long value) {
        return value == null ? "-" : value.toString();
    }
}
