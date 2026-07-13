package tz.go.pmo.dmis.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.service.support.ActivationService;
import tz.go.pmo.dmis.service.AnticipatoryPlansService;
import tz.go.pmo.dmis.service.CommandCenterService;

/**
 * Command Post / Coordination center: activations board, posture, readiness,
 * operational periods, injects, AAR, DRF lanes, tasks, command roles.
 * <p>Logic lives in service.impl (eGA); paths/JSON unchanged. Acting user via
 * {@link CurrentUserResolver}; activate via transitional {@link ActivationService}.
 * Shares base path with scenarios controller.
 */
@Service
public class CommandCenterServiceImpl implements CommandCenterService {

    private static final List<String> TASK_STATUSES = List.of("To Do", "In Progress", "On Hold", "Completed", "Cancelled");
    private static final List<String> PRIORITIES = List.of("Low", "Medium", "High", "Critical");
    /** ICS command & General Staff roles (NIMS/ICS doctrine, V140) — matches the DB CHECK exactly. */
    private static final List<String> COMMAND_ROLES = List.of(
            "IC", "Deputy IC", "Operations", "Planning", "Logistics", "Finance/Admin", "PIO", "Safety", "Liaison");
    /**
     * The 15 NDPRP DRF lanes grouped under their ICS General-Staff section chief for the
     * org-chart hierarchy. Static doctrine mapping (by DRF number):
     *   Operations — the ground-response functions: 4 Shelter & NFIs, 5 Security & Public Order,
     *                6 Health & Medical, 7 Search & Rescue, 8 Food Security & Nutrition, 11 WASH,
     *                12 Protection, 13 Education in Emergencies.
     *   Planning   — information/assessment/recovery-planning functions: 1 Coordination (drives the
     *                planning cycle and coordination meetings), 2 Information Management, 10 Damage &
     *                Needs Assessment, 14 Environment (technical specialists), 15 Early Recovery.
     *   Logistics  — 3 Logistics & Supply Chain, 9 Communications (the ICS Communications Unit sits
     *                in the Logistics Section's Service Branch).
     * Finance/Admin has no DRF lanes — it administers cost/compensation, not field functions.
     */
    private static final Map<String, List<Integer>> DRF_SECTIONS;
    static {
        DRF_SECTIONS = new LinkedHashMap<>();
        DRF_SECTIONS.put("Operations", List.of(4, 5, 6, 7, 8, 11, 12, 13));
        DRF_SECTIONS.put("Planning", List.of(1, 2, 10, 14, 15));
        DRF_SECTIONS.put("Logistics", List.of(3, 9));
    }
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON =
            new com.fasterxml.jackson.databind.ObjectMapper();
    private static final TypeReference<List<Map<String, Object>>> JOURNAL = new TypeReference<>() {};


    private final JdbcTemplate jdbc;
    private final ActivationService activations;
    private final CurrentUserResolver users;
    private final AnticipatoryPlansService plans;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;

    public CommandCenterServiceImpl(JdbcTemplate jdbc, ActivationService activations,
                                    CurrentUserResolver users, AnticipatoryPlansService plans,
                                    JurisdictionScope jurisdiction, AreaGuard areaGuard) {
        this.jdbc = jdbc;
        this.activations = activations;
        this.users = users;
        this.plans = plans;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
    }

    // ─── Activations index ───

    @Override
    public Map<String, Object> index() {
        Map<String, Object> out = new LinkedHashMap<>();
        // LEFT JOIN incidents throughout — anticipatory (forecast) activations have no incident
        // until impact, but must still appear in the index; fall back to the hazard description.
        // Area officers see only activations whose incident is in their own district/region (or shared);
        // forecast activations with no incident yet carry NULL i.region_id, so they stay visible to all.
        // National + non-area roles keep the full view.
        StringBuilder activeSql = new StringBuilder("""
                select ra.*, coalesce(i.title, ra.hazard_description) as incident_title,
                       i.severity_level, i.region_name, u.name as activated_by_name,
                       ew.warning_code, s.title as scenario_title, er.run_code,
                       (select count(*) from public.incident_tasks t where t.activation_id = ra.id) as total_tasks,
                       (select count(*) from public.incident_tasks t where t.activation_id = ra.id and t.status = 'Completed') as completed_tasks
                from public.response_activations ra
                left join public.incidents i on i.id = ra.incident_id
                left join public.warnings ew on ew.id = ra.warning_id
                left join public.exercise_runs er on er.id = ra.exercise_run_id
                left join public.exercise_scenarios s on s.id = ra.scenario_id
                left join public.users u on u.id = ra.activated_by
                where ra.status = 'active'""");
        List<Object> activeParams = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("i", activeSql, activeParams);
        activeSql.append(" order by ra.activated_at desc");
        out.put("active", jdbc.queryForList(activeSql.toString(), activeParams.toArray())
                .stream().map(CommandCenterServiceImpl::cleanActivationJson).toList());
        StringBuilder completedSql = new StringBuilder("""
                select ra.*, coalesce(i.title, ra.hazard_description) as incident_title,
                       ew.warning_code, s.title as scenario_title, er.run_code, u.name as activated_by_name
                from public.response_activations ra
                left join public.incidents i on i.id = ra.incident_id
                left join public.warnings ew on ew.id = ra.warning_id
                left join public.exercise_runs er on er.id = ra.exercise_run_id
                left join public.exercise_scenarios s on s.id = ra.scenario_id
                left join public.users u on u.id = ra.activated_by
                where ra.status in ('completed','deactivated')""");
        List<Object> completedParams = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("i", completedSql, completedParams);
        completedSql.append(" order by ra.deactivated_at desc nulls last limit 10");
        out.put("completed", jdbc.queryForList(completedSql.toString(), completedParams.toArray())
                .stream().map(CommandCenterServiceImpl::cleanActivationJson).toList());
        // Approved incidents that have no activation yet (the source's awaiting list)
        StringBuilder awaitingSql = new StringBuilder("""
                select i.id, i.title, i.severity_level, i.region_name, i.workflow_status
                from public.incidents i
                where i.workflow_status = 'approved' and i.is_simulation = false
                  and not exists (select 1 from public.response_activations ra
                                  where ra.incident_id = i.id and ra.status = 'active')""");
        List<Object> awaitingParams = new ArrayList<>();
        jurisdiction.appendAreaScopeWithCouncil("i", awaitingSql, awaitingParams);
        awaitingSql.append(" order by i.reported_at desc limit 50");
        out.put("awaiting", jdbc.queryForList(awaitingSql.toString(), awaitingParams.toArray()));
        out.put("posture_doctrine", jdbc.queryForList(
                "select * from public.posture_doctrine order by sort_order"));
        // National / area ops snapshot so the Command Post index is the single entry to all Response work.
        out.put("response_hub", buildResponseIndexHub());
        return out;
    }

    /** Open an activation — mode 'live' or 'simulation' (drill clone, V29). */
    @Override
    @Transactional
    public Map<String, Object> activate(long incidentId,
                                        Map<String, Object> body) {
        // Only open a command post for an incident in the caller's own area (national sees all).
        areaGuard.assertOwn("public.incidents", incidentId);
        boolean simulation = body != null && "simulation".equals(body.get("mode"));
        // Only for simulations: table-top drill (default, real side-effects blocked) vs full-scale exercise.
        boolean allowRealOps = simulation && body != null && Boolean.parseBoolean(String.valueOf(body.get("allow_real_ops")));
        String notes = body == null || body.get("notes") == null ? null : String.valueOf(body.get("notes"));
        Map<String, Object> result = activations.activate(incidentId, simulation, allowRealOps, notes);
        return Map.of("success", true, "activation_id", result.get("activation_id"),
                "message", (simulation
                        ? (allowRealOps ? "FULL-SCALE exercise activated (real operations permitted). "
                                        : "Table-top simulation drill activated. ")
                        : "Disaster response activated. ")
                        + "72-hour clock has started — " + result.get("tasks_created") + " DRF tasks created.");
    }

    /** Issued warnings eligible to open an anticipatory command post. */
    @Override
    public Map<String, Object> issuedWarningsForActivation() {
        return Map.of("warnings", jdbc.queryForList("""
                select w.id as warning_id, w.warning_code, w.status,
                       string_agg(distinct h.name, ' / ') as hazard,
                       (array_agg(wh.warning_level order by case lower(coalesce(wh.warning_level,''))
                            when 'major warning' then 1 when 'warning' then 2 when 'advisory' then 3 else 4 end))[1] as warning_level,
                       min(wh.validity_start) as validity_start,
                       max(wh.validity_end) as validity_end,
                       string_agg(distinct r.name, ', ') filter (where r.name is not null) as regions,
                       string_agg(distinct d.name, ', ') filter (where d.name is not null) as districts,
                       string_agg(distinct coalesce(d.name, r.name), ', ') filter (where coalesce(d.name, r.name) is not null) as affected_areas
                from public.warnings w
                join public.warning_hazards wh on wh.warning_id = w.id and wh.deleted_at is null
                left join public.hazards h on h.id = wh.hazard_id
                left join public.regions r on r.id = wh.region_id
                left join public.districts d on d.id = wh.district_id
                where w.deleted_at is null and lower(w.status) in ('approved','published')
                group by w.id, w.warning_code, w.status
                order by max(wh.validity_start) desc nulls last, w.id desc
                limit 50
                """));
    }

    // ─── Forecast lifecycle (NDPRP 2022 anticipatory activation, V30) ───

