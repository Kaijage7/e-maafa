package tz.go.pmo.dmis.service;



/**
 * eGA service for InfrastructureItem.
 * Paths unchanged from mitigation package extract.
 */
public interface InfrastructureItemService {

    tz.go.pmo.dmis.mitigation.InfrastructureItemResponses.Index index(int page);

    tz.go.pmo.dmis.mitigation.InfrastructureItemResponses.Detail show(Long id);

    tz.go.pmo.dmis.mitigation.InfrastructureItemResponses.Detail store(
            tz.go.pmo.dmis.mitigation.InfrastructureItemWriteRequest request);

    tz.go.pmo.dmis.mitigation.InfrastructureItemResponses.Detail update(
            Long id, tz.go.pmo.dmis.mitigation.InfrastructureItemWriteRequest request);

    void destroy(Long id);

}
