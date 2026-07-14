package tz.go.pmo.dmis.service.impl;

import tz.go.pmo.dmis.service.MonitoringEvaluationEntryService;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.common.security.SecurityUtils;

/**
 * Configurable Monitoring & Evaluation registry/value workbench. The dashboard reads live operational tables;
 * this service captures the extra period indicators that PMO-DMD, regions, LGAs, MDAs and partners must report.
 */
@Service
@RequiredArgsConstructor
public class MonitoringEvaluationEntryServiceImpl implements MonitoringEvaluationEntryService {

    private static final List<String> LEVELS = List.of(
            "national", "region", "district", "council", "agency", "stakeholder", "incident", "warning");

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;
    private final CurrentUserResolver currentUser;

    @Transactional(readOnly = true)
    @Override
    public Map<String, Object> workbench(String requestedLevel, String period, String domain, String search) {
        return workbench(requestedLevel, period, domain, search, null);
    }

    @Transactional(readOnly = true)
    @Override
    public Map<String, Object> workbench(String requestedLevel, String period, String domain, String search,
                                         String institutionClass) {
        String level = contextLevel(cleanLevel(requestedLevel, defaultLevel()));
        String p = cleanPeriod(period);
        String cls = cleanInstitutionClass(institutionClass);
        List<Map<String, Object>> indicators = indicators(level, domain, search, true);
        // When PMO filters by institution class, only show indicators applicable to that class
        // (plus unrestricted indicators) so the matrix matches the selected institutional slice.
        if (cls != null && ("agency".equals(level) || "stakeholder".equals(level))) {
            indicators = filterIndicatorsForClass(indicators, cls);
        }
        List<Map<String, Object>> targets = targets(level, search, cls);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", OffsetDateTime.now().toString());
        out.put("period", p);
        out.put("level", level);
        out.put("institutionClass", cls);
        out.put("scope", scopeMap());
        // Only expose levels the caller may use — agency focals do not browse national agency lists.
        out.put("levels", allowedLevels());
        out.put("levelLabels", levelLabels());
        out.put("domains", domains());
        out.put("institutionClasses", institutionClassOptions(level));
        out.put("indicators", indicators);
        out.put("targets", targets);
        out.put("values", values(level, p, indicators));
        out.put("canManage", isPmoMeNational());
        out.put("canEnter", canEnter());
        out.put("nationalRegistry", isPmoMeNational());
        out.put("importanceNote",
                "M&E covers national readiness, resource distribution, ministries, government institutions, "
                        + "LGAs, UN agencies, NGOs, private sector, academia, media and faith-based partners — "
                        + "not only regions and districts.");
        return out;
    }

