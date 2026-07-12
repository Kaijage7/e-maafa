package tz.go.pmo.dmis.service;

import java.util.Map;
import tz.go.pmo.dmis.dto.request.WarehouseWriteRequest;
import tz.go.pmo.dmis.dto.response.WarehouseResponse;

/** Permanent warehouse registry (Preparedness). */
public interface WarehouseService {

    WarehouseResponse index();

    Map<String, Object> create(WarehouseWriteRequest request);

    Map<String, Object> show(long id);

    Map<String, Object> update(long id, WarehouseWriteRequest request);
}
