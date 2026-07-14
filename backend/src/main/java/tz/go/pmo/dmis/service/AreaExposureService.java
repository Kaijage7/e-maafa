package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Best-effort area exposure from live DMIS data (INFORM structural + preparedness/response assets).
 *
 * <p>Does <b>not</b> claim flood-footprint ∩ population, satellite scene SoR, or live NBS/NIDA
 * registry feeds. Those remain deferred / planned integration.</p>
 */
public interface AreaExposureService {

    /**
     * Full exposure pack for one place name (district/council free text).
     * Resolves INFORM + evacuation centres + warehouses + inventory + open incidents + infrastructure.
     */
    Map<String, Object> areaExposure(String name);

    /**
     * Multi-area readiness/exposure rollup from live assets (optional region filter).
     */
    Map<String, Object> summary(String region, Integer limit);
}
