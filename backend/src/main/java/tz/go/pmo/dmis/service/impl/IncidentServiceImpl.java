package tz.go.pmo.dmis.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.geo.RegionCentroids;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.SecurityUtils;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.response.IncidentOptions;
import tz.go.pmo.dmis.response.IncidentWorkflowService;
import tz.go.pmo.dmis.service.IncidentService;

/**
 * Port of Admin\IncidentController (registry, full report form with photos/video,
 * situation updates) plus the workflow actions routes/response.php exposes.
 * Source gaps fixed and logged in issues/response.issues.md: escalate/verify/close
 * (bound to non-existent methods in the source) act on the operational status.
 * <p>Logic lives in service.impl (eGA); paths/JSON unchanged. Workflow via transitional
 * {@link IncidentWorkflowService}. Shares base path with ops-timeline controller.
 */
@Service
public class IncidentServiceImpl implements IncidentService {

    private static final Logger log = LoggerFactory.getLogger(IncidentServiceImpl.class);
    private static final DateTimeFormatter D_M_Y_HI =
            DateTimeFormatter.ofPattern("dd MMM uuuu, HH:mm", Locale.ENGLISH);
    private static final Set<String> ASSIGNABLE_INCIDENT_PERMISSIONS = Set.of(
            "incidents.view", "incidents.create", "incidents.update", "incidents.approve", "incidents.close");


    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService workflow;
    private final ObjectMapper objectMapper;
    private final Path storageRoot;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;
    private final RegionCentroids centroids;

    public IncidentServiceImpl(JdbcTemplate jdbc, IncidentWorkflowService workflow, ObjectMapper objectMapper,
                               JurisdictionScope jurisdiction, AreaGuard areaGuard, RegionCentroids centroids,
                               @Value("${dmis.storage.public-root:${user.dir}/storage/public}") String publicRoot) {
        this.jdbc = jdbc;
        this.workflow = workflow;
        this.objectMapper = objectMapper;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
        this.centroids = centroids;
        this.storageRoot = Path.of(publicRoot);
    }

    /**
     * Server-side jurisdiction visibility for the registry: national roles see every area, region roles only
     * their own region, district roles only their own district. Any other role (incl. an officer with no area
     * assigned) sees nothing — strict access control ("only the nation sees everywhere"). The local Super-Admin
     * persona (no header) carries the national roles, so it still sees all. Delegated to the shared
     * {@link JurisdictionScope} so every area-scoped registry behaves identically.
     */
    private void appendAreaScope(StringBuilder where, List<Object> params) {
        jurisdiction.appendAreaScopeWithCouncil("i", where, params);
    }

    // ─── Registry ───

    @Override
    public Map<String, Object> index(String statusFilter,
                                     Long hazardFilter,
                                     String workflowFilter,
                                     int page) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        // Treat all/any/* as unfiltered — a literal status match of "all" yields zero rows (non-productive).
        if (statusFilter != null && !statusFilter.isBlank()
                && !List.of("all", "any", "*").contains(statusFilter.trim().toLowerCase())) {
            where.append(" and i.status = ?");
            params.add(statusFilter);
        }
        if (hazardFilter != null) {
            where.append(" and i.hazard_id = ?");
            params.add(hazardFilter);
        }
        if (workflowFilter != null && !workflowFilter.isBlank()) {
            where.append(" and i.workflow_status = ?");
            params.add(workflowFilter);
        }
        appendAreaScope(where, params);   // jurisdiction visibility: national=all, region=own region, district=own district

        long total = jdbc.queryForObject("select count(*) from public.incidents i where " + where,
                Long.class, params.toArray());
        int perPage = 15;
        int lastPage = (int) Math.max(1, Math.ceil(total / (double) perPage));
        int currentPage = Math.min(Math.max(1, page), lastPage);
        int offset = (currentPage - 1) * perPage;

