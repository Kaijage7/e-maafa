package tz.go.pmo.dmis.service.impl;

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
import tz.go.pmo.dmis.common.geo.RegionCentroids;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.AreaLookup;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.common.sql.SafeIdentifiers;
import tz.go.pmo.dmis.dto.request.WarehouseWriteRequest;
import tz.go.pmo.dmis.dto.response.WarehouseResponse;
import tz.go.pmo.dmis.entity.Warehouse;
import tz.go.pmo.dmis.repository.WarehouseRepository;
import tz.go.pmo.dmis.service.WarehouseService;

/**
 * Warehouse registry: jurisdiction-scoped reads, JDBC writes (entity stays immutable).
 * Stock units match warehouse-ops ledger predicate. Area bind for officers lives here (not in controller).
 */
@Service
@RequiredArgsConstructor
public class WarehouseServiceImpl implements WarehouseService {

    /** Matches the preparedness map maxBounds so plotted markers are actually visible. */
    private static final double TZ_LAT_MIN = -12.0;
    private static final double TZ_LAT_MAX = -0.8;
    private static final double TZ_LNG_MIN = 29.0;
    private static final double TZ_LNG_MAX = 41.0;

    private final WarehouseRepository warehouses;
    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;
    private final AreaLookup areaLookup;
    private final AreaGuard areaGuard;
    private final RegionCentroids regionCentroids;

    @Override
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

    @Override
    @Transactional
    public Map<String, Object> create(WarehouseWriteRequest req) {
        req = bindToCallerArea(req);
        if (req.name() == null || req.name().isBlank() || req.zone() == null || req.zone().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and zone are required");
        }
        Long regionId = areaLookup.regionId(req.region());
        Long districtId = areaLookup.districtId(req.district(), regionId);
        double[] coords = resolveMapCoordinates(req.latitude(), req.longitude(), req.region());
        Long id = jdbc.queryForObject(
                "insert into public.warehouses(name,zone,city_or_region,location_address,storage_capacity_sqm,"
                        + "contact_person_name,contact_person_phone,operational_status,latitude,longitude,"
                        + "region_id,district_id,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,?,?,?,?,now(),now()) returning id",
                Long.class,
                req.name().trim(), req.zone(), blankToNull(req.cityOrRegion()), blankToNull(req.locationAddress()),
                req.storageCapacitySqm(), blankToNull(req.contactPersonName()), blankToNull(req.contactPersonPhone()),
                req.operationalStatus() == null || req.operationalStatus().isBlank() ? "Operational" : req.operationalStatus(),
                coords == null ? null : coords[0], coords == null ? null : coords[1], regionId, districtId);
        return Map.of("id", id, "message", "Warehouse created");
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> show(long id) {
        areaGuard.assertWarehouseVisible("public.warehouses", id);
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

    @Override
    @Transactional
    public Map<String, Object> update(long id, WarehouseWriteRequest req) {
        areaGuard.assertWarehouseVisible("public.warehouses", id);
        req = bindToCallerArea(req);
        if (req.name() == null || req.name().isBlank() || req.zone() == null || req.zone().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and zone are required");
        }
        Long regionId = areaLookup.regionId(req.region());
        Long districtId = areaLookup.districtId(req.district(), regionId);
        double[] coords = resolveMapCoordinates(req.latitude(), req.longitude(), req.region());
        int n = jdbc.update("""
                update public.warehouses set name=?, zone=?, city_or_region=?, location_address=?,
                    storage_capacity_sqm=?, contact_person_name=?, contact_person_phone=?, operational_status=?,
                    latitude=?, longitude=?, region_id=?, district_id=?, updated_at=now() where id=?
                """,
                req.name().trim(), req.zone(), blankToNull(req.cityOrRegion()), blankToNull(req.locationAddress()),
                req.storageCapacitySqm(), blankToNull(req.contactPersonName()), blankToNull(req.contactPersonPhone()),
                req.operationalStatus() == null || req.operationalStatus().isBlank() ? "Operational" : req.operationalStatus(),
                coords == null ? null : coords[0], coords == null ? null : coords[1], regionId, districtId, id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Warehouse not found");
        }
        return Map.of("id", id, "message", "Warehouse updated");
    }

    /**
     * Coordinates are optional for the registry row, but when present they must fall inside the
     * Tanzania map viewport; otherwise the marker is created and never visible. When both are
     * blank and a known region is set, fall back to that region's centroid so area-stamped stores
     * still appear on the preparedness map.
     */
    private double[] resolveMapCoordinates(Double latitude, Double longitude, String regionName) {
        boolean hasLat = latitude != null;
        boolean hasLng = longitude != null;
        if (hasLat ^ hasLng) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Provide both latitude and longitude, or leave both empty.");
        }
        if (hasLat) {
            double lat = latitude;
            double lng = longitude;
            if (lat < TZ_LAT_MIN || lat > TZ_LAT_MAX || lng < TZ_LNG_MIN || lng > TZ_LNG_MAX) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Coordinates must be inside Tanzania (lat about -12…-0.8, lng about 29…41). "
                                + "Values outside this box are clipped by the map and look “missing”.");
            }
            return new double[] { lat, lng };
        }
        double[] centroid = regionCentroids.forRegion(regionName);
        if (centroid != null
                && centroid[0] >= TZ_LAT_MIN && centroid[0] <= TZ_LAT_MAX
                && centroid[1] >= TZ_LNG_MIN && centroid[1] <= TZ_LNG_MAX) {
            return centroid;
        }
        return null;
    }

    /** Area officers may only create/update warehouses stamped to their own region/district. */
    private WarehouseWriteRequest bindToCallerArea(WarehouseWriteRequest req) {
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        if (tier != JurisdictionScope.Tier.REGION && tier != JurisdictionScope.Tier.DISTRICT) {
            return req;
        }
        Map<String, Object> area = jurisdiction.currentArea();
        String regionName = nameOf("regions", area.get("region_id"));
        String districtName = tier == JurisdictionScope.Tier.DISTRICT
                ? nameOf("districts", area.get("district_id"))
                : null;
        if (regionName == null && area.get("district_id") != null) {
            List<String> names = jdbc.queryForList(
                    "select r.name from public.regions r join public.districts d on d.region_id = r.id where d.id = ?",
                    String.class, area.get("district_id"));
            regionName = names.isEmpty() ? null : names.get(0);
        }
        return new WarehouseWriteRequest(
                req.name(), req.zone(), req.cityOrRegion(), req.locationAddress(), req.storageCapacitySqm(),
                req.contactPersonName(), req.contactPersonPhone(), req.operationalStatus(),
                req.latitude(), req.longitude(), regionName, districtName);
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
