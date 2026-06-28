package tz.go.pmo.dmis.response;

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
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.SecurityUtils;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Port of Admin\IncidentController (registry, full report form with photos/video,
 * situation updates) plus the workflow actions routes/response.php exposes.
 * Source gaps fixed and logged in issues/response.issues.md: escalate/verify/close
 * (bound to non-existent methods in the source) act on the operational status.
 */
@RestController
@RequestMapping("/v1/response/incidents")
public class IncidentController {

    private static final Logger log = LoggerFactory.getLogger(IncidentController.class);
    private static final DateTimeFormatter D_M_Y_HI =
            DateTimeFormatter.ofPattern("dd MMM uuuu, HH:mm", Locale.ENGLISH);

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService workflow;
    private final ObjectMapper objectMapper;
    private final Path storageRoot;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;

    public IncidentController(JdbcTemplate jdbc, IncidentWorkflowService workflow, ObjectMapper objectMapper,
                              JurisdictionScope jurisdiction, AreaGuard areaGuard,
                              @Value("${dmis.storage.public-root:./storage}") String publicRoot) {
        this.jdbc = jdbc;
        this.workflow = workflow;
        this.objectMapper = objectMapper;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
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
        jurisdiction.appendAreaScope("i", where, params);   // incidents carry region_id/district_id FK columns
    }

    // ─── Registry ───

    @GetMapping
    public Map<String, Object> index(@RequestParam(name = "status_filter", required = false) String statusFilter,
                                     @RequestParam(name = "hazard_filter", required = false) Long hazardFilter,
                                     @RequestParam(name = "workflow_filter", required = false) String workflowFilter,
                                     @RequestParam(defaultValue = "1") int page) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        if (statusFilter != null && !statusFilter.isBlank()) {
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
            m.put("rollback_count", rs.getInt("rollback_count"));
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
    @GetMapping("/form-data")
    public Map<String, Object> formData() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("hazards", jdbc.queryForList("select id, name from public.hazards order by name"));
        out.put("incident_types", jdbc.queryForList("select id, name, default_severity from public.incident_types order by name"));
        out.put("regions", jdbc.queryForList("select id, name from public.regions order by name"));
        out.put("assignable_users", jdbc.queryForList("select id, name from public.users order by name"));
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

    @PreAuthorize(Authz.PERM_INCIDENT_CREATE)
    @PostMapping(consumes = {MediaType.MULTIPART_FORM_DATA_VALUE, MediaType.APPLICATION_FORM_URLENCODED_VALUE})
    @Transactional
    public ResponseEntity<Map<String, Object>> store(@RequestParam Map<String, String> form,
            @RequestParam(name = "infrastructure_damage", required = false) List<String> infrastructureDamage,
            @RequestParam(name = "emergency_needs", required = false) List<String> emergencyNeeds,
            @RequestPart(name = "photos", required = false) List<MultipartFile> photos,
            @RequestPart(name = "video", required = false) MultipartFile video) {
        Map<String, List<String>> errors = validate(form, infrastructureDamage, emergencyNeeds, photos, video);
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed.", "errors", errors));
        }

        List<String> photoPaths = storePhotos(photos);
        String videoPath = storeVideo(video);

        Long regionId = parseLong(form.get("region_id"));
        Long districtId = parseLong(form.get("district_id"));
        // Region is authoritative from the chosen district (a district belongs to exactly one region). Derive
        // region_id from it, overriding a missing/mismatched region, so the incident always routes to the correct
        // RAS at the region stage and stays visible to that region. Region-only incidents keep their region_id.
        regionId = regionOfDistrict(districtId, regionId);
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
                trim(form.get("source_of_report")), parseLong(form.get("assigned_to_user_id")),
                toJson(photoPaths), photoPaths.isEmpty() ? null : photoPaths.get(0), videoPath,
                intOr0(form.get("deaths_male")), intOr0(form.get("deaths_female")), intOr0(form.get("deaths_total")),
                intOr0(form.get("injured_male")), intOr0(form.get("injured_female")), intOr0(form.get("injured_total")),
                intOr0(form.get("missing_male")), intOr0(form.get("missing_female")), intOr0(form.get("missing_total")),
                intOr0(form.get("displaced")), intOr0(form.get("people_with_disabilities")),
                intOr0(form.get("pregnant_affected")), intOr0(form.get("children_affected")),
                toJson(infrastructureDamage), toJson(emergencyNeeds),
                trim(form.get("emergency_needs_other")), trim(form.get("action_taken")));

