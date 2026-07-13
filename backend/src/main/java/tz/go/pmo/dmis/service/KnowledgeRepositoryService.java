package tz.go.pmo.dmis.service;

import java.util.Map;


/**
 * Recovery service for /v1/recovery/knowledge. Paths unchanged.
 */
public interface KnowledgeRepositoryService {

    Map<String, Object> index(String type, String approval, String search);
    Map<String, Object> store(Map<String, Object> body);
    Map<String, Object> storeMultipart(java.util.Map<String, String> body,
                                       org.springframework.web.multipart.MultipartFile document,
                                       org.springframework.web.multipart.MultipartFile attachment);
    org.springframework.http.ResponseEntity<org.springframework.core.io.ByteArrayResource> download(long id);
    Map<String, Object> approve(long id);

}
