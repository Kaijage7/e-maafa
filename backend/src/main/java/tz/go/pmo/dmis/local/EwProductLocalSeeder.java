package tz.go.pmo.dmis.local;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Demo data for EW Generated Products (Phase 2) so the "Generated Bulletins" map renders with real
 * products + downloadable PDFs even when the Python generation engine isn't running locally. Writes a
 * valid minimal PDF per product (computed xref) under storage/public/ew-products. Idempotent. Local only.
 */
@Component
@Profile("local")
@RequiredArgsConstructor
public class EwProductLocalSeeder {

    private static final Logger log = LoggerFactory.getLogger(EwProductLocalSeeder.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final JdbcTemplate jdbc;

    @Value("${dmis.storage.public-root:${user.dir}/storage/public}")
    private String publicRoot;

    @EventListener(ApplicationReadyEvent.class)
    public void seed() throws Exception {
        Long n = jdbc.queryForObject("select count(*) from public.ew_generated_products", Long.class);
        if (n != null && n > 0) {
            return;
        }
        // title, type (matches an exact engine icon), severity, regions, lat, lng
        record P(String title, String type, String severity, List<String> regions, double lat, double lng) { }
        List<P> products = List.of(
            new P("Heavy Rain Warning — Coastal Zone (722E_4)", "HEAVY_RAIN", "WARNING", List.of("Dar es Salaam", "Pwani"), -7.0, 39.0),
            new P("Large Waves Major Warning — Southern Coast (722E_4)", "LARGE_WAVES", "MAJOR_WARNING", List.of("Mtwara", "Lindi"), -10.3, 39.6),
            new P("Drought Advisory — Central Corridor (722E_4)", "DROUGHT", "ADVISORY", List.of("Dodoma", "Singida"), -5.5, 35.0),
            new P("Floods Warning — Lake Victoria Basin (722E_4)", "FLOODS", "WARNING", List.of("Mwanza", "Kagera", "Mara"), -2.0, 32.7),
            new P("Strong Wind Advisory — Southern Highlands (722E_4)", "STRONG_WIND", "ADVISORY", List.of("Mbeya", "Njombe", "Iringa"), -9.0, 34.2),
            new P("Earthquake Major Warning — Rift Valley Belt (722E_4)", "EARTHQUAKE", "MAJOR_WARNING", List.of("Kagera", "Kigoma"), -3.6, 30.7));

        Path dir = Path.of(publicRoot, "ew-products");
        Files.createDirectories(dir);
        int seeded = 0;
        for (P p : products) {
            String fileName = "sample-" + (seeded + 1) + ".pdf";
            Files.write(dir.resolve(fileName), minimalPdf(p.title()));
            List<Object> areas = new ArrayList<>();
            for (String r : p.regions()) {
                areas.add(java.util.Map.of("name", r, "level", p.severity()));
            }
            Object envelope = java.util.Map.of("days", List.of(java.util.Map.of(
                    "date", "current", "hazards", List.of(java.util.Map.of(
                            "type", p.type(), "areas", areas, "delineations", List.of())))));
            jdbc.update("""
                    insert into public.ew_generated_products(title, bulletin_type, issue_date, issue_time,
                        severity, regions, envelope, centroid_lat, centroid_lng, pdf_path, file_name,
                        generated_at, created_at)
                    values (?, '722E_4', current_date - (random()*6)::int, '15:30', ?, ?::json, ?::json, ?, ?, ?, ?, now(), now())
                    """, p.title(), p.severity(), JSON.writeValueAsString(p.regions()),
                    JSON.writeValueAsString(envelope), p.lat(), p.lng(), "ew-products/" + fileName,
                    p.title() + ".pdf");
            seeded++;
        }
        log.info("ew seed: {} generated bulletin products (+ sample PDFs)", seeded);
    }

    /** Build a valid single-page PDF with correct xref byte-offsets so viewers actually open it. */
    private byte[] minimalPdf(String title) {
        // PDF text must be ASCII so char-count == byte-count (the xref/Length offsets depend on it).
        String t = title.replaceAll("[^\\x20-\\x7E]", "-").replace("\\", "").replace("(", "\\(").replace(")", "\\)");
        String content = "BT /F1 15 Tf 60 770 Td (" + t + ") Tj 0 -28 Td /F1 11 Tf (DMIS Early Warning Bulletin - sample product) Tj ET";
        StringBuilder sb = new StringBuilder();
        List<Integer> offsets = new ArrayList<>();
        sb.append("%PDF-1.4\n");
        offsets.add(sb.length()); sb.append("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
        offsets.add(sb.length()); sb.append("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
        offsets.add(sb.length()); sb.append("3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n");
        offsets.add(sb.length()); sb.append("4 0 obj\n<< /Length ").append(content.length()).append(" >>\nstream\n").append(content).append("\nendstream\nendobj\n");
        offsets.add(sb.length()); sb.append("5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n");
        int xrefStart = sb.length();
        sb.append("xref\n0 6\n0000000000 65535 f \n");
        for (int off : offsets) { sb.append(String.format("%010d 00000 n \n", off)); }
        sb.append("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n").append(xrefStart).append("\n%%EOF");
        return sb.toString().getBytes(StandardCharsets.ISO_8859_1);
    }
}
