package tz.go.pmo.dmis.response;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Port of Response\CoordinationController — the Command Center: disaster
 * response activations coordinated as 15 NDPRP DRF lanes over incident_tasks,
 * with the 72-hour critical strip, challenges feed and a full activity
 * timeline. Live mode runs the real incident; Simulation mode (user
 * requirement, V29) runs a flagged drill clone through identical machinery.
 *
 * Task statuses use the unified vocabulary: To Do / In Progress /
 * On Hold / Completed / Cancelled — the source's coordination screens wrote
 * 'Pending' into the same column Task Management read as 'To Do'.
 */
@RestController
@RequestMapping("/v1/response/coordination")
public class CommandCenterController {

    private static final List<String> TASK_STATUSES = List.of("To Do", "In Progress", "On Hold", "Completed", "Cancelled");
    private static final List<String> PRIORITIES = List.of("Low", "Medium", "High", "Critical");
    /** ICS command & General Staff roles (NIMS/ICS doctrine, V140) — matches the DB CHECK exactly. */
    private static final List<String> COMMAND_ROLES = List.of(
            "IC", "Deputy IC", "Operations", "Planning", "Logistics", "Finance/Admin", "PIO", "Safety", "Liaison");
    /**
     * The 15 NDPRP DRF lanes grouped under their ICS General-Staff section chief for the
     * org-chart hierarchy. Static doctrine mapping (by DRF number):
     *   Operations — the ground-response functions: 4 Shelter & NFIs, 5 Security & Public Order,
     *                6 Health & Medical, 7 Search & Rescue, 8 Food Security & Nutrition, 11 WASH,
     *                12 Protection, 13 Education in Emergencies.
     *   Planning   — information/assessment/recovery-planning functions: 1 Coordination (drives the
     *                planning cycle and coordination meetings), 2 Information Management, 10 Damage &
     *                Needs Assessment, 14 Environment (technical specialists), 15 Early Recovery.
     *   Logistics  — 3 Logistics & Supply Chain, 9 Communications (the ICS Communications Unit sits
     *                in the Logistics Section's Service Branch).
     * Finance/Admin has no DRF lanes — it administers cost/compensation, not field functions.
     */
    private static final Map<String, List<Integer>> DRF_SECTIONS;
    static {
        DRF_SECTIONS = new LinkedHashMap<>();
        DRF_SECTIONS.put("Operations", List.of(4, 5, 6, 7, 8, 11, 12, 13));
        DRF_SECTIONS.put("Planning", List.of(1, 2, 10, 14, 15));
        DRF_SECTIONS.put("Logistics", List.of(3, 9));
    }
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON =
            new com.fasterxml.jackson.databind.ObjectMapper();

    private final JdbcTemplate jdbc;
    private final ActivationService activations;
    private final IncidentWorkflowService users;
    private final AnticipatoryPlanController plans;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;

    public CommandCenterController(JdbcTemplate jdbc, ActivationService activations,
                                   IncidentWorkflowService users, AnticipatoryPlanController plans,
                                   JurisdictionScope jurisdiction, AreaGuard areaGuard) {
        this.jdbc = jdbc;
        this.activations = activations;
        this.users = users;
        this.plans = plans;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
    }

    // ─── Activations index ───

    @GetMapping
    public Map<String, Object> index() {
        Map<String, Object> out = new LinkedHashMap<>();
        // LEFT JOIN incidents throughout — anticipatory (forecast) activations have no incident
        // until impact, but must still appear in the index; fall back to the hazard description.
        // Area officers see only activations whose incident is in their own district/region (or shared);
        // forecast activations with no incident yet carry NULL i.region_id, so they stay visible to all.
        // National + non-area roles keep the full view.
        StringBuilder activeSql = new StringBuilder("""
                select ra.*, coalesce(i.title, ra.hazard_description) as incident_title,
                       i.severity_level, i.region_name, u.name as activated_by_name,
                       (select count(*) from public.incident_tasks t where t.activation_id = ra.id) as total_tasks,
                       (select count(*) from public.incident_tasks t where t.activation_id = ra.id and t.status = 'Completed') as completed_tasks
                from public.response_activations ra
                left join public.incidents i on i.id = ra.incident_id
                left join public.users u on u.id = ra.activated_by
                where ra.status = 'active'""");
        List<Object> activeParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("i", activeSql, activeParams);
        activeSql.append(" order by ra.activated_at desc");
        out.put("active", jdbc.queryForList(activeSql.toString(), activeParams.toArray())
                .stream().map(CommandCenterController::cleanActivationJson).toList());
        StringBuilder completedSql = new StringBuilder("""
                select ra.*, coalesce(i.title, ra.hazard_description) as incident_title, u.name as activated_by_name
                from public.response_activations ra
                left join public.incidents i on i.id = ra.incident_id
                left join public.users u on u.id = ra.activated_by
                where ra.status in ('completed','deactivated')""");
        List<Object> completedParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("i", completedSql, completedParams);
        completedSql.append(" order by ra.deactivated_at desc nulls last limit 10");
        out.put("completed", jdbc.queryForList(completedSql.toString(), completedParams.toArray())
                .stream().map(CommandCenterController::cleanActivationJson).toList());
        // Approved incidents that have no activation yet (the source's awaiting list)
        StringBuilder awaitingSql = new StringBuilder("""
                select i.id, i.title, i.severity_level, i.region_name, i.workflow_status
                from public.incidents i
                where i.workflow_status = 'approved' and i.is_simulation = false
                  and not exists (select 1 from public.response_activations ra
                                  where ra.incident_id = i.id and ra.status = 'active')""");
        List<Object> awaitingParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("i", awaitingSql, awaitingParams);
        awaitingSql.append(" order by i.reported_at desc limit 50");
        out.put("awaiting", jdbc.queryForList(awaitingSql.toString(), awaitingParams.toArray()));
        out.put("posture_doctrine", jdbc.queryForList(
                "select * from public.posture_doctrine order by sort_order"));
        return out;
    }

