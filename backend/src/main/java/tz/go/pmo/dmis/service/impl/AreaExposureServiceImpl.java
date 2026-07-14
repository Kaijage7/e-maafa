package tz.go.pmo.dmis.service.impl;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.geo.GeoAliasService;
import tz.go.pmo.dmis.inform.domain.HazardSignal;
import tz.go.pmo.dmis.inform.domain.InformService;
import tz.go.pmo.dmis.inform.engine.RiskResult;
import tz.go.pmo.dmis.service.AreaExposureService;

/**
 * Best-effort exposure from live INFORM + DMIS preparedness/response assets.
 * Honest about gaps: no satellite footprint∩population, no live NBS/NIDA feeds.
 */
@Service
public class AreaExposureServiceImpl implements AreaExposureService {

    private final JdbcTemplate jdbc;
    private final InformService informService;
    private final GeoAliasService geoAliases;

    public AreaExposureServiceImpl(JdbcTemplate jdbc, InformService informService, GeoAliasService geoAliases) {
        this.jdbc = jdbc;
        this.informService = informService;
        this.geoAliases = geoAliases;
    }

    @Override
    public Map<String, Object> areaExposure(String name) {
        if (name == null || name.isBlank()) {
            throw new BusinessRuleException("name is required (district or council free text)");
        }
        String query = name.trim();
        if (query.length() < 2 || query.length() > 120) {
            throw new BusinessRuleException("name length must be between 2 and 120 characters");
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("query", query);
        out.put("honesty", honesty());
        out.put("generatedAt", java.time.OffsetDateTime.now().toString());

        // ── resolve INFORM area ──
        ResolvedArea area = resolveInformArea(query);
        out.put("resolved", area == null ? null : area.toMap());
        out.put("informMatched", area != null);

        Map<String, Object> structural = new LinkedHashMap<>();
        Map<String, Object> institutionProxies = new LinkedHashMap<>();
        if (area != null) {
            try {
                RiskResult rr = informService.riskFor(area.code);
                List<HazardSignal> signals = informService.signalsFor(area.code);
                structural.put("source", "INFORM live values");
                structural.put("areaCode", area.code);
                structural.put("areaName", area.name);
                structural.put("level", area.level);
                structural.put("risk", rr.risk());
                structural.put("hazard", rr.hazard());
                structural.put("vulnerability", rr.vulnerability());
                structural.put("coping", rr.coping());
                structural.put("components", rr.component());
                structural.put("categories", rr.category());
                List<Map<String, Object>> sigs = new ArrayList<>();
                for (HazardSignal s : signals) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("component", s.component());
                    row.put("signal", s.signal());
                    row.put("status", s.status());
                    row.put("reliability", s.reliability());
                    row.put("coveragePct", s.coveragePct());
                    sigs.add(row);
                }
                structural.put("hazardSignals", sigs);
                structural.put("available", true);

                // Honest institution proxies (same composition as impact-support)
                institutionProxies.put("NBS", proxy("population / habitat / wealth",
                        mean(rr, "Habitat", "Economic capacity", "Development & Poverty"),
                        "INFORM proxy — NBS census feed not live"));
                institutionProxies.put("NIDA", proxy("vulnerable groups / health / habitat",
                        mean(rr, "Children Health and Nutrition", "Displaced People", "Health Conditions", "Habitat"),
                        "INFORM proxy — NIDA registry not live; NIDA is verify-only not population"));
                institutionProxies.put("LATRA", proxy("access & communications",
                        mean(rr, "Communication", "Access to health care"),
                        "INFORM proxy — LATRA corridor feed not live"));
                institutionProxies.put("NAPA", proxy("livelihoods / poverty / drought stress",
                        mean(rr, "Livelihoods", "Development & Poverty", "Drought"),
                        "INFORM proxy — NAPA programme map is export-only"));
                institutionProxies.put("IFMI", proxy("economic dependency / capacity",
                        mean(rr, "Economic Dependency", "Economic capacity"),
                        "INFORM proxy — IFMIS commitment export separate (finance)"));
            } catch (Exception e) {
                structural.put("available", false);
                structural.put("error", e.getMessage());
            }
        } else {
            structural.put("available", false);
            structural.put("note", "No INFORM area matched — physical DMIS assets still listed if name matches");
        }
        out.put("structuralExposure", structural);
        out.put("institutionExposure", institutionProxies);

        // ── physical assets (live DMIS) ──
        Map<String, Object> physical = loadPhysical(query, area == null ? null : area.name);
        out.put("physicalExposure", physical);

        // ── coverage verdict ──
        out.put("coverage", coverageVerdict(structural, physical, institutionProxies));
        return out;
    }

