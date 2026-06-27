package tz.go.pmo.dmis.preparedness;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
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

/** API for the Temporary Warehouses screen, over the existing table (read + create). */
@RestController
@RequestMapping("/v1/temporary-warehouses")
@RequiredArgsConstructor
@Tag(name = "Preparedness", description = "Temporary warehouses")
public class TemporaryWarehouseController {

    private final TemporaryWarehouseService service;
    private final AreaGuard areaGuard;
    private final JurisdictionScope jurisdiction;
    private final JdbcTemplate jdbc;

    @GetMapping
    @Operation(summary = "Temporary warehouse registry + statistics + map markers")
    @PreAuthorize("isAuthenticated()")
    public TemporaryWarehouseResponse index() {
        return service.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new temporary warehouse")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> create(@RequestBody TemporaryWarehouseWriteRequest request) {
        // Bind the area to the caller: a region/district officer cannot stamp a temp warehouse onto
        // another area by supplying a foreign region/district name in the body. The national tier may
        // place a temp warehouse anywhere (body kept as-is). The service resolves region/district NAMES
        // to ids, so we override those names with the caller's own area; a district stays within the
        // region the service resolves it against.
        return service.create(bindArea(request));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Temporary warehouse detail (for the edit form)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> detail(@PathVariable long id) {
        // Shared-or-own: a NULL-area (national/shared) temp warehouse stays visible to all; an area
        // officer must not read another region's/district's temp warehouse by id. Out-of-area → 404.
        areaGuard.assertWarehouseVisible("public.temporary_warehouses", id);
        return service.detail(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a temporary warehouse")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody TemporaryWarehouseWriteRequest request) {
        // Same shared-or-own gate as the detail read: an area officer must not mutate another area's
        // temp warehouse (the list is area-scoped but the update was a bare where id=?). Out-of-area → 404.
        areaGuard.assertWarehouseVisible("public.temporary_warehouses", id);
        // And re-bind the area so an in-area officer cannot move the row into another area via the body.
        return service.update(id, bindArea(request));
    }

    /**
     * For a region/district officer, replace the body's region/district NAMES with the caller's own area
     * (resolved from the area ids on the user record), so the area cannot be spoofed from the request.
     * National (and any non-area) tier keeps the body unchanged — it may place a temp warehouse anywhere.
     */
    private TemporaryWarehouseWriteRequest bindArea(TemporaryWarehouseWriteRequest req) {
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        if (tier != JurisdictionScope.Tier.REGION && tier != JurisdictionScope.Tier.DISTRICT) {
            return req;
        }
        Map<String, Object> area = jurisdiction.currentArea();
        if (tier == JurisdictionScope.Tier.DISTRICT) {
            String districtName = nameOf("districts", area.get("district_id"));
            String regionName = nameOf("regions", area.get("region_id"));
            // The service resolves district within the chosen region; pin both to the caller's own area.
            return withArea(req, regionName, districtName);
        }
        // REGION tier: pin the region; keep the body district (the service scopes it within this region,
        // so a cross-region district silently resolves to null).
        return withArea(req, nameOf("regions", area.get("region_id")), req.district());
    }

    private TemporaryWarehouseWriteRequest withArea(TemporaryWarehouseWriteRequest r, String region, String district) {
        return new TemporaryWarehouseWriteRequest(r.name(), r.level(), region, district, r.council(),
                r.locationDescription(), r.contactPersonName(), r.contactPersonPhone(), r.operationalStatus(),
                r.latitude(), r.longitude());
    }

    private String nameOf(String table, Object id) {
        if (id == null) {
            return null;
        }
        List<String> names = jdbc.queryForList(
                "select name from public." + table + " where id = ?", String.class, id);
        return names.isEmpty() ? null : names.get(0);
    }
}
