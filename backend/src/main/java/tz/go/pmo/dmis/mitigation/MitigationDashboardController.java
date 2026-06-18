package tz.go.pmo.dmis.mitigation;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Reproduces MitigationController@index — everything the mitigation/index-v2 dashboard receives:
 * the six counts, the choropleth regionData, map assessment markers, the six analytic datasets and
 * the three recent tables. Queries are tolerant of absent tables (the source wraps each block in
 * try/catch), via to_regclass guards.
 */
@RestController
@RequestMapping("/v1/mitigation/dashboard")
@RequiredArgsConstructor
@Tag(name = "Prevention & Mitigation", description = "Module dashboard aggregates")
public class MitigationDashboardController {

    private final JdbcTemplate jdbc;
    private final RegionDataBuilder regionDataBuilder;

    @GetMapping
    @Operation(summary = "Dashboard payload: counts + choropleth + 6 chart datasets + 3 recent tables")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("hazardsCount", count("select count(*) from public.hazards where is_active = true"));
        out.put("assessmentsCount", count("select count(*) from public.risk_assessments"));
        out.put("frameworksCount", count("select count(*) from public.disaster_risk_frameworks"));
        out.put("measuresCount", count("select count(*) from public.mitigation_measures"));
        out.put("projectsCount", count("select count(*) from public.strategic_projects"));
        out.put("repositoryCount", count("select count(*) from public.disaster_knowledge_repositories"));

        out.put("regionData", regionDataBuilder.build());
        out.put("mapAssessments", rows("select id, assessment_title, risk_level, latitude, longitude, location_name "
                + "from public.risk_assessments where latitude is not null and longitude is not null limit 50"));

        out.put("hazardsByCategory", rows("select category, severity, count(*) as total from public.hazards "
                + "where is_active = true and category is not null and severity is not null "
                + "group by category, severity"));
        out.put("hazardFrequency", rows("select frequency, count(*) as total from public.hazards "
                + "where is_active = true and frequency is not null group by frequency"));
        out.put("riskMatrix", rows("select assessment_title, risk_level, likelihood, severity_of_impact, "
                + "population_at_risk, location_name from public.risk_assessments"));
        out.put("populationRisk", rows("select location_name, population_at_risk, risk_level, mitigation_budget "
                + "from public.risk_assessments where population_at_risk is not null order by population_at_risk desc"));
        out.put("mitigationPriority", rows("select priority, count(*) as total from public.mitigation_measures "
                + "where priority is not null group by priority"));
        out.put("riskLevels", rows("select risk_level, count(*) as total from public.risk_assessments "
                + "where risk_level is not null group by risk_level"));

        out.put("recentFrameworks", rows("select document_name, document_type, year_of_approval, geographic_scope "
                + "from public.disaster_risk_frameworks order by created_at desc nulls last limit 5"));
        out.put("activeMeasures", rows("select project_programme_name, implementing_entity, project_status, priority "
                + "from public.mitigation_measures where project_status = 'Ongoing' limit 5"));
        out.put("upcomingTrainings", rows("select training_title, implementing_institution, training_start_date, "
                + "training_end_date, targeted_audience from public.training_plans "
                + "where training_start_date > now() and status = 'planned' limit 5"));
        return out;
    }

    private long count(String sql) {
        try {
            Long value = jdbc.queryForObject(sql, Long.class);
            return value == null ? 0 : value;
        } catch (Exception e) {
            return 0; // the source wraps every block in try/catch with empty fallbacks
        }
    }

    private List<Map<String, Object>> rows(String sql) {
        try {
            return jdbc.queryForList(sql);
        } catch (Exception e) {
            return List.of();
        }
    }
}
