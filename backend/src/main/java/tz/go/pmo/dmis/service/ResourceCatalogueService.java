package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Relief-resource catalogue CRUD ({@code public.resources}).
 * Distinct from {@link tz.go.pmo.dmis.repository.ResourceRepository} (JPA read model for inventory).
 */
public interface ResourceCatalogueService {

    Map<String, Object> index(String category, String search);

    Map<String, Object> create(Map<String, Object> request);

    Map<String, Object> update(long id, Map<String, Object> request);

    void delete(long id);
}
