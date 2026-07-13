package tz.go.pmo.dmis.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.response.ActivationService;
import tz.go.pmo.dmis.service.ExerciseScenariosService;

/**
 * Exercise scenarios for Command Post drills. Logic moved from the former response
 * package controller; Angular paths/JSON unchanged. Launch still uses
 * {@link ActivationService} (transitional Response coupling).
 */
@Service
public class ExerciseScenariosServiceImpl implements ExerciseScenariosService {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> COMMAND_ROLES = List.of(
            "IC", "Deputy IC", "Operations", "Planning", "Logistics", "Finance/Admin", "PIO", "Safety", "Liaison");

    private final JdbcTemplate jdbc;
    private final ActivationService activations;
    private final CurrentUserResolver users;

    public ExerciseScenariosServiceImpl(JdbcTemplate jdbc, ActivationService activations,
                                      CurrentUserResolver users) {
        this.jdbc = jdbc;
        this.activations = activations;
        this.users = users;
    }

    @Override
    public Map<String, Object> index() {
        List<Map<String, Object>> scenarios = jdbc.queryForList("""
                select s.*,
                       count(distinct si.id) as incident_count,
                       count(distinct se.id) as event_count,
                       count(distinct sp.id) as participant_count,
                       count(distinct er.id) as run_count,
                       max(er.launched_at) as last_launched_at
                from public.exercise_scenarios s
                left join public.scenario_incidents si on si.scenario_id = s.id
                left join public.scenario_events se on se.scenario_id = s.id
                left join public.scenario_participants sp on sp.scenario_id = s.id
                left join public.exercise_runs er on er.scenario_id = s.id
                group by s.id
                order by case s.status when 'active' then 0 when 'draft' then 1 else 2 end,
                         s.title
                """).stream().map(ExerciseScenariosServiceImpl::cleanScenarioJson).toList();
        return Map.of("scenarios", scenarios);
    }

    @Override
    public Map<String, Object> show(long id) {
        return scenarioPayload(id);
    }

