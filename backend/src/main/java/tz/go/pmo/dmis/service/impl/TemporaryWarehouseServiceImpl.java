package tz.go.pmo.dmis.service.impl;

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
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.common.sql.SafeIdentifiers;
import tz.go.pmo.dmis.dto.request.TemporaryWarehouseWriteRequest;
import tz.go.pmo.dmis.dto.response.TemporaryWarehouseResponse;
import tz.go.pmo.dmis.entity.TemporaryWarehouse;
import tz.go.pmo.dmis.repository.TemporaryWarehouseRepository;
import tz.go.pmo.dmis.service.TemporaryWarehouseService;

/**
 * Temporary warehouse registry: jurisdiction-scoped reads, JDBC writes (entity immutable).
 * Deactivate blocked while residual stock remains on inventory_items.
 * Area bind + visibility live here (not in the controller).
 */
@Service
@RequiredArgsConstructor
public class TemporaryWarehouseServiceImpl implements TemporaryWarehouseService {

    private static final DateTimeFormatter D_MON_Y = DateTimeFormatter.ofPattern("dd MMM yyyy");

    private final TemporaryWarehouseRepository repo;
    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;

    @Override
    @Transactional(readOnly = true)
    public TemporaryWarehouseResponse index() {
        Map<Long, String> regions = nameMap("regions");
        Map<Long, String> districts = nameMap("districts");
        Map<Long, String> councils = nameMap("councils");
        var f = jurisdiction.sharedOrOwnFilter();
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

    @Override
    @Transactional
    public Map<String, Object> create(TemporaryWarehouseWriteRequest req) {
        req = bindArea(req);
        if (req.name() == null || req.name().isBlank() || req.level() == null || req.level().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and level are required");
        }
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

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> detail(long id) {
        areaGuard.assertWarehouseVisible("public.temporary_warehouses", id);
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

    @Override
    @Transactional
    public Map<String, Object> update(long id, TemporaryWarehouseWriteRequest req) {
        areaGuard.assertWarehouseVisible("public.temporary_warehouses", id);
        req = bindArea(req);
        if (req.name() == null || req.name().isBlank() || req.level() == null || req.level().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and level are required");
        }
        String status = req.operationalStatus() == null || req.operationalStatus().isBlank()
                ? "Active" : req.operationalStatus();
        boolean active = "Active".equalsIgnoreCase(status);
        if (!active) {
            Long residual = jdbc.queryForObject("""
                    select coalesce(sum(quantity), 0) from public.inventory_items
                     where temporary_warehouse_id = ? and coalesce(quantity, 0) > 0
                    """, Long.class, id);
            if (residual != null && residual > 0) {
                throw new BusinessRuleException(
                        "Cannot deactivate this temporary warehouse while it still holds "
                                + residual + " stock unit(s). Transfer the stock out first.");
            }
        }
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
                active, blank(req.contactPersonName()), blank(req.contactPersonPhone()),
                req.latitude(), req.longitude(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Temporary warehouse not found");
        }
        return Map.of("id", id, "message", "Temporary warehouse updated");
    }

    private static String blank(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }

    /** Area officers may only create/update temp warehouses stamped to their own region/district. */
    private TemporaryWarehouseWriteRequest bindArea(TemporaryWarehouseWriteRequest req) {
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        if (tier != JurisdictionScope.Tier.REGION && tier != JurisdictionScope.Tier.DISTRICT) {
            return req;
        }
        Map<String, Object> area = jurisdiction.currentArea();
        if (tier == JurisdictionScope.Tier.DISTRICT) {
            String districtName = nameOf("districts", area.get("district_id"));
            String regionName = nameOf("regions", area.get("region_id"));
            return withArea(req, regionName, districtName);
        }
        return withArea(req, nameOf("regions", area.get("region_id")), req.district());
    }

    private static TemporaryWarehouseWriteRequest withArea(
            TemporaryWarehouseWriteRequest r, String region, String district) {
        return new TemporaryWarehouseWriteRequest(r.name(), r.level(), region, district, r.council(),
                r.locationDescription(), r.contactPersonName(), r.contactPersonPhone(), r.operationalStatus(),
                r.latitude(), r.longitude());
    }

    private String nameOf(String table, Object id) {
        if (id == null) {
            return null;
        }
        List<String> names = jdbc.queryForList(
                "select name from " + SafeIdentifiers.publicQualified(table) + " where id = ?",
                String.class, id);
        return names.isEmpty() ? null : names.get(0);
    }

    private Long resolveRegion(String name) {
        return blank(name) == null ? null
                : firstId("select id from public.regions where lower(name) = lower(?)", name.trim());
    }

    private Long resolveDistrict(String name, Long regionId) {
        return (blank(name) == null || regionId == null) ? null
                : firstId("select id from public.districts where lower(name) = lower(?) and region_id = ?", name.trim(), regionId);
    }

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
            jdbc.query("select id, name from " + tz.go.pmo.dmis.common.sql.SafeIdentifiers.publicQualified(table),
                    rs -> { map.put(rs.getLong("id"), rs.getString("name")); });
        } catch (Exception ignored) {
            // table may not exist locally yet
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
