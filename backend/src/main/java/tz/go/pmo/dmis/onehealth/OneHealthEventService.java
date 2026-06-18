package tz.go.pmo.dmis.onehealth;

import java.sql.Date;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;

/**
 * Port of the source's OneHealthService event behaviours plus the OhEvent /
 * OhEventWorkflowHistory model helpers (event ID generation, status labels,
 * workflow logging). Directive issuing is included because the events index
 * screen issues directives from its kebab menu.
 */
@Service
public class OneHealthEventService {

    /** OhEvent::getStatuses() verbatim. */
    static final Map<String, String> STATUSES = new LinkedHashMap<>();
    static {
        STATUSES.put("submitted", "Submitted");
        STATUSES.put("under_review", "Under Review");
        STATUSES.put("directive_issued", "Directive Issued");
        STATUSES.put("disseminated", "Disseminated");
        STATUSES.put("monitoring", "Monitoring");
        STATUSES.put("closed", "Closed");
        STATUSES.put("archived", "Archived");
    }

    static String statusLabel(String status) {
        if (status == null) {
            return "";
        }
        return STATUSES.getOrDefault(status,
                status.substring(0, 1).toUpperCase(Locale.ROOT) + status.substring(1));
    }

    /** OhEventWorkflowHistory::getActionLabelAttribute() verbatim. */
    static String actionLabel(String action) {
        return switch (action == null ? "" : action) {
            case "created" -> "Event Created";
            case "submitted" -> "Event Submitted";
            case "reviewed" -> "Event Reviewed";
            case "directive_issued" -> "Directive Issued";
            case "disseminated" -> "Alert Disseminated";
            case "status_changed" -> "Status Changed";
            case "closed" -> "Event Closed";
            case "archived" -> "Event Archived";
            case "edited" -> "Event Edited";
            default -> action == null || action.isEmpty() ? ""
                    : action.substring(0, 1).toUpperCase(Locale.ROOT) + action.substring(1);
        };
    }

    static String actionBadgeClass(String action) {
        return switch (action == null ? "" : action) {
            case "created" -> "bg-info";
            case "submitted", "directive_issued" -> "bg-primary";
            case "reviewed", "edited" -> "bg-warning text-dark";
            case "disseminated" -> "bg-success";
            case "closed" -> "bg-dark";
            default -> "bg-secondary";
        };
    }

    static String actionIcon(String action) {
        return switch (action == null ? "" : action) {
            case "created" -> "fas fa-plus-circle";
            case "submitted" -> "fas fa-paper-plane";
            case "reviewed" -> "fas fa-search";
            case "directive_issued" -> "fas fa-gavel";
            case "disseminated" -> "fas fa-broadcast-tower";
            case "status_changed" -> "fas fa-exchange-alt";
            case "closed" -> "fas fa-flag-checkered";
            case "archived" -> "fas fa-archive";
            case "edited" -> "fas fa-edit";
            default -> "fas fa-circle";
        };
    }

    /** OhDirective::getStatusBadgeClassAttribute() verbatim. */
    static String directiveStatusBadgeClass(String status) {
        return switch (status == null ? "" : status) {
            case "issued" -> "bg-primary";
            case "acknowledged" -> "bg-info";
            case "in_progress" -> "bg-warning text-dark";
            case "completed" -> "bg-success";
            case "overdue" -> "bg-danger";
            default -> "bg-secondary";
        };
    }

    private static final DateTimeFormatter D_M_Y = DateTimeFormatter.ofPattern("dd MMM uuuu", Locale.ENGLISH);
    private static final DateTimeFormatter D_M_Y_HI = DateTimeFormatter.ofPattern("dd MMM uuuu HH:mm", Locale.ENGLISH);

    static String formatDate(java.sql.Date d) {
        return d == null ? null : d.toLocalDate().format(D_M_Y);
    }

    static String formatDateTime(Timestamp t) {
        return t == null ? null : t.toLocalDateTime().format(D_M_Y_HI);
    }

    private final JdbcTemplate jdbc;