    @Override
    public Map<String, Object> summary(String region, Integer limit) {
        int lim = limit == null || limit < 1 ? 40 : Math.min(limit, 200);
        String reg = region == null ? null : region.trim();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("honesty", honesty());
        out.put("regionFilter", reg);
        out.put("limit", lim);

        List<Map<String, Object>> rows = new ArrayList<>();
        try {
            String sql = """
                    with ec as (
                        select lower(trim(coalesce(district, ''))) as dkey,
                               max(district) as district,
                               max(region) as region,
                               count(*)::int as centres,
                               coalesce(sum(capacity_people),0)::int as capacity
                        from public.evacuation_centers
                        where coalesce(district, '') <> ''
                          and lower(coalesce(status,'active')) not in ('inactive','closed','decommissioned')
                        group by 1
                    ),
                    inc as (
                        select lower(trim(coalesce(district_name, ''))) as dkey,
                               count(*)::int as open_incidents
                        from public.incidents
                        where coalesce(is_simulation,false)=false
                          and lower(coalesce(status,'')) not in ('closed','resolved','cancelled','closed_rumor')
                          and coalesce(district_name,'') <> ''
                        group by 1
                    ),
                    wh as (
                        select lower(trim(coalesce(d.name, w.city_or_region, ''))) as dkey,
                               count(*)::int as warehouses,
                               coalesce(sum(w.storage_capacity_sqm),0)::bigint as storage_sqm
                        from public.warehouses w
                        left join public.districts d on d.id = w.district_id
                        where lower(coalesce(w.operational_status,'')) not in ('closed','decommissioned')
                        group by 1
                    )
                    select coalesce(ec.district, wh.dkey, inc.dkey) as district,
                           ec.region,
                           coalesce(ec.centres, 0) as "evacuationCentres",
                           coalesce(ec.capacity, 0) as "evacuationCapacity",
                           coalesce(wh.warehouses, 0) as warehouses,
                           coalesce(wh.storage_sqm, 0) as "warehouseStorageSqm",
                           coalesce(inc.open_incidents, 0) as "openIncidents"
                    from ec
                    full outer join wh on wh.dkey = ec.dkey
                    full outer join inc on inc.dkey = coalesce(ec.dkey, wh.dkey)
                    where coalesce(ec.dkey, wh.dkey, inc.dkey) <> ''
                    """;
            List<Object> args = new ArrayList<>();
            if (reg != null && !reg.isBlank()) {
                sql += " and lower(coalesce(ec.region, '')) like lower(?) ";
                args.add("%" + reg + "%");
            }
            sql += """
                    order by coalesce(ec.capacity,0) desc, coalesce(inc.open_incidents,0) desc, district
                    limit ?
                    """;
            args.add(lim);
            rows = jdbc.queryForList(sql, args.toArray());
        } catch (DataAccessException e) {
            out.put("error", e.getMessage());
        }

        // Attach INFORM risk when we can match by name (best effort, capped)
        for (Map<String, Object> row : rows) {
            String d = String.valueOf(row.get("district"));
            ResolvedArea a = resolveInformArea(d);
            if (a != null) {
                try {
                    RiskResult rr = informService.riskFor(a.code);
                    row.put("informAreaCode", a.code);
                    row.put("informRisk", rr.risk());
                    row.put("informHazard", rr.hazard());
                    row.put("informVulnerability", rr.vulnerability());
                    row.put("informCoping", rr.coping());
                } catch (Exception ignored) {
                    row.put("informMatched", false);
                }
            } else {
                row.put("informMatched", false);
            }
        }

        out.put("areas", rows);
        out.put("count", rows.size());
        out.put("nationalAssetTotals", nationalTotals());
        out.put("note",
                "Physical columns are live DMIS registers. INFORM columns are structural risk — "
                        + "not people-under-flood-footprint. Institution feeds remain proxy/planned.");
        return out;
    }

