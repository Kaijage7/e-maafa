package tz.go.pmo.dmis.onehealth;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.ResponseEntity;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import org.springframework.security.access.prepost.PreAuthorize;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Port of OneHealth\OneHealthActionTrackingController: action items per event,
 * progress updates that roll up into the event's completion percentage, and the
 * Closure & Archive workflow.
 *
 * OH-11 fix: the source gates close/archive on canBeEditedBy() which is always
 * false — here they are gated by the PMO-role semantics (locally permitted).
 */
@RestController
@RequestMapping("/v1/onehealth")
public class OneHealthActionTrackingController {

    private final JdbcTemplate jdbc;
    private final OneHealthEventService service;

    public OneHealthActionTrackingController(JdbcTemplate jdbc, OneHealthEventService service) {
        this.jdbc = jdbc;
        this.service = service;
    }

    /** Action tracking index payload for an event. */
    @GetMapping("/events/{eventId}/actions")
    public Map<String, Object> index(@PathVariable long eventId) {
        Map<String, Object> ev = service.findEventOr404(eventId);

        List<Map<String, Object>> actions = jdbc.queryForList("""
                select a.*, d.directive_title, s.organization as stakeholder_organization,
                    s.name as stakeholder_name, u.name as updated_by_name
                from public.oh_action_trackings a
                left join public.oh_directives d on d.id = a.directive_id
                left join public.stakeholders s on s.id = a.stakeholder_id
                left join public.users u on u.id = a.updated_by
                where a.event_id = ?
                order by a.id
                """, eventId);
        for (Map<String, Object> a : actions) {
            a.put("target_date_display", a.get("target_date") == null ? null
                    : OneHealthEventService.formatDate((java.sql.Date) a.get("target_date")));
            a.put("completed_date_display", a.get("completed_date") == null ? null
                    : OneHealthEventService.formatDate((java.sql.Date) a.get("completed_date")));
        }

        List<Map<String, Object>> directives = jdbc.queryForList(
                "select id, directive_title from public.oh_directives where event_id = ? and deleted_at is null order by id", eventId);
        Long areaId = ev.get("area_of_concern_id") == null ? null : ((Number) ev.get("area_of_concern_id")).longValue();
        List<Map<String, Object>> stakeholders = areaId == null ? List.of() : jdbc.queryForList("""
                select s.id, s.organization, s.name from public.stakeholders s
                join public.oh_area_stakeholder asx on asx.stakeholder_id = s.id
                where asx.area_of_concern_id = ? and s.is_active = true order by s.id
                """, areaId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("event", Map.of(
                "id", ev.get("id"), "event_id", ev.get("event_id"),
                "event_title", ev.get("event_title") == null ? "" : ev.get("event_title"),
                "status", ev.get("status"),
                "completion_percentage", ev.get("completion_percentage") == null ? 0 : ev.get("completion_percentage")));
        out.put("actions", actions);
        out.put("directives", directives);
        out.put("stakeholders", stakeholders);
        return out;
    }

    /** Store a new action item (the "Add Action Item" modal). */
    @PreAuthorize(Authz.OH_OPERATE)
    @PostMapping("/events/{eventId}/actions")
    @Transactional
    public ResponseEntity<Map<String, Object>> store(@PathVariable long eventId, @RequestBody Map<String, Object> body) {
        service.findEventOr404(eventId);
        Map<String, List<String>> errors = new LinkedHashMap<>();
        String title = OneHealthEventService.strOf(body.get("action_title"));
        if (title == null) {
            errors.put("action_title", List.of("The action title field is required."));
        } else if (title.length() > 255) {
            errors.put("action_title", List.of("The action title must not be greater than 255 characters."));
        }
        Long directiveId = OneHealthEventService.longOf(body.get("directive_id"));
        if (directiveId != null && !exists("oh_directives", directiveId)) {
            errors.put("directive_id", List.of("The selected directive id is invalid."));
        }
        Long stakeholderId = OneHealthEventService.longOf(body.get("stakeholder_id"));
        if (stakeholderId != null && !exists("stakeholders", stakeholderId)) {
            errors.put("stakeholder_id", List.of("The selected stakeholder id is invalid."));
        }
        String targetDate = OneHealthEventService.strOf(body.get("target_date"));
        if (targetDate != null) {
            try {
                LocalDate.parse(targetDate);
            } catch (Exception e) {
                errors.put("target_date", List.of("The target date is not a valid date."));
            }
        }
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed.", "errors", errors));
        }
        jdbc.update("""
                insert into public.oh_action_trackings(event_id, directive_id, stakeholder_id, action_title,
                    action_description, target_date, remarks, status, completion_percentage, updated_by,
                    created_at, updated_at)
                values (?,?,?,?,?,?,?,'pending',0,?,now(),now())
                """, eventId, directiveId, stakeholderId, title,
                OneHealthEventService.strOf(body.get("action_description")),
                targetDate == null ? null : java.sql.Date.valueOf(LocalDate.parse(targetDate)),
                OneHealthEventService.strOf(body.get("remarks")),
                service.actingUserId());
        return ResponseEntity.ok(Map.of("success", true, "message", "Action tracking item created successfully."));
    }

