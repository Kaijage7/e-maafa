package tz.go.pmo.dmis.local;

import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Verbatim port of the source's {@code Database\Seeders\OneHealthSeeder}: 14 Government
 * stakeholders, 9 Areas of Concern, their concern items and the area-stakeholder sector mappings.
 * This reference data drives the entire One Health module (create form cascades, directive
 * stakeholder checklists, dissemination targeting). Idempotent.
 */
@Component
@Profile("local")
@RequiredArgsConstructor
public class OneHealthLocalSeeder {

    private static final Logger log = LoggerFactory.getLogger(OneHealthLocalSeeder.class);

    private final JdbcTemplate jdbc;

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        Long areas = jdbc.queryForObject("select count(*) from public.oh_areas_of_concern", Long.class);
        if (areas != null && areas > 0) {
            log.info("local seed: One Health reference data present, skipping");
            return;
        }
        seedStakeholders();
        seedAreasOfConcern();
        seedConcernItems();
        seedAreaStakeholderMappings();
        log.info("local seed: done (One Health reference data)");
    }

    /** The 14 institutions, values copied verbatim from OneHealthSeeder::seedStakeholders(). */
    private void seedStakeholders() {
        record S(String organization, String name, String email, String phone, String region,
                 String district, String address, String expertise, String contactName, String contactTitle) { }
        List<S> institutions = List.of(
            new S("Tanzania Meteorological Authority", "TMA", "info@meteo.go.tz", "0222460706",
                "Dar es Salaam", "Ubungo", "Ubungo Plaza, Morogoro Road",
                "[\"Weather Forecasting\",\"Climate Monitoring\",\"Early Warning Systems\"]",
                "Director General", "Director General"),
            new S("Ministry of Water", "MOW", "info@maji.go.tz", "0222451448",
                "Dar es Salaam", "Ilala", "Maji House, Kivukoni Front",
                "[\"Water Resources\",\"Flood Management\",\"Water Quality\"]",
                "Permanent Secretary", "Permanent Secretary"),
            new S("Geological Survey of Tanzania", "GST", "info@gst.go.tz", "0222650227",
                "Dodoma", "Dodoma Urban", "Makole, Dodoma",
                "[\"Geology\",\"Seismology\",\"Mineral Resources\"]",
                "Chief Geologist", "Chief Geologist"),
            new S("Ministry of Health", "MOH", "info@moh.go.tz", "0222120261",
                "Dodoma", "Dodoma Urban", "Dodoma",
                "[\"Public Health\",\"Disease Surveillance\",\"Epidemic Response\"]",
                "Chief Medical Officer", "Chief Medical Officer"),
            new S("Ministry of Livestock and Fisheries", "MLF", "info@mifugouvuvi.go.tz", "0222861910",
                "Dodoma", "Dodoma Urban", "Dodoma",
                "[\"Animal Health\",\"Veterinary Services\",\"Zoonotic Diseases\"]",
                "Director of Veterinary Services", "Director of Veterinary Services"),
            new S("Ministry of Natural Resources and Tourism", "MNRT", "info@mnrt.go.tz", "0222866064",
                "Dodoma", "Dodoma Urban", "Dodoma",
                "[\"Wildlife Management\",\"Forest Conservation\",\"Environmental Protection\"]",
                "Permanent Secretary", "Permanent Secretary"),
            new S("President's Office - Regional Administration and Local Government", "PORALG",
                "info@tamisemi.go.tz", "0262963222", "Dodoma", "Dodoma Urban", "Dodoma",
                "[\"Local Government\",\"Regional Coordination\",\"Community Health\"]",
                "Permanent Secretary", "Permanent Secretary"),
            new S("Tanzania Wildlife Research Institute", "TAWIRI", "info@tawiri.or.tz", "0272509871",
                "Arusha", "Arusha City", "Arusha",
                "[\"Wildlife Research\",\"Biodiversity\",\"Zoonotic Surveillance\"]",
                "Director General", "Director General"),
            new S("National Institute for Medical Research", "NIMR", "info@nimr.or.tz", "0222121400",
                "Dar es Salaam", "Ilala", "Ocean Road, Dar es Salaam",
                "[\"Medical Research\",\"Disease Investigation\",\"Laboratory Services\"]",
                "Director General", "Director General"),
            new S("National Public Health Laboratory", "NPHL", "info@nphl.go.tz", "0222150596",
                "Dar es Salaam", "Ilala", "Dar es Salaam",
                "[\"Laboratory Diagnostics\",\"Biosafety\",\"Quality Assurance\"]",
                "Director", "Director"),
            new S("Ministry of Agriculture", "MOA", "info@kilimo.go.tz", "0222862480",
                "Dodoma", "Dodoma Urban", "Dodoma",
                "[\"Agriculture\",\"Crop Protection\",\"Food Security\"]",
                "Permanent Secretary", "Permanent Secretary"),
            new S("Tanzania Plant Health and Pesticides Authority", "TPHPA", "info@tphpa.go.tz", "0222863378",
                "Dar es Salaam", "Ilala", "Dar es Salaam",
                "[\"Plant Health\",\"Pesticide Regulation\",\"Crop Disease Management\"]",
                "Registrar", "Registrar"),
            new S("Tanzania Bureau of Standards", "TBS", "info@tbs.go.tz", "0222450206",
                "Dar es Salaam", "Ubungo", "Ubungo, Dar es Salaam",
                "[\"Standards\",\"Food Safety\",\"Quality Control\"]",
                "Director General", "Director General"),
            new S("Prime Minister's Office - Disaster Management Department", "PMO-DMD",
                "info@pmo.go.tz", "0222113857", "Dodoma", "Dodoma Urban", "Dodoma",
                "[\"Disaster Management\",\"Emergency Coordination\",\"Risk Reduction\"]",
                "Director", "Director"));
        for (S s : institutions) {
            Long exists = jdbc.queryForObject(
                    "select count(*) from public.stakeholders where organization = ?", Long.class, s.organization());
            if (exists != null && exists == 0) {
                jdbc.update("insert into public.stakeholders(organization, name, email, phone, type, region, "
                        + "district, address, expertise_areas, contact_person_name, contact_person_title, "
                        + "contact_person_phone, is_active, is_verified, verified_at, created_at, updated_at) "
                        + "values (?,?,?,?,'Government',?,?,?,?::json,?,?,?,true,true,now(),now(),now())",
                        s.organization(), s.name(), s.email(), s.phone(), s.region(), s.district(),
                        s.address(), s.expertise(), s.contactName(), s.contactTitle(), s.phone());
            }
        }
    }

    /** The 9 areas, verbatim from OneHealthSeeder::seedAreasOfConcern(). */
    private void seedAreasOfConcern() {
        record A(String code, String name, String category, String description, int sortOrder) { }
        List<A> areas = List.of(
            new A("ZOONOTIC", "Zoonotic Disease", "health", "Diseases transmitted between animals and humans", 1),
            new A("CLIMATE_HEALTH", "Climate Change on Health", "environmental", "Health impacts of climate change", 2),
            new A("AMR", "Antimicrobial Resistance", "health", "Resistance of microorganisms to antimicrobial drugs", 3),
            new A("FOOD_SAFETY", "Food Safety", "food_safety", "Safety of food supply chain", 4),
            new A("BIOSAFETY", "Biosafety & Biosecurity", "health", "Safety in handling biological agents", 5),
            new A("EPT", "Emerging Pandemic Threats", "health", "New and re-emerging pandemic threats", 6),
            new A("NCD", "Noncommunicable Diseases", "health", "Chronic diseases not passed person to person", 7),
            new A("ENVIRONMENT", "Environment", "environmental", "Environmental degradation and contamination concerns", 8),
            new A("OTHER", "Others", "other", "Other cross-cutting One Health concerns", 9));
        for (A a : areas) {
            jdbc.update("insert into public.oh_areas_of_concern(code, name, category, description, sort_order, "
                    + "is_active, created_at, updated_at) values (?,?,?,?,?,true,now(),now()) "
                    + "on conflict (code) do nothing",
                    a.code(), a.name(), a.category(), a.description(), a.sortOrder());
        }
    }

    /** Concern items per area, verbatim from OneHealthSeeder::seedConcernItems(). */
    private void seedConcernItems() {
        Map<String, List<String>> items = Map.of(
            "ZOONOTIC", List.of("Rabies", "Rift Valley Fever", "Zoonotic Influenza", "Anthrax", "Human African Trypanosomiasis", "Brucellosis"),
            "CLIMATE_HEALTH", List.of("Extreme Temperature", "Floods", "Wildfires", "Allergens & Pollen"),
            "AMR", List.of("Inappropriate Use of Antimicrobials", "Agricultural AMR", "Environmental AMR"),
            "FOOD_SAFETY", List.of("Foodborne Illness", "Contaminated Foods", "Food Contaminants"),
            "BIOSAFETY", List.of("Laboratory Biosafety", "Laboratory Biosecurity"),
            "EPT", List.of("SARS", "Ebola", "Marburg", "COVID-19"),
            "NCD", List.of("Cancer", "Diabetes", "Chronic Respiratory Diseases", "Cardiovascular Diseases"),
            "ENVIRONMENT", List.of("Pollution", "Deforestation", "Land Degradation", "Water Contamination", "Biodiversity Loss"),
            "OTHER", List.of("Academic Research", "Multi-Sector", "Other"));
        items.forEach((areaCode, names) -> {
            Long areaId = jdbc.queryForObject(
                    "select id from public.oh_areas_of_concern where code = ?", Long.class, areaCode);
            for (int i = 0; i < names.size(); i++) {
                jdbc.update("insert into public.oh_concern_items(area_of_concern_id, name, sort_order, is_active, "
                        + "created_at, updated_at) select ?, ?, ?, true, now(), now() "
                        + "where not exists (select 1 from public.oh_concern_items where area_of_concern_id = ? and name = ?)",
                        areaId, names.get(i), i + 1, areaId, names.get(i));
            }
        });
    }

    /** Area→stakeholder sector mappings, verbatim (incl. the agriculture and food-safety extras). */
    private void seedAreaStakeholderMappings() {
        List<String> healthSeven = List.of("Ministry of Health", "Ministry of Livestock and Fisheries",
                "Ministry of Natural Resources and Tourism",
                "President's Office - Regional Administration and Local Government",
                "Tanzania Wildlife Research Institute", "National Institute for Medical Research",
                "National Public Health Laboratory");
        Map<String, List<String>> mappings = Map.of(
            "CLIMATE_HEALTH", List.of("Tanzania Meteorological Authority", "Ministry of Water",
                    "Geological Survey of Tanzania", "Ministry of Agriculture",
                    "Tanzania Plant Health and Pesticides Authority"),
            "ZOONOTIC", healthSeven,
            "AMR", healthSeven,
            "EPT", healthSeven,
            "NCD", healthSeven,
            "BIOSAFETY", healthSeven,
            "FOOD_SAFETY", List.of("Tanzania Bureau of Standards", "Ministry of Health",
                    "President's Office - Regional Administration and Local Government",
                    "Ministry of Agriculture", "Tanzania Plant Health and Pesticides Authority"),
            "ENVIRONMENT", List.of("Ministry of Natural Resources and Tourism", "Ministry of Water",
                    "Tanzania Meteorological Authority", "Geological Survey of Tanzania"),
            "OTHER", List.of("Ministry of Health", "Ministry of Livestock and Fisheries",
                    "Ministry of Natural Resources and Tourism",
                    "Prime Minister's Office - Disaster Management Department"));
        mappings.forEach((areaCode, orgs) -> {
            Long areaId = jdbc.queryForObject(
                    "select id from public.oh_areas_of_concern where code = ?", Long.class, areaCode);
            for (String org : orgs) {
                jdbc.update("insert into public.oh_area_stakeholder(area_of_concern_id, stakeholder_id, created_at, updated_at) "
                        + "select ?, s.id, now(), now() from public.stakeholders s where s.organization = ? "
                        + "on conflict (area_of_concern_id, stakeholder_id) do nothing",
                        areaId, org);
            }
        });
    }
}
