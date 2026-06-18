package tz.go.pmo.dmis.local;

import java.util.Arrays;
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
 * Local-profile mirror of the existing app's {@code Database\Seeders\HazardSeeder} (15 hazards with the
 * full detail fields, values copied verbatim; the JSON fields are the seeder's comma-separated strings
 * split exactly as its {@code explode(', ')} does). Runs on ApplicationReadyEvent — i.e. after
 * {@link LocalDataSeeder} — because that seeder inserts hazard stubs with explicit ids. The two EW stub
 * names are corrected to their SRS names ({@code Hazard::NATURAL_HAZARDS}) with the minimal
 * name+type+category shape the real create form produces. Upserts by name; idempotent.
 */
@Component
@Profile("local")
@RequiredArgsConstructor
public class HazardLocalSeeder {

    private static final Logger log = LoggerFactory.getLogger(HazardLocalSeeder.class);

    private final JdbcTemplate jdbc;

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        Long seeded = jdbc.queryForObject(
                "select count(*) from public.hazards where name = 'Building Collapse'", Long.class);
        if (seeded != null && seeded > 0) {
            log.info("local seed: hazard registry present, skipping");
            return;
        }

        // EW stub rows used SRS hazard *names* loosely and category values as type — correct to the
        // real shape (type Natural/Human_induced..., category separate) without changing their ids,
        // since warning_hazards reference them.
        jdbc.update("update public.hazards set name='Heavy rainfall', type='Natural', category='Meteorological' "
                + "where name='Heavy rain'");
        jdbc.update("update public.hazards set name='Strong winds', type='Natural', category='Meteorological' "
                + "where name='Strong wind'");

