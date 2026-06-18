package tz.go.pmo.dmis.mitigation;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * The choropleth region-data builder both MitigationController@index and GisMapController@index
 * duplicate — region centers and matching logic copied verbatim (exact name match on
 * district_council/location_name first, closest-center fallback; measures counted from the
 * coverage_area JSON's Region/Regions/Priority_regions keys, national scope counts everywhere).
 */
@Component
@RequiredArgsConstructor
public class RegionDataBuilder {

    /** All 31 region centers (26 mainland + the 5 Zanzibar regions, so choropleth/matching never drop them). */
    static final Map<String, double[]> REGION_CENTERS = new LinkedHashMap<>() {{
        put("Dar es Salaam", new double[]{-6.79, 39.28}); put("Arusha", new double[]{-3.39, 36.68});
        put("Dodoma", new double[]{-6.16, 35.75}); put("Mbeya", new double[]{-8.91, 33.46});
        put("Kilimanjaro", new double[]{-3.23, 37.33}); put("Tanga", new double[]{-5.07, 39.10});
        put("Mwanza", new double[]{-2.52, 32.90}); put("Morogoro", new double[]{-6.82, 37.66});
        put("Iringa", new double[]{-7.77, 35.69}); put("Kagera", new double[]{-1.50, 31.60});
        put("Kigoma", new double[]{-4.88, 29.63}); put("Lindi", new double[]{-10.00, 39.71});
        put("Mara", new double[]{-1.68, 34.15}); put("Mtwara", new double[]{-10.27, 40.19});
        put("Pwani", new double[]{-7.32, 38.83}); put("Rukwa", new double[]{-8.00, 31.44});
        put("Ruvuma", new double[]{-10.68, 35.70}); put("Shinyanga", new double[]{-3.66, 33.42});
        put("Singida", new double[]{-4.82, 34.74}); put("Tabora", new double[]{-5.08, 32.83});
        put("Manyara", new double[]{-4.58, 35.83}); put("Njombe", new double[]{-9.33, 34.77});
        put("Geita", new double[]{-2.87, 32.23}); put("Simiyu", new double[]{-3.03, 34.15});
        put("Katavi", new double[]{-6.42, 31.27}); put("Songwe", new double[]{-8.68, 33.28});
        // Zanzibar (Unguja + Pemba) — were missing, so any Zanzibar assessment/measure was silently dropped.
        put("Mjini Magharibi", new double[]{-6.16, 39.20}); put("Kaskazini Unguja", new double[]{-5.93, 39.30});
        put("Kusini Unguja", new double[]{-6.32, 39.41}); put("Kaskazini Pemba", new double[]{-4.92, 39.70});
        put("Kusini Pemba", new double[]{-5.27, 39.74});
    }};

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public Map<String, Map<String, Object>> build() {
        Map<String, Map<String, Object>> regionData = new LinkedHashMap<>();
        try {
            List<Map<String, Object>> assessments = jdbc.queryForList(
                    "select risk_level, latitude, longitude, location_name, district_council "
                            + "from public.risk_assessments where latitude is not null and longitude is not null");
            for (Map<String, Object> a : assessments) {
                double lat = ((Number) a.get("latitude")).doubleValue();
                double lng = ((Number) a.get("longitude")).doubleValue();
                String bestRegion = null;
                String dc = lower(a.get("district_council"));
                String ln = lower(a.get("location_name"));
                for (String rName : REGION_CENTERS.keySet()) {
                    String needle = rName.toLowerCase(Locale.ROOT);
                    if (dc.contains(needle) || ln.contains(needle)) {
                        bestRegion = rName;
                        break;
                    }
                }
                if (bestRegion == null) {
                    double bestDist = Double.MAX_VALUE;
                    for (Map.Entry<String, double[]> e : REGION_CENTERS.entrySet()) {
                        double d = Math.pow(lat - e.getValue()[0], 2) + Math.pow(lng - e.getValue()[1], 2);
                        if (d < bestDist) {
                            bestDist = d;
                            bestRegion = e.getKey();
                        }
                    }
                }
                Map<String, Object> rd = regionData.computeIfAbsent(bestRegion, k -> emptyEntry());
                inc(rd, "assessments");
                String lvl = lower(a.get("risk_level"));
                if (lvl.contains("high")) {
                    inc(rd, "high");
                } else if (lvl.contains("medium")) {
                    inc(rd, "medium");
                } else if (lvl.contains("low")) {
                    inc(rd, "low");
                }
            }

            List<Map<String, Object>> measures = jdbc.queryForList(
                    "select coverage_area from public.mitigation_measures where coverage_area is not null");
            for (Map<String, Object> m : measures) {
                Map<String, Object> cov = parseMap(String.valueOf(m.get("coverage_area")));
                if (cov.isEmpty()) {
                    continue;
                }
                java.util.List<String> covRegions = new java.util.ArrayList<>();
                if (cov.get("Region") instanceof String s && !s.isBlank()) {
                    covRegions.add(s);
                }
                addAll(covRegions, cov.get("Regions"));
                addAll(covRegions, cov.get("Priority_regions"));
                for (String rn : covRegions) {
                    rn = rn.trim();
                    if (REGION_CENTERS.containsKey(rn)) {
                        inc(regionData.computeIfAbsent(rn, k -> emptyEntry()), "measures");
                    }
                }
                Object scope = cov.get("Geographic_scope");
                if (scope instanceof String s && s.equalsIgnoreCase("national")) {
                    for (String rn : REGION_CENTERS.keySet()) {
                        inc(regionData.computeIfAbsent(rn, k -> emptyEntry()), "measures");
                    }
                }
            }

            for (Map<String, Object> rd : regionData.values()) {
                if ((int) rd.get("high") > 0) {
                    rd.put("riskLevel", "High");
                } else if ((int) rd.get("medium") > 0) {
                    rd.put("riskLevel", "Medium");
                } else if ((int) rd.get("low") > 0) {
                    rd.put("riskLevel", "Low");
                } else if ((int) rd.get("measures") > 0) {
                    rd.put("riskLevel", "Active");
                }
            }
        } catch (Exception e) {
            return new LinkedHashMap<>();
        }
        return regionData;
    }

    private static Map<String, Object> emptyEntry() {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("assessments", 0);
        entry.put("high", 0);
        entry.put("medium", 0);
        entry.put("low", 0);
        entry.put("hazards", 0);
        entry.put("measures", 0);
        entry.put("riskLevel", "None");
        return entry;
    }

    private static void inc(Map<String, Object> entry, String key) {
        entry.put(key, (int) entry.get(key) + 1);
    }

    private static void addAll(List<String> target, Object value) {
        if (value instanceof List<?> list) {
            for (Object v : list) {
                if (v != null) {
                    target.add(v.toString());
                }
            }
        } else if (value instanceof String s && !s.isBlank()) {
            target.add(s);
        }
    }

    private static String lower(Object value) {
        return value == null ? "" : value.toString().toLowerCase(Locale.ROOT);
    }

    private Map<String, Object> parseMap(String json) {
        try {
            return objectMapper.readValue(json, new TypeReference<Map<String, Object>>() { });
        } catch (Exception e) {
            return Map.of();
        }
    }
}
