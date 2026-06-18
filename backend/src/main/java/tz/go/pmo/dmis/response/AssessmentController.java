package tz.go.pmo.dmis.response;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.multipart.MultipartFile;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;

/**
 * Port of Response\DamageAssessmentController — Disaster Needs Assessments:
 * a per-incident, category-itemised damage survey with photo evidence, a
 * Draft → Pending Verification → Completed workflow, and direct resource
 * requests that flow into the standard allocation pipeline.
 *
 * Source bugs fixed: store() hardcoded status 'Submitted', a value the
 * workflow doesn't accept (assessments could never be verified); and
 * resource requests went to a disconnected resource_requests table — here
 * they are allocated_resources rows on the V24 approval chain, linked by
 * assessment_id from V27.
 */
@RestController
@RequestMapping("/v1/response/assessments")
public class AssessmentController {

    /** Verbatim category tree from the source's create() (hardcoded there, data here). */
    private static final Map<String, List<String>> CATEGORY_TREE = new LinkedHashMap<>();
    static {
        CATEGORY_TREE.put("Infrastructure", List.of("Roads and Bridges", "Buildings", "Power Lines",
                "Water Supply", "Telecommunications", "Public Facilities"));
        CATEGORY_TREE.put("Human Impact", List.of("Deaths", "Injuries", "Missing Persons",
                "Displaced Families", "Affected Population"));
        CATEGORY_TREE.put("Economic", List.of("Agriculture", "Livestock", "Business/Commercial",
                "Industrial", "Tourism"));
        CATEGORY_TREE.put("Environmental", List.of("Forest Damage", "Water Contamination",
                "Soil Erosion", "Wildlife Impact"));
        CATEGORY_TREE.put("Social Services", List.of("Schools", "Hospitals", "Religious Buildings",
                "Community Centers"));
    }

    private static final List<String> ASSESSMENT_TYPES = List.of("Initial", "Detailed", "Final");
    private static final List<String> DAMAGE_LEVELS = List.of("Minor", "Moderate", "Severe", "Total Loss");
    private static final List<String> SEVERITIES = List.of("Minor", "Moderate", "Severe");
    private static final List<String> PRIORITIES = List.of("Low", "Medium", "High", "Critical");
    private static final long MAX_PHOTO_BYTES = 5L * 1024 * 1024; // source: photos.* max:5120 (KB)

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> LIST_OF_MAPS = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService users;
    private final ApprovalWorkflowEngine approvals;
    private final Path storageRoot;

    public AssessmentController(JdbcTemplate jdbc, IncidentWorkflowService users,
                                ApprovalWorkflowEngine approvals,
                                @Value("${dmis.storage.public-root:./storage}") String publicRoot) {
        this.jdbc = jdbc;
        this.users = users;
        this.approvals = approvals;
        this.storageRoot = Path.of(publicRoot);
    }

