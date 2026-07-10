package tz.go.pmo.dmis.response;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.notification.NotificationService;

/**
 * Opens a disaster response activation — the single entry point shared by the
 * EOCC quick action and the Command Center (port of CoordinationController::
 * activate, extended with the Live/Simulation split the user specified).
 *
 * Live mode activates the real incident. Simulation mode first CLONES the
 * incident as a "[SIMULATION]" drill copy (is_simulation = true) and activates
 * the clone — exercises every board, lane and clock without touching live
 * operations, and public reads exclude flagged incidents (manual D1 contract).
 *
 * Activation snapshots all 15 NDPRP DRFs' default tasks (95) onto the
 * incident as coordination lanes and starts the 72-hour clock.
 */
@Service
public class ActivationService {

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService users;
    private final NotificationService notifications;

    public ActivationService(JdbcTemplate jdbc, IncidentWorkflowService users, NotificationService notifications) {
        this.jdbc = jdbc;
        this.users = users;
        this.notifications = notifications;
    }

    @Transactional
    public Map<String, Object> activate(long incidentId, boolean simulation, String notes) {
        return activate(incidentId, simulation, false, notes);
    }

    /**
     * @param allowRealOps only meaningful for simulations: false = table-top drill (real side-effects
     *                     hard-blocked by {@link SimulationGuard}); true = full-scale exercise (real
     *                     operations permitted, communications [DRILL]-marked).
     */
    @Transactional
    public Map<String, Object> activate(long incidentId, boolean simulation, boolean allowRealOps, String notes) {
        List<Map<String, Object>> incidents = jdbc.queryForList(
                "select * from public.incidents where id = ?", incidentId);
        if (incidents.isEmpty()) {
            throw new BusinessRuleException("Incident not found.");
        }
        long targetIncidentId = incidentId;
        if (simulation) {
            // Drill copy: same operational shape, flagged and renamed so nothing live moves
            targetIncidentId = jdbc.queryForObject("""
                    insert into public.incidents (title, description, incident_type_id, severity_level, status,
                        workflow_status, region_id, district_id, region_name, location_description,
                        latitude, longitude, reported_at, is_simulation, created_at, updated_at)
                    select '[SIMULATION] ' || title, description, incident_type_id, severity_level, status,
                        workflow_status, region_id, district_id, region_name, location_description,
                        latitude, longitude, now(), true, now(), now()
                    from public.incidents where id = ? returning id
                    """, Long.class, incidentId);
        } else {
            Long active = jdbc.queryForObject(
                    "select count(*) from public.response_activations where incident_id = ? and status = 'active'",
                    Long.class, incidentId);
            if (active != null && active > 0) {
                throw new BusinessRuleException("A response is already active for this incident.");
            }
        }

        return createActivation(targetIncidentId, users.actingUserId(), notes, simulation,
                simulation && allowRealOps, null, null, null);
    }

    /**
     * Open a Command Post for a pre-authored exercise incident from the scenario library. The incident is
     * already a simulation clone, so this path reuses the same activation/task/log machinery without
     * cloning it a second time.
     */
    @Transactional
    public Map<String, Object> activateScenarioDrill(long incidentId, long exerciseRunId, long scenarioId,
                                                     long scenarioIncidentId, boolean allowRealOps,
                                                     String notes) {
        List<Boolean> flags = jdbc.queryForList(
                "select is_simulation from public.incidents where id = ?", Boolean.class, incidentId);
        if (flags.isEmpty()) {
            throw new BusinessRuleException("Incident not found.");
        }
        if (!Boolean.TRUE.equals(flags.get(0))) {
            throw new BusinessRuleException("Scenario exercises must launch against simulation incidents.");
        }
        return createActivation(incidentId, users.actingUserId(), notes, true, allowRealOps,
                exerciseRunId, scenarioId, scenarioIncidentId);
    }

    private Map<String, Object> createActivation(long incidentId, Long userId, String notes,
                                                 boolean simulation, boolean allowRealOps,
                                                 Long exerciseRunId, Long scenarioId,
                                                 Long scenarioIncidentId) {
        Long activationId = jdbc.queryForObject("""
                insert into public.response_activations(incident_id, activated_by, activated_at, status,
                    notes, is_simulation, allow_real_ops, exercise_run_id, scenario_id, scenario_incident_id,
                    created_at, updated_at)
                values (?,?,now(),'active',?,?,?,?,?,?,now(),now()) returning id
                """, Long.class, incidentId, userId, notes, simulation, simulation && allowRealOps,
                exerciseRunId, scenarioId, scenarioIncidentId);

        // Snapshot every DRF's default tasks as coordination lanes (unified 'To Do' status)
        int tasks = jdbc.update("""
                insert into public.incident_tasks(incident_id, activation_id, drf_id, title, description,
                    priority, status, progress_percent, is_72hr_critical, sort_order, created_by_user_id,
                    created_at, updated_at)
                select ?, ?, t.drf_id, t.title, t.description, t.default_priority, 'To Do', 0,
                       t.is_72hr_critical, t.sort_order, ?, now(), now()
                from public.drf_default_tasks t
                join public.disaster_response_functions f on f.id = t.drf_id
                """, incidentId, activationId, userId);

        String summary = (simulation
                ? "SIMULATION " + (allowRealOps ? "FULL-SCALE exercise" : "table-top drill") + " activated"
                : "Disaster response activated")
                + " — 15 DRFs and " + tasks + " tasks created.";
        log(activationId, userId, "activated", summary, null);
        // F27 — CP activation was silent; notify national response desks (in-app).
        try {
            String title = simulation ? "Simulation command post activated" : "Command post activated";
            String msg = summary + " (incident #" + incidentId + ", activation #" + activationId + ").";
            notifications.notifyRoles(
                    List.of("EOCC", "Director", "Asst. Director", "Super Admin"),
                    NotificationService.Notice.inApp(
                            simulation ? "cp_activation_sim" : "cp_activation",
                            title, msg,
                            "/m/response/coordination?activation=" + activationId,
                            "response_activation", activationId, simulation ? "info" : "warning"));
        } catch (Exception ignored) {
            // Non-fatal: activation already committed.
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("activation_id", activationId);
        out.put("incident_id", incidentId);
        out.put("tasks_created", tasks);
        out.put("is_simulation", simulation);
        if (exerciseRunId != null) {
            out.put("exercise_run_id", exerciseRunId);
            out.put("scenario_id", scenarioId);
            out.put("scenario_incident_id", scenarioIncidentId);
        }
        return out;
    }

    /** Append to the activation's coordination timeline (TaskActivityLog::log). */
    public void log(long activationId, Long userId, String action, String message, Long taskId) {
        jdbc.update("""
                insert into public.task_activity_log(activation_id, task_id, user_id, action, message, created_at)
                values (?,?,?,?,?,now())
                """, activationId, taskId, userId, action, message);
    }
}