    /** Open an activation — mode 'live' or 'simulation' (drill clone, V29). */
    @PreAuthorize("hasAuthority('command_post.activate')")
    @PostMapping("/activate/{incidentId}")
    @Transactional
    public Map<String, Object> activate(@PathVariable long incidentId,
                                        @RequestBody(required = false) Map<String, Object> body) {
        // Only open a command post for an incident in the caller's own area (national sees all).
        areaGuard.assertOwn("public.incidents", incidentId);
        boolean simulation = body != null && "simulation".equals(body.get("mode"));
        // Only for simulations: table-top drill (default, real side-effects blocked) vs full-scale exercise.
        boolean allowRealOps = simulation && body != null && Boolean.parseBoolean(String.valueOf(body.get("allow_real_ops")));
        String notes = body == null || body.get("notes") == null ? null : String.valueOf(body.get("notes"));
        Map<String, Object> result = activations.activate(incidentId, simulation, allowRealOps, notes);
        return Map.of("success", true, "activation_id", result.get("activation_id"),
                "message", (simulation
                        ? (allowRealOps ? "FULL-SCALE exercise activated (real operations permitted). "
                                        : "Table-top simulation drill activated. ")
                        : "Disaster response activated. ")
                        + "72-hour clock has started — " + result.get("tasks_created") + " DRF tasks created.");
    }

    // ─── Forecast lifecycle (NDPRP 2022 anticipatory activation, V30) ───

    /**
     * Anticipatory activation FROM A FORECAST, before any incident exists —
     * the cyclone-coming scenario: DMD opens the post at posture 'monitoring',
     * preparedness plans activate for the forecast-impact areas, and every DRF
     * lane goes visibly ON CALL.
     */
    @PreAuthorize("hasAuthority('command_post.activate')")
    @PostMapping("/forecast")
    @Transactional
    public Map<String, Object> activateFromForecast(@RequestBody Map<String, Object> body) throws Exception {
        String hazard = require(body.get("hazard_description"), "hazard_description");
        if (!(body.get("affected_areas") instanceof List<?> areas) || areas.isEmpty()) {
            throw new BusinessRuleException("At least one forecast-impact area is required.");
        }
        boolean simulation = "simulation".equals(body.get("mode"));
        boolean allowRealOps = simulation && Boolean.parseBoolean(String.valueOf(body.get("allow_real_ops")));
        Long userId = users.actingUserId();
        Long activationId = jdbc.queryForObject("""
                insert into public.response_activations(incident_id, activated_by, activated_at, status,
                    posture, trigger_type, hazard_description, affected_areas, expected_impact_at,
                    forecast_track, is_simulation, allow_real_ops, notes, created_at, updated_at)
                values (null, ?, now(), 'active', 'monitoring', 'forecast', ?, ?::json, ?::timestamptz,
                        ?::json, ?, ?, ?, now(), now()) returning id
                """, Long.class, userId, hazard,
                JSON.writeValueAsString(body.get("affected_areas")), str(body.get("expected_impact_at")),
                body.get("forecast_track") == null ? null : JSON.writeValueAsString(body.get("forecast_track")),
                simulation, allowRealOps, str(body.get("notes")));
        // Every DRF goes on call: seed the NDPRP default tasks as lanes (no incident yet)
        int tasks = jdbc.update("""
                insert into public.incident_tasks(incident_id, activation_id, drf_id, title, description,
                    priority, status, progress_percent, is_72hr_critical, sort_order, created_by_user_id,
                    created_at, updated_at)
                select null, ?, t.drf_id, t.title, t.description, t.default_priority, 'To Do', 0,
                       t.is_72hr_critical, t.sort_order, ?, now(), now()
                from public.drf_default_tasks t
                """, activationId, userId);
        activations.log(activationId, userId, "forecast_activated",
                (simulation ? "[SIMULATION] " : "") + "Anticipatory activation — " + hazard
                        + ". Areas: " + body.get("affected_areas") + ". All 15 DRFs on call ("
                        + tasks + " preparedness tasks).", null);
        return Map.of("success", true, "activation_id", activationId,
                "message", "Anticipatory activation opened at MONITORING posture. All DRFs are on call.");
    }

    /**
     * Walk the posture ladder (monitoring → emergency → disaster), per the
     * NDPRP escalation triggers. De-escalation is allowed (storm weakening).
     */
    @PreAuthorize("hasAuthority('command_post.posture')")
    @PostMapping("/{id}/posture")
    @Transactional
    public Map<String, Object> changePosture(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> activation = findOr404(id);
        assertMayManageForecast(activation);
        String posture = require(body.get("posture"), "posture");
        // 'safeguard' (Blue) is the de-escalation posture: storm passing, residual flood/landslide
        // risk remains — doctrine forbids jumping Red->stood-down without it.
        if (!List.of("monitoring", "emergency", "disaster", "safeguard").contains(posture)) {
            throw new BusinessRuleException("Posture must be monitoring, emergency, disaster or safeguard.");
        }
        if (posture.equals(activation.get("posture"))) {
            throw new BusinessRuleException("The activation is already at " + posture + " posture.");
        }
        jdbc.update("update public.response_activations set posture = ?, updated_at = now() where id = ?", posture, id);
        activations.log(id, users.actingUserId(), "posture_changed",
                "Posture: " + activation.get("posture") + " → " + posture.toUpperCase()
                        + (str(body.get("notes")) == null ? "" : ". " + str(body.get("notes"))), null);
        return Map.of("success", true, "message", "Posture moved to " + posture.toUpperCase() + ".");
    }

