package tz.go.pmo.dmis.inform.engine;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/** Proves the DMIS INFORM engine reproduces the INFORM country-model arithmetic — no Spring/DB needed. */
class InformEngineTest {

    @Test
    void standardise_increaseRisk_minmax() {
        // Historic Drought Frequency: raw 11, range [5,19], Increase → 10*(11-5)/(19-5)=4.2857 → 4.3
        IndicatorSpec s = IndicatorSpec.normal("HA.NAT.DR-FRE", "Hazards & Exposure", "Natural", "Drought",
                "TMA", "Adm1", "None", 5, 19, "Increase Risk", 1);
        assertEquals(4.3, Standardiser.standardise(11.0, s, null));
    }

    @Test
    void standardise_decreaseRisk_inverts() {
        IndicatorSpec s = IndicatorSpec.normal("X", "Vulnerability", "Socio", "Poverty",
                "NBS", "Adm1", "None", 0, 10, "Decrease Risk", 1);
        assertEquals(8.0, Standardiser.standardise(2.0, s, null));
    }

    @Test
    void standardise_logarithm_offset() {
        IndicatorSpec s = IndicatorSpec.normal("L", "Hazards & Exposure", "Natural", "Flood",
                "TMA", "Adm2", "Logarithm", Math.log(0.001), Math.log(10.001), "Increase Risk", 1);
        assertEquals(10.0, Standardiser.standardise(10.0, s, null));
    }

    @Test
    void scaledGeomean_matchesJs() {
        assertEquals(3.062, InformEngine.sgm(List.of(2.0, 4.0)), 0.001);
        assertEquals(3.1, Standardiser.round1(InformEngine.sgm(List.of(2.0, 4.0))));
    }

    @Test
    void scaledGeomean_singleValueIsIdentity() {
        assertEquals(6.0, Standardiser.round1(InformEngine.sgm(List.of(6.0))));
    }

    @Test
    void risk_cubeRoot() {
        double r = Standardiser.round1(Math.pow(2.2, 1.0 / 3) * Math.pow(5.5, 1.0 / 3) * Math.pow(5.9, 1.0 / 3));
        assertEquals(4.1, r);
    }

    @Test
    void endToEnd_threeIndicators() {
        Map<String, IndicatorSpec> specs = new LinkedHashMap<>();
        specs.put("h", IndicatorSpec.normal("h", "Hazards & Exposure", "Natural", "Drought", "TMA", "Adm1", "None", 0, 10, "Increase Risk", 1));
        specs.put("v", IndicatorSpec.normal("v", "Vulnerability", "Socio", "Poverty", "NBS", "Adm1", "None", 0, 10, "Increase Risk", 1));
        specs.put("c", IndicatorSpec.normal("c", "Coping Capacity", "Infrastructure", "WASH", "MoW", "Adm1", "None", 0, 10, "Increase Risk", 1));
        Map<String, Double> raw = Map.of("h", 6.0, "v", 6.0, "c", 6.0);
        RiskResult r = InformEngine.computeFromRaw(raw, specs, null);
        assertEquals(6.0, r.hazard());
        assertEquals(6.0, r.vulnerability());
        assertEquals(6.0, r.coping());
        assertEquals(6.0, r.risk());
    }

    @Test
    void advancedBasket_weightedAndBlankSkipped() {
        Map<String, IndicatorSpec> specs = new LinkedHashMap<>();
        specs.put("fre", IndicatorSpec.normal("fre", "Hazards & Exposure", "Natural", "Drought", "TMA", "Adm1", "None", 5, 19, "Increase Risk", 1));
        specs.put("spei", IndicatorSpec.normal("spei", "Hazards & Exposure", "Natural", "Drought", "TMA", "Council", "None", 0, 3, "Increase Risk", 0.25));
        RiskResult only = InformEngine.computeFromRaw(Map.of("fre", 12.0), specs, null);
        Double freScore = Standardiser.standardise(12.0, specs.get("fre"), null);
        assertEquals(freScore, only.component().get("Drought"));
        RiskResult both = InformEngine.computeFromRaw(Map.of("fre", 12.0, "spei", 3.0), specs, null);
        assertEquals(6.0, Standardiser.round1(both.component().get("Drought")));
    }
}
