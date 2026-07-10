package tz.go.pmo.dmis.settings;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/**
 * Unified System Settings view over agencies + stakeholders. Agencies remain the login/sector-control registry
 * for MDAs; stakeholders remain the partner portal registry. This endpoint provides the governance layer across
 * both: class, sector tags, source provenance, policy role and M&E obligation.
 */
@RestController
@RequestMapping("/v1/settings/institutions")
@RequiredArgsConstructor
@Tag(name = "System Settings", description = "Unified institution/stakeholder registry")
public class InstitutionRegistryController {

    private final JdbcTemplate jdbc;

    public record ClassificationRequest(String institutionClass, String institutionSubclass, String sectorTags,
                                        Boolean meRequired, String policyRoleCode, String roleSummary,
                                        String sourceReference) {
    }

    /** Full profile edit from System Settings (names, contacts, class, active flag, M&E fields). */
    public record InstitutionProfileRequest(
            String name,
            String acronym,
            String type,
            String institutionClass,
            String institutionSubclass,
            String sectorTags,
            String policyRoleCode,
            String roleSummary,
            String sourceReference,
            String contactPersonName,
            String contactPersonEmail,
            String contactPersonPhone,
            String address,
            String website,
            Boolean meRequired,
            Boolean isActive) {
    }

    @GetMapping
    @Operation(summary = "Unified institution registry with provenance, classes and policy roles")
    @PreAuthorize("hasAuthority('user_management.view')")
    public Map<String, Object> index(@RequestParam(required = false) String kind,
                                     @RequestParam(required = false) String institutionClass,
                                     @RequestParam(required = false) String sector,
                                     @RequestParam(required = false) String source,
                                     @RequestParam(required = false) String search,
                                     @RequestParam(defaultValue = "500") int limit) {
        List<Object> args = new ArrayList<>();
        StringBuilder where = new StringBuilder(" where 1=1");
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
        return Map.of(
                "stats", stats(),
                "classes", classes(),
                "sources", sources(),
                "policyRoles", policyRoles(),
                "glossary", glossary(),
                "duplicates", duplicates(),
                "reportingPaths", reportingPaths(),
                "classBreakdown", classBreakdown(),
                "items", jdbc.queryForList("""
                        select *
                        from (""" + unionSql() + """
                        ) x
                        """ + where + "\n order by kind, coalesce(institution_class,'zz'), name limit ?", args.toArray()));
    }

    @PutMapping("/{kind}/{id}/classification")
    @Operation(summary = "Update institution governance fields (class, policy role, M&E flag)")
    @PreAuthorize("hasAuthority('user_management.manage')")
    @Transactional
    public Map<String, Object> updateClassification(@PathVariable String kind, @PathVariable long id,
                                                    @RequestBody ClassificationRequest req) {
        assertKind(kind);
        int n = jdbc.update("""
                update """ + table(kind) + """
                   set institution_class = coalesce(?, institution_class),
                       institution_subclass = coalesce(?, institution_subclass),
                       sector_tags = coalesce(?, sector_tags),
                       me_required = coalesce(?, me_required),
                       policy_role_code = coalesce(?, policy_role_code),
                       role_summary = coalesce(?, role_summary),
                       source_reference = coalesce(?, source_reference),
                       updated_at = now()
                 where id = ?
                """, blankToNull(req.institutionClass()), blankToNull(req.institutionSubclass()),
                blankToNull(req.sectorTags()), req.meRequired(), blankToNull(req.policyRoleCode()),
                blankToNull(req.roleSummary()), blankToNull(req.sourceReference()), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Institution not found.");
        }
        return Map.of("kind", kind, "id", id, "message", "Institution governance updated");
    }

    @PutMapping("/{kind}/{id}")
    @Operation(summary = "Full institution profile update (name, contacts, class, active, M&E)")
    @PreAuthorize("hasAuthority('user_management.manage')")
    @Transactional
    public Map<String, Object> updateProfile(@PathVariable String kind, @PathVariable long id,
                                             @RequestBody InstitutionProfileRequest req) {
        assertKind(kind);
        if (req.name() != null && req.name().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name cannot be blank.");
        }
        int n;
        if ("agency".equals(kind)) {
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

    @GetMapping("/{kind}/{id}")
    @Operation(summary = "Get one institution for editing")
    @PreAuthorize("hasAuthority('user_management.view')")
    public Map<String, Object> one(@PathVariable String kind, @PathVariable long id) {
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
     * Clear M&E reporting paths so operators know: MDAs use agency workbench;
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
