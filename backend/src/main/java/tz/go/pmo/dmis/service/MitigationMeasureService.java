package tz.go.pmo.dmis.service;



/**
 * eGA service for MitigationMeasure.
 * Paths unchanged from mitigation package extract.
 */
public interface MitigationMeasureService {

    tz.go.pmo.dmis.mitigation.MitigationMeasureResponses.Index index(int page);

    tz.go.pmo.dmis.mitigation.MitigationMeasureResponses.Detail show(Long id);

    tz.go.pmo.dmis.mitigation.MitigationMeasureResponses.Detail store(
            tz.go.pmo.dmis.mitigation.MitigationMeasureWriteRequest request);

    tz.go.pmo.dmis.mitigation.MitigationMeasureResponses.Detail update(
            Long id, tz.go.pmo.dmis.mitigation.MitigationMeasureWriteRequest request);

    void destroy(Long id);

}
