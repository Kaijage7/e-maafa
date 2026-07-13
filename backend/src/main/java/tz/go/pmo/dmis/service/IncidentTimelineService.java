package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Unified per-incident operations timeline (read-only merge of workflow, tasks,
 * SitReps, allocations, dispatch, warehouse, SMS/email, budget trails).
 * Path and JSON unchanged from the former response package controller.
 */
public interface IncidentTimelineService {

    Map<String, Object> opsTimeline(long id, String source, int limit);
}
