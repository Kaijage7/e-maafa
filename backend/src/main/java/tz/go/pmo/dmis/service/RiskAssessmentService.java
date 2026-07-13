package tz.go.pmo.dmis.service;

import tz.go.pmo.dmis.mitigation.RiskAssessmentResponses;
import tz.go.pmo.dmis.mitigation.RiskAssessmentWriteRequest;

/** Risk assessments. Path {@code /v1/risk-assessments} unchanged. Productive {@code page}. */
public interface RiskAssessmentService {
    RiskAssessmentResponses.Index index(int page);
    RiskAssessmentResponses.Detail show(Long id);
    RiskAssessmentResponses.Detail store(RiskAssessmentWriteRequest request);
    RiskAssessmentResponses.Detail update(Long id, RiskAssessmentWriteRequest request);
    void destroy(Long id);
    void approve(Long id);
    void publish(Long id);
}
