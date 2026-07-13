package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;

/** eGA service — paths unchanged under /v1/onehealth (disseminations). */
public interface OneHealthDisseminationService {

    Map<String, Object> index(String type, String approvalStatus, String status, int page);

    Map<String, Object> show(long id);

    ResponseEntity<Map<String, Object>> storeStakeholder(long eventId, Map<String, String> form,
            List<Long> stakeholderIds, List<String> channels, MultipartFile recipientFile);

    ResponseEntity<Map<String, Object>> storePublic(long eventId, Map<String, String> form,
            List<String> targetAudience, List<String> channels, MultipartFile recipientFile);

    ResponseEntity<Map<String, Object>> approve(long id, Map<String, Object> body);

    ResponseEntity<Map<String, Object>> acknowledge(long id);

    Map<String, Object> resend(long id);

    Map<String, Object> recipients(long eventId, String type);
}
