package tz.go.pmo.dmis.ew;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;

/**
 * EW boundary for the native monitoring screens — a FAITHFUL port of the Laravel
 * EwMonitoringController (routes/api.php /ew/*), preserving identical request/response contracts.
 * (Spring context-path is /api, so these map under /ew → /api/ew/*.) Both surviving endpoints are
 * consumed by the Disaster Scanner focal-point panel (disaster-scanner.component.ts).
 *
 * <p>2026-07-05 — audit F01: removed 5 endpoints whose only consumers were the RETIRED Streamlit
 * dashboards (dissemination_page.py / monitoring_page.py, parked in ew-engine-aside): GET
 * /ew/stakeholders (leaked the stakeholder contact directory), POST /ew/disseminate and POST
 * /ew/sms-test (dormant real M-Gov SMS / SMTP dispatching surface with no UI), POST
 * /ew/monitoring/reports/batch and POST /ew/monitoring/request-update. Dissemination now lives in
 * the native Communication Center / EOCC Bulletin flow.
 */
@RestController
@RequestMapping("/ew")
// The monitoring read stays authenticated; the focal-point report WRITE is role-gated per method.
@PreAuthorize("isAuthenticated()")
public class EwBoundaryController {

    private final JdbcTemplate jdbc;

    public EwBoundaryController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // ── GET /ew/monitoring/reports — focal-point reports (EwMonitoringController@index)
    @GetMapping("/monitoring/reports")
    public Map<String, Object> reports(@RequestParam(required = false) String bulletin_number,
                                       @RequestParam(required = false) String warning_code) {
        StringBuilder sql = new StringBuilder("select * from public.ew_focal_point_reports where 1=1");
        List<Object> args = new ArrayList<>();
        if (bulletin_number != null) { sql.append(" and bulletin_number = ?"); args.add(bulletin_number); }
        if (warning_code != null) { sql.append(" and warning_code = ?"); args.add(warning_code); }
        sql.append(" order by created_at desc limit 100");
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), args.toArray());
        return Map.of("success", true, "count", rows.size(), "reports", rows);
    }

    // ── POST /ew/monitoring/reports — store one (EwMonitoringController@store)
    @PostMapping("/monitoring/reports")
    @Transactional
    @PreAuthorize("hasAuthority('early_warning.create')")
    public Map<String, Object> storeReport(@RequestBody Map<String, Object> r) {
        Long id = insertReport(r);
        return Map.of("success", true, "message", "Report saved successfully.", "id", id);
    }

    // ── helpers ───────────────────────────────────────────────────────────────────────────────────
    private Long insertReport(Map<String, Object> r) {
        Long userId = currentUserId();
        Number id = jdbc.queryForObject(
            "insert into public.ew_focal_point_reports (bulletin_number, warning_code, focal_point_name, phone, " +
            "location, role, status, report_details, actions_taken, actions_planned, bulletin_received, " +
            "impact_verified, people_affected, households_evacuated, reported_by) " +
            "values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) returning id", Number.class,
            str(r.get("bulletin_number")), str(r.get("warning_code")), req(str(r.get("focal_point_name")), "focal_point_name"),
            str(r.get("phone")), str(r.get("location")), str(r.get("role")),
            firstNonBlank(str(r.get("status")), "awaiting"), str(r.get("report_details")),
            str(r.get("actions_taken")), str(r.get("actions_planned")), bool(r.get("bulletin_received")),
            bool(r.get("impact_verified")), intOrNull(r.get("people_affected")), intOrNull(r.get("households_evacuated")), userId);
        return id.longValue();
    }

    private Long currentUserId() {
        try {
            String name = tz.go.pmo.dmis.common.security.SecurityUtils.currentUserName();
            if (name != null && !name.isBlank() && !name.equalsIgnoreCase("System")) {
                List<Long> ids = jdbc.queryForList("select id from public.users where email = ? or name = ? limit 1", Long.class, name, name);
                if (!ids.isEmpty()) return ids.get(0);
            }
        } catch (Exception ignored) { }
        return null;
    }

    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
    private static String firstNonBlank(String... xs) { for (String x : xs) if (x != null && !x.isBlank()) return x; return null; }
    private static boolean bool(Object o) { return o instanceof Boolean b ? b : "true".equalsIgnoreCase(str(o)); }
    private static Integer intOrNull(Object o) {
        if (o instanceof Number num) return num.intValue();
        try { return o == null || str(o).isBlank() ? null : Integer.parseInt(str(o).trim()); } catch (Exception e) { return null; }
    }
    private static String req(String v, String field) { if (v == null || v.isBlank()) throw new BusinessRuleException(field + " is required."); return v; }
}
