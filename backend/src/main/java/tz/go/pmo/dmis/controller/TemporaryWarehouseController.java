package tz.go.pmo.dmis.controller;

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
import tz.go.pmo.dmis.dto.request.TemporaryWarehouseWriteRequest;
import tz.go.pmo.dmis.dto.response.TemporaryWarehouseResponse;
import tz.go.pmo.dmis.service.TemporaryWarehouseService;

/** API for Temporary Warehouses. Paths unchanged from the legacy package layout. */
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
        return service.create(bindArea(request));
    }

    @GetMapping("/{id}")
    @Operation(summary = "Temporary warehouse detail (for the edit form)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> detail(@PathVariable long id) {
        areaGuard.assertWarehouseVisible("public.temporary_warehouses", id);
        return service.detail(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a temporary warehouse")
    @PreAuthorize("hasAuthority('warehouse_and_stock.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody TemporaryWarehouseWriteRequest request) {
        areaGuard.assertWarehouseVisible("public.temporary_warehouses", id);
        return service.update(id, bindArea(request));
    }

    private TemporaryWarehouseWriteRequest bindArea(TemporaryWarehouseWriteRequest req) {
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        if (tier != JurisdictionScope.Tier.REGION && tier != JurisdictionScope.Tier.DISTRICT) {
            return req;
        }
        Map<String, Object> area = jurisdiction.currentArea();
        if (tier == JurisdictionScope.Tier.DISTRICT) {
            String districtName = nameOf("districts", area.get("district_id"));
            String regionName = nameOf("regions", area.get("region_id"));
            return withArea(req, regionName, districtName);
        }
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
                "select name from " + tz.go.pmo.dmis.common.sql.SafeIdentifiers.publicQualified(table) + " where id = ?", String.class, id);
        return names.isEmpty() ? null : names.get(0);
    }
}
