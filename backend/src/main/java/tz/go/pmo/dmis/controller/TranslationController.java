package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.service.TranslationService;

/**
 * System Settings → Translations. Thin eGA controller; business logic in {@link TranslationService}.
 * Paths unchanged. Public portal i18n still reads {@code public.translations} via PortalPublicService.
 */
@RestController
@RequestMapping("/v1/settings/translations")
@Tag(name = "Settings: Translations", description = "Bilingual EN/SW UI strings")
@RequiredArgsConstructor
public class TranslationController {

    private static final String CAN_WRITE = "hasAuthority('translations.manage')";

    private final TranslationService service;

    @GetMapping
    @Operation(summary = "Translations (filterable) + groups + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index(@RequestParam(required = false) String group,
                                     @RequestParam(required = false) String search) {
        return service.index(group, search);
    }

    @PostMapping
    @Operation(summary = "Add a translation key")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> create(@RequestBody Map<String, Object> req) {
        return service.create(req);
    }

    @PutMapping("/{id}")
    @Operation(summary = "Edit a translation (EN / SW / group)")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a translation key")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @PreAuthorize(CAN_WRITE)
    public void delete(@PathVariable long id) {
        service.delete(id);
    }
}