    /** The forecast died or missed — stand the post down, journalling the reason. */
    @PreAuthorize("hasAuthority('command_post.posture')")
    @PostMapping("/{id}/cancel-forecast")
    @Transactional
    public Map<String, Object> cancelForecast(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> activation = findOr404(id);
        assertMayManageForecast(activation);
        if (!"forecast".equals(activation.get("trigger_type"))) {
            throw new BusinessRuleException("Only forecast-triggered activations can be cancelled this way.");
        }
        String reason = require(body.get("reason"), "reason");
        jdbc.update("""
                update public.response_activations set status = 'deactivated', deactivated_at = now(),
                    notes = ?, updated_at = now() where id = ?
                """, reason, id);
        activations.log(id, users.actingUserId(), "forecast_cancelled",
                "Forecast cancelled — " + reason + ". All DRFs stood down.", null);
        return Map.of("success", true, "message", "Forecast cancelled. The post has been stood down.");
    }

    /**
     * Impact confirmed (landfall / outbreak confirmed / quake struck): the
     * forecast activation becomes a disaster response — an incident is created
     * from the forecast details and linked, posture jumps to 'disaster'.
     */
    @PreAuthorize("hasAuthority('command_post.posture')")
    @PostMapping("/{id}/impact")
    @Transactional
    public Map<String, Object> confirmImpact(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> activation = findOr404(id);
        assertMayManageForecast(activation);
        if (activation.get("incident_id") != null) {
            throw new BusinessRuleException("This activation is already linked to an incident.");
        }
        boolean simulation = Boolean.TRUE.equals(activation.get("is_simulation"));
        // affected_areas is a json array column; format it as a readable location, not raw JSON.
        String location = formatAreas(activation.get("affected_areas"));
        Long incidentId = jdbc.queryForObject("""
                insert into public.incidents(title, description, severity_level, status, workflow_status,
                    location_description, reported_at, is_simulation, created_at, updated_at)
                values (?, ?, 'Critical', 'Active Response', 'approved', ?, now(), ?, now(), now())
                returning id
                """, Long.class,
                (simulation ? "[SIMULATION] " : "") + "Impact: " + activation.get("hazard_description"),
                "Created on impact confirmation from anticipatory activation #" + id
                        + (body == null || body.get("details") == null ? "" : ". " + body.get("details")),
                location, simulation);
        jdbc.update("""
                update public.response_activations set incident_id = ?, posture = 'disaster', updated_at = now()
                where id = ?
                """, incidentId, id);
        jdbc.update("update public.incident_tasks set incident_id = ? where activation_id = ?", incidentId, id);
        activations.log(id, users.actingUserId(), "impact_confirmed",
                "IMPACT CONFIRMED — posture DISASTER. Incident #" + incidentId
                        + " created and linked; response phase begins.", null);
        return Map.of("success", true, "incident_id", incidentId,
                "message", "Impact confirmed. Posture is DISASTER and incident #" + incidentId + " is linked.");
    }

    /** Readiness picture for the affected areas: evacuation centres, stockpiles, agencies on call. */
    @GetMapping("/{id}/readiness")
    public Map<String, Object> readiness(@PathVariable long id) throws Exception {
        Map<String, Object> activation = findOr404(id);
        List<String> areas = new ArrayList<>();
        if (activation.get("affected_areas") != null) {
            for (Object area : JSON.readValue(String.valueOf(activation.get("affected_areas")), List.class)) {
                areas.add(String.valueOf(area));
            }
        }
        // Incident-triggered activations have no forecast areas — scope readiness down the administrative
        // protocol (region -> district -> council) to the incident's region AND district, so the situation
        // map's evac centres / stockpiles are precise to where the disaster is, not the whole region.
        String incidentDistrict = null;
        if (areas.isEmpty() && activation.get("incident_id") != null) {
            List<Map<String, Object>> loc = jdbc.queryForList(
                    "select region_name, district_name from public.incidents where id = ?", activation.get("incident_id"));
            if (!loc.isEmpty()) {
                Object r = loc.get(0).get("region_name");
                if (r != null && !String.valueOf(r).isBlank()) { areas.add(String.valueOf(r)); }
                Object d = loc.get(0).get("district_name");
                if (d != null && !String.valueOf(d).isBlank()) { incidentDistrict = String.valueOf(d); areas.add(incidentDistrict); }
            }
        }
        String[] like = areas.stream().map(a -> "%" + a + "%").toArray(String[]::new);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("areas", areas);
        out.put("scope_district", incidentDistrict);
        // Evac centres in the same DISTRICT surface first (region protocol), then the rest of the region.
        out.put("evacuation_centers", jdbc.queryForList("""
                select centre_name, centre_type, region, district, council, capacity_people, status, latitude, longitude
                from public.evacuation_centers
                where ? = 0 or region ilike any (?) or district ilike any (?)
                order by (case when district ilike any (?) then 0 else 1 end), region, district, centre_name
                limit 50
                """, areas.size(), like, like, like));
        out.put("warehouses", jdbc.queryForList("""
                select w.name, coalesce(w.city_or_region, w.location_address) as location, w.operational_status,
                       coalesce(sum(ii.quantity), 0) as stock_units
                from public.warehouses w
                left join public.inventory_items ii on ii.warehouse_id = w.id
                where ? = 0 or coalesce(w.city_or_region, w.location_address, w.zone, '') ilike any (?)
                group by w.id order by stock_units desc limit 20
                """, areas.size(), like));
        out.put("early_warnings", jdbc.queryForList("""
                select warning_code, hazard_type, severity_level, affected_regions, people_at_risk, status
                from public.early_warnings where status not in ('expired','cancelled')
                order by created_at desc limit 10
                """));
        out.put("stakeholders_on_call", jdbc.queryForList("""
                select distinct s.id, s.name, s.organization from public.incident_tasks t
                join public.stakeholders s on s.id = t.stakeholder_id
                where t.activation_id = ?
                """, id));
        // The preparedness plans the Act requires be activated for the forecast-impact areas
        // (matched on hazard + area) — the per-area checklist of activities and responsible actors.
        out.put("anticipatory_plans",
                plans.matchingPlans(String.valueOf(activation.get("hazard_description")), areas));
        return out;
    }

    // ─── Command board ───

