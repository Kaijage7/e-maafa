package tz.go.pmo.dmis.preparedness;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.server.ResponseStatusException;

/**
 * Reads the existing evacuation_centers table for the index screen, plus creates new centers
 * (write via JdbcTemplate so the read entity stays immutable). Reproduces EvacuationCenterController.
 */
@Service
@RequiredArgsConstructor
public class EvacuationCenterService {

    private final EvacuationCenterRepository centers;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbc;

    @Transactional(readOnly = true)
    public EvacuationCenterResponse index() {
        List<EvacuationCenter> all = centers.findAllByOrderByIdDesc();
        List<EvacuationCenterResponse.CenterRow> rows = all.stream().map(this::toRow).toList();
        long total = all.size();
        long active = all.stream().filter(c -> "Active".equalsIgnoreCase(c.getStatus())).count();
        long totalCapacity = all.stream().mapToLong(c -> c.getCapacityPeople() == null ? 0 : c.getCapacityPeople()).sum();
        long regionsCovered = all.stream().map(EvacuationCenter::getRegion).filter(Objects::nonNull).distinct().count();
        return new EvacuationCenterResponse(rows,
                new EvacuationCenterResponse.Stats(total, active, totalCapacity, regionsCovered));
    }

    /** Creates a new evacuation center (Evacuation Centers → New Center). */
    @Transactional
    public Map<String, Object> create(EvacuationCenterWriteRequest req) {
        if (!StringUtils.hasText(req.centreName()) || !StringUtils.hasText(req.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Center name and status are required");
        }
        // gap-safe code (MAX suffix +1), not count(*)+1 — pairs with the UNIQUE on ecentre_id.
        Long seq = jdbc.queryForObject(
                "select coalesce(max(nullif(regexp_replace(substring(ecentre_id from 4), '[^0-9]', '', 'g'), '')::int), 0) + 1"
                        + " from public.evacuation_centers where ecentre_id like 'EC-%'", Long.class);
        String ecentreId = String.format("EC-%05d", seq == null ? 1 : seq);
        Long id = jdbc.queryForObject(
                "insert into public.evacuation_centers(ecentre_id,centre_name,centre_type,region,district,council,"
                        + "capacity_people,accessibility,status,latitude,longitude,created_at,updated_at) "
                        + "values (?,?,?,?,?,?,?,?,?,?,?,now(),now()) returning id", Long.class,
                ecentreId, req.centreName().trim(), typeArray(req.centreType()),
                blankToNull(req.region()), blankToNull(req.district()), blankToNull(req.council()), req.capacityPeople(),
                blankToNull(req.accessibility()), req.status(), req.latitude(), req.longitude());
        return Map.of("id", id, "ecentreId", ecentreId, "message", "Evacuation center created");
    }

    /** One center's fields for the edit form (centre_type collapsed to its single value). */
    @Transactional(readOnly = true)
    public Map<String, Object> detail(long id) {
        EvacuationCenter c = centers.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Evacuation center not found"));
        List<String> types = parseTypes(c.getCentreType());
        java.util.Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("id", c.getId());
        m.put("ecentreId", c.getEcentreId());
        m.put("centreName", c.getCentreName());
        m.put("centreType", types.isEmpty() ? null : types.get(0));
        m.put("region", c.getRegion());
        m.put("district", c.getDistrict());
        m.put("council", c.getCouncil());
        m.put("capacityPeople", c.getCapacityPeople());
        m.put("status", c.getStatus());
        m.put("accessibility", c.getAccessibility());
        m.put("latitude", toDouble(c.getLatitude()));
        m.put("longitude", toDouble(c.getLongitude()));
        return m;
    }

    /** Updates an existing center (Evacuation Centers → Edit). The ecentre_id code is immutable. */
    @Transactional
    public Map<String, Object> update(long id, EvacuationCenterWriteRequest req) {
        if (!StringUtils.hasText(req.centreName()) || !StringUtils.hasText(req.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Center name and status are required");
        }
        int n = jdbc.update(
                "update public.evacuation_centers set centre_name=?, centre_type=?, region=?, district=?, council=?,"
                        + " capacity_people=?, accessibility=?, status=?, latitude=?, longitude=?, updated_at=now()"
                        + " where id=?",
                req.centreName().trim(), typeArray(req.centreType()),
                blankToNull(req.region()), blankToNull(req.district()), blankToNull(req.council()), req.capacityPeople(),
                blankToNull(req.accessibility()), req.status(), req.latitude(), req.longitude(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Evacuation center not found");
        }
        return Map.of("id", id, "message", "Evacuation center updated");
    }

    private String typeArray(String type) {
        if (!StringUtils.hasText(type)) {
            return "[]";
        }
        try {
            return objectMapper.writeValueAsString(List.of(type));
        } catch (Exception e) {
            return "[]";
        }
    }

    private static String blankToNull(String v) {
        return StringUtils.hasText(v) ? v.trim() : null;
    }

    private EvacuationCenterResponse.CenterRow toRow(EvacuationCenter c) {
        return new EvacuationCenterResponse.CenterRow(
                c.getId(), c.getEcentreId(), c.getCentreName(), parseTypes(c.getCentreType()),
                c.getRegion(), c.getDistrict(), c.getCouncil(), c.getCapacityPeople(), c.getStatus(), c.getAccessibility(),
                toDouble(c.getLatitude()), toDouble(c.getLongitude()));
    }

    private List<String> parseTypes(String json) {
        if (!StringUtils.hasText(json)) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() { });
        } catch (Exception e) {
            return List.of(json);
        }
    }

    private static Double toDouble(BigDecimal value) {
        return value == null ? null : value.doubleValue();
    }
}
