package tz.go.pmo.dmis.service;

import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

/**
 * EW bulletin ingestion from PMO-DMD "Push to PMO".
 * Path {@code POST /ew/bulletins/ingest} unchanged.
 * Productive params: {@code payload} (JSON with days), {@code bulletin_type} (tma|dmd),
 * optional {@code pdf_file}. Invalid type/payload → 422 body; zero hazards → BusinessRuleException;
 * duplicate within 1h → 200 with duplicate=true; success → 201.
 */
public interface EwBulletinIngestService {

    ResponseEntity<Map<String, Object>> ingest(String payloadJson, String bulletinType, MultipartFile pdf)
            throws Exception;
}
