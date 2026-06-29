package tz.go.pmo.dmis.local;

import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Local seed for the PUBLIC portal content, mirroring what production carries via the Laravel
 * Content Management module: hero slides (about/hazards/alerts toggles), the two-row photo
 * gallery marquee (real images from public/images/events), news & events articles, the
 * portal_settings the hero/stat sections read, and a few flat early_warnings rows so the
 * public hero map has live markers. Idempotent — skips any table that already has rows.
 */
@Component
@Profile("local")
@Order(20)
@RequiredArgsConstructor
public class PortalLocalSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(PortalLocalSeeder.class);

    private final JdbcTemplate jdbc;

    @Override
    public void run(String... args) {
        seedSlides();
        seedGallery();
        seedNews();
        seedSettings();
        seedEarlyWarnings();
        seedHazardCards();
        seedJsonSections();
        seedEducationMaterials();
        applyCorrectiveUpdates();
    }

    /**
     * Hazard education repository: per-audience action guides + videos for the busiest hazards,
     * so the public hubs (/education/hazard/{name}) demonstrate the full audience structure.
     */
    private void seedEducationMaterials() {
        if (count("education_materials") > 0) {
            return;
        }
        // Flood — all three audiences
        material("Flood", "children", "action_guide", "Flood safety for children",
                "Move away from water — never play in flood water.\nTell a grown-up immediately if water is rising.\nKnow your family meeting point.\nKeep your school bag ready with a torch and whistle.");
        material("Flood", "adults", "action_guide", "Household flood preparedness",
                "Know your evacuation route to higher ground.\nPrepare a go-bag: documents, water, torch, first-aid kit, radio.\nSwitch off electricity and gas before evacuating.\nNever walk or drive through moving water — 15cm can knock you down.\nBoil all drinking water after a flood.");
        material("Flood", "disabilities", "action_guide", "Flood preparedness — persons with disabilities",
                "Register with your ward officer for assisted evacuation.\nKeep mobility aids and medication in a waterproof bag by the door.\nAgree a buddy system with two neighbours.\nKeep written/picture cards for communication if speech or hearing is limited.");
        material("Flood", "all", "video", "Understanding flood early warnings (TMA)",
                "How to read flood warnings and what each alert level means.", "https://www.youtube.com/watch?v=43M5mZuzHF8");
        // Fire
        material("Fire", "children", "action_guide", "Fire safety for children",
                "Stop, drop and roll if clothes catch fire.\nCrawl low under smoke.\nNever hide — get out and stay out.\nKnow the emergency number: 114.");
        material("Fire", "adults", "action_guide", "Home and market fire prevention",
                "Install smoke detection where possible.\nPlan and practise two escape routes.\nKeep cooking areas clear; never leave open flames unattended.\nCall 114 — do not fight a spreading fire yourself.");
        material("Fire", "disabilities", "action_guide", "Fire evacuation — persons with disabilities",
                "Sleep on the ground floor where possible.\nKeep a phone and whistle within reach at night.\nArrange neighbour-assisted evacuation in advance.");
        // Drought
        material("Drought", "adults", "action_guide", "Coping with prolonged dry spells",
                "Harvest and store rainwater when it falls.\nPlant drought-tolerant crops per MoA advisories.\nProtect livestock with early destocking decisions.\nFollow TMA seasonal forecasts.");
        material("Drought", "all", "video", "Seasonal forecasts explained",
                "How the Masika/Vuli forecasts are produced and how to use them.", "https://www.youtube.com/watch?v=hT3rsCbVdRA");
        log.info("portal seed: 9 education materials");
    }

    private void material(String hazard, String audience, String type, String title, String body) {
        material(hazard, audience, type, title, body, null);
    }

    private void material(String hazard, String audience, String type, String title, String body, String videoUrl) {
        jdbc.update("insert into public.education_materials(hazard,audience,material_type,title,body,video_url,"
                        + "sort_order,is_active,created_at,updated_at) values (?,?,?,?,?,?,0,true,now(),now())",
                hazard, audience, type, title, body, videoUrl);
    }

    /**
     * Idempotent corrective updates for content seeded by earlier versions of this seeder:
     * hazard cards gain their hub links, and capability cards gain specific system links or
     * "how it works" details.
     */
    private void applyCorrectiveUpdates() {
        // hazard cards: generic /education -> the hazard's own hub
        int n = jdbc.update("update public.portal_hazard_cards set link = '/education/hazard/' || name,"
                + " updated_at = now() where link = '/education'");
        if (n > 0) {
            log.info("portal seed: {} hazard cards relinked to their hubs", n);
        }
        // education materials: phase framing (Ready.gov Prepare BEFORE / Stay Safe DURING / Recover AFTER)
        jdbc.update("update public.education_materials set phase='before'"
                + " where material_type='action_guide' and (phase is null or phase='any')");
        Long during = jdbc.queryForObject(
                "select count(*) from public.education_materials where title='Stay safe DURING a flood'", Long.class);
        if (during != null && during == 0) {
            material("Flood", "adults", "action_guide", "Stay safe DURING a flood",
                    "Move immediately to higher ground — do not wait for instructions.\nNever walk, swim or drive through flood water.\nStay off bridges over fast-moving water.\nDisconnect electricity only if you can do so safely.");
            jdbc.update("update public.education_materials set phase='during' where title='Stay safe DURING a flood'");
            material("Flood", "adults", "action_guide", "Be safe AFTER a flood",
                    "Return home only when authorities declare it safe.\nBoil all drinking water until supplies are declared clean.\nPhotograph damage for assessments before cleaning.\nWatch for snakes and debris in receded areas.\nReport damage to your ward officer.");
            jdbc.update("update public.education_materials set phase='after' where title='Be safe AFTER a flood'");
            log.info("portal seed: flood DURING/AFTER guides added");
        }

        // capabilities: only upgrade if the stored JSON predates the 'detail' field
        String current = null;
        try {
            current = jdbc.queryForObject("select value from public.portal_settings where key='capabilities.items'", String.class);
        } catch (Exception ignored) {
            // not seeded yet — seedJsonSections handles first-time insert
        }
        if (current != null && !current.contains("\"detail\"")) {
            jdbc.update("update public.portal_settings set value=?, updated_at=now() where key='capabilities.items'",
                    capabilitiesJson());
            log.info("portal seed: capabilities upgraded with system links + details");
        }
    }

    /** Capability cards: specific module links where one exists; a how-it-works detail otherwise. */
    private String capabilitiesJson() {
        return "["
                + "{\"title\":\"Early Warning System\",\"icon\":\"fa-satellite-dish\",\"color\":\"#ef4444\",\"link\":\"/m/preparedness/early-warnings\",\"description\":\"Multi-hazard early warning with automated SMS, email, and WhatsApp alerts to communities at risk.\"},"
                + "{\"title\":\"GIS Mapping\",\"icon\":\"fa-map-marked-alt\",\"color\":\"#60a5fa\",\"link\":\"/m/prevention-mitigation/risk-mapping\",\"description\":\"Interactive geospatial mapping of hazards, risks, resources, and evacuation routes across all regions.\"},"
                + "{\"title\":\"Incident Management\",\"icon\":\"fa-tasks\",\"color\":\"#4ade80\",\"description\":\"End-to-end incident tracking from initial report through response coordination to recovery programs.\","
                + "\"detail\":\"How it works in the system: a citizen or field officer reports an incident (from this portal or the app). It is reviewed up the chain — District Coordinator → DAS → Regional Coordinator → RAS → Assistant Director → Director. Once approved, the EOCC coordinates the response: tasks are assigned, resources dispatched from the nearest warehouses, and progress tracked until recovery programmes close the incident.\"},"
                + "{\"title\":\"Resource Management\",\"icon\":\"fa-warehouse\",\"color\":\"#60a5fa\",\"description\":\"Track warehouses, inventory, and allocated resources for rapid deployment during emergencies.\","
                + "\"detail\":\"How it works in the system: zonal and temporary warehouses keep a live stock ledger (food, shelter, rescue equipment). When an incident is approved, responders request allocations; approvals dispatch stock with movement tracking, and every movement updates the single inventory truth so the EOCC always knows what is available and where.\"},"
                + "{\"title\":\"Risk Assessment\",\"icon\":\"fa-shield-alt\",\"color\":\"#a78bfa\",\"link\":\"/inform-risk\",\"description\":\"INFORM subnational risk index — hazard & exposure, vulnerability and coping capacity scored for every council, on the map and by dimension.\"},"
                + "{\"title\":\"Stakeholder Coordination\",\"icon\":\"fa-hands-helping\",\"color\":\"#fb923c\",\"link\":\"/m/response/stakeholders\",\"description\":\"Multi-agency collaboration platform connecting government, NGOs, and international organizations.\"}]";
    }

    /** The 12 "Know Your Hazards" cards (previously hardcoded in the landing), bilingual + linked. */
    private void seedHazardCards() {
        if (count("portal_hazard_cards") > 0) {
            return;
        }
        // {name, icon, color, description_en, description_sw, name_sw}
        String[][] cards = {
            {"Flood", "fa-water", "#3b82f6", "Move to higher ground. Never walk or drive through flood water.", "Hamia sehemu ya juu. Usitembee wala kuendesha kwenye maji ya mafuriko.", "Mafuriko"},
            {"Drought", "fa-sun", "#f59e0b", "Conserve water, plan crops, and follow seasonal forecasts.", "Tunza maji, panga mazao, fuata utabiri wa msimu.", "Ukame"},
            {"Earthquake", "fa-house-damage", "#a855f7", "Drop, cover and hold on. Stay away from windows.", "Inama, jifunike na ng'ang'ania. Kaa mbali na madirisha.", "Tetemeko la Ardhi"},
            {"Cyclone", "fa-wind", "#0ea5e9", "Secure your home, stock supplies and follow official alerts.", "Imarisha nyumba, hifadhi mahitaji na fuata tahadhari rasmi.", "Kimbunga"},
            {"Epidemic", "fa-virus", "#059669", "Wash hands, get vaccinated and report unusual illness early.", "Nawa mikono, pata chanjo na ripoti magonjwa mapema.", "Mlipuko wa Ugonjwa"},
            {"Landslide", "fa-mountain", "#004d66", "Watch for cracks and tilting trees on slopes after heavy rain.", "Angalia nyufa na miti inayoinama kwenye miteremko baada ya mvua kubwa.", "Maporomoko ya Ardhi"},
            {"Fire", "fa-fire", "#ef4444", "Install smoke detection, plan escape routes and call 114.", "Weka king'ora cha moshi, panga njia za kutoroka na piga 114.", "Moto"},
            {"Tsunami", "fa-water", "#06b6d4", "If the sea withdraws suddenly, move inland and uphill immediately.", "Bahari ikirudi ghafla, hamia bara na sehemu za juu mara moja.", "Tsunami"},
            {"Building Collapse", "fa-building", "#6b7280", "Report cracks in buildings; evacuate structures that shift or lean.", "Ripoti nyufa kwenye majengo; ondoka kwenye majengo yanayohama.", "Kuporomoka kwa Jengo"},
            {"Heatwave", "fa-temperature-high", "#f97316", "Stay hydrated, avoid midday sun and check on the vulnerable.", "Kunywa maji, epuka jua la mchana na angalia walio hatarini.", "Wimbi la Joto"},
            {"Volcanic Eruption", "fa-mountain", "#dc2626", "Know evacuation routes; protect yourself from ash fall.", "Fahamu njia za kuhama; jikinge na majivu.", "Mlipuko wa Volkeno"},
            {"Accident", "fa-car-crash", "#f97316", "Secure the scene, call 112/115 and give first aid if trained.", "Linda eneo, piga 112/115 na toa huduma ya kwanza ukiwa umefunzwa.", "Ajali"},
        };
        int order = 0;
        for (String[] c : cards) {
            jdbc.update("insert into public.portal_hazard_cards(name,name_sw,icon,color,description_en,description_sw,"
                            + "link,sort_order,is_active,created_at,updated_at)"
                            + " values (?,?,?,?,?,?,'/education',?,true,now(),now())",
                    c[0], c[5], c[1], c[2], c[3], c[4], order++);
        }
        log.info("portal seed: {} hazard cards", cards.length);
    }

    /** Capability cards + emergency numbers as JSON settings (welcomeV2's exact model), now with links. */
    private void seedJsonSections() {
        seedJsonSetting("capabilities.items", "["
                + "{\"title\":\"Early Warning System\",\"icon\":\"fa-satellite-dish\",\"color\":\"#ef4444\",\"link\":\"/portal\",\"description\":\"Multi-hazard early warning with automated SMS, email, and WhatsApp alerts to communities at risk.\"},"
                + "{\"title\":\"GIS Mapping\",\"icon\":\"fa-map-marked-alt\",\"color\":\"#60a5fa\",\"link\":\"/portal\",\"description\":\"Interactive geospatial mapping of hazards, risks, resources, and evacuation routes across all regions.\"},"
                + "{\"title\":\"Incident Management\",\"icon\":\"fa-tasks\",\"color\":\"#4ade80\",\"link\":\"/\",\"description\":\"End-to-end incident tracking from initial report through response coordination to recovery programs.\"},"
                + "{\"title\":\"Resource Management\",\"icon\":\"fa-warehouse\",\"color\":\"#60a5fa\",\"link\":\"/about\",\"description\":\"Track warehouses, inventory, and allocated resources for rapid deployment during emergencies.\"},"
                + "{\"title\":\"Risk Assessment\",\"icon\":\"fa-shield-alt\",\"color\":\"#a78bfa\",\"link\":\"/publications/Policies\",\"description\":\"Comprehensive risk profiling with vulnerability analysis and mitigation strategy planning.\"},"
                + "{\"title\":\"Stakeholder Coordination\",\"icon\":\"fa-hands-helping\",\"color\":\"#fb923c\",\"link\":\"/portal\",\"description\":\"Multi-agency collaboration platform connecting government, NGOs, and international organizations.\"}]");
        seedJsonSetting("emergency.numbers", "["
                + "{\"number\":\"190\",\"label\":\"Disaster\",\"icon\":\"fa-exclamation-triangle\",\"color\":\"#ef4444\"},"
                + "{\"number\":\"112\",\"label\":\"Police\",\"icon\":\"fa-shield-alt\",\"color\":\"#f59e0b\"},"
                + "{\"number\":\"114\",\"label\":\"Fire\",\"icon\":\"fa-fire\",\"color\":\"#f97316\"},"
                + "{\"number\":\"115\",\"label\":\"Medical\",\"icon\":\"fa-ambulance\",\"color\":\"#3b82f6\"},"
                + "{\"number\":\"116\",\"label\":\"Child Helpline\",\"icon\":\"fa-child\",\"color\":\"#10b981\"}]");
    }

    private void seedJsonSetting(String key, String value) {
        Long n = jdbc.queryForObject("select count(*) from public.portal_settings where key=?", Long.class, key);
        if (n != null && n > 0) {
            return;
        }
        jdbc.update("insert into public.portal_settings(\"group\",key,value,type,created_at,updated_at)"
                + " values (split_part(?, '.', 1), ?, ?, 'json', now(), now())", key, key, value);
        log.info("portal seed: {} json setting", key);
    }

    private void seedSlides() {
        if (count("portal_slides") > 0) {
            return;
        }
        // The landing renders the three built-in slide types when toggled active (v2.blade slider)
        jdbc.update("insert into public.portal_slides(title,slide_type,sort_order,is_active,created_at,updated_at) values"
                + " ('About e-MAAFA','about',1,true,now(),now()),"
                + " ('Know Your Hazards','hazards',2,true,now(),now()),"
                + " ('Active Warnings','alerts',3,true,now(),now())");
        log.info("portal seed: 3 slides");
    }

    private void seedGallery() {
        if (count("portal_gallery") > 0) {
            return;
        }
        // Real images shipped with the system (public/images/events). Row 1 scrolls left, row 2 right.
        String[][] rows = {
                {"images/events/rufiji_aerial_destruction.jpg", "Rufiji floods — aerial assessment", "1"},
                {"images/events/photo_01.jpg", "Community response operations", "1"},
                {"images/events/rufiji_village_submerged.jpg", "Submerged village, Rufiji basin", "1"},
                {"images/events/photo_03.jpg", "Relief distribution", "1"},
                {"images/events/rufiji_aerial_01.jpg", "Flood extent monitoring", "1"},
                {"images/events/photo_04.jpg", "Evacuation support", "2"},
                {"images/events/photo_05.jpg", "EOCC coordination", "2"},
                {"images/events/photo_06.jpg", "Field assessment team", "2"},
                {"images/events/photo_07.jpg", "Emergency supplies staging", "2"},
                {"images/events/photo_08.jpg", "Recovery works", "2"},
        };
        int order = 0;
        for (String[] r : rows) {
            jdbc.update("insert into public.portal_gallery(image_path,caption,alt_text,sort_order,marquee_row,"
                            + "is_active,created_at,updated_at) values (?,?,?,?,?,true,now(),now())",
                    r[0], r[1], r[1], order++, Integer.parseInt(r[2]));
        }
        log.info("portal seed: {} gallery images", rows.length);
    }

    private void seedNews() {
        if (count("portal_news") > 0) {
            return;
        }
        news("PMO conducts national multi-hazard simulation exercise",
                "pmo-national-simulation-2026",
                "A full-scale simulation exercise testing early warning dissemination and inter-agency response across five regions.",
                "The Prime Minister's Office, through the Disaster Management Department, conducted a national "
                        + "multi-hazard simulation exercise bringing together TMA, the Ministry of Water, GST, MoH, MoA and "
                        + "NEMC. The exercise validated the end-to-end flow from hazard detection through bulletin "
                        + "generation to community-level alert dissemination.",
                "images/events/photo_05.jpg", "news", 2);
        news("Heavy rainfall preparedness campaign launched in Lake Zone",
                "lake-zone-rainfall-campaign",
                "Community sensitisation on flood preparedness ahead of the Masika rains across Mwanza, Kagera and Mara.",
                "The campaign trains ward-level volunteers on evacuation routes, early warning interpretation and "
                        + "household preparedness, reaching over 200 communities across the Lake Zone.",
                "images/events/photo_01.jpg", "news", 6);
        news("National Disaster Preparedness Day commemorations",
                "national-preparedness-day-2026",
                "Join the commemorations in Dodoma featuring exhibitions from response agencies and live drills.",
                "The annual National Disaster Preparedness Day brings exhibitions, school programmes and live "
                        + "demonstrations from the Fire and Rescue Force, Tanzania Red Cross and partner agencies.",
                "images/events/photo_03.jpg", "event", 10);
        log.info("portal seed: 3 news articles");
    }

    private void news(String title, String slug, String excerpt, String body, String image, String category, int daysAgo) {
        jdbc.update("insert into public.portal_news(title,slug,excerpt,body,image,category,published_at,is_active,"
                        + "created_at,updated_at) values (?,?,?,?,?,?,now() - (? || ' days')::interval,true,now(),now())",
                title, slug, excerpt, body, image, category, daysAgo);
    }

    private void seedSettings() {
        if (count("portal_settings") > 0) {
            return;
        }
        // The hero "About" slide's four stat tiles + the two animated counters (welcomeV2 reads these keys)
        String[][] settings = {
                {"stats", "stats.item_0_icon", "fa-building"}, {"stats", "stats.item_0_value", "6"},
                {"stats", "stats.item_1_icon", "fa-map"}, {"stats", "stats.item_1_value", "31"},
                {"stats", "stats.item_2_icon", "fa-users"}, {"stats", "stats.item_2_value", "61M+"},
                {"stats", "stats.item_3_icon", "fa-clock"}, {"stats", "stats.item_3_value", "24/7"},
                {"stats", "stats.counter_0_icon", "fa-phone-alt"}, {"stats", "stats.counter_0_color", "#ef4444"},
                {"stats", "stats.counter_0_value", "190"}, {"stats", "stats.counter_0_suffix", ""},
                {"stats", "stats.counter_1_icon", "fa-headset"}, {"stats", "stats.counter_1_color", "#3b82f6"},
                {"stats", "stats.counter_1_value", "24"}, {"stats", "stats.counter_1_suffix", "/7"},
        };
        for (String[] s : settings) {
            jdbc.update("insert into public.portal_settings(\"group\",key,value,type,created_at,updated_at)"
                    + " values (?,?,?,'text',now(),now())", s[0], s[1], s[2]);
        }
        log.info("portal seed: {} settings", settings.length);
    }

    private void seedEarlyWarnings() {
        if (count("early_warnings") > 0) {
            return;
        }
        // Flat early_warnings demo records. Seeded OFF the public map (show_on_map=false): the public map
        // shows only warnings PMO has explicitly pushed, not seed/auto rows.
        ew("EW-2026-10021", "Heavy rainfall", "Warning", "Heavy rainfall expected over Dar es Salaam, Pwani and Morogoro; localized flooding likely in low-lying areas.", "Dar es Salaam, Pwani, Morogoro", -6.82, 39.27, 120000);
        ew("EW-2026-10022", "Flood", "Emergency", "Rufiji river above danger level; evacuation advised for riverside villages.", "Pwani (Rufiji)", -7.96, 39.18, 45000);
        ew("EW-2026-10023", "Strong winds", "Watch", "Strong southerly winds over Lake Victoria; small vessels advised caution.", "Mwanza, Mara", -2.51, 32.9, 30000);
        ew("EW-2026-10024", "Drought", "Watch", "Prolonged dry spell affecting pasture and water availability.", "Dodoma, Singida", -6.17, 35.74, 80000);
        log.info("portal seed: 4 early warnings (public map)");
    }

    private void ew(String code, String type, String severity, String message, String regions,
                    double lat, double lng, int atRisk) {
        jdbc.update("insert into public.early_warnings(warning_code,hazard_type,severity_level,alert_message,"
                        + "affected_regions,latitude,longitude,people_at_risk,show_on_map,status,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,false,'active',now(),now())",
                code, type, severity, message, regions, lat, lng, atRisk);
    }

    private long count(String table) {
        Long n = jdbc.queryForObject("select count(*) from public." + table, Long.class);
        return n == null ? 0 : n;
    }
}