    @Transactional
    @Override
    public Map<String, Object> create(Map<String, Object> body) throws Exception {
        String title = require(body.get("title"), "title");
        String hazard = require(body.get("hazard"), "hazard");
        List<Map<String, Object>> incidentRows = mapList(body.get("incidents"));
        List<Map<String, Object>> eventRows = mapList(body.get("events"));
        if (incidentRows.isEmpty()) {
            throw new BusinessRuleException("At least one scenario incident is required.");
        }
        if (eventRows.isEmpty()) {
            throw new BusinessRuleException("At least one MSEL event is required.");
        }

        String code = str(body.get("code"));
        if (code == null) {
            code = "EX-" + slug(title) + "-" + System.currentTimeMillis();
        } else {
            code = code.toUpperCase(Locale.ROOT);
        }
        double defaultCompression = optionalDouble(body.get("default_time_compression"), 1);
        if (defaultCompression <= 0) {
            throw new BusinessRuleException("default_time_compression must be greater than zero.");
        }

        Long scenarioId = jdbc.queryForObject("""
                insert into public.exercise_scenarios(code, title, hazard, description, regions, objectives,
                    default_time_compression, status, created_by, created_at, updated_at)
                values (?,?,?,?,?::json,?::json,?,?,?,now(),now()) returning id
                """, Long.class, code, title, hazard, str(body.get("description")),
                jsonArray(body.get("regions")), jsonArray(body.get("objectives")), defaultCompression,
                firstNonBlank(str(body.get("status")), "active"), users.actingUserId());

        Map<Integer, Long> incidentIdsBySort = new LinkedHashMap<>();
        int sort = 1;
        for (Map<String, Object> row : incidentRows) {
            int rowSort = optionalInt(row.get("sort_order"), sort);
            Long regionId = optionalLong(row.get("region_id"), "region_id");
            Long districtId = optionalLong(row.get("district_id"), "district_id");
            String regionName = str(row.get("region_name"));
            String districtName = str(row.get("district_name"));
            if (regionId == null && regionName != null) {
                regionId = lookupId("public.regions", regionName);
            }
            if (districtId == null && districtName != null) {
                districtId = lookupId("public.districts", districtName);
            }
            Long templateId = jdbc.queryForObject("""
                    insert into public.scenario_incidents(scenario_id, sort_order, title, description,
                        incident_type_id, severity_level, region_id, district_id, region_name, district_name,
                        location_description, latitude, longitude, created_at, updated_at)
                    values (?,?,?,?,?,?,?,?,?,?,?,?,?,now(),now()) returning id
                    """, Long.class, scenarioId, rowSort, require(row.get("title"), "incident title"),
                    str(row.get("description")), optionalLong(row.get("incident_type_id"), "incident_type_id"),
                    firstNonBlank(str(row.get("severity_level")), "Major"), regionId, districtId,
                    regionName, districtName, str(row.get("location_description")),
                    optionalDoubleOrNull(row.get("latitude")), optionalDoubleOrNull(row.get("longitude")));
            incidentIdsBySort.put(rowSort, templateId);
            sort++;
        }

        sort = 1;
        for (Map<String, Object> row : eventRows) {
            int rowSort = optionalInt(row.get("sort_order"), sort);
            Long incidentTemplateId = null;
            Integer incidentSort = optionalIntOrNull(firstNonNull(row.get("incident_sort_order"), row.get("incident_index")));
            if (incidentSort != null) {
                if (row.containsKey("incident_index") && !row.containsKey("incident_sort_order")) {
                    incidentSort++;
                }
                incidentTemplateId = incidentIdsBySort.get(incidentSort);
                if (incidentTemplateId == null) {
                    throw new BusinessRuleException("Unknown incident template reference for MSEL event " + rowSort + ".");
                }
            }
            Long drfId = optionalLong(row.get("target_drf_id"), "target_drf_id");
            if (drfId == null && row.get("target_drf_number") != null) {
                drfId = lookupDrfByNumber(row.get("target_drf_number"));
            }
            jdbc.update("""
                    insert into public.scenario_events(scenario_id, incident_template_id, sort_order,
                        offset_minutes, title, detail, inject_type, target_drf_id, expected_action,
                        created_at, updated_at)
                    values (?,?,?,?,?,?,?,?,?,now(),now())
                    """, scenarioId, incidentTemplateId, rowSort,
                    optionalInt(row.get("offset_minutes"), 0),
                    require(row.get("title"), "event title"), str(row.get("detail")),
                    requireIn(firstNonBlank(str(row.get("inject_type")), "event"),
                            List.of("event", "decision", "message"), "inject_type"),
                    drfId, str(row.get("expected_action")));
            sort++;
        }

        for (Map<String, Object> row : mapList(body.get("participants"))) {
            Long drfId = optionalLong(row.get("drf_id"), "drf_id");
            if (drfId == null && row.get("drf_number") != null) {
                drfId = lookupDrfByNumber(row.get("drf_number"));
            }
            String commandRole = str(row.get("command_role"));
            if (commandRole != null) {
                requireIn(commandRole, COMMAND_ROLES, "command_role");
            }
            jdbc.update("""
                    insert into public.scenario_participants(scenario_id, user_id, command_role, drf_id, notes)
                    values (?,?,?,?,?)
                    """, scenarioId, lng(row.get("user_id"), "user_id"), commandRole, drfId, str(row.get("notes")));
        }

        Map<String, Object> out = scenarioPayload(scenarioId);
        out.put("success", true);
        return out;
    }

