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
import tz.go.pmo.dmis.service.ReliefDistributionService;

/** Relief distributions. Thin eGA controller. Path {@code /v1/recovery/relief-distributions}. */
@RestController
@RequestMapping("/v1/recovery/relief-distributions")
@RequiredArgsConstructor
public class ReliefDistributionController {

    private final ReliefDistributionService service;

    @GetMapping
    @PreAuthorize("hasAuthority('recovery.view')")
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String search) {
        return service.index(status, search);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('recovery.manage')")
    public Map<String, Object> store(@RequestBody Map<String, Object> body) {
        return service.store(body);
    }

    @PostMapping("/{id}/confirm")
    @PreAuthorize("hasAuthority('recovery.manage')")
    public Map<String, Object> confirm(@PathVariable long id) {
        return service.confirm(id);
    }
}