    /** Edit an action item. */
    @PreAuthorize(Authz.OH_OPERATE)
    @PutMapping("/actions/{id}")
    @Transactional
    public ResponseEntity<Map<String, Object>> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> tracking = findActionOr404(id);
        Map<String, List<String>> errors = new LinkedHashMap<>();
        String title = OneHealthEventService.strOf(body.get("action_title"));
        if (title == null) {
            errors.put("action_title", List.of("The action title field is required."));
        }
        String status = OneHealthEventService.strOf(body.get("status"));
        if (status != null && !List.of("pending", "in_progress", "completed", "overdue").contains(status)) {
            errors.put("status", List.of("The selected status is invalid."));
        }
        Integer pct = body.get("completion_percentage") == null ? null
                : (int) Double.parseDouble(String.valueOf(body.get("completion_percentage")));
        if (pct != null && (pct < 0 || pct > 100)) {
            errors.put("completion_percentage", List.of("The completion percentage must be between 0 and 100."));
        }
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed.", "errors", errors));
        }

        String targetDate = OneHealthEventService.strOf(body.get("target_date"));
        String completedDate = OneHealthEventService.strOf(body.get("completed_date"));
        if ("completed".equals(status) && completedDate == null) {
            completedDate = LocalDate.now().toString();
        }
        jdbc.update("""
                update public.oh_action_trackings set
                    action_title = coalesce(?, action_title),
                    action_description = case when ? then ? else action_description end,
                    target_date = case when ? then ?::date else target_date end,
                    remarks = case when ? then ? else remarks end,
                    status = coalesce(?, status),
                    completion_percentage = coalesce(?, completion_percentage),
                    completed_date = case when ? then ?::date else completed_date end,
                    updated_by = ?, updated_at = now()
                where id = ?
                """,
                title,
                body.containsKey("action_description"), OneHealthEventService.strOf(body.get("action_description")),
                targetDate != null, targetDate,
                body.containsKey("remarks"), OneHealthEventService.strOf(body.get("remarks")),
                status, pct,
                completedDate != null, completedDate,
                service.actingUserId(), id);
        return ResponseEntity.ok(Map.of("success", true, "message", "Action item updated successfully."));
    }

    /** Quick progress slider — rolls the average up into the event completion. */
    @PreAuthorize(Authz.OH_OPERATE)
    @PostMapping("/actions/{id}/progress")
    @Transactional
    public ResponseEntity<Map<String, Object>> updateProgress(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> tracking = findActionOr404(id);
        Integer pct = body.get("completion_percentage") == null ? null
                : (int) Double.parseDouble(String.valueOf(body.get("completion_percentage")));
        if (pct == null || pct < 0 || pct > 100) {
            return ResponseEntity.unprocessableEntity().body(Map.of("success", false, "message", "Validation failed.",
                    "errors", Map.of("completion_percentage", List.of("The completion percentage must be between 0 and 100."))));
        }
        String status = (String) tracking.get("status");
        if (pct >= 100) {
            status = "completed";
        } else if (pct > 0) {
            status = "in_progress";
        }
        jdbc.update("""
                update public.oh_action_trackings set completion_percentage = ?, status = ?,
                    completed_date = ?, updated_by = ?, updated_at = now()
                where id = ?
                """, pct, status,
                "completed".equals(status) ? java.sql.Date.valueOf(LocalDate.now()) : null,
                service.actingUserId(), id);

        long eventId = ((Number) tracking.get("event_id")).longValue();
        Long avg = jdbc.queryForObject(
                "select coalesce(round(avg(completion_percentage)), 0) from public.oh_action_trackings where event_id = ?",
                Long.class, eventId);
        jdbc.update("update public.oh_events set completion_percentage = ?, updated_at = now() where id = ?", avg, eventId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("message", "Progress updated.");
        out.put("completion_percentage", pct);
        out.put("status", status);
        out.put("event_completion", avg);
        return ResponseEntity.ok(out);
    }

    /** Closure workflow (OH-11 fix: reachable for PMO sessions). */
    @PreAuthorize(Authz.OH_APPROVE)
    @PostMapping("/events/{eventId}/close")
    @Transactional
    public ResponseEntity<Map<String, Object>> closeEvent(@PathVariable long eventId, @RequestBody Map<String, Object> body) {
        Map<String, Object> ev = service.findEventOr404(eventId);
        String outcome = OneHealthEventService.strOf(body.get("outcome_summary"));
        if (outcome == null) {
            return ResponseEntity.unprocessableEntity().body(Map.of("success", false, "message", "Validation failed.",
                    "errors", Map.of("outcome_summary", List.of("The outcome summary field is required."))));
        }
        String closureDate = OneHealthEventService.strOf(body.get("closure_date"));
        jdbc.update("""
                update public.oh_events set status = 'closed', closure_date = ?, outcome_summary = ?,
                    lessons_learned = ?, completion_percentage = 100, updated_at = now()
                where id = ?
                """,
                java.sql.Date.valueOf(closureDate == null ? LocalDate.now().toString() : closureDate),
                outcome, OneHealthEventService.strOf(body.get("lessons_learned")), eventId);
        service.logWorkflow(eventId, service.actingUserId(), "closed", "closed", (String) ev.get("status"),
                OneHealthEventService.strOf(body.get("comments")) == null ? "Event closed" : OneHealthEventService.strOf(body.get("comments")));
        return ResponseEntity.ok(Map.of("success", true, "message", "Event has been closed successfully."));
    }

    /** Archive (only closed events). */
    @PreAuthorize(Authz.OH_APPROVE)
    @PostMapping("/events/{eventId}/archive")
    @Transactional
    public ResponseEntity<Map<String, Object>> archiveEvent(@PathVariable long eventId) {
        Map<String, Object> ev = service.findEventOr404(eventId);
        if (!"closed".equals(ev.get("status"))) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Only closed events can be archived."));
        }
        service.updateEventStatus(eventId, "closed", "archived", service.actingUserId(), "Event archived");
        return ResponseEntity.ok(Map.of("success", true, "message", "Event has been archived."));
    }

    // ─── helpers ───

    private Map<String, Object> findActionOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.oh_action_trackings where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Action item not found.");
        }
        return rows.get(0);
    }

    private boolean exists(String table, long id) {
        Long c = jdbc.queryForObject("select count(*) from public." + table + " where id = ?", Long.class, id);
        return c != null && c > 0;
    }
}
