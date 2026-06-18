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
 * Demo data for the Recovery sub-modules + SMS log so their screens render with realistic content.
 * Idempotent (each block guarded by a count). Local profile only — never runs in production.
 */
@Component
@Profile("local")
@RequiredArgsConstructor
public class RecoveryLocalSeeder {

    private static final Logger log = LoggerFactory.getLogger(RecoveryLocalSeeder.class);

    private final JdbcTemplate jdbc;

    @EventListener(ApplicationReadyEvent.class)
    public void seed() {
        seedRecoveryPrograms();
        seedReliefDistributions();
        seedStrategicProjects();
        seedKnowledge();
        seedSmsLogs();
    }

    private void seedRecoveryPrograms() {
        if (count("recovery_programs") > 0) {
            return;
        }
        // name, type, status, budget, scope, objectives
        record P(String name, String type, String status, long budget, String scope, String obj) {}
        List<P> ps = List.of(
            new P("Rufiji Flood Reconstruction Programme", "Infrastructure Rebuilding", "Ongoing", 12_000_000_000L,
                "Pwani — Rufiji & Kibiti", "Rebuild 827 km of roads and 63 bridges damaged in the 2024 El Niño floods; restore river defences."),
            new P("Hanang Resettlement & Livelihoods", "Livelihood Support", "Ongoing", 4_500_000_000L,
                "Manyara — Hanang (Katesh)", "Resettle 9,107 displaced households from the 2023 landslide and restore farming livelihoods on safe land."),
            new P("Northern Drought Livelihood Recovery", "Livelihood Support", "Planning", 6_800_000_000L,
                "Manyara, Arusha, Kilimanjaro, Tanga", "Restock livestock, rehabilitate water sources and provide drought-tolerant seed after the 2022 drought."),
            new P("Kagera Seismic Reconstruction", "Infrastructure Rebuilding", "Completed", 8_200_000_000L,
                "Kagera — Bukoba", "Reconstruct earthquake-damaged schools, the regional hospital and government buildings to seismic codes (build-back-better)."),
            new P("Lake Victoria Shoreline Resilience", "Infrastructure Rebuilding", "Ongoing", 3_900_000_000L,
                "Kagera, Mara, Mwanza", "Restore shoreline-protection works and relocate at-risk settlements after the record 2020 lake-level floods."));
        for (P p : ps) {
            jdbc.update("""
                    insert into public.recovery_programs(program_name, description, program_type, status,
                        start_date, expected_completion_date, actual_completion_date, total_budget_allocated,
                        currency, lead_agency_id, geographic_scope, key_objectives_outcomes, created_at, updated_at)
                    values (?,?,?,?, current_date - interval '120 days',
                            current_date + interval '300 days',
                            case when ?='Completed' then current_date - interval '20 days' else null end,
                            ?, 'TZS', (select id from public.agencies order by id limit 1), ?, ?, now(), now())
                    """, p.name(), p.obj(), p.type(), p.status(), p.status(), p.budget(), p.scope(), p.obj());
        }
        log.info("recovery seed: {} recovery programs", ps.size());
    }

    private void seedReliefDistributions() {
        if (count("relief_distributions") > 0) {
            return;
        }
        // location, district, region, resourceName, qty, unit, beneficiary, contact, status
        record D(String loc, String district, String region, String resource, double qty, String unit,
                 String beneficiary, String contact, String status) {}
        List<D> ds = List.of(
            new D("Mwananchi Shelter", "Rufiji", "Pwani", "Tents", 320, "pieces", "Rufiji flood-displaced households (Camp A)", "0754-000-101", "Confirmed"),
            new D("Katesh Relief Point", "Hanang", "Manyara", "Blankets", 1800, "pieces", "Hanang landslide survivors", "0754-000-102", "Confirmed"),
            new D("Kibiti Distribution Centre", "Kibiti", "Pwani", "Rice (50kg)", 600, "bags", "Kibiti flood-affected families", "0754-000-103", "Pending Verification"),
            new D("Bukoba Town Hall", "Bukoba", "Kagera", "Water Purification Tablets", 5000, "strips", "Earthquake-affected residents", "0754-000-104", "Confirmed"),
            new D("Dodoma Rural Ward Office", "Dodoma Rural", "Dodoma", "Maize Flour (25kg)", 450, "bags", "Drought-affected pastoralist households", "0754-000-105", "Pending Verification"),
            new D("Mafia Island Jetty", "Mafia", "Pwani", "Tarpaulins", 280, "pieces", "Cyclone Hidaya-affected fisher families", "0754-000-106", "Confirmed"));
        for (D d : ds) {
            jdbc.update("""
                    insert into public.relief_distributions(distribution_date, location_name, district_name,
                        region_name, resource_id, quantity_distributed, unit_of_measure,
                        beneficiary_name_or_group, beneficiary_contact, distributing_agency_id,
                        confirmation_status, notes, created_at, updated_at)
                    values (current_date - (random()*30)::int, ?, ?, ?,
                            (select id from public.resources where name ilike ? limit 1), ?, ?, ?, ?,
                            (select id from public.agencies order by id limit 1), ?, ?, now(), now())
                    """, d.loc(), d.district(), d.region(), "%" + d.resource().split(" ")[0] + "%", d.qty(),
                    d.unit(), d.beneficiary(), d.contact(), d.status(),
                    "Relief distribution of " + d.resource() + " to " + d.beneficiary() + ".");
        }
        log.info("recovery seed: {} relief distributions", ds.size());
    }

