package tz.go.pmo.dmis.controller;

import tz.go.pmo.dmis.service.MonitoringEvaluationEntryService;
import tz.go.pmo.dmis.service.MonitoringEvaluationService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Monitoring &amp; Evaluation — thin eGA controller. Paths/JSON unchanged.
 * Logic in {@link tz.go.pmo.dmis.service.MonitoringEvaluationService} and
 * {@link tz.go.pmo.dmis.service.MonitoringEvaluationEntryService}.
 *
 * Monitoring & Evaluation command dashboard. The payload is assembled from live operational tables so PMO-DMD
 * can monitor budgets, readiness, cycle activities, institutions, incidents and resources without a parallel
 * manual reporting spreadsheet.
 */
@RestController
@RequestMapping("/v1/monitoring-evaluation")
@Tag(name = "Monitoring & Evaluation", description = "National, regional and LGA disaster-management indicators")
@RequiredArgsConstructor
public class MonitoringEvaluationController {

    private final MonitoringEvaluationService service;
    private final MonitoringEvaluationEntryService entryService;

    @GetMapping("/dashboard")
    @Operation(summary = "M&E dashboard: command KPIs, budgets, resources, interventions, framework aims")
    @PreAuthorize("hasAuthority('monitoring_evaluation.view')")
    public Map<String, Object> dashboard() {
        return service.dashboard();
    }

    @GetMapping("/framework-aims")
    @Operation(summary = "Original M&E module aims with linked indicator codes")
    @PreAuthorize("hasAuthority('monitoring_evaluation.view')")
    public List<Map<String, Object>> frameworkAims() {
        return service.frameworkAimsPublic();
    }

    @GetMapping("/workbench")
    @Operation(summary = "M&E entry workbench: indicators, targets and period values across all institutional levels")
    @PreAuthorize("hasAuthority('monitoring_evaluation.view')")
    public Map<String, Object> workbench(@RequestParam(required = false) String level,
                                         @RequestParam(required = false) String period,
                                         @RequestParam(required = false) String domain,
                                         @RequestParam(required = false) String search,
                                         @RequestParam(required = false) String institutionClass) {
        return entryService.workbench(level, period, domain, search, institutionClass);
    }

    @GetMapping("/indicators")
    @Operation(summary = "List M&E indicator catalogue rows")
    @PreAuthorize("hasAuthority('monitoring_evaluation.view')")
    public List<Map<String, Object>> indicators(@RequestParam(required = false) String level,
                                                @RequestParam(required = false) String domain,
                                                @RequestParam(required = false) String search,
                                                @RequestParam(defaultValue = "true") boolean activeOnly) {
        return entryService.indicators(level, domain, search, activeOnly);
    }

    @PostMapping("/indicators")
    @Operation(summary = "Create an M&E indicator definition")
    @PreAuthorize("hasAuthority('monitoring_evaluation.manage')")
    public Map<String, Object> createIndicator(@RequestBody Map<String, Object> req) {
        return entryService.createIndicator(req);
    }

    @PutMapping("/indicators/{id}")
    @Operation(summary = "Update an M&E indicator definition")
    @PreAuthorize("hasAuthority('monitoring_evaluation.manage')")
    public Map<String, Object> updateIndicator(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return entryService.updateIndicator(id, req);
    }

    @PostMapping("/values")
    @Operation(summary = "Save one M&E indicator value")
    @PreAuthorize("hasAnyAuthority('monitoring_evaluation.enter','monitoring_evaluation.manage')")
    public Map<String, Object> saveValue(@RequestBody Map<String, Object> req) {
        return entryService.saveValue(req);
    }

    @PostMapping("/values/batch")
    @Operation(summary = "Save many M&E indicator values")
    @PreAuthorize("hasAnyAuthority('monitoring_evaluation.enter','monitoring_evaluation.manage')")
    public Map<String, Object> saveBatch(@RequestBody Map<String, Object> req) {
        return entryService.saveBatch(req);
    }

    @GetMapping("/organizations/indicators")
    @Operation(summary = "List indicators assigned to an agency or stakeholder")
    @PreAuthorize("hasAuthority('monitoring_evaluation.view')")
    public Map<String, Object> organizationIndicators(@RequestParam(required = false) Long agencyId,
                                                      @RequestParam(required = false) Long stakeholderId) {
        return entryService.organizationIndicators(agencyId, stakeholderId);
    }

    @PostMapping("/organizations/indicators")
    @Operation(summary = "Assign catalogue indicator to organization (optional auto-capture of value)")
    @PreAuthorize("hasAnyAuthority('monitoring_evaluation.enter','monitoring_evaluation.manage')")
    public Map<String, Object> assignOrganizationIndicator(@RequestBody Map<String, Object> req) {
        return entryService.assignIndicatorToOrganization(req);
    }

    @DeleteMapping("/organizations/indicators/{assignmentId}")
    @Operation(summary = "Remove indicator from organization (soft; values kept)")
    @PreAuthorize("hasAnyAuthority('monitoring_evaluation.enter','monitoring_evaluation.manage')")
    public Map<String, Object> removeOrganizationIndicator(@PathVariable long assignmentId) {
        return entryService.removeIndicatorFromOrganization(assignmentId);
    }

    @PostMapping("/organizations/capture")
    @Operation(summary = "Auto-capture linked values for all auto_capture assignments of an organization")
    @PreAuthorize("hasAnyAuthority('monitoring_evaluation.enter','monitoring_evaluation.manage')")
    public Map<String, Object> captureOrganization(@RequestBody Map<String, Object> req) {
        Long agencyId = req.get("agencyId") instanceof Number n ? n.longValue() : null;
        Long stakeholderId = req.get("stakeholderId") instanceof Number n ? n.longValue() : null;
        if (agencyId == null && req.get("agencyId") != null) {
            try { agencyId = Long.parseLong(String.valueOf(req.get("agencyId"))); } catch (Exception ignored) { }
        }
        if (stakeholderId == null && req.get("stakeholderId") != null) {
            try { stakeholderId = Long.parseLong(String.valueOf(req.get("stakeholderId"))); } catch (Exception ignored) { }
        }
        String period = req.get("period") == null ? null : String.valueOf(req.get("period"));
        return entryService.captureOrganizationValues(agencyId, stakeholderId, period);
    }
}
