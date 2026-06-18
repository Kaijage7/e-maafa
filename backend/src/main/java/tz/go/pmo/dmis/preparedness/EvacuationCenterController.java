package tz.go.pmo.dmis.preparedness;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
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
import tz.go.pmo.dmis.common.security.Authz;

/** API for the Evacuation Centers screen, over the existing table (read + create). */
@RestController
@RequestMapping("/v1/evacuation-centers")
@RequiredArgsConstructor
@Tag(name = "Preparedness", description = "Evacuation centers")
public class EvacuationCenterController {

    private final EvacuationCenterService evacuationCenterService;

    @GetMapping
    @Operation(summary = "Evacuation center registry + statistics + map markers")
    @PreAuthorize("isAuthenticated()")
    public EvacuationCenterResponse index() {
        return evacuationCenterService.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new evacuation center")
    @PreAuthorize(Authz.PREPAREDNESS_MANAGE)
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
    @PreAuthorize(Authz.PREPAREDNESS_MANAGE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody EvacuationCenterWriteRequest request) {
        return evacuationCenterService.update(id, request);
    }
}
