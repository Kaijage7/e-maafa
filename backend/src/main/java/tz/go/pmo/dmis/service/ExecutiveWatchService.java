package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Response → Executive Watch. National leadership common-operating-picture (read-only).
 * Area seats are denied; national tier only.
 */
public interface ExecutiveWatchService {

    /**
     * Full national watch payload. Throws {@link org.springframework.security.access.AccessDeniedException}
     * when the caller is not national-tier.
     */
    Map<String, Object> watch();
}
