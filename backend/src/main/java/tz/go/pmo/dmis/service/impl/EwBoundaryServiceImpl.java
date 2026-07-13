package tz.go.pmo.dmis.service.impl;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.service.EwBoundaryService;

/**
 * EW boundary for the native monitoring screens — faithful port of the Laravel
 * EwMonitoringController (routes/api.php /ew/*), preserving request/response contracts.
 * Consumed by the Disaster Scanner focal-point panel.
 *
 * <p>2026-07-05 — audit F01: removed 5 endpoints whose only consumers were retired
 * Streamlit dashboards. Dissemination lives in Communication Center / EOCC Bulletin.
 * <p>Logic in service.impl (eGA). Acting user via {@link CurrentUserResolver}.
 * Blank filter params are ignored (productive: nonsense values yield zero rows).
 */
@Service
public class EwBoundaryServiceImpl implements EwBoundaryService {

    private final JdbcTemplate jdbc;
    private final CurrentUserResolver users;

    public EwBoundaryServiceImpl(JdbcTemplate jdbc, CurrentUserResolver users) {
        this.jdbc = jdbc;
        this.users = users;
    }

    @Override
    public Map<String, Object> reports(String bulletinNumber, String warningCode) {
        StringBuilder sql = new StringBuilder("select * from public.ew_focal_point_reports where 1=1");
        List<Object> args = new ArrayList<>();
        // Blank = unfiltered (same productivity contract as Response status_filter all/blank).
        if (bulletinNumber != null && !bulletinNumber.isBlank()) {
            sql.append(" and bulletin_number = ?");
            args.add(bulletinNumber.trim());
        }
        if (warningCode != null && !warningCode.isBlank()) {
            sql.append(" and warning_code = ?");
            args.add(warningCode.trim());
        }
        sql.append(" order by created_at desc limit 100");
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), args.toArray());
        return Map.of("success", true, "count", rows.size(), "reports", rows);
    }

    @Override
    @Transactional
    public Map<String, Object> storeReport(Map<String, Object> r) {
        Long id = insertReport(r);
        return Map.of("success", true, "message", "Report saved successfully.", "id", id);
    }

    private Long insertReport(Map<String, Object> r) {
        Long userId = users.actingUserId();
        Number id = jdbc.queryForObject(
            "insert into public.ew_focal_point_reports (bulletin_number, warning_code, focal_point_name, phone, "
            + "location, role, status, report_details, actions_taken, actions_planned, bulletin_received, "
            + "impact_verified, people_affected, households_evacuated, reported_by) "
            + "values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) returning id", Number.class,
            str(r.get("bulletin_number")), str(r.get("warning_code")),
            req(str(r.get("focal_point_name")), "focal_point_name"),
            str(r.get("phone")), str(r.get("location")), str(r.get("role")),
            firstNonBlank(str(r.get("status")), "awaiting"), str(r.get("report_details")),
            str(r.get("actions_taken")), str(r.get("actions_planned")), bool(r.get("bulletin_received")),
            bool(r.get("impact_verified")), intOrNull(r.get("people_affected")),
            intOrNull(r.get("households_evacuated")), userId);
        return id.longValue();
    }

    private static String str(Object o) {
        return o == null ? null : String.valueOf(o);
    }

    private static String firstNonBlank(String... xs) {
        for (String x : xs) {
            if (x != null && !x.isBlank()) {
                return x;
            }
        }
        return null;
    }

    private static boolean bool(Object o) {
        return o instanceof Boolean b ? b : "true".equalsIgnoreCase(str(o));
    }

    private static Integer intOrNull(Object o) {
        if (o instanceof Number num) {
            return num.intValue();
        }
        try {
            return o == null || str(o).isBlank() ? null : Integer.parseInt(str(o).trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static String req(String v, String field) {
        if (v == null || v.isBlank()) {
            throw new BusinessRuleException(field + " is required.");
        }
        return v;
    }
}