    public OneHealthEventService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** OhEvent::generateEventId(): OH-YYYY-NNNNN, scanning soft-deleted rows too. */
    public String generateEventId() {
        String year = String.valueOf(LocalDate.now().getYear());
        String prefix = "OH-" + year + "-";
        Integer latest = jdbc.query(
                "select max(cast(substring(event_id from ?) as integer)) from public.oh_events where event_id like ?",
                rs -> rs.next() && rs.getObject(1) != null ? rs.getInt(1) : null,
                prefix.length() + 1, prefix + "%");
        int next = (latest == null ? 0 : latest) + 1;
        return String.format("OH-%s-%05d", year, next);
    }

    /**
     * OneHealthService::createEvent — insert the event as 'submitted', persist the
     * universal sections (human → health detail, animals → entries, environment →
     * environmental detail), the legacy category sub-form, and log workflow history.
     * Returns {id, event_id}.
     */
    @Transactional
    public Map<String, Object> createEvent(OhEventWriteRequest r) {
        String eventId = generateEventId();
        Long userId = actingUserId();

        Long id = jdbc.queryForObject("""
                insert into public.oh_events(event_id, stakeholder_id, area_of_concern_id, concern_item_id,
                    event_title, event_type, event_description, date_of_occurrence, recommendation,
                    region_id, district_id, ward_village, ward_id, latitude, longitude,
                    status, priority_level, risk_level, submitted_by, submitted_at, created_at, updated_at)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'submitted',?,?,?,now(),now(),now())
                returning id
                """, Long.class,
                eventId, r.getStakeholderId(), r.getAreaOfConcernId(), r.getConcernItemId(),
                r.getEventTitle(), r.getEventType(), r.getEventDescription(),
                Date.valueOf(LocalDate.parse(r.getDateOfOccurrence())), trimToNull(r.getRecommendation()),
                r.getRegionId(), r.getDistrictId(), trimToNull(r.getWardVillage()), r.getWardId(),
                r.getLatitude(), r.getLongitude(),
                trimToNull(r.getPriorityLevel()), trimToNull(r.getRiskLevel()), userId);

        // Universal Human Cases → health detail (only when at least one value is set)
        if (r.getHuman() != null && hasAnyValue(r.getHuman())) {
            Map<String, Object> h = r.getHuman();
            jdbc.update("""
                    insert into public.oh_event_health_details(event_id, cases_male, cases_female,
                        cases_children, cases_total, deaths, admitted, lab_results, created_at, updated_at)
                    values (?,?,?,?,?,?,?,?,now(),now())
                    """,
                    id, intOf(h.get("cases_male")), intOf(h.get("cases_female")), intOf(h.get("cases_children")),
                    intOf(h.get("cases_total")), intOf(h.get("deaths")), intOf(h.get("admitted")),
                    strOf(h.get("lab_results")));
        }

        // Universal Animal Entries (rows without a species are skipped, as in the source)
        if (r.getAnimals() != null) {
            for (Map<String, Object> a : r.getAnimals()) {
                String species = strOf(a.get("species"));
                if (species == null) {
                    continue;
                }
                jdbc.update("""
                        insert into public.oh_event_animal_entries(event_id, species, species_other,
                            cases, deaths, notes, created_at, updated_at)
                        values (?,?,?,?,?,?,now(),now())
                        """,
                        id, species, strOf(a.get("species_other")),
                        intOrZero(a.get("cases")), intOrZero(a.get("deaths")), strOf(a.get("notes")));
            }
        }

        // Universal Environment → environmental detail
        if (r.getEnvironment() != null && hasAnyValue(r.getEnvironment())) {
            Map<String, Object> e = r.getEnvironment();
            jdbc.update("""
                    insert into public.oh_event_environmental_details(event_id, hazard_id, weather_data,
                        temperature, rainfall, wind_speed, environmental_impact, created_at, updated_at)
                    values (?,?,?,?,?,?,?,now(),now())
                    """,
                    id, longOf(e.get("hazard_id")), strOf(e.get("weather_data")), strOf(e.get("temperature")),
                    strOf(e.get("rainfall")), strOf(e.get("wind_speed")), strOf(e.get("environmental_impact")));
        }

        // Legacy category-based sub-form (backward compat)
        if (r.getDetail() != null && hasAnyValue(r.getDetail())) {
            String category = jdbc.query(
                    "select category from public.oh_areas_of_concern where id = ?",
                    rs -> rs.next() ? rs.getString(1) : null, r.getAreaOfConcernId());
            createSubFormDetails(id, category, r.getDetail());
        }

        logWorkflow(id, userId, "created", "submitted", null, "Event reported and submitted");

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("event_id", eventId);
        return out;
    }

