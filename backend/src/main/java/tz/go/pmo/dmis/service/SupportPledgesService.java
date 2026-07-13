package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Donor / partner support needs feed and pledge review queue.
 * Paths and JSON unchanged from the former response package controller.
 */
public interface SupportPledgesService {

    Map<String, Object> needs();

    Map<String, Object> pledge(Map<String, Object> body);

    Map<String, Object> pledges();

    Map<String, Object> accept(long id, Map<String, Object> body);

    Map<String, Object> decline(long id, Map<String, Object> body);
}