    /**
     * Anticipatory activation FROM A FORECAST, before any incident exists —
     * the cyclone-coming scenario: DMD opens the post at posture 'monitoring',
     * preparedness plans activate for the forecast-impact areas, and every DRF
     * lane goes visibly ON CALL.
     */
    @Override
    @Transactional
    public Map<String, Object> activateFromForecast(Map<String, Object> body) throws Exception {
        Map<String, Object> warning = linkedWarning(body);
        Long warningId = warning == null ? null : ((Number) warning.get("warning_id")).longValue();
        String warningCode = warning == null ? null : str(warning.get("warning_code"));
        String hazard = warning == null
                ? require(body.get("hazard_description"), "hazard_description")
                : firstNonBlank(str(warning.get("hazard")), "Issued warning") + " — " + warningCode;
        List<String> areas = warning == null ? requestAreas(body.get("affected_areas"))
                : splitCsv(str(warning.get("affected_areas")));
        if (areas.isEmpty()) {
            throw new BusinessRuleException("At least one forecast-impact area is required.");
        }
        boolean simulation = "simulation".equals(body.get("mode"));
        boolean allowRealOps = simulation && Boolean.parseBoolean(String.valueOf(body.get("allow_real_ops")));
        if (warningId != null && !simulation) {
            Long active = jdbc.queryForObject("""
                    select count(*) from public.response_activations
                    where warning_id = ? and status = 'active' and trigger_type = 'forecast'
                      and coalesce(is_simulation, false) = false
                    """, Long.class, warningId);
            if (active != null && active > 0) {
                throw new BusinessRuleException("A live anticipatory command post is already open for " + warningCode + ".");
            }
        }
        Long userId = users.actingUserId();
        Object expectedImpactAt = warning == null ? str(body.get("expected_impact_at")) : warning.get("validity_start");
        Long activationId = jdbc.queryForObject("""
                insert into public.response_activations(incident_id, activated_by, activated_at, status,
                    posture, trigger_type, warning_id, hazard_description, affected_areas, expected_impact_at,
                    forecast_track, is_simulation, allow_real_ops, notes, created_at, updated_at)
                values (null, ?, now(), 'active', 'monitoring', 'forecast', ?, ?, ?::json, ?::timestamptz,
                        ?::json, ?, ?, ?, now(), now()) returning id
                """, Long.class, userId, warningId, hazard,
                JSON.writeValueAsString(areas), expectedImpactAt,
                body.get("forecast_track") == null ? null : JSON.writeValueAsString(body.get("forecast_track")),
                simulation, allowRealOps, str(body.get("notes")));
        // Every DRF goes on call: seed the NDPRP default tasks as lanes (no incident yet)
        int tasks = jdbc.update("""
                insert into public.incident_tasks(incident_id, activation_id, drf_id, title, description,
                    priority, status, progress_percent, is_72hr_critical, sort_order, created_by_user_id,
                    created_at, updated_at)
                select null, ?, t.drf_id, t.title, t.description, t.default_priority, 'To Do', 0,
                       t.is_72hr_critical, t.sort_order, ?, now(), now()
                from public.drf_default_tasks t
                """, activationId, userId);
        activations.log(activationId, userId, "forecast_activated",
                (simulation ? "[SIMULATION] " : "") + "Anticipatory activation"
                        + (warningCode == null ? "" : " from " + warningCode) + " — " + hazard
                        + ". Areas: " + areas + ". All 15 DRFs on call ("
                        + tasks + " preparedness tasks).", null);
        return Map.of("success", true, "activation_id", activationId,
                "warning_id", warningId == null ? "" : warningId, "warning_code", warningCode == null ? "" : warningCode,
                "message", "Anticipatory activation opened at MONITORING posture. All DRFs are on call.");
    }

    /**
     * Walk the posture ladder (monitoring → emergency → disaster), per the
     * NDPRP escalation triggers. De-escalation is allowed (storm weakening).
     */
    @Override
    @Transactional
    public Map<String, Object> changePosture(long id, Map<String, Object> body) {
        Map<String, Object> activation = findOr404(id);
        assertMayManageForecast(activation);
        String posture = require(body.get("posture"), "posture");
        // 'safeguard' (Blue) is the de-escalation posture: storm passing, residual flood/landslide
        // risk remains — doctrine forbids jumping Red->stood-down without it.
        if (!List.of("monitoring", "emergency", "disaster", "safeguard").contains(posture)) {
            throw new BusinessRuleException("Posture must be monitoring, emergency, disaster or safeguard.");
        }
        if (posture.equals(activation.get("posture"))) {
            throw new BusinessRuleException("The activation is already at " + posture + " posture.");
        }
        jdbc.update("update public.response_activations set posture = ?, updated_at = now() where id = ?", posture, id);
        activations.log(id, users.actingUserId(), "posture_changed",
                "Posture: " + activation.get("posture") + " → " + posture.toUpperCase()
                        + (str(body.get("notes")) == null ? "" : ". " + str(body.get("notes"))), null);
        return Map.of("success", true, "message", "Posture moved to " + posture.toUpperCase() + ".");
    }

    /** The forecast died or missed — stand the post down, journalling the reason. */
    @Override
    @Transactional
    public Map<String, Object> cancelForecast(long id, Map<String, Object> body) {
        Map<String, Object> activation = findOr404(id);
        assertMayManageForecast(activation);
        if (!"forecast".equals(activation.get("trigger_type"))) {
            throw new BusinessRuleException("Only forecast-triggered activations can be cancelled this way.");
        }
        String reason = require(body.get("reason"), "reason");
        jdbc.update("""
                update public.response_activations set status = 'deactivated', deactivated_at = now(),
                    notes = ?, updated_at = now() where id = ?
                """, reason, id);
        activations.log(id, users.actingUserId(), "forecast_cancelled",
                "Forecast cancelled — " + reason + ". All DRFs stood down.", null);
        return Map.of("success", true, "message", "Forecast cancelled. The post has been stood down.");
    }

    /**
     * Impact confirmed (landfall / outbreak confirmed / quake struck): the
     * forecast activation becomes a disaster response — an incident is created
     * from the forecast details and linked, posture jumps to 'disaster'.
     */
    @Override
    @Transactional
    public Map<String, Object> confirmImpact(long id, Map<String, Object> body) {
        Map<String, Object> activation = findOr404(id);
        assertMayManageForecast(activation);
        if (activation.get("incident_id") != null) {
            throw new BusinessRuleException("This activation is already linked to an incident.");
        }
        boolean simulation = Boolean.TRUE.equals(activation.get("is_simulation"));
        // affected_areas is a json array column; format it as a readable location, not raw JSON.
        String location = formatAreas(activation.get("affected_areas"));
        // F80: resolve first matching region/district so CP board area readiness is not empty.
        Long regionId = null;
        Long districtId = null;
        String regionName = null;
        String districtName = null;
        try {
            List<String> areaNames = new ArrayList<>();
            if (activation.get("affected_areas") != null) {
                for (Object area : JSON.readValue(String.valueOf(activation.get("affected_areas")), List.class)) {
                    if (area != null && !String.valueOf(area).isBlank()) {
                        areaNames.add(String.valueOf(area).trim());
                    }
                }
            }
            for (String area : areaNames) {
                List<Map<String, Object>> dist = jdbc.queryForList("""
                        select d.id as district_id, d.name as district_name, r.id as region_id, r.name as region_name
                        from public.districts d
                        join public.regions r on r.id = d.region_id
                        where lower(d.name) = lower(?) or lower(d.name) like lower(?)
                        order by case when lower(d.name) = lower(?) then 0 else 1 end, d.id
                        limit 1
                        """, area, area + "%", area);
                if (!dist.isEmpty()) {
                    districtId = ((Number) dist.get(0).get("district_id")).longValue();
                    districtName = String.valueOf(dist.get(0).get("district_name"));
                    regionId = ((Number) dist.get(0).get("region_id")).longValue();
                    regionName = String.valueOf(dist.get(0).get("region_name"));
                    break;
                }
                List<Map<String, Object>> reg = jdbc.queryForList("""
                        select id as region_id, name as region_name from public.regions
                        where lower(name) = lower(?) or lower(name) like lower(?)
                        order by case when lower(name) = lower(?) then 0 else 1 end, id
                        limit 1
                        """, area, area + "%", area);
                if (!reg.isEmpty()) {
                    regionId = ((Number) reg.get(0).get("region_id")).longValue();
                    regionName = String.valueOf(reg.get(0).get("region_name"));
                    break;
                }
            }
        } catch (Exception ignored) {
            // keep null ids — location_description still carries the free-text areas
        }
        Long incidentId = jdbc.queryForObject("""
                insert into public.incidents(title, description, severity_level, status, workflow_status,
                    location_description, region_id, region_name, district_id, district_name,
                    reported_at, is_simulation, created_at, updated_at)
                values (?, ?, 'Critical', 'Active Response', 'approved', ?, ?, ?, ?, ?, now(), ?, now(), now())
                returning id
                """, Long.class,
                (simulation ? "[SIMULATION] " : "") + "Impact: " + activation.get("hazard_description"),
                "Created on impact confirmation from anticipatory activation #" + id
                        + (body == null || body.get("details") == null ? "" : ". " + body.get("details")),
                location, regionId, regionName, districtId, districtName, simulation);
        jdbc.update("""
                update public.response_activations set incident_id = ?, posture = 'disaster', updated_at = now()
                where id = ?
                """, incidentId, id);
        jdbc.update("update public.incident_tasks set incident_id = ? where activation_id = ?", incidentId, id);
        activations.log(id, users.actingUserId(), "impact_confirmed",
                "IMPACT CONFIRMED — posture DISASTER. Incident #" + incidentId
                        + " created and linked; response phase begins.", null);
        return Map.of("success", true, "incident_id", incidentId,
                "message", "Impact confirmed. Posture is DISASTER and incident #" + incidentId + " is linked.");
    }

    /** Readiness picture for the affected areas: evacuation centres, stockpiles, agencies on call. */
    @Override
    public Map<String, Object> readiness(long id) throws Exception {
        Map<String, Object> activation = findOr404(id);
        List<String> areas = new ArrayList<>();
        if (activation.get("affected_areas") != null) {
            for (Object area : JSON.readValue(String.valueOf(activation.get("affected_areas")), List.class)) {
                areas.add(String.valueOf(area));
            }
        }
        // Incident-triggered activations have no forecast areas — scope readiness down the administrative
        // protocol (region -> district -> council) to the incident's region AND district, so the situation
        // map's evac centres / stockpiles are precise to where the disaster is, not the whole region.
        String incidentDistrict = null;
        if (areas.isEmpty() && activation.get("incident_id") != null) {
            List<Map<String, Object>> loc = jdbc.queryForList(
                    "select region_name, district_name from public.incidents where id = ?", activation.get("incident_id"));
            if (!loc.isEmpty()) {
                Object r = loc.get(0).get("region_name");
                if (r != null && !String.valueOf(r).isBlank()) { areas.add(String.valueOf(r)); }
                Object d = loc.get(0).get("district_name");
                if (d != null && !String.valueOf(d).isBlank()) { incidentDistrict = String.valueOf(d); areas.add(incidentDistrict); }
            }
        }
        String[] like = areas.stream().map(a -> "%" + a + "%").toArray(String[]::new);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("areas", areas);
        out.put("scope_district", incidentDistrict);
        // Evac centres in the same DISTRICT surface first (region protocol), then the rest of the region.
        out.put("evacuation_centers", jdbc.queryForList("""
                select centre_name, centre_type, region, district, council, capacity_people, status, latitude, longitude
                from public.evacuation_centers
                where ? = 0 or region ilike any (?) or district ilike any (?)
                order by (case when district ilike any (?) then 0 else 1 end), region, district, centre_name
                limit 50
                """, areas.size(), like, like, like));
        out.put("warehouses", jdbc.queryForList("""
                select w.name, coalesce(w.city_or_region, w.location_address) as location, w.operational_status,
                       coalesce(sum(ii.quantity), 0) as stock_units
                from public.warehouses w
                left join public.inventory_items ii on ii.warehouse_id = w.id
                where ? = 0 or coalesce(w.city_or_region, w.location_address, w.zone, '') ilike any (?)
                group by w.id order by stock_units desc limit 20
                """, areas.size(), like));
        // F68: scope EW chips to activation affected areas (same ilike-any pattern as evac centres).
        out.put("early_warnings", jdbc.queryForList("""
                select warning_code, hazard_type, severity_level, affected_regions, affected_districts,
                       people_at_risk, status
                from public.early_warnings
                where status not in ('expired','cancelled')
                  and (? = 0
                       or coalesce(affected_regions,'') ilike any (?)
                       or coalesce(affected_districts,'') ilike any (?))
                order by created_at desc limit 10
                """, areas.size(), like, like));
        out.put("stakeholders_on_call", jdbc.queryForList("""
                select distinct s.id, s.name, s.organization from public.incident_tasks t
                join public.stakeholders s on s.id = t.stakeholder_id
                where t.activation_id = ?
                """, id));
        // The preparedness plans the Act requires be activated for the forecast-impact areas
        // (matched on hazard + area) — the per-area checklist of activities and responsible actors.
        out.put("anticipatory_plans",
                plans.matchingPlans(String.valueOf(activation.get("hazard_description")), areas));
        return out;
    }

