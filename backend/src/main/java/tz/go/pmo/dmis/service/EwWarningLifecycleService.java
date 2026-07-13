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

    /**
     * Publish approved warning. Optional body {@code show_on_map:true} lights the public portal map
     * in the same step (default false — deliberate PMO gate).
     */
    Map<String, Object> publish(long id, Map<String, Object> body);
}
