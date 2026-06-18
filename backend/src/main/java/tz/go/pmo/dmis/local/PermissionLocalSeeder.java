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

    private static Map<String, List<String>> buildCatalogue() {
        Map<String, List<String>> c = new LinkedHashMap<>();
        c.put("Prevention & Mitigation", List.of("view", "manage"));
        c.put("Hazards", List.of("view", "manage"));
        c.put("Risk Assessment", List.of("view", "create", "approve"));
        c.put("Early Warning", List.of("view", "create", "disseminate", "approve"));
        c.put("Preparedness", List.of("view", "manage"));
        c.put("Incidents", List.of("view", "create", "update", "approve", "close"));
        c.put("Resource Allocation", List.of("view", "request", "approve", "dispatch"));
        c.put("Warehouse & Stock", List.of("view", "manage"));
        c.put("Damage Assessment", List.of("view", "create", "verify"));
        c.put("Tasks", List.of("view", "manage"));
        c.put("Communication & Alerts", List.of("view", "send"));
        c.put("Command Post", List.of("view", "activate", "posture"));
        c.put("Anticipatory Action Plans", List.of("view", "create", "approve"));
        c.put("Disaster Declarations", List.of("view", "propose", "declare"));
        c.put("One Health", List.of("view", "manage", "disseminate"));
        c.put("Recovery", List.of("view", "manage"));
        c.put("Disaster Repository", List.of("view", "enter", "validate"));
        c.put("Reports & Analytics", List.of("view"));
        c.put("Content Management", List.of("view", "manage"));
        c.put("User Management", List.of("view", "manage"));
        c.put("Roles & Permissions", List.of("view", "manage"));
        c.put("Location Management", List.of("view", "manage"));
        c.put("Resource Catalogue", List.of("view", "manage"));
        c.put("Approval Workflows", List.of("view", "manage"));
        return c;
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
                "Content Management|*", "Translations|*"));
        p.put("Secretary", List.of("*|view", "Incidents|approve", "Resource Allocation|approve",
                "Disaster Declarations|declare", "Disaster Declarations|propose", "Command Post|activate"));
        p.put("Director", List.of("*|view", "Incidents|approve", "Incidents|close",
                "Resource Allocation|approve", "Anticipatory Action Plans|approve", "Risk Assessment|approve",
                "Damage Assessment|verify", "Disaster Repository|validate", "Disaster Declarations|propose",
                "Disaster Declarations|declare", "Command Post|activate", "Command Post|posture", "Early Warning|approve"));
        p.put("Asst. Director", List.of("*|view", "Incidents|approve", "Resource Allocation|approve",
                "Anticipatory Action Plans|approve", "Damage Assessment|verify", "Command Post|activate",
                "Command Post|posture", "Disaster Repository|validate"));
        p.put("EOCC", List.of("*|view", "Incidents|create", "Incidents|update", "Resource Allocation|request",
                "Resource Allocation|dispatch", "Warehouse & Stock|manage", "Damage Assessment|create",
                "Damage Assessment|verify", "Tasks|manage", "Communication & Alerts|send", "Command Post|activate",
                "Command Post|posture", "Anticipatory Action Plans|create", "Disaster Repository|enter",
                "Disaster Repository|validate", "Early Warning|create", "Early Warning|disseminate"));
        p.put("Reg DC", List.of("*|view", "Incidents|approve", "Tasks|manage", "Damage Assessment|verify",
                "Resource Allocation|request"));
        p.put("RAS", List.of("*|view", "Incidents|approve", "Tasks|manage", "Damage Assessment|verify"));
        p.put("Dist DC", List.of("*|view", "Incidents|create", "Incidents|update", "Tasks|manage",
                "Damage Assessment|create"));
        p.put("DAS", List.of("*|view", "Incidents|create", "Incidents|update", "Tasks|manage",
                "Damage Assessment|create"));
        p.put("Comms Officer", List.of("*|view", "Communication & Alerts|send", "Content Management|manage",
                "Early Warning|disseminate"));
        p.put("MDA Focal", List.of("*|view", "One Health|manage", "One Health|disseminate"));
        p.put("Partners", List.of("Reports & Analytics|view", "Tasks|view", "Anticipatory Action Plans|view",
                "Disaster Repository|view", "Content Management|view"));
        return p;
    }

    @Override
    public void run(String... args) {
        seedCatalogue();
        seedRoleDescriptions();
        assignPolicy();
    }

    private void seedCatalogue() {
        CATALOGUE.forEach((module, actions) -> {
            for (String action : actions) {
                String name = slug(module) + "." + action;
                jdbc.update("insert into public.permissions(name, module, action, label, guard_name,"
                                + " created_at, updated_at) values (?,?,?,?, 'web', now(), now())"
                                + " on conflict (name) do nothing",
                        name, module, action, cap(action) + " — " + module);
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
        d.put("DAS", "District Administrative Secretary — district approval authority.");
        d.put("Comms Officer", "Communications — alert dissemination and public content.");
        d.put("MDA Focal", "Sector / MDA focal point — One Health and sectoral coordination.");
        d.put("Partners", "Stakeholders & partners — scoped read access and assigned tasks.");
        d.forEach((role, desc) -> jdbc.update(
                "update public.roles set description = ? where name = ? and description is null", desc, role));
    }

    private void assignPolicy() {
        int assigned = 0;
        for (Map.Entry<String, List<String>> entry : POLICY.entrySet()) {
            Long roleId = roleId(entry.getKey());
            if (roleId == null) {
                continue; // role not seeded yet (ordering) — picked up on a later run
            }
            for (String rule : entry.getValue()) {
                assigned += applyRule(roleId, rule);
            }
        }
        if (assigned > 0) {
            log.info("role→permission policy applied: {} assignments", assigned);
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
        return s.isEmpty() ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