        workflow.logHistory(id, "created", null, "draft", "Incident reported");
        return ResponseEntity.ok(Map.of("success", true, "message", "Incident logged successfully.", "id", id));
    }

    @PreAuthorize(Authz.PERM_INCIDENT_UPDATE)
    @PutMapping(value = "/{id}", consumes = {MediaType.MULTIPART_FORM_DATA_VALUE, MediaType.APPLICATION_FORM_URLENCODED_VALUE})
    @Transactional
    public ResponseEntity<Map<String, Object>> update(@PathVariable long id,
            @RequestParam Map<String, String> form,
            @RequestParam(name = "infrastructure_damage", required = false) List<String> infrastructureDamage,
            @RequestParam(name = "emergency_needs", required = false) List<String> emergencyNeeds,
            @RequestParam(name = "remove_photos", required = false) List<String> removePhotos,
            @RequestPart(name = "photos", required = false) List<MultipartFile> photos,
            @RequestPart(name = "video", required = false) MultipartFile video) {
        Map<String, Object> incident = workflow.findOr404(id);
        areaGuard.assertOwn("public.incidents", id);   // an area officer may edit only an incident in their own area
        Map<String, List<String>> errors = validate(form, infrastructureDamage, emergencyNeeds, photos, video);
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed.", "errors", errors));
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
        Long updDistrictId = parseLong(form.get("district_id"));
        Long updRegionId = regionOfDistrict(updDistrictId, parseLong(form.get("region_id")));
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
                trim(form.get("source_of_report")), parseLong(form.get("assigned_to_user_id")),
                toJson(existing), existing.isEmpty() ? null : existing.get(0), videoPath,
                intOr0(form.get("deaths_male")), intOr0(form.get("deaths_female")), intOr0(form.get("deaths_total")),
                intOr0(form.get("injured_male")), intOr0(form.get("injured_female")), intOr0(form.get("injured_total")),
                intOr0(form.get("missing_male")), intOr0(form.get("missing_female")), intOr0(form.get("missing_total")),
                intOr0(form.get("displaced")), intOr0(form.get("people_with_disabilities")),
                intOr0(form.get("pregnant_affected")), intOr0(form.get("children_affected")),
                toJson(infrastructureDamage), toJson(emergencyNeeds), trim(form.get("emergency_needs_other")),
                trim(form.get("action_taken")), id);
        workflow.logHistory(id, "edited", (String) incident.get("workflow_status"),
                (String) incident.get("workflow_status"), "Incident details updated");
        return ResponseEntity.ok(Map.of("success", true, "message", "Incident updated successfully."));
    }

    // ─── Show hub ───

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
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
                    dru.name as director_reviewed_by_name
                from public.incidents i
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
        return out;
    }

    // ─── Situation updates ───

    @PreAuthorize(Authz.PERM_INCIDENT_UPDATE)
    @PostMapping("/{id}/updates")
    @Transactional
    public ResponseEntity<Map<String, Object>> storeUpdate(@PathVariable long id, @RequestBody Map<String, Object> body) {
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
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed.", "errors", errors));
        }
        jdbc.update("""
                insert into public.incident_updates(incident_id, user_id, update_details, update_type, created_at, updated_at)
                values (?,?,?,?,now(),now())
                """, id, workflow.actingUserId(), details, type);
        return ResponseEntity.ok(Map.of("success", true, "message", "Incident update logged successfully."));
    }

    // ─── Workflow actions ───

    @PreAuthorize(Authz.PERM_INCIDENT_CREATE)
    @PostMapping("/{id}/submit")
    public Map<String, Object> submit(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        String to = workflow.submit(id, comment(body));
        return Map.of("success", true, "message", "Incident submitted for approval.", "workflow_status", to);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/approve")
    public Map<String, Object> approve(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> b = body == null ? Map.of() : body;
        String to = workflow.approve(id, strOf(b.get("comments")), strOf(b.get("recommendation")));
        return Map.of("success", true,
                "message", "approved".equals(to) ? "Incident approved." : "Approved and forwarded to the next level.",
                "workflow_status", to);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/rollback")
    public Map<String, Object> rollback(@PathVariable long id, @RequestBody Map<String, Object> body) {
        String to = workflow.rollback(id, strOf(body.get("comments")), strOf(body.get("by_role")));
        return Map.of("success", true, "message", "Incident rolled back for corrections.", "workflow_status", to);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/forward")
    public Map<String, Object> forward(@PathVariable long id, @RequestBody Map<String, Object> body) {
        String to = workflow.forward(id, strOf(body.get("to_role")), strOf(body.get("recommendation")));
        return Map.of("success", true, "message", "Incident forwarded.", "workflow_status", to);
    }

    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/resubmit")
    public Map<String, Object> resubmit(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        String to = workflow.resubmit(id, comment(body));
        return Map.of("success", true, "message", "Incident resubmitted.", "workflow_status", to);
    }

    // Operational actions bound by routes/response.php to methods missing in the source

    @PreAuthorize(Authz.PERM_INCIDENT_UPDATE)
    @PostMapping("/{id}/escalate")
    public Map<String, Object> escalate(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        areaGuard.assertOwn("public.incidents", id);   // only an in-area officer may escalate this incident
        workflow.setOperationalStatus(id, "Escalated", comment(body));
        return Map.of("success", true, "message", "Incident escalated.");
    }

    @PreAuthorize(Authz.PERM_INCIDENT_UPDATE)
    @PostMapping("/{id}/verify")
    public Map<String, Object> verify(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        areaGuard.assertOwn("public.incidents", id);   // only an in-area officer may verify this incident
        workflow.setOperationalStatus(id, "Verified", comment(body));
        return Map.of("success", true, "message", "Incident verified.");
    }

    @PreAuthorize(Authz.PERM_INCIDENT_CLOSE)
    @PostMapping("/{id}/close")
    public Map<String, Object> close(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        areaGuard.assertOwn("public.incidents", id);   // only an in-area officer may close this incident
        workflow.setOperationalStatus(id, "Closed", comment(body));
        return Map.of("success", true, "message", "Incident closed.");
    }

    /** DDMC gatekeeper: close an entry-stage incident as a rumour/normal case and inform DED + DAS. */
    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/close-rumor")
    public Map<String, Object> closeRumor(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        workflow.closeAsRumor(id, comment(body));
        return Map.of("success", true, "message", "Closed as rumour / normal case; district leadership (DED, DAS) informed.");
    }

    /** DED (district) / RAS (region) resolve the incident locally when resources sufficed — instead of escalating. */
    @PreAuthorize(Authz.PERM_INCIDENT_APPROVE)
    @PostMapping("/{id}/resolve")
    public Map<String, Object> resolve(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        String to = workflow.resolve(id, comment(body));
        return Map.of("success", true, "message", "Incident resolved locally; the levels above were informed.", "workflow_status", to);
    }

    // ─── Public surfaces: publish/unpublish the incident to the citizen portal (live map + news/event) ───

    /** Pin (or unpin, {@code value:false}) the incident on the public portal map. The map marker opens the
     *  live snapshot at {@code GET /v1/portal/incidents/{id}} (situation + response + resources). */
    @PreAuthorize("hasAuthority('incidents.publish')")
    @PostMapping("/{id}/push-map")
    @Transactional
    public Map<String, Object> pushMap(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        workflow.findOr404(id);
        boolean on = body == null || body.get("value") == null || Boolean.parseBoolean(String.valueOf(body.get("value")));
        jdbc.update("update public.incidents set show_on_portal_map = ?, "
                + "pushed_to_map_at = case when ? then now() else pushed_to_map_at end, updated_at = now() where id = ?",
                on, on, id);
        return Map.of("success", true, "show_on_portal_map", on);
    }

    /** Publish (or re-publish) the incident as a portal News & Events item linking to its live snapshot.
     *  Idempotent: re-pushing updates the same article rather than creating a duplicate. */
    @PreAuthorize("hasAuthority('incidents.publish')")
    @PostMapping("/{id}/push-news")
    @Transactional
    public Map<String, Object> pushNews(@PathVariable long id) {
        workflow.findOr404(id);
        Map<String, Object> i = jdbc.queryForMap("select id, title, severity_level, region_name, district_name, "
                + "description, portal_news_id from public.incidents where id = ?", id);
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
    @PreAuthorize("hasAuthority('incidents.publish')")
    @PostMapping("/{id}/remove-news")
    @Transactional
    public Map<String, Object> removeNews(@PathVariable long id) {
        workflow.findOr404(id);
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

    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    @PostMapping("/{id}/history-reports")
    @Transactional
    public ResponseEntity<Map<String, Object>> storeHistoryReport(@PathVariable long id, @RequestBody Map<String, Object> body) {
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
        return ResponseEntity.ok(Map.of("success", true, "message", "Situation report recorded."));
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
        return errors;
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
        int deaths = asInt(incident.get("deaths_total"));
        int injured = asInt(incident.get("injured_total"));
        int missing = asInt(incident.get("missing_total"));
        incident.put("total_human_impact", deaths + injured + missing);
    }

    private long count(String table, long id) {
        Long c = jdbc.queryForObject("select count(*) from public." + table + " where id = ?", Long.class, id);
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
        List<String> names = jdbc.queryForList("select name from public." + table + " where id = ?", String.class, id);
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
}
