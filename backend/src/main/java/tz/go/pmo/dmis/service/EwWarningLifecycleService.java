package tz.go.pmo.dmis.service;

import java.util.Map;
import org.springframework.web.multipart.MultipartFile;

/**
 * EW warning lifecycle: approve, publish, portal map toggle, manual bulletin upload.
 * Paths under {@code /v1/ew/warnings/{id}/...} unchanged. Requires
 * {@code early_warning.approve}. Coexists with GET index on same base path.
 */
public interface EwWarningLifecycleService {

    Map<String, Object> approve(long id, Map<String, Object> body);

    Map<String, Object> setOnMap(long id, Map<String, Object> body);

    Map<String, Object> uploadBulletin(long id, MultipartFile pdf, String description) throws Exception;

    Map<String, Object> publish(long id);
}