        params.add(perPage);
        params.add(offset);
        List<Map<String, Object>> rows = new ArrayList<>();
        // Operational-priority ordering (the source's CASE expression), then newest first.
        jdbc.query("""
                select i.id, i.title, i.status, i.workflow_status, i.severity_level, i.origin_level,
                    i.district_name, i.region_name, i.location_description, i.reported_at, i.latitude, i.longitude,
                    i.deaths_total, i.injured_total, i.missing_total, i.displaced, i.rollback_count,
                    i.last_rollback_at, i.last_rollback_by_role, i.is_simulation,
                    h.name as hazard_name, u.name as assigned_to_name,
                    (select count(*) from public.allocated_resources ar where ar.incident_id = i.id) as allocations_count,
                    (select count(*) from public.incident_tasks t where t.incident_id = i.id) as tasks_count,
                    exists(select 1 from public.response_activations ra where ra.incident_id = i.id and ra.status = 'active') as response_active
                from public.incidents i
                left join public.hazards h on h.id = i.hazard_id
                left join public.users u on u.id = i.assigned_to_user_id
                where %s
                order by %s asc, i.reported_at desc
                limit ? offset ?
                """.formatted(where, IncidentOptions.statusOrderCase().replace("CASE status", "CASE i.status")),
                rs -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("title", rs.getString("title"));
            m.put("status", rs.getString("status"));
            String wf = rs.getString("workflow_status");
            m.put("workflow_status", wf);
            m.put("workflow_status_label", IncidentOptions.workflowStatusLabel(wf));
            m.put("severity_level", rs.getString("severity_level"));
            m.put("origin_level", rs.getString("origin_level"));
            m.put("hazard_name", rs.getString("hazard_name"));
            m.put("district_name", rs.getString("district_name"));
            m.put("region_name", rs.getString("region_name"));
            m.put("location_description", rs.getString("location_description"));
            m.put("reported_at", formatTs(rs.getTimestamp("reported_at")));
            m.put("assigned_to_name", rs.getString("assigned_to_name"));
            m.put("deaths_total", rs.getInt("deaths_total"));
            m.put("injured_total", rs.getInt("injured_total"));
            m.put("missing_total", rs.getInt("missing_total"));
            m.put("displaced", rs.getInt("displaced"));
            int rbCount = rs.getInt("rollback_count");
            m.put("rollback_count", rbCount);
            m.put("returned", rbCount > 0);
            m.put("last_rollback_at", formatTs(rs.getTimestamp("last_rollback_at")));
            m.put("last_rollback_by_role", rs.getString("last_rollback_by_role"));
            m.put("allocations_count", rs.getLong("allocations_count"));
            m.put("tasks_count", rs.getLong("tasks_count"));
            m.put("response_active", rs.getBoolean("response_active"));
            rows.add(m);
        }, params.toArray());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", rows);
        out.put("currentPage", currentPage);
        out.put("lastPage", lastPage);
        out.put("total", total);
        out.put("firstItem", total == 0 ? null : offset + 1);
        out.put("lastItem", total == 0 ? null : offset + rows.size());
        return out;
    }

    /** Reference data for the registry filters and the report form. */
    @Override
    public Map<String, Object> formData() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("hazards", jdbc.queryForList("select id, name from public.hazards order by name"));
        out.put("incident_types", jdbc.queryForList("select id, name, default_severity from public.incident_types order by name"));
        out.put("regions", jdbc.queryForList("select id, name from public.regions order by name"));
        out.put("assignable_users", assignableUsers());
        out.put("severity_levels", IncidentOptions.SEVERITY_LEVELS);
        out.put("statuses", IncidentOptions.STATUSES);
        out.put("sources_of_report", IncidentOptions.SOURCES_OF_REPORT);
        out.put("update_types", IncidentOptions.UPDATE_TYPES);
        out.put("infrastructure_damage_options", IncidentOptions.INFRASTRUCTURE_DAMAGE);
        out.put("emergency_needs_options", IncidentOptions.EMERGENCY_NEEDS);
        out.put("workflow_statuses", IncidentOptions.WORKFLOW_STATUSES);
        out.put("assistant_director_roles", IncidentOptions.ASSISTANT_DIRECTOR_ROLES);
        return out;
    }

    // ─── Store / Update ───

    @Override
    @Transactional
    public Map<String, Object> store(Map<String, String> form,
            List<String> infrastructureDamage,
            List<String> emergencyNeeds,
            List<MultipartFile> photos,
            MultipartFile video) {
        Map<String, List<String>> errors = validate(form, infrastructureDamage, emergencyNeeds, photos, video);
        if (!errors.isEmpty()) {
            return Map.of("success", false, "message", "Validation failed.", "errors", errors);
        }

        Long regionId = parseOptionalId(errors, form, "region_id", "region");
        Long districtId = parseOptionalId(errors, form, "district_id", "district");
        Long councilId = parseOptionalId(errors, form, "council_id", "council/LGA");
        // Council/LGA is the most precise selected area; derive its parent district and region so the incident
        // routes to the correct DDMC/DED and regional stages. District-only legacy records keep district scope.
        TargetArea target = normalizeTargetArea(errors, regionId, districtId, councilId);
        regionId = target.regionId();
        districtId = target.districtId();
        councilId = target.councilId();
        validateTargetArea(errors, regionId, districtId, councilId);
        Long assignedToUserId = parseOptionalId(errors, form, "assigned_to_user_id", "assignee");
        validateAssignableUser(errors, assignedToUserId);
        if (!errors.isEmpty()) {
            return Map.of("success", false, "message", "Validation failed.", "errors", errors);
        }

        List<String> photoPaths = storePhotos(photos);
        String videoPath = storeVideo(video);

        // The form selects region/district by ID and posts no *_name — resolve the names so district-scoped
        // readiness and the incident situation map work for form-created incidents (not just seeded ones).
        String regionName = coalesceName(trim(form.get("region_name")), "regions", regionId);
        String districtName = coalesceName(trim(form.get("district_name")), "districts", districtId);
        Long id = jdbc.queryForObject("""
                insert into public.incidents(title, hazard_id, incident_type_id, location_description,
                    district_name, region_name, region_id, district_id, latitude, longitude, reported_at,
                    description, severity_level, status, workflow_status, origin_level,
                    reported_by_name, reported_by_contact, source_of_report, assigned_to_user_id,
                    photo_paths, photo_path, video_path,
                    deaths_male, deaths_female, deaths_total, injured_male, injured_female, injured_total,
                    missing_male, missing_female, missing_total, displaced, people_with_disabilities,
                    pregnant_affected, children_affected, infrastructure_damage, emergency_needs,
                    emergency_needs_other, action_taken, created_at, updated_at)
                values (?,?,?,?,?,?,?,?,?,?,?::timestamptz,?,?,?,'draft',?,?,?,?,?,?::json,?,?,
                        ?,?,?,?,?,?,?,?,?,?,?,?,?,?::json,?::json,?,?,now(),now())
                returning id
                """, Long.class,
                form.get("title"), parseLong(form.get("hazard_id")), parseLong(form.get("incident_type_id")),
                form.get("location_description"), districtName, regionName,
                regionId, districtId, parseDouble(form.get("latitude")), parseDouble(form.get("longitude")),
                form.get("reported_at"), trim(form.get("description")), form.get("severity_level"), form.get("status"),
                form.getOrDefault("origin_level", "district"),
                trim(form.get("reported_by_name")), trim(form.get("reported_by_contact")),
                trim(form.get("source_of_report")), assignedToUserId,
                toJson(photoPaths), photoPaths.isEmpty() ? null : photoPaths.get(0), videoPath,
                intOr0(form.get("deaths_male")), intOr0(form.get("deaths_female")), intOr0(form.get("deaths_total")),
                intOr0(form.get("injured_male")), intOr0(form.get("injured_female")), intOr0(form.get("injured_total")),
                intOr0(form.get("missing_male")), intOr0(form.get("missing_female")), intOr0(form.get("missing_total")),
                intOr0(form.get("displaced")), intOr0(form.get("people_with_disabilities")),
                intOr0(form.get("pregnant_affected")), intOr0(form.get("children_affected")),
                toJson(infrastructureDamage), toJson(emergencyNeeds),
                trim(form.get("emergency_needs_other")), trim(form.get("action_taken")));

        jdbc.update("update public.incidents set people_affected = ?, occurred_at = nullif(?,'')::timestamptz, "
                + "ended_at = nullif(?,'')::timestamptz, council_id = ?, ward_id = ? where id = ?",
                parseLong(form.get("people_affected")), form.get("occurred_at"), form.get("ended_at"),
                councilId, parseLong(form.get("ward_id")), id);
        workflow.logHistory(id, "created", null, "draft", "Incident reported");
        return Map.of("success", true, "message", "Incident logged successfully.", "id", id);
    }

    @Override
    @Transactional
    public Map<String, Object> update(long id,
            Map<String, String> form,
            List<String> infrastructureDamage,
            List<String> emergencyNeeds,
            List<String> removePhotos,
            List<MultipartFile> photos,
            MultipartFile video) {
        Map<String, Object> incident = workflow.findOr404(id);
        areaGuard.assertOwn("public.incidents", id);   // an area officer may edit only an incident in their own area
        Map<String, List<String>> errors = validate(form, infrastructureDamage, emergencyNeeds, photos, video);
        if (!errors.isEmpty()) {
            return Map.of("success", false, "message", "Validation failed.", "errors", errors);
        }
        Long updDistrictId = parseOptionalId(errors, form, "district_id", "district");
        Long updCouncilId = parseOptionalId(errors, form, "council_id", "council/LGA");
        TargetArea target = normalizeTargetArea(errors, parseOptionalId(errors, form, "region_id", "region"), updDistrictId, updCouncilId);
        Long updRegionId = target.regionId();
        updDistrictId = target.districtId();
        updCouncilId = target.councilId();
        validateTargetArea(errors, updRegionId, updDistrictId, updCouncilId);
        Long assignedToUserId = parseOptionalId(errors, form, "assigned_to_user_id", "assignee");
        validateAssignableUser(errors, assignedToUserId);
        if (!errors.isEmpty()) {
            return Map.of("success", false, "message", "Validation failed.", "errors", errors);
        }

        // Photo set = (existing − removed) + newly uploaded, as in the source update()
        List<String> existing = parseJsonList(incident.get("photo_paths"));
        if (removePhotos != null) {
            existing.removeAll(removePhotos);
        }
        existing.addAll(storePhotos(photos));

        String videoPath = (String) incident.get("video_path");
        if (video != null && !video.isEmpty()) {
            videoPath = storeVideo(video);
        } else if ("1".equals(form.get("remove_video")) || "true".equals(form.get("remove_video"))) {
            videoPath = null;
        }

        // Keep region authoritative from the district on edit too (see create) so the chain never mis-routes.
        jdbc.update("""
                update public.incidents set title = ?, hazard_id = ?, incident_type_id = ?,
                    location_description = ?, district_name = ?, region_name = ?, region_id = ?, district_id = ?,
                    latitude = ?, longitude = ?, reported_at = ?::timestamptz, description = ?,
                    severity_level = ?, status = ?, reported_by_name = ?, reported_by_contact = ?,
                    source_of_report = ?, assigned_to_user_id = ?,
                    photo_paths = ?::json, photo_path = ?, video_path = ?,
                    deaths_male = ?, deaths_female = ?, deaths_total = ?,
                    injured_male = ?, injured_female = ?, injured_total = ?,
                    missing_male = ?, missing_female = ?, missing_total = ?,
                    displaced = ?, people_with_disabilities = ?, pregnant_affected = ?, children_affected = ?,
                    infrastructure_damage = ?::json, emergency_needs = ?::json, emergency_needs_other = ?,
                    action_taken = ?, updated_at = now()
                where id = ?
                """,
                form.get("title"), parseLong(form.get("hazard_id")), parseLong(form.get("incident_type_id")),
                form.get("location_description"),
                coalesceName(trim(form.get("district_name")), "districts", updDistrictId),
                coalesceName(trim(form.get("region_name")), "regions", updRegionId),
                updRegionId, updDistrictId,
                parseDouble(form.get("latitude")), parseDouble(form.get("longitude")),
                form.get("reported_at"), trim(form.get("description")), form.get("severity_level"), form.get("status"),
                trim(form.get("reported_by_name")), trim(form.get("reported_by_contact")),
                trim(form.get("source_of_report")), assignedToUserId,
                toJson(existing), existing.isEmpty() ? null : existing.get(0), videoPath,
                intOr0(form.get("deaths_male")), intOr0(form.get("deaths_female")), intOr0(form.get("deaths_total")),
                intOr0(form.get("injured_male")), intOr0(form.get("injured_female")), intOr0(form.get("injured_total")),
                intOr0(form.get("missing_male")), intOr0(form.get("missing_female")), intOr0(form.get("missing_total")),
                intOr0(form.get("displaced")), intOr0(form.get("people_with_disabilities")),
                intOr0(form.get("pregnant_affected")), intOr0(form.get("children_affected")),
                toJson(infrastructureDamage), toJson(emergencyNeeds), trim(form.get("emergency_needs_other")),
                trim(form.get("action_taken")), id);
        jdbc.update("update public.incidents set people_affected = ?, occurred_at = nullif(?,'')::timestamptz, "
                + "ended_at = nullif(?,'')::timestamptz, council_id = ?, ward_id = ? where id = ?",
                parseLong(form.get("people_affected")), form.get("occurred_at"), form.get("ended_at"),
                updCouncilId, parseLong(form.get("ward_id")), id);
        workflow.logHistory(id, "edited", (String) incident.get("workflow_status"),
                (String) incident.get("workflow_status"), "Incident details updated");
        return Map.of("success", true, "message", "Incident updated successfully.");
    }

    // ─── Show hub ───

    @Override
    public Map<String, Object> show(long id) {
        workflow.findOr404(id);
        // Jurisdiction visibility: an area officer may open ONLY an incident in their own district/region
        // (or a shared/national one); national tier sees all. Mirrors the list scope so two districts never
        // see each other's incidents. Out of area → 404 (indistinguishable from "not found").
        StringBuilder where = new StringBuilder("i.id = ?");
        List<Object> params = new ArrayList<>();
        params.add(id);
        appendAreaScope(where, params);
        List<Map<String, Object>> found = jdbc.queryForList("""
                select i.*, h.name as hazard_name, it.name as incident_type_name,
                    au.name as assigned_to_name, su.name as submitted_by_name,
                    du.name as das_reviewed_by_name, ru.name as ras_reviewed_by_name,
                    nu.name as national_reviewed_by_name, adu.name as assistant_director_reviewed_by_name,
                    dru.name as director_reviewed_by_name,
                    cc.name as council_name, wd.name as ward_name
                from public.incidents i
                left join public.councils cc on cc.id = i.council_id
                left join public.wards wd on wd.id = i.ward_id
                left join public.hazards h on h.id = i.hazard_id
                left join public.incident_types it on it.id = i.incident_type_id
                left join public.users au on au.id = i.assigned_to_user_id
                left join public.users su on su.id = i.submitted_by_user_id
                left join public.users du on du.id = i.das_reviewed_by_user_id
                left join public.users ru on ru.id = i.ras_reviewed_by_user_id
                left join public.users nu on nu.id = i.national_reviewed_by_user_id
                left join public.users adu on adu.id = i.assistant_director_reviewed_by_user_id
                left join public.users dru on dru.id = i.director_reviewed_by_user_id
                """ + " where " + where, params.toArray());
        if (found.isEmpty()) {
            throw new ResourceNotFoundException("Incident not found.");
        }
        Map<String, Object> incident = found.get(0);
        decorate(incident);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("incident", incident);
        out.put("updates", listUpdates(id));
        out.put("workflow_histories", listWorkflowHistories(id));
        out.put("tasks", jdbc.queryForList("""
                select t.id, t.title, t.priority, t.status, t.progress_percent, t.due_date,
                    u.name as assigned_to_name
                from public.incident_tasks t left join public.users u on u.id = t.assigned_to_user_id
                where t.incident_id = ? order by t.id
                """, id));
        out.put("allocations", jdbc.queryForList("""
                select ar.id, ar.quantity_requested, ar.quantity_allocated, ar.unit_of_measure, ar.status,
                    ar.allocation_date, r.name as resource_name
                from public.allocated_resources ar join public.resources r on r.id = ar.resource_id
                where ar.incident_id = ? order by ar.id
                """, id));
        out.put("history_reports", jdbc.queryForList("""
                select hr.*, u.name as reported_by_name from public.incident_history_reports hr
                left join public.users u on u.id = hr.user_id
                where hr.incident_id = ? order by hr.created_at desc
                """, id));
        out.put("response_activation", firstOrNull(jdbc.queryForList(
                "select * from public.response_activations where incident_id = ?", id)));
        out.put("forecast", forecastCoverage(incident));
        return out;
    }

    // ─── Forecast coverage (audit F03: per-incident "was this forecast?") ───

    /**
     * Answers "was this incident forecast?" against the issued-warning corpus, mirroring the
     * EW-management report's matching semantics (EwManagementController): same warned AREA
     * (a district-level warning row must match the incident's district; region-level rows fall
     * back to region) AND reported_at inside the warning's
     * validity window with a 48-hour tail. On top of that a hazard-compatibility guard (audit
     * F11): exact hazard_id match or same related-hazard family (rainfall→floods etc.) — a
     * Drought warning must not claim a Cholera incident. Best match = highest warning level,
     * then earliest validity start. Read-only; the block is always present so the UI can render
     * the badge either way.
     */
    private Map<String, Object> forecastCoverage(Map<String, Object> incident) {
        Map<String, Object> f = new LinkedHashMap<>();
        f.put("covered", false);
        f.put("warning_code", null);
        f.put("warning_level", null);
        f.put("hazard", null);
        f.put("lead_hours", null);
        f.put("validity_start", null);
        Object reportedAt = incident.get("reported_at");
        if (reportedAt == null || (incident.get("region_id") == null && incident.get("district_id") == null)) {
            return f;
        }
        List<Map<String, Object>> candidates;
        try {
            candidates = jdbc.queryForList("""
                    select w.warning_code, wh.warning_level, wh.hazard_id, h.name as hazard, wh.validity_start,
                           round(extract(epoch from (?::timestamptz - wh.validity_start)) / 3600)::bigint as lead_hours
                    from public.warning_hazards wh
                    join public.warnings w on w.id = wh.warning_id and w.deleted_at is null
                         and lower(w.status) in ('approved','published')
                    left join public.hazards h on h.id = wh.hazard_id
                    where wh.deleted_at is null
                      and ?::timestamptz >= wh.validity_start
                      and ?::timestamptz < wh.validity_end + interval '48 hours'
                      and ( (wh.district_id is not null and wh.district_id = cast(? as bigint))
                            or (wh.district_id is null and wh.region_id = cast(? as bigint)) )
                    order by case wh.warning_level when 'Major Warning' then 0 when 'Warning' then 1
                                  when 'Advisory' then 2 else 3 end,
                             wh.validity_start
                    """,
                    reportedAt, reportedAt, reportedAt,
                    incident.get("district_id"), incident.get("region_id"));
        } catch (Exception e) {
            // The badge is advisory context — never let it break the incident page itself.
            log.warn("forecast-coverage lookup failed for incident {}: {}", incident.get("id"), e.getMessage());
            return f;
        }
        Long incHazardId = incident.get("hazard_id") instanceof Number n ? n.longValue() : null;
        String incHazardName = str(incident.get("hazard_name"));
        for (Map<String, Object> c : candidates) {
            Long whHazardId = c.get("hazard_id") instanceof Number n ? n.longValue() : null;
            if (!hazardCompatible(whHazardId, str(c.get("hazard")), incHazardId, incHazardName)) {
                continue;
            }
            f.put("covered", true);
            f.put("warning_code", c.get("warning_code"));
            f.put("warning_level", c.get("warning_level"));
            f.put("hazard", c.get("hazard"));
            Object lead = c.get("lead_hours");
            f.put("lead_hours", lead instanceof Number n && n.longValue() > 0 ? n.longValue() : null);
            f.put("validity_start", c.get("validity_start"));
            break;
        }
        return f;
    }

    /** Exact hazard match or same related-hazard family; a missing hazard on either side never blocks. */
    private static boolean hazardCompatible(Long warnHazardId, String warnHazard, Long incHazardId, String incHazard) {
        if (warnHazardId == null || incHazardId == null) {
            return true; // nothing to contradict — falls back to area+time, like the aggregate report
        }
        if (warnHazardId.equals(incHazardId)) {
            return true;
        }
        String wf = hazardFamily(warnHazard);
        return wf != null && wf.equals(hazardFamily(incHazard));
    }

    /** Small related-hazard family map (kin to AnticipatoryPlanController.matchingPlans' keyword logic). */
    private static String hazardFamily(String name) {
        String h = name == null ? "" : name.toLowerCase(Locale.ROOT);
        if (h.contains("flood") || h.contains("rain") || h.contains("cyclone") || h.contains("storm")
                || h.contains("wind") || h.contains("lightning") || h.contains("landslide")) {
            return "storm_water"; // rainfall-driven family: rainfall→floods/landslides, cyclone→storm winds
        }
        if (h.contains("drought") || h.contains("heat")) {
            return "drought_heat";
        }
        if (h.contains("fire")) {
            return "fire";
        }
        if (h.contains("epidemic") || h.contains("disease") || h.contains("outbreak") || h.contains("cholera")) {
            return "health";
        }
        if (h.contains("earthquake") || h.contains("tsunami") || h.contains("volcan")) {
            return "geo";
        }
        return null; // unknown → exact-id match only
    }

    // ─── Situation updates ───

    @Override
    @Transactional
    public Map<String, Object> storeUpdate(long id, Map<String, Object> body) {
        workflow.findOr404(id);
        areaGuard.assertOwn("public.incidents", id);   // only an in-area officer may log updates on this incident
        String details = strOf(body.get("update_details"));
        String type = strOf(body.get("update_type"));
        Map<String, List<String>> errors = new LinkedHashMap<>();
        if (details == null) {
            errors.put("update_details", List.of("The update details field is required."));
        } else if (details.length() > 5000) {
            errors.put("update_details", List.of("The update details must not be greater than 5000 characters."));
        }
        if (type != null && !IncidentOptions.UPDATE_TYPES.contains(type)) {
            errors.put("update_type", List.of("The selected update type is invalid."));
        }
        if (!errors.isEmpty()) {
            return Map.of("success", false, "message", "Validation failed.", "errors", errors);
        }
        jdbc.update("""
                insert into public.incident_updates(incident_id, user_id, update_details, update_type, created_at, updated_at)
                values (?,?,?,?,now(),now())
                """, id, workflow.actingUserId(), details, type);
        return Map.of("success", true, "message", "Incident update logged successfully.");
    }

    // ─── Workflow actions ───

    @Override
    public Map<String, Object> submit(long id, Map<String, Object> body) {
        String to = workflow.submit(id, comment(body));
        return Map.of("success", true, "message", "Incident submitted for approval.", "workflow_status", to);
    }

    @Override
    public Map<String, Object> approve(long id, Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String to = workflow.approve(id, strOf(b.get("comments")), strOf(b.get("recommendation")));
        return Map.of("success", true,
                "message", "approved".equals(to) ? "Incident approved." : "Approved and forwarded to the next level.",
                "workflow_status", to);
    }

    @Override
    public Map<String, Object> rollback(long id, Map<String, Object> body) {
        String to = workflow.rollback(id, strOf(body.get("comments")), strOf(body.get("by_role")));
        return Map.of("success", true, "message", "Incident rolled back for corrections.", "workflow_status", to);
    }

    @Override
    public Map<String, Object> resubmit(long id, Map<String, Object> body) {
        String to = workflow.resubmit(id, comment(body));
        return Map.of("success", true, "message", "Incident resubmitted after corrections.", "workflow_status", to);
    }

    @Override
    public Map<String, Object> forward(long id, Map<String, Object> body) {
        String to = workflow.forward(id, strOf(body.get("to_role")), strOf(body.get("recommendation")));
        return Map.of("success", true, "message", "Incident forwarded.", "workflow_status", to);
    }

    /** Advisory/comment-only path for DC/RC/planning viewers and approvers; does not mutate incident fields. */
    @Override
    @Transactional
    public Map<String, Object> addComment(long id, Map<String, Object> body) {
        Map<String, Object> incident = workflow.findOr404(id);
        areaGuard.assertOwn("public.incidents", id);   // comment visibility follows the same district/region boundary
        String text = comment(body);
        if (text == null || text.isBlank()) {
            throw new BusinessRuleException("Comments are required.");
        }
        String status = str(incident.get("workflow_status"));
        workflow.logHistory(id, "commented", status, status, text.trim());
        return Map.of("success", true, "message", "Comment recorded.");
    }

    // Operational actions bound by routes/response.php to methods missing in the source

    @Override
    public Map<String, Object> escalate(long id, Map<String, Object> body) {
        areaGuard.assertOwn("public.incidents", id);   // only an in-area officer may escalate this incident
        workflow.setOperationalStatus(id, "Escalated", comment(body));
        return Map.of("success", true, "message", "Incident escalated.");
    }

    @Override
    public Map<String, Object> verify(long id, Map<String, Object> body) {
        areaGuard.assertOwn("public.incidents", id);   // only an in-area officer may verify this incident
        workflow.setOperationalStatus(id, "Verified", comment(body));
        return Map.of("success", true, "message", "Incident verified.");
    }

    @Override
    public Map<String, Object> close(long id, Map<String, Object> body) {
        areaGuard.assertOwn("public.incidents", id);   // only an in-area officer may close this incident
        workflow.setOperationalStatus(id, "Closed", comment(body));
        return Map.of("success", true, "message", "Incident closed.");
    }

    /** DDMC gatekeeper: close an entry-stage incident as a rumour/normal case and inform DED + DAS. */
    @Override
    public Map<String, Object> closeRumor(long id, Map<String, Object> body) {
        workflow.closeAsRumor(id, comment(body));
        return Map.of("success", true, "message", "Closed as rumour / normal case; district leadership (DED, DAS) informed.");
    }

    /** DED (district) / RAS (region) resolve the incident locally when resources sufficed — instead of escalating. */
    @Override
    public Map<String, Object> resolve(long id, Map<String, Object> body) {
        String to = workflow.resolve(id, comment(body));
        return Map.of("success", true, "message", "Incident resolved locally; the levels above were informed.", "workflow_status", to);
    }

    // ─── Public surfaces: publish/unpublish the incident to the citizen portal (live map + news/event) ───

    /** Pin (or unpin, {@code value:false}) the incident on the public portal map. The map marker opens the
     *  live snapshot at {@code GET /v1/portal/incidents/{id}} (situation + response + resources). */
    @Override
    @Transactional
    public Map<String, Object> pushMap(long id, Map<String, Object> body) {
        workflow.findOr404(id);
        areaGuard.assertOwn("public.incidents", id);   // publish is national-tier work; an area-scoped grant reaches only own-area incidents
        boolean on = body == null || body.get("value") == null || Boolean.parseBoolean(String.valueOf(body.get("value")));
        if (on) {
            Map<String, Object> loc = jdbc.queryForMap(
                    "select latitude, longitude, region_name, workflow_status, is_simulation from public.incidents where id = ?", id);
            // A drill NEVER reaches the public — no override exists for this (a citizen cannot tell an
            // exercise from a real emergency, so exercises stay internal by doctrine).
            if (Boolean.TRUE.equals(loc.get("is_simulation"))) {
                return Map.of("success", false, "show_on_portal_map", false,
                        "message", "This is a SIMULATION drill — exercises are never shown to the public.");
            }
            // An unverified draft is held back by default so junk/unconfirmed reports don't slip onto the public
            // map — BUT PMO may deliberately push at any level via override (e.g. to warn the public early). The
            // map shows the incident's live verification + response status so citizens see it is still unverified,
            // and it updates as the incident moves through its flow.
            if ("draft".equals(str(loc.get("workflow_status")))) {
                boolean override = body != null && Boolean.parseBoolean(String.valueOf(body.get("override")));
                if (!override) {
                    return Map.of("success", false, "show_on_portal_map", false, "needs_override", true,
                            "message", "This incident isn't verified yet (still a draft). PMO can show it on the public "
                                    + "map anyway using override — its live status is shown so the public sees it is "
                                    + "still being verified.");
                }
            }
            // The public map only plots incidents that HAVE coordinates. If this one has none, fall back to its
            // region centroid; if it has no region either, tell the operator honestly instead of a silent no-op.
            if (loc.get("latitude") == null) {
                double[] c = centroids.forRegion(str(loc.get("region_name")));
                if (c == null) {
                    return Map.of("success", false, "show_on_portal_map", false,
                            "message", "This incident has no map location — add coordinates (or a region) on the "
                                    + "incident first, then push to map.");
                }
                jdbc.update("update public.incidents set latitude = ?, longitude = ? where id = ? and latitude is null",
                        c[0], c[1], id);
            }
        }
        jdbc.update("update public.incidents set show_on_portal_map = ?, "
                + "pushed_to_map_at = case when ? then now() else pushed_to_map_at end, updated_at = now() where id = ?",
                on, on, id);
        return Map.of("success", true, "show_on_portal_map", on);
    }

    /** Publish (or re-publish) the incident as a portal News & Events item linking to its live snapshot.
     *  Idempotent: re-pushing updates the same article rather than creating a duplicate. */
    @Override
    @Transactional
    public Map<String, Object> pushNews(long id) {
        workflow.findOr404(id);
        areaGuard.assertOwn("public.incidents", id);   // publish is national-tier work; an area-scoped grant reaches only own-area incidents
        Map<String, Object> i = jdbc.queryForMap("select id, title, severity_level, region_name, district_name, "
                + "description, portal_news_id, is_simulation from public.incidents where id = ?", id);
        if (Boolean.TRUE.equals(i.get("is_simulation"))) {
            throw new BusinessRuleException("This is a SIMULATION drill — exercises are never published to the public portal.");
        }
        String title = firstNonBlank(str(i.get("title")), "Incident #" + id);
        String area = firstNonBlank(str(i.get("region_name")), str(i.get("district_name")), "Tanzania");
        String desc = firstNonBlank(str(i.get("description")), title);
        String excerpt = clip(desc, 480);
        String bodyHtml = "<p>" + esc(desc) + "</p>"
                + "<p><strong>Area:</strong> " + esc(area) + " &nbsp; <strong>Severity:</strong> " + esc(str(i.get("severity_level"))) + "</p>"
                + "<p><a href=\"/incident/" + id + "\">View the live incident status, response and resources →</a></p>";
        Long existing = i.get("portal_news_id") == null ? null : ((Number) i.get("portal_news_id")).longValue();
        if (existing != null) {
            jdbc.update("update public.portal_news set title=?, excerpt=?, body=?, category='event', "
                    + "published_at=now(), is_active=true, updated_at=now() where id=?", title, excerpt, bodyHtml, existing);
            jdbc.update("update public.incidents set pushed_to_news_at=now(), updated_at=now() where id=?", id);
            String slug = jdbc.queryForObject("select slug from public.portal_news where id=?", String.class, existing);
            return Map.of("success", true, "news_id", existing, "slug", slug == null ? "" : slug);
        }
        String slug = slugify(title) + "-" + id;
        // A prior remove-news deactivates the article but keeps its row (and slug); on re-push reactivate &
        // refresh that same row instead of inserting a duplicate slug (which would hit the unique constraint).
        Long bySlug = jdbc.query("select id from public.portal_news where slug = ?",
                rs -> rs.next() ? rs.getLong(1) : null, slug);
        Long newsId;
        if (bySlug != null) {
            jdbc.update("update public.portal_news set title=?, excerpt=?, body=?, category='event', "
                    + "published_at=now(), is_active=true, updated_at=now() where id=?", title, excerpt, bodyHtml, bySlug);
            newsId = bySlug;
        } else {
            newsId = jdbc.queryForObject("insert into public.portal_news"
                    + "(title,slug,excerpt,body,category,published_at,is_active,created_at,updated_at) "
                    + "values (?,?,?,?, 'event', now(), true, now(), now()) returning id",
                    Long.class, title, slug, excerpt, bodyHtml);
        }
        jdbc.update("update public.incidents set portal_news_id=?, pushed_to_news_at=now(), updated_at=now() where id=?", newsId, id);
        return Map.of("success", true, "news_id", newsId, "slug", slug);
    }

    /** Remove the incident's News & Events item (deactivates the article + clears the link). */
    @Override
    @Transactional
    public Map<String, Object> removeNews(long id) {
        workflow.findOr404(id);
        areaGuard.assertOwn("public.incidents", id);   // publish is national-tier work; an area-scoped grant reaches only own-area incidents
        Map<String, Object> i = jdbc.queryForMap("select portal_news_id from public.incidents where id = ?", id);
        Long newsId = i.get("portal_news_id") == null ? null : ((Number) i.get("portal_news_id")).longValue();
        if (newsId != null) {
            jdbc.update("update public.portal_news set is_active=false, updated_at=now() where id=?", newsId);
        }
        jdbc.update("update public.incidents set portal_news_id=null, pushed_to_news_at=null, updated_at=now() where id=?", id);
        return Map.of("success", true);
    }

    private static String str(Object o) { return o == null ? null : String.valueOf(o); }
    private static String firstNonBlank(String... xs) {
        for (String x : xs) { if (x != null && !x.isBlank()) return x; }
        return null;
    }
    private static String clip(String s, int n) { return s == null ? null : (s.length() > n ? s.substring(0, n) : s); }
    private static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
    private static String slugify(String s) {
        String base = (s == null ? "incident" : s).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return base.isBlank() ? "incident" : base;
    }

    // ─── History reports (periodic situation figures) ───

    @Override
    @Transactional
    public Map<String, Object> storeHistoryReport(long id, Map<String, Object> body) {
        workflow.findOr404(id);
        areaGuard.assertOwn("public.incidents", id);   // only an in-area officer may write a situation report on this incident
        jdbc.update("""
                insert into public.incident_history_reports(incident_id, user_id,
                    deaths_male, deaths_female, deaths_total, injured_male, injured_female, injured_total,
                    missing_male, missing_female, missing_total, displaced, people_with_disabilities,
                    pregnant_affected, children_affected, government_property_loss, private_property_loss,
                    services_unavailable, remarks, created_at, updated_at)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?::json,?,now(),now())
                """, id, workflow.actingUserId(),
                numOf(body, "deaths_male"), numOf(body, "deaths_female"), numOf(body, "deaths_total"),
                numOf(body, "injured_male"), numOf(body, "injured_female"), numOf(body, "injured_total"),
                numOf(body, "missing_male"), numOf(body, "missing_female"), numOf(body, "missing_total"),
                numOf(body, "displaced"), numOf(body, "people_with_disabilities"),
                numOf(body, "pregnant_affected"), numOf(body, "children_affected"),
                Boolean.TRUE.equals(body.get("government_property_loss")),
                Boolean.TRUE.equals(body.get("private_property_loss")),
                toJson(body.get("services_unavailable")), strOf(body.get("remarks")));
        return Map.of("success", true, "message", "Situation report recorded.");
    }

    // ─── helpers ───

    private Map<String, List<String>> validate(Map<String, String> form, List<String> infrastructureDamage,
                                               List<String> emergencyNeeds, List<MultipartFile> photos,
                                               MultipartFile video) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        if (isBlank(form.get("title"))) {
            add(errors, "title", "The title field is required.");
        }
        Long hazardId = parseLong(form.get("hazard_id"));
        if (hazardId == null) {
            add(errors, "hazard_id", "The hazard id field is required.");
        } else if (count("hazards", hazardId) == 0) {
            add(errors, "hazard_id", "The selected hazard id is invalid.");
        }
        if (isBlank(form.get("location_description"))) {
            add(errors, "location_description", "The location description field is required.");
        }
        if (isBlank(form.get("reported_at"))) {
            add(errors, "reported_at", "The reported at field is required.");
        } else {
            try {
                LocalDateTime parsed = LocalDateTime.parse(form.get("reported_at"));
                if (parsed.toLocalDate().isAfter(java.time.LocalDate.now())) {
                    add(errors, "reported_at", "The reported at must not be a future date.");
                }
            } catch (Exception e) {
                add(errors, "reported_at", "The reported at does not match the format Y-m-d\\TH:i.");
            }
        }
        if (isBlank(form.get("severity_level"))) {
            add(errors, "severity_level", "The severity level field is required.");
        } else if (!IncidentOptions.SEVERITY_LEVELS.contains(form.get("severity_level"))) {
            add(errors, "severity_level", "The selected severity level is invalid.");
        }
        if (isBlank(form.get("status"))) {
            add(errors, "status", "The status field is required.");
        } else if (!IncidentOptions.STATUSES.contains(form.get("status"))) {
            add(errors, "status", "The selected status is invalid.");
        }
        String source = trim(form.get("source_of_report"));
        if (source != null && !IncidentOptions.SOURCES_OF_REPORT.contains(source)) {
            add(errors, "source_of_report", "The selected source of report is invalid.");
        }
        if (infrastructureDamage != null) {
            for (String key : infrastructureDamage) {
                if (!IncidentOptions.INFRASTRUCTURE_DAMAGE.containsKey(key)) {
                    add(errors, "infrastructure_damage", "The selected infrastructure damage is invalid.");
                    break;
                }
            }
        }
        if (emergencyNeeds != null) {
            for (String key : emergencyNeeds) {
                if (!IncidentOptions.EMERGENCY_NEEDS.containsKey(key)) {
                    add(errors, "emergency_needs", "The selected emergency needs is invalid.");
                    break;
                }
            }
        }
        if (photos != null && photos.size() > 10) {
            add(errors, "photos", "The photos must not have more than 10 items.");
        }
        if (photos != null) {
            for (MultipartFile photo : photos) {
                if (photo.getSize() > 5L * 1024 * 1024) {
                    add(errors, "photos", "Each photo must not be greater than 5120 kilobytes.");
                    break;
                }
            }
        }
        if (video != null && !video.isEmpty() && video.getSize() > 50L * 1024 * 1024) {
            add(errors, "video", "The video must not be greater than 51200 kilobytes.");
        }
        Long peopleAffected = parseLong(form.get("people_affected"));
        if (peopleAffected != null && peopleAffected > 0) {
            int maxSubset = Math.max(intOr0(form.get("deaths_total")), Math.max(intOr0(form.get("injured_total")),
                    Math.max(intOr0(form.get("missing_total")), Math.max(intOr0(form.get("displaced")),
                    Math.max(intOr0(form.get("children_affected")), Math.max(intOr0(form.get("people_with_disabilities")),
                    intOr0(form.get("pregnant_affected"))))))));
            if (maxSubset > peopleAffected) {
                add(errors, "people_affected",
                    "People affected must be at least as large as each impact subset (deaths, injured, missing, displaced, children, disabilities, pregnant).");
            }
        }
        return errors;
    }

    private List<Map<String, Object>> assignableUsers() {
        String placeholders = String.join(",", Collections.nCopies(ASSIGNABLE_INCIDENT_PERMISSIONS.size(), "?"));
        StringBuilder sql = new StringBuilder("""
                select distinct u.id, u.name
                from public.users u
                where u.name is not null
                  and u.stakeholder_id is null
                  and exists (
                    select 1
                    from public.model_has_roles mhr
                    join public.role_has_permissions rhp on rhp.role_id = mhr.role_id
                    join public.permissions p on p.id = rhp.permission_id
                    where mhr.model_id = u.id and p.name in (%s)
                  )
                """.formatted(placeholders));
        List<Object> params = new ArrayList<>();
        params.addAll(ASSIGNABLE_INCIDENT_PERMISSIONS);
        appendAssignableUserAreaScope(sql, params);
        sql.append(" order by u.name");
        return jdbc.queryForList(sql.toString(), params.toArray());
    }

    private void validateTargetArea(Map<String, List<String>> errors, Long regionId, Long districtId, Long councilId) {
        if (regionId != null && count("regions", regionId) == 0) {
            add(errors, "region_id", "The selected region is invalid.");
        }
        if (districtId != null) {
            List<Long> parent = jdbc.queryForList("select region_id from public.districts where id = ?",
                    Long.class, districtId);
            if (parent.isEmpty()) {
                add(errors, "district_id", "The selected district is invalid.");
            } else if (regionId != null && parent.get(0) != null && !parent.get(0).equals(regionId)) {
                add(errors, "district_id", "The selected district does not belong to the selected region.");
            }
        }

        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        Map<String, Object> area = jurisdiction.currentArea();
        if (tier == JurisdictionScope.Tier.DISTRICT) {
            Long myCouncil = asLong(area.get("council_id"));
            if (myCouncil != null) {
                if (councilId == null) {
                    add(errors, "council_id", "Your account is attached to a council/LGA; select your council/LGA.");
                } else if (!myCouncil.equals(councilId)) {
                    add(errors, "council_id", "You can only log incidents for your own council/LGA.");
                }
                return;
            }
            Long myDistrict = asLong(area.get("district_id"));
            if (myDistrict == null) {
                add(errors, "district_id", "Your account is not attached to a district.");
            } else if (districtId == null || !myDistrict.equals(districtId)) {
                add(errors, "district_id", "You can only log incidents for your own district.");
            }
        } else if (tier == JurisdictionScope.Tier.REGION) {
            Long myRegion = asLong(area.get("region_id"));
            if (myRegion == null) {
                add(errors, "region_id", "Your account is not attached to a region.");
            } else if (regionId == null || !myRegion.equals(regionId)) {
                add(errors, "region_id", "You can only log incidents for your own region.");
            }
        } else if (tier == JurisdictionScope.Tier.NONE) {
            add(errors, "region_id", "Your account is not attached to an incident reporting area.");
        }
    }

    private void validateAssignableUser(Map<String, List<String>> errors, Long assignedToUserId) {
        if (assignedToUserId == null) {
            return;
        }
        String placeholders = String.join(",", Collections.nCopies(ASSIGNABLE_INCIDENT_PERMISSIONS.size(), "?"));
        StringBuilder sql = new StringBuilder("""
                select count(distinct u.id)
                from public.users u
                where u.id = ?
                  and u.stakeholder_id is null
                  and exists (
                    select 1
                    from public.model_has_roles mhr
                    join public.role_has_permissions rhp on rhp.role_id = mhr.role_id
                    join public.permissions p on p.id = rhp.permission_id
                    where mhr.model_id = u.id and p.name in (%s)
                  )
                """.formatted(placeholders));
        List<Object> params = new ArrayList<>();
        params.add(assignedToUserId);
        params.addAll(ASSIGNABLE_INCIDENT_PERMISSIONS);
        appendAssignableUserAreaScope(sql, params);
        Long n = jdbc.queryForObject(sql.toString(), Long.class, params.toArray());
        if (n == null || n == 0) {
            add(errors, "assigned_to_user_id", "The selected assignee is not valid for your incident area.");
        }
    }

    private void appendAssignableUserAreaScope(StringBuilder sql, List<Object> params) {
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        Map<String, Object> area = jurisdiction.currentArea();
        switch (tier) {
            case NATIONAL -> { /* every incident-capable staff user */ }
            case REGION -> {
                Long regionId = asLong(area.get("region_id"));
                if (regionId == null) {
                    sql.append(" and 1=0");
                } else {
                    sql.append(" and u.region_id = ?");
                    params.add(regionId);
                }
            }
            case DISTRICT -> {
                Long councilId = asLong(area.get("council_id"));
                if (councilId != null) {
                    sql.append(" and u.council_id = ?");
                    params.add(councilId);
                    return;
                }
                Long districtId = asLong(area.get("district_id"));
                if (districtId == null) {
                    sql.append(" and 1=0");
                } else {
                    sql.append(" and u.district_id = ?");
                    params.add(districtId);
                }
            }
            default -> sql.append(" and 1=0");
        }
    }

    private List<String> storePhotos(List<MultipartFile> photos) {
        List<String> paths = new ArrayList<>();
        if (photos == null) {
            return paths;
        }
        for (MultipartFile photo : photos) {
            if (photo == null || photo.isEmpty()) {
                continue;
            }
            paths.add(storeFile(photo, "incident_photos"));
        }
        paths.removeIf(java.util.Objects::isNull);
        return paths;
    }

    private String storeVideo(MultipartFile video) {
        if (video == null || video.isEmpty()) {
            return null;
        }
        return storeFile(video, "incident_videos");
    }

    private String storeFile(MultipartFile file, String dir) {
        try {
            Path target = storageRoot.resolve(dir);
            Files.createDirectories(target);
            String name = System.currentTimeMillis() + "_"
                    + (file.getOriginalFilename() == null ? "file" : file.getOriginalFilename().replaceAll("[^A-Za-z0-9._-]", "_"));
            file.transferTo(target.resolve(name).toAbsolutePath());
            return dir + "/" + name;
        } catch (Exception e) {
            log.warn("incident file store failed: {}", e.getMessage());
            return null;
        }
    }

    private List<Map<String, Object>> listUpdates(long id) {
        List<Map<String, Object>> updates = new ArrayList<>();
        jdbc.query("""
                select iu.id, iu.update_details, iu.update_type, iu.created_at, u.name as user_name
                from public.incident_updates iu left join public.users u on u.id = iu.user_id
                where iu.incident_id = ? order by iu.created_at desc
                """, rs -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("update_details", rs.getString("update_details"));
            m.put("update_type", rs.getString("update_type"));
            m.put("user_name", rs.getString("user_name"));
            m.put("created_at", formatTs(rs.getTimestamp("created_at")));
            updates.add(m);
        }, id);
        return updates;
    }

    private List<Map<String, Object>> listWorkflowHistories(long id) {
        List<Map<String, Object>> histories = new ArrayList<>();
        jdbc.query("""
                select wh.action, wh.from_status, wh.to_status, wh.performed_by_role, wh.comments,
                    wh.created_at, u.name as user_name
                from public.incident_workflow_histories wh left join public.users u on u.id = wh.user_id
                where wh.incident_id = ? order by wh.created_at desc, wh.id desc
                """, rs -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("action", rs.getString("action"));
            m.put("from_status", rs.getString("from_status"));
            m.put("from_status_label", IncidentOptions.workflowStatusLabel(rs.getString("from_status")));
            m.put("to_status", rs.getString("to_status"));
            m.put("to_status_label", IncidentOptions.workflowStatusLabel(rs.getString("to_status")));
            m.put("performed_by_role", rs.getString("performed_by_role"));
            m.put("user_name", rs.getString("user_name"));
            m.put("comments", rs.getString("comments"));
            m.put("created_at", formatTs(rs.getTimestamp("created_at")));
            histories.add(m);
        }, id);
        return histories;
    }

    /** Adds display fields the Blade computed via model accessors. */
    private void decorate(Map<String, Object> incident) {
        incident.put("workflow_status_label",
                IncidentOptions.workflowStatusLabel((String) incident.get("workflow_status")));
        incident.put("photo_paths", parseJsonList(incident.get("photo_paths")));
        incident.put("infrastructure_damage", parseJsonList(incident.get("infrastructure_damage")));
        incident.put("emergency_needs", parseJsonList(incident.get("emergency_needs")));
        incident.put("reported_at_display", incident.get("reported_at") instanceof java.sql.Timestamp t ? formatTs(t) : null);
        incident.put("returned", asInt(incident.get("rollback_count")) > 0);
        incident.put("last_rollback_at_display", incident.get("last_rollback_at") instanceof java.sql.Timestamp rt ? formatTs(rt) : null);
        incident.put("occurred_at_display", incident.get("occurred_at") instanceof java.sql.Timestamp ot ? formatTs(ot) : null);
        incident.put("ended_at_display", incident.get("ended_at") instanceof java.sql.Timestamp et ? formatTs(et) : null);
        int deaths = asInt(incident.get("deaths_total"));
        int injured = asInt(incident.get("injured_total"));
        int missing = asInt(incident.get("missing_total"));
        incident.put("total_human_impact", deaths + injured + missing);
    }

    private long count(String table, long id) {
        Long c = jdbc.queryForObject("select count(*) from " + tz.go.pmo.dmis.common.sql.SafeIdentifiers.publicQualified(table) + " where id = ?", Long.class, id);
        return c == null ? 0 : c;
    }

    private List<String> parseJsonList(Object raw) {
        if (raw == null) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(String.valueOf(raw),
                    objectMapper.getTypeFactory().constructCollectionType(List.class, String.class));
        } catch (Exception e) {
            return new ArrayList<>();
        }
    }

    private String toJson(Object value) {
        try {
            return value == null ? null : objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            return null;
        }
    }

    private static String comment(Map<String, Object> body) {
        return body == null ? null : strOf(body.get("comments"));
    }

    private static Map<String, Object> firstOrNull(List<Map<String, Object>> rows) {
        return rows.isEmpty() ? null : rows.get(0);
    }

    private static String formatTs(java.sql.Timestamp ts) {
        return ts == null ? null : ts.toLocalDateTime().format(D_M_Y_HI);
    }

    private static void add(Map<String, List<String>> errors, String field, String message) {
        errors.computeIfAbsent(field, k -> new ArrayList<>()).add(message);
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static String trim(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    private static String strOf(Object v) {
        return v == null ? null : trim(String.valueOf(v));
    }

    private static Long parseLong(String s) {
        s = trim(s);
        return s == null ? null : (long) Double.parseDouble(s);
    }

    private static Long parseOptionalId(Map<String, List<String>> errors, Map<String, String> form,
                                        String field, String label) {
        String raw = trim(form.get(field));
        if (raw == null) {
            return null;
        }
        try {
            return (long) Double.parseDouble(raw);
        } catch (NumberFormatException e) {
            add(errors, field, "The selected " + label + " is invalid.");
            return null;
        }
    }

    private static Double parseDouble(String s) {
        s = trim(s);
        return s == null ? null : Double.parseDouble(s);
    }

    /** Use the posted name if present, else resolve it from the selected id (table is a fixed literal). */
    private String coalesceName(String posted, String table, Long id) {
        if (posted != null && !posted.isBlank()) {
            return posted;
        }
        if (id == null) {
            return null;
        }
        List<String> names = jdbc.queryForList("select name from " + tz.go.pmo.dmis.common.sql.SafeIdentifiers.publicQualified(table) + " where id = ?", String.class, id);
        return names.isEmpty() ? null : names.get(0);
    }

    /**
     * Region is authoritative from the district: a district belongs to exactly one region, so when a district
     * is chosen, derive the region from it (overriding any missing/mismatched posted region) so the incident
     * always routes to the correct RAS and stays visible to that region. Region-only incidents (no district)
     * keep the posted region.
     */
    private Long regionOfDistrict(Long districtId, Long postedRegionId) {
        if (districtId == null) {
            return postedRegionId;
        }
        List<Long> ids = jdbc.queryForList("select region_id from public.districts where id = ?", Long.class, districtId);
        return (ids.isEmpty() || ids.get(0) == null) ? postedRegionId : ids.get(0);
    }

    private record TargetArea(Long regionId, Long districtId, Long councilId) {}

    private TargetArea normalizeTargetArea(Map<String, List<String>> errors, Long postedRegionId,
                                           Long postedDistrictId, Long councilId) {
        if (councilId == null) {
            return new TargetArea(regionOfDistrict(postedDistrictId, postedRegionId), postedDistrictId, null);
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select region_id, district_id from public.councils where id = ?", councilId);
        if (rows.isEmpty()) {
            add(errors, "council_id", "The selected council/LGA is invalid.");
            return new TargetArea(regionOfDistrict(postedDistrictId, postedRegionId), postedDistrictId, null);
        }
        Long councilRegion = asLong(rows.get(0).get("region_id"));
        Long councilDistrict = asLong(rows.get(0).get("district_id"));
        if (postedRegionId != null && councilRegion != null && !postedRegionId.equals(councilRegion)) {
            add(errors, "region_id", "The selected council/LGA does not belong to the selected region.");
        }
        if (postedDistrictId != null && councilDistrict != null && !postedDistrictId.equals(councilDistrict)) {
            add(errors, "district_id", "The selected council/LGA does not belong to the selected district.");
        }
        return new TargetArea(councilRegion, councilDistrict, councilId);
    }

    private static int intOr0(String s) {
        s = trim(s);
        return s == null ? 0 : (int) Double.parseDouble(s);
    }

    private static int numOf(Map<String, Object> body, String key) {
        Object v = body.get(key);
        if (v == null) {
            return 0;
        }
        try {
            return (int) Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static int asInt(Object v) {
        return v instanceof Number n ? n.intValue() : 0;
    }

    private static Long asLong(Object v) {
        return v instanceof Number n ? n.longValue() : null;
    }
}
