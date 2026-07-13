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
import tz.go.pmo.dmis.service.RecoveryProgramService;

/** Recovery programs. Thin eGA controller. Path {@code /v1/recovery/recovery-programs}. */
@RestController
@RequestMapping("/v1/recovery/recovery-programs")
@RequiredArgsConstructor
public class RecoveryProgramController {

    private final RecoveryProgramService service;

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

    @PostMapping("/{id}/status")
    @PreAuthorize("hasAuthority('recovery.manage')")
    public Map<String, Object> setStatus(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.setStatus(id, body);
    }
}
