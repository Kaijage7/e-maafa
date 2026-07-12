package tz.go.pmo.dmis.service;

import java.util.Map;
import tz.go.pmo.dmis.dto.request.InventoryWriteRequest;
import tz.go.pmo.dmis.dto.response.InventoryResponse;

/** Emergency supplies / inventory (Preparedness). */
public interface InventoryService {

    InventoryResponse index();

    Map<String, Object> reference();

    Map<String, Object> create(InventoryWriteRequest request);

    Map<String, Object> detail(long id);

    Map<String, Object> update(long id, InventoryWriteRequest request);
}