    // ─── Command board ───

    @Override
    public Map<String, Object> board(long id) {
        Map<String, Object> activation = findOr404(id);
        Map<String, Object> out = new LinkedHashMap<>();
        // LEFT JOIN incidents: an anticipatory (forecast-triggered) activation has no
        // incident until impact is confirmed, so it must still render its board. Fall back
        // to the forecast hazard description for the title.
        out.put("activation", cleanActivationJson(jdbc.queryForMap("""
                select ra.*, coalesce(i.title, ra.hazard_description) as incident_title,
                       i.severity_level, i.region_name, i.location_description, i.latitude, i.longitude,
                       i.status as incident_status, ew.warning_code, s.title as scenario_title,
                       er.run_code, u.name as activated_by_name
                from public.response_activations ra
                left join public.incidents i on i.id = ra.incident_id
                left join public.warnings ew on ew.id = ra.warning_id
                left join public.exercise_runs er on er.id = ra.exercise_run_id
                left join public.exercise_scenarios s on s.id = ra.scenario_id
                left join public.users u on u.id = ra.activated_by
                where ra.id = ?
                """, id)));
        // One row per DRF lane with its live stats (source's drfStats loop, one query)
        out.put("drfs", jdbc.queryForList("""
                select f.id, f.number, f.name, f.lead_agency_name, f.icon, f.color,
                       count(t.id) as total,
                       count(t.id) filter (where t.status = 'Completed') as completed,
                       count(t.id) filter (where t.status = 'In Progress') as in_progress,
                       coalesce(round(avg(t.progress_percent)), 0) as progress,
                       max(s.organization) as stakeholder_organization
                from public.disaster_response_functions f
                left join public.incident_tasks t on t.drf_id = f.id and t.activation_id = ?
                left join public.stakeholders s on s.id = t.stakeholder_id
                group by f.id order by f.number
                """, id));
        out.put("critical_tasks", jdbc.queryForList("""
                select t.*, f.number as drf_number, f.name as drf_name, s.organization as stakeholder_organization
                from public.incident_tasks t
                join public.disaster_response_functions f on f.id = t.drf_id
                left join public.stakeholders s on s.id = t.stakeholder_id
                where t.activation_id = ? and t.is_72hr_critical = true
                order by t.sort_order
                """, id));
        out.put("challenges", jdbc.queryForList("""
                select t.id, t.title, t.challenge, t.updated_at, f.number as drf_number,
                       s.organization as stakeholder_organization
                from public.incident_tasks t
                join public.disaster_response_functions f on f.id = t.drf_id
                left join public.stakeholders s on s.id = t.stakeholder_id
                where t.activation_id = ? and coalesce(t.challenge, '') <> ''
                order by t.updated_at desc limit 10
                """, id));
        out.put("recent_activity", activityQuery(id, null, null, 10));
        out.put("summary", jdbc.queryForMap("""
                select count(*) as total_tasks,
                       count(*) filter (where status = 'Completed') as completed_tasks,
                       coalesce(round(avg(progress_percent)), 0) as overall_progress,
                       count(distinct stakeholder_id) filter (where stakeholder_id is not null) as assigned_stakeholders
                from public.incident_tasks where activation_id = ?
                """, id));
        out.put("logistics", buildLogisticsBlock(activation.get("incident_id")));
        out.put("situation_reports", buildSituationReportsBlock(activation));
        // Full Response functional hub — every Response module surface with live counts + deep links.
        out.put("linked_ops", buildLinkedOpsHub(activation, id));
        // F31 — real operational periods (IAP cadence), not only age-derived labels.
        out.put("operational_periods", buildOperationalPeriodsBlock(id));
        out.put("stakeholders", jdbc.queryForList(
                "select id, name, organization from public.stakeholders where coalesce(is_active, true) order by organization nulls last, name"));
        // ICS org chart (F05, V140): one entry per standard command role — the active holder
        // or a vacant flag — plus the static DRF-lane → section-chief grouping for the hierarchy.
        out.put("command_roles", commandRolesBlock(id));
        out.put("drf_sections", DRF_SECTIONS);
        out.put("task_statuses", TASK_STATUSES);
        out.put("priorities", PRIORITIES);
        // Doctrine reference: posture -> TEPRP level / alert colour / authoriser (V41 seed)
        out.put("posture_doctrine", jdbc.queryForList(
                "select * from public.posture_doctrine order by sort_order"));
        // Scenario injects: fire any that came due since the last look (evaluated on read — no scheduler
        // needed; the board polls), then hand the full list to the exercise panel.
        int fired = jdbc.update("update public.activation_injects set status='fired', fired_at=now(), updated_at=now() "
                + "where activation_id = ? and status = 'pending' and due_at is not null and due_at <= now()", id);
        if (fired > 0) {
            activations.log(id, users.actingUserId(), "inject_fired",
                    fired + " scheduled scenario inject(s) fired.", null);
        }
        out.put("injects", jdbc.queryForList("""
                select ai.*, drf.number as target_drf_number, drf.name as target_drf_name
                from public.activation_injects ai
                left join public.disaster_response_functions drf on drf.id = ai.target_drf_id
                where ai.activation_id = ?
                order by coalesce(ai.due_at, ai.created_at), ai.id
                """, id));
        // After-action review once the activation is closed (drill or live — both are worth reviewing).
        if (!"active".equals(String.valueOf(activation.get("status")))) {
            out.put("aar", buildAar(id));
        }
        return out;
    }

    // ─── Operational periods (IAP cadence — F31) ───

    /**
     * Open a new operational period. Closes any currently open period (with optional handover notes
     * on that close via a separate close call — this method only opens the next numbered period).
     */
    @Override
    @Transactional
    public Map<String, Object> openPeriod(long id, Map<String, Object> body) {
        findOr404(id);
        ensurePeriodTable();
        // Auto-close previous open period if any
        jdbc.update("""
                update public.activation_periods
                   set status = 'closed', ended_at = coalesce(ended_at, now()), updated_at = now()
                 where activation_id = ? and status = 'open'
                """, id);
        Integer next = jdbc.queryForObject(
                "select coalesce(max(period_number), 0) + 1 from public.activation_periods where activation_id = ?",
                Integer.class, id);
        int n = next == null ? 1 : next;
        String label = body != null && str(body.get("label")) != null
                ? str(body.get("label"))
                : "Operational Period " + n;
        String objectives = body == null ? null : str(body.get("objectives"));
        Long periodId = jdbc.queryForObject("""
                insert into public.activation_periods
                    (activation_id, period_number, label, objectives, status, started_at, created_by, created_at, updated_at)
                values (?,?,?,?, 'open', now(), ?, now(), now())
                returning id
                """, Long.class, id, n, label, objectives, users.actingUserId());
        activations.log(id, users.actingUserId(), "period_opened",
                "Opened " + label + (objectives == null || objectives.isBlank() ? "" : " — " + objectives), null);
        return Map.of("success", true, "period_id", periodId, "period_number", n, "label", label);
    }

    /** Close an open operational period with optional handover notes (feeds AAR). */
    @Override
    @Transactional
    public Map<String, Object> closePeriod(long id, long periodId,
                                           Map<String, Object> body) {
        findOr404(id);
        ensurePeriodTable();
        String notes = body == null ? null : str(body.get("handover_notes"));
        int n = jdbc.update("""
                update public.activation_periods
                   set status = 'closed', ended_at = now(), handover_notes = coalesce(?, handover_notes),
                       updated_at = now()
                 where id = ? and activation_id = ? and status = 'open'
                """, notes, periodId, id);
        if (n == 0) {
            throw new BusinessRuleException("Period not found or already closed.");
        }
        Map<String, Object> row = jdbc.queryForMap(
                "select label, period_number from public.activation_periods where id = ?", periodId);
        activations.log(id, users.actingUserId(), "period_closed",
                "Closed " + row.get("label")
                        + (notes == null || notes.isBlank() ? "" : " — handover: " + notes), null);
        return Map.of("success", true, "status", "closed", "period_id", periodId);
    }

    // ─── Scenario injects (exercise director tools) ───

    /** Script an inject into the exercise: fires at due_at, or manually via /fire. */
    @Override
    @Transactional
    public Map<String, Object> addInject(long id, Map<String, Object> body) {
        findOr404(id);
        String title = require(body.get("title"), "title");
        String type = body.get("inject_type") == null ? "event" : String.valueOf(body.get("inject_type"));
        if (!List.of("event", "decision", "message").contains(type)) {
            throw new BusinessRuleException("inject_type must be event, decision or message.");
        }
        Long injectId = jdbc.queryForObject("""
                insert into public.activation_injects(activation_id, title, detail, inject_type, due_at, created_by)
                values (?,?,?,?, ?::timestamp, ?) returning id
                """, Long.class, id, title, str(body.get("detail")), type,
                str(body.get("due_at")), users.actingUserId());
        activations.log(id, users.actingUserId(), "inject_scripted",
                "Inject scripted: " + title + (body.get("due_at") != null ? " (due " + body.get("due_at") + ")" : " (manual fire)"), null);
        return Map.of("success", true, "inject_id", injectId);
    }

    /** Fire an inject NOW (exercise director pushes the event onto the board). */
    @Override
    @Transactional
    public Map<String, Object> fireInject(long id, long injectId) {
        findOr404(id);
        int n = jdbc.update("update public.activation_injects set status='fired', fired_at=now(), updated_at=now() "
                + "where id = ? and activation_id = ? and status = 'pending'", injectId, id);
        if (n == 0) {
            throw new BusinessRuleException("Inject not found or already fired.");
        }
        Map<String, Object> in = jdbc.queryForMap("select title from public.activation_injects where id = ?", injectId);
        activations.log(id, users.actingUserId(), "inject_fired", "INJECT: " + in.get("title"), null);
        return Map.of("success", true, "status", "fired");
    }

    /** Commander resolves a fired inject with the decision/response taken (feeds the AAR). */
    @Override
    @Transactional
    public Map<String, Object> resolveInject(long id, long injectId,
                                             Map<String, Object> body) {
        findOr404(id);
        String resolution = body == null ? null : str(body.get("resolution"));
        int n = jdbc.update("update public.activation_injects set status='resolved', resolved_at=now(), "
                + "resolution=?, updated_at=now() where id = ? and activation_id = ? and status = 'fired'",
                resolution, injectId, id);
        if (n == 0) {
            throw new BusinessRuleException("Inject not found or not in a fired state.");
        }
        Map<String, Object> in = jdbc.queryForMap("select title from public.activation_injects where id = ?", injectId);
        activations.log(id, users.actingUserId(), "inject_resolved",
                "Inject resolved: " + in.get("title") + (resolution == null || resolution.isBlank() ? "" : " — " + resolution), null);
        return Map.of("success", true, "status", "resolved");
    }

