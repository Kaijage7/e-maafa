package tz.go.pmo.dmis.response;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.common.security.SecurityUtils;

/**
 * Port of Response\ResponseDashboardController + EOCCDashboardController —
 * the Response overview dashboard and THE single EOCC live board (the
 * source kept two EOCC boards; dashboard-enhanced.blade.php was orphaned,
 * so this merges the routed board with the enhanced board's richer map spec).
 *
 * Each endpoint serves both the initial render and the 30-second poll —
 * the source's realtime endpoints returned narrower payloads the page then
 * ignored; here the poll re-reads the full truth.
 *
 * Verbatim quirks kept from the source:
 * status chart counts ALL incidents ever; EOCC critical count excludes
 * 'Reported'; EOCC works on created_at while the dashboard uses
 * reported_at.
 */
@RestController
@RequestMapping("/v1/response")
public class DashboardController {

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService users;
    private final ActivationService activations;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;

    public DashboardController(JdbcTemplate jdbc, IncidentWorkflowService users, ActivationService activations,
                              JurisdictionScope jurisdiction, AreaGuard areaGuard) {
        this.jdbc = jdbc;
        this.users = users;
        this.activations = activations;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
    }

    /** Build "<extra> and <area predicate>" for an incidents query (alias optional); national tier adds nothing.
     *  Always excludes simulation (drill-clone) incidents — dashboards report the REAL picture only
     *  (same D1 contract as Executive Watch; drills are visible in the Command Post, not in live KPIs).
     *  Area scope is STRICT (audit F35): the same appendAreaScope the incidents registry uses, so the
     *  dashboard never shows an area officer an incident their own registry would hide (shared-or-own
     *  let region-less national incidents through to every region's landing page). */
    private String incidentScope(String alias, String extra, List<Object> params) {
        StringBuilder w = new StringBuilder(extra == null || extra.isBlank() ? "1=1" : extra);
        String col = alias == null || alias.isBlank() ? "is_simulation" : alias + ".is_simulation";
        w.append(" and coalesce(").append(col).append(", false) = false");
        jurisdiction.appendAreaScopeWithCouncil(alias, w, params);
        return w.toString();
    }

    /** True when the caller's jurisdiction adds no area predicate (national tier). */
    private boolean isNationalTier() {
        StringBuilder probe = new StringBuilder("1=1");
        List<Object> p = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("i", probe, p);
        return p.isEmpty() && probe.toString().equals("1=1");
    }

    /** count(*) over incidents with the caller's strict area scope + the no-simulation guard. */
    private Long scopedIncidentCount(String extra) {
        List<Object> p = new ArrayList<>();
        return jdbc.queryForObject("select count(*) from public.incidents where " + incidentScope("", extra, p),
                Long.class, p.toArray());
    }

    /** Correlated guard: the row's incident (if any) is not a simulation drill clone.
     *  Leading space is deliberate — text blocks strip trailing spaces, so "and " + this would fuse. */
    private static String notSimIncident(String incidentIdExpr) {
        return " not exists (select 1 from public.incidents s where s.id = " + incidentIdExpr + " and s.is_simulation)";
    }

