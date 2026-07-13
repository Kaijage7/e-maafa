package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Response overview dashboard + EOCC live board + EOCC activate quick action.
 * Paths and JSON unchanged from the former response package controller.
 */
public interface DashboardService {

    Map<String, Object> dashboard();

    Map<String, Object> eocc();

    Map<String, Object> activate(Map<String, Object> body);
}
