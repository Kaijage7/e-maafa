package tz.go.pmo.dmis.service.impl;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.dto.request.InstitutionClassificationRequest;
import tz.go.pmo.dmis.dto.request.InstitutionCreateRequest;
import tz.go.pmo.dmis.dto.request.InstitutionProfileRequest;
import tz.go.pmo.dmis.service.InstitutionRegistryService;

/**
 * JDBC governance over agencies + stakeholders. Item rows intentionally keep snake_case
 * column names from the union query so the Angular registry (institution_class, me_required, …)
 * continues to bind without a FE change.
 */
@Service
@RequiredArgsConstructor
public class InstitutionRegistryServiceImpl implements InstitutionRegistryService {

    private final JdbcTemplate jdbc;

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> index(String kind, String institutionClass, String sector, String source,
                                     String search, int limit, Boolean includeInactive) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" where 1=1");
        // Default: active registry only. includeInactive=true shows removed rows for restore.
        if (!Boolean.TRUE.equals(includeInactive)) {
            where.append(" and coalesce(is_active, true) = true");
        }
        if (kind != null && !kind.isBlank()) {
            where.append(" and kind = ?");
            args.add(kind.trim());
        }
        if (institutionClass != null && !institutionClass.isBlank()) {
            where.append(" and institution_class = ?");
            args.add(institutionClass.trim());
        }
        if (sector != null && !sector.isBlank()) {
            where.append(" and coalesce(sector_tags,'') ilike ?");
            args.add("%" + sector.trim() + "%");
        }
        if (source != null && !source.isBlank()) {
            where.append(" and source_register = ?");
            args.add(source.trim());
        }
        if (search != null && !search.isBlank()) {
            where.append("""
                     and (name ilike ? or coalesce(acronym,'') ilike ? or coalesce(type,'') ilike ?
                          or coalesce(institution_class,'') ilike ? or coalesce(sector_tags,'') ilike ?)
                    """);
            String q = "%" + search.trim() + "%";
            args.add(q);
            args.add(q);
            args.add(q);
            args.add(q);
            args.add(q);
        }
        int safeLimit = Math.max(50, Math.min(limit, 2500));
        args.add(safeLimit);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stats", stats());
        out.put("classes", classes());
        out.put("sources", sources());
        out.put("policyRoles", policyRoles());
        out.put("glossary", glossary());
        out.put("duplicates", duplicates());
        out.put("reportingPaths", reportingPaths());
        out.put("classBreakdown", classBreakdown());
        out.put("includeInactive", Boolean.TRUE.equals(includeInactive));
        out.put("items", jdbc.queryForList("""
                select *
                from (""" + unionSql() + """
                ) x
                """ + where + "\n order by kind, coalesce(is_active,true) desc, coalesce(institution_class,'zz'), name limit ?",
                args.toArray()));
        return out;
    }

    @Override
    @Transactional
    public Map<String, Object> create(String kind, InstitutionCreateRequest req) {
        assertKind(kind);
        if (req == null || req.name() == null || req.name().isBlank()) {
            throw new BusinessRuleException("name is required to add an institution");
        }
        String name = req.name().trim();
        if (name.length() < 2 || name.length() > 255) {
            throw new BusinessRuleException("name length must be between 2 and 255 characters");
        }
        boolean meRequired = req.meRequired() == null || Boolean.TRUE.equals(req.meRequired());
        Long id;
        if ("agency".equals(kind)) {
            // Reject exact active duplicate names (case-insensitive).
            Integer dup = jdbc.queryForObject("""
                    select count(*)::int from public.agencies
                    where lower(trim(name)) = lower(?) and coalesce(is_active,true)
                    """, Integer.class, name);
            if (dup != null && dup > 0) {
                throw new BusinessRuleException("An active agency with this name already exists");
            }
            id = jdbc.queryForObject("""
                    insert into public.agencies(
                        name, acronym, agency_type, institution_class, institution_subclass, sector_tags,
                        policy_role_code, role_summary, mandate_description, source_reference, source_register,
                        contact_person_name, contact_person_email, contact_person_phone, office_address, website,
                        me_required, is_active, created_at, updated_at)
                    values (?,?,?,?,?,?,?,?,?,?, 'System Settings',
                            ?,?,?,?,?,
                            ?, true, now(), now())
                    returning id
                    """, Long.class,
                    name,
                    blankToNull(req.acronym()),
                    blankToNull(req.type()),
                    blankToNull(req.institutionClass()),
                    blankToNull(req.institutionSubclass()),
                    blankToNull(req.sectorTags()),
                    blankToNull(req.policyRoleCode()),
                    blankToNull(req.roleSummary()),
                    blankToNull(req.roleSummary()),
                    blankToNull(req.sourceReference()),
                    blankToNull(req.contactPersonName()),
                    blankToNull(req.contactPersonEmail()),
                    blankToNull(req.contactPersonPhone()),
                    blankToNull(req.address()),
                    blankToNull(req.website()),
                    meRequired);
        } else {
            Integer dup = jdbc.queryForObject("""
                    select count(*)::int from public.stakeholders
                    where lower(trim(coalesce(organization, name))) = lower(?) and coalesce(is_active,true)
                    """, Integer.class, name);
            if (dup != null && dup > 0) {
                throw new BusinessRuleException("An active stakeholder with this name already exists");
            }
            String type = normalizeStakeholderType(
                    req.type() == null || req.type().isBlank() ? "NGO" : req.type());
            id = jdbc.queryForObject("""
                    insert into public.stakeholders(
                        name, organization, type, institution_class, institution_subclass, sector_tags, sector,
                        policy_role_code, role_summary, source_reference, source_register,
                        contact_person_name, contact_person_email, contact_person_phone, address,
                        me_required, is_active, created_at, updated_at)
                    values (?,?,?,?,?,?,?,?,?,?,'System Settings',
                            ?,?,?,?,
                            ?, true, now(), now())
                    returning id
                    """, Long.class,
                    name, name, type,
                    blankToNull(req.institutionClass()),
                    blankToNull(req.institutionSubclass()),
                    blankToNull(req.sectorTags()),
                    blankToNull(req.sectorTags()),
                    blankToNull(req.policyRoleCode()),
                    blankToNull(req.roleSummary()),
                    blankToNull(req.sourceReference()),
                    blankToNull(req.contactPersonName()),
                    blankToNull(req.contactPersonEmail()),
                    blankToNull(req.contactPersonPhone()),
                    blankToNull(req.address()),
                    meRequired);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("kind", kind);
        out.put("id", id);
        out.put("message", "Institution added to the " + kind + " registry");
        return out;
    }

    @Override
    @Transactional
    public Map<String, Object> remove(String kind, long id) {
        assertKind(kind);
        // Soft remove only: keep history and FK integrity (users, M&E values, resources).
        int n = jdbc.update(
                "update " + table(kind) + " set is_active = false, updated_at = now() where id = ? and coalesce(is_active,true) = true",
                id);
        if (n == 0) {
            // Distinguish missing vs already removed
            Integer exists = jdbc.queryForObject(
                    "select count(*)::int from " + table(kind) + " where id = ?", Integer.class, id);
            if (exists == null || exists == 0) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Institution not found.");
            }
            throw new BusinessRuleException("Institution is already removed from the active registry");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("kind", kind);
        out.put("id", id);
        out.put("removed", true);
        out.put("message", "Institution removed from the active registry (soft deactivate). Restore if needed.");
        return out;
    }

    @Override
    @Transactional
    public Map<String, Object> restore(String kind, long id) {
        assertKind(kind);
        int n = jdbc.update(
                "update " + table(kind) + " set is_active = true, updated_at = now() where id = ? and coalesce(is_active,true) = false",
                id);
        if (n == 0) {
            Integer exists = jdbc.queryForObject(
                    "select count(*)::int from " + table(kind) + " where id = ?", Integer.class, id);
            if (exists == null || exists == 0) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Institution not found.");
            }
            throw new BusinessRuleException("Institution is already active");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("success", true);
        out.put("kind", kind);
        out.put("id", id);
        out.put("restored", true);
        out.put("message", "Institution restored to the active registry");
        return out;
    }

    @Override
    @Transactional
    public Map<String, Object> updateClassification(String kind, long id, InstitutionClassificationRequest req) {
        assertKind(kind);
        // Build SQL with an explicit space after UPDATE — text-block concat used to yield
        // "updatepublic.agencies" (silent 500 on governance classification saves).
        int n = jdbc.update(
                "update " + table(kind)
                        + " set institution_class = coalesce(?, institution_class),"
                        + " institution_subclass = coalesce(?, institution_subclass),"
                        + " sector_tags = coalesce(?, sector_tags),"
                        + " me_required = coalesce(?, me_required),"
                        + " policy_role_code = coalesce(?, policy_role_code),"
                        + " role_summary = coalesce(?, role_summary),"
                        + " source_reference = coalesce(?, source_reference),"
                        + " updated_at = now() where id = ?",
                blankToNull(req.institutionClass()), blankToNull(req.institutionSubclass()),
                blankToNull(req.sectorTags()), req.meRequired(), blankToNull(req.policyRoleCode()),
                blankToNull(req.roleSummary()), blankToNull(req.sourceReference()), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Institution not found.");
        }
        return Map.of("kind", kind, "id", id, "message", "Institution governance updated");
    }

    @Override
    @Transactional
    public Map<String, Object> updateProfile(String kind, long id, InstitutionProfileRequest req) {
        assertKind(kind);
        if (req.name() != null && req.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name cannot be blank.");
        }
        int n;
        if ("agency".equals(kind)) {
            // mandate_description mirrors role_summary (historical dual-write; FE only sends roleSummary).
            n = jdbc.update("""
                    update public.agencies
                       set name = coalesce(?, name),
                           acronym = coalesce(?, acronym),
                           agency_type = coalesce(?, agency_type),
                           institution_class = coalesce(?, institution_class),
                           institution_subclass = coalesce(?, institution_subclass),
                           sector_tags = coalesce(?, sector_tags),
                           policy_role_code = coalesce(?, policy_role_code),
                           role_summary = coalesce(?, role_summary),
                           mandate_description = coalesce(?, mandate_description),
                           source_reference = coalesce(?, source_reference),
                           contact_person_name = coalesce(?, contact_person_name),
                           contact_person_email = coalesce(?, contact_person_email),
                           contact_person_phone = coalesce(?, contact_person_phone),
                           office_address = coalesce(?, office_address),
                           website = coalesce(?, website),
                           me_required = coalesce(?, me_required),
                           is_active = coalesce(?, is_active),
                           updated_at = now()
                     where id = ?
                    """,
                    blankToNull(req.name()), blankToNull(req.acronym()), blankToNull(req.type()),
                    blankToNull(req.institutionClass()), blankToNull(req.institutionSubclass()),
                    blankToNull(req.sectorTags()), blankToNull(req.policyRoleCode()),
                    blankToNull(req.roleSummary()), blankToNull(req.roleSummary()),
                    blankToNull(req.sourceReference()),
                    blankToNull(req.contactPersonName()), blankToNull(req.contactPersonEmail()),
                    blankToNull(req.contactPersonPhone()), blankToNull(req.address()),
                    blankToNull(req.website()), req.meRequired(), req.isActive(), id);
        } else {
            // stakeholders.organization is denormalised display name; sector mirrors sector_tags.
            n = jdbc.update("""
                    update public.stakeholders
                       set name = coalesce(?, name),
                           organization = coalesce(?, organization),
                           type = coalesce(?, type),
                           institution_class = coalesce(?, institution_class),
                           institution_subclass = coalesce(?, institution_subclass),
                           sector_tags = coalesce(?, sector_tags),
                           sector = coalesce(?, sector),
                           policy_role_code = coalesce(?, policy_role_code),
                           role_summary = coalesce(?, role_summary),
                           source_reference = coalesce(?, source_reference),
                           contact_person_name = coalesce(?, contact_person_name),
                           contact_person_email = coalesce(?, contact_person_email),
                           contact_person_phone = coalesce(?, contact_person_phone),
                           address = coalesce(?, address),
                           me_required = coalesce(?, me_required),
                           is_active = coalesce(?, is_active),
                           updated_at = now()
                     where id = ?
                    """,
                    blankToNull(req.name()),
                    blankToNull(req.name()),
                    blankToNull(normalizeStakeholderType(req.type())),
                    blankToNull(req.institutionClass()), blankToNull(req.institutionSubclass()),
                    blankToNull(req.sectorTags()), blankToNull(req.sectorTags()),
                    blankToNull(req.policyRoleCode()), blankToNull(req.roleSummary()),
                    blankToNull(req.sourceReference()),
                    blankToNull(req.contactPersonName()), blankToNull(req.contactPersonEmail()),
                    blankToNull(req.contactPersonPhone()), blankToNull(req.address()),
                    req.meRequired(), req.isActive(), id);
        }
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Institution not found.");
        }
        return Map.of("kind", kind, "id", id, "message", "Institution profile updated");
    }

    @Override
    @Transactional(readOnly = true)
    public Map<String, Object> one(String kind, long id) {
        assertKind(kind);
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select * from (""" + unionSql() + """
                ) x where kind = ? and id = ?
                """, kind, id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Institution not found.");
        }
        return rows.get(0);
    }

    private static String table(String kind) {
        return "agency".equals(kind) ? "public.agencies" : "public.stakeholders";
    }

    private static void assertKind(String kind) {
        if (!"agency".equals(kind) && !"stakeholder".equals(kind)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown registry kind.");
        }
    }

    private static String normalizeStakeholderType(String type) {
        if (type == null || type.isBlank()) {
            return null;
        }
        String t = type.trim();
        // stakeholders.type check constraint
        if (List.of("Government", "NGO", "Private", "International", "Community", "Individual").contains(t)) {
            return t;
        }
        return switch (t.toLowerCase()) {
            case "un agency", "diplomatic mission", "development partner" -> "International";
            case "private sector" -> "Private";
            case "faith-based organization", "fbo", "media" -> "NGO";
            case "community / civic group" -> "Community";
            default -> "NGO";
        };
    }

    private Map<String, Object> stats() {
        return jdbc.queryForMap("""
                select
                  (select count(*) from public.agencies where coalesce(is_active,true)) as "agencies",
                  (select count(*) from public.stakeholders where coalesce(is_active,true)) as "stakeholders",
                  (select count(*) from public.agencies where coalesce(is_active,true)
                     and institution_class = 'Government Institution') as "governmentInstitutions",
                  (select count(*) from public.agencies where coalesce(is_active,true)
                     and institution_class = 'Ministry') as "ministries",
                  (select count(*) from public.agencies where coalesce(is_active,true)
                     and institution_class in ('Ministry','Government Institution','Government Directorate',
                       'Security and Response Institution','Academic and Research Institution')) as "nationalMdas",
                  (select count(*) from public.agencies where coalesce(me_required,false)) +
                  (select count(*) from public.stakeholders where coalesce(me_required,false)) as "meRequired",
                  (select count(distinct institution_class) from public.agencies where institution_class is not null) +
                  (select count(distinct institution_class) from public.stakeholders where institution_class is not null) as "classGroups",
                  (select count(distinct source_register) from public.agencies where source_register is not null) +
                  (select count(distinct source_register) from public.stakeholders where source_register is not null) as "sourceRegisters",
                  (select count(*) from public.me_indicator_catalog where active and level = 'agency') as "agencyIndicators",
                  (select count(*) from public.me_indicator_catalog where active and level = 'stakeholder') as "stakeholderIndicators"
                """);
    }

    /**
     * Clear M&amp;E reporting paths so operators know: MDAs use agency workbench;
     * partners use stakeholder workbench — both governed here in System Settings.
     */
    private List<Map<String, Object>> reportingPaths() {
        return List.of(
                Map.of(
                        "path", "mda",
                        "registry", "agency",
                        "titleEn", "MDA / Government institution focals",
                        "titleSw", "Maafisa wa MDA / Taasisi za Serikali",
                        "whereGoverned", "System Settings → Institution Registry (Agencies)",
                        "whereReport", "Monitoring & Evaluation → Data Workbench → Government institutions (MDAs)",
                        "meLevel", "agency",
                        "who", "Ministries, executive agencies, authorities, security/response, academia",
                        "routeWorkbench", "/m/monitoring-evaluation/workbench?level=agency",
                        "routeRegistry", "/m/user-management/institutions?kind=agency"),
                Map.of(
                        "path", "partner",
                        "registry", "stakeholder",
                        "titleEn", "Partners (UN, NGO, FBO, private, diplomatic, development partners)",
                        "titleSw", "Wadau (UN, NGO, Dini, Sekta binafsi, Balozi, Washirika wa maendeleo)",
                        "whereGoverned", "System Settings → Institution Registry (Stakeholders)",
                        "whereReport", "Monitoring & Evaluation → Data Workbench → Partners",
                        "meLevel", "stakeholder",
                        "who", "UN agencies, NGOs, FBOs, private sector, media, diplomatic missions, DPs",
                        "routeWorkbench", "/m/monitoring-evaluation/workbench?level=stakeholder",
                        "routeRegistry", "/m/user-management/institutions?kind=stakeholder"),
                Map.of(
                        "path", "area",
                        "registry", "geography",
                        "titleEn", "Regions, districts and LGAs",
                        "titleSw", "Mikoa, wilaya na halmashauri",
                        "whereGoverned", "System Settings → Location management + Institution Registry (LGA/Regional)",
                        "whereReport", "Monitoring & Evaluation → Data Workbench → Region / District / LGA",
                        "meLevel", "region|district|council",
                        "who", "RAS, DAS, DED and area disaster committees",
                        "routeWorkbench", "/m/monitoring-evaluation/workbench?level=region",
                        "routeRegistry", "/m/user-management/institutions?kind=agency&institutionClass=Local%20Government%20Authority"));
    }

    private List<Map<String, Object>> classBreakdown() {
        return jdbc.queryForList("""
                select kind, institution_class as "institutionClass", count(*) as total,
                       count(*) filter (where coalesce(me_required,false)) as "meRequired",
                       count(*) filter (where policy_role_code is not null) as "withPolicyRole"
                from (""" + unionSql() + """
                ) x
                where coalesce(is_active,true)
                group by kind, institution_class
                order by kind, total desc, institution_class
                """);
    }

    private List<Map<String, Object>> classes() {
        return jdbc.queryForList("""
                select kind, institution_class as "institutionClass", count(*) as total
                from (""" + unionSql() + """
                ) x
                where institution_class is not null
                group by kind, institution_class
                order by kind, total desc, institution_class
                """);
    }

    private List<Map<String, Object>> sources() {
        return jdbc.queryForList("""
                select source_register as "sourceRegister", count(*) as total
                from (""" + unionSql() + """
                ) x
                where source_register is not null
                group by source_register
                order by total desc, source_register
                """);
    }

    private List<Map<String, Object>> policyRoles() {
        return jdbc.queryForList("""
                select role_code as "roleCode", actor_label_en as "actorLabelEn",
                       actor_label_sw as "actorLabelSw", institution_class as "institutionClass",
                       sector_tags as "sectorTags", responsibility_en as "responsibilityEn",
                       responsibility_sw as "responsibilitySw", default_indicator_codes as "defaultIndicatorCodes",
                       source_reference as "sourceReference"
                from public.institution_policy_roles
                where coalesce(active,true)
                order by role_code
                """);
    }

    private List<Map<String, Object>> glossary() {
        return jdbc.queryForList("""
                select term_en as "termEn", term_sw as "termSw", definition_en as "definitionEn",
                       definition_sw as "definitionSw", source_reference as "sourceReference"
                from public.disaster_glossary_terms
                where coalesce(active,true)
                order by term_en
                """);
    }

    private List<Map<String, Object>> duplicates() {
        return jdbc.queryForList("""
                with registry as (
                """ + unionSql() + """
                ), keyed as (
                    select kind, id, name,
                           lower(regexp_replace(name, '[^[:alnum:]]+', ' ', 'g')) as normalized
                    from registry
                )
                select normalized, count(*) as total, string_agg(kind || ':' || id || ':' || name, ' | ' order by kind, name) as members
                from keyed
                where normalized <> ''
                group by normalized
                having count(*) > 1
                order by total desc, normalized
                limit 25
                """);
    }

    /**
     * Unified projection. Column names are intentionally mostly un-aliased snake_case so
     * Spring's Map keys match what the Angular registry already binds (institution_class, …).
     * Aggregation queries above alias to camelCase for the meta panels only.
     */
    private String unionSql() {
        return """
                select 'agency' as kind, id, name, acronym, agency_type as type,
                       institution_class, institution_subclass, sector_tags, me_required,
                       source_register, source_file, source_sheet, source_row, source_reference,
                       policy_role_code, role_summary, is_active,
                       contact_person_name, contact_person_email, contact_person_phone,
                       office_address as address, website
                  from public.agencies
                union all
                select 'stakeholder' as kind, id, coalesce(organization, name) as name, null::varchar as acronym,
                       type, institution_class, institution_subclass, sector_tags, me_required,
                       source_register, source_file, source_sheet, source_row, source_reference,
                       policy_role_code, role_summary, is_active,
                       contact_person_name, contact_person_email, contact_person_phone,
                       address, null::varchar as website
                  from public.stakeholders
                """;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }
}
