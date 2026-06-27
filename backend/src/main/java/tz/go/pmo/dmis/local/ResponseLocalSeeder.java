package tz.go.pmo.dmis.local;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Response module reference data, ported verbatim from the source seeders:
 * <ul>
 *   <li>{@code DisasterResponseFunctionSeeder} — the 15 NDPRP 2022 Disaster Response
 *       Functions with their 95 default tasks (classpath: local-seed/drf-functions.json)</li>
 *   <li>{@code ResourceSeeder} — the 67-item relief resource catalogue
 *       (classpath: local-seed/response-resources.json)</li>
 * </ul>
 * Plus local dev fixtures the source leaves to admin data entry: incident types
 * matching the hazard registry, and three incidents in distinct workflow states so
 * every Response screen has data to render. Idempotent.
 */
@Component
@Profile("local")
@RequiredArgsConstructor
public class ResponseLocalSeeder {

    private static final Logger log = LoggerFactory.getLogger(ResponseLocalSeeder.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    @EventListener(ApplicationReadyEvent.class)
    public void seed() throws Exception {
        seedDisasterResponseFunctions();
        seedResources();
        seedIncidentTypes();
        seedDemoIncidents();
        seedDispatchSources();
        seedAlertTemplates();
        seedAnticipatoryPlans();
        seedContingencyPlans();
    }

    /**
     * Contingency Plans — the strategic siblings of the Anticipatory Action Plans. Where an
     * anticipatory plan is forecast-triggered and council-specific, a contingency plan is a standing,
     * multi-region, multi-sector plan for a hazard over a planning timeframe (the source risk
     * assessment's plan_type was {anticipatory, contingency}). These are the national/sectoral plans
     * the NDPRP 2022 expects to exist ahead of season.
     */
    private void seedContingencyPlans() throws Exception {
        Long existing = jdbc.queryForObject("select count(*) from public.contingency_plans", Long.class);
        if (existing != null && existing > 0) {
            return;
        }
        // hazard, timeframe, regions[], sectors[], budget(TZS), status, description
        record CPlan(String hazard, String timeframe, List<String> regions, List<String> sectors,
                     long budget, String status, String description) {}
        List<CPlan> plans = List.of(
            new CPlan("Floods", "2026 Masika rainy season (Mar–May)",
                List.of("Dar es Salaam", "Morogoro", "Pwani", "Kagera", "Tanga"),
                List.of("Coordination", "Search & Rescue", "Shelter & Camp Management", "Health", "WASH", "Logistics"),
                12_500_000_000L, "active",
                "National contingency plan for riverine and urban flooding across the high-risk basins for the 2026 long-rains season. Defines pre-positioning, evacuation triggers and the multi-region resource-sharing protocol."),
            new CPlan("Cyclone", "2025/26 SW Indian Ocean cyclone season (Nov–Apr)",
                List.of("Mtwara", "Lindi", "Pwani", "Zanzibar (Unguja)", "Zanzibar (Pemba)"),
                List.of("Coordination", "Early Warning", "Search & Rescue", "Shelter & Camp Management", "Logistics", "Communications"),
                9_800_000_000L, "active",
                "Tropical-cyclone contingency plan for the southern coast and the isles, aligned to the RSMC La Réunion bulletin cycle. Covers harbour-securing of fishing fleets, shelter activation and the s.32 declaration pathway."),
            new CPlan("Drought", "2026 multi-season (5-year resilience horizon)",
                List.of("Dodoma", "Singida", "Shinyanga", "Manyara", "Simiyu"),
                List.of("Coordination", "Food Security & Agriculture", "WASH", "Livelihoods & Early Recovery", "Health"),
                18_400_000_000L, "active",
                "Strategic drought-resilience contingency plan for the semi-arid central corridor: water-trucking lanes, strategic grain reserve drawdown thresholds, livestock destocking and cash-transfer scaling."),
            new CPlan("Disease Outbreak", "2026 calendar year (cholera-prone period)",
                List.of("Mwanza", "Mara", "Kigoma", "Dar es Salaam", "Tabora"),
                List.of("Coordination", "Health", "WASH", "Communications", "Logistics"),
                7_200_000_000L, "active",
                "One Health contingency plan for epidemic-prone disease (cholera priority): surveillance triggers, cholera treatment-unit pre-positioning, water chlorination and the risk-communication protocol."),
            new CPlan("Earthquake", "Standing plan (no-notice, 3-year review)",
                List.of("Mbeya", "Songwe", "Rukwa", "Kigoma", "Kagera"),
                List.of("Coordination", "Search & Rescue", "Health", "Shelter & Camp Management", "Infrastructure & Engineering"),
                6_500_000_000L, "pending",
                "Seismic contingency plan for the Great Rift Valley belt. No-notice hazard, so the plan is readiness-based: USAR capability, structural-assessment teams and assembly-area mapping."),
            new CPlan("Pest Invasion", "2026 cropping season",
                List.of("Manyara", "Arusha", "Kilimanjaro", "Dodoma"),
                List.of("Coordination", "Food Security & Agriculture", "Logistics"),
                3_900_000_000L, "draft",
                "Migratory-pest (desert locust / fall armyworm) contingency plan: aerial and ground spraying capacity, scouting/mapping protocol and protection of strategic food stores."));
        for (CPlan p : plans) {
            jdbc.update("""
                    insert into public.contingency_plans(publication_date, hazard_type, timeframe,
                        coverage_regions, sectors, budget, description, status, created_at, updated_at)
                    values (current_date,?,?,?::json,?::json,?,?,?,now(),now())
                    """, p.hazard(), p.timeframe(),
                    objectMapper.writeValueAsString(p.regions()),
                    objectMapper.writeValueAsString(p.sectors()),
                    p.budget(), p.description(), p.status());
        }
        log.info("local seed: {} contingency plans", plans.size());
    }

    /**
     * The 15 Anticipatory Action Plans from the source seeder (hazard/council/people/budget/status
     * verbatim), enriched with the SRS per-activity fields so the Command Post readiness panel can
     * show real preparedness activities per forecast-impact area.
     */
    private void seedAnticipatoryPlans() throws Exception {
        Long existing = jdbc.queryForObject("select count(*) from public.anticipatory_action_plans", Long.class);
        if (existing != null && existing > 0) {
            return;
        }
        // hazard, council, coverage, people, budget(TZS), status, activationWindowDays, trigger,
        // activities[], responsibleActors[], channels[], closureCriteria, focalAgency
        record Plan(String hazard, String council, String coverage, int people, long budget, String status,
                    int window, String trigger, List<String> activities, List<String> actors,
                    List<String> channels, String closure, String focalAgency) {}
        List<Plan> plans = List.of(
            new Plan("Floods", "Dar es Salaam City Council", "Msasani, Kinondoni, Ilala, Temeke", 150000, 2_500_000_000L, "active",
                3, "TMA heavy-rainfall forecast >50mm/24h over Msimbazi basin",
                List.of("Open temporary shelters", "Clear and desilt drainage channels", "Relocate riverside households", "Preposition water-purification tablets"),
                List.of("Dar es Salaam RC", "Municipal Directors (Kinondoni/Ilala/Temeke)", "TARURA", "Red Cross"),
                List.of("SMS", "Radio/TV", "Community meeting"), "Rainfall subsides and Msimbazi level falls below alert", "PMO-DMD / Dar RS"),
            new Plan("Drought", "Dodoma City Council", "Dodoma rural wards", 280000, 4_800_000_000L, "active",
                30, "Below-normal seasonal rainfall forecast + NDVI decline",
                List.of("Truck water to affected villages", "Distribute drought-tolerant seed", "Open supplementary feeding", "Destock livestock"),
                List.of("Dodoma RC", "NFRA", "Ministry of Agriculture", "RUWASA"),
                List.of("Radio/TV", "Community meeting"), "Rains resume and water sources recharge", "PMO-DMD / Dodoma RS"),
            new Plan("Cyclone", "Mtwara Municipal Council", "Mtwara, Lindi, Masasi", 95000, 1_800_000_000L, "active",
                3, "RSMC La Réunion cyclone track within 72h of the coast",
                List.of("Evacuate coastal/low-lying zones", "Open and stock cyclone shelters", "Secure fishing fleet to harbour", "Preposition shelter-strengthening kits"),
                List.of("Mtwara RC", "Fire & Rescue", "TASAC", "Red Cross"),
                List.of("SMS", "Radio/TV", "Community meeting"), "Cyclone passes and residual flood/landslide risk clears", "PMO-DMD / Mtwara RS"),
            new Plan("Earthquake", "Mbeya City Council", "Great Rift Valley region", 120000, 3_200_000_000L, "pending",
                0, "Seismic monitoring (GST) — no-notice; readiness-based",
                List.of("Pre-position search-and-rescue equipment", "Map safe assembly areas", "Train ward response teams", "Stockpile field medical kits"),
                List.of("Mbeya RC", "GST", "Fire & Rescue", "Ministry of Health"),
                List.of("SMS", "Community meeting"), "Readiness exercise cycle complete", "PMO-DMD / GST"),
            new Plan("Floods", "Morogoro Municipal Council", "Morogoro urban + Wami basin", 85000, 1_650_000_000L, "active",
                3, "Heavy rain forecast over the Uluguru catchment",
                List.of("Activate community flood committees", "Clear culverts", "Open shelters", "Stage relief stock"),
                List.of("Morogoro RC", "TARURA", "Red Cross"),
                List.of("SMS", "Radio/TV"), "River levels recede below alert", "PMO-DMD / Morogoro RS"),
            new Plan("Landslide", "Arusha City Council", "Mount Meru slopes, Arumeru, Monduli", 45000, 980_000_000L, "active",
                2, "Prolonged rainfall on saturated slopes",
                List.of("Evacuate slope-base settlements", "Restrict access to unstable areas", "Open shelters", "Deploy geo-hazard monitors"),
                List.of("Arusha RC", "GST", "Police", "Red Cross"),
                List.of("SMS", "Community meeting"), "Slope stabilises and rain stops", "PMO-DMD / Arusha RS"),
            new Plan("Wildfire", "Iringa Municipal Council", "Iringa highland forests", 65000, 1_250_000_000L, "pending",
                5, "High fire-danger index + dry-season winds",
                List.of("Establish firebreaks", "Pre-position firefighting teams", "Restrict open burning", "Warn forest-edge communities"),
                List.of("Iringa RC", "Fire & Rescue", "TFS (Forest Service)"),
                List.of("Radio/TV", "Community meeting"), "Fire-danger index returns to normal", "PMO-DMD / Iringa RS"),
            new Plan("Disease Outbreak", "Mwanza City Council", "Lake Victoria shoreline wards (cholera)", 320000, 2_100_000_000L, "active",
                7, "Event-based surveillance signal — cholera case cluster",
                List.of("Activate One Health response", "Chlorinate water points", "Open cholera treatment units", "Risk-communication campaign"),
                List.of("Mwanza RC", "Ministry of Health", "UNICEF", "RUWASA"),
                List.of("SMS", "Radio/TV", "Community meeting"), "Case count falls below outbreak threshold", "PMO-DMD / MoH"),
            new Plan("Drought", "Shinyanga Municipal Council", "Shinyanga agro-pastoral wards", 195000, 3_400_000_000L, "active",
                30, "Forecast below-normal rains + pasture decline",
                List.of("Water trucking", "Livestock vaccination + destocking", "Supplementary feeding", "Cash transfers"),
                List.of("Shinyanga RC", "Ministry of Agriculture", "WFP"),
                List.of("Radio/TV", "Community meeting"), "Rains resume", "PMO-DMD / Shinyanga RS"),
            new Plan("Floods", "Tanga City Council", "Tanga coastal + Pangani estuary", 110000, 1_900_000_000L, "draft",
                3, "Heavy rain + high tide coincidence forecast",
                List.of("Mangrove-buffer protection", "Open shelters", "Evacuate estuary settlements", "Preposition boats"),
                List.of("Tanga RC", "TASAC", "Red Cross"),
                List.of("SMS", "Radio/TV"), "Flood waters recede", "PMO-DMD / Tanga RS"),
            new Plan("Volcanic Eruption", "Same District Council", "Areas around Mount Kilimanjaro / Ol Doinyo Lengai", 35000, 850_000_000L, "active",
                0, "GST volcanic-unrest monitoring",
                List.of("Define exclusion zones", "Plan evacuation routes", "Stockpile masks + medical kits", "Brief communities"),
                List.of("Kilimanjaro RC", "GST", "Police"),
                List.of("SMS", "Community meeting"), "Volcanic unrest subsides", "PMO-DMD / GST"),
            new Plan("Tsunami", "Zanzibar Municipal Council", "Stone Town, Unguja, Pemba coastal areas", 180000, 4_200_000_000L, "active",
                0, "IOTWMS tsunami threat message (minutes-to-hours lead)",
                List.of("Immediate coastal evacuation to high ground", "Activate siren network", "Open inland shelters", "Coordinate with Indian Ocean warning system"),
                List.of("Zanzibar authorities", "TMA (NTWC)", "Fire & Rescue", "Red Cross"),
                List.of("SMS", "Radio/TV", "Community meeting"), "Tsunami threat cancelled by NTWC", "PMO-DMD / TMA"),
            new Plan("Heatwave", "Singida Municipal Council", "Singida urban wards", 72000, 980_000_000L, "pending",
                5, "Forecast prolonged extreme temperatures",
                List.of("Open cooling centres", "Health advisories for vulnerable groups", "Adjust water supply", "Monitor heat-illness cases"),
                List.of("Singida RC", "Ministry of Health", "RUWASA"),
                List.of("Radio/TV", "SMS"), "Temperatures return to normal range", "PMO-DMD / MoH"),
            new Plan("Floods", "Kagera Regional Council", "Lake Victoria basin (cross-border)", 165000, 2_750_000_000L, "active",
                5, "Rising lake level + upstream heavy rain forecast",
                List.of("Cross-border coordination", "Evacuate shoreline settlements", "Open shelters", "Preposition relief"),
                List.of("Kagera RC", "Lake Victoria Basin Water Board", "Red Cross"),
                List.of("SMS", "Radio/TV", "Community meeting"), "Lake level recedes", "PMO-DMD / Kagera RS"),
            new Plan("Pest Invasion", "Manyara Regional Council", "Manyara croplands (locust + armyworm)", 230000, 1_850_000_000L, "active",
                14, "FAO/Ministry forecast of locust/armyworm migration",
                List.of("Aerial + ground spraying", "Scout and map infestations", "Protect food stores", "Farmer advisories"),
                List.of("Manyara RC", "Ministry of Agriculture", "FAO"),
                List.of("Radio/TV", "Community meeting"), "Infestation controlled below economic threshold", "PMO-DMD / MoA"));
        for (Plan p : plans) {
            jdbc.update("""
                    insert into public.anticipatory_action_plans(hazard_type, hazard_id, publication_date,
                        district_council, coverage_location, affected_people, budget, description, status,
                        trigger, activation_window, geographical_scope, action_activities_type,
                        responsible_actor, communication_channel, funding_source, closure_criteria,
                        focal_point_agency, created_at, updated_at)
                    values (?,?,current_date,?,?,?,?,?,?,?,?,?::json,?::json,?::json,?::json,'Government',?,?,now(),now())
                    """, p.hazard(), p.hazard(), p.council(), p.coverage(), p.people(), p.budget(),
                    "Anticipatory action plan for " + p.hazard().toLowerCase() + " in " + p.council() + ".",
                    p.status(), p.trigger(), p.window(),
                    objectMapper.writeValueAsString(List.of(p.council())),
                    objectMapper.writeValueAsString(p.activities()),
                    objectMapper.writeValueAsString(p.actors()),
                    objectMapper.writeValueAsString(p.channels()),
                    p.closure(), p.focalAgency());
        }
        log.info("local seed: {} anticipatory action plans", plans.size());
    }

    /** The 5 alert templates from the source seeder, verbatim (R9 communication center). */
    private void seedAlertTemplates() throws Exception {
        Long existing = jdbc.queryForObject("select count(*) from public.alert_templates", Long.class);
        if (existing != null && existing > 0) {
            return;
        }
        record Template(String name, String type, String title, String message) {}
        List<Template> templates = List.of(
            new Template("Emergency Evacuation", "evacuation", "URGENT: Immediate Evacuation Required",
                "EMERGENCY ALERT: {incident_title} reported at {location}. All residents in {district} district are advised to evacuate immediately. Follow official evacuation routes and proceed to designated safe zones. Time: {time}, Date: {date}. Contact emergency hotline for assistance."),
            new Template("Severe Weather Warning", "warning", "Weather Warning: Severe Conditions Expected",
                "WEATHER WARNING: {incident_title} expected in {location}, {district} district. Severity: {severity}. Please take necessary precautions and stay indoors. Monitor official channels for updates. Alert issued at {time} on {date}."),
            new Template("Resource Distribution", "update", "Relief Resources Available",
                "INFORMATION: Relief resources are now available at {location} for those affected by {incident_title}. Distribution begins at {time}. Please bring identification. Contact {contact_person} at {contact_phone} for more information."),
            new Template("Situation Update", "update", "Situation Update: Current Status",
                "UPDATE: {incident_title} situation at {location}. Current status: {severity} level. Response teams are on site. Affected areas: {district} district. Latest update as of {time}, {date}. Stay tuned for further updates."),
            new Template("All Clear Notice", "all_clear", "All Clear: Situation Resolved",
                "ALL CLEAR: The {incident_title} situation at {location} has been resolved. It is now safe to return to normal activities. Thank you for your cooperation. Time: {time}, Date: {date}."));
        for (Template t : templates) {
            List<String> vars = new java.util.ArrayList<>();
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("\\{(\\w+)}").matcher(t.message());
            while (m.find()) {
                if (!vars.contains(m.group(1))) {
                    vars.add(m.group(1));
                }
            }
            jdbc.update("""
                    insert into public.alert_templates(name, type, category, subject, content, title, message,
                        variables, is_active, created_by, created_at, updated_at)
                    values (?,?,?,?,?,?,?,?::json, true, 1, now(), now())
                    """, t.name(), t.type(), t.type(), t.title(), t.message(), t.title(), t.message(),
                    objectMapper.writeValueAsString(vars));
        }
        log.info("local seed: {} alert templates", templates.size());
    }

    /**
     * R5 dispatch sources: stock a temporary warehouse and list agency-held
     * resources so every source type appears in the dispatch console locally.
     */
    private void seedDispatchSources() {
        Long agencyStock = jdbc.queryForObject("select count(*) from public.agency_resources", Long.class);
        if (agencyStock != null && agencyStock > 0) {
            return;
        }
        // Agency-held stock: first two agencies each offer tents and water from the catalogue
        jdbc.update("""
                insert into public.agency_resources(agency_id, resource_id, quantity, condition_status,
                    location_description, latitude, longitude, created_at, updated_at)
                select a.id, r.id, 150, 'Good',
                       'Central store — ' || a.name, -6.7924, 39.2083, now(), now()
                from (select id, name from public.agencies order by id limit 2) a
                cross join (select id from public.resources where name ilike '%tent%' or name ilike '%water%'
                            order by id limit 2) r
                """);
        // Temporary-warehouse stock so the temp source and its manager gate are exercisable
        jdbc.update("""
                insert into public.inventory_items(resource_id, temporary_warehouse_id, warehouse_type,
                    item_name, quantity, minimum_threshold, status, received_date, created_at, updated_at)
                select r.id, tw.id, 'temporary', r.name, 80, 10, 'Good Condition', current_date, now(), now()
                from (select id from public.temporary_warehouses where is_active = true order by id limit 1) tw
                cross join (select id, name from public.resources order by id limit 3) r
                where not exists (select 1 from public.inventory_items where temporary_warehouse_id = tw.id)
                """);
        log.info("local seed: dispatch sources (agency stock + temporary warehouse stock)");
    }

    /** 15 DRFs + default tasks, updateOrCreate-by-number exactly like the source seeder. */
    private void seedDisasterResponseFunctions() throws Exception {
        Long existing = jdbc.queryForObject("select count(*) from public.disaster_response_functions", Long.class);
        if (existing != null && existing > 0) {
            log.info("local seed: DRFs present, skipping");
            return;
        }
        List<Map<String, Object>> functions = readJson("local-seed/drf-functions.json");
        for (Map<String, Object> fn : functions) {
            Long drfId = jdbc.queryForObject("""
                    insert into public.disaster_response_functions(number, name, lead_agency_name,
                        description, icon, color, created_at, updated_at)
                    values (?,?,?,?,?,?,now(),now()) returning id
                    """, Long.class,
                    fn.get("number"), fn.get("name"), fn.get("lead_agency_name"),
                    fn.get("description"), fn.get("icon"), fn.get("color"));
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> tasks = (List<Map<String, Object>>) fn.get("tasks");
            for (Map<String, Object> task : tasks) {
                jdbc.update("""
                        insert into public.drf_default_tasks(drf_id, title, is_72hr_critical,
                            default_priority, sort_order, created_at, updated_at)
                        values (?,?,?,?,?,now(),now())
                        """, drfId, task.get("title"), task.get("is_72hr_critical"),
                        task.get("default_priority"), task.get("sort_order"));
            }
        }
        log.info("local seed: {} DRFs with default tasks", functions.size());
    }

    /** The relief resource catalogue; existing rows (preparedness stub) get their missing columns filled. */
    private void seedResources() throws Exception {
        // Earlier seeders inserted rows with explicit ids; realign the sequence before inserting.
        jdbc.execute("select setval('resources_id_seq', greatest((select coalesce(max(id),0) from public.resources), 1))");
        List<Map<String, Object>> resources = readJson("local-seed/response-resources.json");
        int inserted = 0;
        for (Map<String, Object> r : resources) {
            int updated = jdbc.update("""
                    update public.resources set category = ?, description = ?, unit_of_measure = ?,
                        low_stock_threshold = ?, updated_at = now()
                    where name = ? and unit_of_measure is null
                    """, r.get("category"), r.get("description"), r.get("unit_of_measure"),
                    r.get("low_stock_threshold"), r.get("name"));
            if (updated == 0) {
                inserted += jdbc.update("""
                        insert into public.resources(name, category, description, unit_of_measure,
                            low_stock_threshold, unit_cost, created_at, updated_at)
                        select ?,?,?,?,?,0,now(),now()
                        where not exists (select 1 from public.resources where name = ?)
                        """, r.get("name"), r.get("category"), r.get("description"),
                        r.get("unit_of_measure"), r.get("low_stock_threshold"), r.get("name"));
            }
        }
        if (inserted > 0) {
            log.info("local seed: {} relief resources", inserted);
        }
        // Backfill indicative unit costs (TZS) so the Resource Allocation Report's value column is
        // meaningful — the catalogue JSON carries no price. Category-based, idempotent (only null/0).
        int priced = jdbc.update("""
                update public.resources set unit_cost = case category
                        when 'Emergency Shelter'           then 85000
                        when 'Food Items'                  then 4500
                        when 'Non-Food Items'              then 22000
                        when 'Search and Rescue Equipment' then 350000
                        else 15000 end,
                    updated_at = now()
                where unit_cost is null or unit_cost = 0
                """);
        if (priced > 0) {
            log.info("local seed: backfilled unit_cost on {} resources", priced);
        }
    }

    /** Local fixture: incident types mirror the hazard registry (source leaves these to admin CRUD). */
    private void seedIncidentTypes() {
        Long existing = jdbc.queryForObject("select count(*) from public.incident_types", Long.class);
        if (existing != null && existing > 0) {
            return;
        }
        record T(String name, String severity, String icon) { }
        List<T> types = List.of(
                new T("Flood", "High", "fas fa-water"),
                new T("Fire", "High", "fas fa-fire"),
                new T("Earthquake", "Critical", "fas fa-house-crack"),
                new T("Epidemic / Disease Outbreak", "Critical", "fas fa-virus"),
                new T("Drought", "Moderate", "fas fa-sun"),
                new T("Landslide", "High", "fas fa-mountain"),
                new T("Strong Winds / Storm", "Moderate", "fas fa-wind"),
                new T("Marine / Transport Accident", "High", "fas fa-ship"));
        for (T t : types) {
            jdbc.update("""
                    insert into public.incident_types(name, default_severity, icon_class, created_at, updated_at)
                    values (?,?,?,now(),now()) on conflict (name) do nothing
                    """, t.name(), t.severity(), t.icon());
        }
        log.info("local seed: {} incident types", types.size());
    }

    /**
     * Three demo incidents covering the workflow spectrum (approved+active, waiting national
     * approval, draft) so dashboards, approval queues and maps render real rows locally.
     */
    private void seedDemoIncidents() {
        Long existing = jdbc.queryForObject(
                "select count(*) from public.incidents where source_of_report = 'Local Seed'", Long.class);
        if (existing != null && existing > 0) {
            return;
        }
        Long floodType = typeId("Flood");
        Long fireType = typeId("Fire");
        Long windType = typeId("Strong Winds / Storm");
        Long adminId = jdbc.query("select id from public.users where email = 'admin@example.com'",
                rs -> rs.next() ? rs.getLong(1) : null);
        Long region = jdbc.query("select id from public.regions order by id limit 1",
                rs -> rs.next() ? rs.getLong(1) : null);
        Long district = region == null ? null : jdbc.query(
                "select id from public.districts where region_id = ? order by id limit 1",
                rs -> rs.next() ? rs.getLong(1) : null, region);

        jdbc.update("""
                insert into public.incidents(title, incident_type_id, location_description, district_name,
                    region_name, region_id, district_id, latitude, longitude, reported_at, description,
                    severity_level, status, workflow_status, origin_level, source_of_report,
                    submitted_by_user_id, submitted_at, deaths_total, injured_total, displaced,
                    created_at, updated_at)
                values
                ('Msimbazi River flooding — Jangwani ward', ?, 'Jangwani lowlands along Msimbazi river basin',
                 'Kinondoni', 'Dar es Salaam', ?, ?, -6.8076, 39.2581, now() - interval '3 days',
                 'Flash floods after sustained heavy rainfall; households inundated and Morogoro road impassable.',
                 'Major', 'Active', 'approved', 'district', 'Local Seed', ?, now() - interval '3 days',
                 2, 14, 420, now() - interval '3 days', now() - interval '1 day'),
                ('Market fire — Kariakoo trading area', ?, 'Kariakoo market block C',
                 'Ilala', 'Dar es Salaam', ?, ?, -6.8235, 39.2695, now() - interval '1 day',
                 'Overnight fire destroyed trading stalls; cause under investigation.',
                 'Moderate', 'Reported', 'waiting_eocc', 'district', 'Local Seed',
                 ?, now() - interval '1 day', 0, 3, 0, now() - interval '1 day', now()),
                ('Windstorm roof damage — Dodoma Urban schools', ?, 'Three primary schools around Dodoma CBD',
                 'Dodoma Urban', 'Dodoma', ?, ?, -6.1722, 35.7395, now() - interval '6 hours',
                 'Strong winds removed roofing sheets at three schools; classes suspended.',
                 'Minor', 'Reported', 'draft', 'district', 'Local Seed',
                 ?, null, 0, 0, 0, now() - interval '6 hours', now())
                """,
                floodType, region, district, adminId,
                fireType, region, district, adminId,
                windType, region, district, adminId);
        log.info("local seed: 3 demo incidents (approved / waiting approval / draft)");
    }

    private Long typeId(String name) {
        return jdbc.query("select id from public.incident_types where name = ?",
                rs -> rs.next() ? rs.getLong(1) : null, name);
    }

    private List<Map<String, Object>> readJson(String classpath) throws Exception {
        try (var in = new ClassPathResource(classpath).getInputStream()) {
            return objectMapper.readValue(in, new TypeReference<>() { });
        }
    }
}
