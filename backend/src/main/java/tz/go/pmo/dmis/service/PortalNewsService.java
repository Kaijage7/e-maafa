package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;

/** eGA service — paths unchanged (/v1/content/news). */
public interface PortalNewsService {

    record NewsWriteRequest(String title, String excerpt, String body, String image, String category, Boolean isActive, String title_sw, String excerpt_sw, String body_sw) {}

    Map<String, Object> index();

    Map<String, Object> create(NewsWriteRequest req);

    Map<String, Object> update(long id, NewsWriteRequest req);

    Map<String, Object> delete(long id);

}
