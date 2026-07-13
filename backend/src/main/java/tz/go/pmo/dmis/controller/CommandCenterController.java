package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.CommandCenterService;

/**
 * Response → Command Post / Coordination. Thin eGA controller; logic in
 * {@link CommandCenterService}. Paths and JSON unchanged. Coexists on
 * {@code /v1/response/coordination} with {@link ExerciseScenariosController}.
 */
@RestController
@RequestMapping("/v1/response/coordination")
@RequiredArgsConstructor
public class CommandCenterController {

    private final CommandCenterService service;

    @GetMapping
    public Map<String, Object> index() {
        return service.index();
    }

    @PreAuthorize("hasAuthority('command_post.activate')")
    @PostMapping("/activate/{incidentId}")
    public Map<String, Object> activate(@PathVariable long incidentId,
                                        @RequestBody(required = false) Map<String, Object> body) {
        return service.activate(incidentId, body);
    }

    @PreAuthorize("hasAuthority('command_post.activate')")
    @GetMapping("/warnings")
    public Map<String, Object> issuedWarningsForActivation() {
        return service.issuedWarningsForActivation();
    }

    @PreAuthorize("hasAuthority('command_post.activate')")
    @PostMapping("/forecast")
    public Map<String, Object> activateFromForecast(@RequestBody Map<String, Object> body) throws Exception {
        return service.activateFromForecast(body);
    }

    @PreAuthorize("hasAuthority('command_post.posture')")
    @PostMapping("/{id}/posture")
    public Map<String, Object> changePosture(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.changePosture(id, body);
    }

    @PreAuthorize("hasAuthority('command_post.posture')")
    @PostMapping("/{id}/cancel-forecast")
    public Map<String, Object> cancelForecast(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.cancelForecast(id, body);
    }

    @PreAuthorize("hasAuthority('command_post.posture')")
    @PostMapping("/{id}/impact")
    public Map<String, Object> confirmImpact(@PathVariable long id,
                                             @RequestBody(required = false) Map<String, Object> body) {
        return service.confirmImpact(id, body);
    }

    @GetMapping("/{id}/readiness")
    public Map<String, Object> readiness(@PathVariable long id) throws Exception {
        return service.readiness(id);
    }

    @GetMapping("/{id}")
    public Map<String, Object> board(@PathVariable long id) {
        return service.board(id);
    }

    @PostMapping("/{id}/periods")
    @PreAuthorize("hasAuthority('command_post.posture')")
    public Map<String, Object> openPeriod(@PathVariable long id,
                                          @RequestBody(required = false) Map<String, Object> body) {
        return service.openPeriod(id, body);
    }

    @PostMapping("/{id}/periods/{periodId}/close")
    @PreAuthorize("hasAuthority('command_post.posture')")
    public Map<String, Object> closePeriod(@PathVariable long id, @PathVariable long periodId,
                                           @RequestBody(required = false) Map<String, Object> body) {
        return service.closePeriod(id, periodId, body);
    }

    @PostMapping("/{id}/injects")
    @PreAuthorize("hasAuthority('command_post.posture')")
    public Map<String, Object> addInject(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.addInject(id, body);
    }

    @PostMapping("/{id}/injects/{injectId}/fire")
    @PreAuthorize("hasAuthority('command_post.posture')")
    public Map<String, Object> fireInject(@PathVariable long id, @PathVariable long injectId) {
        return service.fireInject(id, injectId);
    }

    @PostMapping("/{id}/injects/{injectId}/resolve")
    @PreAuthorize("hasAuthority('tasks.manage')")
    public Map<String, Object> resolveInject(@PathVariable long id, @PathVariable long injectId,
                                             @RequestBody(required = false) Map<String, Object> body) {
        return service.resolveInject(id, injectId, body);
    }

    @DeleteMapping("/{id}/injects/{injectId}")
    @PreAuthorize("hasAuthority('command_post.posture')")
    public Map<String, Object> deleteInject(@PathVariable long id, @PathVariable long injectId) {
        return service.deleteInject(id, injectId);
    }

    @GetMapping("/{id}/aar")
    public Map<String, Object> aar(@PathVariable long id) {
        return service.aar(id);
    }

    @GetMapping("/{id}/drf/{drfId}")
    public Map<String, Object> drfDetail(@PathVariable long id, @PathVariable long drfId) {
        return service.drfDetail(id, drfId);
    }

    @PreAuthorize("hasAuthority('tasks.manage')")
    @PostMapping("/{id}/drf/{drfId}/assign")
    public Map<String, Object> assignDrf(@PathVariable long id, @PathVariable long drfId,
                                         @RequestBody Map<String, Object> body) {
        return service.assignDrf(id, drfId, body);
    }

    @PreAuthorize("hasAuthority('tasks.manage')")
    @PostMapping("/{id}/drf/{drfId}/task")
    public Map<String, Object> addTask(@PathVariable long id, @PathVariable long drfId,
                                       @RequestBody Map<String, Object> body) {
        return service.addTask(id, drfId, body);
    }

    @PreAuthorize("hasAuthority('tasks.manage')")
    @PostMapping("/{id}/task/{taskId}")
    public Map<String, Object> updateTask(@PathVariable long id, @PathVariable long taskId,
                                          @RequestBody Map<String, Object> body) {
        return service.updateTask(id, taskId, body);
    }

    @PreAuthorize("hasAuthority('tasks.manage')")
    @DeleteMapping("/{id}/task/{taskId}")
    public Map<String, Object> destroyTask(@PathVariable long id, @PathVariable long taskId) {
        return service.destroyTask(id, taskId);
    }

    @PreAuthorize("hasAuthority('command_post.posture')")
    @PostMapping("/{id}/deactivate")
    public Map<String, Object> deactivate(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.deactivate(id, body);
    }

    @PreAuthorize("hasAuthority('tasks.manage')")
    @PostMapping("/{id}/command-roles")
    public Map<String, Object> appointCommandRole(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.appointCommandRole(id, body);
    }

    @PreAuthorize("hasAuthority('tasks.manage')")
    @PostMapping("/command-roles/{roleId}/relieve")
    public Map<String, Object> relieveCommandRole(@PathVariable long roleId,
                                                  @RequestBody(required = false) Map<String, Object> body) {
        return service.relieveCommandRole(roleId, body);
    }
}
