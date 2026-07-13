package tz.go.pmo.dmis.controller;

import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.onehealth.OhEventWriteRequest;
import tz.go.pmo.dmis.service.OneHealthEventApiService;

/**
 * One Health events — thin eGA controller. Path {@code /v1/onehealth/events}.
 * List filters, form-data, store, show, comments, review, quick-view, issue directive, cascades.
 */
@RestController
@RequestMapping("/v1/onehealth/events")
@RequiredArgsConstructor
public class OneHealthEventController {

    private final OneHealthEventApiService service;

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(name = "area_of_concern_id", required = false) Long areaOfConcernId,
                                     @RequestParam(name = "region_id", required = false) Long regionId,
                                     @RequestParam(name = "stakeholder_id", required = false) Long stakeholderId,
                                     @RequestParam(name = "date_from", required = false) String dateFrom,
                                     @RequestParam(name = "date_to", required = false) String dateTo,
                                     @RequestParam(name = "event_type", required = false) String eventType,
                                     @RequestParam(name = "priority_level", required = false) String priorityLevel,
                                     @RequestParam(required = false) String search,
                                     @RequestParam(defaultValue = "1") int page) {
        return service.index(status, areaOfConcernId, regionId, stakeholderId, dateFrom, dateTo,
                eventType, priorityLevel, search, page);
    }

    @GetMapping("/form-data")
    public Map<String, Object> formData() {
        return service.formData();
    }

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PostMapping
    public ResponseEntity<Map<String, Object>> store(@RequestBody OhEventWriteRequest r) {
        return service.store(r);
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @GetMapping("/{id}/comments")
    public Map<String, Object> comments(@PathVariable long id) {
        return service.comments(id);
    }

    @PostMapping("/{id}/comments")
    @PreAuthorize("hasAnyAuthority('one_health.view','one_health.manage','one_health.approve','one_health.directive')")
    public Map<String, Object> addComment(@PathVariable long id, @RequestBody Map<String, Object> body) {
        return service.addComment(id, body);
    }

    @GetMapping("/{id}/edit")
    public ResponseEntity<Map<String, Object>> edit(@PathVariable long id) {
        return service.edit(id);
    }

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> update(@PathVariable long id) {
        return service.update(id);
    }

    @PreAuthorize("hasAuthority('one_health.approve')")
    @PostMapping("/{id}/review")
    public ResponseEntity<Map<String, Object>> review(@PathVariable long id,
                                                      @RequestBody(required = false) Map<String, Object> body) {
        return service.review(id, body);
    }

    @GetMapping("/{id}/quick-view")
    public Map<String, Object> quickView(@PathVariable long id) {
        return service.quickView(id);
    }

    @PreAuthorize("hasAuthority('one_health.directive')")
    @PostMapping("/{id}/directives")
    public ResponseEntity<Map<String, Object>> storeDirective(@PathVariable long id,
                                                              @RequestBody Map<String, Object> body) {
        return service.storeDirective(id, body);
    }

    @GetMapping("/districts/{regionId}")
    public List<Map<String, Object>> districts(@PathVariable long regionId) {
        return service.districts(regionId);
    }

    @GetMapping("/wards/{districtId}")
    public List<Map<String, Object>> wards(@PathVariable long districtId) {
        return service.wards(districtId);
    }

    @GetMapping("/concern-items/{areaId}")
    public List<Map<String, Object>> concernItems(@PathVariable long areaId) {
        return service.concernItems(areaId);
    }

    @GetMapping("/area-stakeholders/{areaId}")
    public List<Map<String, Object>> areaStakeholders(@PathVariable long areaId) {
        return service.areaStakeholders(areaId);
    }
}