    /** Remove a pending inject (mis-scripted). */
    @Override
    @Transactional
    public Map<String, Object> deleteInject(long id, long injectId) {
        findOr404(id);
        int n = jdbc.update("delete from public.activation_injects where id = ? and activation_id = ? and status = 'pending'",
                injectId, id);
        if (n == 0) {
            throw new BusinessRuleException("Only pending injects can be removed.");
        }
        return Map.of("success", true);
    }

    /** After-action review — also available mid-exercise as a live scorecard. */
    @Override
    public Map<String, Object> aar(long id) {
        findOr404(id);
        return buildAar(id);
    }

    // ─── Full Response Ops Hub (Command Post as the single entry to all Response work) ───

    /**
     * National / area snapshot for the activations index: every Response module surface with live
     * queue counts and deep links so the Command Post is the hub for all Response functionalities.
     */
    private Map<String, Object> buildResponseIndexHub() {
        Map<String, Object> hub = new LinkedHashMap<>();
        hub.put("title", "Full Response Ops Hub");
        hub.put("subtitle", "Every Response function with live queue counts — open any surface from the Command Post");

        long activeIncidents = scopedCountIncidents("coalesce(i.is_simulation,false)=false and i.status in ('Active Response','Verified','Reported','Pending Verification')");
        long criticalIncidents = scopedCountIncidents("coalesce(i.is_simulation,false)=false and i.severity_level = 'Critical' and i.status <> 'Closed'");
        long awaitingActivation = scopedCountIncidents(
                "i.workflow_status = 'approved' and coalesce(i.is_simulation,false)=false "
                + "and not exists (select 1 from public.response_activations ra where ra.incident_id = i.id and ra.status = 'active')");
        long activeActivations = safeCount("select count(*) from public.response_activations where status = 'active' and coalesce(is_simulation,false)=false");
        long anticipatory = safeCount("select count(*) from public.response_activations where status = 'active' and trigger_type = 'forecast' and coalesce(is_simulation,false)=false");
        long simulations = safeCount("select count(*) from public.response_activations where status = 'active' and is_simulation = true");
        long issuedAlerts = safeCount("select count(*) from public.warnings where deleted_at is null and lower(status) in ('approved','published')");
        long publicReportsOpen = safeCount("select count(*) from public.public_hazard_reports where status in ('new','reviewing')");
        long assessmentsPending = scopedCountViaIncident(
                "select count(*) from public.damage_assessments da join public.incidents i on i.id = da.incident_id where da.status = 'Pending Verification' and coalesce(i.is_simulation,false)=false");
        long resourcesPending = scopedCountViaIncident(
                "select count(*) from public.allocated_resources ar join public.incidents i on i.id = ar.incident_id where ar.workflow_status = 'pending_approval' and coalesce(i.is_simulation,false)=false");
        long dispatchPending = safeCount("select count(*) from public.dispatch_approvals where status = 'Pending' and deleted_at is null");
        long resourcesDeployed = scopedCountViaIncident(
                "select count(*) from public.allocated_resources ar join public.incidents i on i.id = ar.incident_id where ar.status = 'Deployed' and coalesce(i.is_simulation,false)=false");
        long tasksOpen = safeCount("""
                select count(*) from public.incident_tasks t
                where t.status in ('To Do','In Progress','On Hold')
                  and not exists (select 1 from public.response_activations sa where sa.id = t.activation_id and sa.is_simulation)
                """);
        long declarationsActive = safeCount("""
                select count(*) from public.disaster_declarations
                where status = 'declared' and coalesce(is_simulation,false)=false
                  and (effective_until is null or effective_until >= current_date)
                """);
        long declarationsChain = safeCount("""
                select count(*) from public.disaster_declarations
                where status in ('proposed','technical_review','steering_endorsed') and coalesce(is_simulation,false)=false
                """);
        long dlnaOpen = safeCount("select count(*) from public.dlna_assessments where status <> 'Final'");
        long alertsToday = safeCount("select count(*) from public.alerts where created_at::date = current_date");
        long stockUnits = safeCount("select coalesce(sum(quantity),0) from public.inventory_items where status = 'Good Condition'");
        long donationsOpen = safeCount("select count(*) from public.ndmf_donations where status in ('pledged','received','pending','acknowledged')");
        long supportNeeds = safeCount("""
                select
                  (select count(*) from public.mitigation_measures m
                    where m.approval_status = 'approved' and m.support_funded_at is null
                      and m.additional_support_required is not null and btrim(m.additional_support_required) <> ''
                      and lower(m.additional_support_required) not in ('no','none','n/a'))
                + (select count(*) from public.training_plans t
                    where t.support_requested_at is not null and (t.source_of_fund is null or t.source_of_fund = ''))
                """);
        long procurementLines = safeCount("""
                select count(*) from public.allocated_resources ar
                where ar.source_details is not null and ar.source_details::text like '%procurement%'
                  and ar.status not in ('Delivered','Deployed','Cancelled','Rejected')
                """);

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("active_incidents", activeIncidents);
        snapshot.put("critical_incidents", criticalIncidents);
        snapshot.put("active_activations", activeActivations);
        snapshot.put("anticipatory_activations", anticipatory);
        snapshot.put("simulations", simulations);
        snapshot.put("awaiting_activation", awaitingActivation);
        snapshot.put("issued_alerts", issuedAlerts);
        snapshot.put("public_reports_open", publicReportsOpen);
        snapshot.put("assessments_pending", assessmentsPending);
        snapshot.put("resource_approvals_pending", resourcesPending);
        snapshot.put("dispatch_approvals_pending", dispatchPending);
        snapshot.put("resources_deployed", resourcesDeployed);
        snapshot.put("open_tasks", tasksOpen);
        snapshot.put("active_declarations", declarationsActive);
        snapshot.put("declarations_in_chain", declarationsChain);
        snapshot.put("dlna_open", dlnaOpen);
        snapshot.put("alerts_today", alertsToday);
        snapshot.put("stock_units", stockUnits);
        hub.put("snapshot", snapshot);

        List<Map<String, Object>> groups = new ArrayList<>();
        groups.add(hubGroup("command", "1. Command", List.of(
                hubLink("dashboard", "Response Dashboard", "fa-tachometer-alt", "/m/response/dashboard",
                        activeIncidents, "active incidents", "National / area response overview"),
                hubLink("eocc", "EOCC Command Center", "fa-terminal", "/m/response/eocc",
                        activeActivations, "active posts", "Live multi-activation operations board"),
                hubLink("executive", "Executive Watch", "fa-binoculars", "/m/response/executive-watch",
                        criticalIncidents, "critical", "National situation picture for leadership"),
                hubLink("coordination", "Command Post", "fa-tower-broadcast", "/m/response/coordination",
                        activeActivations + simulations, "live + drill", "DRF coordination, posture, anticipatory & simulation"),
                hubLink("declarations", "Disaster Declarations", "fa-file-contract", "/m/response/declarations",
                        declarationsActive + declarationsChain, "active / in chain", "s.32 Disaster Area & s.33 State of Emergency")
        )));
        groups.add(hubGroup("alerts", "2. Alerts & intake", List.of(
                hubLink("issued-alerts", "Issued Alerts", "fa-bell", "/m/response/issued-alerts",
                        issuedAlerts, "published", "Government warnings issued for action"),
                hubLink("public-reports", "Public Reports", "fa-flag", "/m/response/public-reports",
                        publicReportsOpen, "open queue", "Citizen hazard reports awaiting triage"),
                hubLink("communication", "Alert Dissemination", "fa-comments", "/m/response/communication",
                        alertsToday, "sent today", "Multi-channel alert distribution")
        )));
        groups.add(hubGroup("incidents", "3. Incidents & assessment", List.of(
                hubLink("incidents", "Active Incidents", "fa-exclamation-triangle", "/m/response/incidents",
                        activeIncidents, "open", "Track and manage response incidents"),
                hubLink("assessments", "Damage Assessments", "fa-clipboard-check", "/m/response/assessments",
                        assessmentsPending, "pending verify", "Per-incident damage & needs assessments"),
                hubLink("dlna", "DLNA & Recovery Plans", "fa-file-lines", "/m/response/dlna",
                        dlnaOpen, "in progress", "NDRF Annex 1 DLNA and Annex 2 recovery plans")
        )));
        groups.add(hubGroup("logistics", "4. Resources & logistics", List.of(
                hubLink("resource-approvals", "Resource Approvals", "fa-truck", "/m/response/resource-approvals",
                        resourcesPending, "pending approval", "Approve resource allocation requests"),
                hubLink("resource-dispatch", "Resource Dispatch", "fa-shipping-fast", "/m/response/resource-dispatch",
                        resourcesDeployed, "deployed", "Source and dispatch allocated resources"),
                hubLink("dispatch-approvals", "Dispatch Approvals", "fa-clipboard-check", "/m/response/dispatch-approvals",
                        dispatchPending, "pending", "Warehouse / source dispatch gate"),
                hubLink("procurement", "Procurement Requests", "fa-shopping-cart", "/m/response/procurement",
                        procurementLines, "open lines", "Procurement chain for shortfalls"),
                hubLink("warehouse", "Warehouse Operations", "fa-warehouse", "/m/response/warehouse-ops",
                        stockUnits, "stock units", "Intake, removals, transfers, stock taking"),
                hubLink("donations", "Stakeholder Donations", "fa-hand-holding-heart", "/m/response/donations",
                        donationsOpen, "open", "NDMF and partner donations"),
                hubLink("support-needs", "Support Needs", "fa-hands-helping", "/m/response/support-needs",
                        supportNeeds, "open", "Support needs and pledges")
        )));
        groups.add(hubGroup("coordination", "5. Coordination", List.of(
                hubLink("tasks", "Task Assignment", "fa-tasks", "/m/response/tasks",
                        tasksOpen, "open tasks", "Assign and monitor response tasks"),
                hubLink("communication-coord", "Alert Dissemination", "fa-comments", "/m/response/communication",
                        alertsToday, "today", "Comms desk — SMS / email / app / web")
        )));
        hub.put("groups", groups);
        return hub;
    }

