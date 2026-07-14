package tz.go.pmo.dmis.service.impl;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.geo.GeoAliasService;
import tz.go.pmo.dmis.service.HazardAreaContextService;

/**
 * PMO exposure-context helper — context links and coordinates only (no satellite AI).
 * Logic in service.impl (eGA). Path {@code GET /v1/ops/hazard-area-context} unchanged.
 * Warning lookup uses real {@code warnings} + {@code warning_hazards} columns (productive).
 */
@Service
public class HazardAreaContextServiceImpl implements HazardAreaContextService {



    private final JdbcTemplate jdbc;
    private final GeoAliasService geoAliases;

    public HazardAreaContextServiceImpl(JdbcTemplate jdbc, GeoAliasService geoAliases) {
        this.jdbc = jdbc;
        this.geoAliases = geoAliases;
    }

    @Override
    public Map<String, Object> context(
            String areaName,
            Long regionId,
            Long districtId,
            Double lat,
            Double lng,
            String hazardType,
            String warningCode,
            Long warningId,
            Long submissionId) {

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("honestyNote",
                "Context links only. No satellite AI classification in DMIS. OpenStreetMap and Esri World Imagery "
                        + "are third-party basemaps; Google Maps / Street View open externally under Google ToS. "
                        + "Do not treat linked imagery as an official damage assessment.");

        // Absolute geographic validity when either coordinate is supplied.
        if (lat != null || lng != null) {
            if (lat == null || lng == null
                    || lat.isNaN() || lng.isNaN() || lat.isInfinite() || lng.isInfinite()
                    || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                throw new BusinessRuleException("lat must be between -90 and 90, lng between -180 and 180 (both required when either is set).");
            }
        }

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
            // public.warnings has no hazard_type/severity columns — join warning_hazards (productive).
            try {
                Map<String, Object> w;
                if (warningId != null) {
                    w = jdbc.queryForMap("""
                        select w.id, w.warning_code as "warningCode", w.status,
                               (select h.name from public.warning_hazards wh
                                  join public.hazards h on h.id = wh.hazard_id
                                 where wh.warning_id = w.id and wh.deleted_at is null
                                 order by wh.id limit 1) as "hazardType",
                               (select wh.warning_level from public.warning_hazards wh
                                 where wh.warning_id = w.id and wh.deleted_at is null
                                 order by wh.id limit 1) as severity
                          from public.warnings w
                         where w.id = ? and w.deleted_at is null
                        """, warningId);
                } else {
                    w = jdbc.queryForMap("""
                        select w.id, w.warning_code as "warningCode", w.status,
                               (select h.name from public.warning_hazards wh
                                  join public.hazards h on h.id = wh.hazard_id
                                 where wh.warning_id = w.id and wh.deleted_at is null
                                 order by wh.id limit 1) as "hazardType",
                               (select wh.warning_level from public.warning_hazards wh
                                 where wh.warning_id = w.id and wh.deleted_at is null
                                 order by wh.id limit 1) as severity
                          from public.warnings w
                         where w.warning_code = ? and w.deleted_at is null
                         limit 1
                        """, warningCode);
                }
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
                    // Real columns: hazard_types (json), top_alert (not hazard_type/severity).
                    Object ht = first(s, "hazard_types", "hazard_type", "hazardType");
                    hazardInfo.put("hazardType", ht != null ? String.valueOf(ht) : null);
                    hazardInfo.put("severity", first(s, "top_alert", "severity", "level", "tier"));
                    hazardInfo.put("warningCode", s.get("warning_code"));
                    hazardInfo.put("regions", s.get("regions"));
                    // try lat/lng columns if present (not on current schema — keep soft)
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
        // ── Street / admin ────────────────────────────────────────────────
        layers.add(link("OpenStreetMap", "open_street_map",
                "https://www.openstreetmap.org/?mlat=" + cLat + "&mlon=" + cLng + "#map=12/" + cLat + "/" + cLng,
                "Street map / context (© OpenStreetMap contributors)"));
        layers.add(link("OSM export / bbox", "osm_export",
                "https://www.openstreetmap.org/export#map=14/" + cLat + "/" + cLng,
                "Export/view bounding box on OSM"));
        layers.add(link("OpenTopoMap (relief)", "opentopomap",
                "https://www.opentopomap.org/#map=12/" + cLat + "/" + cLng,
                "Open topographic basemap for terrain context — third-party tiles"));
        // Esri World Imagery tiles are open for basemap use; deep-link to public viewer (not DMIS AI).
        layers.add(link("Esri World Imagery (aerial basemap)", "esri_world_imagery",
                "https://www.arcgis.com/home/webmap/viewer.html?center=" + cLng + "," + cLat + "&level=15"
                        + "&basemapUrl=https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
                "Aerial/satellite basemap via Esri World Imagery — not DMIS-owned analysis; third-party ToS apply"));
        // ── Buildings / near-current structure detail (external ToS — not embedded) ──
        // Google Earth Web typically shows roofs/buildings with the freshest commercial imagery.
        layers.add(link("Google Earth (buildings · near-current)", "google_earth",
                String.format(Locale.US,
                        "https://earth.google.com/web/@%.6f,%.6f,600a,2500d,35y,0h,45t,0r", cLat, cLng),
                "Best buildings/3D structures view — opens Google Earth Web externally (Google ToS). "
                        + "Not DMIS-owned; not damage AI; not embedded."));
        layers.add(link("Google Maps satellite (high zoom)", "google_maps_satellite",
                String.format(Locale.US,
                        "https://www.google.com/maps/@%.6f,%.6f,18z/data=!3m1!1e3", cLat, cLng),
                "Google Maps satellite basemap at high zoom for roofs/structures (Google ToS)"));
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
        layers.add(link("Mapillary (open street-level)", "mapillary",
                "https://www.mapillary.com/app/?lat=" + cLat + "&lng=" + cLng + "&z=14",
                "Open street-level imagery if available — not a Google Street View substitute"));
        // ── Open EO / international space assets (human review only) ─────
        layers.add(link("EO Browser (Sentinel open data)", "sentinel_eo_browser",
                "https://apps.sentinel-hub.com/eo-browser/?lat=" + cLat + "&lng=" + cLng + "&zoom=12",
                "European open satellite data browser — not a DMIS AI model"));
        // Prefer yesterday for daily true-colour (today may still be incomplete NRT)
        String day = java.time.LocalDate.now(java.time.ZoneOffset.UTC).minusDays(1).toString();
        String wvBox = String.format(Locale.US, "%.4f,%.4f,%.4f,%.4f",
                cLng - 1.2, cLat - 0.9, cLng + 1.2, cLat + 0.9);
        layers.add(link("NASA Worldview (daily true-colour timeline)", "nasa_worldview",
                "https://worldview.earthdata.nasa.gov/?v=" + wvBox
                        + "&t=" + day
                        + "&l=MODIS_Terra_CorrectedReflectance_TrueColor,Coastlines_15m",
                "NASA GIBS temporal browser — scrub days, animate, compare. Not DMIS AI classification."));
        layers.add(link("NASA Worldview compare / swipe", "nasa_worldview_compare",
                "https://worldview.earthdata.nasa.gov/?v=" + wvBox
                        + "&t=" + day
                        + "&l=MODIS_Terra_CorrectedReflectance_TrueColor,Coastlines_15m&ca=true",
                "Side-by-side / swipe date comparison for before-after exposure judgement"));
        layers.add(link("Copernicus Browser", "copernicus_browser",
                "https://browser.dataspace.copernicus.eu/?lat=" + cLat + "&lng=" + cLng + "&zoom=10",
                "EU Copernicus open data browser — products external until EMS MoU dual-proved"));
        // ── Multi-hazard situational awareness (open portals) ────────────
        layers.add(link("GDACS global disaster alerts", "gdacs",
                "https://www.gdacs.org/",
                "UN/EU multi-hazard alert overview — contextual only, not Tanzania SoR"));
        layers.add(link("ReliefWeb Tanzania", "reliefweb_tz",
                "https://reliefweb.int/country/tza",
                "OCHA humanitarian reports for Tanzania — external situational context"));

        out.put("contextLinks", layers);
        out.put("internationalNote",
                "Impact Analysis in e-MAAFA intentionally exceeds a single-agency bulletin: dual basemap "
                        + "(map/satellite), INFORM dimensions, entity bus, evacuation routing, Action Guide "
                        + "composition, and open international EO/context links — without inventing national "
                        + "API green lights or satellite damage AI.");
        out.put("embedHints", Map.of(
                "leafletOsm", "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "leafletEsriWorldImagery",
                "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
                "leafletCartoLight",
                "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
                "leafletCartoLabels",
                "https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png",
                "note", "SPA may show OSM/Esri/Carto tiles in-app; Street View / Google remain external (ToS)."));
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
