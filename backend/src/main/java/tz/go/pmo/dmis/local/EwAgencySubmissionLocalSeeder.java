package tz.go.pmo.dmis.local;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Demo cross-agency EW submissions so the interlinking + DMD consolidation render with real data even
 * when the Python engine isn't running locally. One latest submission per warning entity, deliberately
 * interlinked into one realistic scenario: TMA heavy rain over the Rufiji/Kilombero catchments → MoW
 * flood warning building on that rainfall → GST earthquake + Hanang landslide → MoH cholera after the
 * flooding → MoA drought in the central corridor → NEMC air pollution over Kariakoo. Idempotent, local only.
 */
@Component
@Profile("local")
@RequiredArgsConstructor
public class EwAgencySubmissionLocalSeeder {

    private static final Logger log = LoggerFactory.getLogger(EwAgencySubmissionLocalSeeder.class);

    private final JdbcTemplate jdbc;

    private record Sub(String agency, String issueDate, String issueTime, String reportPeriod,
                       String payload, String regions, String districts, String types,
                       String topAlert, String alertSummary, int itemCount) {}

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        Long n = jdbc.queryForObject("select count(*) from public.ew_agency_submissions", Long.class);
        if (n != null && n > 0) {
            return;
        }
        List<Sub> subs = List.of(
            new Sub("tma", "2026-06-14", "15:30", null,
                """
                {"issue_date":"2026-06-14","issue_time":"15:30","days":[
                  {"date":"2026-06-14","hazards":[
                    {"type":"HEAVY_RAIN","alert_level":"WARNING","regions":["Morogoro","Pwani"],"districts":["Kilombero","Rufiji"],"description":"heavy rainfall exceeding 50mm over the Rufiji and Kilombero catchments","likelihood":"HIGH","impact":"HIGH","impacts_expected":"localised flooding, rising river levels"}]},
                  {"date":"2026-06-15","hazards":[
                    {"type":"HEAVY_RAIN","alert_level":"MAJOR_WARNING","regions":["Morogoro"],"districts":["Kilombero","Ulanga"],"description":"continued heavy rainfall, saturated catchments","likelihood":"HIGH","impact":"HIGH","impacts_expected":"river flooding likely"},
                    {"type":"LARGE_WAVES","alert_level":"WARNING","regions":["Mtwara","Lindi"],"districts":[],"description":"large waves 2.5-3.5m along the southern coast","likelihood":"MEDIUM","impact":"MEDIUM","impacts_expected":"disruption to marine activity"}]},
                  {"date":"2026-06-16","hazards":[]},{"date":"2026-06-17","hazards":[]},{"date":"2026-06-18","hazards":[]}]}
                """,
                "[\"Morogoro\",\"Pwani\",\"Mtwara\",\"Lindi\"]", "[\"Kilombero\",\"Rufiji\",\"Ulanga\"]",
                "[\"HEAVY_RAIN\",\"LARGE_WAVES\"]", "MAJOR_WARNING", "{\"warning\":2,\"major_warning\":1}", 3),

            new Sub("mow", "2026-06-14", "10:00", null,
                """
                {"source":"mow","issue_date":"2026-06-14","issue_time":"10:00","days":[
                  {"day_number":1,"date":"2026-06-14","assessments":[
                    {"basins":["Rufiji","Wami-Ruvu"],"alert_level":"WARNING","districts":["Rufiji","Kilombero","Kibaha","Morogoro"],"regions":["Pwani","Morogoro"],"description":"rising river levels in the Rufiji basin following the TMA heavy-rain warning; flood risk for low-lying wards","likelihood":"HIGH","impact":"HIGH","impacts_expected":"riverine flooding, displacement risk"}]},
                  {"day_number":2,"date":"2026-06-15","assessments":[
                    {"basins":["Rufiji"],"alert_level":"MAJOR_WARNING","districts":["Rufiji","Kilombero","Ulanga"],"regions":["Morogoro","Pwani"],"description":"major flood risk as catchments saturate","likelihood":"HIGH","impact":"HIGH","impacts_expected":"major flooding expected"}]},
                  {"day_number":3,"date":"2026-06-16","assessments":[]}]}
                """,
                "[\"Pwani\",\"Morogoro\"]", "[\"Rufiji\",\"Kilombero\",\"Kibaha\",\"Morogoro\",\"Ulanga\"]",
                "[\"FLOODS\"]", "MAJOR_WARNING", "{\"warning\":1,\"major_warning\":1}", 2),

            new Sub("gst", "2026-06-14", "08:00", null,
                """
                {"agency":"GST","issue_date":"2026-06-14","issue_time":"08:00","events":[
                  {"type":"EARTHQUAKE","alert_level":"WARNING","regions":["Kigoma"],"districts":[],"description":"magnitude 5.1 earthquake recorded near Lake Tanganyika","likelihood":"MEDIUM","impact":"HIGH","impacts_expected":"structural damage possible","magnitude":5.1,"depth_km":12.0,"severity":"STRONG"},
                  {"type":"LANDSLIDES","alert_level":"MAJOR_WARNING","regions":["Manyara"],"districts":["Hanang"],"description":"landslide risk on Mount Hanang slopes after heavy rain","likelihood":"HIGH","impact":"HIGH","impacts_expected":"slope failure, road blockage"}]}
                """,
                "[\"Kigoma\",\"Manyara\"]", "[\"Hanang\"]",
                "[\"EARTHQUAKE\",\"LANDSLIDES\"]", "MAJOR_WARNING", "{\"warning\":1,\"major_warning\":1}", 2),

            new Sub("moh", "2026-06-14", "09:00", null,
                """
                {"agency":"MoH","issue_date":"2026-06-14","issue_time":"09:00","outbreaks":[
                  {"type":"DISEASE_OUTBREAK","disease":"Cholera","alert_level":"WARNING","confirmed_cases":42,"deaths":3,"trend":"Increasing","regions":["Dar es Salaam"],"districts":["Temeke"],"description":"cholera cases rising in Temeke following flooding","response_actions":"water chlorination, case isolation","likelihood":"HIGH","impact":"HIGH"}]}
                """,
                "[\"Dar es Salaam\"]", "[\"Temeke\"]",
                "[\"Cholera\"]", "WARNING", "{\"warning\":1}", 1),

            new Sub("moa", "2026-06-14", "08:00", "Monthly",
                """
                {"agency":"MoA","issue_date":"2026-06-14","issue_time":"08:00","report_period":"Monthly","assessments":[
                  {"type":"DROUGHT","severity":"D2 — Severe Drought","alert_level":"WARNING","rainfall_pct_normal":55,"vegetation_ndvi":"Poor","affected_sectors":["Crops","Livestock"],"regions":["Dodoma","Singida"],"districts":["Bahi","Manyoni"],"description":"severe drought conditions in the central corridor","recommended_actions":"supplementary feeding, water trucking","likelihood":"HIGH","impact":"HIGH"}]}
                """,
                "[\"Dodoma\",\"Singida\"]", "[\"Bahi\",\"Manyoni\"]",
                "[\"DROUGHT\"]", "WARNING", "{\"warning\":1}", 1),

            new Sub("nemc", "2026-06-14", "10:00", null,
                """
                {"agency":"NEMC","issue_date":"2026-06-14","issue_time":"10:00","events":[
                  {"type":"AIR_POLLUTION","source":"Waste Burning","alert_level":"ADVISORY","aqi_level":"UNHEALTHY_SG","aqi_value":130,"pollutants":["PM2.5","PM10"],"regions":["Dar es Salaam"],"districts":["Ilala"],"description":"elevated particulate levels over the Kariakoo area","health_advisory":"sensitive groups limit outdoor activity","likelihood":"MEDIUM","impact":"MEDIUM"}]}
                """,
                "[\"Dar es Salaam\"]", "[\"Ilala\"]",
                "[\"AIR_POLLUTION\"]", "ADVISORY", "{\"advisory\":1}", 1)
        );

        Long userId;
        try { userId = jdbc.queryForObject("select id from public.users order by id limit 1", Long.class); }
        catch (Exception e) { userId = null; }

        int seeded = 0;
        for (Sub s : subs) {
            jdbc.update(
                "insert into public.ew_agency_submissions " +
                "(agency, issue_date, issue_time, report_period, payload, regions, districts, hazard_types, " +
                " alert_summary, top_alert, item_count, submitted_by, is_latest) " +
                "values (?, ?::date, ?, ?, ?::json, ?::json, ?::json, ?::json, ?::json, ?, ?, ?, true)",
                s.agency(), s.issueDate(), s.issueTime(), s.reportPeriod(), s.payload(),
                s.regions(), s.districts(), s.types(), s.alertSummary(), s.topAlert(), s.itemCount(), userId);
            seeded++;
        }
        log.info("Seeded {} cross-agency EW submissions (interlinked flood scenario)", seeded);
    }
}
