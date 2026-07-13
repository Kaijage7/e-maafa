package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;
import org.springframework.web.multipart.MultipartFile;

/** eGA service — paths unchanged (/v1/content/upload). */
public interface ContentUploadService {

    Map<String, Object> upload(MultipartFile file, String folder);

}
