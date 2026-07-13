package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Dispatch console: board, source picker, warehouse-manager dispatch gate,
 * procurement chain, and agency request. Paths and JSON unchanged from the
 * former response package. DispatchSupportService + SimulationGuard retained.
 */
public interface DispatchService {

    Map<String, Object> index(Long incidentId);

    Map<String, Object> sourcesFor(long id);

    Map<String, Object> dispatch(long id, Map<String, Object> body);

    Map<String, Object> approvals();

    Map<String, Object> approveDispatch(long id, Map<String, Object> body);

    Map<String, Object> rejectDispatch(long id, Map<String, Object> body);

    Map<String, Object> submitProcurement(long id, Map<String, Object> body);

    Map<String, Object> procurementRequests();

    Map<String, Object> approveProcurement(long allocationId, Map<String, Object> body);

    Map<String, Object> deliverProcurement(long allocationId, Map<String, Object> body);

    Map<String, Object> cancelProcurement(long allocationId, Map<String, Object> body);

    Map<String, Object> trackProcurement(long allocationId);

    Map<String, Object> submitAgencyRequest(long id, Map<String, Object> body);
}
