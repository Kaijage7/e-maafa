package tz.go.pmo.dmis.local;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Local rows shaped exactly as the WORKING write path creates them — the admin-family
 * Admin/MitigationMeasureController@store (title unique + boot() copies title into
 * project_programme_name; categories/statuses from its option lists; capitalised priority /
 * project_status per the DB checks; institutions = the real EW agencies). The v2 family has no
 * working create, so this mirrors production data provenance. Idempotent.
 */
@Component
@Profile("local")
@RequiredArgsConstructor
@Order(20)
public class MitigationMeasureLocalSeeder {

    private static final Logger log = LoggerFactory.getLogger(MitigationMeasureLocalSeeder.class);

    private final JdbcTemplate jdbc;

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        Long count = jdbc.queryForObject("select count(*) from public.mitigation_measures", Long.class);
        if (count != null && count > 0) {
            log.info("local seed: mitigation measures present, skipping");
            return;
        }
        row("Early Warning Systems - Floods", "Early Warning Systems", "Active", "Ongoing", "High",
                "Floods", "TMA", "2025-01-01", "2026-12-31");
        row("Coastal Protection - Cyclone", "Coastal Protection", "Active", "Not started", "Medium",
                "Cyclone", "MoW", "2026-07-01", "2027-06-30");
        row("Land Management - Landslide", "Land Management", "Implemented", "Completed", "Low",
                "Landslide", "NEMC", "2024-01-01", "2025-06-30");
        row("Fire Management - Wildfire", "Fire Management", "Active", "Design", "High",
                "Wildfire", "NEMC", "2026-09-01", "2028-08-31");
        row("Community Resilience - Drought", "Community Resilience", "Active", "Ongoing", "Medium",
                "Drought", "MoA", "2025-06-01", "2027-05-31");
        log.info("local seed: done (5 mitigation measures)");
    }

    private void row(String title, String category, String status, String projectStatus, String priority,
                     String hazard, String institution, String start, String end) {
        jdbc.update("insert into public.mitigation_measures(title, project_programme_name, description, "
                + "category, status, project_status, priority, hazard_risk_addressed, "
                + "implementing_institution, implementation_period_start, implementation_period_end, "
                + "created_at, updated_at) values (?,?,?,?,?,?,?,?,?,?::date,?::date,now(),now())",
                title, title, category + " measure addressing " + hazard + ".", category, status,
                projectStatus, priority, hazard, institution, start, end);
    }
}
