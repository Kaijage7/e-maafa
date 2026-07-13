package tz.go.pmo.dmis.service;

import java.util.Map;
import org.springframework.web.multipart.MultipartFile;

/**
 * EW generated products (EOCC bulletins): store, upload, publish, disseminate, list, show.
 * Paths and JSON unchanged from {@code /v1/ew/products}. Query params {@code severity}
 * and {@code type} (bulletin_type) are productive filters; blank ignored; unknown → empty list.
 * List stats use the same filter as the product rows.
 */
public interface EwProductsService {

    Map<String, Object> store(MultipartFile pdf, String payloadJson) throws Exception;

    Map<String, Object> upload(MultipartFile pdf, String title, String description) throws Exception;

    Map<String, Object> setPublished(long id, Map<String, Object> body);

    Map<String, Object> disseminate(long id, Map<String, Object> body);

    Map<String, Object> index(String severity, String type);

    Map<String, Object> show(long id);
}
