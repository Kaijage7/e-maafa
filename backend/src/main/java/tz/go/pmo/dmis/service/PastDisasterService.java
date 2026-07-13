package tz.go.pmo.dmis.service;



/**
 * eGA service for PastDisaster.
 * Paths unchanged from mitigation package extract.
 */
public interface PastDisasterService {

    tz.go.pmo.dmis.mitigation.PastDisasterResponses.Index index(int page);

    tz.go.pmo.dmis.mitigation.PastDisasterResponses.Detail show(Long id);

    tz.go.pmo.dmis.mitigation.PastDisasterResponses.Detail store(
            tz.go.pmo.dmis.mitigation.PastDisasterWriteRequest request);

    tz.go.pmo.dmis.mitigation.PastDisasterResponses.Detail update(
            Long id, tz.go.pmo.dmis.mitigation.PastDisasterWriteRequest request);

    void destroy(Long id);

}
