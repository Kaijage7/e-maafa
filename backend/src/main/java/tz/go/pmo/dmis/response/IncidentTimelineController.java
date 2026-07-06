package tz.go.pmo.dmis.response;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Audit F12 — the unified per-incident OPERATIONS TIMELINE. Before this endpoint, an incident's
 * action tracing was split across disconnected trails (workflow histories on the show page, task
 * activity keyed by activation, situation reports, and dispatch/warehouse/communication/budget
 * journals living only inside their own modules). This is the READ-SIDE union of every trail that
 * GENUINELY carries incident linkage, merged into one time-descending master ops log. No schema
 * change and no writes — each module keeps journalling exactly where it always has.
 *
 * <p>Trails and their real linkage (verified against the live schema — nothing fabricated):
 * <ul>
 *   <li><b>workflow</b> — incident_workflow_histories.incident_id (FK to incidents).</li>
 *   <li><b>task</b> — task_activity_log.activation_id → response_activations.incident_id
 *       (response_activations.incident_id is UNIQUE, so an activation IS the incident's).</li>
 *   <li><b>situation_report</b> — incident_history_reports.incident_id (FK).</li>
 *   <li><b>allocation</b> — allocated_resources.incident_id (FK); one entry per request.</li>
 *   <li><b>dispatch</b> — dispatch_approvals.allocated_resource_id → allocated_resources.incident_id,
 *       PLUS the allocation's source_details fulfilment journal (a TEXT column holding the JSON
 *       array DispatchController appends agency/procurement/warehouse dispatch events to — the only
 *       place agency and procurement sourcing is journalled).</li>
 *   <li><b>warehouse</b> — stock_movements.incident_id (direct FK) OR stock_movements.allocation_id
 *       → allocated_resources.incident_id.</li>
 *   <li><b>sms / email</b> — sms_logs / email_logs rows with notification_type = 'incident_workflow'
 *       and notification_id = the incident id. That pairing is the writer's contract:
 *       IncidentWorkflowService dispatches Notice(type="incident_workflow", entityId=incidentId)
 *       and ExternalDeliveryService forwards (n.type(), n.entityId()) into both gateways' logs.
 *       Other notification_types reuse notification_id for OTHER entities, so they are excluded.</li>
 *   <li><b>budget</b> — budget_commitments.incident_id (FK).</li>
 * </ul>
 *
 * <p><b>Deliberately omitted:</b> command_role — the schema has no persisted per-incident command
 * role assignment table (the command center works off activations/tasks/DRFs), so there is no
 * genuine trail to union; inventing one would fabricate a join.
 *
 * <p>Visibility mirrors the incident show hub: incidents.view (the same permission the module guard
 * enforces on this prefix) + jurisdiction area scope — out-of-area reads 404, indistinguishable
 * from "not found". Empty trails contribute nothing (never 500); ordering is deterministic:
 * at desc, then source, then ref_id desc.
 */
@RestController
@RequestMapping("/v1/response/incidents")
public class IncidentTimelineController {

    /** Every source this log can carry, in canonical order (drives the payload's counts map). */
    static final List<String> SOURCES = List.of("workflow", "task", "situation_report",
            "allocation", "dispatch", "warehouse", "sms", "email", "budget");

    /** Per-trail SQL cap — bounds the merge work; far above any real per-incident volume. */
    private static final int TRAIL_CAP = 500;

    private static final DateTimeFormatter DISPLAY =
            DateTimeFormatter.ofPattern("dd MMM uuuu, HH:mm", Locale.ENGLISH).withZone(ZoneId.systemDefault());

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> JOURNAL = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;

    public IncidentTimelineController(JdbcTemplate jdbc, JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
    }

    /** One merged timeline entry (record keeps the raw Instant for deterministic sorting). */
    private record OpsEntry(Instant at, String source, String actor, String title, String detail, long refId) {
        Map<String, Object> toMap() {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("at", at == null ? null : at.toString());
            m.put("at_display", at == null ? null : DISPLAY.format(at));
            m.put("source", source);
            m.put("actor", actor);
            m.put("title", title);
            m.put("detail", detail);
            m.put("ref_id", refId);
            return m;
        }
    }

