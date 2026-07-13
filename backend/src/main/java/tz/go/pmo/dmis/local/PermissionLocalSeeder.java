package tz.go.pmo.dmis.local;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Seeds the Roles &amp; Permissions model (V44): a permission catalogue grouped by the system's
 * functional areas, plus the role→permission policy (who-can-do-what) for the 13 SRS roles.
 *
 * <p>The catalogue mirrors the real modules so the matrix screen is a faithful map of the whole
 * system; the policy follows the SRS division of labour (EOCC runs operations, DC/RAS approve at
 * their level, Director/Secretary lead, ICT Admin runs settings). Idempotent — permissions upsert
 * by name, assignments by composite key. Role descriptions are filled in too.</p>
 */
@Component
@Profile("local")
@Order(26)
@RequiredArgsConstructor
public class PermissionLocalSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(PermissionLocalSeeder.class);

    private final JdbcTemplate jdbc;

    /** Functional area → its actions. The order here is the order the matrix renders. */
    private static final Map<String, List<String>> CATALOGUE = buildCatalogue();
    private static final Map<String, String> LABEL_OVERRIDES = buildLabelOverrides();

    private static Map<String, List<String>> buildCatalogue() {
        Map<String, List<String>> c = new LinkedHashMap<>();
        c.put("Prevention & Mitigation", List.of("view", "manage"));
        c.put("Prevention Dashboard", List.of("view"));
        c.put("Hazards", List.of("view", "manage"));
        c.put("Mitigation Measures", List.of("view", "manage"));
        c.put("Risk Assessment", List.of("view", "create", "approve"));
        c.put("Strategic Infrastructure", List.of("view", "manage"));
        c.put("Risk Mapping", List.of("view"));
        c.put("Risk Index", List.of("view", "create", "approve"));
        c.put("Early Warning", List.of("view", "create", "disseminate", "approve"));
        c.put("Preparedness", List.of("view", "manage"));
        c.put("Incidents", List.of("view", "create", "update", "comment", "approve", "close", "publish"));
        c.put("Budget & Finance", List.of("view", "manage", "approve", "disburse"));
        c.put("Resource Allocation", List.of("view", "request", "approve", "dispatch"));
        c.put("Stakeholders", List.of("view", "manage"));
        c.put("Warehouse & Stock", List.of("view", "manage", "view_national"));
        c.put("Damage Assessment", List.of("view", "create", "key_section", "verify"));
        c.put("Tasks", List.of("view", "manage"));
        c.put("Communication & Alerts", List.of("view", "send"));
        c.put("Command Post", List.of("view", "activate", "posture"));
        c.put("Anticipatory Action Plans", List.of("view", "create", "approve"));
        c.put("Contingency Plans", List.of("view", "manage", "approve"));
        c.put("Disaster Declarations", List.of("view", "propose", "declare", "review", "endorse"));
        c.put("One Health", List.of("view", "manage", "disseminate", "approve", "acknowledge", "directive"));
        c.put("Recovery", List.of("view", "manage"));
        c.put("Disaster Repository", List.of("view", "enter"));
        c.put("Reports & Analytics", List.of("view"));
        c.put("Monitoring & Evaluation", List.of("view", "enter", "manage"));
        c.put("Stakeholder Portal", List.of("view", "donate"));
        c.put("Content Management", List.of("view", "manage"));
        c.put("User Management", List.of("view", "manage"));
        c.put("Roles & Permissions", List.of("view", "manage"));
        c.put("Location Management", List.of("view", "manage"));
        c.put("Resource Catalogue", List.of("view", "manage"));
        c.put("Approval Workflows", List.of("view", "manage"));
        c.put("Translations", List.of("view", "manage"));
        return c;
    }

    private static Map<String, String> buildLabelOverrides() {
        return Map.ofEntries(
                Map.entry("anticipatory_action_plans.view", "View stakeholder-facing anticipatory plans"),
                Map.entry("anticipatory_action_plans.create", "Create or edit anticipatory plans"),
                Map.entry("anticipatory_action_plans.approve", "Approve anticipatory plans"),
                Map.entry("contingency_plans.view", "View stakeholder-facing contingency plans"),
                Map.entry("contingency_plans.manage", "Create or edit contingency plans"),
                Map.entry("contingency_plans.approve", "Approve contingency plans"),
                Map.entry("reports_and_analytics.view", "View Sendai Analytics and GIS Map"),
                Map.entry("monitoring_evaluation.view", "View Monitoring & Evaluation dashboard"),
                Map.entry("monitoring_evaluation.enter", "Enter Monitoring & Evaluation values"),
                Map.entry("monitoring_evaluation.manage", "Manage Monitoring & Evaluation indicators"),
                Map.entry("stakeholder_portal.view", "Access Stakeholder Portal"),
                Map.entry("stakeholder_portal.donate", "Use partner donation and support-pledge pages"),
                Map.entry("prevention_and_mitigation.view", "Open Prevention & Mitigation shell"),
                Map.entry("prevention_dashboard.view", "View prevention dashboard"),
                Map.entry("hazards.view", "View hazard registry and Hazard Monitor"),
                Map.entry("hazards.manage", "Manage hazard registry and Hazard Monitor"),
                Map.entry("mitigation_measures.view", "View mitigation measures"),
                Map.entry("mitigation_measures.manage", "Manage mitigation measures"),
                Map.entry("risk_assessment.view", "View risk assessments"),
                Map.entry("risk_assessment.create", "Create or edit risk assessments"),
                Map.entry("risk_assessment.approve", "Approve or publish risk assessments"),
                Map.entry("strategic_infrastructure.view", "View strategic infrastructure"),
                Map.entry("strategic_infrastructure.manage", "Manage strategic infrastructure"),
                Map.entry("risk_mapping.view", "View risk mapping and GIS layers"),
                Map.entry("risk_index.view", "View INFORM Risk Index"),
                Map.entry("risk_index.create", "Submit sector INFORM values"),
                Map.entry("risk_index.approve", "Approve INFORM values"),
                Map.entry("disaster_repository.view", "View disaster repository records"),
                Map.entry("disaster_repository.enter", "Enter Disaster Repository event cards"),
                Map.entry("incidents.view", "View incidents and incident reports"),
                Map.entry("resource_allocation.view", "View resource allocation and reports"),
	                Map.entry("damage_assessment.view", "View DLNA registry and generated reports"),
	                Map.entry("damage_assessment.key_section", "Key assigned sector DLNA sections"),
	                Map.entry("early_warning.view", "View issued alerts and EW reports"),
	                Map.entry("user_management.view", "View users and partner agency registry"),
	                Map.entry("user_management.manage", "Manage users and partner agencies"),
	                Map.entry("translations.view", "View bilingual translations"),
	                Map.entry("translations.manage", "Manage bilingual translations"),
	                Map.entry("content_management.view", "View public portal, news and QR controls"),
	                Map.entry("content_management.manage", "Manage public portal, news and QR outreach"),
                Map.entry("one_health.disseminate", "Manage One Health disseminations"),
                Map.entry("one_health.approve", "Approve One Health disseminations"),
                Map.entry("one_health.manage", "Administer One Health PMO desk"),
                Map.entry("one_health.acknowledge", "Acknowledge assigned One Health dissemination"));
    }

    /**
     * Role → policy. "*" = all permissions; "*|view" = the view action of every module;
     * "Module|*" = every action of one module; "Module|action" = one cell.
     */
    private static final Map<String, List<String>> POLICY = buildPolicy();

    private static Map<String, List<String>> buildPolicy() {
        Map<String, List<String>> p = new LinkedHashMap<>();
        p.put("Super Admin", List.of("*"));
        p.put("ICT Admin", List.of("*|view", "User Management|*", "Roles & Permissions|*",
                "Location Management|*", "Resource Catalogue|*", "Approval Workflows|*",
                "Content Management|*", "Translations|*", "Disaster Repository|enter",
                "Monitoring & Evaluation|manage", "One Health|manage", "One Health|disseminate"));
        p.put("Secretary", List.of("*|view", "Incidents|approve", "Resource Allocation|approve",
                "Disaster Declarations|declare", "Disaster Declarations|propose", "Command Post|activate",
                "Approval Workflows|manage", "One Health|directive"));
        p.put("Director", List.of("*|view", "Hazards|manage", "Mitigation Measures|manage",
                "Strategic Infrastructure|manage", "Risk Assessment|create", "Risk Assessment|approve",
                "Risk Index|approve", "Incidents|approve", "Incidents|close",
                "Resource Allocation|approve", "Anticipatory Action Plans|approve",
                "Damage Assessment|verify", "Disaster Repository|enter",
                "Disaster Declarations|propose", "Disaster Declarations|declare", "Command Post|activate",
                "Command Post|posture", "Early Warning|approve", "Location Management|manage",
                "Resource Catalogue|manage", "Approval Workflows|manage", "Monitoring & Evaluation|manage", "One Health|manage",
                "One Health|disseminate", "One Health|approve", "One Health|directive"));
        p.put("Asst. Director", List.of("*|view", "Hazards|manage", "Mitigation Measures|manage",
                "Strategic Infrastructure|manage", "Risk Assessment|create", "Risk Assessment|approve",
                "Incidents|approve", "Resource Allocation|approve",
                "Anticipatory Action Plans|approve", "Damage Assessment|verify", "Command Post|activate",
                "Command Post|posture", "Disaster Repository|enter",
                "Resource Catalogue|manage", "Monitoring & Evaluation|manage", "One Health|manage", "One Health|disseminate",
                "One Health|approve", "One Health|directive"));
        p.put("EOCC", List.of("*|view", "Hazards|manage", "Mitigation Measures|manage",
                "Strategic Infrastructure|manage", "Risk Assessment|create", "Risk Assessment|approve",
                "Risk Index|create", "Incidents|create", "Incidents|update", "Resource Allocation|request",
                "Resource Allocation|dispatch", "Warehouse & Stock|manage", "Damage Assessment|create",
                "Damage Assessment|verify", "Tasks|manage", "Communication & Alerts|send", "Command Post|activate",
                "Command Post|posture", "Anticipatory Action Plans|create", "Disaster Repository|enter",
                "Early Warning|create", "Early Warning|disseminate",
                "Resource Catalogue|manage", "Monitoring & Evaluation|manage", "One Health|manage", "One Health|disseminate",
                "One Health|approve", "One Health|directive"));
        p.put("Reg DC", List.of("*|view", "Incidents|approve", "Tasks|manage", "Damage Assessment|verify",
                "Resource Allocation|request", "Monitoring & Evaluation|enter"));
        p.put("RAS", List.of("*|view", "Incidents|approve", "Tasks|manage", "Damage Assessment|verify",
                "Monitoring & Evaluation|enter"));
        p.put("RC", List.of("*|view", "Incidents|comment", "Monitoring & Evaluation|enter"));
        p.put("Regional Planning Officer", List.of("*|view", "Incidents|comment", "Monitoring & Evaluation|enter"));
        p.put("Regional Logistic Officer", List.of("*|view", "Resource Allocation|dispatch",
                "Warehouse & Stock|manage", "Monitoring & Evaluation|enter"));
        p.put("Dist DC", List.of("*|view", "Incidents|create", "Incidents|update", "Incidents|approve",
                "Incidents|comment", "Tasks|manage",
                "Damage Assessment|create", "Resource Allocation|request",
                "Warehouse & Stock|view", "Monitoring & Evaluation|enter"));
        // DED owns waiting_ded — approve + comment. DAS is adviser (view+comment), not an incident stage owner.
        p.put("DED", List.of("*|view", "Incidents|approve", "Incidents|comment",
                "Resource Allocation|request", "Warehouse & Stock|view", "Monitoring & Evaluation|enter"));
        p.put("DAS", List.of("*|view", "Incidents|comment", "Tasks|manage",
                "Damage Assessment|create", "Warehouse & Stock|view", "Monitoring & Evaluation|enter"));
        p.put("District Commissioner", List.of("*|view", "Incidents|comment", "Monitoring & Evaluation|enter"));
        p.put("District Planning Officer", List.of("*|view", "Incidents|comment", "Monitoring & Evaluation|enter"));
        p.put("District Logistic Officer", List.of("*|view", "Resource Allocation|dispatch",
                "Warehouse & Stock|manage", "Monitoring & Evaluation|enter"));
        p.put("Comms Officer", List.of("*|view", "Communication & Alerts|send", "Content Management|manage",
                "Early Warning|disseminate", "Translations|manage", "One Health|disseminate"));
        p.put("MDA Focal", List.of("Prevention & Mitigation|view", "Risk Index|view", "Risk Index|create",
                "Early Warning|view", "Early Warning|create",
                "Damage Assessment|view", "Damage Assessment|key_section",
                "Monitoring & Evaluation|view", "Monitoring & Evaluation|enter",
                "One Health|view", "One Health|acknowledge"));
        p.put("Partners", List.of("Stakeholder Portal|view", "Stakeholder Portal|donate",
                "Anticipatory Action Plans|view", "Contingency Plans|view",
                "Reports & Analytics|view"));
        return p;
    }

    @Override
    public void run(String... args) {
        seedCatalogue();
        seedRoleDescriptions();
        seedRoleMetadata();
        assignPolicy();
    }

    private void seedCatalogue() {
        CATALOGUE.forEach((module, actions) -> {
            for (String action : actions) {
                String name = slug(module) + "." + action;
                String label = LABEL_OVERRIDES.getOrDefault(name, cap(action) + " - " + module);
                jdbc.update("insert into public.permissions(name, module, action, label, guard_name,"
                                + " created_at, updated_at) values (?,?,?,?, 'web', now(), now())"
                                + " on conflict (name) do nothing",
                        name, module, action, label);
            }
        });
        Long n = jdbc.queryForObject("select count(*) from public.permissions", Long.class);
        log.info("permission catalogue seeded: {} permissions across {} areas", n, CATALOGUE.size());
    }

    private void seedRoleDescriptions() {
        Map<String, String> d = new LinkedHashMap<>();
        d.put("Super Admin", "Full system access — all modules and settings.");
        d.put("ICT Admin", "System administration: users, roles, locations, catalogue, content.");
        d.put("Secretary", "Permanent Secretary — executive oversight, approvals and declarations.");
        d.put("Director", "Director DMD — operational leadership, approvals, declarations, validation.");
        d.put("Asst. Director", "Assistant Director — operational approvals and command-post leadership.");
        d.put("EOCC", "Emergency Operations Command Centre — runs operations across the response cycle.");
        d.put("Reg DC", "Regional Disaster Coordinator — regional approvals and coordination.");
        d.put("RAS", "Regional Administrative Secretary — regional approval authority.");
        d.put("Dist DC", "District Disaster Coordinator — district incident reporting and tasks.");
        d.put("DAS", "District Administrative Secretary — district leadership; incident view/comment (DED owns district approval stage).");
        d.put("Comms Officer", "Communications — alert dissemination and public content.");
        d.put("MDA Focal", "Sector / MDA focal point — One Health and sectoral coordination.");
        d.put("Partners", "Stakeholders & partners — scoped read access to planning and public analytics.");
        d.forEach((role, desc) -> jdbc.update(
                "update public.roles set description = ? where name = ? and description is null", desc, role));
    }

    private void seedRoleMetadata() {
        jdbc.update("""
                with meta(name, category, scope_level, sort_order, incident_stage, is_incident_flow, is_area_scoped, assignment_hint) as (
                    values
                        ('Super Admin', 'System Administration', 'system', 10, null, false, false, 'Full platform administration and break-glass access.'),
                        ('ICT Admin', 'System Administration', 'system', 20, null, false, false, 'System setup, users, roles, settings and technical administration.'),
                        ('Secretary', 'National Command', 'national', 100, 'waiting_ps', true, false, 'Permanent Secretary stage of the national incident approval chain.'),
                        ('Director', 'National Command', 'national', 110, 'waiting_director', true, false, 'Director DMD stage of the national incident approval chain.'),
                        ('Asst. Director', 'National Command', 'national', 120, null, true, false, 'National operations and oversight support.'),
                        ('EOCC', 'National Operations', 'national', 200, 'waiting_eocc', true, false, 'National operations desk for incident escalation and coordination.'),
                        ('Comms Officer', 'National Operations', 'national', 210, null, false, false, 'Public communications, alerts, translations and outreach.'),
                        ('Reg DC', 'Regional Incident Flow', 'regional', 300, 'waiting_rdmc', true, true, 'Requires a region attachment; owns the RDMC incident stage for that region.'),
                        ('RAS', 'Regional Incident Flow', 'regional', 310, 'waiting_ras', true, true, 'Requires a region attachment; owns the RAS incident stage for that region.'),
                        ('RC', 'Regional Incident Flow', 'regional', 320, null, true, true, 'Requires a region attachment; regional incident oversight and advisory view.'),
                        ('Regional Planning Officer', 'Regional Incident Flow', 'regional', 330, null, true, true, 'Requires a region attachment; advisory planning role for regional incidents.'),
                        ('Regional Logistic Officer', 'Regional Incident Flow', 'regional', 340, null, true, true, 'Requires a region attachment; regional logistics and dispatch support.'),
                        ('Dist DC', 'District Incident Flow', 'district', 400, 'waiting_ddmc', true, true, 'Requires a district attachment; owns the DDMC district entry gate.'),
                        ('DED', 'District Incident Flow', 'district', 410, 'waiting_ded', true, true, 'Requires a district attachment; owns the DED district approval stage.'),
                        ('DAS', 'District Incident Flow', 'district', 420, null, true, true, 'Requires a district attachment; district leadership notifications and support.'),
                        ('District Commissioner', 'District Incident Flow', 'district', 430, null, true, true, 'Requires a district attachment; district incident oversight and advisory view.'),
                        ('District Planning Officer', 'District Incident Flow', 'district', 440, null, true, true, 'Requires a district attachment; advisory planning role for district incidents.'),
                        ('District Logistic Officer', 'District Incident Flow', 'district', 450, null, true, true, 'Requires a district attachment; district logistics and dispatch support.'),
                        ('MDA Focal', 'Sector / Agency', 'sector', 500, null, false, false, 'Requires an agency attachment; sector data entry and response contribution.'),
                        ('Partners', 'Stakeholder / Partner', 'stakeholder', 600, null, false, false, 'Requires a linked stakeholder organisation for partner self-service.')
                )
                update public.roles r
                set category = meta.category,
                    scope_level = meta.scope_level,
                    sort_order = meta.sort_order,
                    incident_stage = meta.incident_stage,
                    is_incident_flow = meta.is_incident_flow,
                    is_area_scoped = meta.is_area_scoped,
                    assignment_hint = meta.assignment_hint,
                    updated_at = now()
                from meta
                where r.name = meta.name
                """);
    }

    private void assignPolicy() {
        int assigned = 0;
        for (Map.Entry<String, List<String>> entry : POLICY.entrySet()) {
            Long roleId = roleId(entry.getKey());
            if (roleId == null) {
                continue; // role not seeded yet (ordering) — picked up on a later run
            }
            // Seed the default policy ONLY for a role that has no permissions yet (fresh install). A role
            // already configured — by a previous seed or by an admin in User Management → Roles & Permissions
            // — is left untouched, so permission changes (incl. least-privilege tightening) survive restarts.
            Long existing = jdbc.queryForObject(
                    "select count(*) from public.role_has_permissions where role_id = ?", Long.class, roleId);
            if (existing != null && existing > 0) {
                continue;
            }
            for (String rule : entry.getValue()) {
                assigned += applyRule(roleId, rule);
            }
        }
        if (assigned > 0) {
            log.info("role→permission policy applied: {} assignments (only roles with no prior permissions)", assigned);
        }
    }

    /** Resolve a policy rule to permission ids and grant them to the role (idempotent). */
    private int applyRule(long roleId, String rule) {
        List<Long> permIds;
        if ("*".equals(rule)) {
            permIds = jdbc.queryForList("select id from public.permissions", Long.class);
        } else if (rule.startsWith("*|")) {
            permIds = jdbc.queryForList("select id from public.permissions where action = ?", Long.class,
                    rule.substring(2));
        } else if (rule.endsWith("|*")) {
            permIds = jdbc.queryForList("select id from public.permissions where module = ?", Long.class,
                    rule.substring(0, rule.length() - 2));
        } else {
            String[] parts = rule.split("\\|", 2);
            permIds = parts.length == 2
                    ? jdbc.queryForList("select id from public.permissions where module = ? and action = ?",
                            Long.class, parts[0], parts[1])
                    : List.of();
        }
        int n = 0;
        for (Long pid : permIds) {
            n += jdbc.update("insert into public.role_has_permissions(permission_id, role_id) values (?,?)"
                    + " on conflict do nothing", pid, roleId);
        }
        return n;
    }

    private Long roleId(String name) {
        List<Long> ids = jdbc.queryForList("select id from public.roles where name = ?", Long.class, name);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private static String slug(String module) {
        return module.toLowerCase().replaceAll("&", "and").replaceAll("[^a-z0-9]+", "_").replaceAll("^_|_$", "");
    }

    private static String cap(String s) {
        String spaced = s.replace('_', ' ');
        return spaced.isEmpty() ? spaced : Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
    }
}
