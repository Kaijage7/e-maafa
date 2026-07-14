package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Honest national-system integration surface for NBS / NIDA / LATRA / NAPA.
 *
 * <p>Provides catalogues, contracts, and handoff payloads only. Does <b>not</b> call live
 * external registries. Marks status live only after MoU + dual-proved adapter (ops, not code).</p>
 */
public interface NationalIntegrationService {

    /** All institution adapters with honesty flags and available actions. */
    Map<String, Object> catalogue();

    /** Registry row + recent messages + contract summary for one system. */
    Map<String, Object> status(String systemCode);

    /** Machine-readable payload contract for future live adapter. */
    Map<String, Object> contract(String systemCode);

    /**
     * NBS — population bulk-reference request package for agreed file/API handoff.
     * Includes interim INFORM population-related scores (honestly labelled), not NBS census rows.
     */
    Map<String, Object> nbsPopulationRequest(String areaLevel, Integer limit);

    /**
     * NIDA — verify-only request. Hashes NIN; never persists raw national ID.
     * Does not call NIDA; returns outbound package for future adapter.
     */
    Map<String, Object> nidaVerifyRequest(Map<String, Object> body);

    /**
     * LATRA — logistics exposure snapshot from DMIS assets (warehouses, infrastructure, ECs)
     * plus request shape for future corridor/closure feed.
     */
    Map<String, Object> latraLogisticsSnapshot(String district, Integer limit);

    /**
     * NAPA — strategic/recovery programme map export for external identity linkage.
     */
    Map<String, Object> napaProgrammeMapExport(Integer limit);
}