    /** OneHealthService::createSubFormDetails verbatim category dispatch. */
    private void createSubFormDetails(Long eventId, String category, Map<String, Object> d) {
        if (category == null) {
            return;
        }
        switch (category) {
            case "environmental" -> jdbc.update("""
                    insert into public.oh_event_environmental_details(event_id, hazard_id, weather_data,
                        temperature, rainfall, wind_speed, environmental_impact, created_at, updated_at)
                    values (?,?,?,?,?,?,?,now(),now())
                    """,
                    eventId, longOf(d.get("hazard_id")), strOf(d.get("weather_data")), strOf(d.get("temperature")),
                    strOf(d.get("rainfall")), strOf(d.get("wind_speed")), strOf(d.get("environmental_impact")));
            case "health" -> jdbc.update("""
                    insert into public.oh_event_health_details(event_id, disease_name, disease_status,
                        transmission_type, cases_male, cases_female, cases_children, cases_total, deaths,
                        admitted, animal_species, animal_cases, animal_deaths, lab_results, created_at, updated_at)
                    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,now(),now())
                    """,
                    eventId, strOf(d.get("disease_name")), strOf(d.get("disease_status")),
                    strOf(d.get("transmission_type")), intOrZero(d.get("cases_male")), intOrZero(d.get("cases_female")),
                    intOrZero(d.get("cases_children")), intOrZero(d.get("cases_total")), intOrZero(d.get("deaths")),
                    intOrZero(d.get("admitted")), strOf(d.get("animal_species")), intOrZero(d.get("animal_cases")),
                    intOrZero(d.get("animal_deaths")), strOf(d.get("lab_results")));
            case "agriculture" -> jdbc.update("""
                    insert into public.oh_event_agricultural_details(event_id, crop_livestock_type,
                        pest_disease_name, area_affected_ha, severity_level, impact_description,
                        farmers_affected, created_at, updated_at)
                    values (?,?,?,?,?,?,?,now(),now())
                    """,
                    eventId, strOf(d.get("crop_livestock_type")), strOf(d.get("pest_disease_name")),
                    numOf(d.get("area_affected_ha")), strOf(d.get("severity_level")),
                    strOf(d.get("impact_description")), intOrZero(d.get("farmers_affected")));
            case "food_safety" -> jdbc.update("""
                    insert into public.oh_event_food_safety_details(event_id, food_product_name,
                        source_producer, reason_for_confiscation, lab_results, quantity_destroyed,
                        quantity_seized, people_affected, created_at, updated_at)
                    values (?,?,?,?,?,?,?,?,now(),now())
                    """,
                    eventId, strOf(d.get("food_product_name")), strOf(d.get("source_producer")),
                    strOf(d.get("reason_for_confiscation")), strOf(d.get("lab_results")),
                    strOf(d.get("quantity_destroyed")), strOf(d.get("quantity_seized")),
                    intOrZero(d.get("people_affected")));
            default -> { }
        }
    }

    /** OneHealthEventController::review — set review fields then advance to under_review. */
    @Transactional
    public void review(long eventId, String reviewComments, String priorityLevel, String riskLevel) {
        Map<String, Object> ev = findEventOr404(eventId);
        Long userId = actingUserId();
        jdbc.update("""
                update public.oh_events set reviewed_by = ?, reviewed_at = now(), review_comments = ?,
                    priority_level = coalesce(?, priority_level), risk_level = coalesce(?, risk_level),
                    updated_at = now()
                where id = ?
                """, userId, trimToNull(reviewComments), trimToNull(priorityLevel), trimToNull(riskLevel), eventId);
        updateEventStatus(eventId, (String) ev.get("status"), "under_review", userId, trimToNull(reviewComments));
    }