    /**
     * Activation-scoped ops hub on the open board: deep-links into every Response function, with
     * counts filtered to this activation's incident where applicable.
     */
    private Map<String, Object> buildLinkedOpsHub(Map<String, Object> activation, long activationId) {
        Map<String, Object> hub = new LinkedHashMap<>();
        hub.put("title", "Response Functions — this activation");
        hub.put("subtitle", "Jump to every Response surface for this command post");
        Object incidentIdRaw = activation.get("incident_id");
        Long incidentId = incidentIdRaw == null ? null : ((Number) incidentIdRaw).longValue();
        hub.put("incident_id", incidentId);
        hub.put("activation_id", activationId);
        hub.put("has_incident", incidentId != null);

        long tasksOpen = safeCount(
                "select count(*) from public.incident_tasks where activation_id = ? and status in ('To Do','In Progress','On Hold')",
                activationId);
        long tasksDone = safeCount(
                "select count(*) from public.incident_tasks where activation_id = ? and status = 'Completed'",
                activationId);
        long challenges = safeCount(
                "select count(*) from public.incident_tasks where activation_id = ? and coalesce(challenge,'') <> ''",
                activationId);
        long injectsOpen = safeCount(
                "select count(*) from public.activation_injects where activation_id = ? and status in ('pending','fired')",
                activationId);
        long rolesFilled = safeCount(
                "select count(*) from public.activation_command_roles where activation_id = ? and relieved_at is null",
                activationId);
        long periodsOpen = periodTableReady()
                ? safeCount("select count(*) from public.activation_periods where activation_id = ? and status = 'open'", activationId)
                : 0L;

        long allocations = 0, pendingApproval = 0, pendingDispatch = 0, assessments = 0, sitreps = 0, dlna = 0, alerts = 0;
        if (incidentId != null) {
            allocations = safeCount("select count(*) from public.allocated_resources where incident_id = ?", incidentId);
            pendingApproval = safeCount(
                    "select count(*) from public.allocated_resources where incident_id = ? and workflow_status = 'pending_approval'",
                    incidentId);
            pendingDispatch = safeCount("""
                    select count(*) from public.dispatch_approvals da
                    join public.allocated_resources ar on ar.id = da.allocated_resource_id
                    where ar.incident_id = ? and da.status = 'Pending' and da.deleted_at is null
                    """, incidentId);
            assessments = safeCount("select count(*) from public.damage_assessments where incident_id = ?", incidentId);
            sitreps = safeCount("select count(*) from public.incident_history_reports where incident_id = ?", incidentId);
            dlna = safeCount("""
                    select count(*) from public.dlna_assessments d
                    where d.incident_id = ?
                       or exists (select 1 from public.dlna_incidents di where di.assessment_id = d.id and di.incident_id = ?)
                    """, incidentId, incidentId);
            alerts = safeCount("select count(*) from public.alerts where incident_id = ?", incidentId);
        }

        String incidentQ = incidentId == null ? "" : ("?incident_id=" + incidentId);
        String activationQ = "?activation=" + activationId;
        String dispatchUrl = incidentId == null ? "/m/response/resource-dispatch" : "/m/response/resource-dispatch" + incidentQ;
        String approvalsUrl = incidentId == null ? "/m/response/resource-approvals" : "/m/response/resource-approvals" + incidentQ;
        String incidentUrl = incidentId == null ? "/m/response/incidents" : "/m/response/incidents/" + incidentId;
        String assessUrl = incidentId == null ? "/m/response/assessments" : "/m/response/assessments" + incidentQ;
        String dlnaUrl = incidentId == null ? "/m/response/dlna" : "/m/response/dlna" + incidentQ;
        String recoveryUrl = incidentId == null ? "/m/response/dlna" : "/m/response/recovery-plan/" + incidentId;
        String tasksUrl = "/m/response/tasks" + (incidentId == null ? "" : incidentQ);
        String commsUrl = "/m/response/communication" + (incidentId == null ? "" : incidentQ);

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("tasks_open", tasksOpen);
        snapshot.put("tasks_completed", tasksDone);
        snapshot.put("challenges", challenges);
        snapshot.put("injects_open", injectsOpen);
        snapshot.put("ics_roles_filled", rolesFilled);
        snapshot.put("periods_open", periodsOpen);
        snapshot.put("allocations", allocations);
        snapshot.put("resource_approvals_pending", pendingApproval);
        snapshot.put("dispatch_approvals_pending", pendingDispatch);
        snapshot.put("assessments", assessments);
        snapshot.put("situation_reports", sitreps);
        snapshot.put("dlna", dlna);
        snapshot.put("alerts", alerts);
        hub.put("snapshot", snapshot);

        List<Map<String, Object>> groups = new ArrayList<>();
        groups.add(hubGroup("command", "Command & picture", List.of(
                hubLink("eocc", "EOCC Board", "fa-terminal", "/m/response/eocc",
                        null, null, "Multi-activation operations picture"),
                hubLink("executive", "Executive Watch", "fa-binoculars", "/m/response/executive-watch",
                        null, null, "Escalate the national picture"),
                hubLink("declarations", "Declarations", "fa-file-contract", "/m/response/declarations" + activationQ,
                        null, null, "Link Disaster Area / SoE to this activation"),
                hubLink("incident", "Incident record", "fa-exclamation-triangle", incidentUrl,
                        sitreps, "SITREPs", incidentId == null
                                ? "Available after impact creates an incident"
                                : "Situation reports, history, people & damage")
        )));
        groups.add(hubGroup("drf", "DRF & tasking (this post)", List.of(
                hubLink("tasks", "Task Assignment", "fa-tasks", tasksUrl,
                        tasksOpen, "open", "All tasks for this activation / incident"),
                hubLink("challenges", "Challenges feed", "fa-triangle-exclamation", "/m/response/coordination" + activationQ,
                        challenges, "flagged", "Scroll to challenges on this board"),
                hubLink("injects", "Scenario injects", "fa-bolt", "/m/response/coordination" + activationQ,
                        injectsOpen, "pending/fired", "Exercise injects for this post"),
                hubLink("ics", "ICS command roles", "fa-sitemap", "/m/response/coordination" + activationQ,
                        rolesFilled, "filled", "Appoint IC and General Staff on this board")
        )));
        groups.add(hubGroup("alerts", "Alerts & intake", List.of(
                hubLink("issued-alerts", "Issued Alerts", "fa-bell", "/m/response/issued-alerts",
                        null, null, "Published warnings covering the area"),
                hubLink("public-reports", "Public Reports", "fa-flag", "/m/response/public-reports",
                        null, null, "Citizen reports for triage"),
                hubLink("communication", "Alert Dissemination", "fa-comments", commsUrl,
                        alerts, "for incident", "Send multi-channel alerts for this response")
        )));
        groups.add(hubGroup("assessment", "Assessment & recovery", List.of(
                hubLink("assessments", "Damage Assessments", "fa-clipboard-check", assessUrl,
                        assessments, "filed", incidentId == null ? "After incident link" : "Field assessments for this incident"),
                hubLink("dlna", "DLNA", "fa-file-lines", dlnaUrl,
                        dlna, "assessments", "NDRF Annex 1 sector DLNA"),
                hubLink("recovery", "Recovery Plan", "fa-road", recoveryUrl,
                        null, null, incidentId == null ? "After incident link" : "Annex 2 recovery implementation plan")
        )));
        groups.add(hubGroup("logistics", "Resources & logistics", List.of(
                hubLink("resource-approvals", "Resource Approvals", "fa-truck", approvalsUrl,
                        pendingApproval, "pending", "Approve allocations for this incident"),
                hubLink("dispatch", "Resource Dispatch", "fa-shipping-fast", dispatchUrl,
                        allocations, "lines", "Source and move resources"),
                hubLink("dispatch-approvals", "Dispatch Approvals", "fa-clipboard-check",
                        "/m/response/dispatch-approvals" + (incidentId == null ? "" : incidentQ),
                        pendingDispatch, "pending", "Source-side dispatch gate"),
                hubLink("procurement", "Procurement", "fa-shopping-cart",
                        "/m/response/procurement" + (incidentId == null ? "" : incidentQ),
                        null, null, "Buy / procure shortfalls"),
                hubLink("warehouse", "Warehouse Ops", "fa-warehouse", "/m/response/warehouse-ops",
                        null, null, "Stock intake, transfer, stock-take"),
                hubLink("donations", "Donations", "fa-hand-holding-heart", "/m/response/donations",
                        null, null, "Partner / NDMF donations"),
                hubLink("support-needs", "Support Needs", "fa-hands-helping", "/m/response/support-needs",
                        null, null, "Support needs and pledges")
        )));
        hub.put("groups", groups);
        return hub;
    }

    private Map<String, Object> hubGroup(String key, String label, List<Map<String, Object>> items) {
        Map<String, Object> g = new LinkedHashMap<>();
        g.put("key", key);
        g.put("label", label);
        g.put("items", items);
        long attention = items.stream()
                .map(i -> i.get("count"))
                .filter(c -> c instanceof Number)
                .mapToLong(c -> ((Number) c).longValue())
                .sum();
        g.put("attention_total", attention);
        return g;
    }

