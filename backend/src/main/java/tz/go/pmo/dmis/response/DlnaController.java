package tz.go.pmo.dmis.response;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * NDRF 2026 Annex 1 — the official Damage, Loss and Needs Assessment (DLNA) instrument —
 * and Annex 2 — the Disaster Recovery Implementation Plan — keyed per incident.
 *
 * Annex 1 is an 11-section rapid-assessment checklist; each section is keyed by its
 * assigned sector (NDRF Table 1 leads) and attributed to whoever keyed it. When every
 * section is submitted the assessment can be finalized (verify permission) and the
 * system renders the official annex document from the keyed data. Annex 2 is one plan
 * per incident, pre-seeded from the incident + finalized DLNA, edited chapter by chapter.
 *
 * Section answers live as JSON keyed by the frontend schema (single source of truth for
 * form AND generated output) — the instrument is a checklist, not typed analytics.
 */
@RestController
@RequestMapping("/v1/response/dlna")
public class DlnaController {

    /** The Annex-1 sections in document order, with the NDRF Table-1 sector attribution. */
    private static final Map<String, String> SECTIONS = new LinkedHashMap<>();
    static {
        SECTIONS.put("people", "Social Protection & Community Resilience — TASAF / PO-RALG");
        SECTIONS.put("nfi", "Social Protection — PO-RALG / LGAs");
        SECTIONS.put("wash", "Water, Sanitation & Hygiene — Ministry of Water / RUWASA / DUWASA");
        SECTIONS.put("health", "Health — Ministry of Health / PO-RALG (RHMTs, CHMTs)");
        SECTIONS.put("food", "Food Security & Livelihood — Ministry of Agriculture / Livestock & Fisheries");
        SECTIONS.put("education", "Education — MoEST / PO-RALG");
        SECTIONS.put("protection", "Protection — Ministry of Community Development, Gender, Women and Special Groups");
        SECTIONS.put("infrastructure", "Infrastructure & Settlements — Ministry of Works and Transport / TANROADS / TARURA / MLHHSD");
        SECTIONS.put("environment", "Environment — Vice President's Office (Environment) / NEMC");
        SECTIONS.put("rcce", "Risk Communication & Community Engagement — PMO-DMD / LGAs");
        SECTIONS.put("assistance", "Assistance Obtained & Outstanding Risks — PMO-DMD (consolidation)");
    }

    /**
     * Section → sector-agency binding (lowercase acronyms, per NDRF Table 1). An agency-bound
     * login may key ONLY the sections listing its agency (PMO-DMD, the consolidation owner, may
     * key any). Sections whose designated agency has no accounts yet stay keyable by the general
     * assessment officers — the binding activates automatically once the agency gets logins.
     */
    private static final Map<String, List<String>> SECTION_SECTORS = new LinkedHashMap<>();
    static {
        SECTION_SECTORS.put("people", List.of("po-ralg", "tasaf"));
        SECTION_SECTORS.put("nfi", List.of("po-ralg", "tasaf"));
        SECTION_SECTORS.put("wash", List.of("mow", "bwb", "ruwasa", "duwasa"));
        SECTION_SECTORS.put("health", List.of("moh"));
        SECTION_SECTORS.put("food", List.of("moa", "mlf", "nfra"));
        SECTION_SECTORS.put("education", List.of("moest"));
        SECTION_SECTORS.put("protection", List.of("mcdgwsg"));
        SECTION_SECTORS.put("infrastructure", List.of("mowt", "tanroads", "tarura", "mlhhsd"));
        SECTION_SECTORS.put("environment", List.of("nemc", "vpo", "tfs"));
        SECTION_SECTORS.put("rcce", List.of("pmo-dmd", "tcra"));
        SECTION_SECTORS.put("assistance", List.of("pmo-dmd"));
    }

    private static final List<String> DISASTER_TYPES = List.of(
            "Flood", "Tsunami", "Mudslide", "Earthquake", "Epidemics", "Displacement", "Drought", "Other");

    private static final int MAX_SECTION_JSON_BYTES = 200_000;

    private static final ObjectMapper JSON = new ObjectMapper();

    private final JdbcTemplate jdbc;
    private final IncidentWorkflowService users;
    private final JurisdictionScope jurisdiction;
    private final AreaGuard areaGuard;
    private final tz.go.pmo.dmis.common.pdf.HtmlPdfService pdf;
    private final tz.go.pmo.dmis.notification.NotificationService notifications;
    private final java.nio.file.Path storageRoot;

