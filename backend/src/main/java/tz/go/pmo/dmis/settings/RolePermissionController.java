package tz.go.pmo.dmis.settings;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * System Settings → Roles &amp; Permissions. Captures the access model that ties everything together:
 * users hold roles ({@code model_has_roles}); roles hold permissions ({@code role_has_permissions})
 * across the system's functional areas (V44 catalogue). The matrix here is the single place the
 * who-can-do-what policy is governed.
 *
 * <p>The Spring backend consumes those permission grants as authorities for module and action gates
 * ({@code hasAuthority('module.action')}). Named roles still matter for workflow ladders and area
 * attachment, but the operational capability surface is this matrix. Guard rails keep the Super Admin
 * role intact and stop deletion of a role still held by users.</p>
 */
@RestController
@RequestMapping("/v1/settings/roles")
@Tag(name = "Settings: Roles & Permissions", description = "Roles, the permission catalogue and the matrix")
@RequiredArgsConstructor
public class RolePermissionController {

    private static final String CAN_WRITE = "hasAuthority('roles_and_permissions.manage')";

    private final JdbcTemplate jdbc;

    /** Roles with user + permission counts (the registry). */
    @GetMapping
    @Operation(summary = "Roles + user/permission counts + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        List<Map<String, Object>> roles = jdbc.queryForList(
                "select r.id, r.name, r.description,"
                        + " coalesce(r.category, 'Other') as category,"
                        + " coalesce(r.scope_level, 'system') as \"scopeLevel\","
                        + " coalesce(r.sort_order, 500) as \"sortOrder\","
                        + " r.incident_stage as \"incidentStage\","
                        + " r.assignment_hint as \"assignmentHint\","
                        + " coalesce(r.is_incident_flow, false) as \"isIncidentFlow\","
                        + " coalesce(r.is_area_scoped, false) as \"isAreaScoped\","
                        + " (select count(*) from public.model_has_roles m where m.role_id = r.id) as \"userCount\","
                        + " (select count(*) from public.role_has_permissions rp where rp.role_id = r.id) as \"permissionCount\""
                        + " from public.roles r order by coalesce(r.sort_order, 500), r.name");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("roles", roles);
        out.put("roleGroups", RoleCatalogue.groups(roles));
        out.put("stats", jdbc.queryForMap(
                "select (select count(*) from public.roles) as roles,"
                        + " (select count(*) from public.permissions) as permissions,"
                        + " (select count(*) from public.role_has_permissions) as assignments"));
        return out;
    }

    /** The permission catalogue grouped by functional area — the matrix columns. */
    @GetMapping("/catalogue")
    @Operation(summary = "Permission catalogue grouped by module")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> catalogue() {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, name, module, action, label from public.permissions order by module, id");
        List<Map<String, Object>> groups = new ArrayList<>();
        Map<String, List<Map<String, Object>>> byModule = new LinkedHashMap<>();
        for (Map<String, Object> r : rows) {
            String name = String.valueOf(r.get("name"));
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("id", r.get("id"));
            p.put("name", name);
            p.put("action", r.get("action"));
            p.put("label", r.get("label"));
            String hint = permissionHint(name);
            if (hint != null) {
                p.put("hint", hint);
            }
            byModule.computeIfAbsent(String.valueOf(r.get("module")), k -> new ArrayList<>()).add(p);
        }
        byModule.forEach((module, perms) -> {
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("module", module);
            g.put("permissions", perms);
            String note = moduleNote(module);
            if (note != null) {
                g.put("note", note);
            }
            groups.add(g);
        });
        return Map.of("catalogue", groups, "controlMap", controlMap());
    }

    /** One role with the set of permission ids it holds (drives the matrix checkboxes). */
    @GetMapping("/{id}")
    @Operation(summary = "Role + its permission ids")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> show(@PathVariable long id) {
        Map<String, Object> role = role(id);
        role.put("permissionIds", jdbc.queryForList(
                "select permission_id from public.role_has_permissions where role_id = ?", Long.class, id));
        return Map.of("role", role);
    }

    @PostMapping
    @Operation(summary = "Create a role")
    @ResponseStatus(HttpStatus.CREATED)
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> create(@RequestBody Map<String, Object> req) {
        String name = req(req, "name");
        Long dup = jdbc.queryForObject("select count(*) from public.roles where name = ?", Long.class, name);
        if (dup != null && dup > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A role with that name already exists");
        }
        // Self-heal roles_id_seq — the legacy seeder inserted roles with explicit ids without
        // bumping it, so a fresh insert can collide on the pkey. Advance past max(id).
        jdbc.queryForList("select setval(pg_get_serial_sequence('public.roles','id'), m)"
                + " from (select max(id) m from public.roles) s where m is not null");
        Long id = jdbc.queryForObject(
                "insert into public.roles(name, guard_name, description, category, scope_level, sort_order,"
                        + " incident_stage, assignment_hint, is_incident_flow, is_area_scoped, created_at, updated_at)"
                        + " values (?, 'web', ?, ?, ?, ?, ?, ?, ?, ?, now(), now()) returning id",
                Long.class, name, str(req.get("description")), roleCategory(req),
                roleScope(req), intOf(req.get("sortOrder"), 500), str(req.get("incidentStage")),
                str(req.get("assignmentHint")), bool(req.get("isIncidentFlow")),
                bool(req.get("isAreaScoped")));
        return Map.of("id", id, "message", "Role created");
    }

    @PutMapping("/{id}")
    @Operation(summary = "Rename a role / edit its metadata")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> req) {
        Map<String, Object> current = role(id);
        String category = req.containsKey("category") ? roleCategory(req) : str(current.get("category"));
        String scope = req.containsKey("scopeLevel") ? roleScope(req) : str(current.get("scopeLevel"));
        Integer sortOrder = req.containsKey("sortOrder")
                ? intOf(req.get("sortOrder"), 500)
                : intOf(current.get("sortOrder"), 500);
        String incidentStage = req.containsKey("incidentStage")
                ? str(req.get("incidentStage"))
                : str(current.get("incidentStage"));
        String assignmentHint = req.containsKey("assignmentHint")
                ? str(req.get("assignmentHint"))
                : str(current.get("assignmentHint"));
        Boolean incidentFlow = req.containsKey("isIncidentFlow")
                ? bool(req.get("isIncidentFlow"))
                : bool(current.get("isIncidentFlow"));
        Boolean areaScoped = req.containsKey("isAreaScoped")
                ? bool(req.get("isAreaScoped"))
                : bool(current.get("isAreaScoped"));
        jdbc.update("update public.roles set name = coalesce(?, name), description = ?,"
                        + " category = ?, scope_level = ?, sort_order = ?, incident_stage = ?,"
                        + " assignment_hint = ?, is_incident_flow = ?, is_area_scoped = ?, updated_at = now()"
                        + " where id = ?",
                str(req.get("name")), str(req.get("description")), category, scope, sortOrder,
                incidentStage, assignmentHint, incidentFlow, areaScoped, id);
        return Map.of("message", "Role updated");
    }

    /** Replace a role's permissions (the matrix save). */
    @PutMapping("/{id}/permissions")
    @Operation(summary = "Set a role's permissions")
    @Transactional
    @PreAuthorize(CAN_WRITE)
    @SuppressWarnings("unchecked")
    public Map<String, Object> setPermissions(@PathVariable long id, @RequestBody Map<String, Object> req) {
        role(id);
        List<Object> ids = req.get("permissionIds") instanceof List<?> list ? (List<Object>) list : List.of();
        jdbc.update("delete from public.role_has_permissions where role_id = ?", id);
        for (Object pid : ids) {
            jdbc.update("insert into public.role_has_permissions(permission_id, role_id) values (?,?)"
                    + " on conflict do nothing", Long.valueOf(String.valueOf(pid)), id);
        }
        // Invariant: granting any action in a module implies its .view — the ModuleGuardFilter requires
        // <module>.view to enter the module, so an action without view is a dead (unreachable) grant. Auto-add
        // the matching .view for every module this role now holds a permission in, so the matrix can't lie.
        jdbc.update("insert into public.role_has_permissions(permission_id, role_id)"
                + " select vp.id, ? from public.role_has_permissions rhp"
                + " join public.permissions p on p.id = rhp.permission_id"
                + " join public.permissions vp on vp.name = split_part(p.name,'.',1) || '.view'"
                + " where rhp.role_id = ? on conflict do nothing", id, id);
        Long count = jdbc.queryForObject("select count(*) from public.role_has_permissions where role_id = ?", Long.class, id);
        return Map.of("message", "Permissions updated", "count", count == null ? ids.size() : count);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a role (not Super Admin, not while held by users)")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public void delete(@PathVariable long id) {
        Map<String, Object> role = role(id);
        if ("Super Admin".equals(role.get("name"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "The Super Admin role cannot be deleted.");
        }
        Long users = jdbc.queryForObject(
                "select count(*) from public.model_has_roles where role_id = ?", Long.class, id);
        if (users != null && users > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This role is held by " + users + " user(s) — reassign them first.");
        }
        jdbc.update("delete from public.role_has_permissions where role_id = ?", id);
        jdbc.update("delete from public.roles where id = ?", id);
    }

    // ── helpers ──

    private Map<String, Object> role(long id) {
        Map<String, Object> row = RoleCatalogue.roleDetail(jdbc, id);
        if (row.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Role not found");
        }
        return new LinkedHashMap<>(row);
    }

    private static String req(Map<String, Object> m, String key) {
        String v = str(m.get(key));
        if (v == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " is required");
        }
        return v;
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static String roleCategory(Map<String, Object> req) {
        String category = str(req.get("category"));
        return category == null ? "Other" : category;
    }

    private static String roleScope(Map<String, Object> req) {
        String scope = str(req.get("scopeLevel"));
        return scope == null ? "system" : scope;
    }

    private static Integer intOf(Object v, int fallback) {
        if (v == null || String.valueOf(v).isBlank()) {
            return fallback;
        }
        return (int) Double.parseDouble(String.valueOf(v));
    }

    private static Boolean bool(Object v) {
        return v != null && Boolean.parseBoolean(String.valueOf(v));
    }

    private static String permissionHint(String name) {
        return switch (name) {
            case "anticipatory_action_plans.view" -> "Stakeholder planning read access";
            case "anticipatory_action_plans.create" -> "Create and edit anticipatory plans";
            case "anticipatory_action_plans.approve" -> "Approve or reject anticipatory plans";
            case "contingency_plans.view" -> "Stakeholder contingency read access";
            case "contingency_plans.manage" -> "Create and edit contingency plans";
            case "contingency_plans.approve" -> "Approve or reject contingency plans";
            case "reports_and_analytics.view" -> "Reports shell plus Sendai Analytics and GIS Map";
            case "stakeholder_portal.view" -> "Partner portal shell, issued alerts and partner-facing pages";
            case "stakeholder_portal.donate" -> "Partner Resource Donations and Fund a Measure/Training pages; linked partners act only as their own organisation";
            case "stakeholders.view" -> "Partner Directory read access";
            case "stakeholders.manage" -> "Register, link and activate partner organisations";
            case "roles_and_permissions.view" -> "Open the Roles & Permissions matrix";
            case "roles_and_permissions.manage" -> "Create roles and change role permission grants";
	            case "user_management.view" -> "Open the User Management and partner agency registries";
	            case "user_management.manage" -> "Create, edit, delete and reset user accounts; manage partner agencies";
            case "location_management.view" -> "Open regions, districts, councils and wards";
            case "location_management.manage" -> "Create, edit or delete administrative locations";
            case "resource_catalogue.view" -> "Open resource catalogue and incident type settings";
            case "resource_catalogue.manage" -> "Create, edit or delete resource and incident type settings";
            case "approval_workflows.view" -> "Open approval workflow settings";
            case "approval_workflows.manage" -> "Edit approval chains and workflow automation";
            case "translations.view" -> "Open bilingual portal/UI translations";
            case "translations.manage" -> "Create, edit or delete translations";
            case "prevention_and_mitigation.view" -> "Top-level shell; sub-pages use their own switches";
            case "prevention_dashboard.view" -> "Dashboard overview for prevention and mitigation indicators";
            case "hazards.view" -> "Hazard Management registry and Hazard Monitor read access";
            case "hazards.manage" -> "Create, edit, activate or delete hazards and threat-monitor entries";
            case "mitigation_measures.view" -> "Mitigation Measures registry read access";
            case "mitigation_measures.manage" -> "Create, edit or delete mitigation measures";
            case "risk_assessment.view" -> "Risk Assessments registry and detail read access";
            case "risk_assessment.create" -> "Create, edit or delete risk assessments";
            case "risk_assessment.approve" -> "Approve and publish risk assessments";
            case "strategic_infrastructure.view" -> "Strategic Infrastructure registry read access";
            case "strategic_infrastructure.manage" -> "Create, edit or delete infrastructure records";
            case "risk_mapping.view" -> "Prevention Risk Mapping and GIS layers";
            case "risk_index.view" -> "INFORM map, registry and analytics";
            case "risk_index.create" -> "Sector data entry and multi-area paste; agency users are locked to their own owner";
            case "risk_index.approve" -> "PMO approval queue for pending INFORM values";
            case "disaster_repository.view" -> "Past-disaster repository read access";
            case "disaster_repository.enter" -> "Disaster Repository event cards and data entry";
            case "incidents.view" -> "Incident registry, detail and incident reports";
            case "resource_allocation.view" -> "Resource request queues, Open Needs, form data and deployment track — incident-area scoped";
            case "resource_allocation.request" -> "Raise resource requests against approved/active incidents; source warehouse auto-matches incident district/region";
            case "resource_allocation.approve" -> "Approve/reject allocation requests and set fulfilment source warehouse";
            case "resource_allocation.dispatch" -> "Dispatch lifecycle: In Transit → Deployed → Delivered / Returned with stock journal";
            case "warehouse_and_stock.view" -> "Warehouses, temporary stores and stock ledgers — area-scoped by user region/district; national/shared stores need view_national";
            case "warehouse_and_stock.manage" -> "Create/edit warehouses and stock operations (intake, transfer, borrow). Area officers are force-stamped to their own region/district";
            case "warehouse_and_stock.view_national" -> "Widen warehouse lists to include national/zonal (null-area) stores in addition to the officer's own area";
            case "monitoring_evaluation.view" -> "M&E dashboard and data workbench (read); targets limited to identity scope";
            case "monitoring_evaluation.enter" -> "Enter period indicator values for your institution, region, district/LGA or stakeholder only";
            case "monitoring_evaluation.manage" -> "National M&E catalogue admin + approve values + full institution registry across all levels";
            case "damage_assessment.view" -> "DLNA registry and generated document reports";
            case "damage_assessment.key_section" -> "Sector/MDA Annex-1 section keying only";
            case "early_warning.view" -> "Issued alerts, EW management/reports, and PMO-DMD consolidated impact overlay (read)";
            case "early_warning.create" -> "Author/edit EW products and agency submissions on the native bus";
            case "early_warning.disseminate" -> "Push/disseminate EW products and PMO impact bulletin publish path";
            case "early_warning.approve" -> "Approve EW products / tasking returns in the PMO-entity workflow";
            case "communication_and_alerts.view" -> "Communication Center overview, audience picker and delivery logs";
            case "communication_and_alerts.send" -> "SMS/email compose and channel-test send controls";
            case "content_management.view" -> "Public portal/news/QR outreach read surface";
            case "content_management.manage" -> "Public portal/news/QR outreach publishing";
            case "one_health.disseminate" -> "One Health dissemination registry and send controls";
            case "one_health.approve" -> "One Health approval controls";
            case "one_health.manage" -> "One Health PMO/national desk administration";
            case "one_health.acknowledge" -> "Recipient acknowledgement only";
            default -> null;
        };
    }

    private static String moduleNote(String module) {
        return switch (module) {
            case "Reports & Analytics" -> "Grant this for Sendai Analytics and GIS Map; PMO-only report pages use their own switches.";
            case "Stakeholder Portal" -> "Core partner-facing portal access; donate enables Resource Donations and Fund a Measure/Training. Open Needs remains a PMO resource-allocation page.";
            case "Prevention & Mitigation" -> "Legacy module shell only. Navigation and actions are controlled by the sub-page permissions below.";
            case "Prevention Dashboard" -> "Overview-only dashboard for users who should not inherit the whole prevention module.";
            case "Hazards" -> "Use view for Hazard Management and Hazard Monitor read-only access; manage controls hazard and threat-monitor authoring.";
            case "Mitigation Measures", "Strategic Infrastructure" -> "Use view for navigation/read-only access and manage for create/edit/delete controls.";
            case "Risk Assessment" -> "Use view for the registry, create for authoring, and approve for the maker-checker step.";
            case "Risk Mapping" -> "Controls the Prevention Risk Mapping page; Reports GIS Map still follows Reports & Analytics.";
            case "Risk Index" -> "Use view for INFORM map/registry/analytics, create for sector data entry, and approve for PMO sign-off.";
            case "Disaster Repository" -> "Keep off for external stakeholders unless PMO wants repository data-entry access.";
            case "Anticipatory Action Plans", "Contingency Plans" -> "Use view for stakeholders; create/manage and approve remain internal workflow controls.";
            case "Communication & Alerts" -> "Use view for Communication Center overview/logs and send for SMS/email compose controls.";
	            case "User Management" -> "Use view for users and agency registry; manage controls user account and partner agency writes.";
	            case "Translations" -> "Bilingual UI and portal strings live under System Settings and use translations.*.";
	            case "Content Management" -> "Controls public portal administration, news/events, publications and QR outreach.";
            case "Damage Assessment" -> "Use key_section for sector contributors; create/verify/view are PMO/consolidation controls.";
            case "One Health" -> "Dissemination/approval/manage are PMO/national desk controls; acknowledge is recipient-only.";
            case "Warehouse & Stock" -> "Area-specific stores. Default: officers see only their region/district warehouses. Grant view_national to include shared national/zonal stores. manage writes stamp area for sub-national officers.";
            case "Resource Allocation" -> "Incident-linked request → approve → dispatch chain. Requests only against area-scoped incidents; preferred warehouse matches incident district then region. Without open incidents the UI is preparedness-only.";
            case "Monitoring & Evaluation" -> "Institution / region / district-LGA / stakeholder specific. enter binds to the login identity; manage is PMO national catalogue + approval. Credentials: attach users.agency_id, stakeholder_id, region_id, district_id, council_id in User Management.";
            case "Early Warning" -> "Entity agency bus + PMO-DMD consolidated impact. view = overlay/read; create = author; disseminate = push/publish impact bulletin; approve = tasking returns. Impact Analysis uses INFORM decision-support (never undercuts entity tier). No fake AI.";
            default -> null;
        };
    }

    private static List<Map<String, String>> controlMap() {
        return List.of(
                control("Stakeholder baseline",
                        "Partner portal core plus donation/support and planning/analytics read access",
                        "stakeholder_portal.view, stakeholder_portal.donate, anticipatory_action_plans.view, contingency_plans.view, reports_and_analytics.view"),
                control("Stakeholder portal sub-pages",
                        "Portal menu items map to their real backend permissions",
                        "stakeholder_portal.view, stakeholder_portal.donate, resource_allocation.view, stakeholders.view, command_post.view, one_health.view"),
	                control("System settings surfaces",
	                        "Each settings page has its own view/manage switch; agencies follow user_management.* and translations follow translations.*",
	                        "user_management.*, roles_and_permissions.*, location_management.*, resource_catalogue.*, approval_workflows.*, translations.*"),
                control("Warehouses & stock (area)",
                        "Preparedness stocking and response stores. Area officers are stamped to their region/district; view_national opens shared national/zonal stores",
                        "warehouse_and_stock.view, warehouse_and_stock.manage, warehouse_and_stock.view_national"),
                control("Resource allocation (incident-linked)",
                        "Request against own-area incidents; auto warehouse prefers incident district → region → shared. Approve/dispatch separate gates",
                        "resource_allocation.view, resource_allocation.request, resource_allocation.approve, resource_allocation.dispatch"),
                control("Monitoring & Evaluation (identity)",
                        "view = dashboard/workbench; enter = values for own institution/area/partner; manage = national catalogue + all levels. Bind users to agency/stakeholder/region/district/LGA in User Management",
                        "monitoring_evaluation.view, monitoring_evaluation.enter, monitoring_evaluation.manage"),
                control("Early Warning & PMO Impact Analysis",
                        "Entity submissions + consolidated overlay. PMO paints impact colours with INFORM/ops support (never undercuts entity tier). AI/satellite deferred honestly",
                        "early_warning.view, early_warning.create, early_warning.disseminate, early_warning.approve"),
                control("Sendai Analytics + GIS Map",
                        "External/public analytics inside Reports & Analytics",
                        "reports_and_analytics.view"),
                control("Prevention navigation",
                        "Individual Prevention & Mitigation sub-pages",
                        "prevention_dashboard.view, hazards.view, mitigation_measures.view, risk_assessment.view, strategic_infrastructure.view, disaster_repository.view, risk_mapping.view, risk_index.view"),
                control("Prevention authoring",
                        "Create/edit/delete and approval controls",
                        "hazards.manage, mitigation_measures.manage, risk_assessment.create, risk_assessment.approve, strategic_infrastructure.manage, disaster_repository.enter"),
                control("Sector INFORM data entry",
                        "MDA users key only their registered agency owner; PMO approves",
                        "risk_index.view, risk_index.create, risk_index.approve"),
                control("Repository event cards",
                        "PMO/EOCC Sendai data-entry surface",
                        "disaster_repository.enter"),
                control("Report sub-pages",
                        "Incident, resource, generated and EW reports",
                        "incidents.view, resource_allocation.view, damage_assessment.view, early_warning.view"),
                control("Communication Center",
                        "Overview/logs are view-level; SMS/email compose and channel tests are send-level",
                        "communication_and_alerts.view, communication_and_alerts.send"),
	                control("Portal/news/QR outreach",
	                        "Public portal administration and publication controls",
	                        "content_management.view, content_management.manage"),
                control("DLNA sector keying",
                        "Sector contributors fill only their assigned Annex-1 sections",
                        "damage_assessment.key_section"),
                control("One Health dissemination",
                        "PMO/national dissemination registry and approvals",
                        "one_health.disseminate, one_health.approve, one_health.manage"));
    }

    private static Map<String, String> control(String title, String scope, String permissions) {
        return Map.of("title", title, "scope", scope, "permissions", permissions);
    }
}
