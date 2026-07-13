package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Command Post / Coordination center: activations board, posture, readiness,
 * operational periods, injects, AAR, DRF lanes, tasks, command roles.
 * Paths and JSON unchanged. ActivationService + AnticipatoryPlansService retained.
 * Shares base path {@code /v1/response/coordination} with scenarios controller.
 */
public interface CommandCenterService {

    Map<String, Object> index();

    Map<String, Object> activate(long incidentId, Map<String, Object> body);

    Map<String, Object> issuedWarningsForActivation();

    Map<String, Object> activateFromForecast(Map<String, Object> body) throws Exception;

    Map<String, Object> changePosture(long id, Map<String, Object> body);

    Map<String, Object> cancelForecast(long id, Map<String, Object> body);

    Map<String, Object> confirmImpact(long id, Map<String, Object> body);

    Map<String, Object> readiness(long id) throws Exception;

    Map<String, Object> board(long id);

    Map<String, Object> openPeriod(long id, Map<String, Object> body);

    Map<String, Object> closePeriod(long id, long periodId, Map<String, Object> body);

    Map<String, Object> addInject(long id, Map<String, Object> body);

    Map<String, Object> fireInject(long id, long injectId);

    Map<String, Object> resolveInject(long id, long injectId, Map<String, Object> body);

    Map<String, Object> deleteInject(long id, long injectId);

    Map<String, Object> aar(long id);

    Map<String, Object> drfDetail(long id, long drfId);

    Map<String, Object> assignDrf(long id, long drfId, Map<String, Object> body);

    Map<String, Object> addTask(long id, long drfId, Map<String, Object> body);

    Map<String, Object> updateTask(long id, long taskId, Map<String, Object> body);

    Map<String, Object> destroyTask(long id, long taskId);

    Map<String, Object> deactivate(long id, Map<String, Object> body);

    Map<String, Object> appointCommandRole(long id, Map<String, Object> body);

    Map<String, Object> relieveCommandRole(long roleId, Map<String, Object> body);
}
