package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
import tz.go.pmo.dmis.service.LocationService;

/**
 * System Settings → Location Management. Thin eGA controller; logic in {@link LocationService}.
 * Paths and JSON unchanged so Angular and all SQL consumers of regions/districts/councils/wards keep working.
 */
@RestController
@RequestMapping("/v1/settings/locations")
@Tag(name = "Settings: Location Management", description = "Regions / districts / councils / wards")
@RequiredArgsConstructor
public class LocationController {

    private static final String CAN_WRITE = "hasAuthority('location_management.manage')";

    private final LocationService service;

    @GetMapping
    @Operation(summary = "Regions with district/ward counts + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        return service.index();
    }

    @GetMapping("/regions/{regionId}/districts")
    @Operation(summary = "Districts of a region (+ ward counts)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> districts(@PathVariable long regionId) {
        return service.districts(regionId);
    }

    @GetMapping("/districts/{districtId}/councils")
    @Operation(summary = "Councils/LGAs of a district (+ ward counts)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> councils(@PathVariable long districtId) {
        return service.councils(districtId);
    }

    @GetMapping("/districts/{districtId}/wards")
    @Operation(summary = "Wards of a district")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> wards(@PathVariable long districtId) {
        return service.wards(districtId);
    }

    @GetMapping("/councils/{councilId}/wards")
    @Operation(summary = "Wards of a council/LGA")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> councilWards(@PathVariable long councilId) {
        return service.councilWards(councilId);
    }

    @PostMapping("/regions")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> createRegion(@RequestBody Map<String, Object> req) {
        return service.createRegion(req);
    }

    @PutMapping("/regions/{id}")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> updateRegion(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.updateRegion(id, req);
    }

    @DeleteMapping("/regions/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void deleteRegion(@PathVariable long id) {
        service.deleteRegion(id);
    }

    @PostMapping("/regions/{regionId}/districts")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> createDistrict(@PathVariable long regionId, @RequestBody Map<String, Object> req) {
        return service.createDistrict(regionId, req);
    }

    @PutMapping("/districts/{id}")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> updateDistrict(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.updateDistrict(id, req);
    }

    @DeleteMapping("/districts/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void deleteDistrict(@PathVariable long id) {
        service.deleteDistrict(id);
    }

    @PostMapping("/districts/{districtId}/councils")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> createCouncil(@PathVariable long districtId, @RequestBody Map<String, Object> req) {
        return service.createCouncil(districtId, req);
    }

    @PutMapping("/councils/{id}")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> updateCouncil(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.updateCouncil(id, req);
    }

    @DeleteMapping("/councils/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void deleteCouncil(@PathVariable long id) {
        service.deleteCouncil(id);
    }

    @PostMapping("/districts/{districtId}/wards")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> createWard(@PathVariable long districtId, @RequestBody Map<String, Object> req) {
        return service.createWard(districtId, req);
    }

    @PostMapping("/councils/{councilId}/wards")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> createCouncilWard(@PathVariable long councilId, @RequestBody Map<String, Object> req) {
        return service.createCouncilWard(councilId, req);
    }

    @PutMapping("/wards/{id}")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> updateWard(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.updateWard(id, req);
    }

    @DeleteMapping("/wards/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void deleteWard(@PathVariable long id) {
        service.deleteWard(id);
    }
}
