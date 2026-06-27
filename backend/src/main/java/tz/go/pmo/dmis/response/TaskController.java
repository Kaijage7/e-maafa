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
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.notification.NotificationService;

/**
 * Port of Response\TaskManagementController — incident task assignment and
 * tracking: board with statistics, create/edit with dependencies, reassign,
 * status changes with an activity log, calendar feed and my-tasks.
 *
 * Source bugs fixed: update() validated form keys that matched no model
 * column, so edits saved nothing; and priority was sorted
 * alphabetically — 'Low' outranked 'Medium').
 */
@RestController
@RequestMapping("/v1/response/tasks")
public class TaskController {

    private static final List<String> PRIORITIES = List.of("Low", "Medium", "High", "Critical");
    private static final List<String> STATUSES = List.of("To Do", "In Progress", "On Hold", "Completed", "Cancelled");
    /** Rank by urgency, not by the alphabet. */
    private static final String PRIORITY_ORDER =
            "case t.priority when 'Critical' then 0 when 'High' then 1 when 'Medium' then 2 else 3 end";

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService users;
    private final NotificationService notifications; // the ONE dispatcher (in-app feed + channels)
    private final JurisdictionScope jurisdiction; // row-level area scope for operational lists

    public TaskController(JdbcTemplate jdbc, IncidentWorkflowService users,
                          NotificationService notifications, JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.users = users;
        this.notifications = notifications;
        this.jurisdiction = jurisdiction;
    }

