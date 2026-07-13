package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.service.EwProductsService;

/**
 * Early Warning → generated products / EOCC bulletins. Thin eGA controller;
 * logic in {@link EwProductsService}. Path {@code /v1/ew/products} unchanged.
 */
@RestController
@RequestMapping("/v1/ew/products")
@PreAuthorize("isAuthenticated()")
@RequiredArgsConstructor
public class EwProductsController {

    private final EwProductsService service;

    @PostMapping
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> store(@RequestParam("pdf") MultipartFile pdf,
                                     @RequestParam("payload") String payloadJson) throws Exception {
        return service.store(pdf, payloadJson);
    }

    @PostMapping("/upload")
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> upload(@RequestParam("pdf") MultipartFile pdf,
                                      @RequestParam(required = false) String title,
                                      @RequestParam(required = false) String description) throws Exception {
        return service.upload(pdf, title, description);
    }

    @PatchMapping("/{id}/publish")
    @PreAuthorize("hasAuthority('early_warning.disseminate')")
    public Map<String, Object> setPublished(@PathVariable long id,
                                            @RequestBody(required = false) Map<String, Object> body) {
        return service.setPublished(id, body);
    }

    @PostMapping("/{id}/disseminate")
    @PreAuthorize("hasAuthority('early_warning.disseminate')")
    public Map<String, Object> disseminate(@PathVariable long id,
                                           @RequestBody(required = false) Map<String, Object> body) {
        return service.disseminate(id, body);
    }

    /** List products. Filters: severity, type (= bulletin_type). Both productive. */
    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String severity,
                                     @RequestParam(required = false) String type) {
        return service.index(severity, type);
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        return service.show(id);
    }
}