    @Transactional(readOnly = true)
    @Override
    public List<Map<String, Object>> indicators(String requestedLevel, String domain, String search, boolean activeOnly) {
        String level = contextLevel(cleanLevel(requestedLevel, null));
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" where 1=1");
        if (activeOnly) {
            where.append(" and active");
        }
        if (level != null) {
            where.append(" and level = ?");
            args.add(level);
        }
        if (domain != null && !domain.isBlank()) {
            where.append(" and domain = ?");
            args.add(domain.trim());
        }
        if (search != null && !search.isBlank()) {
            where.append(" and (code ilike ? or name ilike ? or coalesce(description,'') ilike ?)");
            String q = "%" + search.trim() + "%";
            args.add(q);
            args.add(q);
            args.add(q);
        }
        appendIndicatorContext(where, args);
        return rows("""
                select id, code, name, description, domain, disaster_cycle as "disasterCycle", level,
                       value_type as "valueType", unit, frequency, owner_type as "ownerType",
                       owner_agency_id as "ownerAgencyId", stakeholder_type as "stakeholderType",
                       sector, source_module as "sourceModule", target_value as "targetValue",
                       direction, sort_order as "sortOrder", active,
                       applicable_sectors as "applicableSectors",
                       applicable_institution_classes as "applicableInstitutionClasses",
                       policy_role_code as "policyRoleCode", policy_role_source as "policyRoleSource",
                       role_summary as "roleSummary"
                from public.me_indicator_catalog
                """ + where + "\n order by sort_order, domain, name", args.toArray());
    }

    @Transactional(readOnly = true)
    @Override
    public List<Map<String, Object>> targets(String requestedLevel, String search) {
        return targets(requestedLevel, search, null);
    }

    @Transactional(readOnly = true)
    @Override
    public List<Map<String, Object>> targets(String requestedLevel, String search, String institutionClass) {
        String level = contextLevel(cleanLevel(requestedLevel, defaultLevel()));
        String cls = cleanInstitutionClass(institutionClass);
        return switch (level) {
            case "national" -> List.of(target("national:1", "United Republic of Tanzania (National)", "national",
                    null, null, null, null, null, null, null));
            case "region" -> regionTargets(search);
            case "district" -> districtTargets(search);
            case "council" -> councilTargets(search);
            case "agency" -> agencyTargets(search, cls);
            case "stakeholder" -> stakeholderTargets(search, cls);
            case "incident" -> incidentTargets(search);
            case "warning" -> warningTargets(search);
            default -> List.of();
        };
    }

    @Transactional
    @Override
    public Map<String, Object> createIndicator(Map<String, Object> req) {
        Long uid = currentUser.actingUserId();
        String code = req(req, "code").toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9_]+", "_");
        String level = cleanLevel(req(req, "level"), null);
        if (level == null) {
            throw bad("Unknown indicator level.");
        }
        String valueType = oneOf(str(req.get("valueType")), List.of("number", "count", "currency", "percent", "boolean", "text"),
                "number");
        String direction = oneOf(str(req.get("direction")), List.of("higher", "lower", "neutral"), "higher");
        Long id = jdbc.queryForObject("""
                insert into public.me_indicator_catalog(code, name, description, domain, disaster_cycle, level,
                    value_type, unit, frequency, owner_type, owner_agency_id, stakeholder_type, sector,
                    source_module, target_value, direction, sort_order, active, created_by, updated_by,
                    created_at, updated_at)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?, now(), now())
                returning id
                """, Long.class,
                code, req(req, "name"), str(req.get("description")), req(req, "domain"),
                cycleOrNull(req.get("disasterCycle")), level, valueType, str(req.get("unit")),
                coalesce(str(req.get("frequency")), "quarterly"), coalesce(str(req.get("ownerType")), "pmo-dmd"),
                longOrNull(req.get("ownerAgencyId")), str(req.get("stakeholderType")), str(req.get("sector")),
                str(req.get("sourceModule")), numOrNull(req.get("targetValue")), direction,
                intOrDefault(req.get("sortOrder"), 1000), boolOrDefault(req.get("active"), true), uid, uid);
        return one("select * from public.me_indicator_catalog where id = ?", id);
    }

    @Transactional
    @Override
    public Map<String, Object> updateIndicator(long id, Map<String, Object> req) {
        String level = cleanLevel(str(req.get("level")), null);
        String valueType = oneOf(str(req.get("valueType")), List.of("number", "count", "currency", "percent", "boolean", "text"),
                null);
        String direction = oneOf(str(req.get("direction")), List.of("higher", "lower", "neutral"), null);
        int n = jdbc.update("""
                update public.me_indicator_catalog
                   set name = coalesce(?, name),
                       description = ?,
                       domain = coalesce(?, domain),
                       disaster_cycle = ?,
                       level = coalesce(?, level),
                       value_type = coalesce(?, value_type),
                       unit = ?,
                       frequency = coalesce(?, frequency),
                       owner_type = coalesce(?, owner_type),
                       owner_agency_id = ?,
                       stakeholder_type = ?,
                       sector = ?,
                       source_module = ?,
                       target_value = ?,
                       direction = coalesce(?, direction),
                       sort_order = coalesce(?, sort_order),
                       active = coalesce(?, active),
                       updated_by = ?,
                       updated_at = now()
                 where id = ?
                """, str(req.get("name")), str(req.get("description")), str(req.get("domain")),
                cycleOrNull(req.get("disasterCycle")), level, valueType, str(req.get("unit")),
                str(req.get("frequency")), str(req.get("ownerType")), longOrNull(req.get("ownerAgencyId")),
                str(req.get("stakeholderType")), str(req.get("sector")), str(req.get("sourceModule")),
                numOrNull(req.get("targetValue")), direction, intOrNull(req.get("sortOrder")),
                boolOrNull(req.get("active")), currentUser.actingUserId(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "M&E indicator not found");
        }
        return one("select * from public.me_indicator_catalog where id = ?", id);
    }

    @Transactional
    @Override
    public Map<String, Object> saveValue(Map<String, Object> req) {
        if (!canEnter()) {
            throw new AccessDeniedException("You do not have permission to enter M&E values.");
        }
        Map<String, Object> indicator = indicator(req);
        String level = cleanLevel(coalesce(str(req.get("areaLevel")), str(indicator.get("level"))), null);
        if (level == null) {
            throw bad("areaLevel is required.");
        }
        // Institution / area / partner logins: when keys are omitted, stamp from the authenticated
        // identity so a district officer or MDA focal cannot (and need not) invent another target.
        // PMO manage may still send explicit targets; assertTargetAllowed enforces the scope wall.
        Long regionId = longOrNull(req.get("regionId"));
        Long districtId = longOrNull(req.get("districtId"));
        Long councilId = longOrNull(req.get("councilId"));
        Long agencyId = longOrNull(req.get("agencyId"));
        Long stakeholderId = longOrNull(req.get("stakeholderId"));
        Long incidentId = longOrNull(req.get("incidentId"));
        Long warningId = longOrNull(req.get("warningId"));
        Map<String, Object> bound = bindIdentityTarget(level, regionId, districtId, councilId, agencyId, stakeholderId);
        regionId = (Long) bound.get("regionId");
        districtId = (Long) bound.get("districtId");
        councilId = (Long) bound.get("councilId");
        agencyId = (Long) bound.get("agencyId");
        stakeholderId = (Long) bound.get("stakeholderId");
        assertTargetAllowed(level, regionId, districtId, councilId, agencyId, stakeholderId);
        assertIndicatorAllowed(indicator, agencyId, stakeholderId);

        String period = cleanPeriod(str(req.get("period")));
        String valueType = String.valueOf(indicator.get("valueType"));
        Double numeric = numericValue(req, valueType);
        String text = "text".equals(valueType) ? coalesce(str(req.get("textValue")), str(req.get("value"))) : str(req.get("textValue"));
        String requestedStatus = oneOf(str(req.get("status")), List.of("draft", "submitted", "approved", "rejected"),
                "submitted");
        String status = "approved".equals(requestedStatus) && !SecurityUtils.hasAuthority("monitoring_evaluation.manage")
                ? "submitted" : requestedStatus;
        Long uid = currentUser.actingUserId();

        Long existing = existingValueId(((Number) indicator.get("id")).longValue(), period, level, regionId, districtId,
                councilId, agencyId, stakeholderId, incidentId, warningId);
        if (existing == null) {
            existing = jdbc.queryForObject("""
                    insert into public.me_indicator_values(indicator_id, period_label, period_start, period_end,
                        area_level, region_id, district_id, council_id, agency_id, stakeholder_id, incident_id, warning_id,
                        numeric_value, text_value, status, notes, data_source, submitted_by, submitted_at,
                        approved_by, approved_at, created_at, updated_at)
                    values (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,
                        case when ? = 'approved' then ? else null end,
                        case when ? = 'approved' then now() else null end,
                        now(), now())
                    returning id
                    """, Long.class,
                    indicator.get("id"), period, dateOrNull(req.get("periodStart")), dateOrNull(req.get("periodEnd")),
                    level, regionId, districtId, councilId, agencyId, stakeholderId, incidentId, warningId,
                    numeric, text, status, str(req.get("notes")), str(req.get("dataSource")),
                    uid, "draft".equals(status) ? null : OffsetDateTime.now(), status, uid, status);
        } else {
            jdbc.update("""
                    update public.me_indicator_values
                       set numeric_value = ?,
                           text_value = ?,
                           status = ?,
                           notes = ?,
                           data_source = ?,
                           submitted_by = case when ? <> 'draft' then ? else submitted_by end,
                           submitted_at = case when ? <> 'draft' then coalesce(submitted_at, now()) else submitted_at end,
                           approved_by = case when ? = 'approved' then ? else approved_by end,
                           approved_at = case when ? = 'approved' then coalesce(approved_at, now()) else approved_at end,
                           updated_at = now()
                     where id = ?
                    """, numeric, text, status, str(req.get("notes")), str(req.get("dataSource")),
                    status, uid, status, status, uid, status, existing);
        }
        return value(existing);
    }

    @Transactional
    @SuppressWarnings("unchecked")
    @Override
    public Map<String, Object> saveBatch(Map<String, Object> req) {
        List<?> rows = req.get("values") instanceof List<?> list ? list : List.of();
        int saved = 0;
        List<Map<String, Object>> errors = new ArrayList<>();
        for (int i = 0; i < rows.size(); i++) {
            Object row = rows.get(i);
            if (!(row instanceof Map<?, ?> rawMap)) {
                errors.add(Map.of("row", i + 1, "error", "Invalid row"));
                continue;
            }
            Map<String, Object> value = new LinkedHashMap<>((Map<String, Object>) rawMap);
            if (!value.containsKey("period")) {
                value.put("period", req.get("period"));
            }
            if (!value.containsKey("status")) {
                value.put("status", req.get("status"));
            }
            try {
                saveValue(value);
                saved++;
            } catch (Exception e) {
                Map<String, Object> err = new LinkedHashMap<>();
                err.put("row", i + 1);
                err.put("indicator", coalesce(str(value.get("indicatorCode")), str(value.get("indicatorId"))));
                err.put("target", str(value.get("targetKey")));
                err.put("error", e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage());
                errors.add(err);
            }
        }
        return Map.of("saved", saved, "failed", errors.size(), "errors", errors);
    }

    // ── Organization ↔ indicator assignment ─────────────────────────────────

    @Transactional(readOnly = true)
    @Override
    public Map<String, Object> organizationIndicators(Long agencyId, Long stakeholderId) {
        if ((agencyId == null) == (stakeholderId == null)) {
            throw bad("Provide exactly one of agencyId or stakeholderId.");
        }
        assertOrgVisible(agencyId, stakeholderId);
        List<Map<String, Object>> assigned;
        if (agencyId != null) {
            assigned = rows("""
                    select o.id as "assignmentId", o.indicator_id as "indicatorId", o.auto_capture as "autoCapture",
                           o.active, o.notes, o.created_at as "assignedAt",
                           i.code, i.name, i.domain, i.level, i.unit, i.source_module as "sourceModule",
                           i.value_type as "valueType", i.target_value as "targetValue"
                    from public.me_organization_indicators o
                    join public.me_indicator_catalog i on i.id = o.indicator_id
                    where o.active = true and o.agency_id = ?
                    order by i.sort_order, i.code
                    """, agencyId);
        } else {
            assigned = rows("""
                    select o.id as "assignmentId", o.indicator_id as "indicatorId", o.auto_capture as "autoCapture",
                           o.active, o.notes, o.created_at as "assignedAt",
                           i.code, i.name, i.domain, i.level, i.unit, i.source_module as "sourceModule",
                           i.value_type as "valueType", i.target_value as "targetValue"
                    from public.me_organization_indicators o
                    join public.me_indicator_catalog i on i.id = o.indicator_id
                    where o.active = true and o.stakeholder_id = ?
                    order by i.sort_order, i.code
                    """, stakeholderId);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("agencyId", agencyId);
        out.put("stakeholderId", stakeholderId);
        out.put("assigned", assigned);
        out.put("canManage", SecurityUtils.hasAuthority("monitoring_evaluation.manage"));
        if (agencyId != null) {
            out.put("organization", oneOptional(
                    "select id, name, acronym, institution_class as \"institutionClass\" from public.agencies where id = ?",
                    agencyId));
        } else {
            out.put("organization", oneOptional(
                    "select id, name, type, organization from public.stakeholders where id = ?",
                    stakeholderId));
        }
        return out;
    }

    /**
     * Assign a catalogue indicator to an organization. Optionally seeds a draft value for the
     * current period from an automated source_module link (in-platform tables only).
     */
    @Transactional
    @Override
    public Map<String, Object> assignIndicatorToOrganization(Map<String, Object> req) {
        if (!SecurityUtils.hasAuthority("monitoring_evaluation.manage")
                && !SecurityUtils.hasAuthority("monitoring_evaluation.enter")) {
            throw new AccessDeniedException("Cannot assign M&E indicators.");
        }
        Long agencyId = longOrNull(req.get("agencyId"));
        Long stakeholderId = longOrNull(req.get("stakeholderId"));
        if ((agencyId == null) == (stakeholderId == null)) {
            throw bad("Provide exactly one of agencyId or stakeholderId.");
        }
        assertOrgVisible(agencyId, stakeholderId);
        Map<String, Object> indicator = indicator(req);
        long indicatorId = ((Number) indicator.get("id")).longValue();
        boolean autoCapture = boolOrDefault(req.get("autoCapture"), true);
        Long uid = currentUser.actingUserId();

        // Reactivate soft-removed assignment if present
        Long existing = agencyId != null
                ? jdbc.query("select id from public.me_organization_indicators where agency_id = ? and indicator_id = ?",
                rs -> rs.next() ? rs.getLong(1) : null, agencyId, indicatorId)
                : jdbc.query("select id from public.me_organization_indicators where stakeholder_id = ? and indicator_id = ?",
                rs -> rs.next() ? rs.getLong(1) : null, stakeholderId, indicatorId);
        Long assignmentId;
        if (existing != null) {
            jdbc.update("""
                    update public.me_organization_indicators
                       set active = true, auto_capture = ?, notes = ?, assigned_by = ?, updated_at = now()
                     where id = ?
                    """, autoCapture, str(req.get("notes")), uid, existing);
            assignmentId = existing;
        } else {
            assignmentId = jdbc.queryForObject("""
                    insert into public.me_organization_indicators(
                        agency_id, stakeholder_id, indicator_id, auto_capture, active, assigned_by, notes, created_at, updated_at)
                    values (?,?,?,?,true,?,?, now(), now()) returning id
                    """, Long.class, agencyId, stakeholderId, indicatorId, autoCapture, uid, str(req.get("notes")));
        }

        Map<String, Object> captured = Map.of();
        if (autoCapture) {
            captured = autoCaptureValue(indicator, agencyId, stakeholderId, cleanPeriod(str(req.get("period"))));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("assignmentId", assignmentId);
        out.put("indicatorId", indicatorId);
        out.put("autoCapture", autoCapture);
        out.put("capturedValue", captured);
        out.put("message", "Indicator assigned to organization"
                + (captured.isEmpty() ? "" : "; value auto-linked from " + captured.getOrDefault("dataSource", "source")));
        return out;
    }

    /** Soft-delete: remove indicator from organization reporting set (values retained for audit). */
    @Transactional
    @Override
    public Map<String, Object> removeIndicatorFromOrganization(long assignmentId) {
        if (!SecurityUtils.hasAuthority("monitoring_evaluation.manage")
                && !SecurityUtils.hasAuthority("monitoring_evaluation.enter")) {
            throw new AccessDeniedException("Cannot remove M&E indicator assignments.");
        }
        Map<String, Object> row = oneOptional(
                "select id, agency_id as \"agencyId\", stakeholder_id as \"stakeholderId\", indicator_id as \"indicatorId\" "
                        + "from public.me_organization_indicators where id = ? and active",
                assignmentId);
        if (row == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Assignment not found");
        }
        assertOrgVisible(longOrNull(row.get("agencyId")), longOrNull(row.get("stakeholderId")));
        jdbc.update("update public.me_organization_indicators set active = false, updated_at = now() where id = ?",
                assignmentId);
        return Map.of("message", "Indicator removed from organization", "assignmentId", assignmentId,
                "note", "Historical me_indicator_values rows are kept for audit.");
    }

    /**
     * Re-run auto-capture for all auto_capture assignments of an organization (current period).
     */
    @Transactional
    @Override
    public Map<String, Object> captureOrganizationValues(Long agencyId, Long stakeholderId, String period) {
        if ((agencyId == null) == (stakeholderId == null)) {
            throw bad("Provide exactly one of agencyId or stakeholderId.");
        }
        assertOrgVisible(agencyId, stakeholderId);
        String p = cleanPeriod(period);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> assigned =
                (List<Map<String, Object>>) organizationIndicators(agencyId, stakeholderId).get("assigned");
        int captured = 0;
        int skipped = 0;
        List<Map<String, Object>> details = new ArrayList<>();
        for (Map<String, Object> a : assigned) {
            if (!Boolean.TRUE.equals(a.get("autoCapture"))) {
                skipped++;
                continue;
            }
            Map<String, Object> ind = one("select * from public.me_indicator_catalog where id = ?", a.get("indicatorId"));
            Map<String, Object> val = autoCaptureValue(ind, agencyId, stakeholderId, p);
            if (val.isEmpty()) {
                skipped++;
            } else {
                captured++;
                details.add(val);
            }
        }
        return Map.of("period", p, "captured", captured, "skipped", skipped, "values", details);
    }

    /**
     * Pull a numeric value from live operational tables when source_module is known.
     * Returns empty map when no honest automation exists (manual entry still required).
     */
    private Map<String, Object> autoCaptureValue(Map<String, Object> indicator, Long agencyId, Long stakeholderId,
                                                 String period) {
        String source = coalesce(str(indicator.get("source_module")), str(indicator.get("sourceModule")));
        if (source == null || source.isBlank()) {
            return Map.of();
        }
        String src = source.trim().toLowerCase(Locale.ROOT);
        Double numeric = null;
        String dataSource = null;
        try {
            // National/operational rollups only — agencies lack region_id in current schema.
            // Values are drafted for review; never presented as external official stats.
            if (src.contains("budget") || src.contains("finance") || src.contains("ndmf")) {
                try {
                    numeric = jdbc.query(
                            "select coalesce(sum(amount),0)::float from public.budget_commitments "
                                    + "where lower(coalesce(status,'')) in ('committed','disbursed')",
                            rs -> rs.next() ? rs.getDouble(1) : null);
                    dataSource = "auto:budget_commitments.sum_committed_disbursed";
                } catch (DataAccessException e2) {
                    numeric = null;
                }
            } else if (src.contains("incident")) {
                numeric = jdbc.query(
                        "select count(*)::float from public.incidents where coalesce(is_simulation,false)=false",
                        rs -> rs.next() ? rs.getDouble(1) : null);
                dataSource = "auto:incidents.non_simulation_count";
            } else if (src.contains("warehouse") || src.contains("stock") || src.contains("inventory")) {
                numeric = jdbc.query(
                        "select coalesce(sum(quantity),0)::float from public.inventory_items",
                        rs -> rs.next() ? rs.getDouble(1) : null);
                dataSource = "auto:inventory_items.sum_quantity";
            } else if (src.contains("training")) {
                numeric = jdbc.query(
                        "select count(*)::float from public.training_plans where coalesce(status,'') not in ('Cancelled')",
                        rs -> rs.next() ? rs.getDouble(1) : null);
                dataSource = "auto:training_plans.count";
            } else if (src.contains("warning") || src.contains("early_warning") || src.contains("ew")) {
                numeric = jdbc.query(
                        "select count(*)::float from public.warnings where coalesce(status,'') not in ('Cancelled','Draft')",
                        rs -> rs.next() ? rs.getDouble(1) : null);
                dataSource = "auto:warnings.count";
            } else if (src.contains("evacuation") || src.contains("shelter")) {
                numeric = jdbc.query(
                        "select count(*)::float from public.evacuation_centers where coalesce(status,'') ilike '%active%'",
                        rs -> rs.next() ? rs.getDouble(1) : null);
                dataSource = "auto:evacuation_centers.active";
            }
        } catch (DataAccessException e) {
            return Map.of();
        }
        if (numeric == null) {
            return Map.of();
        }
        Map<String, Object> req = new LinkedHashMap<>();
        req.put("indicatorId", indicator.get("id"));
        req.put("period", period);
        req.put("areaLevel", agencyId != null ? "agency" : "stakeholder");
        req.put("agencyId", agencyId);
        req.put("stakeholderId", stakeholderId);
        req.put("value", numeric);
        req.put("numericValue", numeric);
        req.put("status", "draft");
        req.put("dataSource", dataSource);
        req.put("notes", "Auto-captured from operational tables (" + dataSource + "). Review before submit.");
        try {
            return saveValue(req);
        } catch (Exception e) {
            return Map.of("error", e.getMessage() == null ? "capture_failed" : e.getMessage(),
                    "numericValue", numeric, "dataSource", dataSource);
        }
    }

    private void assertOrgVisible(Long agencyId, Long stakeholderId) {
        // Manage may see all; enter limited to own agency/stakeholder when bound
        if (SecurityUtils.hasAuthority("monitoring_evaluation.manage")) {
            return;
        }
        // Area/agency officers: if they have agency on user, enforce match
        // Soft: allow enter for any target the value path would allow
        try {
            if (agencyId != null) {
                assertTargetAllowed("agency", null, null, null, agencyId, null);
            } else {
                assertTargetAllowed("stakeholder", null, null, null, null, stakeholderId);
            }
        } catch (AccessDeniedException e) {
            throw e;
        } catch (Exception e) {
            // if assertTargetAllowed is strict, bubble
            if (e instanceof ResponseStatusException rse) {
                throw rse;
            }
        }
    }

    private Map<String, Object> oneOptional(String sql, Object... args) {
        List<Map<String, Object>> list = rows(sql, args);
        return list.isEmpty() ? null : list.get(0);
    }

    private List<Map<String, Object>> values(String level, String period, List<Map<String, Object>> indicators) {
        if (indicators.isEmpty()) {
            return List.of();
        }
        List<Object> args = new ArrayList<>();
        args.add(period);
        args.add(level);
        StringBuilder where = new StringBuilder(" where v.period_label = ? and v.area_level = ?");
        appendValueScope("v", where, args);
        where.append(" and v.indicator_id in (");
        for (int i = 0; i < indicators.size(); i++) {
            if (i > 0) {
                where.append(",");
            }
            where.append("?");
            args.add(((Number) indicators.get(i).get("id")).longValue());
        }
        where.append(")");
        return rows("""
                select v.id, v.indicator_id as "indicatorId", i.code as "indicatorCode",
                       v.period_label as "period", v.area_level as "areaLevel",
                       v.region_id as "regionId", v.district_id as "districtId", v.council_id as "councilId",
                       v.agency_id as "agencyId", v.stakeholder_id as "stakeholderId",
                       v.incident_id as "incidentId", v.warning_id as "warningId",
                       v.numeric_value as "numericValue", v.text_value as "textValue", v.status,
                       v.notes, v.data_source as "dataSource", v.updated_at as "updatedAt"
                from public.me_indicator_values v
                join public.me_indicator_catalog i on i.id = v.indicator_id
                """ + where + "\n order by i.sort_order, v.updated_at desc", args.toArray());
    }

    private List<Map<String, Object>> regionTargets(String search) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" where 1=1");
        appendRegionScope("r", where, args);
        appendSearch(where, args, "r.name", search);
        return targetRows("""
                select ('region:' || r.id) as key, r.name as label, 'region' as "areaLevel",
                       r.id as "regionId", null::bigint as "districtId", null::bigint as "councilId",
                       null::bigint as "agencyId", null::bigint as "stakeholderId",
                       null::bigint as "incidentId", null::bigint as "warningId",
                       coalesce(r.country_part,'mainland') as meta
                from public.regions r
                """ + where + "\n order by coalesce(r.country_part,'mainland'), r.name", args.toArray());
    }

    private List<Map<String, Object>> districtTargets(String search) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" where 1=1");
        appendDistrictScope("d", "r", where, args);
        appendSearch(where, args, "d.name", search);
        return targetRows("""
                select ('district:' || d.id) as key, d.name as label, 'district' as "areaLevel",
                       d.region_id as "regionId", d.id as "districtId", null::bigint as "councilId",
                       null::bigint as "agencyId", null::bigint as "stakeholderId",
                       null::bigint as "incidentId", null::bigint as "warningId",
                       r.name as meta
                from public.districts d
                left join public.regions r on r.id = d.region_id
                """ + where + "\n order by r.name, d.name", args.toArray());
    }

    private List<Map<String, Object>> councilTargets(String search) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" where coalesce(c.is_active,true)");
        appendCouncilScope("c", "d", "r", where, args);
        appendSearch(where, args, "c.name", search);
        return targetRows("""
                select ('council:' || c.id) as key, c.name as label, 'council' as "areaLevel",
                       c.region_id as "regionId", c.district_id as "districtId", c.id as "councilId",
                       null::bigint as "agencyId", null::bigint as "stakeholderId",
                       null::bigint as "incidentId", null::bigint as "warningId",
                       coalesce(r.name,'') || case when d.name is null then '' else ' / ' || d.name end as meta
                from public.councils c
                left join public.districts d on d.id = c.district_id
                left join public.regions r on r.id = c.region_id
                """ + where + "\n order by r.name, c.name", args.toArray());
    }

    private List<Map<String, Object>> agencyTargets(String search, String institutionClass) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" where coalesce(a.is_active,true)");
        Long agencyId = jurisdiction.currentAgencyId();
        if (isPmoMeNational()) {
            // PMO/national M&E managers see the full institution reporting set
        } else if (agencyId != null) {
            where.append(" and a.id = ?");
            args.add(agencyId);
        } else {
            // Area officers must not browse every MDA — empty institution targets
            return List.of();
        }
        if (institutionClass != null) {
            where.append(" and lower(coalesce(a.institution_class,'')) = lower(?)");
            args.add(institutionClass);
        }
        appendSearch(where, args, "coalesce(a.acronym,'') || ' ' || coalesce(a.name,'') || ' ' || coalesce(a.institution_class,'')", search);
        return targetRows("""
                select ('agency:' || a.id) as key, coalesce(nullif(a.acronym,''), a.name) as label,
                       'agency' as "areaLevel", null::bigint as "regionId", null::bigint as "districtId",
                       null::bigint as "councilId", a.id as "agencyId", null::bigint as "stakeholderId",
                       null::bigint as "incidentId", null::bigint as "warningId",
                       coalesce(a.institution_class, a.agency_type, 'Government')
                           || case when a.policy_role_code is null then '' else ' · ' || a.policy_role_code end
                           || case when a.name is null or a.name = coalesce(nullif(a.acronym,''), a.name) then ''
                                   else ' · ' || a.name end as meta,
                       a.institution_class as "institutionClass",
                       a.policy_role_code as "policyRoleCode",
                       a.sector_tags as "sectorTags"
                from public.agencies a
                """ + where
                + " order by case coalesce(a.institution_class,'')"
                + " when 'Ministry' then 1 when 'Government Institution' then 2"
                + " when 'Government Directorate' then 3 when 'Security and Response Institution' then 4"
                + " when 'Academic and Research Institution' then 5 when 'Regional Administration' then 6"
                + " when 'Local Government Authority' then 7 else 9 end, a.name",
                args.toArray());
    }

    private List<Map<String, Object>> stakeholderTargets(String search, String institutionClass) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" where coalesce(s.is_active,true)");
        appendStakeholderScope("s", where, args);
        Long stakeholderId = jurisdiction.currentStakeholderId();
        if (isPmoMeNational()) {
            // full partner set (still area-scoped above when regional officer somehow has manage=false)
        } else if (stakeholderId != null) {
            where.append(" and s.id = ?");
            args.add(stakeholderId);
        } else if (!isPmoMeNational()) {
            // Non-partner area officers do not get the full national stakeholder directory for M&E entry
            // Keep area-scoped list only (appendStakeholderScope already applied)
        }
        if (institutionClass != null) {
            where.append(" and lower(coalesce(s.institution_class,'')) = lower(?)");
            args.add(institutionClass);
        }
        appendSearch(where, args,
                "coalesce(s.organization,s.name,'') || ' ' || coalesce(s.institution_class,'') || ' ' || coalesce(s.type,'')",
                search);
        return targetRows("""
                select ('stakeholder:' || s.id) as key, coalesce(s.organization, s.name) as label,
                       'stakeholder' as "areaLevel", s.region_id as "regionId", s.district_id as "districtId",
                       null::bigint as "councilId", null::bigint as "agencyId", s.id as "stakeholderId",
                       null::bigint as "incidentId", null::bigint as "warningId",
                       coalesce(s.institution_class, s.type, 'Partner')
                           || case when s.sector is null then '' else ' · ' || s.sector end
                           || case when s.policy_role_code is null then '' else ' · ' || s.policy_role_code end as meta,
                       s.institution_class as "institutionClass",
                       s.policy_role_code as "policyRoleCode",
                       s.sector_tags as "sectorTags",
                       s.type as "partnerType"
                from public.stakeholders s
                """ + where
                + " order by case coalesce(s.institution_class,'')"
                + " when 'UN Agency' then 1 when 'NGO' then 2 when 'Private Sector' then 3"
                + " when 'Faith-Based Organization' then 4 when 'Media' then 5"
                + " when 'Diplomatic Mission' then 6 when 'Academic and Research Institution' then 7"
                + " when 'Community / Civic Group' then 8 else 9 end,"
                + " coalesce(s.organization, s.name)",
                args.toArray());
    }

    private List<Map<String, Object>> incidentTargets(String search) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" where 1=1");
        appendIncidentScope("i", where, args);
        appendSearch(where, args, "coalesce(i.title,'') || ' ' || coalesce(i.status,'')", search);
        return targetRows("""
                select ('incident:' || i.id) as key, coalesce(i.title, 'Incident #' || i.id) as label,
                       'incident' as "areaLevel", i.region_id as "regionId", i.district_id as "districtId",
                       i.council_id as "councilId", null::bigint as "agencyId", null::bigint as "stakeholderId",
                       i.id as "incidentId", null::bigint as "warningId",
                       coalesce(i.status,'Unknown') || case when i.severity_level is null then '' else ' · ' || i.severity_level end as meta
                from public.incidents i
                """ + where + "\n order by coalesce(i.reported_at, i.created_at) desc nulls last limit 120", args.toArray());
    }

    private List<Map<String, Object>> warningTargets(String search) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" where 1=1");
        appendWarningScope("wh", where, args);
        appendSearch(where, args, "coalesce(w.warning_code,'') || ' ' || coalesce(h.name,'')", search);
        return targetRows("""
                select ('warning:' || w.id) as key, coalesce(w.warning_code, 'Warning #' || w.id) as label,
                       'warning' as "areaLevel", min(wh.region_id) as "regionId", min(wh.district_id) as "districtId",
                       null::bigint as "councilId", null::bigint as "agencyId", null::bigint as "stakeholderId",
                       null::bigint as "incidentId", w.id as "warningId",
                       coalesce(max(h.name),'Hazard') || ' · ' || coalesce(w.status,'Unknown') as meta
                from public.warnings w
                left join public.warning_hazards wh on wh.warning_id = w.id
                left join public.hazards h on h.id = wh.hazard_id
                """ + where + "\n group by w.id, w.warning_code, w.status, w.created_at order by w.created_at desc nulls last limit 120", args.toArray());
    }

    private List<Map<String, Object>> targetRows(String sql, Object... args) {
        return rows(sql, args);
    }

    private Map<String, Object> target(String key, String label, String level, Long regionId, Long districtId,
                                       Long councilId, Long agencyId, Long stakeholderId, Long incidentId,
                                       Long warningId) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("key", key);
        out.put("label", label);
        out.put("areaLevel", level);
        out.put("regionId", regionId);
        out.put("districtId", districtId);
        out.put("councilId", councilId);
        out.put("agencyId", agencyId);
        out.put("stakeholderId", stakeholderId);
        out.put("incidentId", incidentId);
        out.put("warningId", warningId);
        out.put("meta", "");
        return out;
    }

    private Map<String, Object> indicator(Map<String, Object> req) {
        Long id = longOrNull(req.get("indicatorId"));
        String code = str(req.get("indicatorCode"));
        // Include source_module so org-assign auto-capture can draft values without a second query.
        List<Map<String, Object>> rows = id != null
                ? rows("""
                        select id, code, level, value_type as "valueType", owner_type as "ownerType",
                               owner_agency_id as "ownerAgencyId", stakeholder_type as "stakeholderType",
                               sector, source_module as "sourceModule",
                               applicable_sectors as "applicableSectors",
                               applicable_institution_classes as "applicableInstitutionClasses", active
                        from public.me_indicator_catalog where id = ?
                        """, id)
                : rows("""
                        select id, code, level, value_type as "valueType", owner_type as "ownerType",
                               owner_agency_id as "ownerAgencyId", stakeholder_type as "stakeholderType",
                               sector, source_module as "sourceModule",
                               applicable_sectors as "applicableSectors",
                               applicable_institution_classes as "applicableInstitutionClasses", active
                        from public.me_indicator_catalog where upper(code) = upper(?)
                        """, code);
        if (rows.isEmpty()) {
            throw bad("Unknown M&E indicator.");
        }
        Map<String, Object> indicator = rows.get(0);
        if (!Boolean.TRUE.equals(indicator.get("active"))) {
            throw bad("M&E indicator is inactive.");
        }
        return indicator;
    }

    /**
     * Indicator catalogue visibility (mandate filter).
     * <ul>
     *   <li>PMO ({@code monitoring_evaluation.manage}) — full catalogue.</li>
     *   <li>MDA agency focal — only {@code level=agency} indicators matching their mandate / owner.</li>
     *   <li>Partner stakeholder — only stakeholder-level mandate matches.</li>
     *   <li>Area officers (RAS/DED/…) — region/district/council/incident/warning/national only;
     *       not the full multi-agency institution reporting pack.</li>
     * </ul>
     */
    private void appendIndicatorContext(StringBuilder where, List<Object> args) {
        if (isPmoMeNational()) {
            return;
        }
        Long agencyId = jurisdiction.currentAgencyId();
        if (agencyId != null) {
            where.append(" and level = 'agency'");
            where.append(" and (owner_agency_id is null or owner_agency_id = ?)");
            args.add(agencyId);
            appendAgencyMandateFilter(where, args, agencyId);
            return;
        }
        Long stakeholderId = jurisdiction.currentStakeholderId();
        if (stakeholderId != null) {
            where.append(" and level = 'stakeholder'");
            appendStakeholderMandateFilter(where, args, stakeholderId);
            return;
        }
        // Area / non-institution officers: no full agency/stakeholder institution packs
        where.append(" and level in ('national','region','district','council','incident','warning')");
    }

    private void appendAgencyMandateFilter(StringBuilder where, List<Object> args, Long agencyId) {
        // Match by policy role and/or institution class. Sector tags refine when present on the
        // agency; empty sector_tags must not hide class/role-matched indicators (common for
        // freshly imported registry rows).
        where.append("""
                 and (
                    coalesce(policy_role_code,'') = ''
                    or exists (
                        select 1 from public.agencies a
                         where a.id = ?
                           and (
                               lower(coalesce(a.policy_role_code,'')) = lower(policy_role_code)
                               or coalesce(a.policy_role_code,'') = ''
                           )
                    )
                 )
                 and (
                    coalesce(applicable_institution_classes,'') = ''
                    or exists (
                        select 1
                          from regexp_split_to_table(lower(applicable_institution_classes), ',') required_class(value)
                          join public.agencies a on a.id = ?
                         where trim(required_class.value) <> ''
                           and (
                               lower(coalesce(a.institution_class,'')) = trim(required_class.value)
                               or lower(coalesce(a.agency_type,'')) = trim(required_class.value)
                           )
                    )
                 )
                 and (
                    coalesce(applicable_sectors,'') = ''
                    or exists (
                        select 1 from public.agencies a
                         where a.id = ?
                           and coalesce(nullif(trim(a.sector_tags),''),'') = ''
                    )
                    or exists (
                        select 1
                          from regexp_split_to_table(lower(applicable_sectors), ',') required_sector(value)
                          join public.agencies a on a.id = ?
                         where trim(required_sector.value) <> ''
                           and (
                               lower(coalesce(a.sector_tags,'')) like '%' || trim(required_sector.value) || '%'
                               or lower(coalesce(a.institution_class,'')) like '%' || trim(required_sector.value) || '%'
                               or lower(coalesce(a.agency_type,'')) like '%' || trim(required_sector.value) || '%'
                           )
                    )
                 )
                """);
        args.add(agencyId);
        args.add(agencyId);
        args.add(agencyId);
        args.add(agencyId);
    }

    private void appendStakeholderMandateFilter(StringBuilder where, List<Object> args, Long stakeholderId) {
        where.append("""
                 and (
                    coalesce(policy_role_code,'') = ''
                    or policy_role_code = 'POLICY_PARTNERS'
                    or exists (
                        select 1 from public.stakeholders s
                         where s.id = ?
                           and (
                               lower(coalesce(s.policy_role_code,'')) = lower(policy_role_code)
                               or coalesce(s.policy_role_code,'') = ''
                           )
                    )
                 )
                 and (
                    coalesce(applicable_institution_classes,'') = ''
                    or exists (
                        select 1
                          from regexp_split_to_table(lower(applicable_institution_classes), ',') required_class(value)
                          join public.stakeholders s on s.id = ?
                         where trim(required_class.value) <> ''
                           and (
                               lower(coalesce(s.institution_class,'')) = trim(required_class.value)
                               or lower(coalesce(s.type,'')) = trim(required_class.value)
                           )
                    )
                 )
                 and (
                    coalesce(applicable_sectors,'') = ''
                    or exists (
                        select 1 from public.stakeholders s
                         where s.id = ?
                           and coalesce(nullif(trim(s.sector_tags),''),'') = ''
                           and coalesce(nullif(trim(s.sector),''),'') = ''
                    )
                    or exists (
                        select 1
                          from regexp_split_to_table(lower(applicable_sectors), ',') required_sector(value)
                          join public.stakeholders s on s.id = ?
                         where trim(required_sector.value) <> ''
                           and (
                               lower(coalesce(s.sector_tags,'')) like '%' || trim(required_sector.value) || '%'
                               or lower(coalesce(s.sector,'')) like '%' || trim(required_sector.value) || '%'
                               or lower(coalesce(s.institution_class,'')) like '%' || trim(required_sector.value) || '%'
                               or lower(coalesce(s.type,'')) like '%' || trim(required_sector.value) || '%'
                           )
                    )
                 )
                """);
        args.add(stakeholderId);
        args.add(stakeholderId);
        args.add(stakeholderId);
        args.add(stakeholderId);
    }

    private void appendValueScope(String alias, StringBuilder where, List<Object> args) {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        String p = alias + ".";
        if ("REGION".equals(f.scope()) && f.regionId() != null) {
            where.append(" and (").append(p).append("region_id = ? or ").append(p)
                    .append("district_id in (select id from public.districts where region_id = ?) or ")
                    .append(p).append("council_id in (select id from public.councils where region_id = ?))");
            args.add(f.regionId());
            args.add(f.regionId());
            args.add(f.regionId());
        } else if ("DISTRICT".equals(f.scope())) {
            if (f.councilId() != null) {
                where.append(" and ").append(p).append("council_id = ?");
                args.add(f.councilId());
            } else if (f.districtId() != null) {
                where.append(" and (").append(p).append("district_id = ? or ").append(p)
                        .append("council_id in (select id from public.councils where district_id = ?))");
                args.add(f.districtId());
                args.add(f.districtId());
            }
        }
        Long agencyId = jurisdiction.currentAgencyId();
        if (!SecurityUtils.hasAuthority("monitoring_evaluation.manage") && agencyId != null) {
            where.append(" and (").append(p).append("agency_id is null or ").append(p).append("agency_id = ?)");
            args.add(agencyId);
        }
        Long stakeholderId = jurisdiction.currentStakeholderId();
        if (!SecurityUtils.hasAuthority("monitoring_evaluation.manage") && stakeholderId != null) {
            where.append(" and (").append(p).append("stakeholder_id is null or ").append(p).append("stakeholder_id = ?)");
            args.add(stakeholderId);
        }
    }

    private void assertIndicatorAllowed(Map<String, Object> indicator, Long agencyId, Long stakeholderId) {
        if (SecurityUtils.hasAuthority("monitoring_evaluation.manage")) {
            return;
        }
        Long ownAgency = jurisdiction.currentAgencyId();
        Long fixedAgency = longOrNull(indicator.get("ownerAgencyId"));
        if (ownAgency != null) {
            if (agencyId != null && !ownAgency.equals(agencyId)) {
                throw new AccessDeniedException("You may only enter M&E values for your own agency.");
            }
            if (fixedAgency != null && !ownAgency.equals(fixedAgency)) {
                throw new AccessDeniedException("This M&E indicator belongs to another agency.");
            }
            assertAgencyMandateAllowed(indicator, ownAgency);
        }
        Long ownStakeholder = jurisdiction.currentStakeholderId();
        if (ownStakeholder != null && stakeholderId != null && !ownStakeholder.equals(stakeholderId)) {
            throw new AccessDeniedException("You may only enter M&E values for your own stakeholder organisation.");
        }
        if (ownStakeholder != null) {
            assertStakeholderMandateAllowed(indicator, ownStakeholder);
        }
    }

    private void assertAgencyMandateAllowed(Map<String, Object> indicator, Long agencyId) {
        List<Map<String, Object>> rows = rows("""
                select sector_tags as "sectorTags", institution_class as "institutionClass", agency_type as "type"
                from public.agencies
                where id = ?
                """, agencyId);
        if (rows.isEmpty()) {
            throw new AccessDeniedException("Agency context is missing.");
        }
        Map<String, Object> agency = rows.get(0);
        if (!matchesMandateList(str(indicator.get("applicableSectors")),
                str(agency.get("sectorTags")), str(agency.get("institutionClass")), str(agency.get("type")))) {
            throw new AccessDeniedException("This M&E indicator is outside your agency mandate.");
        }
        if (!matchesMandateList(str(indicator.get("applicableInstitutionClasses")),
                str(agency.get("institutionClass")), str(agency.get("type")))) {
            throw new AccessDeniedException("This M&E indicator is outside your institution class.");
        }
    }

    private void assertStakeholderMandateAllowed(Map<String, Object> indicator, Long stakeholderId) {
        List<Map<String, Object>> rows = rows("""
                select sector_tags as "sectorTags", institution_class as "institutionClass", type
                from public.stakeholders
                where id = ?
                """, stakeholderId);
        if (rows.isEmpty()) {
            throw new AccessDeniedException("Stakeholder context is missing.");
        }
        Map<String, Object> stakeholder = rows.get(0);
        if (!matchesMandateList(str(indicator.get("applicableSectors")),
                str(stakeholder.get("sectorTags")), str(stakeholder.get("institutionClass")),
                str(stakeholder.get("type")))) {
            throw new AccessDeniedException("This M&E indicator is outside your organisation mandate.");
        }
        if (!matchesMandateList(str(indicator.get("applicableInstitutionClasses")),
                str(stakeholder.get("institutionClass")), str(stakeholder.get("type")))) {
            throw new AccessDeniedException("This M&E indicator is outside your organisation class.");
        }
    }

    private boolean matchesMandateList(String requiredList, String... actualValues) {
        if (requiredList == null || requiredList.isBlank()) {
            return true;
        }
        for (String raw : requiredList.split(",")) {
            String required = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
            if (required.isBlank()) {
                continue;
            }
            for (String actual : actualValues) {
                String value = actual == null ? "" : actual.toLowerCase(Locale.ROOT);
                if (!value.isBlank() && (value.equals(required) || value.contains(required))) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Fill missing target keys from the login identity for institution / area / partner levels.
     * Does not invent national targets for PMO; only auto-stamps when the level implies a fixed
     * binding (own agency, own stakeholder, own region/district/council).
     */
    private Map<String, Object> bindIdentityTarget(String level, Long regionId, Long districtId,
                                                   Long councilId, Long agencyId, Long stakeholderId) {
        Long ownAgency = jurisdiction.currentAgencyId();
        Long ownStakeholder = jurisdiction.currentStakeholderId();
        Map<String, Object> area = jurisdiction.currentArea();
        Long ownRegion = area.get("region_id") instanceof Number n ? n.longValue() : null;
        Long ownDistrict = area.get("district_id") instanceof Number n ? n.longValue() : null;
        Long ownCouncil = area.get("council_id") instanceof Number n ? n.longValue() : null;

        if ("agency".equals(level) && agencyId == null && ownAgency != null && !isPmoMeNational()) {
            agencyId = ownAgency;
        }
        if ("stakeholder".equals(level) && stakeholderId == null && ownStakeholder != null && !isPmoMeNational()) {
            stakeholderId = ownStakeholder;
        }
        if (!isPmoMeNational()) {
            if ("region".equals(level) && regionId == null && ownRegion != null) {
                regionId = ownRegion;
            }
            if ("district".equals(level)) {
                if (districtId == null && ownDistrict != null) {
                    districtId = ownDistrict;
                }
                if (regionId == null && ownRegion != null) {
                    regionId = ownRegion;
                }
                // Parent region from district when login only has district_id
                if (regionId == null && districtId != null) {
                    regionId = firstId("select region_id from public.districts where id = ?", districtId);
                }
            }
            if ("council".equals(level)) {
                if (councilId == null && ownCouncil != null) {
                    councilId = ownCouncil;
                }
                if (districtId == null && ownDistrict != null) {
                    districtId = ownDistrict;
                }
                if (regionId == null && ownRegion != null) {
                    regionId = ownRegion;
                }
            }
            // Institution accounts also carry area for multi-level reporting when granted
            if (("agency".equals(level) || "stakeholder".equals(level)) && regionId == null && ownRegion != null) {
                regionId = ownRegion;
            }
            if (("agency".equals(level) || "stakeholder".equals(level)) && districtId == null && ownDistrict != null) {
                districtId = ownDistrict;
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("regionId", regionId);
        out.put("districtId", districtId);
        out.put("councilId", councilId);
        out.put("agencyId", agencyId);
        out.put("stakeholderId", stakeholderId);
        return out;
    }

    private Long firstId(String sql, Object... args) {
        List<Long> rows = jdbc.queryForList(sql, Long.class, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private void assertTargetAllowed(String level, Long regionId, Long districtId, Long councilId,
                                     Long agencyId, Long stakeholderId) {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        if ("REGION".equals(f.scope()) && f.regionId() != null) {
            if (!targetInRegion(f.regionId(), level, regionId, districtId, councilId)) {
                throw new AccessDeniedException("This M&E target is outside your region.");
            }
        }
        if ("DISTRICT".equals(f.scope())) {
            if (f.councilId() != null && councilId != null && !f.councilId().equals(councilId)) {
                throw new AccessDeniedException("This M&E target is outside your council/LGA.");
            }
            if (f.districtId() != null && !targetInDistrict(f.districtId(), level, districtId, councilId)) {
                throw new AccessDeniedException("This M&E target is outside your district.");
            }
        }
        Long ownAgency = jurisdiction.currentAgencyId();
        if (!SecurityUtils.hasAuthority("monitoring_evaluation.manage") && ownAgency != null
                && (!"agency".equals(level) || agencyId == null || !ownAgency.equals(agencyId))) {
            throw new AccessDeniedException("Agency-linked users may enter only their own agency M&E values.");
        }
        Long ownStakeholder = jurisdiction.currentStakeholderId();
        if (!SecurityUtils.hasAuthority("monitoring_evaluation.manage") && ownStakeholder != null
                && (!"stakeholder".equals(level) || stakeholderId == null || !ownStakeholder.equals(stakeholderId))) {
            throw new AccessDeniedException("Stakeholder-linked users may enter only their own organisation M&E values.");
        }
    }

    private boolean targetInRegion(Long allowedRegionId, String level, Long regionId, Long districtId, Long councilId) {
        if ("region".equals(level)) {
            return allowedRegionId.equals(regionId);
        }
        if (districtId != null) {
            return count("select count(*) from public.districts where id = ? and region_id = ?", districtId, allowedRegionId) > 0;
        }
        if (councilId != null) {
            return count("select count(*) from public.councils where id = ? and region_id = ?", councilId, allowedRegionId) > 0;
        }
        return true;
    }

    private boolean targetInDistrict(Long allowedDistrictId, String level, Long districtId, Long councilId) {
        if ("district".equals(level)) {
            return allowedDistrictId.equals(districtId);
        }
        if (councilId != null) {
            return count("select count(*) from public.councils where id = ? and district_id = ?", councilId, allowedDistrictId) > 0;
        }
        return districtId == null || allowedDistrictId.equals(districtId);
    }

    private void appendRegionScope(String alias, StringBuilder where, List<Object> args) {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        if ("REGION".equals(f.scope()) && f.regionId() != null) {
            where.append(" and ").append(alias).append(".id = ?");
            args.add(f.regionId());
        } else if ("DISTRICT".equals(f.scope())) {
            if (f.districtId() != null) {
                where.append(" and ").append(alias).append(".id = (select region_id from public.districts where id = ?)");
                args.add(f.districtId());
            } else if (f.councilId() != null) {
                where.append(" and ").append(alias).append(".id = (select region_id from public.councils where id = ?)");
                args.add(f.councilId());
            }
        }
    }

    private void appendDistrictScope(String districtAlias, String regionAlias, StringBuilder where, List<Object> args) {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        if ("REGION".equals(f.scope()) && f.regionId() != null) {
            where.append(" and ").append(regionAlias).append(".id = ?");
            args.add(f.regionId());
        } else if ("DISTRICT".equals(f.scope())) {
            if (f.districtId() != null) {
                where.append(" and ").append(districtAlias).append(".id = ?");
                args.add(f.districtId());
            } else if (f.councilId() != null) {
                where.append(" and ").append(districtAlias).append(".id = (select district_id from public.councils where id = ?)");
                args.add(f.councilId());
            }
        }
    }

    private void appendCouncilScope(String councilAlias, String districtAlias, String regionAlias,
                                    StringBuilder where, List<Object> args) {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        if ("REGION".equals(f.scope()) && f.regionId() != null) {
            where.append(" and ").append(regionAlias).append(".id = ?");
            args.add(f.regionId());
        } else if ("DISTRICT".equals(f.scope())) {
            if (f.councilId() != null) {
                where.append(" and ").append(councilAlias).append(".id = ?");
                args.add(f.councilId());
            } else if (f.districtId() != null) {
                where.append(" and ").append(districtAlias).append(".id = ?");
                args.add(f.districtId());
            }
        }
    }

    private void appendStakeholderScope(String alias, StringBuilder where, List<Object> args) {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        if ("REGION".equals(f.scope()) && f.regionId() != null) {
            where.append(" and ").append(alias).append(".region_id = ?");
            args.add(f.regionId());
        } else if ("DISTRICT".equals(f.scope()) && f.districtId() != null) {
            where.append(" and ").append(alias).append(".district_id = ?");
            args.add(f.districtId());
        }
    }

    private void appendIncidentScope(String alias, StringBuilder where, List<Object> args) {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        if ("REGION".equals(f.scope()) && f.regionId() != null) {
            where.append(" and ").append(alias).append(".region_id = ?");
            args.add(f.regionId());
        } else if ("DISTRICT".equals(f.scope())) {
            if (f.councilId() != null) {
                where.append(" and (").append(alias).append(".council_id = ? or (")
                        .append(alias).append(".council_id is null and ").append(alias).append(".district_id = ?))");
                args.add(f.councilId());
                args.add(f.districtId());
            } else if (f.districtId() != null) {
                where.append(" and ").append(alias).append(".district_id = ?");
                args.add(f.districtId());
            }
        }
    }

    private void appendWarningScope(String hazardAlias, StringBuilder where, List<Object> args) {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        if ("REGION".equals(f.scope()) && f.regionId() != null) {
            where.append(" and ").append(hazardAlias).append(".region_id = ?");
            args.add(f.regionId());
        } else if ("DISTRICT".equals(f.scope()) && f.districtId() != null) {
            where.append(" and ").append(hazardAlias).append(".district_id = ?");
            args.add(f.districtId());
        }
    }

    private void appendSearch(StringBuilder where, List<Object> args, String expression, String search) {
        if (search == null || search.isBlank()) {
            return;
        }
        where.append(" and ").append(expression).append(" ilike ?");
        args.add("%" + search.trim() + "%");
    }

    private Map<String, Object> scopeMap() {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("level", f.scope());
        out.put("regionId", f.regionId());
        out.put("districtId", f.districtId());
        out.put("councilId", f.councilId());
        out.put("agencyId", jurisdiction.currentAgencyId());
        out.put("stakeholderId", jurisdiction.currentStakeholderId());
        // Honest identity surface for the workbench pill / UI: what this login is bound to.
        out.put("identityLevel", defaultLevel());
        out.put("allowedLevels", allowedLevels());
        out.put("nationalRegistry", isPmoMeNational());
        out.put("identityNote", identityScopeNote());
        return out;
    }

    private String identityScopeNote() {
        if (isPmoMeNational()) {
            return "PMO/national M&E manage — full institution registry and all area levels.";
        }
        if (jurisdiction.currentAgencyId() != null) {
            return "MDA/institution login — values bind to your agency; other institutions are not selectable.";
        }
        if (jurisdiction.currentStakeholderId() != null) {
            return "Partner/stakeholder login — values bind to your organisation only.";
        }
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        if ("REGION".equals(f.scope())) {
            return "Regional login — report for your region and subordinate districts/councils/incidents/warnings.";
        }
        if ("DISTRICT".equals(f.scope())) {
            return "District/LGA login — report for your district/council and local incidents/warnings only.";
        }
        return "Area/institution scope follows your user profile (region, district/LGA, agency or stakeholder link).";
    }

    private String defaultLevel() {
        Long agencyId = jurisdiction.currentAgencyId();
        if (agencyId != null && !isPmoMeNational()) {
            return "agency";
        }
        Long stakeholderId = jurisdiction.currentStakeholderId();
        if (stakeholderId != null && !isPmoMeNational()) {
            return "stakeholder";
        }
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        if ("REGION".equals(f.scope())) {
            return "region";
        }
        if ("DISTRICT".equals(f.scope())) {
            return f.councilId() == null ? "district" : "council";
        }
        return "region";
    }

    /**
     * Clamp requested workbench/catalogue level to what the caller may report.
     * PMO manage may select any level ({@code null} = entire catalogue for list APIs).
     * Institutions are forced to their own tier; area officers cannot open agency packs.
     */
    private String contextLevel(String level) {
        if (isPmoMeNational()) {
            // null stays null so GET /indicators (no level) returns the full catalogue
            return level;
        }
        if (jurisdiction.currentAgencyId() != null) {
            return "agency";
        }
        if (jurisdiction.currentStakeholderId() != null) {
            return "stakeholder";
        }
        // Area officers: never jump into full agency/stakeholder institution packs
        if (level == null || "agency".equals(level) || "stakeholder".equals(level) || "national".equals(level)) {
            return defaultLevel();
        }
        return level;
    }

    private List<String> allowedLevels() {
        if (isPmoMeNational()) {
            return LEVELS;
        }
        if (jurisdiction.currentAgencyId() != null) {
            return List.of("agency");
        }
        if (jurisdiction.currentStakeholderId() != null) {
            return List.of("stakeholder");
        }
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        if ("REGION".equals(f.scope())) {
            return List.of("region", "district", "council", "incident", "warning");
        }
        if ("DISTRICT".equals(f.scope())) {
            return List.of("district", "council", "incident", "warning");
        }
        return List.of("region", "district", "council", "incident", "warning");
    }

    /** PMO / national M&E managers — only they see the full institution registry in M&E. */
    private boolean isPmoMeNational() {
        return SecurityUtils.hasAuthority("monitoring_evaluation.manage");
    }

    private boolean canEnter() {
        return SecurityUtils.hasAuthority("monitoring_evaluation.enter")
                || SecurityUtils.hasAuthority("monitoring_evaluation.manage");
    }

    private String cleanInstitutionClass(String raw) {
        if (raw == null || raw.isBlank() || "all".equalsIgnoreCase(raw.trim())) {
            return null;
        }
        return raw.trim();
    }

    private Map<String, String> levelLabels() {
        Map<String, String> labels = new LinkedHashMap<>();
        labels.put("national", "National (PMO-DMD / SP 2026–2031 / readiness)");
        labels.put("region", "Regions (budget, EOCC, teams, DM cycle)");
        labels.put("district", "Districts (budget, plan, DM cycle)");
        labels.put("council", "District / LGA (budget, EPR plan, DM cycle)");
        labels.put("agency", "Ministries & government institutions");
        labels.put("stakeholder", "Partners (FBO / NGO / INGO / Private / UN)");
        labels.put("incident", "Incidents");
        labels.put("warning", "Early warnings");
        return labels;
    }

    /**
     * Institution-class chips for the workbench filter (PMO sees full breakdown;
     * agency/partner focals see only their own class if known).
     */
    private List<Map<String, Object>> institutionClassOptions(String level) {
        if (!"agency".equals(level) && !"stakeholder".equals(level)) {
            return List.of();
        }
        try {
            if ("agency".equals(level)) {
                List<Object> args = new ArrayList<>();
                StringBuilder where = new StringBuilder(" where coalesce(a.is_active,true)");
                if (!isPmoMeNational()) {
                    Long agencyId = jurisdiction.currentAgencyId();
                    if (agencyId == null) {
                        return List.of();
                    }
                    where.append(" and a.id = ?");
                    args.add(agencyId);
                }
                return rows("""
                        select coalesce(a.institution_class,'Unclassified') as "class",
                               count(*) as "total",
                               max(l.label_en) as "labelEn",
                               max(l.label_sw) as "labelSw"
                        from public.agencies a
                        left join public.me_institution_class_labels l
                               on l.institution_class = a.institution_class
                        """ + where
                        + " group by 1 order by min(coalesce(l.sort_order, 999)), 1",
                        args.toArray());
            }
            List<Object> args = new ArrayList<>();
            StringBuilder where = new StringBuilder(" where coalesce(s.is_active,true)");
            appendStakeholderScope("s", where, args);
            if (!isPmoMeNational()) {
                Long stakeholderId = jurisdiction.currentStakeholderId();
                if (stakeholderId != null) {
                    where.append(" and s.id = ?");
                    args.add(stakeholderId);
                }
            }
            return rows("""
                    select coalesce(s.institution_class,'Unclassified') as "class",
                           count(*) as "total",
                           max(l.label_en) as "labelEn",
                           max(l.label_sw) as "labelSw"
                    from public.stakeholders s
                    left join public.me_institution_class_labels l
                           on l.institution_class = s.institution_class
                    """ + where
                    + " group by 1 order by min(coalesce(l.sort_order, 999)), 1",
                    args.toArray());
        } catch (DataAccessException e) {
            // Labels table may not exist until V174; fall back to raw class counts.
            if ("agency".equals(level)) {
                return rows("""
                        select coalesce(institution_class,'Unclassified') as "class", count(*) as "total",
                               coalesce(institution_class,'Unclassified') as "labelEn",
                               coalesce(institution_class,'Unclassified') as "labelSw"
                        from public.agencies where coalesce(is_active,true)
                        group by 1 order by 2 desc
                        """);
            }
            return rows("""
                    select coalesce(institution_class,'Unclassified') as "class", count(*) as "total",
                           coalesce(institution_class,'Unclassified') as "labelEn",
                           coalesce(institution_class,'Unclassified') as "labelSw"
                    from public.stakeholders where coalesce(is_active,true)
                    group by 1 order by 2 desc
                    """);
        }
    }

    private List<Map<String, Object>> filterIndicatorsForClass(List<Map<String, Object>> indicators, String cls) {
        if (cls == null || cls.isBlank()) {
            return indicators;
        }
        String needle = cls.trim().toLowerCase(Locale.ROOT);
        List<Map<String, Object>> filtered = new ArrayList<>();
        for (Map<String, Object> ind : indicators) {
            String classes = str(ind.get("applicableInstitutionClasses"));
            if (classes == null || classes.isBlank()) {
                // Unrestricted indicators apply across the level (e.g. generic MDA_* / PARTNER_*)
                filtered.add(ind);
                continue;
            }
            for (String part : classes.split(",")) {
                if (part.trim().equalsIgnoreCase(needle)
                        || part.trim().toLowerCase(Locale.ROOT).contains(needle)
                        || needle.contains(part.trim().toLowerCase(Locale.ROOT))) {
                    filtered.add(ind);
                    break;
                }
            }
        }
        return filtered;
    }

    private List<String> domains() {
        return jdbc.queryForList("""
                select distinct domain from public.me_indicator_catalog
                where active order by domain
                """, String.class);
    }

    private Long existingValueId(long indicatorId, String period, String level, Long regionId, Long districtId,
                                 Long councilId, Long agencyId, Long stakeholderId, Long incidentId, Long warningId) {
        // IS NOT DISTINCT FROM handles SQL NULL equality (JDBC "?" IS NULL is type-ambiguous).
        List<Long> ids = jdbc.queryForList("""
                select id
                from public.me_indicator_values
                where indicator_id = ? and period_label = ? and area_level = ?
                  and region_id is not distinct from ?
                  and district_id is not distinct from ?
                  and council_id is not distinct from ?
                  and agency_id is not distinct from ?
                  and stakeholder_id is not distinct from ?
                  and incident_id is not distinct from ?
                  and warning_id is not distinct from ?
                limit 1
                """, Long.class, indicatorId, period, level,
                regionId, districtId, councilId, agencyId, stakeholderId, incidentId, warningId);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Map<String, Object> value(long id) {
        return one("""
                select v.id, v.indicator_id as "indicatorId", i.code as "indicatorCode", v.period_label as "period",
                       v.area_level as "areaLevel", v.region_id as "regionId", v.district_id as "districtId",
                       v.council_id as "councilId", v.agency_id as "agencyId", v.stakeholder_id as "stakeholderId",
                       v.incident_id as "incidentId", v.warning_id as "warningId", v.numeric_value as "numericValue",
                       v.text_value as "textValue", v.status, v.notes, v.data_source as "dataSource",
                       v.updated_at as "updatedAt"
                from public.me_indicator_values v
                join public.me_indicator_catalog i on i.id = v.indicator_id
                where v.id = ?
                """, id);
    }

    /**
     * Blank → fallback (null for full catalogue list APIs, defaultLevel for workbench).
     * Non-blank unknown → 422 (never silently treat garbage as national/full list).
     */
    private String cleanLevel(String raw, String fallback) {
        if (raw == null || raw.isBlank()) {
            return fallback;
        }
        String level = raw.trim().toLowerCase(Locale.ROOT);
        if (LEVELS.contains(level)) {
            return level;
        }
        throw new BusinessRuleException(
                "Unknown level '" + raw.trim() + "'. Use national, region, district, council, agency, stakeholder, incident or warning.");
    }

    private String cleanPeriod(String period) {
        if (period != null && !period.isBlank()) {
            String p = period.trim();
            // Productive labels: YYYY-Qn (matches seeded me_indicator_values) or calendar year YYYY.
            if (p.matches("\\d{4}-Q[1-4]") || p.matches("\\d{4}")) {
                return p;
            }
            throw new BusinessRuleException("period must look like 2026-Q3 or 2026.");
        }
        LocalDate now = LocalDate.now();
        int quarter = ((now.getMonthValue() - 1) / 3) + 1;
        return now.getYear() + "-Q" + quarter;
    }

    private String cycleOrNull(Object value) {
        return oneOf(str(value), List.of("prevention_mitigation", "preparedness", "response", "recovery"), null);
    }

    private String oneOf(String value, List<String> allowed, String fallback) {
        if (value == null) {
            return fallback;
        }
        String v = value.trim().toLowerCase(Locale.ROOT);
        return allowed.contains(v) ? v : fallback;
    }

    private Double numericValue(Map<String, Object> req, String valueType) {
        if ("text".equals(valueType)) {
            return null;
        }
        Object value = req.containsKey("numericValue") ? req.get("numericValue") : req.get("value");
        if ("boolean".equals(valueType)) {
            if (value instanceof Boolean b) {
                return b ? 1.0 : 0.0;
            }
            String s = str(value);
            if (s == null) {
                return null;
            }
            return List.of("yes", "true", "1", "y").contains(s.toLowerCase(Locale.ROOT)) ? 1.0 : 0.0;
        }
        return numOrNull(value);
    }

    private List<Map<String, Object>> rows(String sql, Object... args) {
        try {
            return jdbc.queryForList(sql, args);
        } catch (DataAccessException e) {
            return List.of();
        }
    }

    private Map<String, Object> one(String sql, Object... args) {
        List<Map<String, Object>> rows = rows(sql, args);
        return rows.isEmpty() ? Map.of() : rows.get(0);
    }

    private long count(String sql, Object... args) {
        try {
            Long n = jdbc.queryForObject(sql, Long.class, args);
            return n == null ? 0 : n;
        } catch (DataAccessException e) {
            return 0;
        }
    }

    private ResponseStatusException bad(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }

    private String req(Map<String, Object> req, String key) {
        String value = str(req.get(key));
        if (value == null) {
            throw bad(key + " is required");
        }
        return value;
    }

    private String str(Object value) {
        if (value == null) {
            return null;
        }
        String s = String.valueOf(value).trim();
        return s.isEmpty() ? null : s;
    }

    private String coalesce(String value, String fallback) {
        return value == null ? fallback : value;
    }

    private Long longOrNull(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        if (value instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Integer intOrNull(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        if (value instanceof Number n) {
            return n.intValue();
        }
        try {
            return (int) Double.parseDouble(String.valueOf(value));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private int intOrDefault(Object value, int fallback) {
        Integer i = intOrNull(value);
        return i == null ? fallback : i;
    }

    private Double numOrNull(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        if (value instanceof Number n) {
            return n.doubleValue();
        }
        try {
            return Double.parseDouble(String.valueOf(value).replace(",", ""));
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Boolean boolOrNull(Object value) {
        if (value == null || String.valueOf(value).isBlank()) {
            return null;
        }
        if (value instanceof Boolean b) {
            return b;
        }
        String s = String.valueOf(value).trim().toLowerCase(Locale.ROOT);
        return List.of("true", "1", "yes", "y", "active").contains(s);
    }

    private boolean boolOrDefault(Object value, boolean fallback) {
        Boolean b = boolOrNull(value);
        return b == null ? fallback : b;
    }

    private LocalDate dateOrNull(Object value) {
        String s = str(value);
        if (s == null) {
            return null;
        }
        try {
            return LocalDate.parse(s);
        } catch (Exception e) {
            return null;
        }
    }
}
