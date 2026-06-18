package tz.go.pmo.dmis.response;

import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;

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

    public ActivationService(JdbcTemplate jdbc, IncidentWorkflowService users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    @Transactional
    public Map<String, Object> activate(long incidentId, boolean simulation, String notes) {
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

        Long userId = users.actingUserId();
        Long activationId = jdbc.queryForObject("""
                insert into public.response_activations(incident_id, activated_by, activated_at, status,
                    notes, is_simulation, created_at, updated_at)
                values (?,?,now(),'active',?,?,now(),now()) returning id
                """, Long.class, targetIncidentId, userId, notes, simulation);

        // Snapshot every DRF's default tasks as coordination lanes (unified 'To Do' status)
        int tasks = jdbc.update("""
                insert into public.incident_tasks(incident_id, activation_id, drf_id, title, description,
                    priority, status, progress_percent, is_72hr_critical, sort_order, created_by_user_id,
                    created_at, updated_at)
                select ?, ?, t.drf_id, t.title, t.description, t.default_priority, 'To Do', 0,
                       t.is_72hr_critical, t.sort_order, ?, now(), now()
                from public.drf_default_tasks t
                join public.disaster_response_functions f on f.id = t.drf_id
                """, targetIncidentId, activationId, userId);

        log(activationId, userId, "activated",
                (simulation ? "SIMULATION drill activated" : "Disaster response activated")
                        + " — 15 DRFs and " + tasks + " tasks created.", null);
        return Map.of("activation_id", activationId, "incident_id", targetIncidentId,
                "tasks_created", tasks, "is_simulation", simulation);
    }

    /** Append to the activation's coordination timeline (TaskActivityLog::log). */
    public void log(long activationId, Long userId, String action, String message, Long taskId) {
        jdbc.update("""
                insert into public.task_activity_log(activation_id, task_id, user_id, action, message, created_at)
                values (?,?,?,?,?,now())
                """, activationId, taskId, userId, action, message);
    }
}
