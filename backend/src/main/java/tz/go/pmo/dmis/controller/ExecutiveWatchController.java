package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.ExecutiveWatchService;

/**
 * Response → Executive Watch. Thin eGA controller; logic in {@link ExecutiveWatchService}.
 * Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/executive")
@RequiredArgsConstructor
public class ExecutiveWatchController {

    private final ExecutiveWatchService service;

    @GetMapping
    public Map<String, Object> watch() {
        return service.watch();
    }
}
