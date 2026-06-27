package tz.go.pmo.dmis.response;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;

/**
 * Public hazard reports — the triage desk that closes the loop from the citizen "Report Hazard"
 * wizard (public portal writes public_hazard_reports) into the Response module. Responders see
 * incoming citizen reports, mark them reviewing/dismissed, or CONVERT a credible report into a
 * formal incident (which then enters the incident workflow). Previously this sidebar item had no
 * screen — citizen reports came in but could not be actioned.
 */
@RestController
@RequestMapping("/v1/response/public-reports")
public class PublicReportsController {

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService users;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;

    public PublicReportsController(JdbcTemplate jdbc, IncidentWorkflowService users, JurisdictionScope jurisdiction,
            AreaGuard areaGuard) {
        this.jdbc = jdbc;
        this.users = users;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('incidents.view')")
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String search) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            where.append(" and r.status = ?");
            params.add(status);
        }
        if (search != null && !search.isBlank()) {
            where.append(" and (r.report_code ilike ? or r.hazard_type ilike ? or r.location_description ilike ?)");
            params.add("%" + search + "%");
            params.add("%" + search + "%");
            params.add("%" + search + "%");
        }
        // The DDMC sees citizen reports in their own district plus untagged ones (a NULL area = a not-yet-
        // assigned report visible to all coordinators); national triage sees all.
        jurisdiction.appendAreaScopeSharedOrOwn("r", where, params);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reports", jdbc.queryForList("""
                select r.id, r.report_code, r.hazard_type, r.description, r.location_description,
                       r.latitude, r.longitude, r.urgency_level, r.reporter_name, r.reporter_phone,
                       r.status, r.review_notes, r.linked_incident_id, r.created_at, r.reviewed_at,
                       u.name as reviewed_by_name, i.title as linked_incident_title
                from public.public_hazard_reports r
                left join public.users u on u.id = r.reviewed_by
                left join public.incidents i on i.id = r.linked_incident_id
                where %s
                order by case r.status when 'new' then 0 when 'reviewing' then 1 else 2 end,
                         r.created_at desc limit 200
                """.formatted(where), params.toArray()));
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status = 'new') as new_reports,
                       count(*) filter (where status = 'reviewing') as reviewing,
                       count(*) filter (where status = 'converted') as converted,
                       count(*) filter (where status = 'dismissed') as dismissed
                from public.public_hazard_reports
                """));
        return out;
    }

    /** Mark a report under review. */
    @PostMapping("/{id}/review")
    @PreAuthorize(Authz.PERM_INCIDENT_UPDATE)
    @Transactional
    public Map<String, Object> review(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        requireNew(id, "reviewing");
        jdbc.update("""
                update public.public_hazard_reports set status = 'reviewing', reviewed_by = ?, reviewed_at = now(),
                    review_notes = ?, updated_at = now() where id = ?
                """, users.actingUserId(), str(body == null ? null : body.get("notes")), id);
        return Map.of("success", true, "message", "Report marked under review.");
    }

    /** Dismiss a non-credible / duplicate report. */
    @PostMapping("/{id}/dismiss")
    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @Transactional
    public Map<String, Object> dismiss(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> report = findOr404(id);
        if ("converted".equals(report.get("status"))) {
            throw new BusinessRuleException("A converted report cannot be dismissed.");
        }
        String reason = str(body.get("reason"));
        if (reason == null) {
            throw new BusinessRuleException("A dismissal reason is required.");
        }
        jdbc.update("""
                update public.public_hazard_reports set status = 'dismissed', reviewed_by = ?, reviewed_at = now(),
                    review_notes = ?, updated_at = now() where id = ?
                """, users.actingUserId(), reason, id);
        return Map.of("success", true, "message", "Report dismissed.");
    }

    /**
     * Convert a credible citizen report into a formal incident — the loop from public reporting
     * into the response workflow. The incident starts at 'Reported' for the normal approval chain.
     */
    @PostMapping("/{id}/convert")
    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @Transactional
    public Map<String, Object> convert(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> report = findOr404(id);
        if ("converted".equals(report.get("status"))) {
            throw new BusinessRuleException("This report has already been converted to incident #"
                    + report.get("linked_incident_id") + ".");
        }
        if ("dismissed".equals(report.get("status"))) {
            throw new BusinessRuleException("This report was dismissed and cannot be converted — re-review it first.");
        }
        // DDMC "approve presence": the converted incident enters the ladder at the DED stage (the DDMC has
        // confirmed it by converting). It needs a district to be scopable — taken from the report if tagged,
        // else assigned by the DDMC in the convert request.
        Long districtId = firstLong(report.get("district_id"), body == null ? null : body.get("district_id"));
        Long regionId = firstLong(report.get("region_id"), body == null ? null : body.get("region_id"));
        if (districtId == null) {
            throw new BusinessRuleException(
                    "Assign the incident's district before converting — the citizen report is not geo-tagged.");
        }
        String severity = body != null && body.get("severity_level") != null
                ? String.valueOf(body.get("severity_level")) : "Moderate";
        Long incidentTypeId = jdbc.query("""
                select id from public.incident_types where name ilike ? or ? ilike '%' || name || '%' limit 1
                """, rs -> rs.next() ? rs.getLong(1) : null,
                "%" + report.get("hazard_type") + "%", String.valueOf(report.get("hazard_type")));
        Long incidentId = jdbc.queryForObject("""
                insert into public.incidents(title, description, incident_type_id, severity_level, status,
                    workflow_status, origin_level, district_id, region_id, location_description, latitude, longitude,
                    reported_at, submitted_by_user_id, submitted_at, created_at, updated_at)
                values (?,?,?,?, 'Reported', 'waiting_ded', 'district', ?, ?, ?, ?, ?, now(), ?, now(), now(), now()) returning id
                """, Long.class,
                "Citizen report: " + report.get("hazard_type") + " at " + report.get("location_description"),
                "Converted from public hazard report " + report.get("report_code")
                        + " (reporter: " + report.get("reporter_name") + ")."
                        + (report.get("description") == null ? "" : " " + report.get("description")),
                incidentTypeId, severity, districtId, regionId, report.get("location_description"),
                report.get("latitude"), report.get("longitude"), users.actingUserId());
        users.logHistory(incidentId, "created", null, "waiting_ded",
                "Citizen report " + report.get("report_code") + " converted by DDMC — presence approved, escalated to DED.");
        jdbc.update("""
                update public.public_hazard_reports set status = 'converted', linked_incident_id = ?,
                    reviewed_by = ?, reviewed_at = now(), updated_at = now() where id = ?
                """, incidentId, users.actingUserId(), id);
        return Map.of("success", true, "incident_id", incidentId,
                "message", "Report confirmed — incident #" + incidentId + " enters the chain at the DED stage.");
    }

    // ── helpers ──

    private void requireNew(long id, String to) {
        Map<String, Object> report = findOr404(id);
        if ("converted".equals(report.get("status")) || "dismissed".equals(report.get("status"))) {
            throw new BusinessRuleException("This report is already " + report.get("status") + ".");
        }
    }

    private Map<String, Object> findOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.public_hazard_reports where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Report not found.");
        }
        // Mirror the list scope (appendAreaScopeSharedOrOwn): in-area officers may action their own reports
        // plus untagged (NULL area) ones; cross-area access 404s. National tier sees/acts on everything.
        areaGuard.assertOwnOrShared("public.public_hazard_reports", id);
        return rows.get(0);
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    /** First non-null of two values coerced to Long (report's own area, else the value supplied on convert). */
    private static Long firstLong(Object a, Object b) {
        Long x = toLong(a);
        return x != null ? x : toLong(b);
    }

    private static Long toLong(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.valueOf(String.valueOf(v).trim());
        } catch (NumberFormatException notNumeric) {
            return null;
        }
    }
}
