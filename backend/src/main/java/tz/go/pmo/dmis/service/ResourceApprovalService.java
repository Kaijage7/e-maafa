package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Resource approval queues and actions (approve / fast-track / reject / rollback /
 * resubmit / update-source / bulk-approve). Paths and JSON unchanged from the former
 * response package controller. Engine remains transitional in response package.
 */
public interface ResourceApprovalService {

    Map<String, Object> index(String search);

    Map<String, Object> myRequests(String search);

    Map<String, Object> show(long id);

    Map<String, Object> approve(long id, Map<String, Object> body);

    Map<String, Object> fastTrack(long id, Map<String, Object> body);

    Map<String, Object> reject(long id, Map<String, Object> body);

    Map<String, Object> rollback(long id, Map<String, Object> body);

    Map<String, Object> resubmit(long id);

    Map<String, Object> updateSource(long id, Map<String, Object> body);

    Map<String, Object> bulkApprove(Map<String, Object> body);
}