    public DlnaController(JdbcTemplate jdbc, IncidentWorkflowService users,
                          JurisdictionScope jurisdiction, AreaGuard areaGuard,
                          tz.go.pmo.dmis.common.pdf.HtmlPdfService pdf,
                          tz.go.pmo.dmis.notification.NotificationService notifications,
                          @org.springframework.beans.factory.annotation.Value("${dmis.storage.public-root:${user.dir}/storage/public}") String publicRoot) {
        this.jdbc = jdbc;
        this.users = users;
        this.jurisdiction = jurisdiction;
        this.areaGuard = areaGuard;
        this.pdf = pdf;
        this.notifications = notifications;
        this.storageRoot = java.nio.file.Path.of(publicRoot);
    }

    // ─── Registry ───

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) Long incident_id) {
        StringBuilder sql = new StringBuilder("""
                select d.id, d.ref_no, d.incident_id, d.scope, d.status, d.date_of_visit, d.region, d.district,
                       d.disaster_type, d.created_at, i.title as incident_title,
                       u.name as created_by_name,
                       (select count(*) from public.dlna_incidents di where di.assessment_id = d.id) as incident_count,
                       (select count(*) from public.dlna_sections s where s.assessment_id = d.id) as section_count,
                       (select count(*) from public.dlna_sections s where s.assessment_id = d.id
                          and s.status = 'Submitted') as submitted_count,
                       (select count(*) from public.recovery_plans rp where rp.incident_id = d.incident_id) as has_plan
                from public.dlna_assessments d
                join public.incidents i on i.id = d.incident_id
                left join public.users u on u.id = d.created_by
                where 1=1
                """);
        List<Object> params = new ArrayList<>();
        if (incident_id != null) {
            // Matches through the COVERAGE, so a combined DLNA appears on every incident it covers.
            sql.append(" and exists (select 1 from public.dlna_incidents di where di.assessment_id = d.id and di.incident_id = ?)");
            params.add(incident_id);
        }
        // Area visibility ALSO rides the coverage: a combined DLNA is visible to the officers of
        // EVERY covered incident's area (a Kyela DED must see the flood DLNA led by an Ilala
        // incident that covers Kyela), not only the lead's.
        StringBuilder scopeSub = new StringBuilder(
                " and exists (select 1 from public.dlna_incidents dix join public.incidents i2 on i2.id = dix.incident_id"
                        + " where dix.assessment_id = d.id");
        jurisdiction.appendAreaScopeSharedOrOwn("i2", scopeSub, params);
        scopeSub.append(")");
        sql.append(scopeSub);
        sql.append(" order by d.created_at desc limit 200");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("assessments", jdbc.queryForList(sql.toString(), params.toArray()));
        out.put("sections", SECTIONS);
        out.put("disaster_types", DISASTER_TYPES);
        // Incidents eligible for a new DLNA: same visibility scope as the registry. The hazard
        // label guides the combined scopes (same-hazard vs multi-hazard selection).
        StringBuilder inc = new StringBuilder("""
                select i.id, i.title, i.severity_level, coalesce(it.name, h.name) as hazard
                from public.incidents i
                left join public.incident_types it on it.id = i.incident_type_id
                left join public.hazards h on h.id = i.hazard_id
                where 1=1""");
        List<Object> incParams = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("i", inc, incParams);
        inc.append(" order by i.created_at desc limit 500");
        out.put("incidents", jdbc.queryForList(inc.toString(), incParams.toArray()));
        return out;
    }

    // ─── Create + detail ───

    /** DLNA coverage: one incident, several incidents of the same hazard, or a multi-hazard compound event. */
    private static final List<String> SCOPES = List.of("SINGLE", "SAME_HAZARD", "MULTI_HAZARD");

    public record CreateRequest(Long incident_id, String scope, List<Long> additional_incident_ids,
                                String date_of_visit, String region, String district,
                                String ward, String village, String gps_coordinates, String disaster_type,
                                String disaster_type_other, String affected_villages,
                                List<Map<String, Object>> team_members, List<Map<String, Object>> interviewees) {
    }

    @PostMapping
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    @Transactional
    public Map<String, Object> create(@RequestBody CreateRequest req) throws Exception {
        if (req.incident_id() == null) {
            throw new BusinessRuleException("A lead incident is required — the DLNA is keyed per incident.");
        }
        String scope = req.scope() == null || req.scope().isBlank() ? "SINGLE" : req.scope();
        if (!SCOPES.contains(scope)) {
            throw new BusinessRuleException("Unknown DLNA scope.");
        }
        // The full coverage = lead + additional incidents, deduplicated, every one visible to the caller.
        java.util.LinkedHashSet<Long> covered = new java.util.LinkedHashSet<>();
        covered.add(req.incident_id());
        if (req.additional_incident_ids() != null) {
            req.additional_incident_ids().stream().filter(java.util.Objects::nonNull).forEach(covered::add);
        }
        if (covered.size() > 30) {
            throw new BusinessRuleException("A combined DLNA can cover at most 30 incidents.");
        }
        for (Long incidentId : covered) {
            areaGuard.assertOwnOrShared("public.incidents", incidentId);
        }
        validateScope(scope, covered);
        if (req.disaster_type() != null && !req.disaster_type().isBlank()
                && !DISASTER_TYPES.contains(req.disaster_type())) {
            throw new BusinessRuleException("Unknown disaster type.");
        }
        Long id = jdbc.queryForObject("""
                insert into public.dlna_assessments
                    (incident_id, scope, date_of_visit, region, district, ward, village, gps_coordinates,
                     disaster_type, disaster_type_other, affected_villages, team_members, interviewees, created_by)
                values (?, ?, ?::date, ?, ?, ?, ?, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?)
                returning id
                """, Long.class,
                req.incident_id(), scope, blankToNull(req.date_of_visit()), blankToNull(req.region()),
                blankToNull(req.district()), blankToNull(req.ward()), blankToNull(req.village()),
                blankToNull(req.gps_coordinates()), blankToNull(req.disaster_type()),
                blankToNull(req.disaster_type_other()), blankToNull(req.affected_villages()),
                cappedJson(req.team_members(), "team members"),
                cappedJson(req.interviewees(), "interviewees"),
                users.actingUserId());
        // Reference derives from the row id — collision-free (never count(*)+1).
        jdbc.update("update public.dlna_assessments set ref_no = 'DLNA-' || to_char(created_at, 'YYYY') || '-' || lpad(id::text, greatest(length(id::text), 4), '0') where id = ?", id);
        // Full coverage rows (lead included) — every covered incident lists this DLNA on its page.
        for (Long incidentId : covered) {
            jdbc.update("insert into public.dlna_incidents (assessment_id, incident_id) values (?, ?)", id, incidentId);
        }
        for (Map.Entry<String, String> s : SECTIONS.entrySet()) {
            jdbc.update("insert into public.dlna_sections (assessment_id, section_key, sector_lead) values (?, ?, ?)",
                    id, s.getKey(), s.getValue());
        }
        String incidentTitle = jdbc.queryForObject(
                "select title from public.incidents where id = ?", String.class, req.incident_id());
        String refNo = jdbc.queryForObject(
                "select ref_no from public.dlna_assessments where id = ?", String.class, id);
        notifySectors(id, refNo, incidentTitle);
        return Map.of("success", true, "id", id, "message",
                "SINGLE".equals(scope) ? "DLNA opened — sections are ready for sector keying."
                        : "Combined DLNA opened over " + covered.size() + " incidents — sections are ready for sector keying.");
    }

    /**
     * Combining rules, validated against the incidents' RECORDED hazard types
     * (coalesce of incident type and hazard): SAME_HAZARD needs ≥2 incidents that all share one
     * hazard; MULTI_HAZARD needs ≥2 incidents spanning ≥2 hazards. An incident with no recorded
     * hazard type cannot be combined — the rule would be unverifiable.
     */
    private void validateScope(String scope, java.util.Collection<Long> covered) {
        if ("SINGLE".equals(scope)) {
            if (covered.size() > 1) {
                throw new BusinessRuleException("A single-incident DLNA cannot list additional incidents — choose a combined scope.");
            }
            return;
        }
        if (covered.size() < 2) {
            throw new BusinessRuleException("A combined DLNA needs at least two incidents.");
        }
        String inClause = String.join(",", java.util.Collections.nCopies(covered.size(), "?"));
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select i.id, i.title, coalesce(it.name, h.name) as hazard from public.incidents i"
                        + " left join public.incident_types it on it.id = i.incident_type_id"
                        + " left join public.hazards h on h.id = i.hazard_id"
                        + " where i.id in (" + inClause + ")",
                covered.toArray());
        for (Map<String, Object> r : rows) {
            if (r.get("hazard") == null) {
                throw new BusinessRuleException("Incident \"" + r.get("title")
                        + "\" has no recorded hazard type — record it before combining.");
            }
        }
        long distinctHazards = rows.stream().map(r -> String.valueOf(r.get("hazard"))).distinct().count();
        if ("SAME_HAZARD".equals(scope) && distinctHazards > 1) {
            throw new BusinessRuleException("The selected incidents span " + distinctHazards
                    + " different hazards — use the multi-hazard scope, or select incidents of one hazard.");
        }
        if ("MULTI_HAZARD".equals(scope) && distinctHazards < 2) {
            throw new BusinessRuleException("All selected incidents share one hazard — use the same-hazard scope.");
        }
    }

    @GetMapping("/{id:\\d+}")
    public Map<String, Object> show(@PathVariable long id) {
        Map<String, Object> assessment = findOr404(id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("assessment", assessment);
        out.put("incident", jdbc.queryForMap("""
                select i.id, i.title, i.severity_level, i.status, i.region_name, i.district_name,
                       i.location_description, i.occurred_at, i.reported_at, i.people_affected,
                       i.deaths_total, i.injured_total, i.displaced
                from public.incidents i where i.id = ?
                """, assessment.get("incident_id")));
        // Full coverage — for combined DLNAs this is the lead plus every additional incident.
        out.put("covered_incidents", jdbc.queryForList("""
                select i.id, i.title, i.severity_level, coalesce(it.name, h.name) as hazard
                from public.dlna_incidents di
                join public.incidents i on i.id = di.incident_id
                left join public.incident_types it on it.id = i.incident_type_id
                left join public.hazards h on h.id = i.hazard_id
                where di.assessment_id = ?
                order by (i.id = ?) desc, i.id
                """, id, assessment.get("incident_id")));
        out.put("sections", jdbc.queryForList("""
                select s.id, s.section_key, s.sector_lead, s.data::text as data, s.status, s.filled_at,
                       u.name as filled_by_name
                from public.dlna_sections s
                left join public.users u on u.id = s.filled_by
                where s.assessment_id = ?
                order by s.id
                """, id));
        out.put("section_sectors", SECTION_SECTORS);
        out.put("my_agency", jurisdiction.currentAgencyCode());
        out.put("plan_id", jdbc.queryForList(
                "select id from public.recovery_plans where incident_id = ?", Long.class,
                assessment.get("incident_id")).stream().findFirst().orElse(null));
        return out;
    }

    // ─── Keying ───

    public record HeaderRequest(String date_of_visit, String region, String district, String ward,
                                String village, String gps_coordinates, String disaster_type,
                                String disaster_type_other, String affected_villages,
                                List<Map<String, Object>> team_members, List<Map<String, Object>> interviewees) {
    }

    @PostMapping("/{id:\\d+}/header")
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    public Map<String, Object> saveHeader(@PathVariable long id, @RequestBody HeaderRequest req) throws Exception {
        assertEditable(findOr404(id));
        if (req.disaster_type() != null && !req.disaster_type().isBlank()
                && !DISASTER_TYPES.contains(req.disaster_type())) {
            throw new BusinessRuleException("Unknown disaster type.");
        }
        String team = cappedJson(req.team_members(), "team members");
        String interviewees = cappedJson(req.interviewees(), "interviewees");
        // Guarded against a concurrent finalize: the row only updates while still editable.
        int updated = jdbc.update("""
                update public.dlna_assessments set date_of_visit = ?::date, region = ?, district = ?,
                    ward = ?, village = ?, gps_coordinates = ?, disaster_type = ?, disaster_type_other = ?,
                    affected_villages = ?, team_members = ?::jsonb, interviewees = ?::jsonb, updated_at = now()
                where id = ? and status <> 'Final'
                """, blankToNull(req.date_of_visit()), blankToNull(req.region()), blankToNull(req.district()),
                blankToNull(req.ward()), blankToNull(req.village()), blankToNull(req.gps_coordinates()),
                blankToNull(req.disaster_type()), blankToNull(req.disaster_type_other()),
                blankToNull(req.affected_villages()), team, interviewees, id);
        if (updated == 0) {
            throw new BusinessRuleException("This DLNA became final — reopen it before editing.");
        }
        return Map.of("success", true, "message", "General information saved.");
    }

    public record SectionRequest(JsonNode data, Boolean submit) {
    }

    @PostMapping("/{id:\\d+}/sections/{key}")
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    public Map<String, Object> saveSection(@PathVariable long id, @PathVariable String key,
                                           @RequestBody SectionRequest req) throws Exception {
        assertEditable(findOr404(id));
        if (!SECTIONS.containsKey(key)) {
            throw new ResourceNotFoundException("Unknown DLNA section.");
        }
        assertSectorMayKey(key);
        if (req.data() == null || !req.data().isObject()) {
            throw new BusinessRuleException("Section data must be a JSON object of keyed answers.");
        }
        String json = JSON.writeValueAsString(req.data());
        if (json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > MAX_SECTION_JSON_BYTES) {
            throw new BusinessRuleException("Section data is too large.");
        }
        boolean submit = Boolean.TRUE.equals(req.submit());
        // The Pending→Submitted lock is enforced HERE, not just in the UI: a Submitted section
        // never accepts new data (a stale client or direct POST must reopen it first), and the
        // whole write is void if a concurrent finalize made the assessment Final.
        int updated = jdbc.update("""
                update public.dlna_sections set data = ?::jsonb,
                    status = case when ? then 'Submitted' else status end,
                    filled_by = case when ? then ? else filled_by end,
                    filled_at = case when ? then now() else filled_at end
                where assessment_id = ? and section_key = ? and status <> 'Submitted'
                  and exists (select 1 from public.dlna_assessments a where a.id = ? and a.status <> 'Final')
                """, json, submit, submit, users.actingUserId(), submit, id, key, id);
        if (updated == 0) {
            String status = jdbc.queryForList(
                    "select status from public.dlna_sections where assessment_id = ? and section_key = ?",
                    String.class, id, key).stream().findFirst().orElse(null);
            if ("Submitted".equals(status)) {
                throw new BusinessRuleException("This section is already submitted — reopen it before keying again.");
            }
            throw new BusinessRuleException("The section could not be saved (the DLNA may have just been finalized).");
        }
        jdbc.update("update public.dlna_assessments set updated_at = now() where id = ?", id);
        return Map.of("success", true,
                "message", submit ? "Section submitted." : "Section saved (still open for keying).");
    }

    @PostMapping("/{id:\\d+}/sections/{key}/reopen")
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    public Map<String, Object> reopenSection(@PathVariable long id, @PathVariable String key) {
        assertEditable(findOr404(id));
        assertSectorMayKey(key);
        int updated = jdbc.update("""
                update public.dlna_sections set status = 'Pending'
                where assessment_id = ? and section_key = ?
                  and exists (select 1 from public.dlna_assessments a where a.id = ? and a.status <> 'Final')
                """, id, key, id);
        if (updated == 0) {
            throw new BusinessRuleException("The section could not be reopened (the DLNA may have just been finalized).");
        }
        return Map.of("success", true, "message", "Section reopened for keying.");
    }

    // ─── Finalize ───

    @PostMapping("/{id:\\d+}/finalize")
    @PreAuthorize("hasAuthority('damage_assessment.verify')")
    @Transactional
    public Map<String, Object> finalize(@PathVariable long id) {
        Map<String, Object> assessment = findOr404(id);
        if ("Final".equals(assessment.get("status"))) {
            throw new BusinessRuleException("This DLNA is already final.");
        }
        // The 11/11 gate and the status flip ride one guarded statement: a section reopened
        // between check and flip voids the finalize instead of freezing a Pending section.
        int updated = jdbc.update("""
                update public.dlna_assessments set status = 'Final', finalized_by = ?, finalized_at = now(), updated_at = now()
                where id = ? and status <> 'Final'
                  and not exists (select 1 from public.dlna_sections s
                                  where s.assessment_id = ? and s.status <> 'Submitted')
                """, users.actingUserId(), id, id);
        if (updated == 0) {
            Long pending = jdbc.queryForObject(
                    "select count(*) from public.dlna_sections where assessment_id = ? and status <> 'Submitted'",
                    Long.class, id);
            throw new BusinessRuleException(pending + " section(s) are not yet submitted — every sector must key and submit its section before the DLNA can be finalized.");
        }
        return Map.of("success", true, "message", "DLNA finalized — the Annex 1 output is now the official record.");
    }

    @PostMapping("/{id:\\d+}/reopen")
    @PreAuthorize("hasAuthority('damage_assessment.verify')")
    public Map<String, Object> reopen(@PathVariable long id) {
        findOr404(id);
        jdbc.update("update public.dlna_assessments set status = 'In Progress', finalized_by = null, finalized_at = null, updated_at = now() where id = ?", id);
        return Map.of("success", true, "message", "DLNA reopened for corrections.");
    }

    // ─── Annex 2: Recovery Implementation Plan (one per incident) ───

    @GetMapping("/plan/by-incident/{incidentId:\\d+}")
    public Map<String, Object> planByIncident(@PathVariable long incidentId) {
        areaGuard.assertOwnOrShared("public.incidents", incidentId);
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, incident_id, dlna_id, status, chapters::text as chapters,
                       created_by, updated_by, created_at, updated_at
                from public.recovery_plans where incident_id = ?
                """, incidentId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("incident", jdbc.queryForMap("""
                select id, title, severity_level, status, region_name, district_name, location_description,
                       occurred_at, reported_at, people_affected, deaths_total, injured_total, displaced
                from public.incidents where id = ?
                """, incidentId));
        out.put("plan", rows.isEmpty() ? null : rows.get(0));
        // The latest finalized DLNA feeds the situation analysis; fall back to the latest one.
        List<Map<String, Object>> dlnas = jdbc.queryForList("""
                select id, ref_no, status, date_of_visit from public.dlna_assessments
                where incident_id = ? order by (status = 'Final') desc, created_at desc limit 1
                """, incidentId);
        out.put("dlna", dlnas.isEmpty() ? null : dlnas.get(0));
        return out;
    }

    public record PlanRequest(JsonNode chapters, Long dlna_id) {
    }

    @PostMapping("/plan/by-incident/{incidentId:\\d+}")
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    @Transactional
    public Map<String, Object> savePlan(@PathVariable long incidentId, @RequestBody PlanRequest req) throws Exception {
        areaGuard.assertOwnOrShared("public.incidents", incidentId);
        if (req.chapters() == null || !req.chapters().isObject()) {
            throw new BusinessRuleException("Plan chapters must be a JSON object.");
        }
        String json = JSON.writeValueAsString(req.chapters());
        if (json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 400_000) {
            throw new BusinessRuleException("Plan content is too large.");
        }
        if (req.dlna_id() != null) {
            Long belongs = jdbc.queryForObject(
                    "select count(*) from public.dlna_assessments where id = ? and incident_id = ?",
                    Long.class, req.dlna_id(), incidentId);
            if (belongs == null || belongs == 0) {
                throw new BusinessRuleException("The referenced DLNA does not belong to this incident.");
            }
        }
        Long actor = users.actingUserId();
        // Atomic upsert — concurrent first saves must not race to a duplicate-key 500.
        jdbc.update("""
                insert into public.recovery_plans (incident_id, dlna_id, chapters, created_by, updated_by)
                values (?, ?, ?::jsonb, ?, ?)
                on conflict (incident_id) do update set chapters = excluded.chapters,
                    dlna_id = coalesce(excluded.dlna_id, public.recovery_plans.dlna_id),
                    updated_by = excluded.updated_by, updated_at = now()
                """, incidentId, req.dlna_id(), json, actor, actor);
        return Map.of("success", true, "message", "Recovery Implementation Plan saved.");
    }

    // ─── Sector feeding ───

    /**
     * Sector-bound keying: an agency login may key only its own sections (PMO-DMD, the
     * consolidation owner, may key all); logins with no agency (admin, area assessment
     * officers) keep the attribution model.
     */
    private void assertSectorMayKey(String sectionKey) {
        String agency = jurisdiction.currentAgencyCode();
        if (agency == null || "pmo-dmd".equals(agency) || hasEoccOverride()) {
            return;
        }
        List<String> allowed = SECTION_SECTORS.getOrDefault(sectionKey, List.of());
        if (!allowed.contains(agency)) {
            throw new BusinessRuleException("The \"" + SECTIONS.get(sectionKey)
                    + "\" section is keyed by its designated sector — your login ("
                    + agency.toUpperCase(java.util.Locale.ROOT) + ") is bound to a different sector's sections.");
        }
    }

    /**
     * The PMO/EOCC override: verifiers and EOCC-activation-tier operators may key ANY section
     * when a sector is late or unable to respond — the record still attributes exactly who keyed
     * it, so an override is always visible on the annex output.
     */
    private static boolean hasEoccOverride() {
        var auth = org.springframework.security.core.context.SecurityContextHolder.getContext().getAuthentication();
        if (auth == null) {
            return false;
        }
        for (org.springframework.security.core.GrantedAuthority a : auth.getAuthorities()) {
            if ("damage_assessment.verify".equals(a.getAuthority()) || "command_post.activate".equals(a.getAuthority())) {
                return true;
            }
        }
        return false;
    }

    /**
     * The sector work queue: every Pending section of a non-Final DLNA that belongs to the
     * logged-in user's agency (empty for non-agency logins). This is how the sectors FEED the
     * DLNA — each row links straight into the section keying screen.
     */
    @GetMapping("/my-sections")
    public Map<String, Object> mySections() {
        String agency = jurisdiction.currentAgencyCode();
        List<String> keys = new ArrayList<>();
        if (agency != null) {
            if ("pmo-dmd".equals(agency)) {
                keys.addAll(SECTIONS.keySet());
            } else {
                SECTION_SECTORS.forEach((k, v) -> {
                    if (v.contains(agency)) {
                        keys.add(k);
                    }
                });
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("agency", agency);
        if (keys.isEmpty()) {
            out.put("sections", List.of());
            return out;
        }
        String inClause = String.join(",", java.util.Collections.nCopies(keys.size(), "?"));
        List<Object> params = new ArrayList<>(keys);
        StringBuilder sql = new StringBuilder(
                "select s.section_key, s.sector_lead, s.status, d.id as dlna_id, d.ref_no,"
                        + " d.status as dlna_status, d.date_of_visit, i.title as incident_title"
                        + " from public.dlna_sections s"
                        + " join public.dlna_assessments d on d.id = s.assessment_id"
                        + " join public.incidents i on i.id = d.incident_id"
                        + " where s.status = 'Pending' and d.status <> 'Final' and s.section_key in (" + inClause + ")");
        StringBuilder scopeSub = new StringBuilder(
                " and exists (select 1 from public.dlna_incidents dix join public.incidents i2 on i2.id = dix.incident_id"
                        + " where dix.assessment_id = d.id");
        jurisdiction.appendAreaScopeSharedOrOwn("i2", scopeSub, params);
        scopeSub.append(")");
        sql.append(scopeSub).append(" order by d.created_at desc, s.id limit 100");
        out.put("sections", jdbc.queryForList(sql.toString(), params.toArray()));
        return out;
    }

    /** In-app alert to every mapped sector user: the DLNA is open, their section awaits keying. */
    private void notifySectors(long dlnaId, String refNo, String incidentTitle) {
        try {
            java.util.Set<String> agencies = new java.util.TreeSet<>();
            SECTION_SECTORS.values().forEach(agencies::addAll);
            String inClause = String.join(",", java.util.Collections.nCopies(agencies.size(), "?"));
            List<Long> userIds = jdbc.queryForList(
                    "select u.id from public.users u join public.agencies a on a.id = u.agency_id"
                            + " where lower(a.acronym) in (" + inClause + ")",
                    Long.class, agencies.toArray());
            if (!userIds.isEmpty()) {
                notifications.notifyUsers(userIds, tz.go.pmo.dmis.notification.NotificationService.Notice.inApp(
                        "dlna_section", "DLNA opened: sector keying awaited",
                        refNo + " opened for \"" + incidentTitle + "\" — your sector's section(s) await keying.",
                        "/m/response/dlna/" + dlnaId, "dlna_assessment", dlnaId, "info")
                        .withChannels(false, true)); // bell + email — sectors must see it even off-system
            }
        } catch (Exception e) {
            // Notification is best-effort — never fail the create for it.
        }
    }

    // ─── PDF filing → Reports & Analytics ───

    public record FileReportRequest(String html) {
    }

    /**
     * Renders the FINAL Annex-1 document to PDF and files it in the Reports & Analytics
     * registry. Final-only: an in-progress DLNA is a working copy, not an official record.
     * Each filing is a new versioned file — never an overwrite.
     */
    @PostMapping("/{id:\\d+}/file-report")
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    @Transactional
    public Map<String, Object> fileAnnex1Report(@PathVariable long id, @RequestBody FileReportRequest req) throws Exception {
        Map<String, Object> assessment = findOr404(id);
        if (!"Final".equals(assessment.get("status"))) {
            throw new BusinessRuleException("Only a FINAL DLNA can be filed as an official Annex 1 report — finalize it first.");
        }
        String ref = (String) assessment.get("ref_no");
        String title = "DLNA (NDRF Annex 1) — " + ref;
        return storeGenerated(req.html(), "DLNA_ANNEX1", title, ref,
                ((Number) assessment.get("incident_id")).longValue(), id, "reports/dlna");
    }

    /** Files the Recovery Implementation Plan (Annex 2) PDF — the plan is a living document,
     *  so every filing is a dated version in the registry. */
    @PostMapping("/plan/by-incident/{incidentId:\\d+}/file-report")
    @PreAuthorize("hasAuthority('damage_assessment.create')")
    @Transactional
    public Map<String, Object> filePlanReport(@PathVariable long incidentId, @RequestBody FileReportRequest req) throws Exception {
        areaGuard.assertOwnOrShared("public.incidents", incidentId);
        List<Long> planIds = jdbc.queryForList(
                "select id from public.recovery_plans where incident_id = ?", Long.class, incidentId);
        if (planIds.isEmpty()) {
            throw new BusinessRuleException("Save the Recovery Implementation Plan before filing it as a report.");
        }
        String incidentTitle = jdbc.queryForObject(
                "select title from public.incidents where id = ?", String.class, incidentId);
        String ref = "RIP-INC" + incidentId;
        String title = "Recovery Implementation Plan (NDRF Annex 2) — " + incidentTitle;
        return storeGenerated(req.html(), "RECOVERY_PLAN_ANNEX2", title, ref, incidentId, planIds.get(0), "reports/recovery-plans");
    }

    private Map<String, Object> storeGenerated(String html, String type, String title, String ref,
                                               long incidentId, long sourceId, String dir) throws Exception {
        byte[] bytes = pdf.render(html);
        Long rowId = jdbc.queryForObject("""
                insert into public.generated_reports (report_type, title, ref_no, incident_id, source_id, file_path, file_bytes, generated_by)
                values (?, ?, ?, ?, ?, '', ?, ?) returning id
                """, Long.class, type, title, ref, incidentId, sourceId, (long) bytes.length, users.actingUserId());
        // Row id in the filename = version-safe, collision-free (never count(*)+1).
        String path = dir + "/" + ref + "-r" + rowId + ".pdf";
        java.nio.file.Path target = storageRoot.resolve(path);
        java.nio.file.Files.createDirectories(target.getParent());
        java.nio.file.Files.write(target, bytes);
        jdbc.update("update public.generated_reports set file_path = ? where id = ?", path, rowId);
        return Map.of("success", true, "file_path", path, "report_id", rowId,
                "message", "PDF generated and filed in Reports & Analytics (" + (bytes.length / 1024) + " KB).");
    }

    // ─── Helpers ───

    /** Loads the DLNA and enforces jurisdiction through the incidents it surveys (foreign → 404).
     *  For combined scopes, visibility of ANY covered incident grants access — matching the
     *  registry predicate exactly, so a listed row can never 404 on click.
     *  jsonb columns are cast to text so JDBC doesn't hand the client a PGobject wrapper. */
    private Map<String, Object> findOr404(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select id, ref_no, incident_id, scope, status, date_of_visit, region, district, ward, village,
                       gps_coordinates, disaster_type, disaster_type_other, affected_villages,
                       team_members::text as team_members, interviewees::text as interviewees,
                       created_by, finalized_by, finalized_at, created_at, updated_at
                from public.dlna_assessments where id = ?
                """, id);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("DLNA assessment not found.");
        }
        List<Long> covered = jdbc.queryForList(
                "select incident_id from public.dlna_incidents where assessment_id = ?", Long.class, id);
        if (covered.isEmpty()) {
            covered = List.of(((Number) rows.get(0).get("incident_id")).longValue());
        }
        boolean visible = covered.stream()
                .anyMatch(incidentId -> areaGuard.visibleOwnOrShared("public.incidents", incidentId));
        if (!visible) {
            throw new ResourceNotFoundException("DLNA assessment not found.");
        }
        return rows.get(0);
    }

    private static void assertEditable(Map<String, Object> assessment) {
        if ("Final".equals(assessment.get("status"))) {
            throw new BusinessRuleException("This DLNA is final — reopen it (verify permission) before editing.");
        }
    }

    private static String blankToNull(String v) {
        return v == null || v.isBlank() ? null : v;
    }

    /** Serializes a name/organization row list with a sanity cap (same spirit as the section cap). */
    private static String cappedJson(List<Map<String, Object>> rows, String what) throws Exception {
        String json = JSON.writeValueAsString(rows == null ? List.of() : rows);
        if (json.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 40_000) {
            throw new BusinessRuleException("Too many " + what + " — trim the list.");
        }
        return json;
    }
}
