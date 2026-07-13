package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Strategic multi-region contingency plans (draft → pending → active → archived).
 * Paths and JSON unchanged from the former response package controller.
 */
public interface ContingencyPlansService {

    Map<String, Object> index(String status, String hazard);

    Map<String, Object> show(long id);

    Map<String, Object> store(Map<String, Object> body) throws Exception;

    Map<String, Object> update(long id, Map<String, Object> body) throws Exception;

    Map<String, Object> submit(long id);

    Map<String, Object> approve(long id);

    Map<String, Object> reject(long id);

    Map<String, Object> archive(long id);
}
