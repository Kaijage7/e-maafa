package tz.go.pmo.dmis.onehealth;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.security.access.prepost.PreAuthorize;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Port of OneHealth\OneHealthEventController (index/store/review/quickView +
 * AJAX cascades) plus OneHealthDirectiveController::store (the events index
 * issues directives from its kebab menu).
 *
 * Authorization invariants from the source kept: events are locked after
 * submission (edit/update → 403), visibility is read-all.
 */
@RestController
@RequestMapping("/v1/onehealth/events")
public class OneHealthEventController {

    private final JdbcTemplate jdbc;
    private final OneHealthEventService service;
    private final AreaGuard areaGuard;
    private final JurisdictionScope jurisdiction;

    public OneHealthEventController(JdbcTemplate jdbc, OneHealthEventService service,
                                   AreaGuard areaGuard, JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.service = service;
        this.areaGuard = areaGuard;
        this.jurisdiction = jurisdiction;
    }

    // ─── Index: filters + pagination + KPI stats ───

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String status,
                                     @RequestParam(name = "area_of_concern_id", required = false) Long areaOfConcernId,
                                     @RequestParam(name = "region_id", required = false) Long regionId,
                                     @RequestParam(name = "stakeholder_id", required = false) Long stakeholderId,
                                     @RequestParam(name = "date_from", required = false) String dateFrom,
                                     @RequestParam(name = "date_to", required = false) String dateTo,
                                     @RequestParam(name = "event_type", required = false) String eventType,
                                     @RequestParam(name = "priority_level", required = false) String priorityLevel,
                                     @RequestParam(required = false) String search,
                                     @RequestParam(defaultValue = "1") int page) {
        StringBuilder where = new StringBuilder("e.deleted_at is null");
        List<Object> params = new ArrayList<>();
        // 'active' is a KPI pseudo-status (all but closed/archived), not a column value
        if (notBlank(status)) {
            if ("active".equals(status)) {
                where.append(" and e.status not in ('closed','archived')");
            } else {
                where.append(" and e.status = ?");
                params.add(status);
            }
        }
        if (areaOfConcernId != null) {
            where.append(" and e.area_of_concern_id = ?");
            params.add(areaOfConcernId);
        }
        if (regionId != null) {
            where.append(" and e.region_id = ?");
            params.add(regionId);
        }
        if (stakeholderId != null) {
            where.append(" and e.stakeholder_id = ?");
            params.add(stakeholderId);
        }
        if (notBlank(dateFrom)) {
            where.append(" and e.date_of_occurrence >= ?");
            params.add(java.sql.Date.valueOf(LocalDate.parse(dateFrom)));
        }
        if (notBlank(dateTo)) {
            where.append(" and e.date_of_occurrence <= ?");
            params.add(java.sql.Date.valueOf(LocalDate.parse(dateTo)));
        }
        if (notBlank(eventType)) {
            where.append(" and e.event_type = ?");
            params.add(eventType);
        }
        if (notBlank(priorityLevel)) {
            where.append(" and e.priority_level = ?");
            params.add(priorityLevel);
        }
        if (notBlank(search)) {
            where.append(" and (e.event_id ilike ? or e.event_title ilike ? or e.event_description ilike ?)");
            String like = "%" + search + "%";
            params.add(like);
            params.add(like);
            params.add(like);
        }

        // Jurisdiction (area) scope: an area officer sees only their own area's events (oh_events carry
        // region_id/district_id); national + non-area roles keep the full view. Shared-or-own so events with
        // a null area stay visible. Mirrors the by-id guards on show/quick-view/directive below.
        jurisdiction.appendAreaScopeSharedOrOwn("e", where, params);

        long total = jdbc.queryForObject("select count(*) from public.oh_events e where " + where,
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
                select e.id, e.event_id, e.event_title, e.event_type, e.event_description, e.status,
                    e.priority_level, e.risk_level, e.date_of_occurrence, e.area_of_concern_id,
                    a.name as area_name, s.organization as stakeholder_organization, s.name as stakeholder_name,
                    r.name as region_name, d.name as district_name, w.name as ward_name,
                    (select count(*) from public.oh_directives dd where dd.event_id = e.id and dd.deleted_at is null) as directives_count,
                    (select count(*) from public.oh_disseminations ds where ds.event_id = e.id) as disseminations_count,
                    (select count(*) from public.oh_action_trackings at where at.event_id = e.id) as action_trackings_count,
                    (select count(*) from public.oh_action_trackings at where at.event_id = e.id and at.status = 'completed') as completed_actions,
                    (select count(distinct dd.id) from public.oh_directives dd
                        join public.oh_directive_stakeholder dst on dst.directive_id = dd.id
                        where dd.event_id = e.id and dd.deleted_at is null
                          and dst.acknowledgement_status = 'pending') as unacknowledged_directives
                from public.oh_events e
                left join public.oh_areas_of_concern a on a.id = e.area_of_concern_id
                left join public.stakeholders s on s.id = e.stakeholder_id
                left join public.regions r on r.id = e.region_id
                left join public.districts d on d.id = e.district_id
                left join public.wards w on w.id = e.ward_id
                where %s
                order by e.created_at desc
                limit ? offset ?
                """.formatted(where), rs -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("event_id", rs.getString("event_id"));
            m.put("event_title", rs.getString("event_title"));
            m.put("event_type", rs.getString("event_type"));
            m.put("event_description", OneHealthEventService.limit(rs.getString("event_description"), 300));
            String st = rs.getString("status");
            m.put("status", st);
            m.put("status_label", OneHealthEventService.statusLabel(st));
            m.put("priority_level", rs.getString("priority_level"));
            m.put("risk_level", rs.getString("risk_level"));
            m.put("date_of_occurrence", OneHealthEventService.formatDate(rs.getDate("date_of_occurrence")));
            m.put("area_of_concern_id", rs.getObject("area_of_concern_id"));
            m.put("area_name", rs.getString("area_name"));
            m.put("stakeholder_organization", rs.getString("stakeholder_organization"));
            m.put("stakeholder_name", rs.getString("stakeholder_name"));
            m.put("region_name", rs.getString("region_name"));
            m.put("district_name", rs.getString("district_name"));
            m.put("ward_name", rs.getString("ward_name"));
            m.put("directives_count", rs.getLong("directives_count"));
            m.put("disseminations_count", rs.getLong("disseminations_count"));
            m.put("action_trackings_count", rs.getLong("action_trackings_count"));
            m.put("completed_actions", rs.getLong("completed_actions"));
            m.put("unacknowledged_directives", rs.getLong("unacknowledged_directives"));
            m.put("can_edit", false); // OhEvent::canBeEditedBy is unconditionally false in the source
            rows.add(m);
        }, listParams.toArray());

        // KPI stats (not user-filter-scoped — as in the source — but still area-scoped so an area officer's
        // KPIs reflect only their own area, not nationwide counts).
        StringBuilder statsWhere = new StringBuilder("deleted_at is null");
        List<Object> statsParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("", statsWhere, statsParams);
        Map<String, Object> stats = jdbc.queryForMap("""
                select count(*) as total,
                    count(*) filter (where status = 'submitted') as submitted,
                    count(*) filter (where status = 'under_review') as under_review,
                    count(*) filter (where status = 'directive_issued') as directive_issued,
                    count(*) filter (where status = 'monitoring') as monitoring,
                    count(*) filter (where status = 'closed') as closed,
                    count(*) filter (where status not in ('closed','archived')) as active
                from public.oh_events where %s
                """.formatted(statsWhere), statsParams.toArray());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("data", rows);
        out.put("currentPage", currentPage);
        out.put("lastPage", lastPage);
        out.put("total", total);
        out.put("firstItem", total == 0 ? null : offset + 1);
        out.put("lastItem", total == 0 ? null : offset + rows.size());
        out.put("stats", stats);
        return out;
    }

    /** Reference data for the index screen: areas, regions, statuses, institutions, hazards. */
    @GetMapping("/form-data")
    public Map<String, Object> formData() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("areas", jdbc.queryForList(
                "select id, name, code, category from public.oh_areas_of_concern where is_active = true order by sort_order"));
        out.put("regions", jdbc.queryForList("select id, name from public.regions order by name"));
        out.put("statuses", OneHealthEventService.STATUSES);
        out.put("institutions", jdbc.queryForList("""
                select id, organization, name from public.stakeholders
                where type in ('PMO','Ministry','Government Institution','Government') and is_active = true
                order by organization
                """));
        out.put("hazards", jdbc.queryForList(
                "select id, name, type from public.hazards where is_active = true order by name"));
        return out;
    }

    // ─── Store ───

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PostMapping
    public ResponseEntity<Map<String, Object>> store(@RequestBody OhEventWriteRequest r) {
        // Bind the event's area to the caller: an area officer's event is created in their OWN area,
        // ignoring any body-supplied region (anti-spoofing). National tier may use the body.
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        if (tier == JurisdictionScope.Tier.REGION || tier == JurisdictionScope.Tier.DISTRICT) {
            Map<String, Object> area = jurisdiction.currentArea();
            Object regionId = area.get("region_id");
            Object districtId = area.get("district_id");
            if (tier == JurisdictionScope.Tier.DISTRICT && districtId != null) {
                // district officer: pin both region+district to their own area
                r.setDistrictId(((Number) districtId).longValue());
                Long regForDistrict = jdbc.queryForObject(
                        "select region_id from public.districts where id = ?", Long.class,
                        ((Number) districtId).longValue());
                if (regForDistrict != null) {
                    r.setRegionId(regForDistrict);
                }
            } else if (regionId != null) {
                // region officer: pin region to their own; keep body district but force it in-region
                r.setRegionId(((Number) regionId).longValue());
                if (r.getDistrictId() != null) {
                    Long regOfBodyDistrict = districtRegion(r.getDistrictId());
                    if (regOfBodyDistrict == null || !regOfBodyDistrict.equals(((Number) regionId).longValue())) {
                        r.setDistrictId(null);   // out-of-region district → drop; validateStore will require a valid one
                        r.setWardId(null);
                        r.setWardVillage(null);
                    }
                }
            }
        }
        Map<String, List<String>> errors = validateStore(r);
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed.", "errors", errors));
        }
        Map<String, Object> created = service.createEvent(r);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("message", "Event " + created.get("event_id") + " has been created and submitted successfully.");
        out.put("redirect", "/m/one-health/events/" + created.get("id"));
        out.put("id", created.get("id"));
        out.put("event_id", created.get("event_id"));
        return ResponseEntity.ok(out);
    }

    /**
     * store() rules from the source, with the OH-4 fix: the UI offers
     * outbreak/incident/other so those are accepted; ew_alert stays reserved
     * for the EW→OH bridge.
     */
    private Map<String, List<String>> validateStore(OhEventWriteRequest r) {
        Map<String, List<String>> errors = new LinkedHashMap<>();
        requireExists(errors, "stakeholder_id", r.getStakeholderId(), "stakeholders", "The selected stakeholder id is invalid.");
        requireExists(errors, "area_of_concern_id", r.getAreaOfConcernId(), "oh_areas_of_concern", "The selected area of concern id is invalid.");
        if (r.getConcernItemId() != null && !exists("oh_concern_items", r.getConcernItemId())) {
            add(errors, "concern_item_id", "The selected concern item id is invalid.");
        }
        if (isBlank(r.getEventTitle())) {
            add(errors, "event_title", "The event title field is required.");
        } else if (r.getEventTitle().length() > 255) {
            add(errors, "event_title", "The event title must not be greater than 255 characters.");
        }
        if (isBlank(r.getEventType())) {
            add(errors, "event_type", "The event type field is required.");
        } else if (!List.of("outbreak", "incident", "other").contains(r.getEventType())) {
            add(errors, "event_type", "The selected event type is invalid.");
        }
        if (isBlank(r.getEventDescription())) {
            add(errors, "event_description", "The event description field is required.");
        }
        if (isBlank(r.getDateOfOccurrence())) {
            add(errors, "date_of_occurrence", "The date of occurrence field is required.");
        } else {
            try {
                LocalDate.parse(r.getDateOfOccurrence());
            } catch (Exception e) {
                add(errors, "date_of_occurrence", "The date of occurrence is not a valid date.");
            }
        }
        requireExists(errors, "region_id", r.getRegionId(), "regions", "The selected region id is invalid.");
        requireExists(errors, "district_id", r.getDistrictId(), "districts", "The selected district id is invalid.");
        if (r.getWardId() != null && !exists("wards", r.getWardId())) {
            add(errors, "ward_id", "The selected ward id is invalid.");
        }
        if (r.getLatitude() != null && (r.getLatitude() < -90 || r.getLatitude() > 90)) {
            add(errors, "latitude", "The latitude must be between -90 and 90.");
        }
        if (r.getLongitude() != null && (r.getLongitude() < -180 || r.getLongitude() > 180)) {
            add(errors, "longitude", "The longitude must be between -180 and 180.");
        }
        if (notBlank(r.getPriorityLevel()) && !List.of("low", "medium", "high", "critical").contains(r.getPriorityLevel())) {
            add(errors, "priority_level", "The selected priority level is invalid.");
        }
        if (notBlank(r.getRiskLevel()) && !List.of("low", "moderate", "high", "very_high").contains(r.getRiskLevel())) {
            add(errors, "risk_level", "The selected risk level is invalid.");
        }
        if (r.getEnvironment() != null) {
            Long hazardId = OneHealthEventService.longOf(r.getEnvironment().get("hazard_id"));
            if (hazardId != null && !exists("hazards", hazardId)) {
                add(errors, "environment.hazard_id", "The selected environment.hazard id is invalid.");
            }
        }
        return errors;
    }

    // ─── Show (full detail — used by the show hub and quick links) ───

    @GetMapping("/{id}")
    public Map<String, Object> show(@PathVariable long id) {
        service.findEventOr404(id);
        areaGuard.assertOwnOrShared("public.oh_events", id);
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select e.*, a.name as area_name, a.category as area_category, ci.name as concern_item_name,
                    s.organization as stakeholder_organization, s.name as stakeholder_name,
                    r.name as region_name, d.name as district_name, w.name as ward_name,
                    su.name as submitted_by_name, ru.name as reviewed_by_name,
                    wn.warning_code as source_warning_code
                from public.oh_events e
                left join public.oh_areas_of_concern a on a.id = e.area_of_concern_id
                left join public.oh_concern_items ci on ci.id = e.concern_item_id
                left join public.stakeholders s on s.id = e.stakeholder_id
                left join public.regions r on r.id = e.region_id
                left join public.districts d on d.id = e.district_id
                left join public.wards w on w.id = e.ward_id
                left join public.users su on su.id = e.submitted_by
                left join public.users ru on ru.id = e.reviewed_by
                left join public.warnings wn on wn.id = e.source_warning_id
                where e.id = ?
                """, id);
        Map<String, Object> event = rows.get(0);
        event.put("status_label", OneHealthEventService.statusLabel((String) event.get("status")));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("event", event);
        out.put("environmental_detail", firstOrNull(jdbc.queryForList("""
                select ed.*, h.name as hazard_name, h.type as hazard_type_name
                from public.oh_event_environmental_details ed
                left join public.hazards h on h.id = ed.hazard_id
                where ed.event_id = ?
                """, id)));
        out.put("health_detail", firstOrNull(jdbc.queryForList(
                "select * from public.oh_event_health_details where event_id = ?", id)));
        out.put("agricultural_detail", firstOrNull(jdbc.queryForList(
                "select * from public.oh_event_agricultural_details where event_id = ?", id)));
        out.put("food_safety_detail", firstOrNull(jdbc.queryForList(
                "select * from public.oh_event_food_safety_details where event_id = ?", id)));
        out.put("animal_entries", jdbc.queryForList(
                "select * from public.oh_event_animal_entries where event_id = ? order by id", id));

        // ── Hub data: directives with their acknowledgement/implementation matrices ──
        List<Map<String, Object>> directives = jdbc.queryForList("""
                select d.id, d.directive_title, d.action_description, d.coordination_notes, d.deadline,
                    d.priority_level, d.risk_level, d.status
                from public.oh_directives d where d.event_id = ? and d.deleted_at is null order by d.id
                """, id);
        for (Map<String, Object> d : directives) {
            long dirId = ((Number) d.get("id")).longValue();
            List<Map<String, Object>> sths = jdbc.queryForList("""
                    select s.id, s.organization, s.name, ds.acknowledgement_status, ds.acknowledged_at,
                        ds.response_notes, ds.implementation_status, ds.implementation_percentage,
                        ds.implementation_notes, ds.last_update_at
                    from public.oh_directive_stakeholder ds
                    join public.stakeholders s on s.id = ds.stakeholder_id
                    where ds.directive_id = ? order by s.organization
                    """, dirId);
            long ackCount = sths.stream().filter(s -> "acknowledged".equals(s.get("acknowledgement_status"))).count();
            long avgImpl = sths.isEmpty() ? 0 : Math.round(sths.stream()
                    .mapToInt(s -> s.get("implementation_percentage") == null ? 0 : ((Number) s.get("implementation_percentage")).intValue())
                    .average().orElse(0));
            for (Map<String, Object> s : sths) {
                s.put("acknowledged_at", s.get("acknowledged_at") instanceof java.sql.Timestamp t
                        ? OneHealthEventService.formatDateTime(t) : null);
                s.put("last_update_at", s.get("last_update_at") instanceof java.sql.Timestamp t2
                        ? OneHealthEventService.formatDate(new java.sql.Date(t2.getTime())) : null);
            }
            java.sql.Date deadline = (java.sql.Date) d.get("deadline");
            d.put("deadline", deadline == null ? null : deadline.toLocalDate().toString());
            d.put("deadline_display", OneHealthEventService.formatDate(deadline));
            d.put("is_overdue", deadline != null && deadline.toLocalDate().isBefore(LocalDate.now())
                    && !"completed".equals(d.get("status")));
            d.put("stakeholders", sths);
            d.put("ack_count", ackCount);
            d.put("total_stakeholders", sths.size());
            d.put("impl_avg_percentage", avgImpl);
        }
        out.put("directives", directives);

        List<Map<String, Object>> disseminations = jdbc.queryForList("""
                select id, dissemination_type, alert_message, approval_status, status,
                    sms_sent_count, email_sent_count, created_at
                from public.oh_disseminations where event_id = ? order by created_at desc
                """, id);
        for (Map<String, Object> dis : disseminations) {
            dis.put("alert_message", OneHealthEventService.limit((String) dis.get("alert_message"), 60));
            dis.put("created_at", dis.get("created_at") instanceof java.sql.Timestamp t
                    ? OneHealthEventService.formatDate(new java.sql.Date(t.getTime())) : null);
        }
        out.put("disseminations", disseminations);

        List<Map<String, Object>> actions = jdbc.queryForList("""
                select a.id, a.directive_id, a.action_title, a.action_description, a.status,
                    a.completion_percentage, a.target_date, s.organization as stakeholder_organization
                from public.oh_action_trackings a
                left join public.stakeholders s on s.id = a.stakeholder_id
                where a.event_id = ? order by a.id
                """, id);
        for (Map<String, Object> a : actions) {
            java.sql.Date td = (java.sql.Date) a.get("target_date");
            a.put("target_date", td == null ? null : td.toLocalDate().toString());
            a.put("target_date_display", OneHealthEventService.formatDate(td));
            a.put("is_overdue", td != null && td.toLocalDate().isBefore(LocalDate.now()) && !"completed".equals(a.get("status")));
        }
        out.put("action_trackings", actions);

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
            w.put("action_label", OneHealthEventService.actionLabel(action));
            w.put("action_icon", OneHealthEventService.actionIcon(action));
            w.put("from_status", rs.getString("from_status"));
            w.put("to_status", rs.getString("to_status"));
            String userName = rs.getString("user_name");
            w.put("user_name", userName == null ? "System" : userName);
            w.put("performed_by_role", rs.getString("performed_by_role"));
            w.put("comments", rs.getString("comments"));
            w.put("created_at", OneHealthEventService.formatDateTime(rs.getTimestamp("created_at")));
            history.add(w);
        }, id);
        out.put("workflow_histories", history);

        Object areaIdObj = event.get("area_of_concern_id");
        List<Map<String, Object>> areaStakeholders = areaIdObj == null ? List.of() : jdbc.queryForList("""
                select s.id, s.organization, s.name, s.email, s.phone from public.stakeholders s
                join public.oh_area_stakeholder asx on asx.stakeholder_id = s.id
                where asx.area_of_concern_id = ? and s.is_active = true order by s.id
                """, ((Number) areaIdObj).longValue());
        out.put("area_stakeholders", areaStakeholders);
        out.put("has_directives", !directives.isEmpty());
        out.put("can_issue_directive", true); // local sessions act as PMO admin
        out.put("can_review", true);
        return out;
    }

    // ─── Edit / Update: locked after submission (source invariant) ───

    @GetMapping("/{id}/edit")
    public ResponseEntity<Map<String, Object>> edit(@PathVariable long id) {
        service.findEventOr404(id);
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("success", false, "message", "You are not authorized to edit this event."));
    }

    @PreAuthorize("hasAuthority('one_health.manage')")
    @PutMapping("/{id}")
    public ResponseEntity<Map<String, Object>> update(@PathVariable long id) {
        service.findEventOr404(id);
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(Map.of("success", false, "message", "You are not authorized to edit this event."));
    }

    // ─── Review ───

    @PreAuthorize("hasAuthority('one_health.approve')")
    @PostMapping("/{id}/review")
    public ResponseEntity<Map<String, Object>> review(@PathVariable long id, @RequestBody(required = false) Map<String, Object> body) {
        areaGuard.assertOwnOrShared("public.oh_events", id);
        Map<String, Object> b = body == null ? Map.of() : body;
        Map<String, List<String>> errors = new LinkedHashMap<>();
        String priority = OneHealthEventService.strOf(b.get("priority_level"));
        String risk = OneHealthEventService.strOf(b.get("risk_level"));
        if (priority != null && !List.of("low", "medium", "high", "critical").contains(priority)) {
            add(errors, "priority_level", "The selected priority level is invalid.");
        }
        if (risk != null && !List.of("low", "moderate", "high", "very_high").contains(risk)) {
            add(errors, "risk_level", "The selected risk level is invalid.");
        }
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed.", "errors", errors));
        }
        service.review(id, OneHealthEventService.strOf(b.get("review_comments")), priority, risk);
        return ResponseEntity.ok(Map.of("success", true, "message", "Event marked as under review."));
    }

    // ─── Quick View ───

    @GetMapping("/{id}/quick-view")
    public Map<String, Object> quickView(@PathVariable long id) {
        areaGuard.assertOwnOrShared("public.oh_events", id);
        return service.quickView(id);
    }

    // ─── Issue Directive (OneHealthDirectiveController::store) — PMO-DMD function ───

    @PreAuthorize("hasAuthority('one_health.directive')")
    @PostMapping("/{id}/directives")
    @SuppressWarnings("unchecked")
    public ResponseEntity<Map<String, Object>> storeDirective(@PathVariable long id, @RequestBody Map<String, Object> body) {
        service.findEventOr404(id);
        areaGuard.assertOwnOrShared("public.oh_events", id);
        Map<String, List<String>> errors = new LinkedHashMap<>();
        String title = OneHealthEventService.strOf(body.get("directive_title"));
        String description = OneHealthEventService.strOf(body.get("action_description"));
        String deadline = OneHealthEventService.strOf(body.get("deadline"));
        String priority = OneHealthEventService.strOf(body.get("priority_level"));
        String risk = OneHealthEventService.strOf(body.get("risk_level"));
        String notes = OneHealthEventService.strOf(body.get("coordination_notes"));

        if (title == null) {
            add(errors, "directive_title", "The directive title field is required.");
        } else if (title.length() > 255) {
            add(errors, "directive_title", "The directive title must not be greater than 255 characters.");
        }
        if (description == null) {
            add(errors, "action_description", "The action description field is required.");
        }
        if (deadline != null) {
            try {
                if (LocalDate.parse(deadline).isBefore(LocalDate.now())) {
                    add(errors, "deadline", "The deadline must be a date after or equal to today.");
                }
            } catch (Exception e) {
                add(errors, "deadline", "The deadline is not a valid date.");
            }
        }
        if (priority == null) {
            add(errors, "priority_level", "The priority level field is required.");
        } else if (!List.of("low", "medium", "high", "critical").contains(priority)) {
            add(errors, "priority_level", "The selected priority level is invalid.");
        }
        if (risk != null && !List.of("low", "moderate", "high", "very_high").contains(risk)) {
            add(errors, "risk_level", "The selected risk level is invalid.");
        }
        List<Long> stakeholderIds = new ArrayList<>();
        Object raw = body.get("stakeholder_ids");
        if (raw instanceof List<?> list && !list.isEmpty()) {
            for (Object o : list) {
                Long sId = OneHealthEventService.longOf(o);
                if (sId == null || !exists("stakeholders", sId)) {
                    add(errors, "stakeholder_ids." + stakeholderIds.size(), "The selected stakeholder_ids." + stakeholderIds.size() + " is invalid.");
                } else {
                    stakeholderIds.add(sId);
                }
            }
        } else {
            add(errors, "stakeholder_ids", "The stakeholder ids field is required.");
        }
        if (!errors.isEmpty()) {
            return ResponseEntity.unprocessableEntity()
                    .body(Map.of("success", false, "message", "Validation failed.", "errors", errors));
        }
        service.issueDirective(id, title, description, deadline, priority, risk, notes, stakeholderIds);
        return ResponseEntity.ok(Map.of("success", true,
                "message", "Directive issued successfully to " + stakeholderIds.size() + " stakeholder(s)."));
    }

    // ─── AJAX cascades ───

    @GetMapping("/districts/{regionId}")
    public List<Map<String, Object>> districts(@PathVariable long regionId) {
        return jdbc.queryForList("select id, name from public.districts where region_id = ? order by name", regionId);
    }

    @GetMapping("/wards/{districtId}")
    public List<Map<String, Object>> wards(@PathVariable long districtId) {
        return jdbc.queryForList("select id, name from public.wards where district_id = ? order by name", districtId);
    }

    @GetMapping("/concern-items/{areaId}")
    public List<Map<String, Object>> concernItems(@PathVariable long areaId) {
        return jdbc.queryForList("""
                select id, name from public.oh_concern_items
                where area_of_concern_id = ? and is_active = true order by sort_order
                """, areaId);
    }

    @GetMapping("/area-stakeholders/{areaId}")
    public List<Map<String, Object>> areaStakeholders(@PathVariable long areaId) {
        return jdbc.queryForList("""
                select s.id, s.organization, s.name, s.email, s.phone
                from public.stakeholders s
                join public.oh_area_stakeholder asx on asx.stakeholder_id = s.id
                where asx.area_of_concern_id = ? and s.is_active = true
                order by s.id
                """, areaId);
    }

    // ─── helpers ───

    /** Region id that owns a district, or null if the district is unknown. */
    private Long districtRegion(long districtId) {
        List<Long> ids = jdbc.queryForList(
                "select region_id from public.districts where id = ?", Long.class, districtId);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private boolean exists(String table, long id) {
        Long c = jdbc.queryForObject("select count(*) from public." + table + " where id = ?", Long.class, id);
        return c != null && c > 0;
    }

    private void requireExists(Map<String, List<String>> errors, String field, Long id, String table, String invalidMsg) {
        if (id == null) {
            add(errors, field, "The " + field.replace('_', ' ').replace(" id", " id") + " field is required.");
        } else if (!exists(table, id)) {
            add(errors, field, invalidMsg);
        }
    }

    private static void add(Map<String, List<String>> errors, String field, String message) {
        errors.computeIfAbsent(field, k -> new ArrayList<>()).add(message);
    }

    private static boolean isBlank(String s) {
        return s == null || s.trim().isEmpty();
    }

    private static boolean notBlank(String s) {
        return !isBlank(s);
    }

    private static Map<String, Object> firstOrNull(List<Map<String, Object>> rows) {
        return rows.isEmpty() ? null : rows.get(0);
    }
}
