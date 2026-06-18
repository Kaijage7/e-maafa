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
 * Local seed for Content Management's education + agencies registries: published educational
 * content (feeds the PUBLIC /education portal) and the real EWE partner institutions
 * (TMA, MoW, GST, MoH, MoA, NEMC — same set the EW engine uses). Idempotent.
 */
@Component
@Profile("local")
@Order(21)
@RequiredArgsConstructor
public class ContentLocalSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(ContentLocalSeeder.class);

    private final JdbcTemplate jdbc;

    @Override
    public void run(String... args) {
        seedEducation();
        seedAgencies();
    }

    private void seedEducation() {
        Long n = jdbc.queryForObject("select count(*) from public.educational_contents", Long.class);
        if (n != null && n > 0) {
            return;
        }
        edu("Family Flood Preparedness Guide", "Guideline",
                "Practical steps every household should take before, during and after floods.",
                "Before the flood: know your evacuation route, prepare a go-bag with documents, water and a torch. "
                        + "During: move to higher ground immediately; never walk or drive through moving water. "
                        + "After: return only when authorities declare it safe; boil drinking water; report damage to your ward officer.",
                "PMO-DMD", "Community", "floods,preparedness,household", 14);
        edu("Understanding Early Warning Levels", "Article",
                "What Advisory, Warning and Major Warning mean — and what to do at each level.",
                "Advisory (yellow): be aware and follow updates. Warning (orange): be prepared to act; secure property "
                        + "and review evacuation plans. Major Warning (red): take action now — follow instructions from "
                        + "local authorities without delay.",
                "TMA", "Community,LGAs", "early warning,alert levels", 30);
        edu("School Emergency Drill Handbook", "Guideline",
                "How schools plan and run evacuation drills each term.",
                "Each school should map assembly points, assign teacher marshals, and run at least one full drill per "
                        + "term. This handbook provides the drill script, timing benchmarks and an after-action checklist.",
                "PMO-DMD", "Schools", "drills,schools,evacuation", 60);
        log.info("content seed: 3 educational contents");
    }

    private void edu(String title, String type, String summary, String full, String author,
                     String audience, String keywords, int daysAgo) {
        jdbc.update("insert into public.educational_contents(title,content_type,summary,full_content,author,"
                        + "publication_date,target_audience,keywords,is_published,created_at,updated_at)"
                        + " values (?,?,?,?,?,now()::date - ?, ?,?,true,now(),now())",
                title, type, summary, full, author, daysAgo, audience, keywords);
    }

    private void seedAgencies() {
        Long n = jdbc.queryForObject("select count(*) from public.agencies", Long.class);
        if (n != null && n > 0) {
            return;
        }
        agency("Tanzania Meteorological Authority", "TMA", "Weather forecasting and severe weather early warnings (722E_4 bulletins).", "https://www.meteo.go.tz");
        agency("Ministry of Water", "MoW", "Hydrological monitoring, river levels and flood early warnings.", "https://www.maji.go.tz");
        agency("Geological Survey of Tanzania", "GST", "Seismic monitoring — earthquakes, landslides and volcanic activity.", "https://www.gst.go.tz");
        agency("Ministry of Health", "MoH", "Disease outbreak surveillance and public health emergency response.", "https://www.moh.go.tz");
        agency("Ministry of Agriculture", "MoA", "Drought monitoring, food security and agricultural advisories.", "https://www.kilimo.go.tz");
        agency("National Environment Management Council", "NEMC", "Environmental hazard monitoring including air quality.", "https://www.nemc.or.tz");
        log.info("content seed: 6 agencies (EWE institutions)");
    }

    private void agency(String name, String acronym, String mandate, String website) {
        jdbc.update("insert into public.agencies(name,acronym,agency_type,mandate_description,website,is_active,"
                + "created_at,updated_at) values (?,?,'Government',?,?,true,now(),now())", name, acronym, mandate, website);
    }
}
