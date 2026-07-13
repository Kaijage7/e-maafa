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
import tz.go.pmo.dmis.service.StrategicProjectService;

/** Reconstruction / strategic projects. Thin eGA controller. Path {@code /v1/recovery/strategic-projects}. */
@RestController
@RequestMapping("/v1/recovery/strategic-projects")
@RequiredArgsConstructor
public class StrategicProjectController {

    private final StrategicProjectService service;

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String sector,
                                     @RequestParam(required = false) String search) {
        return service.index(status, sector, search);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('recovery.manage')")
    public Map<String, Object> store(@RequestBody Map<String, Object> body) throws Exception {
        return service.store(body);
    }

    @PostMapping("/{id}/status")
    @PreAuthorize("hasAuthority('recovery.manage')")
    public Map<String, Object> setStatus(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.setStatus(id, body);
    }
}
