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
import tz.go.pmo.dmis.common.security.Authz;

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
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON =
            new com.fasterxml.jackson.databind.ObjectMapper();

    private final JdbcTemplate jdbc;
    private final ActivationService activations;
    private final IncidentWorkflowService users;
    private final AnticipatoryPlanController plans;

    public CommandCenterController(JdbcTemplate jdbc, ActivationService activations,
                                   IncidentWorkflowService users, AnticipatoryPlanController plans) {
        this.jdbc = jdbc;
        this.activations = activations;
        this.users = users;
        this.plans = plans;
    }

    // ─── Activations index ───

    @GetMapping
    public Map<String, Object> index() {
        Map<String, Object> out = new LinkedHashMap<>();
        // LEFT JOIN incidents throughout — anticipatory (forecast) activations have no incident
        // until impact, but must still appear in the index; fall back to the hazard description.
        out.put("active", jdbc.queryForList("""
                select ra.*, coalesce(i.title, ra.hazard_description) as incident_title,
                       i.severity_level, i.region_name, u.name as activated_by_name,
                       (select count(*) from public.incident_tasks t where t.activation_id = ra.id) as total_tasks,
                       (select count(*) from public.incident_tasks t where t.activation_id = ra.id and t.status = 'Completed') as completed_tasks
                from public.response_activations ra
                left join public.incidents i on i.id = ra.incident_id
                left join public.users u on u.id = ra.activated_by
                where ra.status = 'active' order by ra.activated_at desc
                """).stream().map(CommandCenterController::cleanActivationJson).toList());
        out.put("completed", jdbc.queryForList("""
                select ra.*, coalesce(i.title, ra.hazard_description) as incident_title, u.name as activated_by_name
                from public.response_activations ra
                left join public.incidents i on i.id = ra.incident_id
                left join public.users u on u.id = ra.activated_by
                where ra.status in ('completed','deactivated')
                order by ra.deactivated_at desc nulls last limit 10
                """).stream().map(CommandCenterController::cleanActivationJson).toList());
        // Approved incidents that have no activation yet (the source's awaiting list)
        out.put("awaiting", jdbc.queryForList("""
                select i.id, i.title, i.severity_level, i.region_name, i.workflow_status
                from public.incidents i
                where i.workflow_status = 'approved' and i.is_simulation = false
                  and not exists (select 1 from public.response_activations ra
                                  where ra.incident_id = i.id and ra.status = 'active')
                order by i.reported_at desc limit 50
                """));
        out.put("posture_doctrine", jdbc.queryForList(
                "select * from public.posture_doctrine order by sort_order"));
        return out;
    }

    /** Open an activation — mode 'live' or 'simulation' (drill clone, V29). */
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/activate/{incidentId}")
    @Transactional
    public Map<String, Object> activate(@PathVariable long incidentId,
                                        @RequestBody(required = false) Map<String, Object> body) {
        boolean simulation = body != null && "simulation".equals(body.get("mode"));
        String notes = body == null || body.get("notes") == null ? null : String.valueOf(body.get("notes"));
        Map<String, Object> result = activations.activate(incidentId, simulation, notes);
        return Map.of("success", true, "activation_id", result.get("activation_id"),
                "message", (simulation ? "Simulation drill activated. " : "Disaster response activated. ")
                        + "72-hour clock has started — " + result.get("tasks_created") + " DRF tasks created.");
    }

    // ─── Forecast lifecycle (NDPRP 2022 anticipatory activation, V30) ───

    /**
     * Anticipatory activation FROM A FORECAST, before any incident exists —
     * the cyclone-coming scenario: DMD opens the post at posture 'monitoring',
     * preparedness plans activate for the forecast-impact areas, and every DRF
     * lane goes visibly ON CALL.
     */
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/forecast")
    @Transactional
    public Map<String, Object> activateFromForecast(@RequestBody Map<String, Object> body) throws Exception {
        String hazard = require(body.get("hazard_description"), "hazard_description");
        if (!(body.get("affected_areas") instanceof List<?> areas) || areas.isEmpty()) {
            throw new BusinessRuleException("At least one forecast-impact area is required.");
        }
        boolean simulation = "simulation".equals(body.get("mode"));
        Long userId = users.actingUserId();
        Long activationId = jdbc.queryForObject("""
                insert into public.response_activations(incident_id, activated_by, activated_at, status,
                    posture, trigger_type, hazard_description, affected_areas, expected_impact_at,
                    forecast_track, is_simulation, notes, created_at, updated_at)
                values (null, ?, now(), 'active', 'monitoring', 'forecast', ?, ?::json, ?::timestamptz,
                        ?::json, ?, ?, now(), now()) returning id
                """, Long.class, userId, hazard,
                JSON.writeValueAsString(body.get("affected_areas")), str(body.get("expected_impact_at")),
                body.get("forecast_track") == null ? null : JSON.writeValueAsString(body.get("forecast_track")),
                simulation, str(body.get("notes")));
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
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/posture")
    @Transactional
    public Map<String, Object> changePosture(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> activation = findOr404(id);
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
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/cancel-forecast")
    @Transactional
    public Map<String, Object> cancelForecast(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> activation = findOr404(id);
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
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/impact")
    @Transactional
    public Map<String, Object> confirmImpact(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> activation = findOr404(id);
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
        out.put("task_statuses", TASK_STATUSES);
        out.put("priorities", PRIORITIES);
        // Doctrine reference: posture -> TEPRP level / alert colour / authoriser (V41 seed)
        out.put("posture_doctrine", jdbc.queryForList(
                "select * from public.posture_doctrine order by sort_order"));
        return out;
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
    @PreAuthorize(Authz.RESPONSE_OPERATE)
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
    @PreAuthorize(Authz.RESPONSE_OPERATE)
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
    @PreAuthorize(Authz.RESPONSE_OPERATE)
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

    @PreAuthorize(Authz.RESPONSE_OPERATE)
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
    @PreAuthorize(Authz.RESPONSE_OPERATE)
    @PostMapping("/{id}/deactivate")
    @Transactional
    public Map<String, Object> deactivate(@PathVariable long id, @RequestBody Map<String, Object> body) {
        findOr404(id);
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

    // ─── internals ───

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

    private Map<String, Object> findOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from public.response_activations where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Activation not found.");
        }
        return rows.get(0);
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
