package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import tz.go.pmo.dmis.service.AgencyAdminService;

/**
 * System Settings -> Agencies — partner agency registry CRUD over agencies,
 * reproducing Admin/AgencyController (the EWE institutions + partners directory).
 */
@RestController
@RequestMapping("/v1/settings/agencies")
@RequiredArgsConstructor
@Tag(name = "System Settings", description = "Partner agencies (admin)")
public class AgencyAdminController {

    private final AgencyAdminService service;

    @GetMapping
    @Operation(summary = "Agency registry + stats")
    @PreAuthorize("hasAuthority('user_management.view')")
    public Map<String, Object> index() {
        return service.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register an agency")
    @PreAuthorize("hasAuthority('user_management.manage')")
    public Map<String, Object> create(@RequestBody AgencyAdminService.AgencyWriteRequest req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an agency")
    @PreAuthorize("hasAuthority('user_management.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody AgencyAdminService.AgencyWriteRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Operation(summary = "Delete an agency (blocked if referenced; deactivate instead)")
    @PreAuthorize("hasAuthority('user_management.manage')")
    public void delete(@PathVariable long id) {
        service.delete(id);
    }

}
