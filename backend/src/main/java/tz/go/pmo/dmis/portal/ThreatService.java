package tz.go.pmo.dmis.portal;

import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * THREAT MONITORING — the national threats DMD tracks beside live warnings
 * (e.g. Super El Niño sourced from TMA global-center trends; Ebola sourced from MoH).
 *
 * <p>Public reads: the threat strip (name, source, severity, trend), and the detail view —
 * DMD intervention timeline (NEW → ONGOING → COMPLETED) + stakeholder plan submissions
 * plotted by their geo info. Admin writes happen in {@link ThreatAdminController};
 * stakeholder plan uploads arrive through the public submission endpoint and are tracked
 * for the disaster repository.</p>
 */
@Service
@RequiredArgsConstructor
public class ThreatService {

    private final JdbcTemplate jdbc;

    /** Active threats for the public strip (beside LIVE MONITORING). */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> activeThreats() {
        return jdbc.queryForList(
                "select id, name, source_agency as \"sourceAgency\", trend_label as \"trendLabel\","
                        + " severity, graphic_path as \"graphicPath\","
                        + " description_en as \"descriptionEn\", description_sw as \"descriptionSw\""
                        + " from public.threats where is_active = true order by id");
    }

    /** Full threat detail: interventions timeline + submitted plans (for the map) + past impacts. */
    @Transactional(readOnly = true)
    public Map<String, Object> threatDetail(long id) {
        List<Map<String, Object>> threat = jdbc.queryForList(
                "select id, name, source_agency as \"sourceAgency\", trend_label as \"trendLabel\","
                        + " severity, graphic_path as \"graphicPath\", description_en as \"descriptionEn\","
                        + " description_sw as \"descriptionSw\", past_impacts_en as \"pastImpactsEn\","
                        + " past_impacts_sw as \"pastImpactsSw\""
                        + " from public.threats where id = ? and is_active = true", id);
        if (threat.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Threat not found");
        }
        List<Map<String, Object>> updates = jdbc.queryForList(
                "select title, detail, status, to_char(starts_on, 'DD Mon YYYY') as \"startsOn\","
                        + " to_char(ends_on, 'DD Mon YYYY') as \"endsOn\""
                        + " from public.threat_updates where threat_id = ? and is_active = true"
                        + " order by sort_order, id", id);
        List<Map<String, Object>> plans = jdbc.queryForList(
                "select plan_title as \"planTitle\", stakeholder_type as \"stakeholderType\","
                        + " stakeholder_name as \"stakeholderName\", region, latitude, longitude, status,"
                        + " to_char(created_at, 'DD Mon YYYY') as \"submittedOn\""
                        + " from public.threat_plans where threat_id = ? order by created_at desc", id);
        return Map.of("threat", threat.get(0), "updates", updates, "plans", plans);
    }

    /**
     * Stakeholder plan submission under a threat (sector/region/LGA contingency plans sent
     * to PMO). The geo + stakeholder info makes it appear on the threat map immediately;
     * the row itself is the repository-tracking record.
     */
    @Transactional
    public Map<String, Object> submitPlan(long threatId, Map<String, Object> req) {
        String title = str(req.get("planTitle"));
        String stakeholderName = str(req.get("stakeholderName"));
        if (title == null || stakeholderName == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Plan title and stakeholder name are required");
        }
        Long id = jdbc.queryForObject(
                "insert into public.threat_plans(threat_id,plan_title,stakeholder_type,stakeholder_name,region,"
                        + "latitude,longitude,file_path,submitted_by,status,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,?,'Submitted',now(),now()) returning id", Long.class,
                threatId, title, str(req.get("stakeholderType")) == null ? "sector" : str(req.get("stakeholderType")),
                stakeholderName, str(req.get("region")), num(req.get("latitude")), num(req.get("longitude")),
                str(req.get("filePath")), str(req.get("submittedBy")));
        return Map.of("id", id, "message", "Plan received by PMO — visible on the threat map and tracked in the repository");
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Double num(Object v) {
        try {
            return v == null ? null : Double.valueOf(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
