package tz.go.pmo.dmis.preparedness;

import java.math.BigDecimal;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Reads the existing temporary_warehouses table and resolves region/district names for the index screen.
 * Also creates new temporary warehouses (write via JdbcTemplate).
 */
@Service
@RequiredArgsConstructor
public class TemporaryWarehouseService {

    private static final DateTimeFormatter D_MON_Y = DateTimeFormatter.ofPattern("dd MMM yyyy");

    private final TemporaryWarehouseRepository repo;
    private final JdbcTemplate jdbc;
    private final tz.go.pmo.dmis.common.security.JurisdictionScope jurisdiction;

    @Transactional(readOnly = true)
    public TemporaryWarehouseResponse index() {
        Map<Long, String> regions = nameMap("regions");
        Map<Long, String> districts = nameMap("districts");
        Map<Long, String> councils = nameMap("councils");
        var f = jurisdiction.sharedOrOwnFilter();   // region/district officer → own area + shared; national → all
        List<TemporaryWarehouse> all = repo.findScoped(f.scope(), f.regionId(), f.districtId());

        List<TemporaryWarehouseResponse.Row> rows = all.stream().map(w -> new TemporaryWarehouseResponse.Row(
                w.getId(), w.getName(), w.getCode(), capitalize(w.getLevel()),
                regions.getOrDefault(w.getRegionId(), "-"), districts.getOrDefault(w.getDistrictId(), "-"),
                councils.getOrDefault(w.getCouncilId(), "-"),
                w.getLocationDescription(), w.getOperationalStatus(), Boolean.TRUE.equals(w.getIsActive()),
                w.getContactPersonName(), w.getContactPersonPhone(),
                toDouble(w.getLatitude()), toDouble(w.getLongitude()),
                w.getEstablishedDate() == null ? null : D_MON_Y.format(w.getEstablishedDate()))).toList();

        long total = all.size();
        long active = all.stream().filter(w -> "Active".equalsIgnoreCase(w.getOperationalStatus())).count();
        long regional = all.stream().filter(w -> "regional".equalsIgnoreCase(w.getLevel())).count();
        long national = all.stream().filter(w -> "national".equalsIgnoreCase(w.getLevel())).count();
        return new TemporaryWarehouseResponse(rows,
                new TemporaryWarehouseResponse.Stats(total, active, regional, national));
    }

    /** Creates a new temporary warehouse (auto code TW-NNNNN). */
    @Transactional
    public Map<String, Object> create(TemporaryWarehouseWriteRequest req) {
        if (req.name() == null || req.name().isBlank() || req.level() == null || req.level().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and level are required");
        }
        // gap-safe code (MAX suffix +1), not count(*)+1 — pairs with the UNIQUE on code.
        Long seq = jdbc.queryForObject(
                "select coalesce(max(nullif(regexp_replace(substring(code from 4), '[^0-9]', '', 'g'), '')::int), 0) + 1"
                        + " from public.temporary_warehouses where code like 'TW-%'", Long.class);
        String code = String.format("TW-%05d", seq == null ? 1 : seq);
        String status = req.operationalStatus() == null || req.operationalStatus().isBlank()
                ? "Active" : req.operationalStatus();
        Long regionId = resolveRegion(req.region());
        Long districtId = resolveDistrict(req.district(), regionId);
        Long councilId = resolveCouncil(req.council(), districtId);
        Long id = jdbc.queryForObject(
                "insert into public.temporary_warehouses(name,code,level,region_id,district_id,council_id,"
                        + "location_description,operational_status,"
                        + "is_active,contact_person_name,contact_person_phone,latitude,longitude,established_date,"
                        + "created_at,updated_at) values (?,?,?,?,?,?,?,?,?,?,?,?,?,now(),now(),now()) returning id",
                Long.class,
                req.name().trim(), code, req.level().toLowerCase(), regionId, districtId, councilId,
                blank(req.locationDescription()), status,
                "Active".equalsIgnoreCase(status), blank(req.contactPersonName()), blank(req.contactPersonPhone()),
                req.latitude(), req.longitude());
        return Map.of("id", id, "code", code, "message", "Temporary warehouse created");
    }

