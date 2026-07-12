package tz.go.pmo.dmis.service;

import java.util.Map;
import tz.go.pmo.dmis.dto.request.TemporaryWarehouseWriteRequest;
import tz.go.pmo.dmis.dto.response.TemporaryWarehouseResponse;

/** Temporary warehouse registry (Preparedness). */
public interface TemporaryWarehouseService {

    TemporaryWarehouseResponse index();

    Map<String, Object> create(TemporaryWarehouseWriteRequest request);

    Map<String, Object> detail(long id);

    Map<String, Object> update(long id, TemporaryWarehouseWriteRequest request);
}