    @Transactional
    @Override
    public Map<String, Object> launch(long id,
                                      Map<String, Object> body) {
        Map<String, Object> scenario = scenarioRow(id);
        List<Map<String, Object>> incidentTemplates = jdbc.queryForList("""
                select * from public.scenario_incidents
                where scenario_id = ? order by sort_order, id
                """, id);
        if (incidentTemplates.isEmpty()) {
            throw new BusinessRuleException("This scenario has no incident templates to launch.");
        }
        double factor = optionalDouble(body == null ? null : body.get("time_compression_factor"),
                ((Number) scenario.get("default_time_compression")).doubleValue());
        if (factor <= 0) {
            throw new BusinessRuleException("time_compression_factor must be greater than zero.");
        }
        boolean allowRealOps = body != null && Boolean.parseBoolean(String.valueOf(body.get("allow_real_ops")));
        Long actor = users.actingUserId();
        String runCode = scenario.get("code") + "-" + System.currentTimeMillis();
        Long runId = jdbc.queryForObject("""
                insert into public.exercise_runs(scenario_id, run_code, launched_by, launched_at,
                    time_compression_factor, allow_real_ops, notes)
                values (?,?,?,now(),?,?,?) returning id
                """, Long.class, id, runCode, actor, factor, allowRealOps, body == null ? null : str(body.get("notes")));

        List<Map<String, Object>> events = jdbc.queryForList("""
                select se.*, drf.number as target_drf_number, drf.name as target_drf_name
                from public.scenario_events se
                left join public.disaster_response_functions drf on drf.id = se.target_drf_id
                where se.scenario_id = ? order by se.sort_order, se.id
                """, id);
        List<Map<String, Object>> participants = jdbc.queryForList("""
                select sp.*, u.name as user_name, drf.number as drf_number, drf.name as drf_name
                from public.scenario_participants sp
                join public.users u on u.id = sp.user_id
                left join public.disaster_response_functions drf on drf.id = sp.drf_id
                where sp.scenario_id = ? order by sp.id
                """, id);

        List<Map<String, Object>> launched = new ArrayList<>();
        int injectsCreated = 0;
        int participantCopies = 0;
        Instant launchInstant = Instant.now();
        for (Map<String, Object> template : incidentTemplates) {
            long templateId = ((Number) template.get("id")).longValue();
            Long incidentId = createDrillIncident(template, runId, templateId, actor);
            Map<String, Object> activation = activations.activateScenarioDrill(incidentId, runId, id, templateId,
                    allowRealOps, "Scenario launch: " + scenario.get("title"));
            long activationId = ((Number) activation.get("activation_id")).longValue();
            participantCopies += copyParticipants(runId, activationId, participants);
            int copied = copyEvents(activationId, events, templateId, factor, launchInstant, actor);
            injectsCreated += copied;
            activations.log(activationId, actor, "exercise_launched",
                    "Scenario \"" + scenario.get("title") + "\" launched as run " + runCode
                            + " with " + copied + " compressed-time MSEL inject(s).", null);
            launched.add(activation);
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("scenario_id", id);
        out.put("run_id", runId);
        out.put("run_code", runCode);
        out.put("time_compression_factor", factor);
        out.put("allow_real_ops", allowRealOps);
        out.put("activations", launched);
        out.put("incidents_created", launched.size());
        out.put("injects_created", injectsCreated);
        out.put("participants_enrolled", participantCopies);
        return out;
    }

    private Long createDrillIncident(Map<String, Object> template, long runId, long templateId, Long actor) {
        return jdbc.queryForObject("""
                insert into public.incidents(title, description, incident_type_id, severity_level, status,
                    workflow_status, origin_level, region_id, district_id, region_name, district_name,
                    location_description, latitude, longitude, reported_at, is_simulation,
                    submitted_by_user_id, submitted_at, exercise_run_id, scenario_incident_id,
                    created_at, updated_at)
                values ('[SIMULATION] ' || ?, ?, ?, ?, 'Active Response', 'approved', 'national',
                    ?, ?, ?, ?, ?, ?, ?, now(), true, ?, now(), ?, ?, now(), now())
                returning id
                """, Long.class, template.get("title"), template.get("description"),
                template.get("incident_type_id"), template.get("severity_level"),
                template.get("region_id"), template.get("district_id"), template.get("region_name"),
                template.get("district_name"), template.get("location_description"), template.get("latitude"),
                template.get("longitude"), actor, runId, templateId);
    }

    private int copyEvents(long activationId, List<Map<String, Object>> events, long templateId,
                           double factor, Instant launchInstant, Long actor) {
        int count = 0;
        for (Map<String, Object> event : events) {
            Object boundTemplate = event.get("incident_template_id");
            if (boundTemplate != null && ((Number) boundTemplate).longValue() != templateId) {
                continue;
            }
            long offset = ((Number) event.get("offset_minutes")).longValue();
            long compressedSeconds = Math.max(0, Math.round((offset * 60.0) / factor));
            Timestamp dueAt = Timestamp.from(launchInstant.plusSeconds(compressedSeconds));
            jdbc.update("""
                    insert into public.activation_injects(activation_id, title, detail, inject_type, due_at,
                        created_by, scenario_event_id, target_drf_id, expected_action)
                    values (?,?,?,?,?,?,?,?,?)
                    """, activationId, event.get("title"), event.get("detail"), event.get("inject_type"),
                    dueAt, actor, event.get("id"), event.get("target_drf_id"), event.get("expected_action"));
            count++;
        }
        return count;
    }

    private int copyParticipants(long runId, long activationId, List<Map<String, Object>> participants) {
        int count = 0;
        Set<String> appointedRoles = new HashSet<>();
        for (Map<String, Object> participant : participants) {
            String commandRole = str(participant.get("command_role"));
            jdbc.update("""
                    insert into public.exercise_participants(run_id, activation_id, user_id, command_role,
                        drf_id, status, notes)
                    values (?,?,?,?,?,'active',?)
                    """, runId, activationId, participant.get("user_id"), commandRole,
                    participant.get("drf_id"), participant.get("notes"));
            count++;
            if (commandRole != null && appointedRoles.add(commandRole)) {
                Long roleId = jdbc.queryForObject("""
                        insert into public.activation_command_roles(activation_id, role, user_id,
                            appointed_at, appointed_by, note)
                        values (?,?,?,now(),?,?) returning id
                        """, Long.class, activationId, commandRole, participant.get("user_id"),
                        users.actingUserId(), firstNonBlank(str(participant.get("notes")), "Scenario roster"));
                activations.log(activationId, users.actingUserId(), "command_role_appointed",
                        roleTitle(commandRole) + ": " + participant.get("user_name")
                                + " appointed from scenario roster.", null);
                if (roleId == null) {
                    throw new BusinessRuleException("Could not appoint scenario participant.");
                }
            }
        }
        return count;
    }

    private Map<String, Object> scenarioPayload(long id) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("scenario", cleanScenarioJson(scenarioRow(id)));
        out.put("incidents", jdbc.queryForList("""
                select si.*, it.name as incident_type_name
                from public.scenario_incidents si
                left join public.incident_types it on it.id = si.incident_type_id
                where si.scenario_id = ? order by si.sort_order, si.id
                """, id));
        out.put("events", jdbc.queryForList("""
                select se.*, si.sort_order as incident_sort_order, si.title as incident_title,
                       drf.number as target_drf_number, drf.name as target_drf_name
                from public.scenario_events se
                left join public.scenario_incidents si on si.id = se.incident_template_id
                left join public.disaster_response_functions drf on drf.id = se.target_drf_id
                where se.scenario_id = ? order by se.sort_order, se.id
                """, id));
        out.put("participants", jdbc.queryForList("""
                select sp.*, u.name as user_name, u.email, drf.number as drf_number, drf.name as drf_name
                from public.scenario_participants sp
                join public.users u on u.id = sp.user_id
                left join public.disaster_response_functions drf on drf.id = sp.drf_id
                where sp.scenario_id = ? order by sp.id
                """, id));
        out.put("runs", jdbc.queryForList("""
                select er.*,
                       count(distinct ra.id) as activation_count,
                       count(distinct i.id) as incident_count
                from public.exercise_runs er
                left join public.response_activations ra on ra.exercise_run_id = er.id
                left join public.incidents i on i.exercise_run_id = er.id
                where er.scenario_id = ?
                group by er.id
                order by er.launched_at desc limit 20
                """, id));
        return out;
    }

