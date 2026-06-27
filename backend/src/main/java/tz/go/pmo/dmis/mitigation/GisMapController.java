package tz.go.pmo.dmis.mitigation;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Reproduces Admin/GisMapController@index — the reference GIS map's five marker layers (with the
 * exact column subsets and filters), the four stats and the shared choropleth regionData.
 */
@RestController
@RequestMapping("/v1/gis-map")
@RequiredArgsConstructor
@Tag(name = "Prevention & Mitigation", description = "Risk Mapping & GIS reference map data")
public class GisMapController {

    private final JdbcTemplate jdbc;
    private final RegionDataBuilder regionDataBuilder;
    private final JurisdictionScope jurisdiction;

    @GetMapping
    @Operation(summary = "GIS map payload: 5 marker layers + stats + choropleth region data")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        List<Map<String, Object>> infrastructure = rows(
                "select id, name, type, latitude, longitude, status from public.infrastructure_items "
                        + "where latitude is not null and longitude is not null");
        List<Map<String, Object>> riskAssessments = rows(
                "select r.id, r.assessment_title, r.risk_level, r.latitude, r.longitude, h.name as hazard_name "
                        + "from public.risk_assessments r left join public.hazards h on h.id = r.hazard_id "
                        + "where r.latitude is not null and r.longitude is not null");
        StringBuilder incidentsSql = new StringBuilder(
                "select i.id, i.title, i.status, i.severity_level, i.latitude, i.longitude, i.reported_at, "
                        + "h.name as hazard_name from public.incidents i "
                        + "left join public.hazards h on h.id = i.hazard_id "
                        + "where i.latitude is not null and i.longitude is not null "
                        + "and i.status in ('Reported','Pending Verification','Verified','Active Response','Monitoring','Escalated')");
        List<Object> incidentsParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("i", incidentsSql, incidentsParams);
        incidentsSql.append(" order by i.reported_at desc limit 100");
        List<Map<String, Object>> incidents = rows(incidentsSql.toString(), incidentsParams.toArray());

        StringBuilder warehousesSql = new StringBuilder(
                "select w.id, w.name, w.zone, w.latitude, w.longitude, w.operational_status from public.warehouses w "
                        + "where w.latitude is not null and w.longitude is not null");
        List<Object> warehousesParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("w", warehousesSql, warehousesParams);
        List<Map<String, Object>> warehouses = rows(warehousesSql.toString(), warehousesParams.toArray());
        List<Map<String, Object>> pastDisasters = rows(
                "select p.id, p.event_name, p.event_date, p.latitude, p.longitude, h.name as hazard_name "
                        + "from public.past_disasters p left join public.hazards h on h.id = p.hazard_id "
                        + "where p.latitude is not null and p.longitude is not null "
                        + "order by p.event_date desc limit 100");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stats", Map.of(
                "infrastructure", infrastructure.size(),
                "riskAssessments", riskAssessments.size(),
                "incidents", incidents.size(),
                "warehouses", warehouses.size()));
        out.put("infrastructureItems", infrastructure);
        out.put("riskAssessments", riskAssessments);
        out.put("incidents", incidents);
        out.put("warehouses", warehouses);
        out.put("pastDisasters", pastDisasters);
        out.put("regionData", regionDataBuilder.build());
        return out;
    }

    private List<Map<String, Object>> rows(String sql) {
        try {
            return jdbc.queryForList(sql);
        } catch (Exception e) {
            return List.of();
        }
    }

    private List<Map<String, Object>> rows(String sql, Object... params) {
        try {
            return jdbc.queryForList(sql, params);
        } catch (Exception e) {
            return List.of();
        }
    }
}
