package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.TasksService;

/**
 * Response → Task management. Thin eGA controller; logic in {@link TasksService}.
 * Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/tasks")
@RequiredArgsConstructor
public class TasksController {

    private final TasksService service;

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false, name = "mine") Boolean mine) {
        return service.index(status, mine);
    }

    @GetMapping("/calendar")
    public Map<String, Object> calendar() {
        return service.calendar();
    }

    @GetMapping("/form-data")
    public Map<String, Object> formData(@RequestParam(required = false) Long incident_id) {
        return service.formData(incident_id);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('tasks.manage')")
    public Map<String, Object> store(@RequestBody Map<String, Object> body) {
        return service.store(body);
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PostMapping("/{id}")
    @PreAuthorize("hasAuthority('tasks.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.update(id, body);
    }

    @PostMapping("/{id}/assign")
    @PreAuthorize("hasAuthority('tasks.manage')")
    public Map<String, Object> assign(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.assign(id, body);
    }

    @PostMapping("/{id}/status")
    @PreAuthorize("hasAuthority('tasks.manage')")
    public Map<String, Object> updateStatus(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.updateStatus(id, body);
    }
}