    /** OneHealthService::issueDirective — returns the new directive id. */
    @Transactional
    public long issueDirective(long eventId, String title, String actionDescription, String deadline,
                               String priorityLevel, String riskLevel, String coordinationNotes,
                               List<Long> stakeholderIds) {
        Map<String, Object> ev = findEventOr404(eventId);
        Long userId = actingUserId();

        Long directiveId = jdbc.queryForObject("""
                insert into public.oh_directives(event_id, directive_title, action_description, deadline,
                    priority_level, risk_level, coordination_notes, status, issued_by, issued_at,
                    created_at, updated_at)
                values (?,?,?,?,?,?,?,'issued',?,now(),now(),now())
                returning id
                """, Long.class,
                eventId, title, actionDescription,
                deadline == null ? null : Date.valueOf(LocalDate.parse(deadline)),
                priorityLevel, trimToNull(riskLevel), trimToNull(coordinationNotes), userId);

        for (Long sId : stakeholderIds) {
            jdbc.update("""
                    insert into public.oh_directive_stakeholder(directive_id, stakeholder_id, created_at, updated_at)
                    values (?,?,now(),now()) on conflict (directive_id, stakeholder_id) do nothing
                    """, directiveId, sId);
        }

        String status = (String) ev.get("status");
        if ("under_review".equals(status) || "submitted".equals(status)) {
            updateEventStatus(eventId, status, "directive_issued", userId, "Directive issued");
        }
        return directiveId;
    }

    /** OneHealthService::updateEventStatus + OhEventWorkflowHistory::log. */
    void updateEventStatus(long eventId, String fromStatus, String toStatus, Long userId, String comments) {
        jdbc.update("update public.oh_events set status = ?, updated_at = now() where id = ?", toStatus, eventId);
        logWorkflow(eventId, userId, "status_changed", toStatus, fromStatus, comments);
    }

    void logWorkflow(long eventId, Long userId, String action, String toStatus, String fromStatus, String comments) {
        String role = jdbc.query("""
                select r.name from public.roles r
                join public.model_has_roles mhr on mhr.role_id = r.id and mhr.model_id = ?
                limit 1
                """, rs -> rs.next() ? rs.getString(1) : null, userId == null ? -1L : userId);
        jdbc.update("""
                insert into public.oh_event_workflow_histories(event_id, user_id, from_status, to_status,
                    action, performed_by_role, comments, created_at, updated_at)
                values (?,?,?,?,?,?,?,now(),now())
                """, eventId, userId, fromStatus, toStatus, action, role == null ? "Unknown" : role, comments);
    }

