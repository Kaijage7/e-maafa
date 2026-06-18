package tz.go.pmo.dmis.onehealth;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import org.springframework.security.access.prepost.PreAuthorize;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Port of OneHealth\OneHealthDirectiveController: registry with filters and KPI
 * stats, full show payload (acknowledgement + implementation tables), update with
 * stakeholder sync, acknowledge, escalate (SMS/email reminders — gateway wiring is
 * a deployment concern, recorded in logs locally), implementation responses with
 * audit trail, and the grouped implementation history.
 */
@RestController
@RequestMapping("/v1/onehealth/directives")
public class OneHealthDirectiveController {

    private static final Logger log = LoggerFactory.getLogger(OneHealthDirectiveController.class);

    private final JdbcTemplate jdbc;
    private final OneHealthEventService service;

    public OneHealthDirectiveController(JdbcTemplate jdbc, OneHealthEventService service) {
        this.jdbc = jdbc;
        this.service = service;
    }

    // ─── Index ───

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(required = false) String priority,
                                     @RequestParam(name = "event_id", required = false) Long eventId,
                                     @RequestParam(name = "date_from", required = false) String dateFrom,
                                     @RequestParam(name = "date_to", required = false) String dateTo,
                                     @RequestParam(required = false) String search,
                                     @RequestParam(required = false) String filter,
                                     @RequestParam(defaultValue = "1") int page) {
        StringBuilder where = new StringBuilder("d.deleted_at is null");
        List<Object> params = new ArrayList<>();
        if (notBlank(status)) {
            where.append(" and d.status = ?");
            params.add(status);
        }
        if (notBlank(priority)) {
            where.append(" and d.priority_level = ?");
            params.add(priority);
        }
        if (eventId != null) {
            where.append(" and d.event_id = ?");
            params.add(eventId);
        }
        if (notBlank(dateFrom)) {
            where.append(" and d.created_at >= ?::date");
            params.add(dateFrom);
        }
        if (notBlank(dateTo)) {
            where.append(" and d.created_at <= (?::date + interval '1 day' - interval '1 second')");
            params.add(dateTo);
        }
        if (notBlank(search)) {
            where.append(" and d.directive_title ilike ?");
            params.add("%" + search + "%");
        }
        Long userId = OneHealthEventService.currentUserDbId();
        if ("mine".equals(filter)) {
            where.append(" and d.issued_by = ?");
            params.add(userId == null ? -1L : userId);
        }
        // 'pending_ack' applies to stakeholder users only; PMO sessions have no stakeholder_id (source parity)

        long total = jdbc.queryForObject("select count(*) from public.oh_directives d where " + where,
                Long.class, params.toArray());
        int perPage = 15;
        int lastPage = (int) Math.max(1, Math.ceil(total / (double) perPage));
        int currentPage = Math.min(Math.max(1, page), lastPage);
        int offset = (currentPage - 1) * perPage;

        List<Object> listParams = new ArrayList<>(params);
        listParams.add(perPage);
        listParams.add(offset);
        List<Map<String, Object>> rows = new ArrayList<>();
        jdbc.query("""
                select d.id, d.event_id, d.directive_title, d.priority_level, d.deadline, d.status,
                    d.created_at, e.event_id as event_code, e.id as event_pk, u.name as issued_by_name,
                    (select count(*) from public.oh_directive_stakeholder ds where ds.directive_id = d.id) as total_sth,
                    (select count(*) from public.oh_directive_stakeholder ds where ds.directive_id = d.id
                        and ds.acknowledgement_status = 'acknowledged') as acknowledged,
                    (select count(*) from public.oh_directive_stakeholder ds where ds.directive_id = d.id
                        and ds.acknowledgement_status = 'declined') as declined,
                    (select coalesce(round(avg(ds.implementation_percentage)), 0)
                        from public.oh_directive_stakeholder ds where ds.directive_id = d.id) as avg_pct
                from public.oh_directives d
                join public.oh_events e on e.id = d.event_id
                left join public.users u on u.id = d.issued_by
                where %s
                order by d.created_at desc
                limit ? offset ?
                """.formatted(where), rs -> {
            long totalSth = rs.getLong("total_sth");
            long acknowledged = rs.getLong("acknowledged");
            long declined = rs.getLong("declined");
            java.sql.Date deadline = rs.getDate("deadline");
            String st = rs.getString("status");
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("event_pk", rs.getLong("event_pk"));
            m.put("event_code", rs.getString("event_code"));
            m.put("directive_title", rs.getString("directive_title"));
            m.put("priority_level", rs.getString("priority_level"));
            m.put("deadline", OneHealthEventService.formatDate(deadline));
            m.put("is_overdue", deadline != null && deadline.toLocalDate().isBefore(LocalDate.now())
                    && !"completed".equals(st));
            m.put("status", st);
            m.put("issued_by_name", rs.getString("issued_by_name"));
            m.put("ack_total", totalSth);
            m.put("ack_acknowledged", acknowledged);
            m.put("ack_pending", totalSth - acknowledged - declined);
            m.put("impl_avg_percentage", totalSth > 0 ? rs.getLong("avg_pct") : 0);
            rows.add(m);
        }, listParams.toArray());

        Map<String, Object> stats = jdbc.queryForMap("""
                select count(*) as total,
                    count(*) filter (where status = 'issued') as issued,
                    count(*) filter (where status in ('acknowledged','in_progress')) as in_progress,
                    count(*) filter (where status = 'completed') as completed,
                    count(*) filter (where status = 'overdue') as overdue
                from public.oh_directives where deleted_at is null
                """);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", rows);
        out.put("currentPage", currentPage);
        out.put("lastPage", lastPage);
        out.put("total", total);
        out.put("firstItem", total == 0 ? null : offset + 1);
        out.put("lastItem", total == 0 ? null : offset + rows.size());
        out.put("stats", stats);
        out.put("my_pending", 0); // stakeholder-session concept; PMO sessions always 0 (source parity)
        return out;
    }

    // ─── Show ───

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        Map<String, Object> d = findOr404(id);
        long eventId = ((Number) d.get("event_id")).longValue();

        Map<String, Object> event = jdbc.queryForMap("""
                select e.id, e.event_id, e.event_type, e.area_of_concern_id, e.status
                from public.oh_events e where e.id = ?
                """, eventId);
        event.put("is_ew_alert", "ew_alert".equals(event.get("event_type")));

        String issuedByName = jdbc.query("select name from public.users where id = ?",
                rs -> rs.next() ? rs.getString(1) : null,
                d.get("issued_by") == null ? -1L : ((Number) d.get("issued_by")).longValue());

        // Stakeholders with their pivot data (acknowledgement + implementation)
        List<Map<String, Object>> stakeholders = jdbc.queryForList("""
                select s.id, s.organization, s.name, s.email, s.phone,
                    ds.acknowledgement_status, ds.acknowledged_at, ds.response_notes,
                    ds.implementation_status, ds.implementation_percentage, ds.implementation_notes,
                    ds.last_update_at
                from public.oh_directive_stakeholder ds
                join public.stakeholders s on s.id = ds.stakeholder_id
                where ds.directive_id = ?
                order by s.organization
                """, id);
        for (Map<String, Object> s : stakeholders) {
            s.put("acknowledged_at", formatTs(s.get("acknowledged_at")));
            s.put("last_update_at", formatTs(s.get("last_update_at")));
        }

        long total = stakeholders.size();
        long acknowledged = stakeholders.stream().filter(s -> "acknowledged".equals(s.get("acknowledgement_status"))).count();
        long declined = stakeholders.stream().filter(s -> "declined".equals(s.get("acknowledgement_status"))).count();
        Map<String, Object> ack = new LinkedHashMap<>();
        ack.put("total", total);
        ack.put("acknowledged", acknowledged);
        ack.put("declined", declined);
        ack.put("pending", total - acknowledged - declined);

        long avgPct = total == 0 ? 0 : Math.round(stakeholders.stream()
                .mapToInt(s -> s.get("implementation_percentage") == null ? 0 : ((Number) s.get("implementation_percentage")).intValue())
                .average().orElse(0));
        Map<String, Object> impl = new LinkedHashMap<>();
        impl.put("total", total);
        impl.put("avgPercentage", avgPct);

        List<Map<String, Object>> actions = jdbc.queryForList("""
                select a.id, a.action_title, a.status, a.completion_percentage, a.target_date
                from public.oh_action_trackings a where a.directive_id = ? order by a.id
                """, id);
        for (Map<String, Object> a : actions) {
            Object td = a.get("target_date");
            a.put("target_date", td == null ? null : OneHealthEventService.formatDate((java.sql.Date) td));
        }

        // Area stakeholders for the edit modal checklist
        Long areaId = event.get("area_of_concern_id") == null ? null : ((Number) event.get("area_of_concern_id")).longValue();
        List<Map<String, Object>> areaStakeholders = areaId == null ? List.of() : jdbc.queryForList("""
                select s.id, s.organization, s.name from public.stakeholders s
                join public.oh_area_stakeholder asx on asx.stakeholder_id = s.id
                where asx.area_of_concern_id = ? and s.is_active = true order by s.id
                """, areaId);
        List<Long> selectedIds = stakeholders.stream().map(s -> ((Number) s.get("id")).longValue()).toList();

        java.sql.Date deadline = (java.sql.Date) d.get("deadline");
        String st = (String) d.get("status");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", d.get("id"));
        out.put("directive_title", d.get("directive_title"));
        out.put("action_description", d.get("action_description"));
        out.put("deadline", deadline == null ? null : deadline.toLocalDate().toString());
        out.put("deadline_display", deadline == null ? null : OneHealthEventService.formatDate(deadline));
        out.put("priority_level", d.get("priority_level"));
        out.put("risk_level", d.get("risk_level"));
        out.put("coordination_notes", d.get("coordination_notes"));
        out.put("status", st);
        out.put("is_overdue", deadline != null && deadline.toLocalDate().isBefore(LocalDate.now()) && !"completed".equals(st));
        out.put("issued_by_name", issuedByName);
        out.put("issued_at", formatTs(d.get("issued_at")));
        out.put("event", event);
        out.put("stakeholders", stakeholders);
        out.put("acknowledgement", ack);
        out.put("implementation", impl);
        out.put("action_trackings", actions);
        out.put("area_stakeholders", areaStakeholders);
        out.put("selected_stakeholder_ids", selectedIds);
        // Local sessions act as Super Admin → both panels available, as in the source for admins
        out.put("can_edit", true);
        out.put("can_respond", true);
        return out;
    }

    // ─── Update (edit modal) ───

    @PreAuthorize(Authz.OH_OPERATE)
    @PutMapping("/{id}")
    @Transactional
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> update(@PathVariable long id, @RequestBody Map<String, Object> body) {
        findOr404(id);
        Map<String, List<String>> errors = new LinkedHashMap<>();
        String title = OneHealthEventService.strOf(body.get("directive_title"));
        String description = OneHealthEventService.strOf(body.get("action_description"));
        String deadline = OneHealthEventService.strOf(body.get("deadline"));
        String priority = OneHealthEventService.strOf(body.get("priority_level"));
        String risk = OneHealthEventService.strOf(body.get("risk_level"));
        String notes = OneHealthEventService.strOf(body.get("coordination_notes"));
        String status = OneHealthEventService.strOf(body.get("status"));

        if (title == null) {
            add(errors, "directive_title", "The directive title field is required.");
        }
        if (description == null) {
            add(errors, "action_description", "The action description field is required.");
        }
        if (priority == null) {
            add(errors, "priority_level", "The priority level field is required.");
        } else if (!List.of("low", "medium", "high", "critical").contains(priority)) {
            add(errors, "priority_level", "The selected priority level is invalid.");
        }
        if (risk != null && !List.of("low", "moderate", "high", "very_high").contains(risk)) {
            add(errors, "risk_level", "The selected risk level is invalid.");
        }
        if (status != null && !List.of("draft", "issued", "acknowledged", "in_progress", "completed", "overdue").contains(status)) {
            add(errors, "status", "The selected status is invalid.");
        }
        if (deadline != null) {
            try {
                LocalDate.parse(deadline);
            } catch (Exception e) {
                add(errors, "deadline", "The deadline is not a valid date.");
            }
        }
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed.", "errors", errors));
        }

        jdbc.update("""
                update public.oh_directives set directive_title = ?, action_description = ?, deadline = ?,
                    priority_level = ?, risk_level = ?, coordination_notes = ?,
                    status = coalesce(?, status), updated_at = now()
                where id = ?
                """, title, description,
                deadline == null ? null : java.sql.Date.valueOf(LocalDate.parse(deadline)),
                priority, risk, notes, status, id);

        Object raw = body.get("stakeholder_ids");
        if (raw instanceof List<?> list) {
            List<Long> ids = list.stream().map(OneHealthEventService::longOf).filter(java.util.Objects::nonNull).toList();
            // sync(): detach missing, attach new, keep existing pivot data
            if (ids.isEmpty()) {
                jdbc.update("delete from public.oh_directive_stakeholder where directive_id = ?", id);
            } else {
                String placeholders = String.join(",", ids.stream().map(x -> "?").toList());
                List<Object> delParams = new ArrayList<>();
                delParams.add(id);
                delParams.addAll(ids);
                jdbc.update("delete from public.oh_directive_stakeholder where directive_id = ? and stakeholder_id not in (" + placeholders + ")",
                        delParams.toArray());
                for (Long sId : ids) {
                    jdbc.update("""
                            insert into public.oh_directive_stakeholder(directive_id, stakeholder_id, created_at, updated_at)
                            values (?,?,now(),now()) on conflict (directive_id, stakeholder_id) do nothing
                            """, id, sId);
                }
            }
        }
        return ResponseEntity.ok(Map.of("success", true, "message", "Directive updated successfully."));
    }

    // ─── Acknowledge (stakeholder action) ───

    @PreAuthorize(Authz.OH_ACKNOWLEDGE)
    @PostMapping("/{id}/acknowledge")
    @Transactional
    public ResponseEntity<Map<String, Object>> acknowledge(@PathVariable long id,
                                                           @RequestBody(required = false) Map<String, Object> body) {
        findOr404(id);
        // PMO/admin sessions carry no stakeholder link — exact source response
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("success", false, "message", "You are not associated with a stakeholder."));
    }

    // ─── Escalate (reminders to unacknowledged) ───

    @PreAuthorize(Authz.OH_OPERATE)
    @PostMapping("/{id}/escalate")
    public Map<String, Object> escalate(@PathVariable long id) {
        Map<String, Object> d = findOr404(id);
        List<Map<String, Object>> unacknowledged = jdbc.queryForList("""
                select s.id, s.organization, s.phone, s.email
                from public.oh_directive_stakeholder ds
                join public.stakeholders s on s.id = ds.stakeholder_id
                where ds.directive_id = ? and ds.acknowledgement_status = 'pending'
                """, id);
        if (unacknowledged.isEmpty()) {
            return Map.of("success", true, "info", "All stakeholders have already acknowledged this directive.");
        }
        int smsSent = 0;
        int emailsSent = 0;
        for (Map<String, Object> s : unacknowledged) {
            if (s.get("phone") != null) {
                log.info("OH escalate: SMS reminder to {} ({}) for directive '{}' [gateway wiring deferred]",
                        s.get("organization"), s.get("phone"), d.get("directive_title"));
                smsSent++;
            }
            if (s.get("email") != null) {
                log.info("OH escalate: email reminder to {} ({}) for directive '{}' [gateway wiring deferred]",
                        s.get("organization"), s.get("email"), d.get("directive_title"));
                emailsSent++;
            }
        }
        return Map.of("success", true, "message",
                "Escalation sent to " + unacknowledged.size() + " unacknowledged stakeholder(s). SMS: "
                        + smsSent + ", Emails: " + emailsSent + ".");
    }

    // ─── Submit implementation response ───

    @PreAuthorize(Authz.OH_RESPOND)
    @PostMapping("/{id}/respond")
    @Transactional
    public ResponseEntity<Map<String, Object>> respond(@PathVariable long id, @RequestBody Map<String, Object> body) {
        findOr404(id);
        Map<String, List<String>> errors = new LinkedHashMap<>();
        String status = OneHealthEventService.strOf(body.get("implementation_status"));
        Integer pct = body.get("implementation_percentage") == null ? null
                : (int) Double.parseDouble(String.valueOf(body.get("implementation_percentage")));
        String notes = OneHealthEventService.strOf(body.get("update_notes"));
        String challenges = OneHealthEventService.strOf(body.get("challenges"));
        String expected = OneHealthEventService.strOf(body.get("expected_completion_date"));

        if (status == null) {
            add(errors, "implementation_status", "The implementation status field is required.");
        } else if (!List.of("not_started", "in_progress", "completed", "delayed", "blocked").contains(status)) {
            add(errors, "implementation_status", "The selected implementation status is invalid.");
        }
        if (pct == null) {
            add(errors, "implementation_percentage", "The implementation percentage field is required.");
        } else if (pct < 0 || pct > 100) {
            add(errors, "implementation_percentage", "The implementation percentage must be between 0 and 100.");
        }
        if (notes == null) {
            add(errors, "update_notes", "The update notes field is required.");
        }
        // OH-12 fix: admin sessions record the update on behalf of an assigned institution
        // (in the source this path 500s on the NOT NULL stakeholder_id column).
        Long stakeholderId = OneHealthEventService.longOf(body.get("stakeholder_id"));
        if (stakeholderId == null) {
            add(errors, "stakeholder_id", "Select the institution this update is for.");
        } else {
            Long attached = jdbc.queryForObject(
                    "select count(*) from public.oh_directive_stakeholder where directive_id = ? and stakeholder_id = ?",
                    Long.class, id, stakeholderId);
            if (attached == null || attached == 0) {
                add(errors, "stakeholder_id", "This directive was not sent to that institution.");
            }
        }
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed.", "errors", errors));
        }

        Long userId = service.actingUserId();
        jdbc.update("""
                insert into public.oh_directive_implementation_updates(directive_id, stakeholder_id, user_id,
                    implementation_status, implementation_percentage, update_notes, challenges,
                    expected_completion_date, created_at, updated_at)
                values (?,?,?,?,?,?,?,?,now(),now())
                """, id, stakeholderId, userId, status, pct, notes, challenges,
                expected == null ? null : java.sql.Date.valueOf(LocalDate.parse(expected)));

        // updateExistingPivot with the latest status (source behaviour, now reachable)
        jdbc.update("""
                update public.oh_directive_stakeholder set implementation_status = ?,
                    implementation_percentage = ?, implementation_notes = ?, last_update_at = now(),
                    last_update_by = ?, updated_at = now()
                where directive_id = ? and stakeholder_id = ?
                """, status, pct, notes, userId, id, stakeholderId);

        // Auto-complete if all stakeholders at 100%
        Long notComplete = jdbc.queryForObject("""
                select count(*) from public.oh_directive_stakeholder
                where directive_id = ? and implementation_percentage < 100
                """, Long.class, id);
        Long totalSth = jdbc.queryForObject(
                "select count(*) from public.oh_directive_stakeholder where directive_id = ?", Long.class, id);
        if (totalSth != null && totalSth > 0 && notComplete != null && notComplete == 0) {
            jdbc.update("update public.oh_directives set status = 'completed', updated_at = now() where id = ? and status != 'completed'", id);
        }
        return ResponseEntity.ok(Map.of("success", true, "message", "Implementation update submitted successfully."));
    }

    // ─── Implementation history (grouped by stakeholder) ───

    @GetMapping("/{id}/implementation-history")
    public Map<String, Object> implementationHistory(@PathVariable long id) {
        findOr404(id);
        Map<String, List<Map<String, Object>>> grouped = new LinkedHashMap<>();
        jdbc.query("""
                select iu.*, s.organization as stakeholder_organization, u.name as user_name
                from public.oh_directive_implementation_updates iu
                left join public.stakeholders s on s.id = iu.stakeholder_id
                left join public.users u on u.id = iu.user_id
                where iu.directive_id = ?
                order by iu.created_at desc
                """, rs -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("implementation_status", rs.getString("implementation_status"));
            m.put("implementation_percentage", rs.getInt("implementation_percentage"));
            m.put("update_notes", rs.getString("update_notes"));
            m.put("challenges", rs.getString("challenges"));
            m.put("expected_completion_date", OneHealthEventService.formatDate(rs.getDate("expected_completion_date")));
            m.put("stakeholder_organization", rs.getString("stakeholder_organization"));
            m.put("user_name", rs.getString("user_name"));
            m.put("created_at", OneHealthEventService.formatDateTime(rs.getTimestamp("created_at")));
            String key = String.valueOf(rs.getObject("stakeholder_id"));
            grouped.computeIfAbsent(key, k -> new ArrayList<>()).add(m);
        }, id);
        return Map.of("success", true, "updates", grouped);
    }

    // ─── helpers ───

    private Map<String, Object> findOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from public.oh_directives where id = ? and deleted_at is null", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Directive not found.");
        }
        return rows.get(0);
    }

    private static String formatTs(Object ts) {
        return ts instanceof java.sql.Timestamp t
                ? t.toLocalDateTime().format(java.time.format.DateTimeFormatter.ofPattern("dd MMM uuuu, HH:mm", java.util.Locale.ENGLISH))
                : null;
    }

    private static void add(Map<String, List<String>> errors, String field, String message) {
        errors.computeIfAbsent(field, k -> new ArrayList<>()).add(message);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.trim().isEmpty();
    }
}
