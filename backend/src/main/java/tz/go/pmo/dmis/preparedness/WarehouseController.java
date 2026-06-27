package tz.go.pmo.dmis.preparedness;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/** API for the Warehouses screen, over the existing table (read + create). */
@RestController
@RequestMapping("/v1/warehouses")
@Tag(name = "Preparedness", description = "Warehouses")
public class WarehouseController {

    private final WarehouseService warehouseService;
    private final AreaGuard areaGuard;
    private final JurisdictionScope jurisdiction;
    private final JdbcTemplate jdbc;

    public WarehouseController(WarehouseService warehouseService, AreaGuard areaGuard,
            JurisdictionScope jurisdiction, JdbcTemplate jdbc) {
        this.warehouseService = warehouseService;
        this.areaGuard = areaGuard;
        this.jurisdiction = jurisdiction;
        this.jdbc = jdbc;
    }

    @GetMapping
    @Operation(summary = "Warehouse registry + statistics + map markers")
    @PreAuthorize("isAuthenticated()")
    public WarehouseResponse index() {
        return warehouseService.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new warehouse")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> create(@RequestBody WarehouseWriteRequest request) {
        // Bind the new warehouse to the caller's area: a region/district officer cannot create a
        // warehouse in another area by supplying region/district in the body. The service resolves the
        // area from the free-text region/district names, so we override those names with the caller's own
        // area before delegating; NATIONAL tier keeps the body-supplied area (it may place anywhere).
        return warehouseService.create(bindToCallerArea(request));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Single warehouse (edit form pre-fill)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> show(@PathVariable long id) {
        areaGuard.assertWarehouseVisible("public.warehouses", id);
        return warehouseService.show(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an existing warehouse")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody WarehouseWriteRequest request) {
        areaGuard.assertWarehouseVisible("public.warehouses", id);
        return warehouseService.update(id, bindToCallerArea(request));
    }

    /**
     * For a region/district officer, force the request's region/district names to the caller's own area so
     * the warehouse is stamped with their jurisdiction (the body-supplied area is ignored). NATIONAL and
     * non-area roles keep whatever the body sent. Out-of-area placement is therefore impossible for a
     * sub-national officer regardless of the payload.
     */
    private WarehouseWriteRequest bindToCallerArea(WarehouseWriteRequest req) {
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        if (tier != JurisdictionScope.Tier.REGION && tier != JurisdictionScope.Tier.DISTRICT) {
            return req;
        }
        Map<String, Object> area = jurisdiction.currentArea();
        String regionName = nameOf("regions", area.get("region_id"));
        String districtName = tier == JurisdictionScope.Tier.DISTRICT
                ? nameOf("districts", area.get("district_id"))
                : null;
        // A district officer's region is the parent of their district; resolve it when not set directly.
        if (regionName == null && area.get("district_id") != null) {
            regionName = parentRegionName(area.get("district_id"));
        }
        return new WarehouseWriteRequest(
                req.name(), req.zone(), req.cityOrRegion(), req.locationAddress(), req.storageCapacitySqm(),
                req.contactPersonName(), req.contactPersonPhone(), req.operationalStatus(),
                req.latitude(), req.longitude(), regionName, districtName);
    }

    private String nameOf(String table, Object id) {
        if (id == null) {
            return null;
        }
        List<String> names = jdbc.queryForList("select name from public." + table + " where id = ?",
                String.class, id);
        return names.isEmpty() ? null : names.get(0);
    }

    private String parentRegionName(Object districtId) {
        List<String> names = jdbc.queryForList(
                "select r.name from public.regions r join public.districts d on d.region_id = r.id where d.id = ?",
                String.class, districtId);
        return names.isEmpty() ? null : names.get(0);
    }
}
