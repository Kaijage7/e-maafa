package tz.go.pmo.dmis.local;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Seeds the OFFICIAL national disaster-loss record — "TAARIFA YA MAAFA MBALIMBALI YALIYOTOKEA NCHINI
 * KUANZIA JULAI 2025 HADI APRILI 2026" (Ofisi ya Waziri Mkuu, SBUU / DMD) — into the Sendai loss
 * database as one VALIDATED DesInventar event card per council event.
 *
 * The data lives in the editable resource {@code seed/disaster_report_2025_26.json} (NOT hardcoded) so it
 * doubles as the template for the "import a new sheet" path. Totals are seeded; Sendai disaggregation
 * (deaths by sex, children, persons-with-disabilities; economic loss by sector) is left as entry points
 * EXCEPT where the report itself gave a split (e.g. Chamwino "3 women, 1 man"). Idempotent per event_code.
 * Runs after {@link SendaiLocalSeeder} (so hazards/indicators exist) and only once V61's columns are present.
 */
@Component
@Profile("local")
@Order(26)
@RequiredArgsConstructor
public class OfficialDisasterReportSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(OfficialDisasterReportSeeder.class);
    private final JdbcTemplate jdbc;

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        // Guard: skip until V61 has applied (the report columns must exist) — avoids a half-migrated failure.
        Integer hasCol = jdbc.queryForObject(
                "select count(*) from information_schema.columns where table_name='disaster_event_effects'"
                        + " and column_name='households_affected'", Integer.class);
        if (hasCol == null || hasCol == 0) {
            log.warn("official report seed: V61 report columns absent — skipping (rebuild to apply V61)");
            return;
        }

        ObjectMapper om = new ObjectMapper();
        JsonNode root;
        // Dev convenience: prefer the on-disk source file (so seed data can be re-tuned with only a
        // restart, no rebuild) and fall back to the packaged classpath copy.
        java.io.File devFile = new java.io.File("src/main/resources/seed/disaster_report_2025_26.json");
        if (devFile.isFile()) {
            root = om.readTree(devFile);
            log.info("official report seed: loading from on-disk source {}", devFile.getAbsolutePath());
        } else {
            try (var in = new ClassPathResource("seed/disaster_report_2025_26.json").getInputStream()) {
                root = om.readTree(in);
            }
        }
        String source = root.path("source").asText("OWM-SBUU / DMD — TAARIFA YA MAAFA JULAI 2025–APRILI 2026");
        int seeded = 0;
        for (JsonNode ev : root.path("events")) {
            String code = ev.path("code").asText("");
            if (code.isBlank()) { continue; }
            List<Long> exists = jdbc.queryForList("select id from disaster_events where event_code=?", Long.class, code);
            if (!exists.isEmpty()) { continue; }                      // idempotent

            String hazardType = ev.path("hazard").asText(null);
            Long hazardId = hazardId(hazardType);
            String start = ev.path("start").asText(null);
            String end = ev.path("end").asText(start);

            Long id = jdbc.queryForObject(
                    "insert into disaster_events(event_code,name,hazard_id,hazard_type,glide_number,started_on,ended_on,"
                            + "primary_region,scope,description,triggering_event,data_source,gov_response_tzs,response_actions,"
                            + "status,recorded_by,validated_by,validated_at,created_at,updated_at)"
                            + " values (?,?,?,?,?,?::date,?::date,?,?,?,?,?,?,?,'Validated','DMD / OWM-SBUU','DMD',now(),now(),now())"
                            + " returning id",
                    Long.class, code, ev.path("name").asText(), hazardId, hazardType, asTextOrNull(ev, "glide"),
                    start, end, asTextOrNull(ev, "region"), ev.path("scope").asText("District"),
                    asTextOrNull(ev, "desc"), asTextOrNull(ev, "trigger"), source,
                    ev.path("responseTzs").asDouble(0), asTextOrNull(ev, "responseActions"));

            JsonNode e = ev.path("effects");
            String cropsNote = e.has("cropsUnit") ? ("crops figure reported in " + e.path("cropsUnit").asText()) : null;
            jdbc.update(
                    "insert into disaster_event_effects(event_id,region,district,"
                            + "deaths_total,deaths_male,deaths_female,injured_total,directly_affected,households_affected,"
                            + "displaced,relocated,houses_destroyed,houses_damaged,livestock_lost,crops_destroyed_ha,"
                            + "schools_damaged,classrooms_damaged,health_facilities_damaged,bridges_damaged,roads_damaged,"
                            + "roads_km_damaged,religious_facilities_damaged,water_systems_damaged,power_systems_damaged,"
                            + "notes,source,created_at,updated_at)"
                            + " values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,now(),now())",
                    id, asTextOrNull(ev, "region"), asTextOrNull(ev, "district"),
                    e.path("deathsTotal").asInt(0), e.path("deathsMale").asInt(0), e.path("deathsFemale").asInt(0),
                    e.path("injuredTotal").asInt(0), e.path("directlyAffected").asInt(0), e.path("householdsAffected").asInt(0),
                    e.path("displaced").asInt(0), e.path("relocated").asInt(0),
                    e.path("housesDestroyed").asInt(0), e.path("housesDamaged").asInt(0),
                    e.path("livestockLost").asInt(0), e.path("cropsDestroyedHa").asDouble(0),
                    e.path("schoolsDamaged").asInt(0), e.path("classroomsDamaged").asInt(0), e.path("healthFacilitiesDamaged").asInt(0),
                    e.path("bridgesDamaged").asInt(0), e.path("roadsDamaged").asInt(0), e.path("roadsKmDamaged").asDouble(0),
                    e.path("religiousFacilitiesDamaged").asInt(0), e.path("waterSystemsDamaged").asInt(0),
                    e.path("powerSystemsDamaged").asInt(0), cropsNote, source);
            seeded++;
        }
        if (seeded > 0) {
            log.info("official report seed: {} council disaster cards (Jul 2025–Apr 2026, Validated)", seeded);
        }
    }

    private static String asTextOrNull(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isMissingNode() || v.isNull() ? null : v.asText();
    }

    private Long hazardId(String name) {
        if (name == null) { return null; }
        List<Long> ids = jdbc.queryForList("select id from hazards where name ilike ? limit 1", Long.class, name + "%");
        return ids.isEmpty() ? null : ids.get(0);
    }
}
