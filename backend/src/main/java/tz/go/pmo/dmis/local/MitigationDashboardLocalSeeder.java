package tz.go.pmo.dmis.local;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Local rows for the dashboard's recent tables, copied verbatim from the source's
 * DisasterRiskFrameworkSeeder (first three documents). Trainings get two rows shaped exactly as
 * TrainingPlan::upcoming() selects them (training_start_date > now, status=planned). Idempotent.
 */
@Component
@Profile("local")
@RequiredArgsConstructor
public class MitigationDashboardLocalSeeder {

    private static final Logger log = LoggerFactory.getLogger(MitigationDashboardLocalSeeder.class);

    private final JdbcTemplate jdbc;

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        Long frameworks = jdbc.queryForObject("select count(*) from public.disaster_risk_frameworks", Long.class);
        if (frameworks != null && frameworks == 0) {
            framework("Act", "Disaster Management Act No. 7 of 2015", 2015,
                    "[\"Floods\",\"Droughts\",\"Landslides\",\"Epidemics\"]", "National");
            framework("Policies", "National Disaster Risk Reduction Policy", 2023,
                    "[\"Floods\",\"Droughts\",\"Landslides\",\"Cyclone\",\"Fire\"]", "National");
            framework("Plans and Strategies", "National Multi-Hazard Early Warning System Strategy", 2022,
                    "[\"Floods\",\"Droughts\",\"Cyclone\"]", "National");
            log.info("local seed: done (3 risk frameworks)");
        }
        Long trainings = jdbc.queryForObject("select count(*) from public.training_plans", Long.class);
        if (trainings != null && trainings == 0) {
            jdbc.update("insert into public.training_plans(training_id, training_title, implementing_institution, "
                    + "training_start_date, training_end_date, targeted_audience, status, created_at, updated_at) values "
                    + "('TRN-2026-00001', 'Community Flood Preparedness Training', 'PMO-DMD', "
                    + "current_date + 21, current_date + 25, '[\"DRR Coordinators\",\"Ward Officers\"]'::json, 'planned', now(), now()),"
                    + "('TRN-2026-00002', 'Early Warning Dissemination Drill', 'TMA', "
                    + "current_date + 45, current_date + 46, '[\"EOCC\",\"Comms Officers\"]'::json, 'planned', now(), now())");
            log.info("local seed: done (2 training plans)");
        }
    }

    private void framework(String type, String name, int year, String hazardsJson, String scope) {
        jdbc.update("insert into public.disaster_risk_frameworks(document_type, document_name, year_of_approval, "
                + "hazard_types, geographic_scope, created_at, updated_at) values (?,?,?,?::json,?,now(),now())",
                type, name, year, hazardsJson, scope);
    }
}
