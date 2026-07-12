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
        // STRICT area scope for citizen reports: district/LGA sees only own district; region sees own region;
        // national sees all. Untagged (null area) reports stay national triage only — not every district queue.
        jurisdiction.appendAreaScope("r", where, params);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reports", jdbc.queryForList("""
                select r.id, r.report_code, r.hazard_type, r.description, r.location_description,
                       r.latitude, r.longitude, r.urgency_level, r.reporter_name, r.reporter_phone,
                       r.status, r.review_notes, r.linked_incident_id, r.created_at, r.reviewed_at,
                       coalesce(r.region_id, d.region_id) as region_id, r.district_id,
                       rg.name as region_name, d.name as district_name,
                       u.name as reviewed_by_name, i.title as linked_incident_title
                from public.public_hazard_reports r
                left join public.users u on u.id = r.reviewed_by
                left join public.incidents i on i.id = r.linked_incident_id
                left join public.districts d on d.id = r.district_id
                left join public.regions rg on rg.id = coalesce(r.region_id, d.region_id)
                where %s
                order by case r.status when 'new' then 0 when 'reviewing' then 1 else 2 end,
                         r.created_at desc limit 200
                """.formatted(where), params.toArray()));
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where r.status = 'new') as new_reports,
                       count(*) filter (where r.status = 'reviewing') as reviewing,
                       count(*) filter (where r.status = 'converted') as converted,
                       count(*) filter (where r.status = 'dismissed') as dismissed
                from public.public_hazard_reports r
                where %s
                """.formatted(where), params.toArray()));
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
        AreaSelection area = resolveConversionArea(report, body);
        Long districtId = area.districtId();
        Long regionId = area.regionId();
        String severity = body != null && body.get("severity_level") != null
                ? String.valueOf(body.get("severity_level")) : "Moderate";
        Long incidentTypeId = jdbc.query("""
                select id from public.incident_types where name ilike ? or ? ilike '%' || name || '%' limit 1
                """, rs -> rs.next() ? rs.getLong(1) : null,
                "%" + report.get("hazard_type") + "%", String.valueOf(report.get("hazard_type")));
        // The denormalized area names are resolved from the ids in hand — the RAS/DED queues, stage
        // notifications and the map's no-coordinates fallback all read district_name/region_name, so a
        // converted incident must carry them like an officer-created one does (null ids yield null names).
        Long incidentId = jdbc.queryForObject("""
                insert into public.incidents(title, description, incident_type_id, severity_level, status,
                    workflow_status, origin_level, district_id, region_id, district_name, region_name,
                    location_description, latitude, longitude,
                    reported_at, submitted_by_user_id, submitted_at, created_at, updated_at)
                values (?,?,?,?, 'Reported', 'waiting_ded', 'district', ?, ?,
                    (select name from public.districts where id = ?), (select name from public.regions where id = ?),
                    ?, ?, ?, now(), ?, now(), now(), now()) returning id
                """, Long.class,
                "Citizen report: " + report.get("hazard_type") + " at " + report.get("location_description"),
                "Converted from public hazard report " + report.get("report_code")
                        + " (reporter: " + report.get("reporter_name") + ")."
                        + (report.get("description") == null ? "" : " " + report.get("description")),
                incidentTypeId, severity, districtId, regionId, districtId, regionId,
                report.get("location_description"),
                report.get("latitude"), report.get("longitude"), users.actingUserId());
        users.logHistory(incidentId, "created", null, "waiting_ded",
                "Citizen report " + report.get("report_code") + " converted by DDMC — presence approved, escalated to DED.");
        jdbc.update("""
                update public.public_hazard_reports set status = 'converted', linked_incident_id = ?,
                    reviewed_by = ?, reviewed_at = now(), updated_at = now() where id = ?
                """, incidentId, users.actingUserId(), id);
        // Settle the chain: skip any unstaffed/auto tier (per System Settings) so the incident rests on a real
        // approver even in a district/region with no DED/coordinator — then the resting officers are notified.
        String resting = users.settleStage(incidentId, "waiting_ded");
        return Map.of("success", true, "incident_id", incidentId,
                "message", "Report confirmed — incident #" + incidentId + " is now in the response chain ("
                        + IncidentOptions.workflowStatusLabel(resting) + ").");
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
        // Mirror the list scope (strict appendAreaScope): only own district/region; national sees all.
        areaGuard.assertOwn("public.public_hazard_reports", id);
        return rows.get(0);
    }

    private AreaSelection resolveConversionArea(Map<String, Object> report, Map<String, Object> body) {
        Long districtId = firstLong(report.get("district_id"), body == null ? null : body.get("district_id"));
        Long postedRegionId = firstLong(report.get("region_id"), body == null ? null : body.get("region_id"));
        if (districtId == null) {
            throw new BusinessRuleException(
                    "Assign the incident's district before converting — the citizen report is not geo-tagged.");
        }
        List<Map<String, Object>> districtRows = jdbc.queryForList(
                "select region_id from public.districts where id = ?", districtId);
        if (districtRows.isEmpty()) {
            throw new BusinessRuleException("The selected district is invalid.");
        }
        Long regionId = toLong(districtRows.get(0).get("region_id"));
        if (postedRegionId != null && regionId != null && !postedRegionId.equals(regionId)) {
            throw new BusinessRuleException("The selected district does not belong to the selected region.");
        }
        if (regionId == null) {
            throw new BusinessRuleException("The selected district is not attached to a region.");
        }
        assertConversionTargetArea(regionId, districtId);
        return new AreaSelection(regionId, districtId);
    }

    private void assertConversionTargetArea(Long regionId, Long districtId) {
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        Map<String, Object> area = jurisdiction.currentArea();
        if (tier == JurisdictionScope.Tier.DISTRICT) {
            Long myDistrict = toLong(area.get("district_id"));
            if (myDistrict == null || !myDistrict.equals(districtId)) {
                throw new BusinessRuleException("You can only convert public reports into incidents for your own district.");
            }
        } else if (tier == JurisdictionScope.Tier.REGION) {
            Long myRegion = toLong(area.get("region_id"));
            if (myRegion == null || !myRegion.equals(regionId)) {
                throw new BusinessRuleException("You can only convert public reports into incidents for your own region.");
            }
        } else if (tier == JurisdictionScope.Tier.NONE) {
            throw new BusinessRuleException("Your account is not attached to an incident reporting area.");
        }
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

    private record AreaSelection(Long regionId, Long districtId) {}
}