    // ── internals ────────────────────────────────────────────────────────────

    private Map<String, Object> loadPhysical(String query, String resolvedName) {
        Map<String, Object> phys = new LinkedHashMap<>();
        phys.put("source", "DMIS live registers");
        phys.put("footprintIntersection", false);
        phys.put("satellite", false);

        String like = "%" + query + "%";
        String like2 = resolvedName == null || resolvedName.isBlank() ? like : "%" + resolvedName + "%";

        try {
            List<Map<String, Object>> centres = jdbc.queryForList("""
                    select id, ecentre_id as "ecentreId", centre_name as "centreName",
                           centre_type as "centreType", region, district, council,
                           capacity_people as "capacityPeople", status, latitude, longitude
                    from public.evacuation_centers
                    where lower(coalesce(district,'')) like lower(?)
                       or lower(coalesce(region,'')) like lower(?)
                       or lower(coalesce(council,'')) like lower(?)
                       or lower(coalesce(centre_name,'')) like lower(?)
                       or lower(coalesce(district,'')) like lower(?)
                    order by capacity_people desc nulls last
                    limit 50
                    """, like, like, like, like, like2);
            int cap = centres.stream()
                    .mapToInt(r -> r.get("capacityPeople") instanceof Number n ? n.intValue() : 0)
                    .sum();
            phys.put("evacuationCentres", centres);
            phys.put("evacuationCentreCount", centres.size());
            phys.put("evacuationCapacityPeople", cap);

            List<Map<String, Object>> warehouses = jdbc.queryForList("""
                    select w.id, w.name, w.zone, w.operational_status as "operationalStatus",
                           w.storage_capacity_sqm as "storageCapacitySqm", w.capacity,
                           w.latitude, w.longitude, r.name as region, d.name as district
                    from public.warehouses w
                    left join public.regions r on r.id = w.region_id
                    left join public.districts d on d.id = w.district_id
                    where lower(coalesce(d.name, '')) like lower(?)
                       or lower(coalesce(r.name, '')) like lower(?)
                       or lower(coalesce(w.city_or_region, '')) like lower(?)
                       or lower(coalesce(w.name, '')) like lower(?)
                       or lower(coalesce(d.name, '')) like lower(?)
                    order by w.id
                    limit 50
                    """, like, like, like, like, like2);
            phys.put("warehouses", warehouses);
            phys.put("warehouseCount", warehouses.size());

            // Inventory linked to matched warehouses
            if (!warehouses.isEmpty()) {
                List<Long> ids = warehouses.stream()
                        .map(w -> ((Number) w.get("id")).longValue())
                        .toList();
                String in = String.join(",", ids.stream().map(id -> "?").toList());
                Object[] idArgs = ids.toArray();
                Long stockUnits = jdbc.queryForObject(
                        "select coalesce(sum(quantity),0) from public.inventory_items where warehouse_id in (" + in + ")",
                        Long.class, idArgs);
                Long stockLines = jdbc.queryForObject(
                        "select count(*) from public.inventory_items where warehouse_id in (" + in + ")",
                        Long.class, idArgs);
                phys.put("inventoryStockUnits", stockUnits);
                phys.put("inventoryLines", stockLines);
            } else {
                phys.put("inventoryStockUnits", 0);
                phys.put("inventoryLines", 0);
            }

            List<Map<String, Object>> incidents = jdbc.queryForList("""
                    select id, title, status, severity_level as "severityLevel",
                           region_name as "regionName", district_name as "districtName",
                           hazard_id as "hazardId", created_at as "createdAt"
                    from public.incidents
                    where coalesce(is_simulation,false)=false
                      and lower(coalesce(status,'')) not in ('closed','resolved','cancelled','closed_rumor')
                      and (
                           lower(coalesce(district_name,'')) like lower(?)
                        or lower(coalesce(region_name,'')) like lower(?)
                        or lower(coalesce(district_name,'')) like lower(?)
                      )
                    order by id desc
                    limit 30
                    """, like, like, like2);
            phys.put("openIncidents", incidents);
            phys.put("openIncidentCount", incidents.size());

            List<Map<String, Object>> infra = jdbc.queryForList("""
                    select id, name, type, status, capacity, latitude, longitude,
                           location_description as "locationDescription", address
                    from public.infrastructure_items
                    where lower(coalesce(name,'')) like lower(?)
                       or lower(coalesce(location_description,'')) like lower(?)
                       or lower(coalesce(address,'')) like lower(?)
                    order by id
                    limit 30
                    """, like, like, like);
            // Also include all infra when query matches nothing by name but area is known —
            // national critical assets (bridges/dams) rarely carry district text.
            if (infra.isEmpty()) {
                infra = jdbc.queryForList("""
                        select id, name, type, status, capacity, latitude, longitude,
                               location_description as "locationDescription", address
                        from public.infrastructure_items
                        order by id limit 10
                        """);
                phys.put("infrastructureScope", "national_sample_no_area_match");
            } else {
                phys.put("infrastructureScope", "name_match");
            }
            phys.put("infrastructure", infra);
            phys.put("infrastructureCount", infra.size());

            List<Map<String, Object>> projects = jdbc.queryForList("""
                    select id, entry_id as "entryId", project_name as "projectName",
                           project_sector as "projectSector", project_status as "projectStatus",
                           location, risk_hazard_type as "riskHazardType", elements_at_risk as "elementsAtRisk"
                    from public.strategic_projects
                    where lower(coalesce(location::text, '')) like lower(?)
                       or lower(coalesce(project_name, '')) like lower(?)
                       or lower(coalesce(location::text, '')) like lower(?)
                    order by id desc
                    limit 20
                    """, like, like, like2);
            phys.put("strategicProjects", projects);
            phys.put("strategicProjectCount", projects.size());

        } catch (DataAccessException e) {
            phys.put("error", e.getMessage());
        }

        phys.put("peopleUnderHazardFootprint", null);
        phys.put("peopleUnderHazardFootprintNote",
                "Not computed — requires flood/hazard footprint geometry ∩ population layer (F114 deferred)");
        return phys;
    }

