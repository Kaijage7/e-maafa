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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * System Settings → Location Management. The Tanzania administrative hierarchy
 * (regions → districts → wards) that every operational module geo-references: incidents,
 * damage assessments, anticipatory action plans, declarations, early warnings and the
 * Sendai repository all record a region / district. This screen is the single place those
 * reference units are maintained.
 *
 * <p>Deletes are guarded by the hierarchy: a region with districts (or a district with wards)
 * cannot be removed until its children are — the API says so rather than throwing an FK 500.</p>
 */
@RestController
@RequestMapping("/v1/settings/locations")
@Tag(name = "Settings: Location Management", description = "Regions / districts / wards")
@RequiredArgsConstructor
public class LocationController {

    private static final String CAN_WRITE = Authz.LOCATION_WRITE;

    private final JdbcTemplate jdbc;

    /** Regions with their district + ward counts and population (the registry view). */
    @GetMapping
    @Operation(summary = "Regions with district/ward counts + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        List<Map<String, Object>> regions = jdbc.queryForList(
                "select r.id, r.name, r.code, r.region_code as \"regionCode\", r.population,"
                        + " (select count(*) from public.districts d where d.region_id = r.id) as \"districtCount\","
                        + " (select count(*) from public.councils c where c.region_id = r.id) as \"councilCount\","
                        + " (select count(*) from public.wards w join public.councils c on c.id = w.council_id"
                        + "    where c.region_id = r.id) as \"wardCount\""
                        + " from public.regions r order by r.name");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("regions", regions);
        out.put("stats", jdbc.queryForMap(
                "select (select count(*) from public.regions) as regions,"
                        + " (select count(*) from public.districts) as districts,"
                        + " (select count(*) from public.councils) as councils,"
                        + " (select count(*) from public.wards) as wards"));
        return out;
    }

    /** The districts of one region, each with its ward count (lazy-loaded when a region opens). */
    @GetMapping("/regions/{regionId}/districts")
    @Operation(summary = "Districts of a region (+ ward counts)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> districts(@PathVariable long regionId) {
        return Map.of("districts", jdbc.queryForList(
                "select d.id, d.name, d.code, d.district_code as \"districtCode\", d.population,"
                        + " (select count(*) from public.councils c where c.district_id = d.id) as \"councilCount\","
                        + " (select count(*) from public.wards w where w.district_id = d.id) as \"wardCount\""
                        + " from public.districts d where d.region_id = ? order by d.name", regionId));
    }

    @GetMapping("/districts/{districtId}/wards")
    @Operation(summary = "Wards of a district")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> wards(@PathVariable long districtId) {
        return Map.of("wards", jdbc.queryForList(
                "select id, name, ward_code as \"wardCode\", coalesce(is_active, true) as \"isActive\""
                        + " from public.wards where district_id = ? order by name", districtId));
    }

    // ── regions ──

    @PostMapping("/regions")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> createRegion(@RequestBody Map<String, Object> req) {
        heal("regions");
        Long id = jdbc.queryForObject(
                "insert into public.regions(name, code, region_code, population, created_at, updated_at)"
                        + " values (?,?,?,?,now(),now()) returning id", Long.class,
                req(req, "name"), str(req.get("code")), str(req.get("regionCode")), intOrNull(req.get("population")));
        return Map.of("id", id, "message", "Region added");
    }

    @PutMapping("/regions/{id}")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> updateRegion(@PathVariable long id, @RequestBody Map<String, Object> req) {
        // NB: `code` (the short VARCHAR(10)) is intentionally NOT written here. The form never sends it,
        // so writing `code = ?` previously nulled an authoritative column on every edit (silent data loss).
        must(jdbc.update("update public.regions set name = coalesce(?,name), region_code = ?,"
                + " population = ?, updated_at = now() where id = ?",
                str(req.get("name")), str(req.get("regionCode")),
                intOrNull(req.get("population")), id), "Region not found");
        return Map.of("message", "Region updated");
    }

    @DeleteMapping("/regions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void deleteRegion(@PathVariable long id) {
        Long children = jdbc.queryForObject("select count(*) from public.districts where region_id = ?", Long.class, id);
        if (children != null && children > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This region has " + children + " district(s) — remove them first.");
        }
        jdbc.update("delete from public.regions where id = ?", id);
    }

    // ── districts ──

    @PostMapping("/regions/{regionId}/districts")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> createDistrict(@PathVariable long regionId, @RequestBody Map<String, Object> req) {
        Long exists = jdbc.queryForObject("select count(*) from public.regions where id = ?", Long.class, regionId);
        if (exists == null || exists == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Region not found");
        }
        heal("districts");
        Long id = jdbc.queryForObject(
                "insert into public.districts(region_id, name, code, district_code, population, created_at, updated_at)"
                        + " values (?,?,?,?,?,now(),now()) returning id", Long.class,
                regionId, req(req, "name"), str(req.get("code")), str(req.get("districtCode")), intOrNull(req.get("population")));
        return Map.of("id", id, "message", "District added");
    }

    @PutMapping("/districts/{id}")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> updateDistrict(@PathVariable long id, @RequestBody Map<String, Object> req) {
        // NB: `code` (short VARCHAR(10)) intentionally NOT written — the form never sends it, so the old
        // `code = ?` nulled an authoritative column on every edit (silent data loss).
        must(jdbc.update("update public.districts set name = coalesce(?,name), district_code = ?,"
                + " population = ?, updated_at = now() where id = ?",
                str(req.get("name")), str(req.get("districtCode")),
                intOrNull(req.get("population")), id), "District not found");
        return Map.of("message", "District updated");
    }

    @DeleteMapping("/districts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void deleteDistrict(@PathVariable long id) {
        Long children = jdbc.queryForObject("select count(*) from public.wards where district_id = ?", Long.class, id);
        if (children != null && children > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This district has " + children + " ward(s) — remove them first.");
        }
        jdbc.update("delete from public.districts where id = ?", id);
    }

    // ── wards ──

    @PostMapping("/districts/{districtId}/wards")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> createWard(@PathVariable long districtId, @RequestBody Map<String, Object> req) {
        Long exists = jdbc.queryForObject("select count(*) from public.districts where id = ?", Long.class, districtId);
        if (exists == null || exists == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "District not found");
        }
        heal("wards");
        Long id = jdbc.queryForObject(
                "insert into public.wards(district_id, name, ward_code, is_active, created_at, updated_at)"
                        + " values (?,?,?,true,now(),now()) returning id", Long.class,
                districtId, req(req, "name"), str(req.get("wardCode")));
        return Map.of("id", id, "message", "Ward added");
    }

    @PutMapping("/wards/{id}")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> updateWard(@PathVariable long id, @RequestBody Map<String, Object> req) {
        must(jdbc.update("update public.wards set name = coalesce(?,name), ward_code = ?,"
                + " is_active = coalesce(?, is_active), updated_at = now() where id = ?",
                str(req.get("name")), str(req.get("wardCode")), bool(req.get("isActive")), id), "Ward not found");
        return Map.of("message", "Ward updated");
    }

    @DeleteMapping("/wards/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void deleteWard(@PathVariable long id) {
        jdbc.update("delete from public.wards where id = ?", id);
    }

    // ── helpers ──

    /**
     * Self-heal an id sequence: the legacy seeder inserted reference rows with explicit ids without
     * advancing the sequence, so a fresh insert can collide on the pkey. Advance it to max(id) when
     * the table has rows (an empty table keeps its untouched sequence). Table is a controller
     * constant, never user input.
     */
    private void heal(String table) {
        jdbc.queryForList("select setval(pg_get_serial_sequence('public." + table + "','id'), m)"
                + " from (select max(id) m from public." + table + ") s where m is not null");
    }

    private static void must(int rows, String notFound) {
        if (rows == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, notFound);
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

    private static Boolean bool(Object v) {
        return v == null ? null : Boolean.valueOf(String.valueOf(v));
    }
}
