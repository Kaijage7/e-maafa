package tz.go.pmo.dmis.preparedness;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.AreaLookup;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Reads the existing warehouses table and shapes it for the Warehouses index screen, reproducing
 * the warehouse registry rows + the four statistics. Also creates new warehouses (write via JdbcTemplate
 * so the read entity stays immutable). The registry is jurisdiction-scoped: a region/district officer
 * sees their own area plus shared (null-area) warehouses; the national tier sees all. Stock units per
 * warehouse aggregate the inventory_items ledger with the same predicate warehouse-ops uses
 * (warehouse_id = w.id and temporary_warehouse_id is null) so both screens report identical numbers.
 */
@Service
@RequiredArgsConstructor
public class WarehouseService {

    private final WarehouseRepository warehouses;
    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;
    private final AreaLookup areaLookup;

    @Transactional(readOnly = true)
    public WarehouseResponse index() {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        List<Warehouse> all = warehouses.findScoped(f.scope(), f.regionId(), f.districtId());
        Map<Long, String> regions = nameMap("regions");
        Map<Long, String> districts = nameMap("districts");
        Map<Long, Long> stockUnits = stockUnitsByWarehouse();
        List<WarehouseResponse.WarehouseRow> rows =
                all.stream().map(w -> toRow(w, regions, districts, stockUnits)).toList();
        long total = all.size();
        long operational = all.stream().filter(w -> "Operational".equalsIgnoreCase(w.getOperationalStatus())).count();
        long underMaintenance = all.stream().filter(w -> "Under renovation".equalsIgnoreCase(w.getOperationalStatus())).count();
        long totalCapacity = all.stream().mapToLong(w -> capacity(w.getStorageCapacitySqm())).sum();
        return new WarehouseResponse(rows,
                new WarehouseResponse.Stats(total, operational, underMaintenance, totalCapacity));
    }

    /** Creates a new warehouse (Warehouses → New Warehouse). */
    @Transactional
    public Map<String, Object> create(WarehouseWriteRequest req) {
        if (req.name() == null || req.name().isBlank() || req.zone() == null || req.zone().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and zone are required");
        }
        Long regionId = areaLookup.regionId(req.region());
        Long districtId = areaLookup.districtId(req.district(), regionId);
        Long id = jdbc.queryForObject(
                "insert into public.warehouses(name,zone,city_or_region,location_address,storage_capacity_sqm,"
                        + "contact_person_name,contact_person_phone,operational_status,latitude,longitude,"
                        + "region_id,district_id,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,?,?,?,?,now(),now()) returning id",
                Long.class,
                req.name().trim(), req.zone(), blankToNull(req.cityOrRegion()), blankToNull(req.locationAddress()),
                req.storageCapacitySqm(), blankToNull(req.contactPersonName()), blankToNull(req.contactPersonPhone()),
                req.operationalStatus() == null || req.operationalStatus().isBlank() ? "Operational" : req.operationalStatus(),
                req.latitude(), req.longitude(), regionId, districtId);
        return Map.of("id", id, "message", "Warehouse created");
    }

    /** Single warehouse (for the edit form to pre-fill). */
    @Transactional(readOnly = true)
    public Map<String, Object> show(long id) {
        var rows = jdbc.queryForList("""
                select w.id, w.name, w.zone, w.city_or_region as "cityOrRegion",
                       w.location_address as "locationAddress",
                       w.storage_capacity_sqm as "storageCapacitySqm", w.contact_person_name as "contactPersonName",
                       w.contact_person_phone as "contactPersonPhone", w.operational_status as "operationalStatus",
                       w.latitude, w.longitude, r.name as region, d.name as district
                from public.warehouses w
                left join public.regions r on r.id = w.region_id
                left join public.districts d on d.id = w.district_id
                where w.id = ?
                """, id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Warehouse not found");
        }
        return rows.get(0);
    }

    /** Updates an existing warehouse (Warehouses → Edit). */
    @Transactional
    public Map<String, Object> update(long id, WarehouseWriteRequest req) {
        if (req.name() == null || req.name().isBlank() || req.zone() == null || req.zone().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and zone are required");
        }
        Long regionId = areaLookup.regionId(req.region());
        Long districtId = areaLookup.districtId(req.district(), regionId);
        int n = jdbc.update("""
                update public.warehouses set name=?, zone=?, city_or_region=?, location_address=?,
                    storage_capacity_sqm=?, contact_person_name=?, contact_person_phone=?, operational_status=?,
                    latitude=?, longitude=?, region_id=?, district_id=?, updated_at=now() where id=?
                """,
                req.name().trim(), req.zone(), blankToNull(req.cityOrRegion()), blankToNull(req.locationAddress()),
                req.storageCapacitySqm(), blankToNull(req.contactPersonName()), blankToNull(req.contactPersonPhone()),
                req.operationalStatus() == null || req.operationalStatus().isBlank() ? "Operational" : req.operationalStatus(),
                req.latitude(), req.longitude(), regionId, districtId, id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Warehouse not found");
        }
        return Map.of("id", id, "message", "Warehouse updated");
    }

    private static String blankToNull(String v) {
        return (v == null || v.isBlank()) ? null : v;
    }

    private WarehouseResponse.WarehouseRow toRow(Warehouse w, Map<Long, String> regions, Map<Long, String> districts,
                                                 Map<Long, Long> stockUnits) {
        return new WarehouseResponse.WarehouseRow(
                w.getId(), w.getName(), w.getCityOrRegion(), w.getLocationAddress(), w.getZone(),
                w.getStorageCapacitySqm() == null ? null : capacity(w.getStorageCapacitySqm()),
                w.getOperationalStatus(), stockUnits.getOrDefault(w.getId(), 0L),
                w.getContactPersonName(), w.getContactPersonPhone(),
                toDouble(w.getLatitude()), toDouble(w.getLongitude()),
                w.getRegionId() == null ? null : regions.get(w.getRegionId()),
                w.getDistrictId() == null ? null : districts.get(w.getDistrictId()));
    }

    /**
     * Total units currently held per permanent warehouse — same ledger predicate as the
     * warehouse-ops stock dashboard (temporary-warehouse lines excluded) so both screens agree.
     */
    private Map<Long, Long> stockUnitsByWarehouse() {
        Map<Long, Long> units = new HashMap<>();
        jdbc.query("""
                select ii.warehouse_id, coalesce(sum(ii.quantity), 0) as total_quantity
                from public.inventory_items ii
                where ii.warehouse_id is not null and ii.temporary_warehouse_id is null
                group by ii.warehouse_id
                """, rs -> { units.put(rs.getLong("warehouse_id"), rs.getLong("total_quantity")); });
        return units;
    }

    private Map<Long, String> nameMap(String table) {
        Map<Long, String> map = new HashMap<>();
        try {
            jdbc.query("select id, name from " + tz.go.pmo.dmis.common.sql.SafeIdentifiers.publicQualified(table),
                    rs -> { map.put(rs.getLong("id"), rs.getString("name")); });
        } catch (Exception ignored) {
            // reference table absent locally — names fall back to null
        }
        return map;
    }

    private static long capacity(BigDecimal value) {
        return value == null ? 0 : value.longValue();
    }

    private static Double toDouble(BigDecimal value) {
        return value == null ? null : value.doubleValue();
    }
}