    @GetMapping("/{id}/ops-timeline")
    @PreAuthorize(Authz.PERM_INCIDENT_VIEW)
    public Map<String, Object> opsTimeline(@PathVariable long id,
                                           @RequestParam(required = false) String source,
                                           @RequestParam(defaultValue = "100") int limit) {
        if (source != null && !source.isBlank() && !SOURCES.contains(source)) {
            throw new BusinessRuleException("Unknown timeline source '" + source
                    + "'. Valid sources: " + String.join(", ", SOURCES) + ".");
        }
        assertVisible(id);
        int cappedLimit = Math.min(Math.max(1, limit), TRAIL_CAP);

        List<OpsEntry> all = new ArrayList<>();
        all.addAll(workflowTrail(id));
        all.addAll(taskTrail(id));
        all.addAll(situationReportTrail(id));
        all.addAll(allocationTrail(id));
        all.addAll(dispatchTrail(id));
        all.addAll(warehouseTrail(id));
        all.addAll(smsTrail(id));
        all.addAll(emailTrail(id));
        all.addAll(budgetTrail(id));

        // Deterministic master order: newest first, then source name, then ref desc (null at → last).
        Comparator<OpsEntry> newestFirst = Comparator.comparing(OpsEntry::at,
                Comparator.nullsLast(Comparator.<Instant>reverseOrder()));
        all.sort(newestFirst.thenComparing(OpsEntry::source)
                .thenComparing(Comparator.comparingLong(OpsEntry::refId).reversed()));

        // Per-source counts over the FULL log (the UI's filter chips), regardless of ?source=.
        Map<String, Long> counts = new LinkedHashMap<>();
        for (String s : SOURCES) {
            counts.put(s, all.stream().filter(e -> e.source().equals(s)).count());
        }

        List<OpsEntry> filtered = (source == null || source.isBlank()) ? all
                : all.stream().filter(e -> e.source().equals(source)).toList();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("incident_id", id);
        out.put("sources", counts);
        out.put("total", filtered.size());
        out.put("entries", filtered.stream().limit(cappedLimit).map(OpsEntry::toMap).toList());
        return out;
    }

    /** Same visibility contract as the incident show hub: in-area (or national) or 404. */
    private void assertVisible(long id) {
        StringBuilder where = new StringBuilder("i.id = ?");
        List<Object> params = new ArrayList<>();
        params.add(id);
        jurisdiction.appendAreaScope("i", where, params);
        Long found = jdbc.queryForObject("select count(*) from public.incidents i where " + where,
                Long.class, params.toArray());
        if (found == null || found == 0) {
            throw new ResourceNotFoundException("Incident not found.");
        }
    }

    // ─── Trail: workflow — incident_workflow_histories.incident_id ───

