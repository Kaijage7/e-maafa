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

/** API for the Alert Subscriptions screen, over the existing table (read + create). */
@RestController
@RequestMapping("/v1/alert-subscriptions")
@RequiredArgsConstructor
@Tag(name = "Preparedness", description = "Alert subscriptions")
public class AlertSubscriptionController {

    private final AlertSubscriptionService service;

    @GetMapping
    @Operation(summary = "Alert subscription registry + statistics")
    @PreAuthorize("isAuthenticated()")
    public AlertSubscriptionResponse index() {
        return service.index();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a new alert subscriber")
    @PreAuthorize(Authz.PREPAREDNESS_MANAGE)
    public Map<String, Object> create(@RequestBody AlertSubscriptionWriteRequest request) {
        return service.create(request);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Alert subscriber detail (for the edit form)")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> detail(@PathVariable long id) {
        return service.detail(id);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update an alert subscriber")
    @PreAuthorize(Authz.PREPAREDNESS_MANAGE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody AlertSubscriptionWriteRequest request) {
        return service.update(id, request);
    }
}
