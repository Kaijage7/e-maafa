package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Cross-agency Early Warning integration bus: submit / update / withdraw / latest /
 * history / updates / DMD consolidation / impact-support / action-guide.
 * Paths under {@code /v1/ew} unchanged. Productive query params:
 * {@code warning_code}, {@code agency} (updates); {@code limit} (history, clamped 1–200);
 * {@code exclude} (all-latest); {@code days} (consolidated); {@code day}/{@code days}/{@code hazardFocus}
 * (impact-support). Agency-bound logins see only their entity; PMO/national sees all.
 */
public interface EwAgencyService {

    Map<String, Object> submit(String agency, Map<String, Object> payload) throws Exception;

    Map<String, Object> update(String agency, String warningCode, Map<String, Object> payload) throws Exception;

    Map<String, Object> updates(String warningCode, String agency);

    Map<String, Object> latest(String agency);

    Map<String, Object> history(String agency, int limit);

    Map<String, Object> withdraw(String agency);

    Map<String, Object> allLatest(String exclude);

    Map<String, Object> consolidated(int days);

    Map<String, Object> impactSupport(int day, int days, String hazardFocus);

    Map<String, Object> actionGuideMeta();

    Map<String, Object> actionStatements(Map<String, Object> body);
}
