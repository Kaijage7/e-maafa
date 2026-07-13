package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.dto.response.EwIndexResponse;
import tz.go.pmo.dmis.service.EwWarningsService;

/**
 * Early Warning → warning registry (read). Thin eGA controller; logic in
 * {@link EwWarningsService}. Shares base {@code /v1/ew/warnings} with lifecycle
 * controller (POST actions only on that controller).
 */
@RestController
@RequestMapping("/v1/ew/warnings")
@RequiredArgsConstructor
@Tag(name = "Early Warning", description = "Existing EW warning registry (read-only index)")
public class EwController {

    private final EwWarningsService service;

    @GetMapping
    @Operation(summary = "Warning registry + statistics for the Early Warning Systems index")
    @PreAuthorize("isAuthenticated()")
    public EwIndexResponse index() {
        return service.index();
    }
}
