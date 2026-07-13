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
import tz.go.pmo.dmis.service.RolePermissionService;

/**
 * System Settings → Roles & Permissions. Thin eGA controller; logic in
 * {@link RolePermissionService}. Paths and JSON unchanged.
 */
@RestController
@RequestMapping("/v1/settings/roles")
@Tag(name = "Settings: Roles & Permissions", description = "Roles, the permission catalogue and the matrix")
@RequiredArgsConstructor
public class RolePermissionController {

    private static final String CAN_WRITE = "hasAuthority('roles_and_permissions.manage')";

    private final RolePermissionService service;

    @GetMapping
    @Operation(summary = "Roles + user/permission counts + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        return service.index();
    }

    @GetMapping("/catalogue")
    @Operation(summary = "Permission catalogue grouped by module")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> catalogue() {
        return service.catalogue();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Role + its permission ids")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PostMapping
    @Operation(summary = "Create a role")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> create(@RequestBody Map<String, Object> req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Rename a role / edit its metadata")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.update(id, req);
    }

    @PutMapping("/{id}/permissions")
    @Operation(summary = "Set a role's permissions")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> setPermissions(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.setPermissions(id, req);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a role (not Super Admin, not while held by users)")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }
}