    /** OneHealthEventController::quickView payload, shape verbatim. */
    public Map<String, Object> quickView(long eventId) {
        Map<String, Object> ev = findEventOr404(eventId);

        List<Map<String, Object>> directives = new ArrayList<>();
        jdbc.query("""
                select d.id, d.directive_title, d.priority_level, d.deadline, d.status,
                    (select count(*) from public.oh_directive_stakeholder ds where ds.directive_id = d.id) as total,
                    (select count(*) from public.oh_directive_stakeholder ds where ds.directive_id = d.id
                        and ds.acknowledgement_status = 'acknowledged') as acknowledged,
                    (select count(*) from public.oh_directive_stakeholder ds where ds.directive_id = d.id
                        and ds.acknowledgement_status = 'declined') as declined,
                    (select count(*) from public.oh_directive_stakeholder ds where ds.directive_id = d.id
                        and ds.implementation_status = 'not_started') as not_started,
                    (select count(*) from public.oh_directive_stakeholder ds where ds.directive_id = d.id
                        and ds.implementation_status = 'in_progress') as in_progress,
                    (select count(*) from public.oh_directive_stakeholder ds where ds.directive_id = d.id
                        and ds.implementation_status = 'completed') as completed,
                    (select count(*) from public.oh_directive_stakeholder ds where ds.directive_id = d.id
                        and ds.implementation_status = 'delayed') as delayed,
                    (select count(*) from public.oh_directive_stakeholder ds where ds.directive_id = d.id
                        and ds.implementation_status = 'blocked') as blocked,
                    (select coalesce(round(avg(ds.implementation_percentage)), 0)
                        from public.oh_directive_stakeholder ds where ds.directive_id = d.id) as avg_percentage
                from public.oh_directives d
                where d.event_id = ? and d.deleted_at is null
                order by d.id
                """, rs -> {
            long total = rs.getLong("total");
            long acknowledged = rs.getLong("acknowledged");
            long declined = rs.getLong("declined");
            java.sql.Date deadline = rs.getDate("deadline");
            String status = rs.getString("status");
            Map<String, Object> ack = new LinkedHashMap<>();
            ack.put("total", total);
            ack.put("acknowledged", acknowledged);
            ack.put("declined", declined);
            ack.put("pending", total - acknowledged - declined);
            Map<String, Object> impl = new LinkedHashMap<>();
            impl.put("total", total);
            impl.put("notStarted", rs.getLong("not_started"));
            impl.put("inProgress", rs.getLong("in_progress"));
            impl.put("completed", rs.getLong("completed"));
            impl.put("delayed", rs.getLong("delayed"));
            impl.put("blocked", rs.getLong("blocked"));
            impl.put("avgPercentage", total > 0 ? rs.getLong("avg_percentage") : 0);
            Map<String, Object> d = new LinkedHashMap<>();
            d.put("id", rs.getLong("id"));
            d.put("directive_title", rs.getString("directive_title"));
            d.put("priority_level", rs.getString("priority_level"));
            d.put("deadline", formatDate(deadline));
            d.put("status", status);
            d.put("status_badge_class", directiveStatusBadgeClass(status));
            d.put("is_overdue", deadline != null && deadline.toLocalDate().isBefore(LocalDate.now())
                    && !"completed".equals(status));
            d.put("show_url", "/m/one-health/directives/" + rs.getLong("id"));
            d.put("acknowledgement", ack);
            d.put("implementation", impl);
            directives.add(d);
        }, eventId);

        List<Map<String, Object>> actions = new ArrayList<>();
        jdbc.query("""
                select a.id, a.action_title, a.status, a.completion_percentage, a.target_date,
                    s.organization, s.name as stakeholder_name
                from public.oh_action_trackings a
                left join public.stakeholders s on s.id = a.stakeholder_id
                where a.event_id = ?
                order by a.id
                """, rs -> {
            java.sql.Date target = rs.getDate("target_date");
            String status = rs.getString("status");
            Map<String, Object> a = new LinkedHashMap<>();
            a.put("id", rs.getLong("id"));
            a.put("action_title", rs.getString("action_title"));
            String org = rs.getString("organization");
            String name = rs.getString("stakeholder_name");
            a.put("stakeholder_name", org != null ? org : (name != null ? name : "-"));
            a.put("status", status);
            a.put("status_badge_class", switch (status == null ? "" : status) {
                case "completed" -> "bg-success";
                case "in_progress" -> "bg-warning text-dark";
                case "delayed" -> "bg-danger";
                default -> "bg-secondary";
            });
            a.put("completion_percentage", rs.getInt("completion_percentage"));
            a.put("target_date", formatDate(target));
            a.put("is_overdue", target != null && target.toLocalDate().isBefore(LocalDate.now())
                    && !"completed".equals(status));
            a.put("can_update", false);
            actions.add(a);
        }, eventId);

        List<Map<String, Object>> history = new ArrayList<>();
        jdbc.query("""
                select wh.action, wh.from_status, wh.to_status, wh.performed_by_role, wh.comments,
                    wh.created_at, u.name as user_name
                from public.oh_event_workflow_histories wh
                left join public.users u on u.id = wh.user_id
                where wh.event_id = ?
                order by wh.created_at desc, wh.id desc
                """, rs -> {
            Map<String, Object> w = new LinkedHashMap<>();
            String action = rs.getString("action");
            w.put("action", action);
            w.put("action_label", actionLabel(action));
            w.put("action_icon", actionIcon(action));
            w.put("action_badge_class", actionBadgeClass(action));
            w.put("from_status", rs.getString("from_status"));
            w.put("to_status", rs.getString("to_status"));
            String userName = rs.getString("user_name");
            w.put("user_name", userName == null ? "System" : userName);
            w.put("performed_by_role", rs.getString("performed_by_role"));
            w.put("comments", rs.getString("comments"));
            w.put("created_at", formatDateTime(rs.getTimestamp("created_at")));
            history.add(w);
        }, eventId);

        Map<String, Object> dissemination = jdbc.queryForMap("""
                select count(*) as total,
                    count(*) filter (where status in ('sent','approved')) as sent,
                    count(*) filter (where status = 'pending') as pending_approval
                from public.oh_disseminations where event_id = ?
                """, eventId);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("directives", directives);
        out.put("action_trackings", actions);
        Object completion = ev.get("completion_percentage");
        out.put("event_completion", completion == null ? 0 : ((Number) completion).intValue());
        out.put("workflow_history", history);
        Map<String, Object> diss = new LinkedHashMap<>();
        diss.put("total", dissemination.get("total"));
        diss.put("sent", dissemination.get("sent"));
        diss.put("pending_approval", dissemination.get("pending_approval"));
        out.put("dissemination_summary", diss);
        return out;
    }

