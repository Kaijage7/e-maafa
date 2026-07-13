package tz.go.pmo.dmis.service;

import java.util.Map;
import tz.go.pmo.dmis.mitigation.FrameworkWriteRequest;

/**
 * Disaster risk frameworks (content registry).
 * Path {@code /v1/frameworks} unchanged. Productive {@code page} (1-based pagination).
 */
public interface FrameworkService {

    Map<String, Object> index(int page);

    Map<String, Object> show(Long id);

    Map<String, Object> store(FrameworkWriteRequest request);

    Map<String, Object> update(Long id, FrameworkWriteRequest request);

    void destroy(Long id);
}
