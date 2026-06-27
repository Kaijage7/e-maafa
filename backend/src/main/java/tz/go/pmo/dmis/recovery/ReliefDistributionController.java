package tz.go.pmo.dmis.recovery;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import org.springframework.security.access.prepost.PreAuthorize;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Relief Distribution (Recovery) — port of the Laravel relief_distributions module: logs each relief
 * item handed to a beneficiary group, traceable to the incident/assessment and the distributing
 * agency, with a Pending Verification → Confirmed status. The recovery counterpart of the response
 * dispatch chain.
 */
@RestController
@RequestMapping("/v1/recovery/relief-distributions")
public class ReliefDistributionController {

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;

    public ReliefDistributionController(JdbcTemplate jdbc, JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('recovery.view')")
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String search) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            where.append(" and d.confirmation_status = ?");
            params.add(status);
        }
        if (search != null && !search.isBlank()) {
            where.append(" and (d.beneficiary_name_or_group ilike ? or d.location_name ilike ? or r.name ilike ?)");
            params.add("%" + search + "%");
            params.add("%" + search + "%");
            params.add("%" + search + "%");
        }
        // Row-level area scope: an area officer sees rows tied to an incident in their own
        // region/district (plus incident-less / unassigned rows, which surface as i.* IS NULL via the
        // LEFT JOIN); national + non-area roles add nothing and keep the full view. Appended last in
        // the WHERE so its bind param trails the status/search params in '?' order.
        jurisdiction.appendAreaScopeSharedOrOwn("i", where, params);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("distributions", jdbc.queryForList("""
                select d.id, d.distribution_date, d.location_name, d.district_name, d.region_name,
                       d.quantity_distributed, d.unit_of_measure, d.beneficiary_name_or_group,
                       d.beneficiary_contact, d.confirmation_status, d.notes,
                       r.name as resource_name, r.category as resource_category,
                       a.name as agency_name, coalesce(i.title,'—') as incident_title
                from public.relief_distributions d
                left join public.resources r on r.id = d.resource_id
                left join public.agencies a on a.id = d.distributing_agency_id
                left join public.incidents i on i.id = d.incident_id
                where %s order by d.distribution_date desc, d.id desc limit 300
                """.formatted(where), params.toArray()));
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where confirmation_status='Confirmed') as confirmed,
                       count(*) filter (where confirmation_status='Pending Verification') as pending,
                       count(distinct beneficiary_name_or_group) as beneficiary_groups,
                       coalesce(sum(quantity_distributed),0) as total_quantity
                from public.relief_distributions
                """));
        out.put("by_resource", jdbc.queryForList("""
                select coalesce(r.name,'—') as resource_name, count(*) as count,
                       coalesce(sum(d.quantity_distributed),0) as quantity
                from public.relief_distributions d left join public.resources r on r.id = d.resource_id
                group by r.name order by quantity desc limit 12
                """));
        out.put("resources", jdbc.queryForList(
                "select id, name, unit_of_measure from public.resources order by name limit 300"));
        out.put("incidents", jdbc.queryForList(
                "select id, title from public.incidents where coalesce(is_simulation,false)=false order by id desc limit 100"));
        out.put("agencies", jdbc.queryForList("select id, name from public.agencies order by name limit 200"));
        return out;
    }

    @PreAuthorize("hasAuthority('recovery.manage')")
    @PostMapping
    @Transactional
    public Map<String, Object> store(@RequestBody Map<String, Object> b) {
        if (dbl(b.get("quantity_distributed")) <= 0) {
            throw new BusinessRuleException("The quantity distributed must be greater than 0.");
        }
        Long id = jdbc.queryForObject("""
                insert into public.relief_distributions(incident_id, distribution_date, location_name,
                    district_name, region_name, resource_id, quantity_distributed, unit_of_measure,
                    beneficiary_name_or_group, beneficiary_contact, distributing_agency_id,
                    confirmation_status, notes, created_at, updated_at)
                values (?, coalesce(?::date, current_date), ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending Verification', ?, now(), now())
                returning id
                """, Long.class, num(b.get("incident_id")), str(b.get("distribution_date")),
                require(b.get("location_name"), "location_name"), str(b.get("district_name")),
                str(b.get("region_name")), num(b.get("resource_id")), dbl(b.get("quantity_distributed")),
                str(b.get("unit_of_measure")), require(b.get("beneficiary_name_or_group"), "beneficiary"),
                str(b.get("beneficiary_contact")), num(b.get("distributing_agency_id")), str(b.get("notes")));
        return Map.of("success", true, "id", id, "message", "Relief distribution recorded.");
    }

    @PreAuthorize("hasAuthority('recovery.manage')")
    @PostMapping("/{id}/confirm")
    @Transactional
    public Map<String, Object> confirm(@PathVariable long id) {
        if (jdbc.update("update public.relief_distributions set confirmation_status='Confirmed', updated_at=now() where id=?", id) == 0) {
            throw new ResourceNotFoundException("Distribution not found.");
        }
        return Map.of("success", true, "message", "Distribution confirmed.");
    }

    private static String str(Object v) {
        if (v == null) { return null; }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
    private static Long num(Object v) {
        String s = str(v);
        return s == null ? null : Long.parseLong(s);
    }
    private static Double dbl(Object v) {
        String s = str(v);
        return s == null ? 0d : Double.parseDouble(s);
    }
    private static String require(Object v, String f) {
        String s = str(v);
        if (s == null) { throw new BusinessRuleException("The " + f + " field is required."); }
        return s;
    }
}
