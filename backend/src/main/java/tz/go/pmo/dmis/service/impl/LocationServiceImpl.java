package tz.go.pmo.dmis.service.impl;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.service.LocationService;

/**
 * JDBC admin for regions / districts / councils / wards. Paths and JSON shapes are unchanged
 * from the former settings package controller. Other modules read these tables via SQL only.
 */
@Service
@RequiredArgsConstructor
public class LocationServiceImpl implements LocationService {

    private final JdbcTemplate jdbc;

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> index() {
        List<Map<String, Object>> regions = jdbc.queryForList(
                "select r.id, r.name, r.code, r.region_code as \"regionCode\","
                        + " coalesce(r.country_part, 'mainland') as \"countryPart\", r.population,"
                        + " (select count(*) from public.districts d where d.region_id = r.id) as \"districtCount\","
                        + " (select count(*) from public.councils c where c.region_id = r.id) as \"councilCount\","
                        + " (select count(*) from public.wards w join public.councils c on c.id = w.council_id"
                        + "    where c.region_id = r.id) as \"wardCount\""
                        + " from public.regions r order by r.name");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("regions", regions);
        out.put("stats", jdbc.queryForMap(
                "select (select count(*) from public.regions) as regions,"
                        + " (select count(*) from public.regions where coalesce(country_part, 'mainland') = 'mainland') as \"mainlandRegions\","
                        + " (select count(*) from public.regions where coalesce(country_part, 'mainland') = 'zanzibar') as \"zanzibarRegions\","
                        + " (select count(*) from public.districts) as districts,"
                        + " (select count(*) from public.districts where coalesce(country_part, 'mainland') = 'mainland') as \"mainlandDistricts\","
                        + " (select count(*) from public.councils) as councils,"
                        + " (select count(*) from public.councils where coalesce(country_part, 'mainland') = 'mainland') as \"mainlandCouncils\","
                        + " (select count(*) from public.councils where coalesce(country_part, 'mainland') = 'zanzibar') as \"zanzibarCouncils\","
                        + " (select count(*) from public.wards) as wards"));
        return out;
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> districts(long regionId) {
        return Map.of("districts", jdbc.queryForList(
                "select d.id, d.name, d.code, d.district_code as \"districtCode\","
                        + " coalesce(d.country_part, 'mainland') as \"countryPart\", d.population,"
                        + " (select count(*) from public.councils c where c.district_id = d.id) as \"councilCount\","
                        + " (select count(*) from public.wards w where w.district_id = d.id) as \"wardCount\""
                        + " from public.districts d where d.region_id = ? order by d.name", regionId));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> councils(long districtId) {
        return Map.of("councils", jdbc.queryForList(
                "select c.id, c.name, c.council_code as \"councilCode\","
                        + " coalesce(c.country_part, 'mainland') as \"countryPart\","
                        + " c.population, coalesce(c.is_active, true) as \"isActive\","
                        + " (select count(*) from public.wards w where w.council_id = c.id) as \"wardCount\","
                        + " (select count(*) from public.users u where u.council_id = c.id) as \"userCount\""
                        + " from public.councils c where c.district_id = ? order by c.name", districtId));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> wards(long districtId) {
        return Map.of("wards", jdbc.queryForList(
                "select id, name, ward_code as \"wardCode\", coalesce(is_active, true) as \"isActive\""
                        + " from public.wards where district_id = ? order by name", districtId));
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> councilWards(long councilId) {
        return Map.of("wards", jdbc.queryForList(
                "select id, name, ward_code as \"wardCode\", coalesce(is_active, true) as \"isActive\""
                        + " from public.wards where council_id = ? order by name", councilId));
    }

    @Override
    @Transactional
    public Map<String, Object> createRegion(Map<String, Object> req) {
        heal("regions");
        Long id = jdbc.queryForObject(
                "insert into public.regions(name, code, region_code, country_part, population, created_at, updated_at)"
                        + " values (?,?,?,?,?,now(),now()) returning id", Long.class,
                req(req, "name"), str(req.get("code")), str(req.get("regionCode")),
                countryPart(req.get("countryPart")), intOrNull(req.get("population")));
        ensureRegionalSeats(id);
        return Map.of("id", id, "message", "Region added");
    }

    @Override
    @Transactional
    public Map<String, Object> updateRegion(long id, Map<String, Object> req) {
        // NB: `code` (the short VARCHAR(10)) is intentionally NOT written here. The form never sends it,
        // so writing `code = ?` previously nulled an authoritative column on every edit (silent data loss).
        must(jdbc.update("update public.regions set name = coalesce(?,name), region_code = ?, country_part = coalesce(?, country_part),"
                + " population = ?, updated_at = now() where id = ?",
                str(req.get("name")), str(req.get("regionCode")), countryPartOrNull(req.get("countryPart")),
                intOrNull(req.get("population")), id), "Region not found");
        jdbc.update("update public.districts set country_part = (select country_part from public.regions where id = ?), updated_at = now() where region_id = ?",
                id, id);
        jdbc.update("update public.councils set country_part = (select country_part from public.regions where id = ?), updated_at = now() where region_id = ?",
                id, id);
        ensureRegionalSeats(id);
        return Map.of("message", "Region updated");
    }

    @Override
    @Transactional
    public void deleteRegion(long id) {
        Long children = jdbc.queryForObject("select count(*) from public.districts where region_id = ?", Long.class, id);
        if (children != null && children > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This region has " + children + " district(s) — remove them first.");
        }
        jdbc.update("delete from public.regions where id = ?", id);
    }

    @Override
    @Transactional
    public Map<String, Object> createDistrict(long regionId, Map<String, Object> req) {
        List<String> parts = jdbc.queryForList("select country_part from public.regions where id = ?", String.class, regionId);
        if (parts.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Region not found");
        }
        heal("districts");
        Long id = jdbc.queryForObject(
                "insert into public.districts(region_id, name, code, district_code, country_part, population, created_at, updated_at)"
                        + " values (?,?,?,?,?,?,now(),now()) returning id", Long.class,
                regionId, req(req, "name"), str(req.get("code")), str(req.get("districtCode")),
                parts.get(0), intOrNull(req.get("population")));
        return Map.of("id", id, "message", "District added");
    }

    @Override
    @Transactional
    public Map<String, Object> updateDistrict(long id, Map<String, Object> req) {
        // NB: `code` (short VARCHAR(10)) intentionally NOT written — the form never sends it, so the old
        // `code = ?` nulled an authoritative column on every edit (silent data loss).
        must(jdbc.update("update public.districts set name = coalesce(?,name), district_code = ?,"
                + " population = ?, updated_at = now() where id = ?",
                str(req.get("name")), str(req.get("districtCode")),
                intOrNull(req.get("population")), id), "District not found");
        return Map.of("message", "District updated");
    }

    @Override
    @Transactional
    public void deleteDistrict(long id) {
        Long councils = jdbc.queryForObject("select count(*) from public.councils where district_id = ?", Long.class, id);
        if (councils != null && councils > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This district has " + councils + " council/LGA(s) — remove them first.");
        }
        Long children = jdbc.queryForObject("select count(*) from public.wards where district_id = ?", Long.class, id);
        if (children != null && children > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This district has " + children + " ward(s) — remove them first.");
        }
        jdbc.update("delete from public.districts where id = ?", id);
    }

    @Override
    @Transactional
    public Map<String, Object> createCouncil(long districtId, Map<String, Object> req) {
        List<Map<String, Object>> parent = jdbc.queryForList(
                "select d.region_id, coalesce(d.country_part, r.country_part, 'mainland') as country_part"
                        + " from public.districts d left join public.regions r on r.id = d.region_id where d.id = ?",
                districtId);
        if (parent.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "District not found");
        }
        heal("councils");
        Long regionId = ((Number) parent.get(0).get("region_id")).longValue();
        String part = String.valueOf(parent.get(0).getOrDefault("country_part", "mainland"));
        Long id = jdbc.queryForObject(
                "insert into public.councils(region_id, district_id, name, council_code, country_part,"
                        + " population, is_active, created_at, updated_at)"
                        + " values (?,?,?,?,?,?,true,now(),now()) returning id", Long.class,
                regionId, districtId, req(req, "name"), str(req.get("councilCode")),
                part, intOrNull(req.get("population")));
        ensureCouncilSeats(id);
        return Map.of("id", id, "message", "Council/LGA added");
    }

    @Override
    @Transactional
    public Map<String, Object> updateCouncil(long id, Map<String, Object> req) {
        must(jdbc.update("update public.councils set name = coalesce(?,name), council_code = ?,"
                + " population = ?, is_active = coalesce(?, is_active), updated_at = now() where id = ?",
                str(req.get("name")), str(req.get("councilCode")),
                intOrNull(req.get("population")), bool(req.get("isActive")), id), "Council/LGA not found");
        ensureCouncilSeats(id);
        return Map.of("message", "Council/LGA updated");
    }

    @Override
    @Transactional
    public void deleteCouncil(long id) {
        Long wards = jdbc.queryForObject("select count(*) from public.wards where council_id = ?", Long.class, id);
        if (wards != null && wards > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This council/LGA has " + wards + " ward(s) — remove them first.");
        }
        Long incidents = jdbc.queryForObject("select count(*) from public.incidents where council_id = ?", Long.class, id);
        if (incidents != null && incidents > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This council/LGA has " + incidents + " incident record(s) — reassign or archive them first.");
        }
        Long namedUsers = jdbc.queryForObject("select count(*) from public.users where council_id = ? and coalesce(seeded_officer, false) = false",
                Long.class, id);
        if (namedUsers != null && namedUsers > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This council/LGA has " + namedUsers + " named user account(s) — reassign them first.");
        }
        jdbc.update("""
                delete from public.model_has_roles mhr
                using public.users u
                where mhr.model_id = u.id
                  and mhr.model_type = 'App\\Models\\User'
                  and u.council_id = ?
                  and coalesce(u.seeded_officer, false) = true
                """, id);
        jdbc.update("delete from public.users where council_id = ? and coalesce(seeded_officer, false) = true", id);
        jdbc.update("delete from public.councils where id = ?", id);
    }

    @Override
    @Transactional
    public Map<String, Object> createWard(long districtId, Map<String, Object> req) {
        Long exists = jdbc.queryForObject("select count(*) from public.districts where id = ?", Long.class, districtId);
        if (exists == null || exists == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "District not found");
        }
        heal("wards");
        Long id = jdbc.queryForObject(
                "insert into public.wards(district_id, name, ward_code, is_active, created_at, updated_at)"
                        + " values (?,?,?,true,now(),now()) returning id", Long.class,
                districtId, req(req, "name"), str(req.get("wardCode")));
        return Map.of("id", id, "message", "Ward added");
    }

    @Override
    @Transactional
    public Map<String, Object> createCouncilWard(long councilId, Map<String, Object> req) {
        List<Long> districts = jdbc.queryForList("select district_id from public.councils where id = ?", Long.class, councilId);
        if (districts.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Council/LGA not found");
        }
        heal("wards");
        Long id = jdbc.queryForObject(
                "insert into public.wards(district_id, council_id, name, ward_code, is_active, created_at, updated_at)"
                        + " values (?,?,?,?,true,now(),now()) returning id", Long.class,
                districts.get(0), councilId, req(req, "name"), str(req.get("wardCode")));
        return Map.of("id", id, "message", "Ward added");
    }

    @Override
    @Transactional
    public Map<String, Object> updateWard(long id, Map<String, Object> req) {
        must(jdbc.update("update public.wards set name = coalesce(?,name), ward_code = ?,"
                + " is_active = coalesce(?, is_active), updated_at = now() where id = ?",
                str(req.get("name")), str(req.get("wardCode")), bool(req.get("isActive")), id), "Ward not found");
        return Map.of("message", "Ward updated");
    }

    @Override
    @Transactional
    public void deleteWard(long id) {
        jdbc.update("delete from public.wards where id = ?", id);
    }

    /**
     * Self-heal an id sequence: the legacy seeder inserted reference rows with explicit ids without
     * advancing the sequence, so a fresh insert can collide on the pkey. Advance it to max(id) when
     * the table has rows (an empty table keeps its untouched sequence). Table is a controller
     * constant, never user input.
     */
    private void heal(String table) {
        jdbc.queryForList("select setval(pg_get_serial_sequence('public." + table + "','id'), m)"
                + " from (select max(id) m from " + tz.go.pmo.dmis.common.sql.SafeIdentifiers.publicQualified(table) + ") s where m is not null");
    }

    private void ensureRegionalSeats(long regionId) {
        jdbc.update("""
                with seats(role_name, email_prefix, position, label) as (
                    values
                        ('Reg DC', 'rdmc', 'Regional Disaster Coordinator', 'RDMC'),
                        ('RAS', 'ras', 'Regional Administrative Secretary', 'RAS'),
                        ('RC', 'rc', 'Regional Commissioner', 'RC'),
                        ('Regional Planning Officer', 'rpo', 'Regional Planning Officer', 'RPO'),
                        ('Regional Logistic Officer', 'rlo', 'Regional Logistic Officer', 'RLO')
                ),
                targets as (
                    select s.role_name,
                           s.position,
                           s.label || ' - ' || r.name as display_name,
                           lower(s.email_prefix || '.' || regexp_replace(coalesce(r.region_code, r.id::text), '[^A-Za-z0-9]+', '-', 'g') || '@positions.dmis.local') as email,
                           r.id as region_id,
                           'region:' || r.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
                    from public.regions r
                    cross join seats s
                    where r.id = ?
                      and coalesce(r.country_part, 'mainland') = 'mainland'
                      and exists (select 1 from public.roles rr where rr.name = s.role_name)
                      and not exists (select 1 from public.users u where u.position_key = 'region:' || r.id || ':' || lower(replace(s.role_name, ' ', '_')))
                )
                insert into public.users(name, email, password, email_verified_at, region_id, district_id, council_id,
                                         officer_position, position_key, seeded_officer,
                                         notify_in_app, notify_email, notify_sms, created_at, updated_at)
                select display_name, email, null, null, region_id, null, null,
                       position, position_key, true, true, false, false, now(), now()
                from targets
                on conflict (email) do nothing
                """, regionId);
        jdbc.update("""
                with seats(role_name) as (values
                    ('Reg DC'), ('RAS'), ('RC'),
                    ('Regional Planning Officer'), ('Regional Logistic Officer')),
                targets as (
                    select s.role_name, 'region:' || r.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
                    from public.regions r cross join seats s
                    where r.id = ?
                      and coalesce(r.country_part, 'mainland') = 'mainland'
                )
                insert into public.model_has_roles(role_id, model_type, model_id)
                select rr.id, 'App\\Models\\User', u.id
                from targets t
                join public.users u on u.position_key = t.position_key
                join public.roles rr on rr.name = t.role_name
                where not exists (
                    select 1 from public.model_has_roles mhr
                    where mhr.role_id = rr.id
                      and mhr.model_id = u.id
                      and mhr.model_type = 'App\\Models\\User'
                )
                """, regionId);
    }

    private void ensureCouncilSeats(long councilId) {
        jdbc.update("""
                with seats(role_name, email_prefix, position, label) as (
                    values
                        ('Dist DC', 'ddmc', 'District Disaster Coordinator', 'DDMC'),
                        ('DED', 'ded', 'District Executive Director', 'DED'),
                        ('DAS', 'das', 'District Administrative Secretary', 'DAS'),
                        ('District Commissioner', 'dc', 'District Commissioner', 'DC'),
                        ('District Planning Officer', 'dpo', 'District Planning Officer', 'DPO'),
                        ('District Logistic Officer', 'dlo', 'District Logistic Officer', 'DLO')
                ),
                targets as (
                    select s.role_name,
                           s.position,
                           s.label || ' - ' || c.name || ', ' || r.name as display_name,
                           lower(s.email_prefix || '.' || regexp_replace(coalesce(c.council_code, c.id::text), '[^A-Za-z0-9]+', '-', 'g') || '@positions.dmis.local') as email,
                           c.region_id,
                           c.district_id,
                           c.id as council_id,
                           'council:' || c.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
                    from public.councils c
                    join public.regions r on r.id = c.region_id
                    cross join seats s
                    where c.id = ?
                      and coalesce(c.country_part, 'mainland') = 'mainland'
                      and coalesce(c.is_active, true) = true
                      and exists (select 1 from public.roles rr where rr.name = s.role_name)
                      and not exists (select 1 from public.users u where u.position_key = 'council:' || c.id || ':' || lower(replace(s.role_name, ' ', '_')))
                )
                insert into public.users(name, email, password, email_verified_at, region_id, district_id, council_id,
                                         officer_position, position_key, seeded_officer,
                                         notify_in_app, notify_email, notify_sms, created_at, updated_at)
                select display_name, email, null, null, region_id, district_id, council_id,
                       position, position_key, true, true, false, false, now(), now()
                from targets
                on conflict (email) do nothing
                """, councilId);
        jdbc.update("""
                with seats(role_name) as (values
                    ('Dist DC'), ('DED'), ('DAS'), ('District Commissioner'),
                    ('District Planning Officer'), ('District Logistic Officer')),
                targets as (
                    select s.role_name, 'council:' || c.id || ':' || lower(replace(s.role_name, ' ', '_')) as position_key
                    from public.councils c cross join seats s
                    where c.id = ?
                      and coalesce(c.country_part, 'mainland') = 'mainland'
                      and coalesce(c.is_active, true) = true
                )
                insert into public.model_has_roles(role_id, model_type, model_id)
                select rr.id, 'App\\Models\\User', u.id
                from targets t
                join public.users u on u.position_key = t.position_key
                join public.roles rr on rr.name = t.role_name
                where not exists (
                    select 1 from public.model_has_roles mhr
                    where mhr.role_id = rr.id
                      and mhr.model_id = u.id
                      and mhr.model_type = 'App\\Models\\User'
                )
                """, councilId);
    }

    private static void must(int rows, String notFound) {
        if (rows == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, notFound);
        }
    }

    private static String req(Map<String, Object> m, String key) {
        String v = str(m.get(key));
        if (v == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " is required");
        }
        return v;
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static String countryPart(Object v) {
        String part = countryPartOrNull(v);
        return part == null ? "mainland" : part;
    }

    private static String countryPartOrNull(Object v) {
        String part = str(v);
        if (part == null) {
            return null;
        }
        if ("mainland".equalsIgnoreCase(part)) {
            return "mainland";
        }
        if ("zanzibar".equalsIgnoreCase(part)) {
            return "zanzibar";
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "countryPart must be mainland or zanzibar");
    }

    private static Integer intOrNull(Object v) {
        try {
            return v == null || String.valueOf(v).isBlank() ? null : (int) Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static Boolean bool(Object v) {
        return v == null ? null : Boolean.valueOf(String.valueOf(v));
    }
}
