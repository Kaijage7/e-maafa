package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.BudgetService;

/**
 * Disaster Budget &amp; Finance — thin eGA controller. Path {@code /v1/finance}.
 * Maker-checker commitments (request → approve → commit → disburse), virements, NDMF, thresholds.
 */
@RestController
@RequestMapping("/v1/finance")
@RequiredArgsConstructor
public class BudgetController {

    private final BudgetService service;

    @GetMapping("/periods")
    @PreAuthorize("hasAuthority('budget_and_finance.view')")
    public Map<String, Object> periods() {
        return service.periods();
    }

    @PostMapping("/periods")
    @PreAuthorize("hasAuthority('budget_and_finance.manage')")
    public Map<String, Object> createPeriod(@RequestBody Map<String, Object> b) {
        return service.createPeriod(b);
    }

    @GetMapping("/budgets")
    @PreAuthorize("hasAuthority('budget_and_finance.view')")
    public Map<String, Object> budgets() {
        return service.budgets();
    }

    @PostMapping("/budgets")
    @PreAuthorize("hasAuthority('budget_and_finance.manage')")
    public Map<String, Object> createBudget(@RequestBody Map<String, Object> b) {
        return service.createBudget(b);
    }

    @GetMapping("/budgets/{id}")
    @PreAuthorize("hasAuthority('budget_and_finance.view')")
    public Map<String, Object> budget(@PathVariable long id) {
        return service.budget(id);
    }

    @PostMapping("/budgets/{id}/approve")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    public Map<String, Object> approveBudget(@PathVariable long id) {
        return service.approveBudget(id);
    }

    @PostMapping("/budgets/{id}/lines")
    @PreAuthorize("hasAuthority('budget_and_finance.manage')")
    public Map<String, Object> addLine(@PathVariable long id, @RequestBody Map<String, Object> b) {
        return service.addLine(id, b);
    }

    @PostMapping("/commitments")
    @PreAuthorize("hasAuthority('budget_and_finance.manage')")
    public Map<String, Object> request(@RequestBody Map<String, Object> b) {
        return service.request(b);
    }

    @PostMapping("/commitments/{id}/approve")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    public Map<String, Object> approveCommitment(@PathVariable long id) {
        return service.approveCommitment(id);
    }

    @PostMapping("/commitments/{id}/commit")
    @PreAuthorize("hasAuthority('budget_and_finance.disburse')")
    public Map<String, Object> commit(@PathVariable long id) {
        return service.commit(id);
    }

    @PostMapping("/commitments/{id}/disburse")
    @PreAuthorize("hasAuthority('budget_and_finance.disburse')")
    public Map<String, Object> disburse(@PathVariable long id, @RequestBody(required = false) Map<String, Object> b) {
        return service.disburse(id, b);
    }

    @PostMapping("/commitments/{id}/reject")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    public Map<String, Object> reject(@PathVariable long id, @RequestBody Map<String, Object> b) {
        return service.reject(id, b);
    }

    @PostMapping("/virements")
    @PreAuthorize("hasAuthority('budget_and_finance.manage')")
    public Map<String, Object> requestVirement(@RequestBody Map<String, Object> b) {
        return service.requestVirement(b);
    }

    @PostMapping("/virements/{id}/approve")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    public Map<String, Object> approveVirement(@PathVariable long id) {
        return service.approveVirement(id);
    }

    @PostMapping("/virements/{id}/reject")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    public Map<String, Object> rejectVirement(@PathVariable long id, @RequestBody Map<String, Object> b) {
        return service.rejectVirement(id, b);
    }

    @GetMapping("/thresholds")
    @PreAuthorize("hasAuthority('budget_and_finance.view')")
    public Map<String, Object> thresholds() {
        return service.thresholds();
    }

    @PostMapping("/thresholds")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    public Map<String, Object> setThreshold(@RequestBody Map<String, Object> b) {
        return service.setThreshold(b);
    }

    @GetMapping("/ndmf/donations")
    @PreAuthorize("hasAuthority('budget_and_finance.view')")
    public Map<String, Object> ndmfDonations() {
        return service.ndmfDonations();
    }

    @PostMapping("/ndmf/disburse")
    @PreAuthorize("hasAuthority('budget_and_finance.disburse')")
    public Map<String, Object> ndmfDisburse(@RequestBody Map<String, Object> b) {
        return service.ndmfDisburse(b);
    }
}
