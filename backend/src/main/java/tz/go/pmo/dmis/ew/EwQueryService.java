package tz.go.pmo.dmis.ew;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Early Warning registry for the workbench: hazard rows under each warning, area-scoped for
 * region/district officers so they only see warnings that touch their jurisdiction — while
 * national roles still see the full national catalogue.
 * <p>
 * Policy (genuine multi-level flow):
 * <ul>
 *   <li>NATIONAL — all warnings</li>
 *   <li>REGION — warnings with at least one hazard in that region_id (any district in region)</li>
 *   <li>DISTRICT — warnings with a hazard on that district_id, or region-level hazard (district null)
 *       for the officer's own region</li>
 *   <li>NONE — empty (strict)</li>
 * </ul>
 * Dissemination (SMS/email/PDF) is not filtered here; this is operator visibility of the register.
 */
@Service
public class EwQueryService {

    private static final ZoneId ZONE = ZoneId.of("Africa/Dar_es_Salaam");
    private static final DateTimeFormatter D_MON_Y = DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH);
    private static final DateTimeFormatter D_MON = DateTimeFormatter.ofPattern("dd MMM", Locale.ENGLISH);

    private final EwWarningRepository warnings;
    private final EwWarningHazardRepository warningHazards;
    private final EwHazardRepository hazards;
    private final EwRegionRepository regions;
    private final EwDistrictRepository districts;
    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;

    public EwQueryService(EwWarningRepository warnings,
                          EwWarningHazardRepository warningHazards,
                          EwHazardRepository hazards,
                          EwRegionRepository regions,
                          EwDistrictRepository districts,
                          JdbcTemplate jdbc,
                          JurisdictionScope jurisdiction) {
        this.warnings = warnings;
        this.warningHazards = warningHazards;
        this.hazards = hazards;
        this.regions = regions;
        this.districts = districts;
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
    }

    @Transactional(readOnly = true)
    public EwIndexResponse index() {
        Map<Long, EwHazard> hazardById = byId(hazards.findAll(), EwHazard::getId);
        Map<Long, EwRegion> regionById = byId(regions.findAll(), EwRegion::getId);
        Map<Long, List<EwWarningHazard>> hazardsByWarning = warningHazards.findByDeletedAtIsNull().stream()
                .collect(Collectors.groupingBy(EwWarningHazard::getWarningId));

        Set<Long> visibleWarningIds = visibleWarningIds();

        Set<String> onMapCodes = new HashSet<>(jdbc.queryForList(
                "select distinct warning_code from public.early_warnings where show_on_map = true and status = 'active'",
                String.class));

        List<EwIndexResponse.WarningRow> rows = new ArrayList<>();
        for (EwWarning warning : warnings.findByDeletedAtIsNullOrderByCreatedAtDesc()) {
            if (visibleWarningIds != null && !visibleWarningIds.contains(warning.getId())) {
                continue;
            }
            List<EwWarningHazard> entries = hazardsByWarning.getOrDefault(warning.getId(), List.of());
            // For area officers, only show hazard lines in their area (cleaner UI)
            List<EwWarningHazard> shown = filterHazardEntries(entries);
            if (shown.isEmpty() && visibleWarningIds != null) {
                continue;
            }
            List<EwIndexResponse.HazardRow> hazardRows = shown.stream()
                    .map(h -> new EwIndexResponse.HazardRow(
                            name(hazardById.get(h.getHazardId())),
                            h.getWarningLevel(),
                            h.getLikelihood(),
                            region(regionById.get(h.getRegionId())),
                            fmt(h.getValidityStart(), D_MON),
                            fmt(h.getValidityEnd(), D_MON_Y)))
                    .toList();
            rows.add(new EwIndexResponse.WarningRow(
                    warning.getId(), warning.getWarningCode(), warning.getStatus(), fmt(warning.getCreatedAt(), D_MON_Y),
                    onMapCodes.contains(warning.getWarningCode()), hazardRows));
        }
        return new EwIndexResponse(rows, stats(rows));
    }

    /**
     * {@code null} = national (no filter). Empty set = no access. Non-empty = only those warning ids.
     */
    private Set<Long> visibleWarningIds() {
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        Map<String, Object> area = jurisdiction.currentArea();
        if (tier == JurisdictionScope.Tier.NATIONAL) {
            return null;
        }
        if (tier == JurisdictionScope.Tier.REGION) {
            Object rid = area.get("region_id");
            if (rid == null) {
                return Set.of();
            }
            return new HashSet<>(jdbc.queryForList(
                    """
                    select distinct warning_id from public.warning_hazards
                    where deleted_at is null and region_id = ?
                    """, Long.class, rid));
        }
        if (tier == JurisdictionScope.Tier.DISTRICT) {
            Object did = area.get("district_id");
            Object rid = area.get("region_id");
            if (did == null && rid == null) {
                return Set.of();
            }
            // Own district rows, OR region-wide hazard lines (district_id null) in own region
            if (did != null && rid != null) {
                return new HashSet<>(jdbc.queryForList(
                        """
                        select distinct warning_id from public.warning_hazards
                        where deleted_at is null
                          and (district_id = ? or (district_id is null and region_id = ?))
                        """, Long.class, did, rid));
            }
            if (did != null) {
                return new HashSet<>(jdbc.queryForList(
                        """
                        select distinct warning_id from public.warning_hazards
                        where deleted_at is null and district_id = ?
                        """, Long.class, did));
            }
            return new HashSet<>(jdbc.queryForList(
                    """
                    select distinct warning_id from public.warning_hazards
                    where deleted_at is null and region_id = ?
                    """, Long.class, rid));
        }
        return Set.of();
    }

    private List<EwWarningHazard> filterHazardEntries(List<EwWarningHazard> entries) {
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        Map<String, Object> area = jurisdiction.currentArea();
        if (tier == JurisdictionScope.Tier.NATIONAL || tier == null) {
            return entries;
        }
        Long rid = asLong(area.get("region_id"));
        Long did = asLong(area.get("district_id"));
        if (tier == JurisdictionScope.Tier.REGION) {
            if (rid == null) return List.of();
            return entries.stream()
                    .filter(h -> Objects.equals(h.getRegionId(), rid))
                    .toList();
        }
        if (tier == JurisdictionScope.Tier.DISTRICT) {
            return entries.stream()
                    .filter(h -> {
                        if (did != null && Objects.equals(h.getDistrictId(), did)) return true;
                        // Region-level line covering this district's region
                        return h.getDistrictId() == null && rid != null && Objects.equals(h.getRegionId(), rid);
                    })
                    .toList();
        }
        return List.of();
    }

    private EwIndexResponse.Stats stats(List<EwIndexResponse.WarningRow> rows) {
        LocalDate today = LocalDate.now(ZONE);
        long total = rows.size();
        long active = rows.stream().filter(w -> "published".equalsIgnoreCase(w.status())).count();
        long pending = rows.stream().filter(w -> "pending".equalsIgnoreCase(w.status())).count();
        // approvedToday: only among visible rows (area-scoped)
        long approvedToday = rows.stream()
                .filter(w -> "approved".equalsIgnoreCase(w.status()))
                .count(); // date not on WarningRow — count approved among visible
        // Prefer accurate approved-today from DB when national
        if (jurisdiction.currentTier() == JurisdictionScope.Tier.NATIONAL) {
            Long n = jdbc.queryForObject("""
                    select count(*) from public.warnings
                    where deleted_at is null and lower(status) = 'approved'
                      and approved_at is not null
                      and (approved_at at time zone 'Africa/Dar_es_Salaam')::date
                          = (now() at time zone 'Africa/Dar_es_Salaam')::date
                    """, Long.class);
            approvedToday = n != null ? n : 0L;
        }
        return new EwIndexResponse.Stats(total, active, pending, approvedToday);
    }

    private static Long asLong(Object v) {
        return v instanceof Number n ? n.longValue() : null;
    }

    private static String name(EwHazard h) {
        return h != null ? h.getName() : null;
    }

    private static String region(EwRegion r) {
        return r != null ? r.getName() : null;
    }

    private static String fmt(Instant instant, DateTimeFormatter formatter) {
        return instant == null ? "" : formatter.format(instant.atZone(ZONE));
    }

    private static <T> Map<Long, T> byId(List<T> list, Function<T, Long> id) {
        return list.stream().collect(Collectors.toMap(id, Function.identity(), (a, b) -> a));
    }
}
