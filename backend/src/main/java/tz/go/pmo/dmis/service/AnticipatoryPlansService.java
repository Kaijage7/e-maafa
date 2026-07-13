package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;

/**
 * Per-area anticipatory action plans (draft → pending → active → archived).
 * Paths and JSON unchanged from the former response package controller.
 * {@link #matchingPlans} is also used by Command Post readiness (SQL consumer).
 */
public interface AnticipatoryPlansService {

    Map<String, Object> index(String status, String hazard, String search);

    Map<String, Object> show(long id);

    Map<String, Object> store(Map<String, Object> body) throws Exception;

    Map<String, Object> update(long id, Map<String, Object> body) throws Exception;

    Map<String, Object> submit(long id);

    Map<String, Object> approve(long id);

    Map<String, Object> reject(long id, Map<String, Object> body);

    Map<String, Object> archive(long id);

    /**
     * Active plans matching hazard keywords and optional forecast-impact area names.
     * Used by Command Post readiness (no standalone HTTP route).
     */
    List<Map<String, Object>> matchingPlans(String hazard, List<String> areas);
}