    Map<String, Object> findEventOr404(long eventId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from public.oh_events where id = ? and deleted_at is null", eventId);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Event not found.");
        }
        return rows.get(0);
    }

    // ── helpers ──

    static Long currentUserDbId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof Jwt jwt) {
            try {
                return Long.parseLong(jwt.getSubject());
            } catch (Exception notNumeric) {
                return null;
            }
        }
        return null;
    }

    /**
     * users.id of the acting user. The local profile's synthetic subject is not a
     * numeric users.id, so audit columns that are NOT NULL resolve to the seeded
     * admin account; production tokens carry the numeric id directly.
     */
    Long actingUserId() {
        Long id = currentUserDbId();
        if (id != null) {
            return id;
        }
        Long admin = jdbc.query("select id from public.users where email = 'admin@example.com'",
                rs -> rs.next() ? rs.getLong(1) : null);
        if (admin != null) {
            return admin;
        }
        return jdbc.query("select min(id) from public.users",
                rs -> rs.next() && rs.getObject(1) != null ? rs.getLong(1) : null);
    }

    static String trimToNull(String s) {
        if (s == null) {
            return null;
        }
        String t = s.trim();
        return t.isEmpty() ? null : t;
    }

    /** array_filter equivalent: any non-empty, non-zero value present. */
    static boolean hasAnyValue(Map<String, Object> m) {
        for (Object v : m.values()) {
            if (v == null) {
                continue;
            }
            String s = String.valueOf(v).trim();
            if (!s.isEmpty() && !"0".equals(s)) {
                return true;
            }
        }
        return false;
    }

    static String strOf(Object v) {
        return v == null ? null : trimToNull(String.valueOf(v));
    }

    static Integer intOf(Object v) {
        String s = strOf(v);
        return s == null ? 0 : (int) Double.parseDouble(s);
    }

    static int intOrZero(Object v) {
        String s = strOf(v);
        return s == null ? 0 : (int) Double.parseDouble(s);
    }

    static Long longOf(Object v) {
        String s = strOf(v);
        return s == null ? null : (long) Double.parseDouble(s);
    }

    static java.math.BigDecimal numOf(Object v) {
        String s = strOf(v);
        return s == null ? null : new java.math.BigDecimal(s);
    }

    static String limit(String s, int max) {
        if (s == null) {
            return null;
        }
        return s.length() <= max ? s : s.substring(0, max).stripTrailing() + "...";
    }

    static OffsetDateTime now() {
        return OffsetDateTime.now();
    }
}
