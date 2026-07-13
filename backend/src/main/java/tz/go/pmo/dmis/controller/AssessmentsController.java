package tz.go.pmo.dmis.controller;

import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.service.AssessmentsService;

/**
 * Response → Disaster Needs Assessments. Thin eGA controller; logic in {@link AssessmentsService}.
 * Paths and JSON/multipart shape unchanged from the former response package.
 */
@RestController
@RequestMapping("/v1/response/assessments")
@RequiredArgsConstructor
public class AssessmentsController {

    private final AssessmentsService service;

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) Long incident_id) {
        return service.index(status, incident_id);
    }

    @GetMapping("/form-data")
    public Map<String, Object> formData() {
        return service.formData();
    }

    @PreAuthorize("hasAuthority('damage_assessment.create')")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> store(
            @RequestParam Map<String, String> form,
            @RequestPart(name = "photos", required = false) List<MultipartFile> photos) throws Exception {
        return service.store(form, photos);
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }

    @PreAuthorize("hasAuthority('damage_assessment.create')")
    @PostMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> update(
            @PathVariable long id,
            @RequestParam Map<String, String> form,
            @RequestPart(name = "photos", required = false) List<MultipartFile> photos) throws Exception {
        return service.update(id, form, photos);
    }

    @PreAuthorize("hasAuthority('damage_assessment.create')")
    @PostMapping("/{id}/submit")
    public Map<String, Object> submit(@PathVariable long id) {
        return service.submit(id);
    }

    @PreAuthorize("hasAuthority('damage_assessment.verify')")
    @PostMapping("/{id}/verify")
    public Map<String, Object> verify(@PathVariable long id,
                                      @RequestBody(required = false) Map<String, Object> body) {
        return service.verify(id, body);
    }

    @PreAuthorize("hasAuthority('damage_assessment.create')")
    @DeleteMapping("/{id}/photos/{photoId}")
    public Map<String, Object> deletePhoto(@PathVariable long id, @PathVariable long photoId) {
        return service.deletePhoto(id, photoId);
    }

    @GetMapping("/{id}/report")
    public Map<String, Object> report(@PathVariable long id) {
        return service.report(id);
    }
}
