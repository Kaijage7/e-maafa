package tz.go.pmo.dmis.service;

import java.util.Map;

/** Sendai analytics dashboard. Paths/JSON unchanged. */
public interface SendaiAnalyticsService {

    Map<String, Object> dashboard(Integer yearParam);
}
