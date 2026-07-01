package tz.go.pmo.dmis.common.geo;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

/**
 * Region centroid lookup, loaded once from {@code /ew/region_centroids.json} (the same file the EW module
 * uses so "a warned region with no point gets its real centroid so the portal map plots it"). Reused by any
 * feature that needs to give a region-scoped record a map location when it has no explicit coordinates —
 * e.g. an incident raised from a coordinate-less scanner detection, or pushed to the public map.
 */
@Component
public class RegionCentroids {

    private final Map<String, double[]> byName = new HashMap<>();

    public RegionCentroids(ObjectMapper json) {
        try (var in = RegionCentroids.class.getResourceAsStream("/ew/region_centroids.json")) {
            if (in != null) {
                Map<String, Map<String, Object>> raw = json.readValue(in, new TypeReference<Map<String, Map<String, Object>>>() { });
                raw.forEach((key, v) -> {
                    Object lat = v.get("lat");
                    Object lng = v.get("lng");
                    if (lat instanceof Number la && lng instanceof Number lo) {
                        byName.put(key.toLowerCase(Locale.ROOT), new double[] { la.doubleValue(), lo.doubleValue() });
                    }
                });
            }
        } catch (Exception ignored) {
            // A missing/garbled centroid file simply means no fallback location — callers handle null.
        }
    }

    /** {@code [lat, lng]} for a region name (case-insensitive), or {@code null} if the region is unknown. */
    public double[] forRegion(String regionName) {
        if (regionName == null || regionName.isBlank()) {
            return null;
        }
        return byName.get(regionName.trim().toLowerCase(Locale.ROOT));
    }
}
