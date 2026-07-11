package tz.go.pmo.dmis.common.sql;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Whitelist helpers for rare dynamic SQL identifiers (table names only).
 * Call sites still pass fixed literals; this blocks accidental injection if a caller ever
 * threads user input into a table fragment. Honest defence-in-depth — not a query builder.
 */
public final class SafeIdentifiers {

    private static final Pattern SIMPLE_IDENT = Pattern.compile("^[a-z][a-z0-9_]*$");

    /** Tables known to appear in "from public." + table id-exists / name lookups. */
    private static final Set<String> GEO_AND_REF = Set.of(
            "regions", "districts", "councils", "wards", "hazards", "agencies",
            "users", "roles", "warehouses", "temporary_warehouses", "evacuation_centers",
            "incidents", "disaster_events", "early_warnings", "warnings", "threats",
            "damage_assessments", "stakeholders", "resources", "institutions",
            "disaster_response_functions", "inventory_items", "allocated_resources",
            "past_disasters", "mitigation_measures", "infrastructure_items",
            "frameworks", "budget_lines", "ndmf_funds", "oh_events",
            "inform_area", "geo_name_aliases", "alerts", "response_activations",
            "public_hazard_reports", "activation_injects", "incident_tasks",
            "warning_hazards", "training_plans", "contingency_plans",
            "anticipatory_action_plans", "me_indicator_catalog"
    );

    private static final Set<String> USER_AREA_COLS = Set.of("region_id", "district_id", "council_id");

    private SafeIdentifiers() {
    }

    /**
     * Returns a safe simple identifier for use only as a table name in public schema.
     * @throws ResponseStatusException 400 if not a simple ident or not on the allow-list
     */
    public static String publicTable(String table) {
        if (table == null || table.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid table reference.");
        }
        String t = table.trim().toLowerCase(Locale.ROOT);
        // Strip accidental schema prefix
        if (t.startsWith("public.")) {
            t = t.substring("public.".length());
        }
        if (!SIMPLE_IDENT.matcher(t).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid table reference.");
        }
        if (!GEO_AND_REF.contains(t)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Table not permitted in dynamic lookup.");
        }
        return t;
    }

    /** Qualify as public.&lt;table&gt; after whitelist. */
    public static String publicQualified(String table) {
        return "public." + publicTable(table);
    }

    /** users area FK column for jurisdiction filters. */
    public static String userAreaColumn(String column) {
        if (column == null || !USER_AREA_COLS.contains(column.trim().toLowerCase(Locale.ROOT))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid area column.");
        }
        return column.trim().toLowerCase(Locale.ROOT);
    }
}
