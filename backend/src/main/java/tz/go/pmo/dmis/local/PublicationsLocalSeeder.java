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
 * Seeds the publications library with the REAL, publicly available DMD/PMO documents —
 * English and Swahili editions tagged separately so the public page arranges both parts.
 *
 * <p>The PDF files themselves were retrieved from their official sources (pmo.go.tz,
 * TanzLII) into {@code storage/public/publications/}; each entry keeps the source URL in
 * {@code external_link} for attribution. Documents that are referenced but not yet published
 * online (e.g. the NDRF-IP 2025/26–2030/31, the English edition of the 2022 Act) are NOT
 * invented — CM → Disaster Risk Frameworks is where DMD uploads them when available.
 * Idempotent per document name.</p>
 */
@Component
@Profile("local")
@Order(23)
@RequiredArgsConstructor
public class PublicationsLocalSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(PublicationsLocalSeeder.class);

    private final JdbcTemplate jdbc;

    @Override
    public void run(String... args) {
        // Drop the E2E-audit leftover (test data, not a publication)
        jdbc.update("delete from public.disaster_risk_frameworks where document_name like 'AUDIT %'");

        // ---- Acts (Sheria) ----
        doc("Sheria ya Usimamizi wa Maafa, Na. 6 ya 2022 (Sura 242)", "Act", 2022, "sw",
                "Sheria kuu ya usimamizi wa maafa Tanzania Bara — inaanzisha mfumo wa kitaasisi (NDMA), kamati za "
                        + "maafa ngazi zote, na Mfuko wa Taifa wa Maafa. Ilifuta Sheria Na. 7 ya 2015.",
                "publications/sheria-ya-usimamizi-wa-maafa-na-6-2022-sw.pdf",
                "https://tanzlii.org/en/akn/tz/act/2022/6/swa@2023-12-31");
        attachIfMissing("Disaster Management Act No. 7 of 2015",
                "publications/disaster-management-act-7-2015-en.pdf",
                "https://tanzlii.org/akn/tz/act/2015/7",
                "The previous principal Act (English) — repealed and replaced by the Disaster Management Act, "
                        + "No. 6 of 2022 (Cap. 242). Kept in the library for legal history.");

        // ---- Plans and Strategies (Mikakati na Mipango) ----
        doc("National Disaster Management Strategy 2022–2027", "Plans and Strategies", 2022, "en",
                "The national strategy guiding disaster risk reduction and management across sectors — priorities, "
                        + "institutional responsibilities and the results framework for 2022–2027.",
                "publications/national-disaster-management-strategy-2022-2027-en.pdf",
                "https://www.pmo.go.tz/documents/documents");
        doc("Mkakati wa Taifa wa Usimamizi wa Maafa 2022–2027", "Plans and Strategies", 2022, "sw",
                "Toleo la Kiswahili la Mkakati wa Taifa wa Usimamizi wa Maafa — vipaumbele, majukumu ya kitaasisi "
                        + "na mfumo wa matokeo kwa kipindi cha 2022–2027.",
                "publications/mkakati-wa-taifa-wa-usimamizi-wa-maafa-2022-2027-sw.pdf",
                "https://www.pmo.go.tz/documents/documents");
        doc("Tanzania Emergency Preparedness and Response Plan (TEPRP)", "Plans and Strategies", 2022, "en",
                "The national multi-hazard emergency preparedness and response plan — coordination structures, "
                        + "trigger levels and sector responsibilities for emergency operations.",
                "publications/tanzania-emergency-preparedness-response-plan-teprp-en.pdf",
                "https://www.pmo.go.tz/documents/documents");
        doc("National One Health Strategic Plan 2022–2027", "Plans and Strategies", 2022, "en",
                "PMO strategic plan coordinating human, animal and environmental health sectors against zoonotic "
                        + "and other shared health threats (One Health approach).",
                "publications/national-one-health-strategic-plan-2022-2027-en.pdf",
                "https://www.pmo.go.tz/documents/documents");

        // ---- Guidelines (Miongozo) ----
        doc("National Operational Guidelines for Disaster Management (Second Edition)", "DRR Guidelines", 2014, "en",
                "Operational guidelines for the Disaster Management Department — committee operations, assessment, "
                        + "response coordination and reporting procedures (second edition).",
                "publications/national-operational-guidelines-disaster-management-2014-en.pdf",
                "https://www.pmo.go.tz/documents/documents");
        doc("Mwongozo wa Uendeshaji wa Kituo cha Operesheni na Mawasiliano ya Dharura", "DRR Guidelines", 2022, "sw",
                "Mwongozo wa uendeshaji wa Kituo cha Operesheni na Mawasiliano ya Dharura (EOCC) — muundo, "
                        + "majukumu na taratibu za kazi za kituo wakati wa hali ya kawaida na dharura.",
                "publications/mwongozo-kituo-cha-operesheni-na-mawasiliano-ya-dharura-sw.pdf",
                "https://www.pmo.go.tz/documents/documents");

        // ---- Risk knowledge (external-link only; PDF behind a JS download wall) ----
        doc("Disaster Risk Profile — United Republic of Tanzania (UNDRR/CIMA)", "Other", 2019, "en",
                "National flood and drought risk profile — hazard, exposure and risk metrics including projected "
                        + "climate-change impacts. Hosted by UNDRR (download via the source link).",
                null, "https://www.undrr.org/publication/disaster-risk-profile-tanzania");

        log.info("publications seed: real DMD documents (EN + SW editions, sourced)");
    }

    /** Inserts a publication once (matched by document name); files live under storage/public/. */
    private void doc(String name, String type, int year, String lang,
                     String narrative, String attachmentPath, String sourceUrl) {
        Long exists = jdbc.queryForObject(
                "select count(*) from public.disaster_risk_frameworks where document_name = ?", Long.class, name);
        if (exists != null && exists > 0) {
            return;
        }
        jdbc.update("insert into public.disaster_risk_frameworks(document_type,document_name,year_of_approval,"
                        + "language,geographic_scope,narrative_description,attachment_path,external_link,status,"
                        + "created_at,updated_at) values (?,?,?,?,'National',?,?,?,'Active',now(),now())",
                type, name, year, lang, narrative, attachmentPath, sourceUrl);
    }

    /** Backfills the file/source onto a pre-seeded entry that had no attachment. */
    private void attachIfMissing(String name, String attachmentPath, String sourceUrl, String narrative) {
        jdbc.update("update public.disaster_risk_frameworks set attachment_path = ?, external_link = ?,"
                        + " narrative_description = ?, language = 'en', updated_at = now()"
                        + " where document_name = ? and attachment_path is null",
                attachmentPath, sourceUrl, narrative, name);
    }
}