        for (SeedHazard h : SEED) {
            upsert(h);
        }
        log.info("local seed: done ({} hazards from HazardSeeder)", SEED.size());
    }

    private void upsert(SeedHazard h) {
        // Sequence may lag behind the EW seeder's explicit-id inserts.
        jdbc.execute("select setval(pg_get_serial_sequence('public.hazards','id'),"
                + " greatest((select coalesce(max(id),1) from public.hazards), 1))");
        Long existing = jdbc.queryForObject("select count(*) from public.hazards where name = ?", Long.class, h.name);
        if (existing != null && existing > 0) {
            jdbc.update("update public.hazards set description=?, type=?, category=?, severity=?, frequency=?, "
                    + "warning_signs=?::json, impact_areas=?::json, typical_duration=?, seasonal_pattern=?, "
                    + "response_required=?::json, prevention_measures=?::json, historical_incidents=?::json, "
                    + "affected_sectors=?::json, vulnerability_factors=?::json, is_active=true, updated_at=now() "
                    + "where name=?",
                    h.description, h.type, h.category, h.severity, h.frequency,
                    json(h.warningSigns), json(h.impactAreas), h.typicalDuration, h.seasonalPattern,
                    json(h.responseRequired), json(h.preventionMeasures), json(h.historicalIncidents),
                    json(h.affectedSectors), json(h.vulnerabilityFactors), h.name);
        } else {
            jdbc.update("insert into public.hazards(name, description, type, category, severity, frequency, "
                    + "warning_signs, impact_areas, typical_duration, seasonal_pattern, response_required, "
                    + "prevention_measures, historical_incidents, affected_sectors, vulnerability_factors, "
                    + "is_active, created_at, updated_at) values (?,?,?,?,?,?,?::json,?::json,?,?,?::json,?::json,"
                    + "?::json,?::json,?::json,true,now(),now())",
                    h.name, h.description, h.type, h.category, h.severity, h.frequency,
                    json(h.warningSigns), json(h.impactAreas), h.typicalDuration, h.seasonalPattern,
                    json(h.responseRequired), json(h.preventionMeasures), json(h.historicalIncidents),
                    json(h.affectedSectors), json(h.vulnerabilityFactors));
        }
    }

    /** HazardSeeder: json_encode(explode(', ', $value)). */
    private String json(String commaSeparated) {
        List<String> parts = Arrays.asList(commaSeparated.split(", "));
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < parts.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            sb.append('"').append(parts.get(i).replace("\\", "\\\\").replace("\"", "\\\"")).append('"');
        }
        return sb.append(']').toString();
    }

    private record SeedHazard(String name, String description, String type, String category, String severity,
                              String frequency, String warningSigns, String impactAreas, String typicalDuration,
                              String seasonalPattern, String responseRequired, String preventionMeasures,
                              String historicalIncidents, String affectedSectors, String vulnerabilityFactors) {
    }

    private static final List<SeedHazard> SEED = List.of(
        new SeedHazard("Floods",
            "Flooding is the overflow of water onto normally dry land caused by heavy rainfall, storm surges, rapid snowmelt, or dam failures.",
            "Natural", "Hydrological", "High", "Common",
            "Heavy rainfall patterns, rising water levels in rivers, saturated ground conditions, weather alerts from meteorological services",
            "Coastal regions, river basins, low-lying areas, urban areas with poor drainage",
            "2-14 days", "Rainy seasons (March-May, October-December)",
            "Evacuation, emergency shelter, water rescue teams, medical assistance, food and water distribution",
            "Flood barriers, improved drainage systems, early warning systems, land use planning, wetland conservation",
            "Tanzania floods 2020, Dar es Salaam floods 2011, Kilosa floods 2019",
            "Agriculture, Infrastructure, Housing, Health, Education, Transportation",
            "Poor drainage, deforestation, unplanned settlements, climate change"),
        new SeedHazard("Drought",
            "Prolonged period of abnormally low rainfall leading to water shortage, crop failure, and environmental stress.",
            "Natural", "Climatological", "High", "Common",
            "Below average rainfall, declining water levels, crop stress, livestock deaths, meteorological forecasts",
            "Central regions, semi-arid areas, agricultural zones, pastoral communities",
            "3-36 months", "Irregular, typically during failed rainy seasons",
            "Water trucking, food aid, livestock support, nutritional programs, agricultural inputs",
            "Water harvesting, drought-resistant crops, irrigation systems, early warning systems, strategic reserves",
            "Tanzania drought 2022, Horn of Africa drought 2011, Central Tanzania drought 2017",
            "Agriculture, Livestock, Water Resources, Energy, Health, Economy",
            "Climate variability, deforestation, poor water management, poverty, dependency on rain-fed agriculture"),
        new SeedHazard("Earthquake",
            "Sudden shaking of the ground caused by movement of tectonic plates or volcanic activity, potentially causing structural damage and casualties.",
            "Natural", "Geological", "Medium", "Rare",
            "Foreshocks, unusual animal behavior, ground cracks, seismic monitoring alerts",
            "Rift Valley regions, areas near fault lines, Mbeya, Bukoba, Arusha regions",
            "Seconds to minutes", "Non-seasonal, unpredictable",
            "Search and rescue, medical emergency response, structural assessment, temporary shelter, psychological support",
            "Seismic building codes, retrofitting, public education, earthquake drills, emergency preparedness",
            "Bukoba earthquake 2016 (M5.9), Manyara earthquake 2022, Lake Tanganyika earthquakes",
            "Infrastructure, Housing, Health, Education, Economy, Tourism",
            "Poor construction standards, high population density, lack of awareness, inadequate emergency services"),
        new SeedHazard("Cyclone",
            "Intense tropical storm system with strong winds, heavy rainfall, and storm surges affecting coastal areas.",
            "Natural", "Meteorological", "High", "Occasional",
            "Meteorological tracking, dropping barometric pressure, increasing wind speeds, ocean swells",
            "Coastal regions, Tanga, Dar es Salaam, Mtwara, Zanzibar, Indian Ocean coastline",
            "12-48 hours", "November to April (cyclone season)",
            "Evacuation, storm shelters, emergency supplies, medical teams, damage assessment, restoration teams",
            "Cyclone shelters, early warning systems, coastal protection, building standards, evacuation planning",
            "Cyclone Kenneth 2019, Tropical Storm Jobo 2021, Cyclone Gombe 2022",
            "Coastal Infrastructure, Fishing, Tourism, Agriculture, Housing, Maritime Transport",
            "Coastal exposure, inadequate shelters, poor construction, limited early warning reach, climate change"),
        new SeedHazard("Landslide",
            "Downward movement of soil, rock, and debris on slopes, often triggered by heavy rainfall, earthquakes, or human activities.",
            "Natural", "Geological", "Medium", "Occasional",
            "Ground cracks, tilting trees/poles, bulging ground, water seepage, unusual sounds from ground",
            "Hilly and mountainous regions, Usambara Mountains, Southern Highlands, urban hillsides",
            "Minutes to hours", "Rainy seasons when soil is saturated",
            "Search and rescue, evacuation, road clearance, geological assessment, slope stabilization",
            "Slope stabilization, proper drainage, reforestation, land use planning, monitoring systems",
            "Bukoba landslides 2016, Morogoro landslides 2023, Mbeya hillside collapses",
            "Transportation, Housing, Agriculture, Infrastructure, Mining",
            "Deforestation, steep slopes, heavy rainfall, poor land management, unplanned construction"),
        new SeedHazard("Wildfire",
            "Uncontrolled fire in natural areas spreading rapidly through vegetation, threatening lives, property, and ecosystems.",
            "Natural", "Environmental", "Medium", "Seasonal",
            "Dry conditions, high temperatures, low humidity, strong winds, fire danger indices",
            "Savanna regions, forest reserves, agricultural areas, national parks",
            "Days to weeks", "Dry season (June to October)",
            "Fire suppression, evacuation, air support, firebreaks, medical support for burns/smoke inhalation",
            "Firebreaks, controlled burning, public education, fire management plans, early detection systems",
            "Mount Kilimanjaro fires 2020, Mikumi National Park fires, agricultural fires in Shinyanga",
            "Forestry, Tourism, Agriculture, Wildlife, Health, Environment",
            "Dry vegetation, human activities, lightning strikes, agricultural practices, climate change"),
        new SeedHazard("Epidemic/Disease Outbreak",
            "Rapid spread of infectious disease affecting large numbers of people, overwhelming health systems.",
            "Biological", "Biological", "High", "Occasional",
            "Unusual disease patterns, increased hospital admissions, laboratory confirmations, WHO alerts",
            "Urban centers, refugee camps, areas with poor sanitation, border regions",
            "Weeks to months", "Varies by disease (cholera in rainy season, respiratory diseases in cold season)",
            "Medical response, isolation facilities, contact tracing, vaccination campaigns, public health measures",
            "Vaccination, surveillance systems, WASH improvements, health education, laboratory capacity",
            "COVID-19 pandemic 2020-2023, Cholera outbreaks, Dengue fever 2019, Rift Valley Fever",
            "Health, Economy, Education, Tourism, Trade, Social Services",
            "Poor sanitation, overcrowding, weak health systems, cross-border movement, climate change"),
        new SeedHazard("Volcanic Eruption",
            "Eruption of molten rock, ash, and gases from volcanic vents, causing widespread destruction and health hazards.",
            "Natural", "Geological", "High", "Rare",
            "Increased seismic activity, ground deformation, gas emissions, thermal changes, animal behavior",
            "Ol Doinyo Lengai area, Northern Tanzania volcanic zones",
            "Days to months", "Non-seasonal",
            "Evacuation, ash cleanup, respiratory protection, livestock relocation, air traffic management",
            "Monitoring systems, evacuation planning, exclusion zones, public education, emergency supplies",
            "Ol Doinyo Lengai eruptions 2007-2008, historical activity in the Gregory Rift",
            "Aviation, Agriculture, Tourism, Health, Livestock, Infrastructure",
            "Proximity to volcano, wind patterns, lack of monitoring, poor preparedness"),
        new SeedHazard("Tsunami",
            "Series of ocean waves caused by underwater earthquakes, volcanic eruptions, or landslides, devastating coastal areas.",
            "Natural", "Hydrological", "Medium", "Very Rare",
            "Earthquake felt near coast, rapid ocean recession, unusual wave patterns, official warnings",
            "Indian Ocean coastline, Dar es Salaam, Tanga, Mtwara, Zanzibar",
            "Hours", "Non-seasonal",
            "Immediate evacuation, search and rescue, medical response, emergency shelter, restoration",
            "Early warning systems, evacuation routes, public education, coastal planning, sea walls",
            "Indian Ocean Tsunami 2004 impacts on Tanzania coast",
            "Coastal Communities, Tourism, Fishing, Infrastructure, Maritime",
            "Coastal exposure, lack of awareness, inadequate warning systems, poor evacuation plans"),
        new SeedHazard("Extreme Heat/Heatwave",
            "Prolonged period of excessively hot weather, potentially causing heat stress, health impacts, and infrastructure damage.",
            "Natural", "Climatological", "Medium", "Increasing",
            "Weather forecasts, rising temperatures, heat indices, health reports",
            "Urban areas, Central regions, areas with limited shade/water access",
            "3-10 days", "Hot dry season (January-March)",
            "Cooling centers, water distribution, health monitoring, public advisories, power grid management",
            "Urban greening, cooling infrastructure, early warning, public education, workplace safety measures",
            "Heat waves in Dodoma, Singida, Shinyanga regions",
            "Health, Energy, Water, Agriculture, Labor, Education",
            "Urban heat islands, poverty, elderly population, outdoor workers, limited cooling access"),
        new SeedHazard("Pest Infestation",
            "Outbreak of destructive insects or pests damaging crops, stored food, and threatening food security.",
            "Biological", "Biological", "Medium", "Seasonal",
            "Pest sightings, crop damage patterns, favorable weather conditions, regional reports",
            "Agricultural regions, food storage facilities, cross-border areas",
            "Weeks to months", "Varies by pest type and crop cycle",
            "Pesticide application, biological control, crop protection, food aid, farmer support",
            "Integrated pest management, early warning, resistant varieties, proper storage, monitoring",
            "Desert locust invasion 2020, Fall armyworm outbreaks, Quelea bird invasions",
            "Agriculture, Food Security, Economy, Trade, Rural Livelihoods",
            "Monoculture farming, climate change, limited resources, cross-border movement"),
        new SeedHazard("Industrial Accident",
            "Accidents in industrial facilities involving chemical spills, explosions, or structural failures causing environmental and health impacts.",
            "Technological", "Technological", "Medium", "Rare",
            "Equipment failures, safety violations, near-miss incidents, inspection reports",
            "Industrial zones, mining areas, port facilities, urban industrial areas",
            "Hours to days for immediate impact", "Non-seasonal",
            "HAZMAT response, evacuation, medical treatment, environmental cleanup, investigation",
            "Safety regulations, regular inspections, training, emergency plans, proper maintenance",
            "Mining accidents in Mererani, industrial incidents in Dar es Salaam",
            "Industry, Health, Environment, Economy, Labor",
            "Poor safety standards, inadequate training, aging infrastructure, limited enforcement"),
        new SeedHazard("Storm/Strong Winds",
            "Severe weather with damaging winds, not reaching cyclone intensity but causing significant damage.",
            "Natural", "Meteorological", "Medium", "Common",
            "Weather forecasts, darkening skies, temperature drops, barometric changes",
            "Nationwide, particularly Lake Victoria basin, coastal areas, highlands",
            "Minutes to hours", "Transition periods between seasons",
            "Emergency shelter, debris clearing, power restoration, medical response, damage assessment",
            "Building standards, tree management, securing loose objects, early warning systems",
            "Lake Victoria storms, seasonal storms in various regions",
            "Infrastructure, Aviation, Maritime, Agriculture, Power, Telecommunications",
            "Poor construction, exposed power lines, large trees near buildings, lake/coastal exposure"),
        new SeedHazard("Lightning Strikes",
            "Electrical discharge from thunderstorms causing deaths, injuries, fires, and equipment damage.",
            "Natural", "Meteorological", "Medium", "Very Common",
            "Thunderstorm development, dark clouds, thunder, static electricity",
            "Lake Victoria basin, highlands, open rural areas, schools",
            "Instantaneous", "Rainy seasons",
            "Medical response for victims, fire suppression, electrical repairs",
            "Lightning rods, education, safe shelter identification, avoiding open areas during storms",
            "Annual lightning fatalities especially in Geita, Mwanza, Shinyanga regions",
            "Health, Education, Agriculture, Power, Telecommunications",
            "Lack of lightning protection, outdoor activities, poor awareness, inadequate shelter"),
        new SeedHazard("Building Collapse",
            "Structural failure of buildings due to poor construction, age, overloading, or natural hazards.",
            "Technological", "Technological", "Medium", "Occasional",
            "Visible cracks, sagging, unusual sounds, water damage, foundation issues",
            "Urban areas, informal settlements, old building stocks",
            "Instantaneous", "Increased risk during rainy season",
            "Urban search and rescue, medical response, evacuation of nearby buildings, investigation",
            "Building codes enforcement, regular inspections, maintenance, professional construction",
            "Dar es Salaam building collapses, Kariakoo incidents",
            "Housing, Construction, Urban Planning, Emergency Services",
            "Poor construction quality, lack of enforcement, aging infrastructure, unauthorized modifications"));
}
