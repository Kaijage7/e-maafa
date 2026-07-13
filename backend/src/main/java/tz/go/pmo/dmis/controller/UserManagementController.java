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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.UserManagementService;

/**
 * System Settings → User Management. Thin eGA controller; logic in {@link UserManagementService}.
 * Paths and JSON unchanged.
 */
@RestController
@RequestMapping("/v1/settings/users")
@Tag(name = "Settings: User Management", description = "Users + role assignment")
@RequiredArgsConstructor
public class UserManagementController {

    private static final String CAN_WRITE = "hasAuthority('user_management.manage')";

    private final UserManagementService service;

    @GetMapping
    @Operation(summary = "Users with their roles + the role catalogue + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index(@RequestParam(required = false) String search,
                                     @RequestParam(required = false) String role,
                                     @RequestParam(required = false) String roleCategory,
                                     @RequestParam(required = false) String scopeLevel,
                                     @RequestParam(required = false) Long regionId,
                                     @RequestParam(required = false) Long districtId,
                                     @RequestParam(required = false) Long councilId,
                                     @RequestParam(required = false) Boolean seeded,
                                     @RequestParam(required = false) String accountGroup) {
        return service.index(search, role, roleCategory, scopeLevel, regionId, districtId, councilId, seeded, accountGroup);
    }

    @PostMapping
    @Operation(summary = "Create a user (BCrypt password) + assign roles")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> create(@RequestBody Map<String, Object> req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Edit a user's name / email / area attachment")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.update(id, req);
    }

    @PutMapping("/{id}/roles")
    @Operation(summary = "Replace a user's roles")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> setUserRoles(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.setUserRoles(id, req);
    }

    @PostMapping("/{id}/password")
    @Operation(summary = "Reset a user's password")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> resetPassword(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.resetPassword(id, req);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a user (cannot remove the last Super Admin)")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }
}
