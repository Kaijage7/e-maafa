package tz.go.pmo.dmis.response;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

    /** Build "<extra> and <area predicate>" for an incidents query (alias optional); national tier adds nothing. */
    private String incidentScope(String alias, String extra, List<Object> params) {
        StringBuilder w = new StringBuilder(extra == null || extra.isBlank() ? "1=1" : extra);
        jurisdiction.appendAreaScopeSharedOrOwn(alias, w, params);
        return w.toString();
    }

    /** Response overview dashboard (stat cards, feeds, type/region rollups, map markers). */
    @PreAuthorize("hasAuthority('incidents.view')")
    @GetMapping("/dashboard")
    public Map<String, Object> dashboard() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("statistics", jdbc.queryForMap("""
                select
                  (select count(*) from public.incidents where status in ('Active Response','Verified','Pending Verification')) as active_incidents,
                  (select count(*) from public.incidents where reported_at::date = current_date) as total_incidents_today,
                  (select count(*) from public.allocated_resources where status = 'Deployed') as resources_deployed,
                  (select count(*) from public.incident_tasks where status = 'To Do') as pending_tasks,
                  (select count(*) from public.incidents where severity_level = 'Critical' and status <> 'Closed') as critical_incidents,
                  (select count(*) from public.damage_assessments where status = 'Pending Verification') as assessments_pending
                """));
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
        out.put("new_incidents", jdbc.queryForObject(
                "select count(*) from public.incidents where reported_at >= now() - interval '5 minutes'", Long.class));
        out.put("timestamp", OffsetDateTime.now().toString());
        return out;
    }

    /** The merged EOCC live board payload (also the 30-second poll). */
    @PreAuthorize("hasAuthority('command_post.view')")
    @GetMapping("/eocc")
    public Map<String, Object> eocc() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("statistics", jdbc.queryForMap("""
                select
                  (select count(*) from public.incidents where status in ('Active Response','Verified','Reported')) as active_incidents,
                  (select count(*) from public.incidents where severity_level = 'Critical'
                     and status in ('Active Response','Verified')) as critical_count,
                  (select count(*) from public.incidents where created_at::date = current_date) as new_today,
                  (select count(*) from public.incident_tasks where status = 'In Progress') as personnel_deployed,
                  (select coalesce(sum(quantity),0) from public.inventory_items where status = 'Good Condition') as resources_available
                """));
        out.put("incidents_by_severity", jdbc.queryForList("""
                select severity_level, count(*) as count from public.incidents
                where status in ('Active Response','Verified','Reported')
                group by severity_level
                """));
        out.put("incidents_by_status", jdbc.queryForList(
                "select status, count(*) as count from public.incidents group by status order by count desc"));
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
        out.put("alert_stats", jdbc.queryForMap("""
                select
                  count(*) filter (where channels::jsonb ? 'sms') as sms_sent,
                  count(*) filter (where channels::jsonb ? 'email') as email_sent,
                  count(*) filter (where channels::jsonb ? 'app') as app_notifications
                from public.alerts where created_at::date = current_date
                """));
        out.put("active_activation", firstOrNull(jdbc.queryForList("""
                select ra.*, i.title as incident_title, u.name as activated_by_name
                from public.response_activations ra
                join public.incidents i on i.id = ra.incident_id
                left join public.users u on u.id = ra.activated_by
                where ra.status = 'active' order by ra.activated_at desc limit 1
                """)));
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