    @GetMapping("/{id}")
    public Map<String, Object> board(@PathVariable long id) {
        Map<String, Object> activation = findOr404(id);
        Map<String, Object> out = new LinkedHashMap<>();
        // LEFT JOIN incidents: an anticipatory (forecast-triggered) activation has no
        // incident until impact is confirmed, so it must still render its board. Fall back
        // to the forecast hazard description for the title.
        out.put("activation", cleanActivationJson(jdbc.queryForMap("""
                select ra.*, coalesce(i.title, ra.hazard_description) as incident_title,
                       i.severity_level, i.region_name, i.location_description, i.latitude, i.longitude,
                       i.status as incident_status, u.name as activated_by_name
                from public.response_activations ra
                left join public.incidents i on i.id = ra.incident_id
                left join public.users u on u.id = ra.activated_by
                where ra.id = ?
                """, id)));
        // One row per DRF lane with its live stats (source's drfStats loop, one query)
        out.put("drfs", jdbc.queryForList("""
                select f.id, f.number, f.name, f.lead_agency_name, f.icon, f.color,
                       count(t.id) as total,
                       count(t.id) filter (where t.status = 'Completed') as completed,
                       count(t.id) filter (where t.status = 'In Progress') as in_progress,
                       coalesce(round(avg(t.progress_percent)), 0) as progress,
                       max(s.organization) as stakeholder_organization
                from public.disaster_response_functions f
                left join public.incident_tasks t on t.drf_id = f.id and t.activation_id = ?
                left join public.stakeholders s on s.id = t.stakeholder_id
                group by f.id order by f.number
                """, id));
        out.put("critical_tasks", jdbc.queryForList("""
                select t.*, f.number as drf_number, f.name as drf_name, s.organization as stakeholder_organization
                from public.incident_tasks t
                join public.disaster_response_functions f on f.id = t.drf_id
                left join public.stakeholders s on s.id = t.stakeholder_id
                where t.activation_id = ? and t.is_72hr_critical = true
                order by t.sort_order
                """, id));
        out.put("challenges", jdbc.queryForList("""
                select t.id, t.title, t.challenge, t.updated_at, f.number as drf_number,
                       s.organization as stakeholder_organization
                from public.incident_tasks t
                join public.disaster_response_functions f on f.id = t.drf_id
                left join public.stakeholders s on s.id = t.stakeholder_id
                where t.activation_id = ? and coalesce(t.challenge, '') <> ''
                order by t.updated_at desc limit 10
                """, id));
        out.put("recent_activity", activityQuery(id, null, null, 10));
        out.put("summary", jdbc.queryForMap("""
                select count(*) as total_tasks,
                       count(*) filter (where status = 'Completed') as completed_tasks,
                       coalesce(round(avg(progress_percent)), 0) as overall_progress,
                       count(distinct stakeholder_id) filter (where stakeholder_id is not null) as assigned_stakeholders
                from public.incident_tasks where activation_id = ?
                """, id));
        out.put("stakeholders", jdbc.queryForList(
                "select id, name, organization from public.stakeholders where coalesce(is_active, true) order by organization nulls last, name"));
        // ICS org chart (F05, V140): one entry per standard command role — the active holder
        // or a vacant flag — plus the static DRF-lane → section-chief grouping for the hierarchy.
        out.put("command_roles", commandRolesBlock(id));
        out.put("drf_sections", DRF_SECTIONS);
        out.put("task_statuses", TASK_STATUSES);
        out.put("priorities", PRIORITIES);
        // Doctrine reference: posture -> TEPRP level / alert colour / authoriser (V41 seed)
        out.put("posture_doctrine", jdbc.queryForList(
                "select * from public.posture_doctrine order by sort_order"));
        // Scenario injects: fire any that came due since the last look (evaluated on read — no scheduler
        // needed; the board polls), then hand the full list to the exercise panel.
        int fired = jdbc.update("update public.activation_injects set status='fired', fired_at=now(), updated_at=now() "
                + "where activation_id = ? and status = 'pending' and due_at is not null and due_at <= now()", id);
        if (fired > 0) {
            activations.log(id, users.actingUserId(), "inject_fired",
                    fired + " scheduled scenario inject(s) fired.", null);
        }
        out.put("injects", jdbc.queryForList(
                "select * from public.activation_injects where activation_id = ? "
                + "order by coalesce(due_at, created_at), id", id));
        // After-action review once the activation is closed (drill or live — both are worth reviewing).
        if (!"active".equals(String.valueOf(activation.get("status")))) {
            out.put("aar", buildAar(id));
        }
        return out;
    }

    // ─── Scenario injects (exercise director tools) ───

    /** Script an inject into the exercise: fires at due_at, or manually via /fire. */
    @PostMapping("/{id}/injects")
    @Transactional
    @PreAuthorize("hasAuthority('command_post.posture')")
    public Map<String, Object> addInject(@PathVariable long id, @RequestBody Map<String, Object> body) {
        findOr404(id);
        String title = require(body.get("title"), "title");
        String type = body.get("inject_type") == null ? "event" : String.valueOf(body.get("inject_type"));
        if (!List.of("event", "decision", "message").contains(type)) {
            throw new BusinessRuleException("inject_type must be event, decision or message.");
        }
        Long injectId = jdbc.queryForObject("""
                insert into public.activation_injects(activation_id, title, detail, inject_type, due_at, created_by)
                values (?,?,?,?, ?::timestamp, ?) returning id
                """, Long.class, id, title, str(body.get("detail")), type,
                str(body.get("due_at")), users.actingUserId());
        activations.log(id, users.actingUserId(), "inject_scripted",
                "Inject scripted: " + title + (body.get("due_at") != null ? " (due " + body.get("due_at") + ")" : " (manual fire)"), null);
        return Map.of("success", true, "inject_id", injectId);
    }

