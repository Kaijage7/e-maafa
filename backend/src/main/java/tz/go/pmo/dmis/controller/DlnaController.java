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
import tz.go.pmo.dmis.service.DlnaService;
import tz.go.pmo.dmis.service.DlnaService.CreateRequest;
import tz.go.pmo.dmis.service.DlnaService.FileReportRequest;
import tz.go.pmo.dmis.service.DlnaService.HeaderRequest;
import tz.go.pmo.dmis.service.DlnaService.PlanRequest;
import tz.go.pmo.dmis.service.DlnaService.SectionRequest;

/**
 * Response → DLNA (NDRF Annex 1) & Recovery Plan (Annex 2). Thin eGA controller;
 * logic in {@link DlnaService}. Paths and JSON unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/dlna")
@RequiredArgsConstructor
public class DlnaController {

    private final DlnaService service;

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) Long incident_id) {
        return service.index(incident_id);
    }

    @PostMapping
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    public Map<String, Object> create(@RequestBody CreateRequest req) throws Exception {
        return service.create(req);
    }

    @GetMapping("/{id:\\d+}")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PostMapping("/{id:\\d+}/header")
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    public Map<String, Object> saveHeader(@PathVariable long id, @RequestBody HeaderRequest req) throws Exception {
        return service.saveHeader(id, req);
    }

    @PostMapping("/{id:\\d+}/sections/{key}")
    @PreAuthorize("hasAnyAuthority('damage_assessment.create','damage_assessment.key_section')")
    public Map<String, Object> saveSection(@PathVariable long id, @PathVariable String key,
                                           @RequestBody SectionRequest req) throws Exception {
        return service.saveSection(id, key, req);
    }

    @PostMapping("/{id:\\d+}/sections/{key}/reopen")
    @PreAuthorize("hasAnyAuthority('damage_assessment.create','damage_assessment.key_section')")
    public Map<String, Object> reopenSection(@PathVariable long id, @PathVariable String key) {
        return service.reopenSection(id, key);
    }

    @PostMapping("/{id:\\d+}/finalize")
    @PreAuthorize("hasAuthority('damage_assessment.verify')")
    public Map<String, Object> finalize(@PathVariable long id) {
        return service.finalize(id);
    }

    @PostMapping("/{id:\\d+}/reopen")
    @PreAuthorize("hasAuthority('damage_assessment.verify')")
    public Map<String, Object> reopen(@PathVariable long id) {
        return service.reopen(id);
    }

    @GetMapping("/plan/by-incident/{incidentId:\\d+}")
    public Map<String, Object> planByIncident(@PathVariable long incidentId) {
        return service.planByIncident(incidentId);
    }

    @PostMapping("/plan/by-incident/{incidentId:\\d+}")
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    public Map<String, Object> savePlan(@PathVariable long incidentId, @RequestBody PlanRequest req) throws Exception {
        return service.savePlan(incidentId, req);
    }

    @GetMapping("/my-sections")
    @PreAuthorize("hasAnyAuthority('damage_assessment.create','damage_assessment.key_section')")
    public Map<String, Object> mySections() {
        return service.mySections();
    }

    @PostMapping("/{id:\\d+}/file-report")
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    public Map<String, Object> fileAnnex1Report(@PathVariable long id, @RequestBody FileReportRequest req) throws Exception {
        return service.fileAnnex1Report(id, req);
    }

    @PostMapping("/plan/by-incident/{incidentId:\\d+}/file-report")
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    public Map<String, Object> filePlanReport(@PathVariable long incidentId, @RequestBody FileReportRequest req) throws Exception {
        return service.filePlanReport(incidentId, req);
    }
}