    // ─── Board / my-tasks / calendar ───

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false, name = "mine") Boolean mine) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        if (status != null && !status.isBlank()) {
            where.append(" and t.status = ?");
            params.add(status);
        }
        if (Boolean.TRUE.equals(mine)) {
            where.append(" and t.assigned_to_user_id = ?");
            params.add(users.actingUserId());
        }
        // Row-level area scope on the joined incident: a region/district officer sees only their own
        // area's tasks (plus area-less ones); national + non-area roles keep the full view.
        jurisdiction.appendAreaScopeSharedOrOwn("i", where, params);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("tasks", jdbc.queryForList("""
                select t.id, t.title, t.priority, t.status, t.due_date, t.completed_at, t.progress_percent,
                       t.created_at, i.title as incident_title, i.id as incident_id,
                       au.name as assigned_to_name, cu.name as created_by_name,
                       (t.status <> 'Completed' and t.due_date < now()) as is_overdue
                from public.incident_tasks t
                left join public.incidents i on i.id = t.incident_id
                left join public.users au on au.id = t.assigned_to_user_id
                left join public.users cu on cu.id = t.created_by_user_id
                where %s
                order by %s, t.due_date asc nulls last limit 200
                """.formatted(where, PRIORITY_ORDER), params.toArray()));
        // Aggregates must respect the same area scope as the board, otherwise an area officer's
        // statistics/by_priority/upcoming roll up the whole country. Join the incident and append the scope.
        StringBuilder statWhere = new StringBuilder("1=1");
        List<Object> statParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("i", statWhere, statParams);
        out.put("statistics", jdbc.queryForMap(("""
                select count(*) as total_tasks,
                       count(*) filter (where t.status = 'To Do') as pending_tasks,
                       count(*) filter (where t.status = 'In Progress') as in_progress_tasks,
                       count(*) filter (where t.status = 'Completed') as completed_tasks,
                       count(*) filter (where t.status <> 'Completed' and t.due_date < now()) as overdue_tasks,
                       round(100.0 * count(*) filter (where t.status = 'Completed') / greatest(count(*), 1), 1) as completion_rate
                from public.incident_tasks t
                left join public.incidents i on i.id = t.incident_id
                where %s
                """).formatted(statWhere), statParams.toArray()));
        out.put("by_priority", jdbc.queryForList(("""
                select t.priority, count(*) as count from public.incident_tasks t
                left join public.incidents i on i.id = t.incident_id
                where %s group by t.priority
                """).formatted(statWhere), statParams.toArray()));
        StringBuilder upWhere = new StringBuilder(
                "t.status <> 'Completed' and t.due_date between now() and now() + interval '7 days'");
        List<Object> upParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("i", upWhere, upParams);
        out.put("upcoming_deadlines", jdbc.queryForList(("""
                select t.id, t.title, t.priority, t.due_date, i.title as incident_title, u.name as assigned_to_name
                from public.incident_tasks t
                left join public.incidents i on i.id = t.incident_id
                left join public.users u on u.id = t.assigned_to_user_id
                where %s
                order by t.due_date limit 10
                """).formatted(upWhere), upParams.toArray()));
        return out;
    }

    /** Calendar feed: due-date events coloured by priority (calendarView's mapping). */
    @GetMapping("/calendar")
    public Map<String, Object> calendar() {
        StringBuilder sql = new StringBuilder("""
                select t.id, t.title, t.due_date::date as start, t.priority, t.status,
                       i.title as incident_title, u.name as assigned_to_name
                from public.incident_tasks t
                left join public.incidents i on i.id = t.incident_id
                left join public.users u on u.id = t.assigned_to_user_id
                where t.status <> 'Cancelled' and t.due_date is not null""");
        List<Object> params = new ArrayList<>();
        // Same area scope as the board: an area officer's calendar shows only their own area's tasks.
        jurisdiction.appendAreaScopeSharedOrOwn("i", sql, params);
        sql.append(" order by t.due_date");
        List<Map<String, Object>> events = jdbc.queryForList(sql.toString(), params.toArray());
        for (Map<String, Object> event : events) {
            event.put("color", switch (String.valueOf(event.get("priority"))) {
                case "Critical" -> "#dc3545";
                case "High" -> "#fd7e14";
                case "Medium" -> "#ffc107";
                case "Low" -> "#28a745";
                default -> "#6c757d";
            });
        }
        return Map.of("events", events);
    }

    @GetMapping("/form-data")
    public Map<String, Object> formData(@RequestParam(required = false) Long incident_id) {
        Map<String, Object> out = new LinkedHashMap<>();
        // Area scope on the picker: an area officer may only assign tasks to incidents in their own
        // district/region (or shared/null-area ones); national tier keeps the full list. Mirrors the board.
        StringBuilder incWhere = new StringBuilder("i.status in ('Active Response','Verified')");
        List<Object> incParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("i", incWhere, incParams);
        out.put("incidents", jdbc.queryForList(
                "select i.id, i.title, i.severity_level from public.incidents i where " + incWhere
                        + " order by i.severity_level limit 100",
                incParams.toArray()));
        // Source filters User::where('is_active', true); the local users read model
        // has no such column yet — every local account is assignable.
        out.put("users", jdbc.queryForList("select id, name from public.users order by name"));
        out.put("priorities", PRIORITIES);
        out.put("statuses", STATUSES);
        // Dependency candidates: other tasks of the same incident (edit()'s rule)
        out.put("available_dependencies", incident_id == null ? List.of() : jdbc.queryForList(
                "select id, title, status from public.incident_tasks where incident_id = ? order by id", incident_id));
        return out;
    }

    // ─── CRUD ───

    @PostMapping
    @PreAuthorize("hasAuthority('tasks.manage')")
    @Transactional
    public Map<String, Object> store(@RequestBody Map<String, Object> body) {
        long incidentId = lng(body.get("incident_id"), "incident_id");
        // A task may only be opened against an incident in the caller's own area (national sees all); an
        // out-of-area incident_id 404s rather than letting a district officer plant a task on another region.
        StringBuilder areaWhere = new StringBuilder("id = ?");
        List<Object> areaParams = new ArrayList<>();
        areaParams.add(incidentId);
        jurisdiction.appendAreaScope("", areaWhere, areaParams);
        if (jdbc.queryForList("select 1 from public.incidents where " + areaWhere, areaParams.toArray()).isEmpty()) {
            throw new ResourceNotFoundException("Incident not found.");
        }
        String title = requireMax255(body.get("task_title"), "task_title");
        String description = require(body.get("task_description"), "task_description");
        long assignedTo = lng(body.get("assigned_to_user_id"), "assigned_to_user_id");
        String priority = requireIn(body.get("priority"), PRIORITIES, "priority");
        String dueDate = require(body.get("due_date"), "due_date");
        // Source rule: new tasks must be due in the future (due_date after:now)
        if (!isFuture(dueDate)) {
            throw new BusinessRuleException("The due date must be a date after now.");
        }
        Long id = jdbc.queryForObject("""
                insert into public.incident_tasks(incident_id, title, description, assigned_to_user_id,
                    created_by_user_id, priority, status, due_date, notes, created_at, updated_at)
                values (?,?,?,?,?,?, 'To Do', ?::timestamptz, ?, now(), now()) returning id
                """, Long.class, incidentId, title, description, assignedTo, users.actingUserId(),
                priority, dueDate, str(body.get("notes")));
        saveDependencies(id, body.get("dependencies"));
        notifyAssignee(id, assignedTo, title);
        return Map.of("success", true, "id", id, "message", "Task created and assigned successfully");
    }

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        findOr404(id); // regression sweep: unknown ids must 404, not leak a 500
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("task", jdbc.queryForMap("""
                select t.*, i.title as incident_title, au.name as assigned_to_name, cu.name as created_by_name
                from public.incident_tasks t
                left join public.incidents i on i.id = t.incident_id
                left join public.users au on au.id = t.assigned_to_user_id
                left join public.users cu on cu.id = t.created_by_user_id
                where t.id = ?
                """, id));
        out.put("updates", jdbc.queryForList("""
                select tu.*, u.name as user_name from public.task_updates tu
                left join public.users u on u.id = tu.user_id
                where tu.task_id = ? order by tu.created_at desc
                """, id));
        out.put("dependencies", jdbc.queryForList("""
                select t.id, t.title, t.status, t.priority from public.task_dependencies d
                join public.incident_tasks t on t.id = d.depends_on_task_id where d.task_id = ?
                """, id));
        out.put("dependent_tasks", jdbc.queryForList("""
                select t.id, t.title, t.status, t.priority from public.task_dependencies d
                join public.incident_tasks t on t.id = d.task_id where d.depends_on_task_id = ?
                """, id));
        return out;
    }

    /** The form's fields map onto the real columns, so edits persist. */
    @PostMapping("/{id}")
    @PreAuthorize("hasAuthority('tasks.manage')")
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
        findOr404(id);
        jdbc.update("""
                update public.incident_tasks set title = ?, description = ?, assigned_to_user_id = ?,
                    priority = ?, due_date = ?::timestamptz, notes = coalesce(?, notes), updated_at = now()
                where id = ?
                """, requireMax255(body.get("task_title"), "task_title"),
                require(body.get("task_description"), "task_description"),
                lng(body.get("assigned_to_user_id"), "assigned_to_user_id"),
                requireIn(body.get("priority"), PRIORITIES, "priority"),
                require(body.get("due_date"), "due_date"), str(body.get("notes")), id);
        if (body.containsKey("dependencies")) {
            jdbc.update("delete from public.task_dependencies where task_id = ?", id);
            saveDependencies(id, body.get("dependencies"));
        }
        return Map.of("success", true, "message", "Task updated successfully");
    }

    // ─── Actions ───

    @PostMapping("/{id}/assign")
    @PreAuthorize("hasAuthority('tasks.manage')")
    @Transactional
    public Map<String, Object> assign(@PathVariable long id, @RequestBody Map<String, Object> body) {
        findOr404(id);
        long assignee = lng(body.get("assigned_to_user_id"), "assigned_to_user_id");
        String name = jdbc.queryForObject("select name from public.users where id = ?", String.class, assignee);
        jdbc.update("""
                update public.incident_tasks set assigned_to_user_id = ?, notes = coalesce(?, notes),
                    updated_at = now() where id = ?
                """, assignee, str(body.get("notes")), id);
        logUpdate(id, "Task reassigned to " + name, null);
        String title = jdbc.queryForObject("select title from public.incident_tasks where id = ?", String.class, id);
        notifyAssignee(id, assignee, title);
        return Map.of("success", true, "message", "Task assigned successfully");
    }

    @PostMapping("/{id}/status")
    @PreAuthorize("hasAuthority('tasks.manage')")
    @Transactional
    public Map<String, Object> updateStatus(@PathVariable long id, @RequestBody Map<String, Object> body) {
        Map<String, Object> task = findOr404(id);
        String status = requireIn(body.get("status"), STATUSES, "status");
        String notes = str(body.get("notes"));
        jdbc.update("""
                update public.incident_tasks set status = ?,
                    completed_at = case when ? = 'Completed' then now() else completed_at end,
                    progress_percent = case when ? = 'Completed' then 100 else progress_percent end,
                    notes = coalesce(?, notes), updated_at = now()
                where id = ?
                """, status, status, status, notes, id);
        logUpdate(id, "Status changed from " + task.get("status") + " to " + status, notes);
        if ("Completed".equals(status)) {
            notifyUnblockedDependents(id);
        }
        return Map.of("success", true, "message", "Task status updated successfully");
    }

    // ─── internals ───

    private void saveDependencies(long taskId, Object raw) {
        if (!(raw instanceof List<?> ids)) {
            return;
        }
        for (Object idObj : ids) {
            long dependsOn = (long) Double.parseDouble(String.valueOf(idObj));
            if (dependsOn == taskId) {
                throw new BusinessRuleException("A task cannot depend on itself.");
            }
            jdbc.update("""
                    insert into public.task_dependencies(task_id, depends_on_task_id, created_at)
                    values (?,?,now()) on conflict do nothing
                    """, taskId, dependsOn);
        }
    }

    private void logUpdate(long taskId, String message, String details) {
        jdbc.update("insert into public.task_updates(task_id, user_id, message, details, created_at) values (?,?,?,?,now())",
                taskId, users.actingUserId(), message, details);
    }

    private void notifyAssignee(long taskId, long userId, String title) {
        notifications.notifyUser(userId,
                NotificationService.Notice.inApp("task_assigned", "Task assigned to you",
                        "You have been assigned: " + title + " (task #" + taskId + ")",
                        "/m/response/tasks", "incident_task", taskId, "info"));
    }

    /** When the last blocker completes, tell the dependent task's assignee it is ready. */
    private void notifyUnblockedDependents(long completedTaskId) {
        List<Map<String, Object>> dependents = jdbc.queryForList("""
                select t.id, t.title, t.assigned_to_user_id from public.task_dependencies d
                join public.incident_tasks t on t.id = d.task_id
                where d.depends_on_task_id = ?
                """, completedTaskId);
        for (Map<String, Object> dependent : dependents) {
            Long blockers = jdbc.queryForObject("""
                    select count(*) from public.task_dependencies d
                    join public.incident_tasks t on t.id = d.depends_on_task_id
                    where d.task_id = ? and t.status <> 'Completed'
                    """, Long.class, dependent.get("id"));
            if (blockers != null && blockers == 0 && dependent.get("assigned_to_user_id") != null) {
                notifications.notifyUser(((Number) dependent.get("assigned_to_user_id")).longValue(),
                        NotificationService.Notice.inApp("task_ready", "Task ready to start",
                                "All dependencies are complete for: " + dependent.get("title"),
                                "/m/response/tasks", "incident_task",
                                ((Number) dependent.get("id")).longValue(), "info"));
            }
        }
    }

    private Map<String, Object> findOr404(long id) {
        // Jurisdiction visibility: an area officer may load (read OR mutate) only a task on an incident in their
        // own district/region (or a shared/null-area one); national tier sees all. Mirrors the board scope so
        // the detail endpoint can't leak another area's task. Out of area → 404.
        StringBuilder where = new StringBuilder("t.id = ?");
        List<Object> params = new ArrayList<>();
        params.add(id);
        jurisdiction.appendAreaScopeSharedOrOwn("i", where, params);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select t.* from public.incident_tasks t left join public.incidents i on i.id = t.incident_id where " + where,
                params.toArray());
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Task not found.");
        }
        return rows.get(0);
    }

    /** Accepts date-only, datetime-local or full ISO input; true when later than now. */
    private static boolean isFuture(String raw) {
        try {
            java.time.LocalDateTime due = raw.length() <= 10
                    ? java.time.LocalDate.parse(raw).atStartOfDay()
                    : java.time.LocalDateTime.parse(raw.length() == 16 ? raw + ":00" : raw.substring(0, 19));
            return due.isAfter(java.time.LocalDateTime.now());
        } catch (Exception e) {
            throw new BusinessRuleException("The due date is not a valid date.");
        }
    }

    private static String requireIn(Object v, List<String> allowed, String field) {
        String s = require(v, field);
        if (!allowed.contains(s)) {
            throw new BusinessRuleException("The selected " + field + " is invalid.");
        }
        return s;
    }

    private static String requireMax255(Object v, String field) {
        String s = require(v, field);
        if (s.length() > 255) {
            throw new BusinessRuleException("The " + field + " may not be greater than 255 characters.");
        }
        return s;
    }

    private static String require(Object v, String field) {
        String s = str(v);
        if (s == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return s;
    }

    private static long lng(Object v, String field) {
        if (v == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return (long) Double.parseDouble(String.valueOf(v));
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