    private Map<String, Object> hubLink(String key, String name, String icon, String path,
                                        Long count, String countLabel, String description) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("key", key);
        item.put("name", name);
        item.put("icon", icon);
        item.put("path", path);
        item.put("description", description);
        if (count != null) {
            item.put("count", count);
            item.put("count_label", countLabel == null ? "" : countLabel);
            item.put("attention", count > 0);
        } else {
            item.put("count", null);
            item.put("count_label", countLabel);
            item.put("attention", false);
        }
        return item;
    }

    private long safeCount(String sql, Object... args) {
        try {
            Long n = jdbc.queryForObject(sql, Long.class, args);
            return n == null ? 0L : n;
        } catch (Exception e) {
            return 0L;
        }
    }

    /** Count incidents with optional extra WHERE, applying area jurisdiction scope. */
    private long scopedCountIncidents(String extraWhere) {
        try {
            StringBuilder sql = new StringBuilder("select count(*) from public.incidents i where ");
            List<Object> params = new ArrayList<>();
            if (extraWhere != null && !extraWhere.isBlank()) {
                sql.append("(").append(extraWhere).append(")");
            } else {
                sql.append("true");
            }
            jurisdiction.appendAreaScopeWithCouncil("i", sql, params);
            Long n = jdbc.queryForObject(sql.toString(), Long.class, params.toArray());
            return n == null ? 0L : n;
        } catch (Exception e) {
            return 0L;
        }
    }

    /** Run a count SQL that already joins incidents as alias {@code i}, then append jurisdiction scope. */
    private long scopedCountViaIncident(String baseSqlEndingBeforeOrder) {
        try {
            // baseSql must include "join public.incidents i" and a WHERE clause already.
            StringBuilder sql = new StringBuilder(baseSqlEndingBeforeOrder);
            List<Object> params = new ArrayList<>();
            jurisdiction.appendAreaScopeWithCouncil("i", sql, params);
            Long n = jdbc.queryForObject(sql.toString(), Long.class, params.toArray());
            return n == null ? 0L : n;
        } catch (Exception e) {
            return 0L;
        }
    }

    /**
     * The after-action scorecard, derived entirely from what actually happened: the journalled
     * posture/impact timeline, task + 72-hour-critical completion, per-DRF performance, challenges,
     * and inject response times.
     */
    private Map<String, Object> buildAar(long id) {
        Map<String, Object> aar = new LinkedHashMap<>();
        aar.put("timeline", jdbc.queryForList("""
                select l.action, l.message, l.created_at, u.name as user_name
                from public.task_activity_log l
                left join public.users u on u.id = l.user_id
                where l.activation_id = ? and l.action in
                      ('activated','forecast_activated','posture_changed','impact_confirmed',
                       'inject_fired','inject_resolved','deactivated',
                       'command_role_appointed','command_role_relieved')
                order by l.created_at
                """, id));
        aar.put("tasks", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status = 'Completed') as completed,
                       coalesce(round(avg(progress_percent)), 0) as avg_progress,
                       count(*) filter (where is_72hr_critical) as critical_total,
                       count(*) filter (where is_72hr_critical and status = 'Completed') as critical_completed,
                       count(*) filter (where coalesce(challenge,'') <> '') as challenges,
                       count(distinct stakeholder_id) filter (where stakeholder_id is not null) as agencies_engaged
                from public.incident_tasks where activation_id = ?
                """, id));
        aar.put("drf_performance", jdbc.queryForList("""
                select f.number, f.name,
                       count(t.id) as total,
                       count(t.id) filter (where t.status = 'Completed') as completed,
                       coalesce(round(avg(t.progress_percent)), 0) as progress
                from public.disaster_response_functions f
                join public.incident_tasks t on t.drf_id = f.id and t.activation_id = ?
                group by f.number, f.name order by progress desc, f.number
                """, id));
        aar.put("injects", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where status in ('fired','resolved')) as fired,
                       count(*) filter (where status = 'resolved') as resolved,
                       round(coalesce(avg(extract(epoch from (resolved_at - fired_at)) / 60)
                             filter (where resolved_at is not null and fired_at is not null), 0)) as avg_response_minutes
                from public.activation_injects where activation_id = ?
                """, id));
        aar.put("duration", jdbc.queryForMap("""
                select activated_at, deactivated_at,
                       round(extract(epoch from (coalesce(deactivated_at, now()) - activated_at)) / 3600.0, 1) as hours,
                       is_simulation, allow_real_ops, posture, status
                from public.response_activations where id = ?
                """, id));
        return aar;
    }

    /** One DRF lane's tasks (the drawer behind each lane card). */
    @Override
    public Map<String, Object> drfDetail(long id, long drfId) {
        findOr404(id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("drf", jdbc.queryForMap("select * from public.disaster_response_functions where id = ?", drfId));
        out.put("tasks", jdbc.queryForList("""
                select t.*, s.organization as stakeholder_organization, u.name as assigned_to_name
                from public.incident_tasks t
                left join public.stakeholders s on s.id = t.stakeholder_id
                left join public.users u on u.id = t.assigned_to_user_id
                where t.activation_id = ? and t.drf_id = ? order by t.sort_order
                """, id, drfId));
        return out;
    }

    // ─── Lane actions ───

    /** Hand a whole DRF lane to a stakeholder organisation. */
    @Override
    @Transactional
    public Map<String, Object> assignDrf(long id, long drfId,
                                         Map<String, Object> body) {
        findOr404(id);
        long stakeholderId = lng(body.get("stakeholder_id"), "stakeholder_id");
        Map<String, Object> drf = jdbc.queryForMap(
                "select number, name from public.disaster_response_functions where id = ?", drfId);
        String organization = jdbc.queryForObject(
                "select coalesce(organization, name) from public.stakeholders where id = ?", String.class, stakeholderId);
        jdbc.update("update public.incident_tasks set stakeholder_id = ?, updated_at = now() where activation_id = ? and drf_id = ?",
                stakeholderId, id, drfId);
        activations.log(id, users.actingUserId(), "drf_assigned",
                "DRF " + drf.get("number") + " (" + drf.get("name") + ") assigned to " + organization, null);
        return Map.of("success", true, "message", "DRF " + drf.get("number") + " assigned to " + organization + ".");
    }

    /** Add a custom task to a lane. */
    @Override
    @Transactional
    public Map<String, Object> addTask(long id, long drfId,
                                       Map<String, Object> body) {
        Map<String, Object> activation = findOr404(id);
        String title = require(body.get("title"), "title");
        String priority = requireIn(body.get("priority"), PRIORITIES, "priority");
        boolean critical = Boolean.TRUE.equals(body.get("is_72hr_critical"));
        Long drfNumber = jdbc.queryForObject("select number from public.disaster_response_functions where id = ?", Long.class, drfId);
        Long taskId = jdbc.queryForObject("""
                insert into public.incident_tasks(incident_id, activation_id, drf_id, title, priority, status,
                    progress_percent, is_72hr_critical, sort_order, created_by_user_id, created_at, updated_at)
                values (?,?,?,?,?,'To Do',0,?,
                        coalesce((select max(sort_order) from public.incident_tasks where activation_id = ? and drf_id = ?), 0) + 1,
                        ?, now(), now()) returning id
                """, Long.class, activation.get("incident_id"), id, drfId, title, priority, critical, id, drfId,
                users.actingUserId());
        activations.log(id, users.actingUserId(), "task_added",
                "Custom task added to DRF " + drfNumber + ": " + title, taskId);
        return Map.of("success", true, "id", taskId, "message", "Task added successfully.");
    }

    /** Update a lane task — only changed fields are written, each change journalled. */
    @Override
    @Transactional
    public Map<String, Object> updateTask(long id, long taskId,
                                          Map<String, Object> body) {
        findOr404(id);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from public.incident_tasks where id = ? and activation_id = ?", taskId, id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Task not found in this activation.");
        }
        Map<String, Object> task = rows.get(0);
        List<String> changes = new ArrayList<>();

        String status = str(body.get("status"));
        if (status != null && !status.equals(task.get("status"))) {
            requireIn(status, TASK_STATUSES, "status");
            changes.add("Status: " + task.get("status") + " → " + status);
            boolean completed = "Completed".equals(status);
            jdbc.update("""
                    update public.incident_tasks set status = ?,
                        completed_at = case when ? then now() else completed_at end,
                        progress_percent = case when ? then 100 else progress_percent end,
                        updated_at = now() where id = ?
                    """, status, completed, completed, taskId);
        }
        if (body.get("progress_percent") != null) {
            int progress = (int) Double.parseDouble(String.valueOf(body.get("progress_percent")));
            if (progress < 0 || progress > 100) {
                throw new BusinessRuleException("Progress must be between 0 and 100.");
            }
            if (progress != ((Number) task.getOrDefault("progress_percent", 0)).intValue()) {
                changes.add("Progress: " + task.get("progress_percent") + "% → " + progress + "%");
                jdbc.update("update public.incident_tasks set progress_percent = ?, updated_at = now() where id = ?",
                        progress, taskId);
            }
        }
        if (body.get("stakeholder_id") != null) {
            long stakeholderId = lng(body.get("stakeholder_id"), "stakeholder_id");
            String organization = jdbc.queryForObject(
                    "select coalesce(organization, name) from public.stakeholders where id = ?", String.class, stakeholderId);
            changes.add("Assigned to: " + organization);
            jdbc.update("update public.incident_tasks set stakeholder_id = ?, updated_at = now() where id = ?",
                    stakeholderId, taskId);
        }
        String priority = str(body.get("priority"));
        if (priority != null && !priority.equals(task.get("priority"))) {
            requireIn(priority, PRIORITIES, "priority");
            changes.add("Priority: " + task.get("priority") + " → " + priority);
            jdbc.update("update public.incident_tasks set priority = ?, updated_at = now() where id = ?", priority, taskId);
        }
        if (str(body.get("challenge")) != null) {
            jdbc.update("update public.incident_tasks set challenge = ?, updated_at = now() where id = ?",
                    str(body.get("challenge")), taskId);
            changes.add("Challenge reported");
        }
        if (str(body.get("resource_request")) != null) {
            jdbc.update("update public.incident_tasks set resource_request = ?, updated_at = now() where id = ?",
                    str(body.get("resource_request")), taskId);
            changes.add("Resource need noted");
        }
        if (!changes.isEmpty()) {
            activations.log(id, users.actingUserId(), "task_updated", String.join("; ", changes), taskId);
        }
        return Map.of("success", true, "message", "Task updated.");
    }

    @Override
    @Transactional
    public Map<String, Object> destroyTask(long id, long taskId) {
        findOr404(id);
        List<String> titles = jdbc.queryForList(
                "select title from public.incident_tasks where id = ? and activation_id = ?", String.class, taskId, id);
        if (titles.isEmpty()) {
            throw new ResourceNotFoundException("Task not found in this activation.");
        }
        jdbc.update("delete from public.task_activity_log where task_id = ?", taskId);
        jdbc.update("delete from public.incident_tasks where id = ?", taskId);
        activations.log(id, users.actingUserId(), "task_updated", "Removed task: " + titles.get(0), null);
        return Map.of("success", true, "message", "Task \"" + titles.get(0) + "\" removed.");
    }

    /** Close the activation as completed (mission done) or deactivated (stood down). */
    @Override
    @Transactional
    public Map<String, Object> deactivate(long id, Map<String, Object> body) {
        assertMayManageForecast(findOr404(id));
        String status = require(body.get("status"), "status");
        if (!List.of("completed", "deactivated").contains(status)) {
            throw new BusinessRuleException("Status must be completed or deactivated.");
        }
        String notes = str(body.get("notes"));
        jdbc.update("""
                update public.response_activations set status = ?, deactivated_at = now(),
                    notes = coalesce(?, notes), updated_at = now() where id = ?
                """, status, notes, id);
        activations.log(id, users.actingUserId(), "deactivated",
                "Response " + status + ". " + (notes == null ? "" : notes), null);
        return Map.of("success", true, "message", "Response " + status + " successfully.");
    }

    // ─── ICS command roles (F05, V140) ───

    /**
     * Appoint an ICS command-role holder (Incident Commander, section chief, command staff).
     * The current incumbent — if any — is relieved first, and BOTH events are journalled into
     * task_activity_log so the After-Action Review shows the command handover.
     */
    @Override
    @Transactional
    public Map<String, Object> appointCommandRole(long id, Map<String, Object> body) {
        findOr404(id);
        String role = requireIn(body.get("role"), COMMAND_ROLES, "role");
        long userId = lng(body.get("user_id"), "user_id");
        List<String> names = jdbc.queryForList("select name from public.users where id = ?", String.class, userId);
        if (names.isEmpty()) {
            throw new BusinessRuleException("The selected user does not exist.");
        }
        String name = names.get(0);
        String note = str(body.get("note"));
        Long actor = users.actingUserId();
        // Relieve the incumbent first — one active holder per (activation, role); the partial
        // unique index uq_activation_command_role_active is the hard guarantee behind this.
        List<Map<String, Object>> incumbent = jdbc.queryForList("""
                select r.id, r.user_id, u.name as user_name
                from public.activation_command_roles r
                left join public.users u on u.id = r.user_id
                where r.activation_id = ? and r.role = ? and r.relieved_at is null
                """, id, role);
        if (!incumbent.isEmpty()) {
            if (((Number) incumbent.get(0).get("user_id")).longValue() == userId) {
                throw new BusinessRuleException(name + " already holds the " + roleTitle(role) + " role.");
            }
            jdbc.update("update public.activation_command_roles set relieved_at = now(), relieved_by = ? where id = ?",
                    actor, incumbent.get(0).get("id"));
            activations.log(id, actor, "command_role_relieved",
                    roleTitle(role) + ": " + incumbent.get(0).get("user_name")
                            + " relieved — handover to " + name + ".", null);
        }
        Long roleId = jdbc.queryForObject("""
                insert into public.activation_command_roles(activation_id, role, user_id, appointed_at, appointed_by, note)
                values (?,?,?,now(),?,?) returning id
                """, Long.class, id, role, userId, actor, note);
        activations.log(id, actor, "command_role_appointed",
                roleTitle(role) + ": " + name + " appointed." + (note == null ? "" : " " + note), null);
        return Map.of("success", true, "id", roleId,
                "message", name + " appointed as " + roleTitle(role) + ".");
    }

    /** Relieve a command-role holder WITHOUT a replacement — the role goes vacant (journalled). */
    @Override
    @Transactional
    public Map<String, Object> relieveCommandRole(long roleId,
                                                  Map<String, Object> body) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select r.*, u.name as user_name from public.activation_command_roles r
                left join public.users u on u.id = r.user_id
                where r.id = ?
                """, roleId);
        if (rows.isEmpty() || rows.get(0).get("relieved_at") != null) {
            throw new ResourceNotFoundException("Active command-role appointment not found.");
        }
        Map<String, Object> appointment = rows.get(0);
        long activationId = ((Number) appointment.get("activation_id")).longValue();
        // Same area-scoped visibility rule as every other board mutation (out-of-area → 404).
        findOr404(activationId);
        String role = String.valueOf(appointment.get("role"));
        String note = body == null ? null : str(body.get("note"));
        Long actor = users.actingUserId();
        jdbc.update("update public.activation_command_roles set relieved_at = now(), relieved_by = ? where id = ?",
                actor, roleId);
        activations.log(activationId, actor, "command_role_relieved",
                roleTitle(role) + ": " + appointment.get("user_name") + " relieved — role now vacant."
                        + (note == null ? "" : " " + note), null);
        return Map.of("success", true, "message", roleTitle(role) + " relieved. The role is now vacant.");
    }

    // ─── internals ───

    /**
     * The ICS org-chart block: one entry per standard command role, carrying the ACTIVE holder
     * (user + who appointed them + when) or vacant = true. Rendered by the board's
     * 'Incident Command (ICS)' panel.
     */
    private List<Map<String, Object>> commandRolesBlock(long activationId) {
        List<Map<String, Object>> active = jdbc.queryForList("""
                select r.id, r.role, r.user_id, u.name as user_name, r.appointed_at, r.note,
                       a.name as appointed_by_name
                from public.activation_command_roles r
                left join public.users u on u.id = r.user_id
                left join public.users a on a.id = r.appointed_by
                where r.activation_id = ? and r.relieved_at is null
                """, activationId);
        List<Map<String, Object>> roles = new ArrayList<>();
        for (String role : COMMAND_ROLES) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("role", role);
            row.put("role_title", roleTitle(role));
            Map<String, Object> holder = active.stream()
                    .filter(r -> role.equals(r.get("role"))).findFirst().orElse(null);
            row.put("vacant", holder == null);
            if (holder != null) {
                row.putAll(holder);
            }
            roles.add(row);
        }
        return roles;
    }

    private Map<String, Object> buildLogisticsBlock(Object incidentIdRaw) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (incidentIdRaw == null) {
            out.put("available", false);
            out.put("summary", Map.of("allocation_count", 0, "resource_count", 0));
            out.put("resources", List.of());
            out.put("status_summary", List.of());
            return out;
        }
        long incidentId = ((Number) incidentIdRaw).longValue();
        out.put("available", true);
        out.put("dispatch_console_url", "/m/response/dispatch?incident_id=" + incidentId);
        out.put("summary", jdbc.queryForMap("""
                select count(*) as allocation_count,
                       count(distinct resource_id) as resource_count,
                       count(*) filter (where status in ('Approved','Sourcing','Requested to Stakeholders','Awaiting Dispatch Approval')) as pending_dispatch,
                       count(*) filter (where status in ('Dispatch Approved','In Transit')) as in_transit,
                       count(*) filter (where status in ('Deployed','Delivered','Partially Fulfilled')) as delivered_or_deployed,
                       (select count(*) from public.dispatch_approvals da
                        join public.allocated_resources ar2 on ar2.id = da.allocated_resource_id
                        where ar2.incident_id = ? and da.status = 'Pending' and da.deleted_at is null) as pending_source_approvals
                from public.allocated_resources ar
                where ar.incident_id = ?
                """, incidentId, incidentId));
        out.put("status_summary", jdbc.queryForList("""
                select status, count(*) as count
                from public.allocated_resources
                where incident_id = ?
                group by status
                order by count(*) desc, status
                """, incidentId));
        List<Map<String, Object>> resources = jdbc.queryForList("""
                select ar.id, ar.resource_id, r.name as resource_name, r.category as resource_category,
                       ar.status, ar.quantity_requested, ar.quantity_allocated, ar.unit_of_measure,
                       ar.source, ar.source_details, ar.allocation_date, ar.created_at, ar.updated_at
                from public.allocated_resources ar
                join public.resources r on r.id = ar.resource_id
                where ar.incident_id = ?
                order by ar.updated_at desc nulls last, ar.created_at desc nulls last, ar.id desc
                limit 12
                """, incidentId);
        for (Map<String, Object> resource : resources) {
            List<Map<String, Object>> journal = journal(resource.get("source_details"));
            double requested = dbl(resource.get("quantity_requested"));
            double allocated = dbl(resource.get("quantity_allocated"));
            double need = allocated > 0 ? allocated : requested;
            double dispatched = journal.stream()
                    .mapToDouble(item -> dbl(firstNonNull(item.get("quantity_dispatched"), item.get("dispatched_quantity"))))
                    .sum();
            double delivered = journal.stream()
                    .mapToDouble(item -> dbl(firstNonNull(item.get("quantity_delivered"), item.get("delivered_quantity"))))
                    .sum();
            Map<String, Object> latest = journal.isEmpty() ? null : journal.get(journal.size() - 1);
            resource.put("dispatched_quantity", dispatched);
            resource.put("delivered_quantity", delivered);
            resource.put("pending_quantity", Math.max(0, need - Math.max(dispatched, delivered)));
            resource.put("journal_count", journal.size());
            resource.put("latest_source", latestSource(latest, resource.get("source")));
            resource.remove("source_details");
        }
        out.put("resources", resources);
        return out;
    }

    private Map<String, Object> buildSituationReportsBlock(Map<String, Object> activation) {
        Map<String, Object> out = new LinkedHashMap<>();
        Object incidentIdRaw = activation.get("incident_id");
        if (incidentIdRaw == null) {
            out.put("available", false);
            out.put("reports", List.of());
            out.put("summary", Map.of("reports_count", 0));
            return out;
        }
        long incidentId = ((Number) incidentIdRaw).longValue();
        out.put("available", true);
        out.put("incident_id", incidentId);
        out.put("incident_url", "/m/response/incidents/" + incidentId);
        out.put("summary", jdbc.queryForMap("""
                select count(*) as reports_count,
                       max(created_at) as latest_report_at,
                       coalesce(round(extract(epoch from (now() - max(created_at))) / 3600.0, 1), null) as hours_since_latest
                from public.incident_history_reports
                where incident_id = ?
                """, incidentId));
        out.put("cadence", currentOperationalCadence(activation));
        List<Map<String, Object>> reports = jdbc.queryForList("""
                select hr.id, hr.deaths_total, hr.injured_total, hr.missing_total, hr.displaced,
                       hr.people_with_disabilities, hr.pregnant_affected, hr.children_affected,
                       hr.government_property_loss, hr.private_property_loss,
                       hr.services_unavailable, hr.remarks, hr.created_at, u.name as reported_by_name
                from public.incident_history_reports hr
                left join public.users u on u.id = hr.user_id
                where hr.incident_id = ?
                order by hr.created_at desc
                limit 6
                """, incidentId);
        for (Map<String, Object> report : reports) {
            report.put("services_unavailable", parseJson(report.get("services_unavailable")));
        }
        out.put("reports", reports);
        return out;
    }

    private Map<String, Object> currentOperationalCadence(Map<String, Object> activation) {
        Map<String, Object> cadence = new LinkedHashMap<>();
        Object activatedAt = activation.get("activated_at");
        Object activationId = activation.get("id");
        // Prefer a real open period row when V181 is present.
        if (activationId != null && periodTableReady()) {
            List<Map<String, Object>> open = jdbc.queryForList("""
                    select id, period_number, label, objectives, started_at,
                           round(extract(epoch from (now() - started_at)) / 3600.0, 1) as hours_open
                    from public.activation_periods
                    where activation_id = ? and status = 'open'
                    order by period_number desc limit 1
                    """, ((Number) activationId).longValue());
            if (!open.isEmpty()) {
                Map<String, Object> p = open.get(0);
                cadence.put("label", p.get("label"));
                cadence.put("period_id", p.get("id"));
                cadence.put("period_number", p.get("period_number"));
                cadence.put("objectives", p.get("objectives"));
                cadence.put("hours_elapsed", p.get("hours_open"));
                cadence.put("window", "Open since " + p.get("started_at"));
                cadence.put("source", "activation_periods");
                cadence.put("next_report_hint",
                        "Keep situation reports current for this operational period; close the period with handover notes when shifting command.");
                return cadence;
            }
        }
        if (activatedAt == null) {
            cadence.put("label", "Operational period pending");
            cadence.put("hours_elapsed", 0);
            cadence.put("source", "derived");
            cadence.put("next_report_hint", "Open Period 1 from the Command Post or create the first situation report from the incident page.");
            return cadence;
        }
        double hours = jdbc.queryForObject(
                "select round(extract(epoch from (now() - ?::timestamptz)) / 3600.0, 1)",
                Double.class, activatedAt);
        int period = Math.max(1, ((int) Math.floor(hours / 24.0)) + 1);
        int capped = Math.min(period, 3);
        cadence.put("label", period <= 3 ? "Operational Period " + capped : "Post-72 Hour Sustained Operations");
        cadence.put("hours_elapsed", hours);
        cadence.put("window", period <= 3
                ? "H+" + ((capped - 1) * 24) + " to H+" + (capped * 24)
                : "H+72 and beyond");
        cadence.put("source", "derived");
        cadence.put("next_report_hint", "Open a formal operational period to capture IAP objectives and handover notes.");
        return cadence;
    }

    private Map<String, Object> buildOperationalPeriodsBlock(long activationId) {
        Map<String, Object> out = new LinkedHashMap<>();
        if (!periodTableReady()) {
            out.put("available", false);
            out.put("periods", List.of());
            out.put("message", "Run Flyway V181 to enable formal operational periods.");
            return out;
        }
        out.put("available", true);
        List<Map<String, Object>> periods = jdbc.queryForList("""
                select p.id, p.period_number, p.label, p.objectives, p.status,
                       p.started_at, p.ended_at, p.handover_notes,
                       u.name as created_by_name,
                       round(extract(epoch from (coalesce(p.ended_at, now()) - p.started_at)) / 3600.0, 1) as hours_duration
                from public.activation_periods p
                left join public.users u on u.id = p.created_by
                where p.activation_id = ?
                order by p.period_number
                """, activationId);
        // F31 residual: task activity rollups inside each period window (from activity log + task status).
        for (Map<String, Object> p : periods) {
            Object start = p.get("started_at");
            Object end = p.get("ended_at");
            Map<String, Object> rollup = jdbc.queryForMap("""
                    select
                      count(*) filter (where l.action = 'task_updated' and l.message ilike '%%Completed%%') as tasks_completed_events,
                      count(*) filter (where l.action = 'task_updated') as task_update_events,
                      count(distinct l.task_id) filter (where l.task_id is not null) as tasks_touched,
                      count(*) filter (where l.action in ('period_opened','period_closed','inject_fired','inject_resolved','posture_changed')) as command_events,
                      count(*) filter (where l.action = 'inject_fired') as injects_fired
                    from public.task_activity_log l
                    where l.activation_id = ?
                      and l.created_at >= ?::timestamptz
                      and l.created_at < coalesce(?::timestamptz, now() + interval '1 second')
                    """, activationId, start, end);
            // Tasks currently completed that were last updated inside the window
            Map<String, Object> taskSnap = jdbc.queryForMap("""
                    select
                      count(*) filter (where t.status = 'Completed'
                        and t.updated_at >= ?::timestamptz
                        and t.updated_at < coalesce(?::timestamptz, now() + interval '1 second')) as completed_in_window,
                      count(*) filter (where t.status = 'In Progress'
                        and t.updated_at >= ?::timestamptz
                        and t.updated_at < coalesce(?::timestamptz, now() + interval '1 second')) as in_progress_in_window,
                      count(*) filter (where t.is_72hr_critical
                        and t.status = 'Completed'
                        and t.updated_at >= ?::timestamptz
                        and t.updated_at < coalesce(?::timestamptz, now() + interval '1 second')) as critical_completed_in_window
                    from public.incident_tasks t
                    where t.activation_id = ?
                    """, start, end, start, end, start, end, activationId);
            Map<String, Object> tasks = new LinkedHashMap<>();
            tasks.putAll(rollup);
            tasks.putAll(taskSnap);
            p.put("task_rollup", tasks);
        }
        out.put("periods", periods);
        out.put("open_count", periods.stream().filter(p -> "open".equals(String.valueOf(p.get("status")))).count());
        out.put("closed_count", periods.stream().filter(p -> "closed".equals(String.valueOf(p.get("status")))).count());
        return out;
    }

    private boolean periodTableReady() {
        try {
            Boolean exists = jdbc.queryForObject(
                    "select exists(select 1 from information_schema.tables where table_schema='public' and table_name='activation_periods')",
                    Boolean.class);
            return Boolean.TRUE.equals(exists);
        } catch (Exception e) {
            return false;
        }
    }

    /** Soft-fail if migration not yet applied (board still works). */
    private void ensurePeriodTable() {
        if (!periodTableReady()) {
            throw new BusinessRuleException("Operational periods require migration V181 (activation_periods).");
        }
    }

    /** Full institutional title for an ICS role code (journal + UI wording). */
    private static String roleTitle(String role) {
        return switch (role) {
            case "IC" -> "Incident Commander";
            case "Deputy IC" -> "Deputy Incident Commander";
            case "Operations" -> "Operations Section Chief";
            case "Planning" -> "Planning Section Chief";
            case "Logistics" -> "Logistics Section Chief";
            case "Finance/Admin" -> "Finance/Admin Section Chief";
            case "PIO" -> "Public Information Officer";
            case "Safety" -> "Safety Officer";
            case "Liaison" -> "Liaison Officer";
            default -> role;
        };
    }

    private List<Map<String, Object>> activityQuery(long activationId, Long drfId, String action, int limit) {
        StringBuilder where = new StringBuilder("l.activation_id = ?");
        List<Object> params = new ArrayList<>(List.of(activationId));
        if (drfId != null) {
            where.append(" and t.drf_id = ?");
            params.add(drfId);
        }
        if (action != null && !action.isBlank()) {
            where.append(" and l.action = ?");
            params.add(action);
        }
        return jdbc.queryForList("""
                select l.*, u.name as user_name, t.title as task_title, f.number as drf_number
                from public.task_activity_log l
                left join public.users u on u.id = l.user_id
                left join public.incident_tasks t on t.id = l.task_id
                left join public.disaster_response_functions f on f.id = t.drf_id
                where %s order by l.created_at desc limit %d
                """.formatted(where, limit), params.toArray());
    }

    /**
     * Fetch an activation the caller is allowed to see. An incident-linked activation is visible only to
     * officers in that incident's area (or national); a forecast activation has no incident yet (NULL
     * region) and stays visible to all, exactly as the index LEFT JOINs it. This single scoped fetch is what
     * keeps every by-id read and lane mutation (board, drf, assign, task add/update/delete, posture,
     * deactivate, impact, readiness) from reaching another region's response. Out-of-area → 404.
     */
    private Map<String, Object> findOr404(long id) {
        StringBuilder where = new StringBuilder("ra.id = ?");
        List<Object> params = new ArrayList<>();
        params.add(id);
        jurisdiction.appendAreaScopeWithCouncil("i", where, params);
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select ra.* from public.response_activations ra "
                        + "left join public.incidents i on i.id = ra.incident_id where " + where,
                params.toArray());
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Activation not found.");
        }
        return rows.get(0);
    }

    /**
     * Forecast (anticipatory, multi-region) activations belong to the national command that opened them —
     * a single area officer must not stand one down, change its posture, or confirm impact for the whole
     * country. Incident-linked activations are already area-scoped by {@link #findOr404}, so this is a no-op
     * for them. Out-of-tier → 404 (indistinguishable from "not yours").
     */
    private void assertMayManageForecast(Map<String, Object> activation) {
        if (activation.get("incident_id") == null
                && jurisdiction.currentTier() != JurisdictionScope.Tier.NATIONAL) {
            throw new ResourceNotFoundException("Activation not found.");
        }
    }

    private Map<String, Object> linkedWarning(Map<String, Object> body) {
        Long warningId = optionalLong(body.get("warning_id"), "warning_id");
        String warningCode = str(body.get("warning_code"));
        if (warningId == null && warningCode == null) {
            return null;
        }
        StringBuilder where = new StringBuilder("w.deleted_at is null and lower(w.status) in ('approved','published')");
        List<Object> params = new ArrayList<>();
        if (warningId != null) {
            where.append(" and w.id = ?");
            params.add(warningId);
        } else {
            where.append(" and lower(w.warning_code) = lower(?)");
            params.add(warningCode);
        }
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select w.id as warning_id, w.warning_code, w.status,
                       string_agg(distinct h.name, ' / ') as hazard,
                       (array_agg(wh.warning_level order by case lower(coalesce(wh.warning_level,''))
                            when 'major warning' then 1 when 'warning' then 2 when 'advisory' then 3 else 4 end))[1] as warning_level,
                       min(wh.validity_start) as validity_start,
                       max(wh.validity_end) as validity_end,
                       string_agg(distinct coalesce(d.name, r.name), ', ') filter (where coalesce(d.name, r.name) is not null) as affected_areas
                from public.warnings w
                join public.warning_hazards wh on wh.warning_id = w.id and wh.deleted_at is null
                left join public.hazards h on h.id = wh.hazard_id
                left join public.regions r on r.id = wh.region_id
                left join public.districts d on d.id = wh.district_id
                where %s
                group by w.id, w.warning_code, w.status
                """.formatted(where), params.toArray());
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Issued warning not found.");
        }
        return rows.get(0);
    }

    private static List<String> requestAreas(Object raw) {
        if (raw instanceof List<?> list) {
            return list.stream().map(CommandCenterServiceImpl::str).filter(s -> s != null).toList();
        }
        return splitCsv(str(raw));
    }

    private static List<String> splitCsv(String raw) {
        List<String> out = new ArrayList<>();
        if (raw == null || raw.isBlank()) {
            return out;
        }
        for (String part : raw.split(",")) {
            String value = str(part);
            if (value != null) {
                out.add(value);
            }
        }
        return out;
    }

    private static Long optionalLong(Object v, String field) {
        String s = str(v);
        if (s == null) {
            return null;
        }
        try {
            return (long) Double.parseDouble(s);
        } catch (NumberFormatException e) {
            throw new BusinessRuleException("The " + field + " field is invalid.");
        }
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private static Object firstNonNull(Object... values) {
        for (Object value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static String requireIn(Object v, List<String> allowed, String field) {
        String s = require(v, field);
        if (!allowed.contains(s)) {
            throw new BusinessRuleException("The selected " + field + " is invalid.");
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

    private static double dbl(Object v) {
        if (v == null) {
            return 0d;
        }
        try {
            return Double.parseDouble(String.valueOf(v));
        } catch (NumberFormatException e) {
            return 0d;
        }
    }

    private static String latestSource(Map<String, Object> latest, Object fallback) {
        if (latest == null) {
            return str(fallback);
        }
        return firstNonBlank(
                str(latest.get("source_name")),
                str(latest.get("agency_name")),
                str(latest.get("warehouse_name")),
                str(latest.get("source_type")),
                str(latest.get("type")),
                str(fallback));
    }

    private static List<Map<String, Object>> journal(Object raw) {
        String value = str(raw);
        if (value == null || !value.startsWith("[")) {
            return List.of();
        }
        try {
            return JSON.readValue(value, JOURNAL);
        } catch (Exception e) {
            return List.of();
        }
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    /**
     * Replace the PG json columns (affected_areas, forecast_track) on an activation row with
     * parsed arrays so the frontend gets a clean contract instead of {@code {type,value}} PGobjects.
     */
    private static Map<String, Object> cleanActivationJson(Map<String, Object> activation) {
        if (activation == null) {
            return null;
        }
        activation.put("affected_areas", parseJson(activation.get("affected_areas")));
        activation.put("forecast_track", parseJson(activation.get("forecast_track")));
        return activation;
    }

    /** Parse a PG json column value (PGobject or string) into a List, or null. */
    private static Object parseJson(Object v) {
        if (v == null) {
            return null;
        }
        try {
            String json = v.getClass().getSimpleName().equals("PGobject")
                    ? String.valueOf(v.getClass().getMethod("getValue").invoke(v))
                    : String.valueOf(v);
            return json == null ? null : JSON.readValue(json, List.class);
        } catch (Exception e) {
            return null;
        }
    }

    /** Render a json area array ({@code ["Dar es Salaam","Pwani"]}) as "Dar es Salaam, Pwani". */
    private static String formatAreas(Object affectedAreas) {
        if (affectedAreas == null) {
            return null;
        }
        try {
            List<?> areas = JSON.readValue(String.valueOf(affectedAreas), List.class);
            return areas.stream().map(String::valueOf).collect(java.util.stream.Collectors.joining(", "));
        } catch (Exception e) {
            return String.valueOf(affectedAreas);
        }
    }
}
