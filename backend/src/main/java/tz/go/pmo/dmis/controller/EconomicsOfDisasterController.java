package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.EconomicsOfDisasterService;

/** Economics of Disaster — thin eGA controller. Path {@code /v1/finance/economics}. */
@RestController
@RequestMapping("/v1/finance/economics")
@RequiredArgsConstructor
public class EconomicsOfDisasterController {

    private final EconomicsOfDisasterService service;

    @GetMapping
    @PreAuthorize("hasAuthority('budget_and_finance.view')")
    public Map<String, Object> model() {
        return service.model();
    }
}
