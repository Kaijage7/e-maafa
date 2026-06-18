package tz.go.pmo.dmis.portal;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Content Management → image upload for News & Gallery editors (Discussion D3).
 * Stores under the SHARED public storage root (same {@code dmis.storage.public-root} that
 * PublicStorageConfig serves at {@code /storage/**}, mirroring Laravel's public disk), in
 * {@code portal/<folder>/}. Returns the relative path the content tables store plus the
 * ready-to-use URL. Same validation pattern as FrameworkService.storeFile.
 */
@RestController
@RequestMapping("/v1/content/upload")
@Tag(name = "Content Management", description = "Image upload (news, gallery)")
public class ContentUploadController {

    private static final List<String> ALLOWED_EXTENSIONS = List.of("jpg", "jpeg", "png", "webp", "gif", "pdf");
    private static final long MAX_BYTES = 5L * 1024 * 1024; // 5 MB, matching the Laravel validators

    @Value("${dmis.storage.public-root:${user.dir}/storage/public}")
    private String publicRoot;

    @PostMapping
    @PreAuthorize(Authz.CONTENT_MANAGE)
    @Operation(summary = "Upload an image; returns the stored path + serving URL")
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file,
                                      @RequestParam(defaultValue = "news") String folder) {
        String original = file.getOriginalFilename() == null ? "" : file.getOriginalFilename();
        String ext = original.contains(".")
                ? original.substring(original.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        if (!ALLOWED_EXTENSIONS.contains(ext)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "The file must be one of: " + String.join(", ", ALLOWED_EXTENSIONS));
        }
        if (file.getSize() > MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The file must not be greater than 5 MB");
        }
        // Content-signature (magic-byte) check — a renamed payload (e.g. PHP saved as .png) is rejected
        // even though this static-serve stack would never execute it; matches the Laravel image validators.
        try {
            if (!signatureMatches(file, ext)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "The file content does not match a ." + ext + " file");
            }
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read the uploaded file");
        }
        // Only known content folders are valid targets — never let the client pick arbitrary dirs
        String safeFolder = List.of("gallery", "materials", "plans", "threats").contains(folder) ? folder : "news";
        try {
            Path dir = Path.of(publicRoot, "portal", safeFolder);
            Files.createDirectories(dir);
            String name = UUID.randomUUID() + "." + ext;
            try (var in = file.getInputStream()) {
                Files.copy(in, dir.resolve(name), StandardCopyOption.REPLACE_EXISTING);
            }
            String relativePath = "portal/" + safeFolder + "/" + name;
            return Map.of("path", relativePath, "url", "/api/storage/" + relativePath);
        } catch (IOException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to store the image");
        }
    }

    /** Verify the file's leading bytes match the claimed extension's well-known signature. */
    private static boolean signatureMatches(MultipartFile file, String ext) throws IOException {
        byte[] h = new byte[12];
        int n;
        try (var in = file.getInputStream()) {
            n = in.readNBytes(h, 0, 12);
        }
        return switch (ext) {
            case "jpg", "jpeg" -> n >= 3 && (h[0] & 0xFF) == 0xFF && (h[1] & 0xFF) == 0xD8 && (h[2] & 0xFF) == 0xFF;
            case "png" -> n >= 8 && (h[0] & 0xFF) == 0x89 && h[1] == 'P' && h[2] == 'N' && h[3] == 'G'
                    && (h[4] & 0xFF) == 0x0D && (h[5] & 0xFF) == 0x0A && (h[6] & 0xFF) == 0x1A && (h[7] & 0xFF) == 0x0A;
            case "gif" -> n >= 6 && h[0] == 'G' && h[1] == 'I' && h[2] == 'F' && h[3] == '8';
            case "webp" -> n >= 12 && h[0] == 'R' && h[1] == 'I' && h[2] == 'F' && h[3] == 'F'
                    && h[8] == 'W' && h[9] == 'E' && h[10] == 'B' && h[11] == 'P';
            case "pdf" -> n >= 4 && h[0] == '%' && h[1] == 'P' && h[2] == 'D' && h[3] == 'F';
            default -> false;
        };
    }
}
