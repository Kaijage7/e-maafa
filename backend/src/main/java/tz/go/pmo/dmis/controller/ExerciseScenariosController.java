package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.ExerciseScenariosService;

/**
 * Response → Exercise scenarios. Thin eGA controller; logic in {@link ExerciseScenariosService}.
 * Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/coordination/scenarios")
@RequiredArgsConstructor
public class ExerciseScenariosController {

    private final ExerciseScenariosService service;

    @GetMapping
    public Map<String, Object> index() {
        return service.index();
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('command_post.activate')")
    public Map<String, Object> create(@RequestBody Map<String, Object> body) throws Exception {
        return service.create(body);
    }

    @PostMapping("/{id}/launch")
    @PreAuthorize("hasAuthority('command_post.activate')")
    public Map<String, Object> launch(@PathVariable long id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return service.launch(id, body);
    }
}