    private Map<String, Object> nationalTotals() {
        Map<String, Object> t = new LinkedHashMap<>();
        try {
            t.put("evacuationCentres", jdbc.queryForObject(
                    "select count(*) from public.evacuation_centers where lower(coalesce(status,'active')) not in ('inactive','closed','decommissioned')",
                    Long.class));
            t.put("evacuationCapacityPeople", jdbc.queryForObject(
                    "select coalesce(sum(capacity_people),0) from public.evacuation_centers where lower(coalesce(status,'active')) not in ('inactive','closed','decommissioned')",
                    Long.class));
            t.put("warehouses", jdbc.queryForObject("select count(*) from public.warehouses", Long.class));
            t.put("inventoryLines", jdbc.queryForObject("select count(*) from public.inventory_items", Long.class));
            t.put("openIncidents", jdbc.queryForObject("""
                    select count(*) from public.incidents
                    where coalesce(is_simulation,false)=false
                      and lower(coalesce(status,'')) not in ('closed','resolved','cancelled','closed_rumor')
                    """, Long.class));
            t.put("infrastructureItems", jdbc.queryForObject(
                    "select count(*) from public.infrastructure_items", Long.class));
            t.put("informAreasWithLatestValues", jdbc.queryForObject(
                    "select count(distinct area_code) from public.inform_indicator_value where is_latest = true",
                    Long.class));
        } catch (DataAccessException e) {
            t.put("error", e.getMessage());
        }
        return t;
    }

    private ResolvedArea resolveInformArea(String name) {
        // 1) geo alias → inform code
        try {
            Map<String, String> codes = geoAliases.informCodesForNames(Set.of(name));
            if (!codes.isEmpty()) {
                String code = codes.values().iterator().next();
                List<Map<String, Object>> rows = jdbc.queryForList(
                        "select code, name, level from public.inform_area where code = ?", code);
                if (!rows.isEmpty()) {
                    return ResolvedArea.from(rows.get(0), "geo_name_aliases");
                }
            }
        } catch (Exception ignored) {
            // continue
        }

        String nk = normalize(name);
        String shortN = normalize(name.replaceAll(
                "(?i)\\s+(district|municipal|municipality|town|urban|council|city|dc|tc|mc)$", ""));
        try {
            List<Map<String, Object>> areas = jdbc.queryForList("""
                    select code, name, level from public.inform_area
                    where level in ('district', 'council', 'region')
                    order by case when level = 'district' then 0 when level = 'council' then 1 else 2 end, name
                    """);
            ResolvedArea best = null;
            for (Map<String, Object> a : areas) {
                String an = String.valueOf(a.get("name"));
                String ank = normalize(an);
                String ash = normalize(an.replaceAll(
                        "(?i)\\s+(district|municipal|municipality|town|urban|council|city|dc|tc|mc)$", ""));
                if (ank.equals(nk) || ash.equals(shortN) || ank.equals(shortN) || ash.equals(nk)) {
                    return ResolvedArea.from(a, "exact_name");
                }
                if (best == null && (ank.contains(nk) || nk.contains(ank) || ash.contains(shortN) || shortN.contains(ash))) {
                    best = ResolvedArea.from(a, "fuzzy_name");
                }
            }
            return best;
        } catch (DataAccessException e) {
            return null;
        }
    }

