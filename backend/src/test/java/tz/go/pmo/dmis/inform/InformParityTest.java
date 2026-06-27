package tz.go.pmo.dmis.inform;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import tz.go.pmo.dmis.inform.domain.InformService;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Golden parity guard for the INFORM RISK engine. The fixture
 * {@code resources/inform/district-risk-golden.csv} holds the engine's district risks, which equal the
 * Excel "INFORM SADC 2024" AV column (verified 170/170 exact, max delta 0.000). If the engine math or the
 * normal seed (V115) ever drifts, this test fails — turning a one-time runtime check into a regression guard.
 *
 * <p>Runs under the {@code local} profile against the dev DB (the established DMIS integration-test pattern),
 * exercising the real seeded values end-to-end through {@link InformService#riskByLevel}.</p>
 */
@SpringBootTest
@ActiveProfiles("local")
class InformParityTest {

    @Autowired
    InformService inform;

    @Test
    void districtRisk_reproducesExcelGolden_170of170() throws Exception {
        Map<String, Double> golden = loadGolden();
        assertEquals(170, golden.size(), "golden fixture should hold 170 districts");

        List<Map<String, Object>> rows = inform.riskByLevel("district");
        Map<String, Double> got = new HashMap<>();
        for (Map<String, Object> r : rows) {
            Object risk = r.get("risk");
            if (risk != null) {
                got.put(String.valueOf(r.get("area")), ((Number) risk).doubleValue());
            }
        }

        int matched = 0;
        double maxDelta = 0;
        List<String> mismatches = new ArrayList<>();
        for (Map.Entry<String, Double> e : golden.entrySet()) {
            Double v = got.get(e.getKey());
            assertNotNull(v, "missing district in engine output: " + e.getKey());
            double d = Math.abs(v - e.getValue());
            maxDelta = Math.max(maxDelta, d);
            if (d <= 0.05) {
                matched++;
            } else {
                mismatches.add(e.getKey() + " golden=" + e.getValue() + " got=" + v);
            }
        }
        assertTrue(mismatches.isEmpty(), "engine drifted from the Excel-faithful golden: " + mismatches);
        assertEquals(170, matched, "all 170 districts must reproduce the Excel golden within 0.05 (maxDelta=" + maxDelta + ")");
    }

    private Map<String, Double> loadGolden() throws Exception {
        Map<String, Double> m = new LinkedHashMap<>();
        try (var in = getClass().getResourceAsStream("/inform/district-risk-golden.csv");
             var br = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8))) {
            assertNotNull(in, "golden fixture not found on classpath");
            String line;
            while ((line = br.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) {
                    continue;
                }
                String[] p = line.split(",");
                m.put(p[0].trim(), Double.parseDouble(p[1].trim()));
            }
        }
        return m;
    }
}
