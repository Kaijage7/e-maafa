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
 * Seeds the THREAT MONITORING content exactly as specified by DMD:
 *
 * <ul>
 *   <li><b>Super El Niño</b> — source TMA, trending from global centers. DMD intervention:
 *       activation of plan development (sector, regional, stakeholder contingency plans);
 *       timeline entry "NEW: development of draft contingency plan, 15–19 June 2026".
 *       Past impacts framed per the National Disaster Risk Financing and Implementation
 *       Plan (2025/26–2030/31).</li>
 *   <li><b>Ebola</b> — source Ministry of Health. DMD interventions: collaboration with MoH,
 *       review of the contingency plan.</li>
 * </ul>
 *
 * Plus the REAL news items from public sources (PMO–DIT MoU, UDOM hands-on training,
 * WFP collaboration, Mwanza EOC launch) with their source links. Idempotent.
 */
@Component
@Profile("local")
@Order(22)
@RequiredArgsConstructor
public class ThreatLocalSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ThreatLocalSeeder.class);

    private final JdbcTemplate jdbc;

    @Override
    public void run(String... args) {
        seedThreats();
        seedRealNews();
        upsertElNinoPastImpacts();
    }

    /**
     * Past impacts to Tanzania with VERIFIED public figures (always refreshed so corrections land
     * on existing installs). Sources: World Bank Reports 24018 &amp; 26232 (1997/98 reconstruction,
     * Central Line), WHO DON 7 Jan 1998 (cholera), IFRC MDRTZ035 (Hanang), PM's statement to
     * Parliament 25 Apr 2024 (CNN/Al Jazeera/AP), OCHA Flash Update May 2024 (Rufiji/Kibiti),
     * The Citizen (TZS 556bn roads), World Bank press release 9 Jun 2025 (US$170m AAL).
     * Exact NDRF-IP tables slot in here once DMD publishes the plan document.
     */
    private void upsertElNinoPastImpacts() {
        String en = "Documented losses from past El Niño episodes, as compiled for the National Disaster Risk "
                + "Financing and Implementation Plan (2025/26–2030/31):\n\n"
                + "1997/98 — Post-El Niño reconstruction requirements were assessed at about US$1 billion, with the "
                + "transport sector taking 65% and agriculture 12.5% (World Bank). The Central Railway Line was closed "
                + "for about 10 months by flood washouts and bridge reconstruction grew from 22 to 52 bridges; the "
                + "Link Line was cut until January 1999. Cholera surged with the rains — 35,591 cases and 2,025 deaths "
                + "were recorded countrywide in 1997 (WHO), with Zanzibar suffering its worst epidemic (~200 deaths). "
                + "Tail-end floods in May 1998 left about 4,600 people homeless in Dar es Salaam.\n\n"
                + "2023/24 — The Hanang landslide at Katesh (3 Dec 2023) killed 89 people and affected ~44,000, with "
                + "9,107 households displaced (IFRC). By 25 April 2024 the Government reported 155 dead, 236 injured, "
                + "more than 200,000 people (51,000 households) affected and over 10,000 houses damaged, with crops, "
                + "roads, bridges and railways destroyed. Rufiji and Kibiti floods affected ~125,670 people and closed "
                + "10 schools (>1,900 pupils). Post-disaster assessment found 63 bridges, 827 km of roads, 84 km of "
                + "drainage and 225 culverts damaged across 139 districts; TZS 556 billion went to emergency road "
                + "repairs, supported by US$65 million World Bank financing to TARURA.\n\n"
                + "Floods and droughts cost Tanzania an estimated US$170 million in average annual losses (World "
                + "Bank, 2025) — the financing gap the NDRF-IP addresses. Affected sectors: transport (roads, "
                + "bridges, railways), education (schools), health (facilities and outbreaks), agriculture and water.";
        String sw = "Hasara zilizothibitishwa za El Niño zilizopita, kama zilivyokusanywa kwa ajili ya Mpango wa "
                + "Taifa wa Ugharamiaji wa Hatari za Maafa (2025/26–2030/31):\n\n"
                + "1997/98 — Mahitaji ya ujenzi mpya baada ya El Niño yalikadiriwa kuwa takriban dola bilioni 1 za "
                + "Marekani, sekta ya usafiri ikichukua 65% na kilimo 12.5% (Benki ya Dunia). Reli ya Kati ilifungwa "
                + "takriban miezi 10 kwa maporomoko ya tuta; ujenzi wa madaraja uliongezeka kutoka 22 hadi 52. "
                + "Kipindupindu kiliongezeka na mvua — wagonjwa 35,591 na vifo 2,025 nchini mwaka 1997 (WHO), Zanzibar "
                + "ikikumbwa na mlipuko mbaya zaidi (~vifo 200). Mafuriko ya Mei 1998 yaliacha watu ~4,600 bila makazi "
                + "Dar es Salaam.\n\n"
                + "2023/24 — Maporomoko ya Hanang, Katesh (3 Des 2023) yaliua watu 89 na kuathiri ~44,000; kaya 9,107 "
                + "zilihama (IFRC). Hadi 25 Aprili 2024 Serikali iliripoti vifo 155, majeruhi 236, watu zaidi ya "
                + "200,000 (kaya 51,000) kuathirika na nyumba zaidi ya 10,000 kuharibika; mazao, barabara, madaraja na "
                + "reli ziliharibiwa. Mafuriko ya Rufiji na Kibiti yaliathiri watu ~125,670 na kufunga shule 10 "
                + "(wanafunzi >1,900). Tathmini ilibaini madaraja 63, barabara km 827, mifereji km 84 na makalavati 225 "
                + "kuharibika katika halmashauri 139; TZS bilioni 556 zilitumika kukarabati barabara, zikisaidiwa na "
                + "dola milioni 65 za Benki ya Dunia kwa TARURA.\n\n"
                + "Mafuriko na ukame hugharimu Tanzania wastani wa dola milioni 170 kwa mwaka (Benki ya Dunia, 2025) — "
                + "pengo la ugharamiaji linaloshughulikiwa na NDRF-IP. Sekta zilizoathirika: usafiri, elimu, afya, "
                + "kilimo na maji.";
        jdbc.update("update public.threats set past_impacts_en = ?, past_impacts_sw = ?, updated_at = now()"
                + " where name = 'Super El Niño'", en, sw);
    }

    private void seedThreats() {
        Long n = jdbc.queryForObject("select count(*) from public.threats", Long.class);
        if (n != null && n > 0) {
            return;
        }
        // ---- Super El Niño (TMA) ----
        Long elnino = jdbc.queryForObject(
                "insert into public.threats(name,source_agency,trend_label,severity,description_en,description_sw,"
                        + "past_impacts_en,past_impacts_sw,is_active,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,true,now(),now()) returning id", Long.class,
                "Super El Niño", "TMA", "Trending from global centers", "Warning",
                "Global climate centers indicate a developing strong El Niño episode. TMA is monitoring "
                        + "oceanic and atmospheric indicators; enhanced rainfall is anticipated over most of Tanzania.",
                "Vituo vya hali ya hewa duniani vinaonesha kukua kwa El Niño kali. TMA inafuatilia viashiria; "
                        + "mvua kubwa zinatarajiwa katika maeneo mengi ya Tanzania.",
                "Per the National Disaster Risk Financing and Implementation Plan (2025/26–2030/31): past El Niño "
                        + "episodes (notably 1997/98 and 2023/24) caused major losses across Tanzania — destroyed road "
                        + "infrastructure and bridges, flooded schools and health facilities, displaced households, crop and "
                        + "livestock losses, and disease outbreaks including cholera. Affected sectors: transport (roads, "
                        + "bridges, railways), education (schools), health (facilities + outbreaks), agriculture and water. "
                        + "Sector-level loss and damage figures are maintained in the NDRF-IP and the disaster repository.",
                "Kwa mujibu wa Mpango wa Taifa wa Ugharamiaji wa Hatari za Maafa (2025/26–2030/31): El Niño za nyuma "
                        + "(hasa 1997/98 na 2023/24) zilisababisha hasara kubwa — barabara na madaraja kuharibika, shule na "
                        + "vituo vya afya kufurika, kaya kuhama, hasara za mazao na mifugo, na milipuko ya magonjwa ikiwemo "
                        + "kipindupindu. Sekta zilizoathirika: usafiri, elimu, afya, kilimo na maji.");
        update(elnino, "Activation of development of plans",
                "Sector, regional and stakeholder contingency plans activated. Stakeholders (sectors, LGAs, RAS, partners) "
                        + "develop and submit plans to PMO under this threat; submissions appear on the threat map and are "
                        + "tracked in the disaster repository.", "ONGOING", null, null, 0);
        update(elnino, "Development of draft contingency plan",
                "National draft El Niño contingency plan development workshop.", "NEW", "2026-06-15", "2026-06-19", 1);

        // ---- Ebola (Ministry of Health) ----
        Long ebola = jdbc.queryForObject(
                "insert into public.threats(name,source_agency,trend_label,severity,description_en,description_sw,"
                        + "is_active,created_at,updated_at) values (?,?,?,?,?,?,true,now(),now()) returning id", Long.class,
                "Ebola", "Ministry of Health", "Regional outbreak monitoring (EAC)", "Watch",
                "Bundibugyo Ebola Virus Disease outbreaks reported in the region (DRC, Uganda). MoH surveillance "
                        + "active at border points; EAC mobile laboratories deployed including in Tanzania.",
                "Milipuko ya Ebola (Bundibugyo) imeripotiwa kanda (DRC, Uganda). Wizara ya Afya inafuatilia mipakani; "
                        + "maabara zinazohamishika za EAC zimewekwa ikiwemo Tanzania.");
        update(ebola, "Collaboration with Ministry of Health",
                "Joint DMD–MoH coordination on surveillance, border-point readiness and risk communication.", "ONGOING", null, null, 0);
        update(ebola, "Review of the Ebola contingency plan",
                "National Ebola contingency plan under review with MoH and partners.", "NEW", null, null, 1);

        log.info("threat seed: Super El Niño (TMA) + Ebola (MoH) with DMD intervention timelines");
    }

    private void update(Long threatId, String title, String detail, String status, String start, String end, int order) {
        jdbc.update("insert into public.threat_updates(threat_id,title,detail,status,starts_on,ends_on,sort_order,"
                        + "is_active,created_at,updated_at) values (?,?,?,?,?::date,?::date,?,true,now(),now())",
                threatId, title, detail, status, start, end, order);
    }

    /** Real DMD news from public sources (provided by the user) — with source links in the body. */
    private void seedRealNews() {
        news("PMO and DIT sign MoU to fight disasters with science and technology",
                "pmo-dit-mou-disaster-technology",
                "The Prime Minister's Office (Policy, Parliament, Coordination and Persons with Disabilities) signed a "
                        + "Memorandum of Understanding with the Dar es Salaam Institute of Technology to apply scientific "
                        + "research, technology and innovation — including AI — in disaster management.",
                "Permanent Secretary Dr Jim Yonazi and DIT Rector Prof Preksedis Ndomba signed the MoU in Dar es Salaam "
                        + "on 8 June 2026. Dr Yonazi said the next step is a joint implementation work plan and a national "
                        + "disaster-management research agenda identifying priority areas needing scientific and technological "
                        + "answers, aligned with the National Development Vision 2050. Prof Ndomba pledged DIT's full expertise. "
                        + "\n\nSources: Daily News (9 Jun 2026), HabariLEO, Uhuru, TBC.",
                "images/events/photo_05.jpg", "news", 3);
        news("OWM gives UDOM disaster-risk-management students hands-on training",
                "owm-udom-hands-on-training",
                "The Government has stepped up efforts to strengthen disaster management systems by engaging university "
                        + "students in practical learning aimed at building future experts in the sector.",
                "Students of the disaster risk management degree programme at the University of Dodoma received practical "
                        + "training at the Prime Minister's Office (Sera, Bunge, Uratibu na Wenye Ulemavu), including exposure "
                        + "to the emergency operations environment. The programme builds the pipeline of national disaster-"
                        + "management experts and reflects the OWM–academia exchange programmes."
                        + "\n\nSources: therespondents.co.tz, Dodoma Press Club, Sema Swahili (Jun 2026).",
                "images/events/photo_01.jpg", "news", 4);
        news("OWM strengthens collaboration with WFP on disaster management",
                "owm-wfp-collaboration",
                "The Prime Minister's Office is deepening its partnership with the World Food Programme on disaster "
                        + "management, logistics and preparedness.",
                "Discussions in Dar es Salaam on 9 June 2026 covered strengthened cooperation between OWM's Disaster "
                        + "Management Department and WFP across preparedness, supply-chain readiness and response capacity."
                        + "\n\nSources: okuly.co.tz, habarika24.co.tz, Walter Habari, Like Channel TV (9 Jun 2026).",
                "images/events/photo_03.jpg", "news", 2);
        news("Mwanza Regional Emergency Operations and Communication Center launched",
                "mwanza-eoc-launch",
                "A PMO-DMD team led regional disaster-management training in Mwanza and launched the regional Emergency "
                        + "Operations and Communication Center.",
                "The Disaster Management Department team met Acting Regional Administrative Secretary Henry Mwaijega on "
                        + "4 June 2026, conducted training for the regional Disaster Management Committees and stakeholders, "
                        + "and launched the Mwanza Regional Emergency Operations and Communication Center on 5 June 2026 — "
                        + "part of strengthening regional preparedness, coordination and response capacity."
                        + "\n\nSources: miwani2025.blogspot.com, Habari na Matukio, Walter Habari (Jun 2026).",
                "images/events/photo_07.jpg", "news", 7);
        log.info("news seed: 4 real DMD activity items (sourced)");
    }

    private void news(String title, String slug, String excerpt, String body, String image, String category, int daysAgo) {
        Long exists = jdbc.queryForObject("select count(*) from public.portal_news where slug=?", Long.class, slug);
        if (exists != null && exists > 0) {
            return;
        }
        jdbc.update("insert into public.portal_news(title,slug,excerpt,body,image,category,published_at,is_active,"
                        + "created_at,updated_at) values (?,?,?,?,?,?,now() - (? || ' days')::interval,true,now(),now())",
                title, slug, excerpt, body, image, category, daysAgo);
    }
}