    /** Fire an inject NOW (exercise director pushes the event onto the board). */
    @PostMapping("/{id}/injects/{injectId}/fire")
    @Transactional
    @PreAuthorize("hasAuthority('command_post.posture')")
    public Map<String, Object> fireInject(@PathVariable long id, @PathVariable long injectId) {
        findOr404(id);
        int n = jdbc.update("update public.activation_injects set status='fired', fired_at=now(), updated_at=now() "
                + "where id = ? and activation_id = ? and status = 'pending'", injectId, id);
        if (n == 0) {
            throw new BusinessRuleException("Inject not found or already fired.");
        }
        Map<String, Object> in = jdbc.queryForMap("select title from public.activation_injects where id = ?", injectId);
        activations.log(id, users.actingUserId(), "inject_fired", "INJECT: " + in.get("title"), null);
        return Map.of("success", true, "status", "fired");
    }

    /** Commander resolves a fired inject with the decision/response taken (feeds the AAR). */
    @PostMapping("/{id}/injects/{injectId}/resolve")
    @Transactional
    @PreAuthorize("hasAuthority('tasks.manage')")
    public Map<String, Object> resolveInject(@PathVariable long id, @PathVariable long injectId,
                                             @RequestBody(required = false) Map<String, Object> body) {
        findOr404(id);
        String resolution = body == null ? null : str(body.get("resolution"));
        int n = jdbc.update("update public.activation_injects set status='resolved', resolved_at=now(), "
                + "resolution=?, updated_at=now() where id = ? and activation_id = ? and status = 'fired'",
                resolution, injectId, id);
        if (n == 0) {
            throw new BusinessRuleException("Inject not found or not in a fired state.");
        }
        Map<String, Object> in = jdbc.queryForMap("select title from public.activation_injects where id = ?", injectId);
        activations.log(id, users.actingUserId(), "inject_resolved",
                "Inject resolved: " + in.get("title") + (resolution == null || resolution.isBlank() ? "" : " — " + resolution), null);
        return Map.of("success", true, "status", "resolved");
    }

    /** Remove a pending inject (mis-scripted). */
    @DeleteMapping("/{id}/injects/{injectId}")
    @Transactional
    @PreAuthorize("hasAuthority('command_post.posture')")
    public Map<String, Object> deleteInject(@PathVariable long id, @PathVariable long injectId) {
        findOr404(id);
        int n = jdbc.update("delete from public.activation_injects where id = ? and activation_id = ? and status = 'pending'",
                injectId, id);
        if (n == 0) {
            throw new BusinessRuleException("Only pending injects can be removed.");
        }
        return Map.of("success", true);
    }

    /** After-action review — also available mid-exercise as a live scorecard. */
    @GetMapping("/{id}/aar")
    public Map<String, Object> aar(@PathVariable long id) {
        findOr404(id);
        return buildAar(id);
    }