    /** Response overview dashboard (stat cards, feeds, type/region rollups, map markers). */
    @PreAuthorize("hasAuthority('incidents.view')")
    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        Map<String, Object> out = new LinkedHashMap<>();
        // REAL picture only: every branch excludes simulation drill clones (and rows hanging off them).
        if (isNationalTier()) {
            // National tier: original whole-country counters, byte-identical to the pre-F35 behavior.
            out.put("statistics", jdbc.queryForMap("""
                    select
                      (select count(*) from public.incidents where status in ('Active Response','Verified','Pending Verification')
                         and is_simulation = false) as active_incidents,
                      (select count(*) from public.incidents where reported_at::date = current_date
                         and is_simulation = false) as total_incidents_today,
                      (select count(*) from public.allocated_resources ar where ar.status = 'Deployed'
                         and """ + notSimIncident("ar.incident_id") + """
                      ) as resources_deployed,
                      (select count(*) from public.incident_tasks t where t.status = 'To Do'
                         and """ + notSimIncident("t.incident_id") + """
                         and not exists (select 1 from public.response_activations sa
                                          where sa.id = t.activation_id and sa.is_simulation)) as pending_tasks,
                      (select count(*) from public.incidents where severity_level = 'Critical' and status <> 'Closed'
                         and is_simulation = false) as critical_incidents,
                      (select count(*) from public.damage_assessments da where da.status = 'Pending Verification'
                         and """ + notSimIncident("da.incident_id") + """
                      ) as assessments_pending
                    """));
        } else {
            // Area tier (audit F35): every counter restricted to the caller's jurisdiction, matching the
            // registry's strict scope. Rows not attributable to an in-scope incident (task/allocation/
            // assessment with no incident linkage) do not count toward an area officer's cards.
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("active_incidents", scopedIncidentCount(
                    "status in ('Active Response','Verified','Pending Verification')"));
            stats.put("total_incidents_today", scopedIncidentCount("reported_at::date = current_date"));
            List<Object> rdP = new ArrayList<>();
            stats.put("resources_deployed", jdbc.queryForObject(
                    "select count(*) from public.allocated_resources ar join public.incidents i on i.id = ar.incident_id "
                    + "where ar.status = 'Deployed' and " + incidentScope("i", null, rdP), Long.class, rdP.toArray()));
            List<Object> ptP = new ArrayList<>();
            stats.put("pending_tasks", jdbc.queryForObject(
                    "select count(*) from public.incident_tasks t join public.incidents i on i.id = coalesce(t.incident_id, "
                    + "  (select sa.incident_id from public.response_activations sa where sa.id = t.activation_id)) "
                    + "where t.status = 'To Do' and not exists (select 1 from public.response_activations sa2 "
                    + "  where sa2.id = t.activation_id and sa2.is_simulation) and "
                    + incidentScope("i", null, ptP), Long.class, ptP.toArray()));
            stats.put("critical_incidents", scopedIncidentCount("severity_level = 'Critical' and status <> 'Closed'"));
            List<Object> apP = new ArrayList<>();
            stats.put("assessments_pending", jdbc.queryForObject(
                    "select count(*) from public.damage_assessments da join public.incidents i on i.id = da.incident_id "
                    + "where da.status = 'Pending Verification' and " + incidentScope("i", null, apP),
                    Long.class, apP.toArray()));
            out.put("statistics", stats);
        }
        List<Object> caP = new ArrayList<>();
        out.put("critical_alerts", jdbc.queryForList(
                "select id, title, location_description from public.incidents where "
                + incidentScope("", "severity_level = 'Critical' and status = 'Active Response'", caP)
                + " order by reported_at desc limit 5", caP.toArray()));
        List<Object> riP = new ArrayList<>();
        out.put("recent_incidents", jdbc.queryForList(
                "select i.id, i.title, i.location_description, i.severity_level, i.status, i.reported_at, "
                + "i.latitude, i.longitude, coalesce(it.name, 'Unknown') as hazard_name "
                + "from public.incidents i left join public.incident_types it on it.id = i.incident_type_id "
                + "where " + incidentScope("i", "i.reported_at >= now() - interval '24 hours'", riP)
                + " order by i.reported_at desc limit 10", riP.toArray()));
        List<Object> ibtP = new ArrayList<>();
        out.put("incidents_by_type", jdbc.queryForList(
                "select coalesce(it.name, 'Unknown') as hazard_name, count(*) as total "
                + "from public.incidents i left join public.incident_types it on it.id = i.incident_type_id "
                + "where " + incidentScope("i", "i.status <> 'Closed'", ibtP) + " group by 1 order by total desc",
                ibtP.toArray()));
        List<Object> rdP = new ArrayList<>();
        out.put("regional_data", jdbc.queryForList(
                "select region_name, count(*) as total from public.incidents where "
                + incidentScope("", "region_name is not null and status <> 'Closed'", rdP)
                + " group by region_name order by total desc", rdP.toArray()));
        List<Object> niP = new ArrayList<>();
        out.put("new_incidents", jdbc.queryForObject(
                "select count(*) from public.incidents where "
                + incidentScope("", "reported_at >= now() - interval '5 minutes'", niP), Long.class, niP.toArray()));
        out.put("my_area", myArea());
        out.put("needs_action", needsActionQueue());
        out.put("submitted_by_me", submittedByMeQueue());
        out.put("timestamp", OffsetDateTime.now().toString());
        return out;
    }

    private List<Map<String, Object>> needsActionQueue() {
        List<String> stages = actionableWorkflowStages();
        if (stages.isEmpty()) {
            return List.of();
        }
        String placeholders = String.join(",", Collections.nCopies(stages.size(), "?"));
        List<Object> params = new ArrayList<>(stages);
        return incidentQueue("i.workflow_status in (" + placeholders + ")", params, "i.reported_at desc", 12);
    }

    private List<Map<String, Object>> submittedByMeQueue() {
        Long userId = users.actingUserId();
        if (userId == null) {
            return List.of();
        }
        List<Object> params = new ArrayList<>();
        params.add(userId);
        return incidentQueue("i.submitted_by_user_id = ?", params, "i.submitted_at desc nulls last, i.reported_at desc", 12);
    }

    private List<Map<String, Object>> incidentQueue(String extra, List<Object> params, String order, int limit) {
        String where = incidentScope("i", extra, params);
        params.add(limit);
        String sql = """
                select i.id, i.title, i.workflow_status, i.severity_level, i.status, i.reported_at,
                       i.submitted_at, i.location_description, i.district_name, i.region_name,
                       coalesce(it.name, 'Unknown') as hazard_name,
                       su.name as submitted_by_name
                from public.incidents i
                left join public.incident_types it on it.id = i.incident_type_id
                left join public.users su on su.id = i.submitted_by_user_id
                where %s
                order by %s
                limit ?
                """.formatted(where, order);
        List<Map<String, Object>> rows = jdbc.queryForList(sql, params.toArray());
        for (Map<String, Object> row : rows) {
            String wf = row.get("workflow_status") == null ? null : String.valueOf(row.get("workflow_status"));
            row.put("workflow_status_label", IncidentOptions.workflowStatusLabel(wf));
        }
        return rows;
    }

    private List<String> actionableWorkflowStages() {
        Set<String> roles = SecurityUtils.currentUserRoles();
        if (roles.contains(Authz.SUPER_ADMIN)) {
            return List.of("waiting_ddmc", "waiting_ded", "waiting_rdmc", "waiting_ras",
                    "waiting_eocc", "waiting_director", "waiting_ps");
        }
        List<String> stages = new ArrayList<>();
        if (roles.contains(Authz.DIST_DC)) {
            stages.add("waiting_ddmc");
        }
        if (roles.contains(Authz.DED)) {
            stages.add("waiting_ded");
        }
        if (roles.contains(Authz.REG_DC)) {
            stages.add("waiting_rdmc");
        }
        if (roles.contains(Authz.RAS)) {
            stages.add("waiting_ras");
        }
        if (roles.contains(Authz.EOCC)) {
            stages.add("waiting_eocc");
        }
        if (roles.contains(Authz.DIRECTOR)) {
            stages.add("waiting_director");
        }
        if (roles.contains(Authz.SECRETARY)) {
            stages.add("waiting_ps");
        }
        return stages;
    }

    /**
     * The caller's jurisdiction (scope + area names) so the live map can FOCUS on their own
     * district/region — a DED opens on their district, an RAS on their region, national sees all.
     */
    private Map<String, Object> myArea() {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        Map<String, Object> area = new LinkedHashMap<>();
        area.put("scope", f.scope());
        if (f.councilId() != null) {
            Map<String, Object> c = jdbc.queryForMap(
                    "select c.name as council_name, d.name as district_name, r.name as region_name "
                    + "from public.councils c "
                    + "join public.districts d on d.id = c.district_id "
                    + "join public.regions r on r.id = c.region_id where c.id = ?", f.councilId());
            area.putAll(c);
        } else if (f.districtId() != null) {
            Map<String, Object> d = jdbc.queryForMap(
                    "select d.name as district_name, r.name as region_name from public.districts d "
                    + "join public.regions r on r.id = d.region_id where d.id = ?", f.districtId());
            area.putAll(d);
        } else if (f.regionId() != null) {
            area.put("region_name", jdbc.queryForObject(
                    "select name from public.regions where id = ?", String.class, f.regionId()));
        }
        return area;
    }

    /** The merged EOCC live board payload (also the 30-second poll). */
    @PreAuthorize("hasAuthority('command_post.view')")
    @GetMapping("/eocc")
    public Map<String, Object> eocc() {
        Map<String, Object> out = new LinkedHashMap<>();
        // REAL picture only (drills excluded; they surface via simulations_running below).
        if (isNationalTier()) {
            // EOCC national watch floor: whole-country counters, byte-identical to pre-F35 behavior.
            out.put("statistics", jdbc.queryForMap("""
                    select
                      (select count(*) from public.incidents where status in ('Active Response','Verified','Reported')
                         and is_simulation = false) as active_incidents,
                      (select count(*) from public.incidents where severity_level = 'Critical'
                         and status in ('Active Response','Verified') and is_simulation = false) as critical_count,
                      (select count(*) from public.incidents where created_at::date = current_date
                         and is_simulation = false) as new_today,
                      (select count(*) from public.incident_tasks t where t.status = 'In Progress'
                         and """ + notSimIncident("t.incident_id") + """
                         and not exists (select 1 from public.response_activations sa
                                          where sa.id = t.activation_id and sa.is_simulation)) as personnel_deployed,
                      (select coalesce(sum(quantity),0) from public.inventory_items
                        where status = 'Good Condition'
                          and (warehouse_id is not null or temporary_warehouse_id is not null)) as resources_available,
                      (select count(*) from public.response_activations where status = 'active'
                         and is_simulation = true) as simulations_running
                    """));
        } else {
            // Area tier (audit F35): a region/district officer holding command_post.view gets THEIR live
            // picture, not the national one. Warehouse availability stays national (warehouses are a
            // deliberately shared national resource pool); drills-running stays global (a drill count is
            // not sensitive and the drill board itself enforces its own access).
            Map<String, Object> stats = new LinkedHashMap<>();
            stats.put("active_incidents", scopedIncidentCount(
                    "status in ('Active Response','Verified','Reported')"));
            stats.put("critical_count", scopedIncidentCount(
                    "severity_level = 'Critical' and status in ('Active Response','Verified')"));
            stats.put("new_today", scopedIncidentCount("created_at::date = current_date"));
            List<Object> pdP = new ArrayList<>();
            stats.put("personnel_deployed", jdbc.queryForObject(
                    "select count(*) from public.incident_tasks t join public.incidents i on i.id = coalesce(t.incident_id, "
                    + "  (select sa.incident_id from public.response_activations sa where sa.id = t.activation_id)) "
                    + "where t.status = 'In Progress' and not exists (select 1 from public.response_activations sa2 "
                    + "  where sa2.id = t.activation_id and sa2.is_simulation) and "
                    + incidentScope("i", null, pdP), Long.class, pdP.toArray()));
            stats.put("resources_available", jdbc.queryForObject(
                    "select coalesce(sum(quantity),0) from public.inventory_items where status = 'Good Condition'"
                            + " and (warehouse_id is not null or temporary_warehouse_id is not null)",
                    Long.class));
            stats.put("simulations_running", jdbc.queryForObject(
                    "select count(*) from public.response_activations where status = 'active' and is_simulation = true",
                    Long.class));
            out.put("statistics", stats);
        }
        List<Object> sevP = new ArrayList<>();
        out.put("incidents_by_severity", jdbc.queryForList(
                "select severity_level, count(*) as count from public.incidents where "
                + incidentScope("", "status in ('Active Response','Verified','Reported')", sevP)
                + " group by severity_level", sevP.toArray()));
        List<Object> stsP = new ArrayList<>();
        out.put("incidents_by_status", jdbc.queryForList(
                "select status, count(*) as count from public.incidents where " + incidentScope("", null, stsP)
                + " group by status order by count desc", stsP.toArray()));
        List<Object> erP = new ArrayList<>();
        out.put("recent_incidents", jdbc.queryForList(
                "select id, title, location_description, severity_level, status, created_at, latitude, longitude "
                + "from public.incidents where " + incidentScope("", "created_at >= now() - interval '24 hours'", erP)
                + " order by created_at desc limit 5", erP.toArray()));
        // Map layer: every open incident with coordinates, coloured by severity on the client
        List<Object> miP = new ArrayList<>();
        out.put("map_incidents", jdbc.queryForList(
                "select id, title, severity_level, status, latitude, longitude from public.incidents where "
                + incidentScope("", "status <> 'Closed' and latitude is not null and longitude is not null", miP)
                + " limit 300", miP.toArray()));
        // Comms counters: area users see alerts for THEIR incidents plus incident-less general broadcasts.
        List<Object> asP = new ArrayList<>();
        StringBuilder asW = new StringBuilder("1=1");
        jurisdiction.appendAreaScopeWithCouncil("i", asW, asP);
        String alertAreaClause = asW.toString().equals("1=1") ? ""
                : " and (a.incident_id is null or exists (select 1 from public.incidents i "
                  + "where i.id = a.incident_id and " + asW + "))";
        // jsonb_exists() instead of the `?` operator: this query is parameterized for area users, and
        // PgJDBC would read a bare `?` operator as a bind placeholder (parameter-count mismatch).
        out.put("alert_stats", jdbc.queryForMap("""
                select
                  count(*) filter (where jsonb_exists(channels::jsonb, 'sms')) as sms_sent,
                  count(*) filter (where jsonb_exists(channels::jsonb, 'email')) as email_sent,
                  count(*) filter (where jsonb_exists(channels::jsonb, 'app')) as app_notifications
                from public.alerts a where a.created_at::date = current_date
                  and """ + notSimIncident("a.incident_id") + """
                """ + alertAreaClause, asP.toArray()));
        // The activation the board headlines must be a REAL response — never a drill — and, for an
        // area officer, one from THEIR jurisdiction (audit F35), not another region's operation.
        List<Object> aaP = new ArrayList<>();
        out.put("active_activation", firstOrNull(jdbc.queryForList(
                "select ra.*, i.title as incident_title, u.name as activated_by_name "
                + "from public.response_activations ra "
                + "join public.incidents i on i.id = ra.incident_id "
                + "left join public.users u on u.id = ra.activated_by "
                + "where ra.status = 'active' and ra.is_simulation = false and "
                + incidentScope("i", null, aaP)
                + " order by ra.activated_at desc limit 1", aaP.toArray())));
        out.put("my_area", myArea());
        out.put("timestamp", OffsetDateTime.now().toString());
        return out;
    }

    /**
     * EOCC Quick Action "Activate Emergency Protocol" — a dead button in the
     * source, wired here to open a response activation for an incident
     * (the one the Command Center coordinates around).
     */
    @PreAuthorize("hasAuthority('command_post.activate')")
    @PostMapping("/eocc/activate")
    @Transactional
    public Map<String, Object> activate(@RequestBody Map<String, Object> body) {
        if (body.get("incident_id") == null) {
            throw new BusinessRuleException("The incident_id field is required.");
        }
        long incidentId = (long) Double.parseDouble(String.valueOf(body.get("incident_id")));
        // Only open a command post for an incident in the caller's own area (national sees all).
        areaGuard.assertOwn("public.incidents", incidentId);
        // Same machinery as the Command Center: activation row + the 95 DRF lane tasks
        Map<String, Object> result = activations.activate(incidentId, false,
                body.get("notes") == null ? null : String.valueOf(body.get("notes")));
        return Map.of("success", true, "id", result.get("activation_id"),
                "message", "Emergency protocol activated. The Command Center is now coordinating this incident.");
    }

    private static Map<String, Object> firstOrNull(List<Map<String, Object>> rows) {
        return rows.isEmpty() ? null : rows.get(0);
    }
}
