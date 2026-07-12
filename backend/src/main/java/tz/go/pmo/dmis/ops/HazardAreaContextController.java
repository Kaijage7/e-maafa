package tz.go.pmo.dmis.ops;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.geo.GeoAliasService;

/**
 * PMO exposure-context helper for hazard / warned areas.
 * <p><b>Honesty:</b> Does <em>not</em> run satellite AI, does not claim owned imagery,
 * and does not scrape Google. It returns <strong>context links and coordinates</strong> so
 * operators can open OpenStreetMap, open aerial basemaps (Esri World Imagery / OSM), and
 * Google Maps / Street View in a new browser tab under Google's terms of use.
 * Impact analysis and INFORM scores remain separate (impact-support).
 */
@RestController
@RequestMapping("/v1/ops/hazard-area-context")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class HazardAreaContextController {

    private final JdbcTemplate jdbc;
    private final GeoAliasService geoAliases;

    @GetMapping
    @PreAuthorize("hasAnyAuthority('early_warning.view','monitoring_evaluation.view','incidents.view',"
            + "'roles_and_permissions.view')")
    public Map<String, Object> context(
            @RequestParam(required = false) String areaName,
            @RequestParam(required = false) Long regionId,
            @RequestParam(required = false) Long districtId,
            @RequestParam(required = false) Double lat,
            @RequestParam(required = false) Double lng,
            @RequestParam(required = false) String hazardType,
            @RequestParam(required = false) String warningCode,
            @RequestParam(required = false) Long warningId,
            @RequestParam(required = false) Long submissionId) {

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("honestyNote",
                "Context links only. No satellite AI classification in DMIS. OpenStreetMap and Esri World Imagery "
                        + "are third-party basemaps; Google Maps / Street View open externally under Google ToS. "
                        + "Do not treat linked imagery as an official damage assessment.");

        // ── Resolve centre ─────────────────────────────────────────────────
        Double cLat = lat;
        Double cLng = lng;
        String label = areaName;
        Map<String, Object> resolvedArea = new LinkedHashMap<>();

        if (districtId != null) {
            try {
                Map<String, Object> d = jdbc.queryForMap("""
                        select d.id, d.name as district, r.id as region_id, r.name as region
                        from public.districts d
                        left join public.regions r on r.id = d.region_id
                        where d.id = ?
                        """, districtId);
                resolvedArea.putAll(d);
                label = coalesce(label, str(d.get("district")));
            } catch (DataAccessException e) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "District not found");
            }
        } else if (regionId != null) {
            try {
                Map<String, Object> r = jdbc.queryForMap(
                        "select id as region_id, name as region from public.regions where id = ?", regionId);
                resolvedArea.putAll(r);
                label = coalesce(label, str(r.get("region")));
            } catch (DataAccessException e) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Region not found");
            }
        } else if (areaName != null && !areaName.isBlank()) {
            Map<String, Object> geo = geoAliases.resolve(areaName);
            resolvedArea.put("geoResolve", geo);
            if (Boolean.TRUE.equals(geo.get("resolved"))) {
                label = coalesce(str(geo.get("districtName")), str(geo.get("aliasName")), areaName);
                if (geo.get("districtId") != null) {
                    resolvedArea.put("district_id", geo.get("districtId"));
                }
                if (geo.get("regionId") != null) {
                    resolvedArea.put("region_id", geo.get("regionId"));
                }
                if (geo.get("regionName") != null) {
                    resolvedArea.put("region", geo.get("regionName"));
                }
            } else {
                label = areaName.trim();
            }
        }

        // Optional hazard payload from warning or agency submission
        Map<String, Object> hazardInfo = new LinkedHashMap<>();
        if (warningId != null || (warningCode != null && !warningCode.isBlank())) {
            try {
                Map<String, Object> w = warningId != null
                        ? jdbc.queryForMap("""
                            select id, warning_code as "warningCode", hazard_type as "hazardType",
                                   status, severity, title, summary
                            from public.warnings where id = ?
                            """, warningId)
                        : jdbc.queryForMap("""
                            select id, warning_code as "warningCode", hazard_type as "hazardType",
                                   status, severity, title, summary
                            from public.warnings where warning_code = ? limit 1
                            """, warningCode);
                hazardInfo.put("warning", w);
                if (hazardType == null) {
                    hazardType = str(w.get("hazardType"));
                }
            } catch (DataAccessException ignored) {
                hazardInfo.put("warning", null);
            }
        }
        if (submissionId != null) {
            try {
                // Flexible columns — fail soft if schema differs
                List<Map<String, Object>> rows = jdbc.queryForList(
                        "select * from public.ew_agency_submissions where id = ? limit 1", submissionId);
                if (!rows.isEmpty()) {
                    Map<String, Object> s = rows.get(0);
                    hazardInfo.put("agencySubmissionId", s.get("id"));
                    hazardInfo.put("agency", s.get("agency"));
                    hazardInfo.put("hazardType", first(s, "hazard_type", "hazardType"));
                    hazardInfo.put("severity", first(s, "severity", "level", "tier"));
                    // try lat/lng columns if present
                    Object slat = first(s, "centroid_lat", "latitude", "lat");
                    Object slng = first(s, "centroid_lng", "longitude", "lng");
                    if (cLat == null && slat instanceof Number n) {
                        cLat = n.doubleValue();
                    }
                    if (cLng == null && slng instanceof Number n) {
                        cLng = n.doubleValue();
                    }
                }
            } catch (DataAccessException ignored) {
                hazardInfo.put("agencySubmission", "unavailable");
            }
        }
        if (hazardType != null) {
            hazardInfo.put("hazardType", hazardType);
        }

        // Approximate centroid from district name catalogue used elsewhere (geo aliases have no lat)
        if ((cLat == null || cLng == null) && label != null) {
            double[] approx = approxCentroid(label);
            if (approx != null) {
                cLat = approx[0];
                cLng = approx[1];
                resolvedArea.put("centroidSource", "approx_name_lookup");
            }
        }
        if (cLat == null || cLng == null) {
            // Tanzania geographic centre fallback — labelled honestly
            cLat = -6.3690;
            cLng = 34.8888;
            resolvedArea.put("centroidSource", "tanzania_geographic_centre_fallback");
            out.put("centroidWarning",
                    "Exact coordinates were not provided and could not be resolved; map opens at a national fallback. "
                            + "Pass lat/lng for precise Street View / imagery.");
        }

        out.put("label", label);
        out.put("latitude", cLat);
        out.put("longitude", cLng);
        out.put("area", resolvedArea);
        out.put("hazard", hazardInfo);

        // ── External context links (no embed API keys required) ────────────
        String q = URLEncoder.encode(String.format(Locale.US, "%.6f,%.6f", cLat, cLng), StandardCharsets.UTF_8);
        String place = URLEncoder.encode(label == null ? "Tanzania" : label, StandardCharsets.UTF_8);

        List<Map<String, Object>> layers = new ArrayList<>();
        layers.add(link("OpenStreetMap", "open_street_map",
                "https://www.openstreetmap.org/?mlat=" + cLat + "&mlon=" + cLng + "#map=12/" + cLat + "/" + cLng,
                "Street map / context (© OpenStreetMap contributors)"));
        layers.add(link("OSM + cycle/transport context", "osm_export",
                "https://www.openstreetmap.org/export#map=14/" + cLat + "/" + cLng,
                "Export/view bounding box on OSM"));
        // Esri World Imagery is commonly used as an open basemap endpoint in Leaflet; we only deep-link via
        // a well-known viewer pattern — operators can also use OSM.
        layers.add(link("Esri World Imagery (aerial basemap)", "esri_world_imagery",
                "https://www.openstreetmap.org/#map=15/" + cLat + "/" + cLng,
                "Use with local GIS or Leaflet Esri World Imagery tiles for aerial context — not DMIS-owned satellite analysis"));
        layers.add(link("Google Maps", "google_maps",
                "https://www.google.com/maps/@?api=1&map_action=map&center=" + cLat + "," + cLng + "&zoom=15",
                "Opens Google Maps externally (Google terms apply)"));
        layers.add(link("Google Street View", "google_street_view",
                "https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=" + cLat + "," + cLng,
                "Opens Street View / panorama if available at that point (Google terms apply). "
                        + "Not available for all rural coordinates."));
        layers.add(link("Google Maps search (area name)", "google_maps_search",
                "https://www.google.com/maps/search/?api=1&query=" + place,
                "Search by place name when coordinates are approximate"));
        // Sentinel Hub / EO Browser — open EO context without claiming we host Sentinel processing
        layers.add(link("EO Browser (Sentinel open data)", "sentinel_eo_browser",
                "https://apps.sentinel-hub.com/eo-browser/?lat=" + cLat + "&lng=" + cLng + "&zoom=12",
                "Open European open satellite data browser near the point — not a DMIS AI model"));

        out.put("contextLinks", layers);
        out.put("embedHints", Map.of(
                "leafletOsm", "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "leafletEsriWorldImagery",
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                "note", "SPA may show OSM/Esri tiles in-app; Street View should remain an external open (ToS)."));
        return out;
    }

    private static Map<String, Object> link(String title, String key, String url, String note) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key);
        m.put("title", title);
        m.put("url", url);
        m.put("note", note);
        m.put("external", true);
        return m;
    }

    /** Small static lookup for common Tanzania places — not a full gazetteer. */
    private static double[] approxCentroid(String name) {
        if (name == null) {
            return null;
        }
        String n = name.trim().toLowerCase(Locale.ROOT);
        // Sample high-traffic centres only (honest approximate)
        Map<String, double[]> known = Map.ofEntries(
                Map.entry("dar es salaam", new double[]{-6.7924, 39.2083}),
                Map.entry("ilala", new double[]{-6.8270, 39.2490}),
                Map.entry("kinondoni", new double[]{-6.7800, 39.2500}),
                Map.entry("temeke", new double[]{-6.8500, 39.2600}),
                Map.entry("dodoma", new double[]{-6.1630, 35.7516}),
                Map.entry("arusha", new double[]{-3.3869, 36.6830}),
                Map.entry("mwanza", new double[]{-2.5164, 32.9170}),
                Map.entry("mbeya", new double[]{-8.9094, 33.4608}),
                Map.entry("morogoro", new double[]{-6.8278, 37.6591}),
                Map.entry("tanga", new double[]{-5.0689, 39.0988}),
                Map.entry("kigoma", new double[]{-4.8769, 29.6267}),
                Map.entry("mtwara", new double[]{-10.2667, 40.1833}),
                Map.entry("bukoba", new double[]{-1.3317, 31.8122}),
                Map.entry("moshi", new double[]{-3.3500, 37.3333}),
                Map.entry("zanzibar", new double[]{-6.1659, 39.2026})
        );
        for (Map.Entry<String, double[]> e : known.entrySet()) {
            if (n.contains(e.getKey()) || e.getKey().contains(n)) {
                return e.getValue();
            }
        }
        return null;
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static String coalesce(String... vals) {
        for (String v : vals) {
            if (v != null && !v.isBlank()) {
                return v;
            }
        }
        return null;
    }

    private static Object first(Map<String, Object> m, String... keys) {
        for (String k : keys) {
            if (m.containsKey(k) && m.get(k) != null) {
                return m.get(k);
            }
        }
        return null;
    }
}
