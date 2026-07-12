package tz.go.pmo.dmis.service;

import java.util.List;
import java.util.Map;
import tz.go.pmo.dmis.dto.request.EvacuationCenterWriteRequest;
import tz.go.pmo.dmis.dto.response.EvacuationCenterResponse;

/** Evacuation centre registry (Preparedness). */
public interface EvacuationCenterService {

    EvacuationCenterResponse index();

    Map<String, Object> create(EvacuationCenterWriteRequest request);

    Map<String, Object> detail(long id);

    Map<String, Object> update(long id, EvacuationCenterWriteRequest request);

    List<Map<String, Object>> nearest(double lat, double lng, int limit);
}
