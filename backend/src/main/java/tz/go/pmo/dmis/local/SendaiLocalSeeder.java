package tz.go.pmo.dmis.local;

import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Seeds the Sendai layer of the disaster repository:
 *
 * <ul>
 *   <li>the official Sendai Framework global indicator reference (A-1 … G-6) used by the
 *       analytics UI to label every figure with its Monitor indicator;</li>
 *   <li>national baselines for normalization — population (2022 census) and GDP — the
 *       denominators of indicators A-1, B-1 and C-1;</li>
 *   <li>two REAL, fully sourced disaster event cards (Hanang landslide 2023; the 2023/24
 *       El Niño floods) entered exactly as an EOCC officer would: per-area effects with
 *       provenance, then validated. Figures match the public record (IFRC MDRTZ035, the
 *       PM's 25 Apr 2024 statement to Parliament, OCHA flash updates, The Citizen).</li>
 * </ul>
 *
 * Idempotent: indicators upsert by code; events skip when their name already exists.
 */
@Component
@Profile("local")
@Order(24)
@RequiredArgsConstructor
public class SendaiLocalSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(SendaiLocalSeeder.class);

    private final JdbcTemplate jdbc;

    @Override
    public void run(String... args) {
        seedIndicators();
        seedBaselines();
        seedRealEvents();
        validatePending();
        seedHistoricalEvents();
    }

    /**
     * The El Niño 2024 card was left in 'Open' status (so the Sendai analytics counted only the
     * Hanang landslide). Its effects are fully sourced — validate it so 2024 enters the picture.
     */
    private void validatePending() {
        int n = jdbc.update("update disaster_events set status='Validated',"
                + " validated_by='EOCC (seed: public record)', validated_at=now()"
                + " where event_code='DE-2024-0001' and status <> 'Validated'");
        if (n > 0) {
            log.info("sendai seed: validated the El Niño 2024 card (was Open)");
        }
    }

    /**
     * Six more REAL, sourced national disaster event cards spanning 2015–2024 so the Sendai
     * analytics shows a meaningful multi-year, multi-hazard loss picture (not a single 2023 point):
     * 2015–16 cholera epidemic, 2016 Kagera earthquake, 2020 Lake Victoria floods, 2022 drought,
     * 2022 Kilimanjaro wildfire and 2024 Cyclone Hidaya (the first cyclone to make landfall in
     * Tanzania). Idempotent per event_code, validated on insert. Figures are the published record;
     * where a figure was not published the column is zero and the note says so.
     */
    private void seedHistoricalEvents() {
        int seeded = 0;

        // ---- 2015–16 cholera epidemic (WHO AFRO; US CDC MMWR) ----
        Long cholera = eventIfAbsent("DE-2015-0001", "Cholera Epidemic, 2015–2016", hazardId("Epidemic"),
                "2015-08-15", "2016-12-31", "Dar es Salaam", "National",
                "Nationwide cholera epidemic that began in Dar es Salaam and spread to 23 mainland regions and "
                        + "Zanzibar — the country's largest in years.",
                "Contaminated water and sanitation gaps amid heavy seasonal rains (WASH-driven)",
                "WHO Regional Office for Africa (22 Apr 2016); US CDC MMWR Notes from the Field 2015–2016");
        if (cholera != null) {
            jdbc.update(EFFECTS_INSERT, cholera, "National (23 regions + Zanzibar)", null,
                    0, 0, 378, 0,                  // deaths m/f/total, missing
                    24_108, 0, 0, 0,               // injured/ill (cases), affected, displaced, relocated
                    0, 0,                          // children, pwd
                    0, 0,                          // houses
                    0, 0, 0, 0, 0, 0, 0,           // sector losses TZS, livestock, crops ha
                    0, 0, 0, 0, 0, 0,              // facilities / infra
                    "[\"Health\",\"Water\"]",
                    "WHO AFRO: as of 20 Apr 2016, 24,108 cases incl. 378 deaths nationwide (mainland 20,961/329; "
                            + "Unguja 1,818/38; Pemba 1,239/13). Began 15 Aug 2015 in Dar es Salaam; CFR ~1.6%. Cases "
                            + "recorded under injured/ill (indicator B-2).",
                    "WHO AFRO Cholera Tanzania, 22 Apr 2016");
            validate(cholera);
            seeded++;
        }

        // ---- 2016 Kagera (Bukoba) earthquake, Mw5.9 (USGS; ReliefWeb; AfDB; Al Jazeera) ----
        Long quake = eventIfAbsent("DE-2016-0001", "Kagera (Bukoba) Earthquake, September 2016", hazardId("Earthquake"),
                "2016-09-10", "2016-09-10", "Kagera", "Regional",
                "Mw5.9 earthquake 21 km NE of Nsunga struck Bukoba and surrounding Kagera Region — the first "
                        + "major seismic event in Tanzania in over a decade.",
                "Tectonic activity along the East African Rift (Lake Victoria sub-region)",
                "USGS; Wikipedia 2016 Tanzania earthquake; ReliefWeb EQ-2016-000098-TZA; AfDB humanitarian assistance");
        if (quake != null) {
            jdbc.update(EFFECTS_INSERT, quake, "Kagera", "Bukoba",
                    0, 0, 19, 0,                   // deaths total, missing
                    253, 85_000, 12_500, 0,        // injured, directly affected, displaced (~2,500 hh×5), relocated
                    0, 0,                          // children, pwd
                    2_500, 14_500,                 // houses destroyed / partially damaged
                    0, 0, 0, 0, 0, 0, 0,           // sector losses (not published in TZS)
                    0, 0, 0, 0, 0, 0,              // facilities / infra (see note: 1,700 govt buildings)
                    "[\"Health\",\"Education\",\"Power\"]",
                    "USGS Mw5.9, 10 Sep 2016. 19 dead, 253 injured in Bukoba (+4 dead in Rakai, Uganda). Government "
                            + "assessment: 2,500+ houses destroyed, 14,500+ partially damaged, 9,000+ cracked and 1,700 "
                            + "government buildings damaged. AfDB emergency assistance followed. Economic loss not "
                            + "published in TZS.",
                    "ReliefWeb EQ-2016-000098-TZA; AfDB; Al Jazeera (Sep 2016)");
            validate(quake);
            seeded++;
        }

        // ---- 2020 Lake Victoria / East Africa floods (Copernicus ESD; Wikipedia; The Citizen; FloodList) ----
        Long flood2020 = eventIfAbsent("DE-2020-0001", "Lake Victoria & Rufiji Floods, 2020", hazardId("Floods"),
                "2020-03-01", "2020-05-31", "Pwani", "National",
                "Record-high Lake Victoria levels and overflowing rivers flooded shoreline and downstream "
                        + "districts; Rufiji River broke its banks after dam releases and heavy rain.",
                "Late-2019–mid-2020 exceptional rainfall (record Lake Victoria levels, May 2020)",
                "Copernicus ESD 2024; Wikipedia 2020 East Africa floods; The Citizen; FloodList");
        if (flood2020 != null) {
            jdbc.update(EFFECTS_INSERT, flood2020, "Pwani", "Rufiji",
                    0, 0, 0, 0,
                    0, 17_500, 3_500, 0,           // affected (~3,500 hh×5), displaced households
                    0, 0,
                    3_500, 0,                      // houses swept away
                    0, 0, 6_600, 0, 0, 0, 0,       // crops_destroyed_ha 6,600
                    0, 0, 0, 0, 0, 0,
                    "[\"Transport\",\"Agriculture\"]",
                    "Rufiji River broke its banks (dam release + heavy rain): 3,500 houses and 6,600 ha of farms "
                            + "swept away; hundreds displaced to shelters/public buildings.",
                    "The Citizen; FloodList Tanzania (Mar 2020)");
            jdbc.update(EFFECTS_INSERT, flood2020, "Kagera & Lake zone (Mara/Mwanza)", null,
                    0, 0, 0, 0,
                    0, 60_000, 8_000, 0,
                    0, 0,
                    0, 5_000,                      // shoreline houses damaged
                    0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0,
                    "[\"Transport\",\"Water\"]",
                    "Lake Victoria reached record levels (May 2020); shoreline and tributary flooding across "
                            + "Kagera/Mara/Mwanza. The 2020 East Africa floods displaced >1M regionally; Tanzania-only "
                            + "death toll not separately published.",
                    "Copernicus ESD 2024; Wikipedia 2020 East Africa floods");
            validate(flood2020);
            seeded++;
        }

        // ---- 2022 drought / food insecurity (IFRC DREF MDRTZ030; IPC) ----
        Long drought = eventIfAbsent("DE-2022-0001", "Drought & Food Insecurity, 2022", hazardId("Drought"),
                "2022-01-01", "2022-12-31", "Manyara", "National",
                "Prolonged drought across 10+ semi-arid districts of the northern and central regions drove "
                        + "acute food insecurity and heavy livestock losses.",
                "Consecutive below-normal rainfall seasons (semi-arid northern & central corridor)",
                "IFRC DREF MDRTZ030; IPC Acute Food Insecurity (Oct 2022–May 2023); ReliefWeb");
        if (drought != null) {
            jdbc.update(EFFECTS_INSERT, drought, "Manyara, Arusha, Kilimanjaro, Tanga (semi-arid)", null,
                    0, 0, 0, 0,
                    0, 2_000_000, 0, 0,            // >2M food-insecure (directly affected)
                    0, 0,
                    0, 0,
                    0, 306_358, 0, 0, 0, 0, 0,     // livestock_lost 306,358
                    0, 0, 0, 0, 0, 0,
                    "[\"Food\",\"Water\",\"Agriculture\"]",
                    "DREF MDRTZ030 / IPC: >2M people food-insecure (17% of analysed pop.) across 10+ semi-arid "
                            + "districts. Livestock deaths Sep 2021–Jan 2022: 157,695 cattle, 94,230 sheep, 48,290 "
                            + "goats, 6,135 donkeys, 8 camels (= 306,358). No direct deaths attributed.",
                    "IFRC DREF MDRTZ030; IPC Oct 2022–May 2023");
            validate(drought);
            seeded++;
        }

        // ---- 2022 Mount Kilimanjaro wildfire (VOA; AFP/Phys.org; ABC News) ----
        Long fire = eventIfAbsent("DE-2022-0002", "Mount Kilimanjaro Wildfire, October 2022", hazardId("Wildfire"),
                "2022-10-21", "2022-11-04", "Kilimanjaro", "Regional",
                "Wildfire on Mount Kilimanjaro burned montane forest and moorland inside the national park; "
                        + "contained after ~two weeks by army, rangers and community volunteers.",
                "Dry-season fire ignited near Karanga (~4,000 m), likely human activity",
                "VOA; AFP/Phys.org; ABC News (Oct–Nov 2022)");
        if (fire != null) {
            jdbc.update(EFFECTS_INSERT, fire, "Kilimanjaro", "Kilimanjaro National Park",
                    0, 0, 0, 0,
                    0, 0, 0, 0,
                    0, 0,
                    0, 0,
                    0, 0, 3_300, 0, 0, 0, 0,       // ~3,300 ha (33 km²) forest/moorland — recorded in crops_destroyed_ha
                    0, 0, 0, 0, 0, 0,
                    "[\"Environment\",\"Tourism\"]",
                    "From 21 Oct 2022 at Karanga (~4,000 m); ~33 km² (≈3,300 ha) of montane forest/moorland in "
                            + "Kilimanjaro NP burned (TANAPA initially cited ~700 acres). ~500 personnel + army "
                            + "contained it after ~2 weeks; no casualties. The 'crops_destroyed_ha' field records "
                            + "forest area for this environmental loss.",
                    "VOA; AFP/Phys.org; ABC News (Oct–Nov 2022)");
            validate(fire);
            seeded++;
        }

        // ---- 2024 Cyclone Hidaya — first cyclone to make landfall in Tanzania (The EastAfrican; Earth.org) ----
        Long hidaya = eventIfAbsent("DE-2024-0002", "Cyclone Hidaya, May 2024", hazardId("Cyclone"),
                "2024-05-03", "2024-05-04", "Pwani", "Regional",
                "Tropical Cyclone Hidaya made landfall on Mafia Island and the southern coast — the first "
                        + "documented tropical cyclone to reach that status and make landfall in Tanzania.",
                "Tropical Cyclone Hidaya (SW Indian Ocean), amid the 2024 El Niño rains",
                "The EastAfrican; Earth.org; Yale Climate Connections; France 24 (May 2024)");
        if (hidaya != null) {
            jdbc.update(EFFECTS_INSERT, hidaya, "Pwani (Mafia) & southern coast", "Mafia",
                    0, 0, 2, 0,                    // 2 dead
                    7, 18_862, 2_000, 0,           // 7 injured, 18,862 affected, ~2,000 displaced
                    0, 0,
                    678, 1_420,                    // 678 destroyed; 877 damaged + 543 submerged = 1,420
                    0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0,
                    "[\"Transport\",\"Power\",\"Fisheries\"]",
                    "First documented tropical cyclone to make landfall in Tanzania (Mafia Island, 4 May 2024). "
                            + "2 dead, 7 injured, 18,862 affected; 678 houses destroyed, 877 damaged, 543 submerged. "
                            + ">3.5in rain in Mtwara (2× the May norm); dissipated rapidly after landfall.",
                    "The EastAfrican; Earth.org; France 24 (May 2024)");
            validate(hidaya);
            seeded++;
        }

        // ---- 2018 MV Nyerere ferry disaster, Lake Victoria (VOA; CNN; CBS; TRT) ----
        // Marine/transport disaster — recorded under the registry's Industrial Accident (technological) hazard.
        Long ferry = eventIfAbsent("DE-2018-0001", "MV Nyerere Ferry Disaster, September 2018", hazardId("Industrial Accident"),
                "2018-09-20", "2018-09-20", "Mwanza", "Regional",
                "The overloaded ferry MV Nyerere capsized on Lake Victoria on the Ukara–Ukerewe route, ~55 m "
                        + "from the dock, on a busy market day — one of Tanzania's deadliest transport disasters.",
                "Severe overloading and an untrained helmsman (technological/transport accident)",
                "VOA; CNN; CBS News; TRT World (Sep 2018)");
        if (ferry != null) {
            jdbc.update(EFFECTS_INSERT, ferry, "Mwanza", "Ukerewe",
                    0, 0, 224, 0,                  // 224 dead
                    41, 300, 0, 0,                 // ~41 rescued; est. 300+ aboard (capacity 101)
                    0, 0,
                    0, 0,
                    0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0,
                    "[\"Transport\"]",
                    "MV Nyerere capsized on Lake Victoria, 20 Sep 2018, ~55 m from the Ukara dock (Ukara–Ukerewe "
                            + "route). 224 dead; ~41 rescued. Overloaded — capacity 101, an estimated 300+ aboard on "
                            + "market day. President Magufuli ordered arrests; overloading + untrained helmsman cited. "
                            + "Recorded under Industrial/technological accident (no marine-transport hazard in the registry).",
                    "VOA; CNN; CBS News; TRT World (Sep 2018)");
            validate(ferry);
            seeded++;
        }

        // ---- 2019 Morogoro fuel-tanker explosion (Wikipedia; VOA; Bloomberg; The EastAfrican) ----
        Long tanker = eventIfAbsent("DE-2019-0001", "Morogoro Fuel Tanker Explosion, August 2019", hazardId("Industrial Accident"),
                "2019-08-10", "2019-08-10", "Morogoro", "District",
                "A fuel tanker overturned and exploded near Msamvu bus terminal, Morogoro, as a crowd gathered "
                        + "to siphon spilt fuel — a major technological disaster.",
                "Tanker crash then explosion ~20 minutes later as people collected fuel",
                "Wikipedia Morogoro tanker explosion; VOA; Bloomberg; The EastAfrican (Aug 2019)");
        if (tanker != null) {
            jdbc.update(EFFECTS_INSERT, tanker, "Morogoro", "Morogoro Municipal",
                    0, 0, 89, 0,                   // ~89 dead (reports 60–100+)
                    66, 155, 0, 0,                 // 66+ injured
                    0, 0,
                    0, 0,
                    0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0,
                    "[\"Transport\"]",
                    "Fuel tanker overturned near Msamvu bus terminal, Morogoro, 10 Aug 2019; exploded ~20 min later "
                            + "as a crowd siphoned fuel. Death toll climbed to ~89 (reports range 60–100+); 66+ injured. "
                            + "Most victims were boda-boda riders and people collecting fuel.",
                    "Wikipedia Morogoro tanker explosion; VOA; Bloomberg (Aug 2019)");
            validate(tanker);
            seeded++;
        }

        // ---- 2024 Kariakoo building collapse, Dar es Salaam (The Citizen; The Chanzo; allAfrica; AFP) ----
        Long kariakoo = eventIfAbsent("DE-2024-0003", "Kariakoo Building Collapse, November 2024", hazardId("Building Collapse"),
                "2024-11-16", "2024-11-26", "Dar es Salaam", "District",
                "A four-storey commercial building housing dozens of shops collapsed in Kariakoo, Ilala, Dar es "
                        + "Salaam; a 10-day rescue followed.",
                "Structural failure of a multi-storey commercial building (construction/compliance)",
                "The Citizen; The Chanzo; allAfrica; AFP (Nov 2024)");
        if (kariakoo != null) {
            jdbc.update(EFFECTS_INSERT, kariakoo, "Dar es Salaam", "Ilala (Kariakoo)",
                    0, 0, 29, 0,                   // 29 dead
                    84, 200, 0, 0,                 // 84+ rescued from rubble (treated); ~200 shop owners/occupants affected
                    0, 0,
                    1, 0,                           // the building itself (dozens of shops within)
                    0, 0, 0, 0, 0, 0, 0,
                    0, 0, 0, 0, 0, 0,
                    "[\"Commerce\"]",
                    "A 4-storey commercial building (dozens of shops) collapsed in Kariakoo, Ilala, Dar es Salaam, "
                            + "16 Nov 2024. Rescue ran ~10 days: 29 dead, 84+ rescued from the rubble. Building owner "
                            + "arrested; President Samia ordered an audit of all Kariakoo buildings. (Referenced as the "
                            + "'Kariakoo fire' — the documented event is a structural collapse.)",
                    "The Citizen; The Chanzo; allAfrica; AFP (Nov 2024)");
            validate(kariakoo);
            seeded++;
        }

        if (seeded > 0) {
            log.info("sendai seed: {} historical validated event cards (2015–2024, multi-hazard)", seeded);
        }
    }

    /** Insert an event only if its code is absent; returns the new id, or null if it already exists. */
    private Long eventIfAbsent(String code, String name, Long hazardId, String start, String end, String region,
                               String scope, String description, String trigger, String source) {
        Long existing = jdbc.query("select id from disaster_events where event_code = ?",
                rs -> rs.next() ? rs.getLong(1) : null, code);
        if (existing != null) {
            return null;
        }
        return event(code, name, hazardId, start, end, region, scope, description, trigger, source);
    }

    // ------------------------------------------------------------------ indicator reference

    private void seedIndicators() {
        ind("A-1", 'A', "Number of deaths and missing persons attributed to disasters, per 100,000 population", "per 100,000", "repository: deaths_total + missing_total ÷ population baseline");
        ind("A-2", 'A', "Number of deaths attributed to disasters", "count", "repository: deaths_total (sex-disaggregated)");
        ind("A-3", 'A', "Number of missing persons attributed to disasters", "count", "repository: missing_total");
        ind("B-1", 'B', "Number of directly affected people attributed to disasters, per 100,000 population", "per 100,000", "repository: directly_affected + displaced + relocated");
        ind("B-2", 'B', "Number of injured or ill people attributed to disasters", "count", "repository: injured_total");
        ind("B-3", 'B', "Number of people whose damaged dwellings were attributed to disasters", "count", "repository: houses_damaged");
        ind("B-4", 'B', "Number of people whose destroyed dwellings were attributed to disasters", "count", "repository: houses_destroyed");
        ind("B-5", 'B', "Number of people whose livelihoods were disrupted or destroyed, attributed to disasters", "count", "repository: directly_affected + crops/livestock fields");
        ind("C-1", 'C', "Direct economic loss attributed to disasters in relation to GDP", "% of GDP", "repository: total_loss_tzs ÷ GDP baseline");
        ind("C-2", 'C', "Direct agricultural loss attributed to disasters", "TZS", "repository: agriculture_loss_tzs, crops_destroyed_ha, livestock_lost");
        ind("C-3", 'C', "Direct economic loss to other damaged or destroyed productive assets", "TZS", "repository: other_loss_tzs");
        ind("C-4", 'C', "Direct economic loss in the housing sector", "TZS", "repository: housing_loss_tzs");
        ind("C-5", 'C', "Direct economic loss from damaged or destroyed critical infrastructure", "TZS", "repository: infrastructure_loss_tzs");
        ind("C-6", 'C', "Direct economic loss to cultural heritage damaged or destroyed", "TZS", "repository: other_loss_tzs (flag in notes)");
        ind("D-1", 'D', "Damage to critical infrastructure attributed to disasters", "count / km", "repository: roads_km_damaged, bridges, water & power systems");
        ind("D-2", 'D', "Number of destroyed or damaged health facilities attributed to disasters", "count", "repository: health_facilities_damaged");
        ind("D-3", 'D', "Number of destroyed or damaged educational facilities attributed to disasters", "count", "repository: schools_damaged");
        ind("D-4", 'D', "Number of other destroyed or damaged critical infrastructure units", "count", "repository: bridges + water + power systems");
        ind("D-5", 'D', "Number of disruptions to basic services attributed to disasters", "count", "repository: services_disrupted");
        ind("D-6", 'D', "Number of disruptions to educational services attributed to disasters", "count", "repository: services_disrupted contains Education");
        ind("D-7", 'D', "Number of disruptions to health services attributed to disasters", "count", "repository: services_disrupted contains Health");
        ind("D-8", 'D', "Number of disruptions to other basic services attributed to disasters", "count", "repository: services_disrupted (Water/Power/Transport/Telecoms)");
        ind("E-1", 'E', "Countries with national and local disaster risk reduction strategies", "yes/no + count", "frameworks registry: strategies, policies, guidelines on record");
        ind("E-2", 'E', "Percentage of local governments adopting local DRR strategies", "%", "threat_plans + frameworks by region/LGA");
        ind("F-1", 'F', "Total official international support (ODA plus other official flows) for national disaster risk reduction actions", "USD", "partners + NDMF donations (proxy until DRF finance module)");
        ind("F-2", 'F', "Total official international support (ODA plus other official flows) for national disaster risk reduction actions provided by multilateral agencies", "USD", "NDMF donations where the donor is a multilateral agency (UN/WB/AfDB)");
        ind("F-3", 'F', "Total official international support (ODA plus other official flows) for national disaster risk reduction actions provided bilaterally", "USD", "NDMF donations where the donor is a bilateral partner government");
        ind("F-4", 'F', "Total official international support (ODA plus other official flows) for the transfer and exchange of disaster risk reduction-related technology", "USD", "partner technology-transfer support (EW engine, GIS, monitoring)");
        ind("F-5", 'F', "Number of international, regional and bilateral programmes and initiatives for the transfer and exchange of science, technology and innovation in disaster risk reduction for developing countries", "count", "registered partner STI/DRR programmes");
        ind("F-6", 'F', "Total official international support (ODA plus other official flows) for disaster risk reduction-related capacity-building", "USD", "partner-funded training & capacity-building (trainings registry)");
        ind("F-7", 'F', "Number of international, regional and bilateral programmes and initiatives for disaster risk reduction-related capacity-building in developing countries", "count", "registered partner capacity-building programmes");
        ind("F-8", 'F', "Number of developing countries supported by international, regional and bilateral initiatives to strengthen their disaster risk reduction-related statistical capacity", "count", "DRR statistical-capacity support (this Sendai monitor is one such initiative)");
        ind("G-1", 'G', "Number of countries that have multi-hazard early warning systems", "score 0–1", "EW engine + dissemination operation (this system)");
        ind("G-2", 'G', "Number of countries that have multi-hazard monitoring and forecasting systems", "score 0–1", "EW engine: TMA-fed monitoring, threat watches");
        ind("G-3", 'G', "Number of people per 100,000 that are covered by early warning information through local governments or through national dissemination mechanisms", "per 100,000", "early_warnings.people_at_risk + alert subscriptions");
        ind("G-4", 'G', "Percentage of local governments having a plan to act on early warnings", "%", "LGAs with anticipatory/contingency plans linked to EW triggers");
        ind("G-5", 'G', "Number of countries that have accessible, understandable, usable and relevant disaster risk information and assessment available to the people at the national and local levels", "score 0–1", "public portal: hazard hubs, risk maps, Elimu");
        ind("G-6", 'G', "Percentage of population exposed to or at risk from disasters protected through pre-emptive evacuation following early warning", "%", "evacuation_centers usage + incident displaced figures");
        log.info("sendai seed: 38 indicator reference rows (A-1..G-6, full Sendai Framework set)");
    }

    private void ind(String code, char target, String title, String unit, String computedFrom) {
        jdbc.update("insert into sendai_indicators(code,target_letter,title,unit,computed_from)"
                        + " values (?,?,?,?,?) on conflict (code) do update set title = excluded.title,"
                        + " unit = excluded.unit, computed_from = excluded.computed_from",
                code, String.valueOf(target), title, unit, computedFrom);
    }

    // ------------------------------------------------------------------ baselines

    private void seedBaselines() {
        baseline("population", 2012, 44_928_923, "2012 Population and Housing Census (NBS)");
        baseline("population", 2015, 49_250_000, "NBS projection (approx.)");
        baseline("population", 2016, 50_500_000, "NBS projection (approx.)");
        baseline("population", 2020, 57_640_000, "UN/NBS projection (approx.)");
        baseline("population", 2022, 61_741_120, "2022 Population and Housing Census (NBS)");
        baseline("population", 2024, 65_000_000, "NBS projection (approx.)");
        baseline("gdp_tzs", 2016, 103_000_000_000_000.0, "World Bank 2016 (approx. TZS)");
        baseline("gdp_tzs", 2020, 148_000_000_000_000.0, "World Bank 2020 (approx. TZS)");
        baseline("gdp_tzs", 2023, 196_000_000_000_000.0, "World Bank 2023 (approx. TZS)");
        baseline("usd_rate", 2024, 2_600, "BoT average (approx.)");
    }

    private void baseline(String metric, int year, double value, String source) {
        jdbc.update("insert into sendai_baselines(metric,year,value,source) values (?,?,?,?)"
                + " on conflict on constraint uq_baseline do nothing", metric, year, value, source);
    }

    // ------------------------------------------------------------------ real event cards

    private void seedRealEvents() {
        Long n = jdbc.queryForObject("select count(*) from disaster_events", Long.class);
        if (n != null && n > 0) {
            return;
        }
        Long landslideHazard = hazardId("Landslide");
        Long floodHazard = hazardId("Floods");

        // ---- Hanang landslide, 3 December 2023 (figures: IFRC Revised Emergency Appeal MDRTZ035) ----
        // Only published figures are entered; sex disaggregation was not published, so deaths_total
        // carries the toll and the note says why the m/f columns are zero.
        Long hanang = event("DE-2023-0001", "Hanang Landslide (Katesh), December 2023", landslideHazard,
                "2023-12-03", "2023-12-05", "Manyara", "District",
                "Debris flow from Mount Hanang following extreme El Niño rainfall struck Katesh town and "
                        + "surrounding villages, Hanang District.",
                "El Niño-enhanced extreme rainfall (TMA heavy-rain warnings in effect)",
                "IFRC Revised Emergency Appeal MDRTZ035; Government sitreps");
        jdbc.update(EFFECTS_INSERT, hanang, "Manyara", "Hanang",
                0, 0, 89, 0,                       // deaths m/f (not published) /total, missing
                139, 44_000, 45_535, 5_750,        // injured, directly affected, displaced (9,107 hh ×5), relocated (1,150 hh ×5)
                0, 0,                              // children / PWD (not published)
                6_202, 2_905,                      // houses destroyed / damaged
                0, 0, 0, 0, 0, 0, 0,               // sector losses TZS (not published), livestock, crops ha
                0, 0, 0, 0, 0, 0,                  // facilities (not published as damaged)
                "[\"Education\",\"Health\"]",
                "Deaths 89 per IFRC final appeal (toll evolved 47→68→85→89); sex split not published."
                        + " 9,107 households displaced, 6,202 homes destroyed; ~1,150 households sheltered in"
                        + " 3 schools used as evacuation centres.",
                "IFRC MDRTZ035 Operation Update, 11 Dec 2023");
        validate(hanang);

        // ---- 2023/24 El Niño floods, April–May 2024 (PM statement 25 Apr 2024; OCHA; The Citizen) ----
        Long elnino = event("DE-2024-0001", "El Niño Floods, April–May 2024", floodHazard,
                "2024-04-01", "2024-05-15", "Pwani", "National",
                "Nationwide El Niño floods peaking in April 2024; worst hit were Rufiji and Kibiti (Pwani), "
                        + "with crops, roads, bridges and railways destroyed across 139 districts.",
                "El Niño seasonal rains (Masika), TMA warnings in effect since November 2023",
                "PM's statement to Parliament 25 Apr 2024; OCHA Flash Update #1 (3 May 2024); The Citizen (TZS 556bn)");
        jdbc.update(EFFECTS_INSERT, elnino, "Pwani", "Rufiji & Kibiti",
                0, 0, 0, 0,                        // deaths not published per district (counted in national record)
                0, 125_670, 5_000, 0,              // affected (OCHA 29 Apr), ~5,000 in temporary camps
                1_900, 0,                          // >1,900 schoolchildren affected by school closures
                0, 0,
                0, 0, 81_000, 0, 0, 0, 0,          // >200,000 acres ≈ 81,000 ha farmland affected
                0, 0, 0, 0, 0, 0,
                "[\"Education\",\"Transport\",\"Water\"]",
                "Rufiji: 25 villages, 23,000 households / 88,000 people in need; Kibiti: 10 villages."
                        + " 10 schools closed (7 Rufiji, 3 Kibiti) affecting >1,900 pupils. Deaths are carried"
                        + " in the national record (district split not published).",
                "OCHA Eastern Africa Flash Update #1, 3 May 2024");
        jdbc.update(EFFECTS_INSERT, elnino, "National (other regions)", null,
                0, 0, 155, 0,                      // PM, 25 Apr 2024: 155 dead (sex split not published)
                236, 74_330, 0, 0,                 // 236 injured; 200,000 affected minus the Pwani 125,670
                0, 0,
                0, 10_000,                         // >10,000 houses damaged
                0, 0, 0, 0, 556_000_000_000.0, 0, 556_000_000_000.0, // infrastructure loss: TZS 556bn road repairs
                0, 0, 827, 63, 0, 0,               // 827 km roads + 63 bridges damaged (139 districts)
                "[\"Transport\",\"Power\",\"Water\"]",
                "National figures (PM, 25 Apr 2024): 155 dead, 236 injured, >200,000 people (51,000 households)"
                        + " affected, >10,000 houses damaged. Post-disaster assessment: 63 bridges, 827 km roads,"
                        + " 84 km drainage and 225 culverts damaged across 139 districts; TZS 556bn emergency"
                        + " road repairs (The Citizen), supported by US$65m World Bank financing to TARURA.",
                "PM statement 25 Apr 2024 (CNN/Al Jazeera/AP); The Citizen; World Bank CRW note");
        validate(elnino);

        log.info("sendai seed: 2 real validated event cards (Hanang 2023, El Niño floods 2024) with sourced effects");
    }

    /**
     * Column order (after event_id, region, district):
     * deaths_male, deaths_female, deaths_total, missing | injured, directly_affected, displaced,
     * relocated | children, pwd | houses_destroyed, houses_damaged | agriculture_loss, livestock,
     * crops_ha, housing_loss, infrastructure_loss, other_loss, total_loss | schools, health,
     * roads_km, bridges, water, power | services, notes, source.
     */
    private static final String EFFECTS_INSERT =
            "insert into disaster_event_effects(event_id,region,district,"
                    + "deaths_male,deaths_female,deaths_total,missing_total,injured_total,directly_affected,"
                    + "displaced,relocated,children_affected,pwd_affected,houses_destroyed,houses_damaged,"
                    + "agriculture_loss_tzs,livestock_lost,crops_destroyed_ha,housing_loss_tzs,"
                    + "infrastructure_loss_tzs,other_loss_tzs,total_loss_tzs,schools_damaged,"
                    + "health_facilities_damaged,roads_km_damaged,bridges_damaged,water_systems_damaged,"
                    + "power_systems_damaged,services_disrupted,notes,source,created_at,updated_at)"
                    + " values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,now(),now())";

    private Long hazardId(String name) {
        List<Long> ids = jdbc.queryForList("select id from hazards where name ilike ? limit 1", Long.class, name + "%");
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Long event(String code, String name, Long hazardId, String start, String end, String region,
                       String scope, String description, String trigger, String source) {
        String hazardType = hazardId == null ? null
                : jdbc.queryForObject("select name from hazards where id = ?", String.class, hazardId);
        return jdbc.queryForObject(
                "insert into disaster_events(event_code,name,hazard_id,hazard_type,started_on,ended_on,"
                        + "primary_region,scope,description,triggering_event,data_source,status,recorded_by,"
                        + "created_at,updated_at)"
                        + " values (?,?,?,?,?::date,?::date,?,?,?,?,?,'Open','EOCC (seed: public record)',now(),now())"
                        + " returning id",
                Long.class, code, name, hazardId, hazardType, start, end, region, scope, description, trigger, source);
    }

    private void validate(Long eventId) {
        jdbc.update("update disaster_events set status='Validated',"
                + " validated_by='EOCC (seed: public record)', validated_at=now() where id=?", eventId);
    }
}
