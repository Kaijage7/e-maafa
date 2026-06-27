package tz.go.pmo.dmis.preparedness;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.AreaLookup;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/** API for the Evacuation Centers screen, over the existing table (read + create). */
@RestController
@RequestMapping("/v1/evacuation-centers")
@Tag(name = "Preparedness", description = "Evacuation centers")
public class EvacuationCenterController {

    private final EvacuationCenterService evacuationCenterService;
    private final JurisdictionScope jurisdiction;
    private final AreaLookup areaLookup;

    public EvacuationCenterController(EvacuationCenterService evacuationCenterService,
                                      JurisdictionScope jurisdiction, AreaLookup areaLookup) {
        this.evacuationCenterService = evacuationCenterService;
        this.jurisdiction = jurisdiction;
        this.areaLookup = areaLookup;
    }

    @GetMapping
    @Operation(summary = "Evacuation center registry + statistics + map markers")
    @PreAuthorize("isAuthenticated()")
    public EvacuationCenterResponse index() {
        // The service reads the whole registry; evacuation_centers stamps area as free TEXT
        // (region/district columns, no region_id/district_id FK). Scope here by resolving each row's
        // region/district name to an id and matching the caller's own area (the by-name equivalent of
        // JurisdictionScope.appendAreaScopeByName). National + non-area roles keep the full view; an
        // area officer sees only their own region/district. Stats are recomputed over the visible rows.
        EvacuationCenterResponse full = evacuationCenterService.index();
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        if (tier != JurisdictionScope.Tier.REGION && tier != JurisdictionScope.Tier.DISTRICT) {
            return full;
        }
        Map<String, Object> area = jurisdiction.currentArea();
        Long myRegionId = asLong(area.get("region_id"));
        Long myDistrictId = asLong(area.get("district_id"));
        List<EvacuationCenterResponse.CenterRow> visible = full.centers().stream()
                .filter(row -> inArea(row, tier, myRegionId, myDistrictId))
                .toList();
        long total = visible.size();
        long active = visible.stream().filter(c -> "Active".equalsIgnoreCase(c.status())).count();
        long totalCapacity = visible.stream()
                .mapToLong(c -> c.capacityPeople() == null ? 0 : c.capacityPeople()).sum();
        long regionsCovered = visible.stream().map(EvacuationCenterResponse.CenterRow::region)
                .filter(Objects::nonNull).distinct().count();
        return new EvacuationCenterResponse(visible,
                new EvacuationCenterResponse.Stats(total, active, totalCapacity, regionsCovered));
    }

    /** True when the row's free-text area resolves to the caller's own region (REGION) or district (DISTRICT). */
    private boolean inArea(EvacuationCenterResponse.CenterRow row, JurisdictionScope.Tier tier,
                           Long myRegionId, Long myDistrictId) {
        Long rowRegionId = areaLookup.regionId(row.region());
        if (tier == JurisdictionScope.Tier.REGION) {
            return myRegionId != null && myRegionId.equals(rowRegionId);
        }
        Long rowDistrictId = areaLookup.districtId(row.district(), rowRegionId);
        return myDistrictId != null && myDistrictId.equals(rowDistrictId);
    }

    private static Long asLong(Object v) {
        return v instanceof Number n ? n.longValue() : null;
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new evacuation center")
    @PreAuthorize("hasAuthority('preparedness.manage')")
    public Map<String, Object> create(@RequestBody EvacuationCenterWriteRequest request) {
        return evacuationCenterService.create(request);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Evacuation center detail (for the edit form)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> detail(@PathVariable long id) {
        return evacuationCenterService.detail(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an evacuation center")
    @PreAuthorize("hasAuthority('preparedness.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody EvacuationCenterWriteRequest request) {
        return evacuationCenterService.update(id, request);
    }
}
