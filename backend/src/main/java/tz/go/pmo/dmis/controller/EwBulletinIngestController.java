package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.service.EwBulletinIngestService;

/**
 * EW Bulletin Ingestion — PMO-DMD push to pending warnings.
 * Thin eGA controller; logic in {@link EwBulletinIngestService}.
 * Path {@code /ew/bulletins} unchanged.
 */
@RestController
@RequestMapping("/ew/bulletins")
@PreAuthorize("hasAuthority('early_warning.create')")
@RequiredArgsConstructor
public class EwBulletinIngestController {

    private final EwBulletinIngestService service;

    @PostMapping("/ingest")
    public ResponseEntity<Map<String, Object>> ingest(
            @RequestParam("payload") String payloadJson,
            @RequestParam("bulletin_type") String bulletinType,
            @RequestParam(value = "pdf_file", required = false) MultipartFile pdf) throws Exception {
        return service.ingest(payloadJson, bulletinType, pdf);
    }
}
