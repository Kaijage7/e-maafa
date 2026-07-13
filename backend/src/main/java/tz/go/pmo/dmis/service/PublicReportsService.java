package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Response → Public hazard reports triage (citizen portal → review / dismiss / convert).
 * Paths and JSON unchanged from the former response package controller.
 */
public interface PublicReportsService {

    Map<String, Object> index(String status, String search);

    Map<String, Object> review(long id, Map<String, Object> body);

    Map<String, Object> dismiss(long id, Map<String, Object> body);

    Map<String, Object> convert(long id, Map<String, Object> body);
}
