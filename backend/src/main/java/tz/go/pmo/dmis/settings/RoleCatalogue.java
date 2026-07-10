package tz.go.pmo.dmis.settings;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;

/** Shared role vocabulary for Settings screens that need grouped, area-aware role choices. */
final class RoleCatalogue {

    private RoleCatalogue() {
    }

    private static final String ROLE_DETAIL_COLUMNS = """
            r.id,
            r.name,
            r.description,
            coalesce(r.category, 'Other') as category,
            coalesce(r.scope_level, 'system') as "scopeLevel",
            coalesce(r.sort_order, 500) as "sortOrder",
            r.incident_stage as "incidentStage",
            r.assignment_hint as "assignmentHint",
            coalesce(r.is_incident_flow, false) as "isIncidentFlow",
            coalesce(r.is_area_scoped, false) as "isAreaScoped"
            """;

    static List<Map<String, Object>> roleDetails(JdbcTemplate jdbc) {
        return jdbc.queryForList("select " + ROLE_DETAIL_COLUMNS
                + " from public.roles r order by coalesce(r.sort_order, 500), r.name");
    }

    static Map<String, Object> roleDetail(JdbcTemplate jdbc, long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select " + ROLE_DETAIL_COLUMNS
                + " from public.roles r where r.id = ?", id);
        if (rows.isEmpty()) {
            return Map.of();
        }
        return new LinkedHashMap<>(rows.get(0));
    }

    static List<String> names(List<Map<String, Object>> roleDetails) {
        return roleDetails.stream().map(r -> String.valueOf(r.get("name"))).toList();
    }

    static List<Map<String, Object>> groups(List<Map<String, Object>> roleDetails) {
        Map<String, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        for (Map<String, Object> role : roleDetails) {
            grouped.computeIfAbsent(String.valueOf(role.get("category")), k -> new ArrayList<>()).add(role);
        }
        List<Map<String, Object>> out = new ArrayList<>();
        grouped.forEach((category, roles) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("category", category);
            row.put("count", roles.size());
            row.put("roles", roles);
            out.add(row);
        });
        return out;
    }
}
