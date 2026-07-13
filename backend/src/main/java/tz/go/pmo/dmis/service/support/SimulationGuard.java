package tz.go.pmo.dmis.service.support;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tz.go.pmo.dmis.common.error.BusinessRuleException;

/**
 * Drill-isolation guard (the D1 contract the Command Post doctrine promises: "identical board, zero
 * impact on live operations"). A simulation exercises the Command Post — posture, DRF lanes, tasks,
 * challenges, injects — and by default must NEVER reach real logistics, real money or real
 * communications. The exception is a FULL-SCALE exercise: the operator who opens the drill may set
 * {@code allow_real_ops} on its activation, which permits real operations for that exercise (comms
 * still carry a [DRILL] marking). Call these before any side-effect that moves stock, commits budget,
 * notifies partners or sends SMS/email, keyed on the incident (or allocation) the action is for.
 */
@Component
public class SimulationGuard {

    private final JdbcTemplate jdbc;

    public SimulationGuard(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** True when the incident exists and is a simulation drill clone. */
    public boolean isSimulationIncident(Long incidentId) {
        if (incidentId == null) {
            return false;
        }
        List<Boolean> f = jdbc.queryForList(
                "select is_simulation from public.incidents where id = ?", Boolean.class, incidentId);
        return !f.isEmpty() && Boolean.TRUE.equals(f.get(0));
    }

    /** True when a drill incident's exercise was opened as FULL-SCALE (real operations permitted). */
    public boolean realOpsAllowed(Long incidentId) {
        if (incidentId == null) {
            return false;
        }
        Boolean allowed = jdbc.queryForObject(
                "select coalesce(bool_or(allow_real_ops), false) from public.response_activations where incident_id = ?",
                Boolean.class, incidentId);
        return Boolean.TRUE.equals(allowed);
    }

    /** Refuse a real-world side-effect aimed at a TABLE-TOP simulation (full-scale exercises pass). */
    public void assertNotSimulationIncident(Long incidentId, String action) {
        if (isSimulationIncident(incidentId) && !realOpsAllowed(incidentId)) {
            throw new BusinessRuleException("This incident is a SIMULATION drill (table-top) — " + action
                    + " is a live operation and is blocked. Exercise it on the Command Post board, or re-open the"
                    + " drill as a full-scale exercise (allow real operations) if this exercise should move real resources.");
        }
    }

    /** Refuse a real-world side-effect on an allocation that belongs to a simulation incident. */
    public void assertAllocationNotSimulation(long allocationId, String action) {
        List<Long> inc = jdbc.queryForList(
                "select incident_id from public.allocated_resources where id = ?", Long.class, allocationId);
        if (!inc.isEmpty()) {
            assertNotSimulationIncident(inc.get(0), action);
        }
    }
}
