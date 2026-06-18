package tz.go.pmo.dmis.ew;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.HashSet;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads the existing EW warnings (warnings/warning_hazards/hazards/regions/districts) and shapes them
 * for the Early Warning Systems index screen, reproducing EarlyWarningController@index — the warning
 * registry rows plus the four statistics. Read-only; the existing EW system owns the data.
 */
@Service
@RequiredArgsConstructor
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

    @Transactional(readOnly = true)
    public EwIndexResponse index() {
        Map<Long, EwHazard> hazardById = byId(hazards.findAll(), EwHazard::getId);
        Map<Long, EwRegion> regionById = byId(regions.findAll(), EwRegion::getId);
        Map<Long, List<EwWarningHazard>> hazardsByWarning = warningHazards.findByDeletedAtIsNull().stream()
                .collect(Collectors.groupingBy(EwWarningHazard::getWarningId));

        // warning_codes currently shown on the public portal map (early_warnings.show_on_map) — drives the
        // "Add to map / Remove from map" control on the index.
        Set<String> onMapCodes = new HashSet<>(jdbc.queryForList(
                "select distinct warning_code from public.early_warnings where show_on_map = true and status = 'active'",
                String.class));

        List<EwIndexResponse.WarningRow> rows = new ArrayList<>();
        for (EwWarning warning : warnings.findByDeletedAtIsNullOrderByCreatedAtDesc()) {
            List<EwWarningHazard> entries = hazardsByWarning.getOrDefault(warning.getId(), List.of());
            List<EwIndexResponse.HazardRow> hazardRows = entries.stream()
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
        return new EwIndexResponse(rows, stats());
    }

    private EwIndexResponse.Stats stats() {
        List<EwWarning> all = warnings.findByDeletedAtIsNullOrderByCreatedAtDesc();
        LocalDate today = LocalDate.now(ZONE);
        long total = all.size();
        long active = all.stream().filter(w -> "published".equalsIgnoreCase(w.getStatus())).count();
        long pending = all.stream().filter(w -> "pending".equalsIgnoreCase(w.getStatus())).count();
        long approvedToday = all.stream()
                .filter(w -> "approved".equalsIgnoreCase(w.getStatus()))
                .filter(w -> w.getApprovedAt() != null && w.getApprovedAt().atZone(ZONE).toLocalDate().equals(today))
                .count();
        return new EwIndexResponse.Stats(total, active, pending, approvedToday);
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
        return list.stream().collect(Collectors.toMap(id, Function.identity()));
    }
}
