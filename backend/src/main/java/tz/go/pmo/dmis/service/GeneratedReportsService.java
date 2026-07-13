package tz.go.pmo.dmis.service;

import java.util.Map;

/** Registry of generated official documents (DLNA Annex 1, recovery plans). Paths/JSON unchanged. */
public interface GeneratedReportsService {

    Map<String, Object> index(String type, Long incidentId);
}
