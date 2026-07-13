package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.service.KnowledgeRepositoryService;

/** Knowledge repository / lessons learned. Thin eGA controller. Path {@code /v1/recovery/knowledge}. */
@RestController
@RequestMapping("/v1/recovery/knowledge")
@RequiredArgsConstructor
public class KnowledgeRepositoryController {

    private final KnowledgeRepositoryService service;

    @GetMapping
    @PreAuthorize("hasAuthority('recovery.view')")
    public Map<String, Object> index(@RequestParam(required = false) String type,
                                     @RequestParam(required = false) String approval,
                                     @RequestParam(required = false) String search) {
        return service.index(type, approval, search);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    @PreAuthorize("hasAuthority('recovery.manage')")
    public Map<String, Object> store(@RequestBody Map<String, Object> body) {
        return service.store(body);
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @PreAuthorize("hasAuthority('recovery.manage')")
    public Map<String, Object> storeMultipart(@RequestParam Map<String, String> body,
                                              @RequestPart(name = "document", required = false) MultipartFile document,
                                              @RequestPart(name = "attachment", required = false) MultipartFile attachment) {
        return service.storeMultipart(body, document, attachment);
    }

    @GetMapping("/{id}/download")
    @PreAuthorize("hasAuthority('recovery.view')")
    public ResponseEntity<ByteArrayResource> download(@PathVariable long id) {
        return service.download(id);
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAuthority('recovery.manage')")
    public Map<String, Object> approve(@PathVariable long id) {
        return service.approve(id);
    }
}