    private void seedStrategicProjects() {
        if (count("strategic_projects") > 0) {
            return;
        }
        // name, category, sector, status, hazardType, regions, hazards, budget, elementsAtRisk
        record S(String name, String cat, String sector, String status, String hazType,
                 String regions, String hazards, long budget, String risk) {}
        List<S> ss = List.of(
            new S("Msimbazi Basin Flood-Control Works", "Government", "Water", "Construction", "Natural",
                "[\"Dar es Salaam\"]", "[\"Floods\"]", 220_000_000_000L, "150,000 residents, roads, drainage in the Msimbazi valley"),
            new S("Standard Gauge Railway — Flood Resilience", "PPP", "Transport", "Operational", "Natural",
                "[\"Pwani\",\"Morogoro\",\"Dodoma\"]", "[\"Floods\",\"Landslide\"]", 0L, "Rail embankments, bridges and culverts"),
            new S("Kilimanjaro Forest Fire-Break Network", "Government", "Environment", "Mobilization", "Natural",
                "[\"Kilimanjaro\"]", "[\"Wildfire\"]", 3_300_000_000L, "Montane forest, water towers, tourism assets"),
            new S("Bukoba Seismic-Resilient Schools", "Government", "Education", "Construction", "Natural",
                "[\"Kagera\"]", "[\"Earthquake\"]", 8_200_000_000L, "Schoolchildren, school buildings"),
            new S("Coastal Cyclone Shelters (Mtwara–Lindi)", "Government", "Health", "Construction", "Natural",
                "[\"Mtwara\",\"Lindi\",\"Pwani\"]", "[\"Cyclone\",\"Floods\"]", 4_800_000_000L, "Coastal communities, fishing fleet"));
        for (S s : ss) {
            long seq = jdbc.queryForObject("select coalesce(max(id),0)+1 from public.strategic_projects", Long.class);
            jdbc.update("""
                    insert into public.strategic_projects(entry_id, project_name, project_category, project_sector,
                        location, project_status, risk_hazard_type, risk_hazard_names, impacts_identified,
                        has_management_plan, budget, elements_at_risk, created_at, updated_at)
                    values (?, ?, ?, ?, ?::json, ?, ?, ?::json, '[]'::json, true, ?, ?, now(), now())
                    """, "SP-" + String.format("%04d", seq), s.name(), s.cat(), s.sector(), s.regions(),
                    s.status(), s.hazType(), s.hazards(), s.budget() == 0 ? null : s.budget(), s.risk());
        }
        log.info("recovery seed: {} strategic projects", ss.size());
    }

