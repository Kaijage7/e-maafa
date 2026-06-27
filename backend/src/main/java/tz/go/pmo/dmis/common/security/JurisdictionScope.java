package tz.go.pmo.dmis.common.security;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Server-side jurisdiction (area) visibility, shared by every registry that must show a region/district
 * officer only their own area while the national tier sees the whole country.
 *
 * <p>The model mirrors the incident chain ("only the nation sees everywhere"):
 * <ul>
 *   <li>NATIONAL roles (national command + admins) — every area, no predicate added.</li>
 *   <li>REGION roles (RAS / RC / Regional DC) — only rows in the user's own region.</li>
 *   <li>DISTRICT roles (DED / DAS / District DC) — only rows in the user's own district.</li>
 *   <li>Any other role, or an area role with no area assigned — sees nothing ({@code 1=0}), strict.</li>
 * </ul>
 *
 * <p>The local Super-Admin persona (no {@code X-Local-Roles} header) carries the national roles, so it
 * still sees all. Two append flavours are offered: {@link #appendAreaScope} for tables with numeric
 * {@code region_id}/{@code district_id} FK columns, and {@link #appendAreaScopeByName} for legacy tables
 * that store the area as free text (region/district name).
 */
@Component
public class JurisdictionScope {

    /** Roles that see the whole country (national command + admins). */
    public static final Set<String> NATIONAL = Set.of(Authz.SUPER_ADMIN, Authz.ICT_ADMIN, Authz.DIRECTOR,
            Authz.ASST_DIRECTOR, Authz.SECRETARY, Authz.EOCC, Authz.MDA_FOCAL,
            Authz.MINISTER, Authz.PRESIDENT, Authz.NATIONAL_TECHNICAL_COMMITTEE, Authz.NATIONAL_STEERING_COMMITTEE);
    /** Roles scoped to their own region. */
    public static final Set<String> REGION = Set.of(Authz.RAS, Authz.RC, Authz.REG_DC);
    /** Roles scoped to their own district. */
    public static final Set<String> DISTRICT = Set.of(Authz.DED, Authz.DAS, Authz.DIST_DC);

    public enum Tier { NATIONAL, REGION, DISTRICT, NONE }

    /**
     * Tier + area ids for scoping a SHARED registry whose list SELECT is a JPA/repository query rather than
     * a JdbcTemplate StringBuilder (warehouses, temporary warehouses). {@code scope} is one of
     * NATIONAL / REGION / DISTRICT; a non-area role (NONE) collapses to NATIONAL so it keeps the full view.
     * The matching repository {@code @Query} should read: {@code scope='NATIONAL'} → all rows; REGION →
     * {@code region_id = :regionId or region_id is null}; DISTRICT → {@code district_id = :districtId or
     * district_id is null} (NULL = national/shared, always visible).
     */
    public record AreaFilter(String scope, Long regionId, Long districtId) {}

    /** Build the {@link AreaFilter} for the current actor (shared-or-own policy; see {@link #appendAreaScopeSharedOrOwn}). */
    public AreaFilter sharedOrOwnFilter() {
        Tier t = currentTier();
        if (t != Tier.REGION && t != Tier.DISTRICT) {
            return new AreaFilter("NATIONAL", null, null);   // national + non-area roles → full view
        }
        Map<String, Object> area = currentArea();
        Long regionId = asLong(area.get("region_id"));
        Long districtId = asLong(area.get("district_id"));
        return t == Tier.REGION
                ? new AreaFilter("REGION", regionId, null)
                : new AreaFilter("DISTRICT", null, districtId);
    }

    private static Long asLong(Object v) {
        return v instanceof Number n ? n.longValue() : null;
    }

    private final JdbcTemplate jdbc;
    private final CurrentUserResolver currentUser;

    public JurisdictionScope(JdbcTemplate jdbc, CurrentUserResolver currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    /** Which tier the current actor belongs to (NATIONAL wins, then REGION, then DISTRICT, else NONE). */
    public Tier currentTier() {
        return tierFor(currentArea());
    }

    /**
     * Resolve the tier from an ALREADY-FETCHED area map, so the append methods can derive the tier and the
     * area ids from a single {@code users} read instead of two (one for {@link #currentTier()} and one for
     * the predicate). Behaviour is identical to the inline logic {@code currentTier()} used before.
     *
     * <p>National roles are explicitly national (and carry no area id). Every other login is scoped by the
     * AREA ATTRIBUTE on its user record — district_id → DISTRICT, region_id → REGION. This makes the tier
     * AREA-SPECIFIC CONFIG (driven by the user's assigned area), so a new sub-national role (e.g. a District
     * Planning Officer) is scoped to its own district with NO code change here. The role sets remain only as
     * a fallback for a sub-national login that has no area id assigned.
     */
    private Tier tierFor(Map<String, Object> area) {
        Set<String> roles = SecurityUtils.currentUserRoles();
        if (!Collections.disjoint(roles, NATIONAL)) {
            return Tier.NATIONAL;
        }
        if (area.get("district_id") != null) {
            return Tier.DISTRICT;
        }
        if (area.get("region_id") != null) {
            return Tier.REGION;
        }
        if (!Collections.disjoint(roles, DISTRICT)) {
            return Tier.DISTRICT;
        }
        if (!Collections.disjoint(roles, REGION)) {
            return Tier.REGION;
        }
        return Tier.NONE;
    }

    /** The acting user's own area ids ({@code region_id}, {@code district_id}); either may be null. */
    public Map<String, Object> currentArea() {
        try {
            return jdbc.queryForMap("select region_id, district_id from public.users where id = ?",
                    currentUser.actingUserId());
        } catch (EmptyResultDataAccessException noSuchUser) {
            return Map.of();
        }
    }

    /**
     * The agency this login represents ({@code users.agency_id}), or null if it is not an agency-scoped
     * account. Lets an endpoint restrict a login to its own institution — e.g. an EW agency focal acting
     * only on its agency's submissions. Resolved from the real authenticated subject; null (no agency) means
     * no institution restriction (national / admin).
     */
    public Long currentAgencyId() {
        return userLink("agency_id");
    }

    /**
     * The caller's agency as the lowercase code the EW module keys on (tma / mow / gst / moh / moa / nemc …),
     * derived from {@code agencies.acronym}. Null when the login is not agency-scoped (national / admin), so a
     * caller can treat null as "act for any agency". Pairs with {@link #currentAgencyId()} for callers that key
     * on the numeric id instead.
     */
    public String currentAgencyCode() {
        Long uid = currentUser.currentUserDbId();
        if (uid == null) {
            return null;
        }
        List<String> codes = jdbc.queryForList(
                "select lower(a.acronym) from public.users u join public.agencies a on a.id = u.agency_id where u.id = ?",
                String.class, uid);
        return codes.isEmpty() ? null : codes.get(0);
    }

    /** The stakeholder this login represents ({@code users.stakeholder_id}); null if not a partner account. */
    public Long currentStakeholderId() {
        return userLink("stakeholder_id");
    }

    private Long userLink(String column) {
        Long uid = currentUser.currentUserDbId();
        if (uid == null) {
            return null;
        }
        List<Long> ids = jdbc.queryForList("select " + column + " from public.users where id = ?", Long.class, uid);
        return ids.isEmpty() ? null : ids.get(0);
    }

    /**
     * Append a jurisdiction predicate for a table whose rows carry numeric {@code region_id} /
     * {@code district_id} FK columns, qualified by {@code alias} (e.g. {@code "i"} →
     * {@code i.region_id}). National tier adds nothing; region/district tier filters to the user's own
     * area; anyone else gets {@code 1=0}.
     */
    public void appendAreaScope(String alias, StringBuilder where, List<Object> params) {
        String p = alias == null || alias.isBlank() ? "" : alias + ".";
        Map<String, Object> area = currentArea();   // single users-table read; tier + ids both derive from it
        switch (tierFor(area)) {
            case NATIONAL -> { /* all areas */ }
            case REGION -> {
                Object regionId = area.get("region_id");
                if (regionId == null) {
                    where.append(" and 1=0");
                } else {
                    where.append(" and ").append(p).append("region_id = ?");
                    params.add(regionId);
                }
            }
            case DISTRICT -> {
                Object districtId = area.get("district_id");
                if (districtId == null) {
                    where.append(" and 1=0");
                } else {
                    where.append(" and ").append(p).append("district_id = ?");
                    params.add(districtId);
                }
            }
            default -> where.append(" and 1=0");
        }
    }

    /**
     * Append a jurisdiction predicate for a SHARED operational registry (warehouses, stock, stakeholders)
     * where a NULL area means "national / shared / not-yet-assigned". Policy differs from the strict
     * incident view: an area officer sees their own area <em>or</em> shared rows, the national tier sees
     * all, and any non-area role keeps the pre-existing full view (this scoping is an operational
     * convenience for area officers, not a security wall — so it never hides shared/unassigned rows nor
     * breaks roles that were never area-bound). Use {@link #appendAreaScope} instead for strict records
     * (incidents) where every row has an area and non-area roles must see nothing.
     */
    public void appendAreaScopeSharedOrOwn(String alias, StringBuilder where, List<Object> params) {
        String p = alias == null || alias.isBlank() ? "" : alias + ".";
        Map<String, Object> area = currentArea();   // single users-table read; tier + ids both derive from it
        switch (tierFor(area)) {
            case NATIONAL, NONE -> { /* full set — unchanged behaviour for national + non-area roles */ }
            case REGION -> {
                Object regionId = area.get("region_id");
                if (regionId == null) {
                    where.append(" and ").append(p).append("region_id is null");   // area role, no area → only shared
                } else {
                    where.append(" and (").append(p).append("region_id = ? or ").append(p).append("region_id is null)");
                    params.add(regionId);
                }
            }
            case DISTRICT -> {
                Object districtId = area.get("district_id");
                Object regionId = area.get("region_id");
                if (districtId == null) {
                    where.append(" and ").append(p).append("district_id is null");
                } else {
                    // Own district, OR a region-level row (district NULL) belonging to the officer's OWN region,
                    // OR a fully-national row (both NULL). A row carrying another region's region_id with a NULL
                    // district must NOT be treated as "shared" — that mis-shared regional records to all districts.
                    where.append(" and (").append(p).append("district_id = ? or (")
                            .append(p).append("district_id is null and (")
                            .append(p).append("region_id = ? or ").append(p).append("region_id is null)))");
                    params.add(districtId);
                    params.add(regionId);
                }
            }
        }
    }

    /** The matrix permission that widens warehouse visibility from own-region-only to include national/zonal. */
    public static final String WAREHOUSE_VIEW_NATIONAL = "warehouse_and_stock.view_national";

    /**
     * Warehouse visibility scope, matrix-controlled. DEFAULT (no permission): an area officer sees ONLY their
     * own region's warehouses (strict {@link #appendAreaScope}) and the nation sees all — i.e. regions do not
     * see other regions' or the national/zonal shared stores. A role granted {@link #WAREHOUSE_VIEW_NATIONAL}
     * additionally sees the national/zonal stores (region_id IS NULL), via the shared-or-own predicate. This
     * keeps the cross-area warehouse policy in the Roles & Permissions matrix rather than hardcoded in queries.
     */
    public void appendWarehouseScope(String alias, StringBuilder where, List<Object> params) {
        if (SecurityUtils.hasAuthority(WAREHOUSE_VIEW_NATIONAL)) {
            appendAreaScopeSharedOrOwn(alias, where, params);
        } else {
            appendAreaScope(alias, where, params);
        }
    }

    /**
     * Append a jurisdiction predicate for a legacy table that stores the area as free text (the region /
     * district NAME). The user's own region/district name is resolved from the reference tables and
     * matched case-insensitively. Pass the column names already qualified by their alias (e.g.
     * {@code "s.region"}, {@code "s.district"}).
     */
    public void appendAreaScopeByName(String regionCol, String districtCol, StringBuilder where, List<Object> params) {
        switch (currentTier()) {
            case NATIONAL -> { /* all areas */ }
            case REGION -> {
                String regionName = nameOf("regions", currentArea().get("region_id"));
                if (regionName == null) {
                    where.append(" and 1=0");
                } else {
                    where.append(" and lower(").append(regionCol).append(") = lower(?)");
                    params.add(regionName);
                }
            }
            case DISTRICT -> {
                String districtName = nameOf("districts", currentArea().get("district_id"));
                if (districtName == null) {
                    where.append(" and 1=0");
                } else {
                    where.append(" and lower(").append(districtCol).append(") = lower(?)");
                    params.add(districtName);
                }
            }
            default -> where.append(" and 1=0");
        }
    }

    private String nameOf(String table, Object id) {
        if (id == null) {
            return null;
        }
        try {
            return jdbc.queryForObject("select name from public." + table + " where id = ?", String.class, id);
        } catch (EmptyResultDataAccessException unknownArea) {
            return null;
        }
    }
}
