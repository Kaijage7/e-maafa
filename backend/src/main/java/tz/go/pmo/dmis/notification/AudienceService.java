package tz.go.pmo.dmis.notification;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.common.security.AreaLookup;

/**
 * Resolves a Communication-Center audience selection into deduplicated phone + email recipient lists,
 * pulled live from the groups already in the system: public subscribers (optionally filtered by hazard,
 * e.g. "registered for floods"), partner stakeholders, Early-Warning leaders (government stakeholders),
 * internal users by role (e.g. Directors), or everyone. Manual entry / pasted-from-Excel numbers are
 * handled by the controllers; this service covers the "pick a group" audiences.
 */
@Service
public class AudienceService {

    private static final Logger log = LoggerFactory.getLogger(AudienceService.class);
    /** Field/area leadership roles targeted by area for an EW bulletin: region tier (RAS/Reg DC/RC) and
     *  district tier (DAS/Dist DC/DED) — incl. the executives (RC Regional Commissioner, DED District
     *  Executive Director) added with the jurisdiction-scoping work, so an area's leadership is alerted. */
    private static final List<String> AREA_COORDINATOR_ROLES = List.of("RAS", "Reg DC", "RC", "DAS", "Dist DC", "DED");

    private final JdbcTemplate jdbc;
    /** Shared with the jurisdiction-scoping work: resolves area NAMES → regions/districts FK ids so EW
     *  area-targeting matches the SAME {@code region_id/district_id} columns that govern who-sees-what. */
    private final AreaLookup areaLookup;

    public AudienceService(JdbcTemplate jdbc, AreaLookup areaLookup) {
        this.jdbc = jdbc;
        this.areaLookup = areaLookup;
    }

    public record Audience(List<String> phones, List<String> emails) {}

    /** Resolve one audience selection. {@code hazard} applies to subscribers_by_hazard; {@code role} to role. */
    public Audience resolve(String type, String hazard, String role) {
        Set<String> phones = new LinkedHashSet<>();
        Set<String> emails = new LinkedHashSet<>();
        switch (type == null ? "" : type) {
            case "all_subscribers" -> collect(phones, emails,
                    "select phone_number as phone, email from public.alert_subscriptions where is_active = true");
            case "subscribers_by_hazard" -> {
                if (hazard != null && !hazard.isBlank()) {
                    collect(phones, emails,
                            "select phone_number as phone, email from public.alert_subscriptions "
                                    + "where is_active = true and hazards_of_interest::jsonb @> ?::jsonb",
                            "[\"" + hazard.replace("\"", "") + "\"]");
                }
            }
            case "stakeholders" -> collect(phones, emails,
                    "select phone, email from public.stakeholders where is_active = true "
                    + "union all select contact_person_phone, contact_person_email from public.stakeholders where is_active = true");
            case "ew_leaders" -> collect(phones, emails,
                    "select phone, email from public.stakeholders where is_active = true and lower(type) = 'government' "
                    + "union all select contact_person_phone, contact_person_email from public.stakeholders where is_active = true and lower(type) = 'government'");
            case "all_users" -> collect(phones, emails, "select phone, email from public.users");
            case "role" -> {
                if (role != null && !role.isBlank()) {
                    collect(phones, emails,
                            "select distinct u.phone, u.email from public.users u "
                            + "join public.model_has_roles mhr on mhr.model_id = u.id "
                            + "join public.roles r on r.id = mhr.role_id where r.name = ?", role);
                }
            }
            default -> { /* unknown / 'manual' → nothing from the system; controllers add manual entries */ }
        }
        return new Audience(new ArrayList<>(phones), new ArrayList<>(emails));
    }