    /**
     * The after-action scorecard, derived entirely from what actually happened: the journalled
     * posture/impact timeline, task + 72-hour-critical completion, per-DRF performance, challenges,
     * and inject response times.
     */
    private Map<String, Object> buildAar(long id) {
        Map<String, Object> aar = new LinkedHashMap<>();
        aar.put("timeline", jdbc.queryForList("""
                select l.action, l.message, l.created_at, u.name as user_name
                from public.task_activity_log l
                left join public.users u on u.id = l.user_id
                where l.activation_id = ? and l.action in
                      ('activated','forecast_activated','posture_changed','impact_confirmed',
                       'inject_fired','inject_resolved','deactivated',
                       'command_role_appointed','command_role_relieved')
                order by l.created_at
                """, id));
        aar.put("tasks", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status = 'Completed') as completed,
                       coalesce(round(avg(progress_percent)), 0) as avg_progress,
                       count(*) filter (where is_72hr_critical) as critical_total,
                       count(*) filter (where is_72hr_critical and status = 'Completed') as critical_completed,
                       count(*) filter (where coalesce(challenge,'') <> '') as challenges,
                       count(distinct stakeholder_id) filter (where stakeholder_id is not null) as agencies_engaged
                from public.incident_tasks where activation_id = ?
                """, id));
        aar.put("drf_performance", jdbc.queryForList("""
                select f.number, f.name,
                       count(t.id) as total,
                       count(t.id) filter (where t.status = 'Completed') as completed,
                       coalesce(round(avg(t.progress_percent)), 0) as progress
                from public.disaster_response_functions f
                join public.incident_tasks t on t.drf_id = f.id and t.activation_id = ?
                group by f.number, f.name order by progress desc, f.number
                """, id));
        aar.put("injects", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status in ('fired','resolved')) as fired,
                       count(*) filter (where status = 'resolved') as resolved,
                       round(coalesce(avg(extract(epoch from (resolved_at - fired_at)) / 60)
                             filter (where resolved_at is not null and fired_at is not null), 0)) as avg_response_minutes
                from public.activation_injects where activation_id = ?
                """, id));
        aar.put("duration", jdbc.queryForMap("""
                select activated_at, deactivated_at,
                       round(extract(epoch from (coalesce(deactivated_at, now()) - activated_at)) / 3600.0, 1) as hours,
                       is_simulation, allow_real_ops, posture, status
                from public.response_activations where id = ?
                """, id));
        return aar;
    }

    /** One DRF lane's tasks (the drawer behind each lane card). */
    @GetMapping("/{id}/drf/{drfId}")
    public Map<String, Object> drfDetail(@PathVariable long id, @PathVariable long drfId) {
        findOr404(id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("drf", jdbc.queryForMap("select * from public.disaster_response_functions where id = ?", drfId));
        out.put("tasks", jdbc.queryForList("""
                select t.*, s.organization as stakeholder_organization, u.name as assigned_to_name
                from public.incident_tasks t
                left join public.stakeholders s on s.id = t.stakeholder_id
                left join public.users u on u.id = t.assigned_to_user_id
                where t.activation_id = ? and t.drf_id = ? order by t.sort_order
                """, id, drfId));
        return out;
    }

    // ─── Lane actions ───

    /** Hand a whole DRF lane to a stakeholder organisation. */
    @PreAuthorize("hasAuthority('tasks.manage')")
    @PostMapping("/{id}/drf/{drfId}/assign")
    @Transactional
    public Map<String, Object> assignDrf(@PathVariable long id, @PathVariable long drfId,
                                         @RequestBody Map<String, Object> body) {
        findOr404(id);
        long stakeholderId = lng(body.get("stakeholder_id"), "stakeholder_id");
        Map<String, Object> drf = jdbc.queryForMap(
                "select number, name from public.disaster_response_functions where id = ?", drfId);
        String organization = jdbc.queryForObject(
                "select coalesce(organization, name) from public.stakeholders where id = ?", String.class, stakeholderId);
        jdbc.update("update public.incident_tasks set stakeholder_id = ?, updated_at = now() where activation_id = ? and drf_id = ?",
                stakeholderId, id, drfId);
        activations.log(id, users.actingUserId(), "drf_assigned",
                "DRF " + drf.get("number") + " (" + drf.get("name") + ") assigned to " + organization, null);
        return Map.of("success", true, "message", "DRF " + drf.get("number") + " assigned to " + organization + ".");
    }

    /** Add a custom task to a lane. */
    @PreAuthorize("hasAuthority('tasks.manage')")
    @PostMapping("/{id}/drf/{drfId}/task")
    @Transactional
    public Map<String, Object> addTask(@PathVariable long id, @PathVariable long drfId,
                                       @RequestBody Map<String, Object> body) {
        Map<String, Object> activation = findOr404(id);
        String title = require(body.get("title"), "title");
        String priority = requireIn(body.get("priority"), PRIORITIES, "priority");
        boolean critical = Boolean.TRUE.equals(body.get("is_72hr_critical"));
        Long drfNumber = jdbc.queryForObject("select number from public.disaster_response_functions where id = ?", Long.class, drfId);
        Long taskId = jdbc.queryForObject("""
                insert into public.incident_tasks(incident_id, activation_id, drf_id, title, priority, status,
                    progress_percent, is_72hr_critical, sort_order, created_by_user_id, created_at, updated_at)
                values (?,?,?,?,?,'To Do',0,?,
                        coalesce((select max(sort_order) from public.incident_tasks where activation_id = ? and drf_id = ?), 0) + 1,
                        ?, now(), now()) returning id
                """, Long.class, activation.get("incident_id"), id, drfId, title, priority, critical, id, drfId,
                users.actingUserId());
        activations.log(id, users.actingUserId(), "task_added",
                "Custom task added to DRF " + drfNumber + ": " + title, taskId);
        return Map.of("success", true, "id", taskId, "message", "Task added successfully.");
    }

    /** Update a lane task — only changed fields are written, each change journalled. */
    @PreAuthorize("hasAuthority('tasks.manage')")
    @PostMapping("/{id}/task/{taskId}")
    @Transactional
    public Map<String, Object> updateTask(@PathVariable long id, @PathVariable long taskId,
                                          @RequestBody Map<String, Object> body) {
        findOr404(id);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from public.incident_tasks where id = ? and activation_id = ?", taskId, id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Task not found in this activation.");
        }
        Map<String, Object> task = rows.get(0);
        List<String> changes = new ArrayList<>();

        String status = str(body.get("status"));
        if (status != null && !status.equals(task.get("status"))) {
            requireIn(status, TASK_STATUSES, "status");
            changes.add("Status: " + task.get("status") + " → " + status);
            boolean completed = "Completed".equals(status);
            jdbc.update("""
                    update public.incident_tasks set status = ?,
                        completed_at = case when ? then now() else completed_at end,
                        progress_percent = case when ? then 100 else progress_percent end,
                        updated_at = now() where id = ?
                    """, status, completed, completed, taskId);
        }
        if (body.get("progress_percent") != null) {
            int progress = (int) Double.parseDouble(String.valueOf(body.get("progress_percent")));
            if (progress < 0 || progress > 100) {
                throw new BusinessRuleException("Progress must be between 0 and 100.");
            }
            if (progress != ((Number) task.getOrDefault("progress_percent", 0)).intValue()) {
                changes.add("Progress: " + task.get("progress_percent") + "% → " + progress + "%");
                jdbc.update("update public.incident_tasks set progress_percent = ?, updated_at = now() where id = ?",
                        progress, taskId);
            }
        }
        if (body.get("stakeholder_id") != null) {
            long stakeholderId = lng(body.get("stakeholder_id"), "stakeholder_id");
            String organization = jdbc.queryForObject(
                    "select coalesce(organization, name) from public.stakeholders where id = ?", String.class, stakeholderId);
            changes.add("Assigned to: " + organization);
            jdbc.update("update public.incident_tasks set stakeholder_id = ?, updated_at = now() where id = ?",
                    stakeholderId, taskId);
        }
        String priority = str(body.get("priority"));
        if (priority != null && !priority.equals(task.get("priority"))) {
            requireIn(priority, PRIORITIES, "priority");
            changes.add("Priority: " + task.get("priority") + " → " + priority);
            jdbc.update("update public.incident_tasks set priority = ?, updated_at = now() where id = ?", priority, taskId);
        }
        if (str(body.get("challenge")) != null) {
            jdbc.update("update public.incident_tasks set challenge = ?, updated_at = now() where id = ?",
                    str(body.get("challenge")), taskId);
            changes.add("Challenge reported");
        }
        if (str(body.get("resource_request")) != null) {
            jdbc.update("update public.incident_tasks set resource_request = ?, updated_at = now() where id = ?",
                    str(body.get("resource_request")), taskId);
            changes.add("Resource need noted");
        }
        if (!changes.isEmpty()) {
            activations.log(id, users.actingUserId(), "task_updated", String.join("; ", changes), taskId);
        }
        return Map.of("success", true, "message", "Task updated.");
    }

    @PreAuthorize("hasAuthority('tasks.manage')")
    @DeleteMapping("/{id}/task/{taskId}")
    @Transactional
    public Map<String, Object> destroyTask(@PathVariable long id, @PathVariable long taskId) {
        findOr404(id);
        List<String> titles = jdbc.queryForList(
                "select title from public.incident_tasks where id = ? and activation_id = ?", String.class, taskId, id);
        if (titles.isEmpty()) {
            throw new ResourceNotFoundException("Task not found in this activation.");
        }
        jdbc.update("delete from public.task_activity_log where task_id = ?", taskId);
        jdbc.update("delete from public.incident_tasks where id = ?", taskId);
        activations.log(id, users.actingUserId(), "task_updated", "Removed task: " + titles.get(0), null);
        return Map.of("success", true, "message", "Task \"" + titles.get(0) + "\" removed.");
    }

    /** Close the activation as completed (mission done) or deactivated (stood down). */
    @PreAuthorize("hasAuthority('command_post.posture')")
    @PostMapping("/{id}/deactivate")
    @Transactional
    public Map<String, Object> deactivate(@PathVariable long id, @RequestBody Map<String, Object> body) {
        assertMayManageForecast(findOr404(id));
        String status = require(body.get("status"), "status");
        if (!List.of("completed", "deactivated").contains(status)) {
            throw new BusinessRuleException("Status must be completed or deactivated.");
        }
        String notes = str(body.get("notes"));
        jdbc.update("""
                update public.response_activations set status = ?, deactivated_at = now(),
                    notes = coalesce(?, notes), updated_at = now() where id = ?
                """, status, notes, id);
        activations.log(id, users.actingUserId(), "deactivated",
                "Response " + status + ". " + (notes == null ? "" : notes), null);
        return Map.of("success", true, "message", "Response " + status + " successfully.");
    }

    // ─── ICS command roles (F05, V140) ───

    /**
     * Appoint an ICS command-role holder (Incident Commander, section chief, command staff).
     * The current incumbent — if any — is relieved first, and BOTH events are journalled into
     * task_activity_log so the After-Action Review shows the command handover.
     */
    @PreAuthorize("hasAuthority('tasks.manage')")
    @PostMapping("/{id}/command-roles")
    @Transactional
    public Map<String, Object> appointCommandRole(@PathVariable long id, @RequestBody Map<String, Object> body) {
        findOr404(id);
        String role = requireIn(body.get("role"), COMMAND_ROLES, "role");
        long userId = lng(body.get("user_id"), "user_id");
        List<String> names = jdbc.queryForList("select name from public.users where id = ?", String.class, userId);
        if (names.isEmpty()) {
            throw new BusinessRuleException("The selected user does not exist.");
        }
        String name = names.get(0);
        String note = str(body.get("note"));
        Long actor = users.actingUserId();
        // Relieve the incumbent first — one active holder per (activation, role); the partial
        // unique index uq_activation_command_role_active is the hard guarantee behind this.
        List<Map<String, Object>> incumbent = jdbc.queryForList("""
                select r.id, r.user_id, u.name as user_name
                from public.activation_command_roles r
                left join public.users u on u.id = r.user_id
                where r.activation_id = ? and r.role = ? and r.relieved_at is null
                """, id, role);
        if (!incumbent.isEmpty()) {
            if (((Number) incumbent.get(0).get("user_id")).longValue() == userId) {
                throw new BusinessRuleException(name + " already holds the " + roleTitle(role) + " role.");
            }
            jdbc.update("update public.activation_command_roles set relieved_at = now(), relieved_by = ? where id = ?",
                    actor, incumbent.get(0).get("id"));
            activations.log(id, actor, "command_role_relieved",
                    roleTitle(role) + ": " + incumbent.get(0).get("user_name")
                            + " relieved — handover to " + name + ".", null);
        }
        Long roleId = jdbc.queryForObject("""
                insert into public.activation_command_roles(activation_id, role, user_id, appointed_at, appointed_by, note)
                values (?,?,?,now(),?,?) returning id
                """, Long.class, id, role, userId, actor, note);
        activations.log(id, actor, "command_role_appointed",
                roleTitle(role) + ": " + name + " appointed." + (note == null ? "" : " " + note), null);
        return Map.of("success", true, "id", roleId,
                "message", name + " appointed as " + roleTitle(role) + ".");
    }

    /** Relieve a command-role holder WITHOUT a replacement — the role goes vacant (journalled). */
    @PreAuthorize("hasAuthority('tasks.manage')")
    @PostMapping("/command-roles/{roleId}/relieve")
    @Transactional
    public Map<String, Object> relieveCommandRole(@PathVariable long roleId,
                                                  @RequestBody(required = false) Map<String, Object> body) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select r.*, u.name as user_name from public.activation_command_roles r
                left join public.users u on u.id = r.user_id
                where r.id = ?
                """, roleId);
        if (rows.isEmpty() || rows.get(0).get("relieved_at") != null) {
            throw new ResourceNotFoundException("Active command-role appointment not found.");
        }
        Map<String, Object> appointment = rows.get(0);
        long activationId = ((Number) appointment.get("activation_id")).longValue();
        // Same area-scoped visibility rule as every other board mutation (out-of-area → 404).
        findOr404(activationId);
        String role = String.valueOf(appointment.get("role"));
        String note = body == null ? null : str(body.get("note"));
        Long actor = users.actingUserId();
        jdbc.update("update public.activation_command_roles set relieved_at = now(), relieved_by = ? where id = ?",
                actor, roleId);
        activations.log(activationId, actor, "command_role_relieved",
                roleTitle(role) + ": " + appointment.get("user_name") + " relieved — role now vacant."
                        + (note == null ? "" : " " + note), null);
        return Map.of("success", true, "message", roleTitle(role) + " relieved. The role is now vacant.");
    }

    // ─── internals ───

    /**
     * The ICS org-chart block: one entry per standard command role, carrying the ACTIVE holder
     * (user + who appointed them + when) or vacant = true. Rendered by the board's
     * 'Incident Command (ICS)' panel.
     */
    private List<Map<String, Object>> commandRolesBlock(long activationId) {
        List<Map<String, Object>> active = jdbc.queryForList("""
                select r.id, r.role, r.user_id, u.name as user_name, r.appointed_at, r.note,
                       a.name as appointed_by_name
                from public.activation_command_roles r
                left join public.users u on u.id = r.user_id
                left join public.users a on a.id = r.appointed_by
                where r.activation_id = ? and r.relieved_at is null
                """, activationId);
        List<Map<String, Object>> roles = new ArrayList<>();
        for (String role : COMMAND_ROLES) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("role", role);
            row.put("role_title", roleTitle(role));
            Map<String, Object> holder = active.stream()
                    .filter(r -> role.equals(r.get("role"))).findFirst().orElse(null);
            row.put("vacant", holder == null);
            if (holder != null) {
                row.putAll(holder);
            }
            roles.add(row);
        }
        return roles;
    }

    /** Full institutional title for an ICS role code (journal + UI wording). */
    private static String roleTitle(String role) {
        return switch (role) {
            case "IC" -> "Incident Commander";
            case "Deputy IC" -> "Deputy Incident Commander";
            case "Operations" -> "Operations Section Chief";
            case "Planning" -> "Planning Section Chief";
            case "Logistics" -> "Logistics Section Chief";
            case "Finance/Admin" -> "Finance/Admin Section Chief";
            case "PIO" -> "Public Information Officer";
            case "Safety" -> "Safety Officer";
            case "Liaison" -> "Liaison Officer";
            default -> role;
        };
    }

    private List<Map<String, Object>> activityQuery(long activationId, Long drfId, String action, int limit) {
        StringBuilder where = new StringBuilder("l.activation_id = ?");
        List<Object> params = new ArrayList<>(List.of(activationId));
        if (drfId != null) {
            where.append(" and t.drf_id = ?");
            params.add(drfId);
        }
        if (action != null && !action.isBlank()) {
            where.append(" and l.action = ?");
            params.add(action);
        }
        return jdbc.queryForList("""
                select l.*, u.name as user_name, t.title as task_title, f.number as drf_number
                from public.task_activity_log l
                left join public.users u on u.id = l.user_id
                left join public.incident_tasks t on t.id = l.task_id
                left join public.disaster_response_functions f on f.id = t.drf_id
                where %s order by l.created_at desc limit %d
                """.formatted(where, limit), params.toArray());
    }

    /**
     * Fetch an activation the caller is allowed to see. An incident-linked activation is visible only to
     * officers in that incident's area (or national); a forecast activation has no incident yet (NULL
     * region) and stays visible to all, exactly as the index LEFT JOINs it. This single scoped fetch is what
     * keeps every by-id read and lane mutation (board, drf, assign, task add/update/delete, posture,
     * deactivate, impact, readiness) from reaching another region's response. Out-of-area → 404.
     */
    private Map<String, Object> findOr404(long id) {
        StringBuilder where = new StringBuilder("ra.id = ?");
        List<Object> params = new ArrayList<>();
        params.add(id);
        jurisdiction.appendAreaScopeSharedOrOwn("i", where, params);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select ra.* from public.response_activations ra "
                        + "left join public.incidents i on i.id = ra.incident_id where " + where,
                params.toArray());
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Activation not found.");
        }
        return rows.get(0);
    }

    /**
     * Forecast (anticipatory, multi-region) activations belong to the national command that opened them —
     * a single area officer must not stand one down, change its posture, or confirm impact for the whole
     * country. Incident-linked activations are already area-scoped by {@link #findOr404}, so this is a no-op
     * for them. Out-of-tier → 404 (indistinguishable from "not yours").
     */
    private void assertMayManageForecast(Map<String, Object> activation) {
        if (activation.get("incident_id") == null
                && jurisdiction.currentTier() != JurisdictionScope.Tier.NATIONAL) {
            throw new ResourceNotFoundException("Activation not found.");
        }
    }

    private static String requireIn(Object v, List<String> allowed, String field) {
        String s = require(v, field);
        if (!allowed.contains(s)) {
            throw new BusinessRuleException("The selected " + field + " is invalid.");
        }
        return s;
    }

    private static String require(Object v, String field) {
        String s = str(v);
        if (s == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return s;
    }

    private static long lng(Object v, String field) {
        if (v == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return (long) Double.parseDouble(String.valueOf(v));
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    /**
     * Replace the PG json columns (affected_areas, forecast_track) on an activation row with
     * parsed arrays so the frontend gets a clean contract instead of {@code {type,value}} PGobjects.
     */
    private static Map<String, Object> cleanActivationJson(Map<String, Object> activation) {
        if (activation == null) {
            return null;
        }
        activation.put("affected_areas", parseJson(activation.get("affected_areas")));
        activation.put("forecast_track", parseJson(activation.get("forecast_track")));
        return activation;
    }

    /** Parse a PG json column value (PGobject or string) into a List, or null. */
    private static Object parseJson(Object v) {
        if (v == null) {
            return null;
        }
        try {
            String json = v.getClass().getSimpleName().equals("PGobject")
                    ? String.valueOf(v.getClass().getMethod("getValue").invoke(v))
                    : String.valueOf(v);
            return json == null ? null : JSON.readValue(json, List.class);
        } catch (Exception e) {
            return null;
        }
    }

    /** Render a json area array ({@code ["Dar es Salaam","Pwani"]}) as "Dar es Salaam, Pwani". */
    private static String formatAreas(Object affectedAreas) {
        if (affectedAreas == null) {
            return null;
        }
        try {
            List<?> areas = JSON.readValue(String.valueOf(affectedAreas), List.class);
            return areas.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(", "));
        } catch (Exception e) {
            return String.valueOf(affectedAreas);
        }
    }
}
