package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * System Settings → Approval Workflows. Administers V24 engine chains
 * ({@code approval_workflow_modules} + {@code approval_workflow_configurations}).
 * The {@code ApprovalWorkflowEngine} reads the same tables at runtime (SQL coupling only).
 */
public interface ApprovalWorkflowConfigService {

    Map<String, Object> index();

    Map<String, Object> toggleModule(long moduleId);

    Map<String, Object> addLevel(long moduleId, Map<String, Object> request);

    Map<String, Object> updateLevel(long levelId, Map<String, Object> request);

    Map<String, Object> moveLevel(long levelId, Map<String, Object> request);

    void deleteLevel(long levelId);
}