    private void seedKnowledge() {
        Long existing = jdbc.queryForObject(
                "select count(*) from public.disaster_knowledge_repositories where content_type is not null", Long.class);
        if (existing != null && existing > 0) {
            return;
        }
        // title, type, hazard, region, contributor, org, approval, description
        record K(String title, String type, String hazard, String region, String contrib, String org,
                 String approval, String desc) {}
        List<K> ks = List.of(
            new K("Lessons from the 2023 Hanang Landslide Response", "Lesson Learned", "Landslide", "Manyara",
                "PMO-DMD", "Prime Minister's Office", "Approved",
                "Anticipatory evacuation triggers and shelter pre-positioning would have reduced the 89-death toll; slope-stability mapping is now mandatory for Mount Hanang settlements."),
            new K("El Niño 2023/24 Floods — After Action Review", "Best Practice", "Floods", "National",
                "PMO-DMD", "Prime Minister's Office", "Approved",
                "Early TMA warnings (from Nov 2023) and the s.32 declaration pathway worked; gaps were in cross-district resource sharing and road-access contingency."),
            new K("Cyclone Hidaya: First Landfall Preparedness Note", "Technical Guide", "Cyclone", "Pwani",
                "TMA", "Tanzania Meteorological Authority", "Approved",
                "Tanzania's first recorded cyclone landfall (Mafia, 2024) — harbour-securing of fishing fleets and RSMC La Réunion bulletin integration are now standard."),
            new K("Bukoba 2016 Earthquake Reconstruction Case Study", "Case Study", "Earthquake", "Kagera",
                "GST", "Geological Survey of Tanzania", "Approved",
                "Build-back-better seismic codes for the Rift Valley belt; 2,500+ destroyed homes rebuilt to new standards with AfDB support."),
            new K("Community Cholera Control — Lake Zone WASH Guideline", "Guideline", "Epidemic", "Mwanza",
                "Ministry of Health", "MoH", "Pending",
                "WASH-driven cholera control after the 2015–16 epidemic (378 deaths): water chlorination, CTU placement and risk communication protocol."));
        for (K k : ks) {
            jdbc.update("""
                    insert into public.disaster_knowledge_repositories(title, content_title, description,
                        content_type, document_type, hazard_type, disaster_date, date_of_publication, location,
                        region, contributor, uploader_name, contributor_organization, uploader_institution,
                        visibility_level, status, approval_status, downloads_count, version, created_at, updated_at)
                    values (?,?,?,?,?,?, current_date - interval '200 days', current_date - interval '120 days',
                            ?, ?, ?, ?, ?, ?, 'public',
                            case when ?='Approved' then 'approved' else 'pending' end, ?, 0, 1, now(), now())
                    """, k.title(), k.title(), k.desc(), k.type(), k.type(), k.hazard(), k.region(), k.region(),
                    k.contrib(), k.contrib(), k.org(), k.org(), k.approval(), k.approval());
        }
        log.info("recovery seed: {} knowledge entries", ks.size());
    }

    private void seedSmsLogs() {
        if (count("sms_logs") > 0) {
            return;
        }
        // type, phone, message, status
        record M(String type, String phone, String msg, String status) {}
        List<M> ms = List.of(
            new M("public", "0754-100-001", "DMIS ALERT: Heavy rainfall expected in Dar es Salaam 24h. Avoid Msimbazi valley. Stay safe. -PMO", "delivered"),
            new M("public", "0754-100-002", "TAHADHARI: Mvua kubwa inatarajiwa Pwani. Epuka maeneo ya mabondeni. -PMO MAAFA", "delivered"),
            new M("stakeholder", "0754-100-003", "EOCC: DRF activation for Rufiji floods. Report readiness to Command Post by 1800h.", "delivered"),
            new M("public", "0754-100-004", "CYCLONE WATCH: Tropical system approaching Mtwara coast. Secure boats, move to higher ground.", "sent"),
            new M("stakeholder", "0754-100-005", "Red Cross: 320 tents dispatched to Rufiji Camp A. Confirm receipt.", "delivered"),
            new M("public", "0754-100-006", "Cholera alert: Boil drinking water in Lake Zone wards. Seek care for watery diarrhoea. -MoH", "failed"),
            new M("public", "0754-100-007", "DROUGHT ADVISORY: Water trucking schedule for Dodoma rural wards published. Check ward office.", "pending"),
            new M("stakeholder", "0754-100-008", "EOCC: Earthquake response stand-down, Bukoba. Submit damage returns within 72h.", "delivered"),
            new M("public", "0754-100-009", "Evacuation order: Hanang slope-base villages. Proceed to Katesh shelters now. -PMO", "delivered"),
            new M("public", "0754-100-010", "Heatwave advisory Singida: open cooling centres, check on the elderly. -PMO MAAFA", "sent"));
        for (M m : ms) {
            jdbc.update("""
                    insert into public.sms_logs(notification_type, recipient_phone, message, status, external_id,
                        sent_at, delivered_at, retry_count, created_at, updated_at)
                    values (?, ?, ?, ?,
                            case when ? in ('sent','delivered') then 'MGOV-' || floor(random()*1000000)::text else null end,
                            case when ? in ('sent','delivered') then now() - (random()*5||' days')::interval else null end,
                            case when ?='delivered' then now() - (random()*4||' days')::interval else null end,
                            case when ?='failed' then 2 else 0 end,
                            now() - (random()*6||' days')::interval, now())
                    """, m.type(), m.phone(), m.msg(), m.status(), m.status(), m.status(), m.status(), m.status());
        }
        log.info("recovery seed: {} sms logs", ms.size());
    }

    private long count(String table) {
        Long n = jdbc.queryForObject("select count(*) from public." + table, Long.class);
        return n == null ? 0 : n;
    }
}
