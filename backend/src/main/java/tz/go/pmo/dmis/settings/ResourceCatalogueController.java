package tz.go.pmo.dmis.settings;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * System Settings → Resource Management. The relief-resource catalogue (the {@code resources}
 * table) that the whole supply chain draws on — allocations, dispatch, warehouse stock, bids.
 * Editing the catalogue here defines what can be requested and stocked, with per-item unit cost
 * (the figure the Command Post and Sendai analytics use to value a response) and low-stock
 * thresholds (what the warehouse dashboard flags).
 *
 * <p>Reads open to signed-in officers; writes gated to administrators. Items in use cannot be
 * deleted (they are FK'd from live operational rows) — the API explains why instead of 500-ing.</p>
 */
@RestController
@RequestMapping("/v1/settings/resources")
@Tag(name = "Settings: Resource Catalogue", description = "Relief-resource catalogue CRUD")
@RequiredArgsConstructor
public class ResourceCatalogueController {

    private static final String CAN_WRITE = "hasAuthority('resource_catalogue.manage')";

    private final JdbcTemplate jdbc;

    @GetMapping
    @Operation(summary = "Catalogue + categories + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index(@RequestParam(required = false) String category,
                                     @RequestParam(required = false) String search) {
        StringBuilder where = new StringBuilder(" where 1=1");
        java.util.List<Object> args = new java.util.ArrayList<>();
        if (category != null && !category.isBlank()) {
            where.append(" and category = ?");
            args.add(category);
        }
        if (search != null && !search.isBlank()) {
            where.append(" and (name ilike ? or description ilike ?)");
            args.add("%" + search + "%");
            args.add("%" + search + "%");
        }
        List<Map<String, Object>> items = jdbc.queryForList(
                "select id, name, category, description, unit_of_measure as \"unitOfMeasure\","
                        + " specifications, low_stock_threshold as \"lowStockThreshold\", unit_cost as \"unitCost\","
                        + " (select coalesce(sum(quantity),0) from public.inventory_items ii where ii.resource_id = r.id) as \"inStock\""
                        + " from public.resources r" + where + " order by category, name", args.toArray());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("resources", items);
        out.put("categories", jdbc.queryForList(
                "select name from public.resource_categories where active order by sort_order, name", String.class));
        out.put("units", jdbc.queryForList(
                "select code from public.units_of_measure where active order by sort_order, code", String.class));
        out.put("stats", jdbc.queryForMap(
                "select count(*) as total, count(distinct category) as categories,"
                        + " coalesce(sum(unit_cost),0) as \"catalogueValue\" from public.resources"));
        return out;
    }

    @PostMapping
    @Operation(summary = "Add a catalogue item")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> create(@RequestBody Map<String, Object> req) {
        String name = req(req, "name");
        String category = req(req, "category");
        requireCategory(category);
        String unit = str(req.get("unitOfMeasure"));
        requireUnit(unit);
        Long id = jdbc.queryForObject(
                "insert into public.resources(name, category, description, unit_of_measure, specifications,"
                        + " low_stock_threshold, unit_cost, created_at, updated_at)"
                        + " values (?,?,?,?,?,?,?,now(),now()) returning id", Long.class,
                name, category, str(req.get("description")), unit,
                str(req.get("specifications")), intOrNull(req.get("lowStockThreshold")), numOrNull(req.get("unitCost")));
        return Map.of("id", id, "message", "Catalogue item added");
    }

    @PutMapping("/{id}")
    @Operation(summary = "Edit a catalogue item")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> req) {
        String category = str(req.get("category"));
        if (category != null) {
            requireCategory(category);
        }
        requireUnit(str(req.get("unitOfMeasure")));
        int n = jdbc.update(
                "update public.resources set name = coalesce(?,name), category = coalesce(?,category),"
                        + " description = ?, unit_of_measure = ?, specifications = ?,"
                        + " low_stock_threshold = ?, unit_cost = ?, updated_at = now() where id = ?",
                str(req.get("name")), str(req.get("category")), str(req.get("description")),
                str(req.get("unitOfMeasure")), str(req.get("specifications")),
                intOrNull(req.get("lowStockThreshold")), numOrNull(req.get("unitCost")), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Catalogue item not found");
        }
        return Map.of("message", "Catalogue item updated");
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a catalogue item (blocked if it is used by live operational rows)")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void delete(@PathVariable long id) {
        long uses = inUse(id);
        if (uses > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This item is used by " + uses + " operational record(s) (allocations, stock, bids) "
                            + "and cannot be deleted. Edit it instead.");
        }
        jdbc.update("delete from public.resources where id = ?", id);
    }

    /** Count the live rows that depend on this catalogue item across the supply chain. */
    private long inUse(long id) {
        Long n = jdbc.queryForObject(
                "select (select count(*) from public.allocated_resources where resource_id = ?)"
                        + " + (select count(*) from public.inventory_items where resource_id = ?)"
                        + " + (select count(*) from public.stock_movements where resource_id = ?)"
                        + " + (select count(*) from public.agency_resources where resource_id = ?)"
                        + " + (select count(*) from public.stakeholder_resource_bids where resource_id = ?)",
                Long.class, id, id, id, id, id);
        return n == null ? 0 : n;
    }

    /** The category must be a live row in the authoritative {@code resource_categories} vocabulary. */
    private void requireCategory(String category) {
        Integer n = jdbc.queryForObject(
                "select count(*) from public.resource_categories where name = ? and active", Integer.class, category);
        if (n == null || n == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown resource category \"" + category + "\" — choose one from the catalogue list.");
        }
    }

    /** The unit (when supplied) must be a live row in the authoritative {@code units_of_measure} vocabulary. */
    private void requireUnit(String unit) {
        if (unit == null) {
            return;
        }
        Integer n = jdbc.queryForObject(
                "select count(*) from public.units_of_measure where code = ? and active", Integer.class, unit);
        if (n == null || n == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Unknown unit of measure \"" + unit + "\" — choose one from the unit list.");
        }
    }

    private static String req(Map<String, Object> m, String key) {
        String v = str(m.get(key));
        if (v == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " is required");
        }
        return v;
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Integer intOrNull(Object v) {
        try {
            return v == null || String.valueOf(v).isBlank() ? null : (int) Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Double numOrNull(Object v) {
        try {
            return v == null || String.valueOf(v).isBlank() ? null : Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
