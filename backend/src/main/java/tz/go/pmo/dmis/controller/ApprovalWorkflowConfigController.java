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
import tz.go.pmo.dmis.service.ApprovalWorkflowConfigService;

/**
 * System Settings → Approval Workflows. Thin eGA controller; logic in
 * {@link ApprovalWorkflowConfigService}. Paths and JSON unchanged so Angular and
 * {@code ApprovalWorkflowEngine} keep working (engine uses SQL on the same tables).
 */
@RestController
@RequestMapping("/v1/settings/approval-workflows")
@Tag(name = "Settings: Approval Workflows", description = "Configure the V24 approval engine chains")
@RequiredArgsConstructor
public class ApprovalWorkflowConfigController {

    private static final String CAN_WRITE = "hasAuthority('approval_workflows.manage')";

    private final ApprovalWorkflowConfigService service;

    /** All modules, each with its ordered level chain + role catalogue for the admin UI. */
    @GetMapping
    @Operation(summary = "Modules + their approval chains + role catalogue")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        return service.index();
    }

    // NB: there is intentionally NO "create module" endpoint. Approval modules are wired into the engine
    // in code (ApprovalWorkflowEngine is invoked with hardcoded module codes — today only
    // "resource_allocation"), so an admin-created module could never be initialised and would be dead
    // config. This screen configures the chains of the engine-wired modules; adding a new module is a
    // code change (wire the engine + seed it), not a runtime admin action.

    @PostMapping("/{moduleId}/toggle")
    @Operation(summary = "Activate / deactivate a module's chain")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> toggleModule(@PathVariable long moduleId) {
        return service.toggleModule(moduleId);
    }

    /** Append a level to a module's chain (order defaults to next in sequence). */
    @PostMapping("/{moduleId}/levels")
    @Operation(summary = "Add an approval level to a module")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> addLevel(@PathVariable long moduleId, @RequestBody Map<String, Object> req) {
        return service.addLevel(moduleId, req);
    }

    @PutMapping("/levels/{levelId}")
    @Operation(summary = "Edit an approval level (name, role, skip, active, description)")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> updateLevel(@PathVariable long levelId, @RequestBody Map<String, Object> req) {
        return service.updateLevel(levelId, req);
    }

    /** Move a level up/down in its chain by swapping order with its neighbour. */
    @PostMapping("/levels/{levelId}/move")
    @Operation(summary = "Reorder a level within its chain (direction up|down)")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> moveLevel(@PathVariable long levelId, @RequestBody Map<String, Object> req) {
        return service.moveLevel(levelId, req);
    }

    @DeleteMapping("/levels/{levelId}")
    @Operation(summary = "Remove an approval level")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void deleteLevel(@PathVariable long levelId) {
        service.deleteLevel(levelId);
    }
}