    private Map<String, Object> scenarioRow(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select * from public.exercise_scenarios where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Exercise scenario not found.");
        }
        return rows.get(0);
    }

    private static Map<String, Object> cleanScenarioJson(Map<String, Object> scenario) {
        scenario.put("regions", parseJson(scenario.get("regions")));
        scenario.put("objectives", parseJson(scenario.get("objectives")));
        return scenario;
    }

    private static Object parseJson(Object v) {
        if (v == null) {
            return null;
        }
        try {
            String json = v.getClass().getSimpleName().equals("PGobject")
                    ? String.valueOf(v.getClass().getMethod("getValue").invoke(v))
                    : String.valueOf(v);
            return JSON.readValue(json, List.class);
        } catch (Exception e) {
            return null;
        }
    }

    private String jsonArray(Object raw) throws Exception {
        if (raw == null) {
            return "[]";
        }
        if (raw instanceof List<?> list) {
            return JSON.writeValueAsString(list);
        }
        String s = str(raw);
        if (s == null) {
            return "[]";
        }
        if (s.startsWith("[")) {
            JSON.readValue(s, List.class);
            return s;
        }
        return JSON.writeValueAsString(splitCsv(s));
    }

    private static List<Map<String, Object>> mapList(Object raw) {
        List<Map<String, Object>> out = new ArrayList<>();
        if (raw instanceof List<?> list) {
            for (Object item : list) {
                if (item instanceof Map<?, ?> map) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    map.forEach((k, v) -> row.put(String.valueOf(k), v));
                    out.add(row);
                }
            }
        }
        return out;
    }

    private Long lookupId(String table, String name) {
        List<Long> ids = jdbc.queryForList(
                "select id from " + tz.go.pmo.dmis.common.sql.SafeIdentifiers.publicQualified(table) + " where lower(name) = lower(?) limit 1",
                Long.class, name);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Long lookupDrfByNumber(Object raw) {
        int number = optionalInt(raw, 0);
        List<Long> ids = jdbc.queryForList(
                "select id from public.disaster_response_functions where number = ?",
                Long.class, number);
        if (ids.isEmpty()) {
            throw new BusinessRuleException("Unknown DRF number: " + number + ".");
        }
        return ids.get(0);
    }

    private static String requireIn(String value, List<String> allowed, String field) {
        String s = require(value, field);
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

    private static long lng(Object v, String field) {
        Long n = optionalLong(v, field);
        if (n == null) {
            throw new BusinessRuleException("The " + field + " field is required.");
        }
        return n;
    }

    private static int optionalInt(Object v, int fallback) {
        String s = str(v);
        if (s == null) {
            return fallback;
        }
        try {
            return (int) Double.parseDouble(s);
        } catch (NumberFormatException e) {
            throw new BusinessRuleException("The numeric field is invalid.");
        }
    }

    private static Integer optionalIntOrNull(Object v) {
        String s = str(v);
        if (s == null) {
            return null;
        }
        try {
            return (int) Double.parseDouble(s);
        } catch (NumberFormatException e) {
            throw new BusinessRuleException("The numeric field is invalid.");
        }
    }

    private static Double optionalDoubleOrNull(Object v) {
        String s = str(v);
        if (s == null) {
            return null;
        }
        try {
            return Double.parseDouble(s);
        } catch (NumberFormatException e) {
            throw new BusinessRuleException("The numeric field is invalid.");
        }
    }

    private static double optionalDouble(Object v, double fallback) {
        Double n = optionalDoubleOrNull(v);
        return n == null ? fallback : n;
    }

    private static Object firstNonNull(Object... values) {
        for (Object value : values) {
            if (value != null) {
                return value;
            }
        }
        return null;
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
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

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static String slug(String title) {
        String slug = title.toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "-")
                .replaceAll("^-|-$", "");
        if (slug.length() > 48) {
            slug = slug.substring(0, 48).replaceAll("-$", "");
        }
        return slug.isBlank() ? "SCENARIO" : slug;
    }

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
}