    private static Map<String, Object> proxy(String meaning, Double score, String honesty) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("score", score);
        m.put("meaning", meaning);
        m.put("source", "INFORM_proxy");
        m.put("liveRegistry", false);
        m.put("honesty", honesty);
        m.put("available", score != null);
        return m;
    }

    private static Double mean(RiskResult rr, String... components) {
        if (rr == null || rr.component() == null) {
            return null;
        }
        double sum = 0;
        int n = 0;
        for (String c : components) {
            Double v = rr.component().get(c);
            if (v != null && !v.isNaN()) {
                sum += v;
                n++;
            }
        }
        return n == 0 ? null : Math.round((sum / n) * 10.0) / 10.0;
    }

    private static Map<String, Object> coverageVerdict(Map<String, Object> structural,
                                                       Map<String, Object> physical,
                                                       Map<String, Object> proxies) {
        Map<String, Object> v = new LinkedHashMap<>();
        boolean structOk = Boolean.TRUE.equals(structural.get("available"));
        int ec = num(physical, "evacuationCentreCount");
        int wh = num(physical, "warehouseCount");
        int inc = num(physical, "openIncidentCount");
        v.put("structuralExposure", structOk ? "captured_well" : "missing_for_area");
        v.put("physicalAssets", (ec + wh) > 0 ? "partial_from_dmis_registers" : "no_local_assets_matched");
        v.put("peopleUnderFootprint", "not_captured");
        v.put("institutionLiveFeeds", "not_live_proxies_and_adapters_only");
        v.put("satelliteFullExposure", "not_claimed");
        v.put("proxyInstitutions", proxies.keySet());
        v.put("assetCounts", Map.of(
                "evacuationCentres", ec,
                "warehouses", wh,
                "openIncidents", inc,
                "inventoryLines", num(physical, "inventoryLines")));
        v.put("summary",
                (structOk ? "Structural INFORM present. " : "Structural INFORM unmatched. ")
                        + "Physical exposure limited to DMIS EC/warehouse/inventory/incident registers. "
                        + "No footprint∩population. Institution systems: honest integration endpoints only.");
        return v;
    }

    private static Map<String, Object> honesty() {
        Map<String, Object> h = new LinkedHashMap<>();
        h.put("structuralExposure", "INFORM H/V/C + components + EO signals when area resolves");
        h.put("physicalExposure", "DMIS evacuation centres, warehouses, inventory, open incidents, infrastructure, strategic projects");
        h.put("peopleUnderHazardFootprint", false);
        h.put("institutionRegistryFeeds", false);
        h.put("satelliteFullExposure", false);
        h.put("institutionProxies", "INFORM-derived and labelled as proxies");
        return h;
    }

    private static int num(Map<String, Object> m, String key) {
        Object v = m.get(key);
        if (v instanceof Number n) {
            return n.intValue();
        }
        return 0;
    }

    private static String normalize(String s) {
        if (s == null) {
            return "";
        }
        return s.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", " ").trim().replaceAll("\\s+", " ");
    }

    private record ResolvedArea(String code, String name, String level, String matchMethod) {
        static ResolvedArea from(Map<String, Object> row, String method) {
            return new ResolvedArea(
                    String.valueOf(row.get("code")),
                    String.valueOf(row.get("name")),
                    String.valueOf(row.get("level")),
                    method);
        }

        Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("code", code);
            m.put("name", name);
            m.put("level", level);
            m.put("matchMethod", matchMethod);
            return m;
        }
    }
}
