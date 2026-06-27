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

/** API for the Training Plans screen, over the existing table (read + create). */
@RestController
@RequestMapping("/v1/training-plans")
@RequiredArgsConstructor
@Tag(name = "Preparedness", description = "Training plans")
public class TrainingPlanController {

    private final TrainingPlanService service;

    @GetMapping
    @Operation(summary = "Training plan registry + statistics")
    @PreAuthorize("isAuthenticated()")
    public TrainingPlanResponse index() {
        return service.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new training plan")
    @PreAuthorize("hasAuthority('preparedness.manage')")
    public Map<String, Object> create(@RequestBody TrainingPlanWriteRequest request) {
        return service.create(request);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Training plan detail (for the edit form)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> detail(@PathVariable long id) {
        return service.detail(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a training plan")
    @PreAuthorize("hasAuthority('preparedness.manage')")
    public Map<String, Object> update(@PathVariable long id, @RequestBody TrainingPlanWriteRequest request) {
        return service.update(id, request);
    }

    @PostMapping("/{id}/publish")
    @Operation(summary = "Publish an upcoming training as a public News/Event item")
    @PreAuthorize("hasAuthority('preparedness.manage')")
    public Map<String, Object> publish(@PathVariable long id) {
        return service.publish(id);
    }

    @PostMapping("/{id}/push-priority")
    @Operation(summary = "Push a training to DRR priorities (creates a mitigation measure)")
    @PreAuthorize("hasAuthority('preparedness.manage')")
    public Map<String, Object> pushPriority(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        String priority = body == null ? null : asStr(body.get("priority"));
        return service.pushPriority(id, priority);
    }

    @PostMapping("/{id}/request-support")
    @Operation(summary = "Request stakeholder funding support for an unfunded training")
    @PreAuthorize("hasAuthority('preparedness.manage')")
    public Map<String, Object> requestSupport(@PathVariable long id) {
        return service.requestSupport(id);
    }

    private static String asStr(Object o) {
        return o == null ? null : o.toString();
    }
}