    /** One temporary warehouse's fields for the edit form. */
    @Transactional(readOnly = true)
    public Map<String, Object> detail(long id) {
        TemporaryWarehouse w = repo.findById(id).orElseThrow(
                () -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Temporary warehouse not found"));
        Map<String, Object> m = new HashMap<>();
        m.put("id", w.getId());
        m.put("code", w.getCode());
        m.put("name", w.getName());
        m.put("level", w.getLevel());
        m.put("operationalStatus", w.getOperationalStatus());
        m.put("region", w.getRegionId() == null ? null : nameMap("regions").get(w.getRegionId()));
        m.put("district", w.getDistrictId() == null ? null : nameMap("districts").get(w.getDistrictId()));
        m.put("council", w.getCouncilId() == null ? null : nameMap("councils").get(w.getCouncilId()));
        m.put("locationDescription", w.getLocationDescription());
        m.put("contactPersonName", w.getContactPersonName());
        m.put("contactPersonPhone", w.getContactPersonPhone());
        m.put("latitude", toDouble(w.getLatitude()));
        m.put("longitude", toDouble(w.getLongitude()));
        return m;
    }

    /** Updates an existing temporary warehouse (the TW- code is immutable). */
    @Transactional
    public Map<String, Object> update(long id, TemporaryWarehouseWriteRequest req) {
        if (req.name() == null || req.name().isBlank() || req.level() == null || req.level().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and level are required");
        }
        String status = req.operationalStatus() == null || req.operationalStatus().isBlank()
                ? "Active" : req.operationalStatus();
        Long regionId = resolveRegion(req.region());
        Long districtId = resolveDistrict(req.district(), regionId);
        Long councilId = resolveCouncil(req.council(), districtId);
        int n = jdbc.update(
                "update public.temporary_warehouses set name=?, level=?, region_id=?, district_id=?, council_id=?,"
                        + " location_description=?, operational_status=?,"
                        + " is_active=?, contact_person_name=?, contact_person_phone=?, latitude=?, longitude=?, updated_at=now()"
                        + " where id=?",
                req.name().trim(), req.level().toLowerCase(), regionId, districtId, councilId,
                blank(req.locationDescription()), status,
                "Active".equalsIgnoreCase(status), blank(req.contactPersonName()), blank(req.contactPersonPhone()),
                req.latitude(), req.longitude(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Temporary warehouse not found");
        }
        return Map.of("id", id, "message", "Temporary warehouse updated");
    }

    private static String blank(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }

    /** Resolve a picker region name to its public.regions id (case-insensitive). */
    private Long resolveRegion(String name) {
        return blank(name) == null ? null
                : firstId("select id from public.regions where lower(name) = lower(?)", name.trim());
    }

    /** Resolve a picker district name to its id within the chosen region. */
    private Long resolveDistrict(String name, Long regionId) {
        return (blank(name) == null || regionId == null) ? null
                : firstId("select id from public.districts where lower(name) = lower(?) and region_id = ?", name.trim(), regionId);
    }

    /** Resolve a picker council name to its id within the chosen district. */
    private Long resolveCouncil(String name, Long districtId) {
        return (blank(name) == null || districtId == null) ? null
                : firstId("select id from public.councils where lower(name) = lower(?) and district_id = ?", name.trim(), districtId);
    }

    private Long firstId(String sql, Object... args) {
        try {
            List<Long> ids = jdbc.queryForList(sql, Long.class, args);
            return ids.isEmpty() ? null : ids.get(0);
        } catch (Exception e) {
            return null;
        }
    }

    private Map<Long, String> nameMap(String table) {
        Map<Long, String> map = new HashMap<>();
        try {
            jdbc.query("select id, name from public." + table,
                    rs -> { map.put(rs.getLong("id"), rs.getString("name")); });
        } catch (Exception ignored) {
            // table may not exist locally yet — names fall back to "-"
        }
        return map;
    }

    private static String capitalize(String s) {
        return (s == null || s.isEmpty()) ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static Double toDouble(BigDecimal v) {
        return v == null ? null : v.doubleValue();
    }
}
