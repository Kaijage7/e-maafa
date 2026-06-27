package tz.go.pmo.dmis.common.security;

import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;

/**
 * Area-visibility guards for the <em>by-id read</em> and <em>mutation</em> paths.
 *
 * <p>The list/index path of each registry already appends a {@link JurisdictionScope} predicate, but the
 * by-id fetch behind a {@code show()}/{@code update()}/{@code approve()} typically re-queries with a bare
 * {@code where id = ?} — so an area officer can read or act on a row in another region/district simply by
 * knowing its id (the "scoped list, unscoped detail" leak class). These helpers re-apply the SAME predicate
 * the list uses to the by-id fetch.
 *
 * <p>Out-of-area resolves to {@link ResourceNotFoundException} (404), never 403: an officer must not be able
 * to distinguish "exists in another area" from "does not exist".
 *
 * <p>Additive over {@link JurisdictionScope}: this adds no behaviour to the shared bean — it only reuses its
 * public predicate builders at the call site, so it carries no blast radius for existing scope call sites.
 */
@Component
public class AreaGuard {

    private final JdbcTemplate jdbc;
    private final JurisdictionScope scope;

    public AreaGuard(JdbcTemplate jdbc, JurisdictionScope scope) {
        this.jdbc = jdbc;
        this.scope = scope;
    }

    /**
     * A STAFF-ONLY registry: a donor/partner (stakeholder-linked) account must not reach it. Partners act
     * exclusively through their own portals (resource bidding, support pledges, their own donations/directory),
     * never the staff queues or national analytics. Because a partner login is NONE-tier (no area), the
     * shared-or-own helper would otherwise hand it the full national view — so staff-only endpoints must call
     * this explicitly. 404 (hides the staff endpoint from a partner).
     */
    public void assertNotStakeholder() {
        if (scope.currentStakeholderId() != null) {
            throw new ResourceNotFoundException("Record not found.");
        }
    }

    /**
     * STRICT: a table whose every row carries {@code region_id}/{@code district_id} and must be area-owned
     * (incidents). 404 if the row is outside the caller's area.
     */
    public void assertOwn(String table, long id) {
        if (!exists(table, "x", id, false)) {
            throw new ResourceNotFoundException("Record not found.");
        }
    }

    /**
     * SHARED-OR-OWN: an operational registry where a NULL area means national/shared (warehouses,
     * temporary_warehouses, stakeholders, budgets). Own + shared are visible; national tier sees all.
     */
    public void assertOwnOrShared(String table, long id) {
        if (!visibleOwnOrShared(table, id)) {
            throw new ResourceNotFoundException("Record not found.");
        }
    }

    /** Boolean form of {@link #assertOwnOrShared} for callers that branch instead of throwing. */
    public boolean visibleOwnOrShared(String table, long id) {
        return exists(table, "x", id, true);
    }

    /**
     * By-id / mutation warehouse guard mirroring {@link JurisdictionScope#appendWarehouseScope}: an area
     * officer may read/act on ONLY their own region's warehouse by default (strict); a role granted
     * {@link JurisdictionScope#WAREHOUSE_VIEW_NATIONAL} may also reach national/zonal (NULL-area) stores.
     * 404 if out of scope. Matrix-controlled, not hardcoded.
     */
    public void assertWarehouseVisible(String table, long id) {
        if (SecurityUtils.hasAuthority(JurisdictionScope.WAREHOUSE_VIEW_NATIONAL)) {
            assertOwnOrShared(table, id);
        } else {
            assertOwn(table, id);
        }
    }

    /**
     * STRICT via parent: a child row scoped by its parent's area. {@code childTable} (aliased {@code c})
     * joins {@code parentTable} (aliased {@code p}) on {@code c.<fk> = p.id}, where the parent carries the
     * area columns. 404 if the parent is outside the caller's area or the child does not exist.
     */
    public void assertParentOwn(String childTable, String fk, String parentTable, long childId) {
        guardChild(childTable, fk, parentTable, childId, false);
    }

    /** SHARED-OR-OWN via parent (e.g. an incident-child whose list uses the shared-or-own policy). */
    public void assertParentOwnOrShared(String childTable, String fk, String parentTable, long childId) {
        guardChild(childTable, fk, parentTable, childId, true);
    }

    private boolean exists(String table, String alias, long id, boolean shared) {
        StringBuilder where = new StringBuilder(alias + ".id = ?");
        List<Object> params = new ArrayList<>();
        params.add(id);
        if (shared) {
            scope.appendAreaScopeSharedOrOwn(alias, where, params);
        } else {
            scope.appendAreaScope(alias, where, params);
        }
        return !jdbc.queryForList(
                "select 1 from " + table + " " + alias + " where " + where, params.toArray()).isEmpty();
    }

    private void guardChild(String childTable, String fk, String parentTable, long childId, boolean shared) {
        StringBuilder where = new StringBuilder("c.id = ?");
        List<Object> params = new ArrayList<>();
        params.add(childId);
        if (shared) {
            scope.appendAreaScopeSharedOrOwn("p", where, params);
        } else {
            scope.appendAreaScope("p", where, params);
        }
        String sql = "select 1 from " + childTable + " c join " + parentTable + " p on p.id = c." + fk
                + " where " + where;
        if (jdbc.queryForList(sql, params.toArray()).isEmpty()) {
            throw new ResourceNotFoundException("Record not found.");
        }
    }
}
