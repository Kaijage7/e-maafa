package tz.go.pmo.dmis.finance;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Economics of Disaster — interlinked historical economics + deterministic planning forecast
 * for Budget &amp; Finance. See {@link EconomicsOfDisasterService}.
 */
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
