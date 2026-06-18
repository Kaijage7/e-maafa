package tz.go.pmo.dmis.common.security;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Resolves the canonical Tanzania location NAMES emitted by the shared {@code <dmis-region-district>}
 * picker to their {@code public.regions} / {@code public.districts} ids, so area-stamped tables can store
 * the FK while forms keep sending human names (the established pattern in TemporaryWarehouseService).
 * Case-insensitive; returns null for blank/unknown names so a missing area degrades to "national / shared".
 */
@Component
public class AreaLookup {

    private final JdbcTemplate jdbc;

    public AreaLookup(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Region name → id (case-insensitive); null if blank or unmatched. */
    public Long regionId(String name) {
        return blank(name) ? null : firstId("select id from public.regions where lower(name) = lower(?)", name.trim());
    }

    /** District name → id, scoped to the resolved region when known (district names repeat across regions). */
    public Long districtId(String name, Long regionId) {
        if (blank(name)) {
            return null;
        }
        if (regionId != null) {
            Long scoped = firstId("select id from public.districts where lower(name) = lower(?) and region_id = ?",
                    name.trim(), regionId);
            if (scoped != null) {
                return scoped;
            }
        }
        return firstId("select id from public.districts where lower(name) = lower(?)", name.trim());
    }

    private boolean blank(String v) {
        return v == null || v.isBlank();
    }

    private Long firstId(String sql, Object... args) {
        try {
            List<Long> ids = jdbc.queryForList(sql, Long.class, args);
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception unresolved) {
            return null;
        }
    }
}