    private List<OpsEntry> workflowTrail(long incidentId) {
        List<OpsEntry> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList("""
                select h.id, h.created_at, h.action, h.to_status, h.comments, h.performed_by_role,
                       u.name as actor
                from public.incident_workflow_histories h
                left join public.users u on u.id = h.user_id
                where h.incident_id = ?
                order by h.created_at desc limit %d
                """.formatted(TRAIL_CAP), incidentId)) {
            String title = humanize(str(r.get("action"))) + " → "
                    + IncidentOptions.workflowStatusLabel(str(r.get("to_status")));
            String detail = joinParts("As " + str(r.get("performed_by_role")), str(r.get("comments")));
            out.add(new OpsEntry(instantOf(r.get("created_at")), "workflow", str(r.get("actor")),
                    title, detail, longOf(r.get("id"))));
        }
        return out;
    }

    // ─── Trail: task — task_activity_log.activation_id → response_activations.incident_id (UNIQUE) ───

    private List<OpsEntry> taskTrail(long incidentId) {
        List<OpsEntry> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList("""
                select t.id, t.created_at, t.action, t.message, t.old_value, t.new_value,
                       u.name as actor, it.title as task_title, s.name as stakeholder_name
                from public.task_activity_log t
                join public.response_activations ra on ra.id = t.activation_id
                left join public.users u on u.id = t.user_id
                left join public.incident_tasks it on it.id = t.task_id
                left join public.stakeholders s on s.id = t.stakeholder_id
                where ra.incident_id = ?
                order by t.created_at desc limit %d
                """.formatted(TRAIL_CAP), incidentId)) {
            String taskTitle = str(r.get("task_title"));
            String title = humanize(str(r.get("action"))) + (taskTitle == null ? "" : ": " + taskTitle);
            String change = r.get("old_value") == null && r.get("new_value") == null ? null
                    : str(r.get("old_value")) + " → " + str(r.get("new_value"));
            String detail = joinParts(str(r.get("message")), change,
                    r.get("stakeholder_name") == null ? null : "Stakeholder: " + str(r.get("stakeholder_name")));
            out.add(new OpsEntry(instantOf(r.get("created_at")), "task", str(r.get("actor")),
                    title, detail, longOf(r.get("id"))));
        }
        return out;
    }

    // ─── Trail: situation_report — incident_history_reports.incident_id ───

    private List<OpsEntry> situationReportTrail(long incidentId) {
        List<OpsEntry> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList("""
                select hr.id, hr.created_at, hr.deaths_total, hr.injured_total, hr.missing_total,
                       hr.displaced, hr.remarks, u.name as actor
                from public.incident_history_reports hr
                left join public.users u on u.id = hr.user_id
                where hr.incident_id = ?
                order by hr.created_at desc limit %d
                """.formatted(TRAIL_CAP), incidentId)) {
            String figures = "Deaths " + r.get("deaths_total") + " · Injured " + r.get("injured_total")
                    + " · Missing " + r.get("missing_total") + " · Displaced " + r.get("displaced");
            out.add(new OpsEntry(instantOf(r.get("created_at")), "situation_report", str(r.get("actor")),
                    "Situation report recorded", joinParts(figures, str(r.get("remarks"))), longOf(r.get("id"))));
        }
        return out;
    }

    // ─── Trail: allocation — allocated_resources.incident_id ───

    private List<OpsEntry> allocationTrail(long incidentId) {
        List<OpsEntry> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList("""
                select ar.id, ar.created_at, ar.status, ar.quantity_requested, ar.unit_of_measure,
                       ar.justification_for_request, r.name as resource_name, u.name as actor
                from public.allocated_resources ar
                join public.resources r on r.id = ar.resource_id
                left join public.users u on u.id = ar.requested_by
                where ar.incident_id = ?
                order by ar.created_at desc limit %d
                """.formatted(TRAIL_CAP), incidentId)) {
            String title = "Resource requested: " + str(r.get("resource_name"))
                    + " — " + num(r.get("quantity_requested")) + " " + str(r.get("unit_of_measure"));
            String detail = joinParts("Status: " + str(r.get("status")), str(r.get("justification_for_request")));
            out.add(new OpsEntry(instantOf(r.get("created_at")), "allocation", str(r.get("actor")),
                    title, detail, longOf(r.get("id"))));
        }
        return out;
    }

    // ─── Trail: dispatch — dispatch_approvals → allocated_resources.incident_id,
    //     plus the allocation's source_details JSON fulfilment journal (agency/procurement events) ───

    private List<OpsEntry> dispatchTrail(long incidentId) {
        List<OpsEntry> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList("""
                select da.id, da.created_at, da.status, da.source_type, da.quantity, da.notes,
                       r.name as resource_name, u.name as actor
                from public.dispatch_approvals da
                join public.allocated_resources ar on ar.id = da.allocated_resource_id
                join public.resources r on r.id = ar.resource_id
                left join public.users u on u.id = da.requested_by
                where ar.incident_id = ? and da.deleted_at is null
                order by da.created_at desc limit %d
                """.formatted(TRAIL_CAP), incidentId)) {
            String title = "Dispatch approval — " + str(r.get("resource_name"))
                    + " (" + str(r.get("status")) + ")";
            String detail = joinParts("Source: " + humanize(str(r.get("source_type")))
                    + " · Qty " + num(r.get("quantity")), str(r.get("notes")));
            out.add(new OpsEntry(instantOf(r.get("created_at")), "dispatch", str(r.get("actor")),
                    title, detail, longOf(r.get("id"))));
        }
        out.addAll(sourceJournalTrail(incidentId));
        return out;
    }

    /**
     * The append-only fulfilment journal DispatchController keeps in allocated_resources.source_details
     * (a TEXT column; JSON array on journalled allocations, legacy "warehouse:N" strings otherwise —
     * non-array values are skipped, never parsed by force). Agency dispatches and procurement /
     * agency-request sourcing appear ONLY here. Each item carries its own ISO timestamp
     * (dispatched_at / requested_at); an item without one falls back to the allocation's created_at
     * so it still appears rather than silently vanishing.
     */
    private List<OpsEntry> sourceJournalTrail(long incidentId) {
        List<OpsEntry> out = new ArrayList<>();
        Map<Long, String> nameCache = new HashMap<>();
        for (Map<String, Object> r : jdbc.queryForList("""
                select ar.id, ar.created_at, ar.source_details, r.name as resource_name
                from public.allocated_resources ar
                join public.resources r on r.id = ar.resource_id
                where ar.incident_id = ? and ar.source_details like '[%%'
                order by ar.id desc limit %d
                """.formatted(TRAIL_CAP), incidentId)) {
            List<Map<String, Object>> journal;
            try {
                journal = JSON.readValue(str(r.get("source_details")), JOURNAL);
            } catch (Exception notAJsonJournal) {
                continue;   // legacy / free-text source_details: nothing to timeline
            }
            long allocationId = longOf(r.get("id"));
            String resource = str(r.get("resource_name"));
            for (Map<String, Object> item : journal) {
                boolean dispatched = item.get("quantity_dispatched") != null;
                String qty = num(dispatched ? item.get("quantity_dispatched") : item.get("quantity"));
                String sourceName = str(item.get("source_name"));
                String title = (dispatched ? "Dispatched: " : "Sourcing: ") + resource
                        + (sourceName == null ? " (" + humanize(str(item.get("source_type"))) + ")"
                                              : " — " + sourceName);
                String detail = joinParts(qty == null ? null : "Qty " + qty,
                        item.get("status") == null ? null : "Status: " + str(item.get("status")),
                        str(item.get("notes")));
                String actor = userName(nameCache,
                        item.get("dispatched_by") != null ? item.get("dispatched_by") : item.get("requested_by"));
                Instant at = journalInstant(item);
                out.add(new OpsEntry(at != null ? at : instantOf(r.get("created_at")), "dispatch",
                        actor, title, detail, allocationId));
            }
        }
        return out;
    }

    // ─── Trail: warehouse — stock_movements.incident_id OR stock_movements.allocation_id → incident ───

    private List<OpsEntry> warehouseTrail(long incidentId) {
        List<OpsEntry> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList("""
                select sm.id, sm.created_at, sm.movement_type, sm.quantity, sm.status, sm.notes, sm.reason,
                       coalesce(r.name, ii.item_name) as resource_name,
                       coalesce(wf.name, tf.name) as from_name, coalesce(wt.name, tt.name) as to_name,
                       u.name as actor
                from public.stock_movements sm
                left join public.allocated_resources ar on ar.id = sm.allocation_id
                left join public.resources r on r.id = sm.resource_id
                left join public.inventory_items ii on ii.id = sm.inventory_item_id
                left join public.warehouses wf on wf.id = sm.from_warehouse_id
                left join public.warehouses wt on wt.id = sm.to_warehouse_id
                left join public.temporary_warehouses tf on tf.id = sm.from_temporary_warehouse_id
                left join public.temporary_warehouses tt on tt.id = sm.to_temporary_warehouse_id
                left join public.users u on u.id = sm.user_id
                where sm.incident_id = ? or ar.incident_id = ?
                order by sm.created_at desc limit %d
                """.formatted(TRAIL_CAP), incidentId, incidentId)) {
            String resource = str(r.get("resource_name"));
            String title = humanize(str(r.get("movement_type"))) + " — " + num(r.get("quantity"))
                    + (resource == null ? "" : " × " + resource);
            String route = r.get("from_name") == null && r.get("to_name") == null ? null
                    : (r.get("from_name") == null ? "?" : str(r.get("from_name"))) + " → "
                      + (r.get("to_name") == null ? "field" : str(r.get("to_name")));
            String detail = joinParts(route, "Status: " + str(r.get("status")),
                    str(r.get("reason")), str(r.get("notes")));
            out.add(new OpsEntry(instantOf(r.get("created_at")), "warehouse", str(r.get("actor")),
                    title, detail, longOf(r.get("id"))));
        }
        return out;
    }

    // ─── Trail: sms — sms_logs(notification_type='incident_workflow', notification_id=incident) ───

    private List<OpsEntry> smsTrail(long incidentId) {
        List<OpsEntry> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList("""
                select s.id, s.created_at, s.recipient_phone, s.status, s.message
                from public.sms_logs s
                where s.notification_type = 'incident_workflow' and s.notification_id = ?
                order by s.created_at desc limit %d
                """.formatted(TRAIL_CAP), incidentId)) {
            String title = "SMS to " + str(r.get("recipient_phone")) + " (" + str(r.get("status")) + ")";
            out.add(new OpsEntry(instantOf(r.get("created_at")), "sms", "System",
                    title, str(r.get("message")), longOf(r.get("id"))));
        }
        return out;
    }

    // ─── Trail: email — email_logs(notification_type='incident_workflow', notification_id=incident) ───

    private List<OpsEntry> emailTrail(long incidentId) {
        List<OpsEntry> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList("""
                select e.id, e.created_at, e.recipient_email, e.recipient_name, e.subject, e.status,
                       u.name as actor
                from public.email_logs e
                left join public.users u on u.id = e.sent_by
                where e.notification_type = 'incident_workflow' and e.notification_id = ?
                order by e.created_at desc limit %d
                """.formatted(TRAIL_CAP), incidentId)) {
            String title = "Email: " + str(r.get("subject")) + " (" + str(r.get("status")) + ")";
            String to = r.get("recipient_name") == null ? str(r.get("recipient_email"))
                    : str(r.get("recipient_name")) + " <" + str(r.get("recipient_email")) + ">";
            String actor = r.get("actor") == null ? "System" : str(r.get("actor"));
            out.add(new OpsEntry(instantOf(r.get("created_at")), "email", actor,
                    title, "To " + to, longOf(r.get("id"))));
        }
        return out;
    }

    // ─── Trail: budget — budget_commitments.incident_id ───

    private List<OpsEntry> budgetTrail(long incidentId) {
        List<OpsEntry> out = new ArrayList<>();
        for (Map<String, Object> r : jdbc.queryForList("""
                select bc.id, bc.created_at, bc.amount, bc.status, bc.purpose, bc.payee,
                       bl.category as line_category, u.name as actor
                from public.budget_commitments bc
                join public.budget_lines bl on bl.id = bc.budget_line_id
                left join public.users u on u.id = bc.requested_by
                where bc.incident_id = ?
                order by bc.created_at desc limit %d
                """.formatted(TRAIL_CAP), incidentId)) {
            String title = "Budget commitment — TZS " + money(r.get("amount"))
                    + " (" + str(r.get("status")) + ")";
            String detail = joinParts("Line: " + str(r.get("line_category")), str(r.get("purpose")),
                    r.get("payee") == null ? null : "Payee: " + str(r.get("payee")));
            out.add(new OpsEntry(instantOf(r.get("created_at")), "budget", str(r.get("actor")),
                    title, detail, longOf(r.get("id"))));
        }
        return out;
    }

    // ─── Helpers ───

    /** Resolve a users.id from a source_details journal item to a display name (cached per request). */
    private String userName(Map<Long, String> cache, Object idObj) {
        if (!(idObj instanceof Number n)) {
            return null;
        }
        return cache.computeIfAbsent(n.longValue(), uid -> {
            List<String> names = jdbc.queryForList("select name from public.users where id = ?", String.class, uid);
            return names.isEmpty() ? "User #" + uid : names.get(0);
        });
    }

    /** Journal items self-timestamp as ISO strings (dispatched_at / requested_at / approved_at). */
    private static Instant journalInstant(Map<String, Object> item) {
        for (String key : List.of("dispatched_at", "requested_at", "approved_at", "delivered_at")) {
            if (item.get(key) instanceof String s && !s.isBlank()) {
                try {
                    return OffsetDateTime.parse(s).toInstant();
                } catch (DateTimeParseException ignoredKeepScanning) {
                    // try the next timestamp key
                }
            }
        }
        return null;
    }

    private static Instant instantOf(Object at) {
        if (at instanceof OffsetDateTime odt) {
            return odt.toInstant();
        }
        if (at instanceof java.sql.Timestamp ts) {
            return ts.toInstant();
        }
        if (at instanceof Instant i) {
            return i;
        }
        return null;
    }

    private static long longOf(Object v) {
        return v instanceof Number n ? n.longValue() : 0L;
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    /** "1500.00" → "1500", "2.50" → "2.5" — tidy quantities for the log line. */
    private static String num(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof BigDecimal bd) {
            return bd.stripTrailingZeros().toPlainString();
        }
        return String.valueOf(v);
    }

    private static String money(Object v) {
        if (v instanceof BigDecimal bd) {
            return String.format(Locale.ENGLISH, "%,.2f", bd);
        }
        return v == null ? "0" : String.valueOf(v);
    }

    /** Join the non-blank fragments with a middle dot — keeps detail lines compact and null-safe. */
    private static String joinParts(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p == null || p.isBlank() || p.endsWith(": null")) {
                continue;
            }
            if (sb.length() > 0) {
                sb.append(" · ");
            }
            sb.append(p);
        }
        return sb.length() == 0 ? null : sb.toString();
    }

    private static String humanize(String key) {
        if (key == null) {
            return "";
        }
        String spaced = key.replace('_', ' ').trim();
        return spaced.isEmpty() ? ""
                : Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }
}
