package tz.go.pmo.dmis.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.service.ContentUploadService;

/**
 * Content Management → image upload for News & Gallery editors (Discussion D3).
 * Stores under the SHARED public storage root (same {@code dmis.storage.public-root} that
 * PublicStorageConfig serves at {@code /storage/**}, mirroring Laravel's public disk), in
 * {@code portal/<folder>/}. Returns the relative path the content tables store plus the
 * ready-to-use URL. Same validation pattern as FrameworkService.storeFile.
 */
@RestController
@RequestMapping("/v1/content/upload")
@RequiredArgsConstructor
@Tag(name = "Content Management", description = "Image upload (news, gallery)")
public class ContentUploadController {

    private final ContentUploadService service;

    @PostMapping
    @PreAuthorize("hasAuthority('content_management.manage')")
    @Operation(summary = "Upload an image; returns the stored path + serving URL")
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file, @RequestParam(defaultValue = "news") String folder) {
        return service.upload(file, folder);
    }

}