    // ─── Registry + dashboard ───

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) Long incident_id) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            where.append(" and da.status = ?");
            params.add(status);
        }
        if (incident_id != null) {
            where.append(" and da.incident_id = ?");
            params.add(incident_id);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("assessments", jdbc.queryForList("""
                select da.id, da.assessment_type, da.assessment_date, da.location, da.district,
                       da.damage_level, da.estimated_loss, da.status, da.created_at,
                       i.title as incident_title, u.name as assessor_name,
                       (select count(*) from public.assessment_categories ac where ac.assessment_id = da.id) as item_count,
                       (select count(*) from public.assessment_photos ap where ap.assessment_id = da.id) as photo_count
                from public.damage_assessments da
                left join public.incidents i on i.id = da.incident_id
                left join public.users u on u.id = da.assessor_id
                where %s order by da.created_at desc limit 200
                """.formatted(where), params.toArray()));
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status = 'Draft') as draft,
                       count(*) filter (where status = 'Pending Verification') as pending_verification,
                       count(*) filter (where status = 'Completed') as completed,
                       coalesce(sum(estimated_loss), 0) as total_estimated_loss
                from public.damage_assessments
                """));
        // Chart feeds, shaped like the source dashboard: by damage level + by district
        out.put("by_damage_level", jdbc.queryForList("""
                select damage_level, count(*) as count from public.damage_assessments
                group by damage_level order by count desc
                """));
        out.put("by_district", jdbc.queryForList("""
                select district, count(*) as count, coalesce(sum(estimated_loss),0) as estimated_loss
                from public.damage_assessments where district is not null
                group by district order by estimated_loss desc limit 10
                """));
        return out;
    }

    /** Everything the create/edit form needs (the source hardcoded most of this in the view). */
    @GetMapping("/form-data")
    public Map<String, Object> formData() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("incidents", jdbc.queryForList("""
                select id, title, status, severity_level from public.incidents
                where status not in ('closed','resolved') order by reported_at desc limit 100
                """));
        out.put("category_tree", CATEGORY_TREE);
        out.put("assessment_types", ASSESSMENT_TYPES);
        out.put("damage_levels", DAMAGE_LEVELS);
        out.put("severities", SEVERITIES);
        out.put("priorities", PRIORITIES);
        out.put("resources", jdbc.queryForList(
                "select id, name, category, unit_of_measure from public.resources order by name"));
        return out;
    }

    // ─── Create ───

    /**
     * Multipart create: scalar fields + `categories`/`requirements`/`resource_requests`
     * as JSON strings + photo files. Categories are itemised rows; resource requests
     * become allocated_resources on the V24 chain; status starts at 'Draft'.
     */
    @PreAuthorize(Authz.RESPONSE_ASSESS_WRITE)
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public Map<String, Object> store(
            @RequestParam Map<String, String> form,
            @RequestPart(name = "photos", required = false) List<MultipartFile> photos) throws Exception {
        long incidentId = requireLong(form, "incident_id");
        String assessmentType = requireIn(form, "assessment_type", ASSESSMENT_TYPES);
        String damageLevel = requireIn(form, "overall_damage_level", DAMAGE_LEVELS);
        String location = requireText(form, "location");
        String district = requireText(form, "district");
        List<Map<String, Object>> categories = parseJsonList(form.get("categories"));
        if (categories.isEmpty()) {
            throw new BusinessRuleException("At least one damage category with items is required.");
        }

        double totalLoss = sumItemValues(categories);
        Long userId = users.actingUserId();
        Long id = jdbc.queryForObject("""
                insert into public.damage_assessments(incident_id, assessment_type, assessment_date,
                    assessor_id, submitted_by, location, district, latitude, longitude, damage_level,
                    estimated_loss, immediate_needs, recommendations, status, created_at, updated_at)
                values (?,?,?::date,?,?,?,?,?,?,?,?,?,?, 'Draft', now(), now()) returning id
                """, Long.class, incidentId, assessmentType, require(form.get("assessment_date"), "assessment_date"),
                userId, userId, location, district,
                numOrNull(form.get("latitude")), numOrNull(form.get("longitude")), damageLevel, totalLoss,
                JSON.writeValueAsString(parseJsonList(form.get("requirements"))),
                blankToNull(form.get("general_notes")));

        insertCategoryItems(id, categories);
        createResourceRequests(id, incidentId, parseJsonList(form.get("resource_requests")),
                blankToNull(form.get("resource_request_notes")));
        storePhotos(id, photos);
        // Source: filing an assessment moves the incident under assessment
        jdbc.update("update public.incidents set status = 'under_assessment', updated_at = now() where id = ?", incidentId);
        return Map.of("success", true, "id", id, "message", "Damage assessment created successfully.");
    }

    // ─── Show / update ───

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        Map<String, Object> assessment = findOr404(id);
        Map<String, Object> out = new LinkedHashMap<>(jdbc.queryForMap("""
                select da.*, i.title as incident_title, i.severity_level, a.name as assessor_name,
                       v.name as verified_by_name
                from public.damage_assessments da
                left join public.incidents i on i.id = da.incident_id
                left join public.users a on a.id = da.assessor_id
                left join public.users v on v.id = da.verified_by
                where da.id = ?
                """, id));
        List<Map<String, Object>> items = jdbc.queryForList(
                "select * from public.assessment_categories where assessment_id = ? order by category, id", id);
        out.put("items", items);
        // Per-category rollup, as in the source's categorySummary
        Map<String, Map<String, Object>> summary = new LinkedHashMap<>();
        for (Map<String, Object> item : items) {
            Map<String, Object> s = summary.computeIfAbsent((String) item.get("category"), c -> {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("category", c);
                m.put("total_items", 0L);
                m.put("total_damage", 0d);
                return m;
            });
            s.put("total_items", (Long) s.get("total_items") + 1);
            s.put("total_damage", (Double) s.get("total_damage") + dbl(item.get("damage_value")));
        }
        out.put("category_summary", new ArrayList<>(summary.values()));
        out.put("photos", jdbc.queryForList("""
                select ap.*, u.name as uploaded_by_name from public.assessment_photos ap
                left join public.users u on u.id = ap.uploaded_by
                where ap.assessment_id = ? order by ap.id
                """, id));
        out.put("resource_requests", jdbc.queryForList("""
                select ar.id, ar.status, ar.workflow_status, ar.quantity_requested, ar.unit_of_measure,
                       ar.justification_for_request, r.name as resource_name
                from public.allocated_resources ar
                join public.resources r on r.id = ar.resource_id
                where ar.assessment_id = ? order by ar.id
                """, id));
        out.put("assessment", assessment);
        return out;
    }

    /** Update (multipart, same shape as store); completed assessments are immutable. */
    @PreAuthorize(Authz.RESPONSE_ASSESS_WRITE)
    @PostMapping(value = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public Map<String, Object> update(
            @PathVariable long id,
            @RequestParam Map<String, String> form,
            @RequestPart(name = "photos", required = false) List<MultipartFile> photos) throws Exception {
        Map<String, Object> assessment = findOr404(id);
        if ("Completed".equals(assessment.get("status"))) {
            throw new BusinessRuleException("Completed assessments cannot be modified.");
        }
        List<Map<String, Object>> categories = parseJsonList(form.get("categories"));
        if (categories.isEmpty()) {
            throw new BusinessRuleException("At least one damage category with items is required.");
        }
        jdbc.update("""
                update public.damage_assessments set assessment_date = ?::date, location = ?, district = ?,
                    latitude = ?, longitude = ?, damage_level = ?, estimated_loss = ?,
                    immediate_needs = ?, recommendations = ?, updated_by = ?, updated_at = now()
                where id = ?
                """, require(form.get("assessment_date"), "assessment_date"),
                requireText(form, "location"), requireText(form, "district"),
                numOrNull(form.get("latitude")), numOrNull(form.get("longitude")),
                requireIn(form, "overall_damage_level", DAMAGE_LEVELS), sumItemValues(categories),
                JSON.writeValueAsString(parseJsonList(form.get("requirements"))),
                blankToNull(form.get("general_notes")), users.actingUserId(), id);
        // Source behavior: categories are replaced wholesale; photos only ever added
        jdbc.update("delete from public.assessment_categories where assessment_id = ?", id);
        insertCategoryItems(id, categories);
        storePhotos(id, photos);
        return Map.of("success", true, "message", "Damage assessment updated successfully.");
    }

    // ─── Workflow ───

    @PreAuthorize(Authz.RESPONSE_ASSESS_WRITE)
    @PostMapping("/{id}/submit")
    @Transactional
    public Map<String, Object> submit(@PathVariable long id) {
        Map<String, Object> assessment = findOr404(id);
        if (!"Draft".equals(assessment.get("status"))) {
            throw new BusinessRuleException("Only draft assessments can be submitted for verification.");
        }
        jdbc.update("""
                update public.damage_assessments set status = 'Pending Verification',
                    submitted_at = now(), submitted_by = ?, updated_at = now() where id = ?
                """, users.actingUserId(), id);
        return Map.of("success", true, "message", "Assessment submitted for verification.");
    }

    @PreAuthorize(Authz.RESPONSE_ASSESS_VERIFY)
    @PostMapping("/{id}/verify")
    @Transactional
    public Map<String, Object> verify(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        Map<String, Object> assessment = findOr404(id);
        if (!"Pending Verification".equals(assessment.get("status"))) {
            throw new BusinessRuleException("Only assessments pending verification can be verified.");
        }
        jdbc.update("""
                update public.damage_assessments set status = 'Completed', completed_at = now(),
                    verified_by = ?, verification_notes = ?, updated_at = now() where id = ?
                """, users.actingUserId(), body == null ? null : blankToNull(String.valueOf(
                        body.get("verification_notes") == null ? "" : body.get("verification_notes"))), id);
        return Map.of("success", true, "message", "Assessment verified and completed.");
    }

    @PreAuthorize(Authz.RESPONSE_ASSESS_WRITE)
    @DeleteMapping("/{id}/photos/{photoId}")
    @Transactional
    public Map<String, Object> deletePhoto(@PathVariable long id, @PathVariable long photoId) {
        findOr404(id);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select photo_path from public.assessment_photos where id = ? and assessment_id = ?", photoId, id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Photo not found.");
        }
        jdbc.update("delete from public.assessment_photos where id = ?", photoId);
        try {
            Files.deleteIfExists(storageRoot.resolve(String.valueOf(rows.get(0).get("photo_path"))));
        } catch (Exception ignored) {
            // The DB row is the source of truth; a missing file is not an error.
        }
        return Map.of("success", true, "message", "Photo deleted.");
    }

    /** Report payload: per-category totals with a severity breakdown (generateReport). */
    @GetMapping("/{id}/report")
    public Map<String, Object> report(@PathVariable long id) {
        Map<String, Object> out = show(id);
        List<Map<String, Object>> bySeverity = jdbc.queryForList("""
                select category, severity, count(*) as items, coalesce(sum(damage_value),0) as damage
                from public.assessment_categories where assessment_id = ?
                group by category, severity order by category, severity
                """, id);
        out.put("severity_breakdown", bySeverity);
        return out;
    }

    // ─── internals ───

    private void insertCategoryItems(long assessmentId, List<Map<String, Object>> categories) {
        for (Map<String, Object> category : categories) {
            String name = String.valueOf(category.get("category"));
            if (!(category.get("items") instanceof List<?> items) || items.isEmpty()) {
                continue;
            }
            for (Object raw : items) {
                @SuppressWarnings("unchecked")
                Map<String, Object> item = (Map<String, Object>) raw;
                String severity = item.get("severity") == null ? "Moderate" : String.valueOf(item.get("severity"));
                if (!SEVERITIES.contains(severity)) {
                    throw new BusinessRuleException("Severity must be Minor, Moderate or Severe.");
                }
                jdbc.update("""
                        insert into public.assessment_categories(assessment_id, category, subcategory,
                            damage_description, quantity_damaged, unit, damage_value, severity,
                            created_at, updated_at)
                        values (?,?,?,?,?,?,?,?,now(),now())
                        """, assessmentId, name, item.get("subcategory"), item.get("description"),
                        item.get("quantity") == null ? null : (int) dbl(item.get("quantity")),
                        item.get("unit"), dbl(item.get("estimated_value")), severity);
            }
        }
    }

    /** Requests ride the standard allocation pipeline, chained to the V24 engine. */
    private void createResourceRequests(long assessmentId, long incidentId,
                                        List<Map<String, Object>> requests, String notes) {
        Long userId = users.actingUserId();
        for (Map<String, Object> request : requests) {
            double quantity = dbl(request.get("quantity"));
            if (quantity <= 0) {
                continue; // source rule: zero-quantity lines are silently skipped
            }
            String priority = request.get("priority") == null ? "Medium" : String.valueOf(request.get("priority"));
            if (!PRIORITIES.contains(priority)) {
                throw new BusinessRuleException("Priority must be Low, Medium, High or Critical.");
            }
            String unit = jdbc.queryForObject("select coalesce(unit_of_measure,'units') from public.resources where id = ?",
                    String.class, (long) dbl(request.get("resource_id")));
            Long allocationId = jdbc.queryForObject("""
                    insert into public.allocated_resources(incident_id, assessment_id, resource_id,
                        quantity_requested, quantity_allocated, unit_of_measure, justification_for_request,
                        status, requested_by, allocation_date, created_at, updated_at)
                    values (?,?,?,?,?,?,?, 'Requested', ?, now(), now(), now()) returning id
                    """, Long.class, incidentId, assessmentId, (long) dbl(request.get("resource_id")),
                    quantity, quantity, unit,
                    "[" + priority + "] " + (request.get("reason") == null ? "Damage assessment requirement"
                            : String.valueOf(request.get("reason")))
                            + (notes == null ? "" : " — " + notes),
                    userId);
            approvals.initialize("resource_allocation", allocationId, null);
        }
    }

    private void storePhotos(long assessmentId, List<MultipartFile> photos) throws Exception {
        if (photos == null) {
            return;
        }
        Long userId = users.actingUserId();
        Path dir = storageRoot.resolve("assessments").resolve(String.valueOf(assessmentId));
        Files.createDirectories(dir);
        for (MultipartFile photo : photos) {
            if (photo.isEmpty()) {
                continue;
            }
            if (photo.getSize() > MAX_PHOTO_BYTES) {
                throw new BusinessRuleException("Each photo must be 5MB or smaller.");
            }
            String name = System.nanoTime() + "_" + (photo.getOriginalFilename() == null ? "photo.jpg"
                    : photo.getOriginalFilename().replaceAll("[^A-Za-z0-9._-]", "_"));
            photo.transferTo(dir.resolve(name));
            jdbc.update("""
                    insert into public.assessment_photos(assessment_id, photo_path, caption, uploaded_by,
                        created_at, updated_at)
                    values (?,?,?,?,now(),now())
                    """, assessmentId, "assessments/" + assessmentId + "/" + name,
                    photo.getOriginalFilename(), userId);
        }
    }

    private Map<String, Object> findOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.damage_assessments where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Assessment not found.");
        }
        return rows.get(0);
    }

    private static double sumItemValues(List<Map<String, Object>> categories) {
        double total = 0;
        for (Map<String, Object> category : categories) {
            if (category.get("items") instanceof List<?> items) {
                for (Object raw : items) {
                    if (raw instanceof Map<?, ?> item) {
                        total += dbl(item.get("estimated_value"));
                    }
                }
            }
        }
        return total;
    }

    private static List<Map<String, Object>> parseJsonList(String raw) {
        if (raw == null || raw.isBlank()) {
            return new ArrayList<>();
        }
        try {
            return JSON.readValue(raw, LIST_OF_MAPS);
        } catch (Exception e) {
            throw new BusinessRuleException("Malformed JSON payload.");
        }
    }

    private static long requireLong(Map<String, String> form, String field) {
        return (long) Double.parseDouble(require(form.get(field), field));
    }

    private static String requireIn(Map<String, String> form, String field, List<String> allowed) {
        String v = require(form.get(field), field);
        if (!allowed.contains(v)) {
            throw new BusinessRuleException("The selected " + field + " is invalid.");
        }
        return v;
    }

    private static String requireText(Map<String, String> form, String field) {
        String v = require(form.get(field), field);
        if (v.length() > 255) {
            throw new BusinessRuleException("The " + field + " may not be greater than 255 characters.");
        }
        return v;
    }

    private static String require(String v, String field) {
        if (v == null || v.isBlank()) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return v.trim();
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v.trim();
    }

    private static Double numOrNull(String v) {
        return v == null || v.isBlank() ? null : Double.parseDouble(v);
    }

    private static double dbl(Object v) {
        if (v instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return v == null ? 0 : Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return 0;
        }
    }
}