    /** Agency-targeted fan-out: internal users linked to the agency UNION the agency registry's own contact
     *  (users.agency_id is sparsely seeded, so both are unioned — mirrors the stakeholders case). Sends through
     *  the same real SMS/email channels as every other audience. */
    public Audience resolve(String type, String hazard, String role, java.util.Collection<Long> agencyIds) {
        if (!"agency".equals(type)) { return resolve(type, hazard, role); }
        Set<String> phones = new LinkedHashSet<>();
        Set<String> emails = new LinkedHashSet<>();
        if (agencyIds != null && !agencyIds.isEmpty()) {
            String in = agencyIds.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(","));
            collect(phones, emails, "select phone, email from public.users where agency_id in (" + in + ")");
            collect(phones, emails, "select contact_person_phone as phone, contact_person_email as email "
                    + "from public.agencies where id in (" + in + ") and is_active = true");
        }
        return new Audience(new ArrayList<>(phones), new ArrayList<>(emails));
    }

    /** Picker: active agencies for the Communication Center agency fan-out. */
    public List<Map<String, Object>> agencies() {
        return jdbc.queryForList("select id, name, acronym from public.agencies where is_active = true order by name");
    }

    /** Parse a request audience's agencyIds (a JSON array of numbers) into Longs (bad entries dropped). */
    public static java.util.List<Long> agencyIdsFrom(Object raw) {
        java.util.List<Long> ids = new java.util.ArrayList<>();
        if (raw instanceof java.util.List<?> l) {
            for (Object o : l) { try { ids.add(Long.parseLong(String.valueOf(o))); } catch (NumberFormatException ignore) {} }
        }
        return ids;
    }

    // ── Area (location) targeting — "people registered in the affected areas" ───────────────────────────
    // The affected-area names are administrative NAMES (districts and their parent regions). Stakeholders are
    // matched on the V94 region_id/district_id FK (resolved from the name via AreaLookup — the SAME columns
    // the jurisdiction-scoping model uses to decide who-sees-what), with the legacy text region/district kept
    // as a fallback for rows whose FK wasn't backfilled. Subscribers stay name-based: alert_subscriptions has
    // no area FK, only location_of_interest (JSON names) / subscriber_location text.

    /** Citizen subscribers + partner stakeholders registered in ANY of the given areas (district/region names). */
    public Audience resolveAreas(Collection<String> areaNames) {
        Set<String> phones = new LinkedHashSet<>();
        Set<String> emails = new LinkedHashSet<>();
        for (String a : normAreas(areaNames)) {
            String lc = a.toLowerCase(Locale.ROOT);
            collect(phones, emails,
                    "select phone_number as phone, email from public.alert_subscriptions "
                            + "where is_active = true and (location_of_interest::jsonb @> ?::jsonb "
                            + "   or lower(coalesce(subscriber_location,'')) like ?)",
                    "[\"" + a.replace("\"", "") + "\"]", "%" + lc + "%");
            // FK ids for this area name (null when the name is a region vs a district, or unknown — a null bind
            // simply never matches, so the text fallback still covers it).
            Long rid = areaLookup.regionId(a);
            Long did = areaLookup.districtId(a, rid);
            collect(phones, emails,
                    "select phone, email from public.stakeholders where is_active = true "
                            + "  and (region_id = ? or district_id = ? or lower(coalesce(region,'')) = ? or lower(coalesce(district,'')) = ?) "
                            + "union all select contact_person_phone, contact_person_email from public.stakeholders "
                            + "  where is_active = true and (region_id = ? or district_id = ? or lower(coalesce(region,'')) = ? or lower(coalesce(district,'')) = ?)",
                    rid, did, lc, lc, rid, did, lc, lc);
        }
        return new Audience(new ArrayList<>(phones), new ArrayList<>(emails));
    }

    /**
     * Area-coordinator users (RAS/Reg DC/DAS/Dist DC) whose region/district matches the affected areas.
     * Requires {@code users.region_id}/{@code district_id} (added by migration) and per-user seeding —
     * until seeded this resolves to an empty set. Defensive: any schema/SQL issue yields empty, never an
     * error that would block dissemination.
     */
    public Audience resolveAreaCoordinators(Collection<String> areaNames) {
        List<Long> ids = coordinatorUserIds(areaNames);
        if (ids.isEmpty()) {
            return new Audience(List.of(), List.of());
        }
        Set<String> phones = new LinkedHashSet<>();
        Set<String> emails = new LinkedHashSet<>();
        String in = ids.stream().map(x -> "?").collect(Collectors.joining(","));
        collect(phones, emails,
                "select phone, email from public.users where id in (" + in + ")", ids.toArray());
        return new Audience(new ArrayList<>(phones), new ArrayList<>(emails));
    }

    /**
     * User ids of the area coordinators — matched directly on the {@code users.region_id/district_id} FK
     * (the SAME columns {@code JurisdictionScope.currentArea()} reads), resolving the affected area NAMES to
     * ids via {@link AreaLookup}. Empty when unseeded; never throws (degrades to no coordinators).
     */
    public List<Long> coordinatorUserIds(Collection<String> areaNames) {
        List<String> areas = normAreas(areaNames);
        if (areas.isEmpty()) {
            return List.of();
        }
        Set<Long> regionIds = new LinkedHashSet<>();
        Set<Long> districtIds = new LinkedHashSet<>();
        for (String a : areas) {
            Long rid = areaLookup.regionId(a);
            if (rid != null) { regionIds.add(rid); }
            Long did = areaLookup.districtId(a, rid);
            if (did != null) { districtIds.add(did); }
        }
        if (regionIds.isEmpty() && districtIds.isEmpty()) {
            return List.of();
        }
        String roleIn = AREA_COORDINATOR_ROLES.stream().map(r -> "?").collect(Collectors.joining(","));
        List<Object> args = new ArrayList<>(AREA_COORDINATOR_ROLES);
        StringBuilder area = new StringBuilder();
        if (!regionIds.isEmpty()) {
            area.append("u.region_id in (").append(regionIds.stream().map(x -> "?").collect(Collectors.joining(","))).append(")");
            args.addAll(regionIds);
        }
        if (!districtIds.isEmpty()) {
            if (area.length() > 0) { area.append(" or "); }
            area.append("u.district_id in (").append(districtIds.stream().map(x -> "?").collect(Collectors.joining(","))).append(")");
            args.addAll(districtIds);
        }
        try {
            return jdbc.queryForList(
                    "select distinct u.id from public.users u "
                            + "join public.model_has_roles mhr on mhr.model_id = u.id "
                            + "join public.roles r on r.id = mhr.role_id "
                            + "where r.name in (" + roleIn + ") and (" + area + ")",
                    Long.class, args.toArray());
        } catch (Exception e) {
            // users.region_id/district_id absent (migration not applied) — coordinators unreachable by area
            // until the columns exist and are seeded. Never block the dissemination.
            log.debug("area-coordinator resolution skipped: {}", e.getMessage());
            return List.of();
        }
    }

    /** Trim, drop blanks, de-duplicate the area names (case-insensitively, keeping first spelling). */
    private static List<String> normAreas(Collection<String> areaNames) {
        if (areaNames == null) {
            return List.of();
        }
        Set<String> seen = new LinkedHashSet<>();
        List<String> out = new ArrayList<>();
        for (String a : areaNames) {
            if (a == null) { continue; }
            String t = a.trim();
            if (t.isEmpty()) { continue; }
            if (seen.add(t.toLowerCase(Locale.ROOT))) { out.add(t); }
        }
        return out;
    }

    /** The fixed group audiences with live SMS/email reachable counts, for the compose-form picker. */
    public List<Map<String, Object>> audiences() {
        List<Map<String, Object>> out = new ArrayList<>();
        out.add(summary("all_subscribers", "All public subscribers", resolve("all_subscribers", null, null)));
        out.add(summary("stakeholders", "Stakeholders / partners", resolve("stakeholders", null, null)));
        out.add(summary("ew_leaders", "Early Warning leaders (Govt)", resolve("ew_leaders", null, null)));
        out.add(summary("all_users", "All system users", resolve("all_users", null, null)));
        return out;
    }

    /** Distinct hazards subscribers registered for, with subscriber counts (for the "by hazard" sub-picker). */
    public List<Map<String, Object>> hazards() {
        return jdbc.queryForList(
                "select hazard, count(*) as count from ("
                + "  select jsonb_array_elements_text(hazards_of_interest::jsonb) as hazard "
                + "  from public.alert_subscriptions where is_active = true"
                + ") t group by hazard order by count desc");
    }

    /** Roles with a reachable user count (for the "by role" sub-picker, e.g. Directors). */
    public List<Map<String, Object>> roles() {
        return jdbc.queryForList(
                "select r.name as role, count(distinct u.id) as users, "
                + "count(distinct nullif(trim(u.phone), '')) as phones "
                + "from public.roles r "
                + "join public.model_has_roles mhr on mhr.role_id = r.id "
                + "join public.users u on u.id = mhr.model_id "
                + "group by r.name order by users desc");
    }

    private Map<String, Object> summary(String key, String label, Audience a) {
        return Map.of("key", key, "label", label, "sms", a.phones().size(), "email", a.emails().size());
    }

    private void collect(Set<String> phones, Set<String> emails, String sql, Object... args) {
        for (Map<String, Object> row : jdbc.queryForList(sql, args)) {
            addIf(phones, row.get("phone"));
            addIf(emails, row.get("email"));
        }
    }

    private static void addIf(Set<String> set, Object v) {
        if (v == null) {
            return;
        }
        String s = String.valueOf(v).trim();
        if (!s.isBlank()) {
            set.add(s);
        }
    }
}
