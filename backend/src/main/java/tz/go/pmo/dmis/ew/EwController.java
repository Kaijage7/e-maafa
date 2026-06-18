package tz.go.pmo.dmis.ew;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Read API for the Early Warning Systems screen, over the existing EW tables (shared Postgres). */
@RestController
@RequestMapping("/v1/ew/warnings")
@RequiredArgsConstructor
@Tag(name = "Early Warning", description = "Existing EW warning registry (read-only)")
public class EwController {

    private final EwQueryService ewQueryService;

    @GetMapping
    @Operation(summary = "Warning registry + statistics for the Early Warning Systems index")
    @PreAuthorize("isAuthenticated()")
    public EwIndexResponse index() {
        return ewQueryService.index();
    }
}
