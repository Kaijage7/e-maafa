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
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * System Settings → User Management. Administers the {@code users} table and each user's SRS roles
 * ({@code model_has_roles}). Passwords are BCrypt-hashed the same way {@code AuthController} verifies
 * them. Roles drive both the sidebar (the module hub) and every {@code @PreAuthorize} check across
 * the platform, so this screen is the access-control front door.
 *
 * <p>Writes are gated to the administrators who govern accounts. A safety rail prevents deleting or
 * stripping the role of the last Super Admin (locking everyone out).</p>
 */
@RestController
@RequestMapping("/v1/settings/users")
@Tag(name = "Settings: User Management", description = "Users + role assignment")
@RequiredArgsConstructor
public class UserManagementController {

    private static final String CAN_WRITE = "hasAuthority('user_management.manage')";
    private static final String MODEL_TYPE = "App\\Models\\User";

    private final JdbcTemplate jdbc;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();

    @GetMapping
    @Operation(summary = "Users with their roles + the role catalogue + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index(@RequestParam(required = false) String search,
                                     @RequestParam(required = false) String role,
                                     @RequestParam(required = false) String roleCategory,
                                     @RequestParam(required = false) String scopeLevel,
                                     @RequestParam(required = false) Long regionId,
                                     @RequestParam(required = false) Long districtId,
                                     @RequestParam(required = false) Long councilId,
                                     @RequestParam(required = false) Boolean seeded,
                                     @RequestParam(required = false) String accountGroup) {
        StringBuilder where = new StringBuilder(" where 1=1");
        List<Object> args = new ArrayList<>();
        if (search != null && !search.isBlank()) {
            where.append(" and (u.name ilike ? or u.email ilike ? or u.officer_position ilike ?"
                    + " or coalesce(ag.name,'') ilike ? or coalesce(ag.acronym,'') ilike ?"
                    + " or coalesce(st.organization, st.name, '') ilike ?)");
            String q = "%" + search + "%";
            args.add(q); args.add(q); args.add(q); args.add(q); args.add(q); args.add(q);
        }
        if (role != null && !role.isBlank()) {
            where.append(" and exists (select 1 from public.model_has_roles m join public.roles r2 on r2.id = m.role_id"
                    + " where m.model_id = u.id and r2.name = ?)");
            args.add(role);
        }
        if (roleCategory != null && !roleCategory.isBlank()) {
            where.append(" and exists (select 1 from public.model_has_roles m join public.roles r2 on r2.id = m.role_id"
                    + " where m.model_id = u.id and coalesce(r2.category, 'Other') = ?)");
            args.add(roleCategory);
        }
        if (scopeLevel != null && !scopeLevel.isBlank()) {
            where.append(" and exists (select 1 from public.model_has_roles m join public.roles r2 on r2.id = m.role_id"
                    + " where m.model_id = u.id and coalesce(r2.scope_level, 'system') = ?)");
            args.add(scopeLevel);
        }
        if (regionId != null) {
            where.append(" and u.region_id = ?");
            args.add(regionId);
        }
        if (districtId != null) {
            where.append(" and u.district_id = ?");
            args.add(districtId);
        }
        if (councilId != null) {
            where.append(" and u.council_id = ?");
            args.add(councilId);
        }
        if (seeded != null) {
            where.append(" and coalesce(u.seeded_officer, false) = ?");
            args.add(seeded);
        }
        // Smart account groups — keeps the 900+ area seats from drowning MDA/partner focals
        if (accountGroup != null && !accountGroup.isBlank()) {
            switch (accountGroup.trim().toLowerCase()) {
                case "mda", "sector" -> where.append(" and u.agency_id is not null");
                case "partner", "stakeholder" -> where.append(" and u.stakeholder_id is not null");
                case "area", "area_seats" -> where.append(
                        " and (u.region_id is not null or u.district_id is not null or u.council_id is not null)"
                                + " and u.agency_id is null and u.stakeholder_id is null");
                case "national", "system" -> where.append(
                        " and u.agency_id is null and u.stakeholder_id is null"
                                + " and u.region_id is null and u.district_id is null and u.council_id is null");
                case "institution" -> where.append(
                        " and (u.agency_id is not null or u.stakeholder_id is not null)");
                default -> { /* all */ }
            }
        }
        List<Map<String, Object>> users = jdbc.queryForList(
                "select u.id, u.name, u.email, u.email_verified_at as \"emailVerifiedAt\","
                        + " to_char(u.created_at,'DD Mon YYYY') as \"createdAt\","
                        + " u.region_id as \"regionId\", reg.name as \"regionName\","
                        + " u.district_id as \"districtId\", dis.name as \"districtName\","
                        + " u.council_id as \"councilId\", co.name as \"councilName\","
                        + " u.agency_id as \"agencyId\", coalesce(ag.acronym, ag.name) as \"agencyName\","
                        + " ag.institution_class as \"agencyClass\","
                        + " u.stakeholder_id as \"stakeholderId\","
                        + " coalesce(st.organization, st.name) as \"stakeholderName\","
                        + " st.institution_class as \"stakeholderClass\","
                        + " u.officer_position as \"officerPosition\", u.position_key as \"positionKey\","
                        + " coalesce(u.seeded_officer, false) as \"seededOfficer\","
                        + " case"
                        + "   when u.agency_id is not null then 'MDA / Agency'"
                        + "   when u.stakeholder_id is not null then 'Partner'"
                        + "   when u.region_id is not null or u.district_id is not null or u.council_id is not null then 'Area seat'"
                        + "   else 'National / System'"
                        + " end as \"accountGroup\","
                        + " coalesce((select string_agg(r.name, ', ' order by coalesce(r.sort_order, 500), r.name)"
                        + "   from public.model_has_roles mhr join public.roles r on r.id = mhr.role_id"
                        + "   where mhr.model_id = u.id), '') as roles"
                        + " from public.users u"
                        + " left join public.regions reg on reg.id = u.region_id"
                        + " left join public.districts dis on dis.id = u.district_id"
                        + " left join public.councils co on co.id = u.council_id"
                        + " left join public.agencies ag on ag.id = u.agency_id"
                        + " left join public.stakeholders st on st.id = u.stakeholder_id"
                        + where
                        + " order by case"
                        + "   when u.agency_id is not null then 1"
                        + "   when u.stakeholder_id is not null then 2"
                        + "   when u.region_id is not null or u.district_id is not null or u.council_id is not null then 4"
                        + "   else 3 end,"
                        + " coalesce(ag.institution_class, st.institution_class, ''),"
                        + " u.name",
                args.toArray());
        for (Map<String, Object> u : users) {
            String roles = String.valueOf(u.getOrDefault("roles", ""));
            u.put("roleList", roles.isEmpty() ? List.of() : List.of(roles.split(", ")));
        }
        Map<String, Object> out = new LinkedHashMap<>();
        List<Map<String, Object>> roleDetails = RoleCatalogue.roleDetails(jdbc);
        out.put("users", users);
        out.put("roles", RoleCatalogue.names(roleDetails));
        out.put("roleDetails", roleDetails);
        out.put("roleGroups", RoleCatalogue.groups(roleDetails));
        Map<String, Object> lookups = new LinkedHashMap<>();
        lookups.put("regions", jdbc.queryForList("select id, name from public.regions order by name"));
        lookups.put("agencies", jdbc.queryForList(
                "select id, name, acronym, institution_class as \"institutionClass\" from public.agencies"
                        + " where coalesce(is_active, true) = true"
                        + " order by case institution_class when 'Ministry' then 1 when 'Government Institution' then 2 else 3 end, name"));
        lookups.put("stakeholders", jdbc.queryForList(
                "select id, coalesce(organization, name) as name, institution_class as \"institutionClass\""
                        + " from public.stakeholders where coalesce(is_active, true) = true"
                        + " order by institution_class nulls last, 2"));
        out.put("lookups", lookups);
        out.put("stats", jdbc.queryForMap(
                "select count(*) as total,"
                        + " (select count(*) from public.model_has_roles mhr join public.roles r on r.id = mhr.role_id"
                        + "   where r.name = 'Super Admin') as \"superAdmins\","
                        + " count(*) filter (where email_verified_at is not null) as verified,"
                        + " count(*) filter (where coalesce(seeded_officer, false)) as \"seededOfficers\","
                        + " count(*) filter (where region_id is not null or district_id is not null or council_id is not null) as \"areaLinked\","
                        + " count(*) filter (where agency_id is not null) as \"mdaFocals\","
                        + " count(*) filter (where stakeholder_id is not null) as \"partnerFocals\","
                        + " count(*) filter (where agency_id is null and stakeholder_id is null"
                        + "   and region_id is null and district_id is null and council_id is null) as \"nationalSystem\""
                        + " from public.users"));
        out.put("accountGroups", List.of(
                Map.of("code", "institution", "label", "MDA + Partner focals (M&E feeders)"),
                Map.of("code", "mda", "label", "MDA / Agency focals"),
                Map.of("code", "partner", "label", "Partners"),
                Map.of("code", "national", "label", "National / System"),
                Map.of("code", "area", "label", "Area seats (RC/RAS/DED/DAS…)"),
                Map.of("code", "all", "label", "All accounts")));
        return out;
    }

    @PostMapping
    @Operation(summary = "Create a user (BCrypt password) + assign roles")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> create(@RequestBody Map<String, Object> req) {
        String name = req(req, "name");
        String email = req(req, "email").toLowerCase();
        String password = req(req, "password");
        validatePassword(password);
        Long dup = jdbc.queryForObject("select count(*) from public.users where lower(email) = ?", Long.class, email);
        if (dup != null && dup > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A user with that email already exists");
        }
        Area area = areaAttachment(req);
        // Self-heal the id sequence: the legacy seeder inserted users with explicit ids without
        // bumping users_id_seq, so a fresh insert can collide on the pkey. Advance it past max(id).
        jdbc.queryForObject("select setval('public.users_id_seq', greatest("
                + "coalesce((select max(id) from public.users), 1), (select last_value from public.users_id_seq)))",
                Long.class);
        // Admin-issued password → must_change_password so the user sets their own secret on first login (PSA v).
        Long id = jdbc.queryForObject(
                "insert into public.users(name, email, password, email_verified_at,"
                        + " region_id, district_id, council_id, agency_id, stakeholder_id,"
                        + " must_change_password, created_at, updated_at)"
                        + " values (?,?,?, now(), ?,?,?,?,?, true, now(), now()) returning id",
                Long.class, name, email, encoder.encode(password),
                area.regionId(), area.districtId(), area.councilId(), area.agencyId(), area.stakeholderId());
        setRoles(id, roleList(req.get("roles")));
        syncStakeholderLink(id, area.stakeholderId());
        return Map.of("id", id, "message", "User created");
    }

    @PutMapping("/{id}")
    @Operation(summary = "Edit a user's name / email / area attachment")
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> update(@PathVariable long id, @RequestBody Map<String, Object> req) {
        find(id);
        String email = str(req.get("email"));
        if (email != null) {
            Long dup = jdbc.queryForObject(
                    "select count(*) from public.users where lower(email) = lower(?) and id <> ?", Long.class, email, id);
            if (dup != null && dup > 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Another user already has that email");
            }
        }
        jdbc.update("update public.users set name = coalesce(?,name), email = coalesce(lower(?),email),"
                + " updated_at = now() where id = ?", str(req.get("name")), email, id);
        // Area attachment is a REPLACE, but only when the caller sends any of the keys (a legacy
        // name/email-only body leaves the attachment untouched; an explicit null clears it).
        if (req.containsKey("regionId") || req.containsKey("districtId") || req.containsKey("councilId")
                || req.containsKey("agencyId") || req.containsKey("stakeholderId")) {
            Area area = areaAttachment(req);
            jdbc.update("update public.users set region_id = ?, district_id = ?, council_id = ?, agency_id = ?,"
                            + " stakeholder_id = ?, updated_at = now() where id = ?",
                    area.regionId(), area.districtId(), area.councilId(), area.agencyId(), area.stakeholderId(), id);
            syncStakeholderLink(id, area.stakeholderId());
        }
        return Map.of("message", "User updated");
    }

    @PutMapping("/{id}/roles")
    @Operation(summary = "Replace a user's roles")
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> setUserRoles(@PathVariable long id, @RequestBody Map<String, Object> req) {
        find(id);
        List<String> roles = roleList(req.get("roles"));
        guardLastSuperAdmin(id, roles);
        setRoles(id, roles);
        return Map.of("message", "Roles updated");
    }

    @PostMapping("/{id}/password")
    @Operation(summary = "Reset a user's password")
    @PreAuthorize(CAN_WRITE)
    public Map<String, Object> resetPassword(@PathVariable long id, @RequestBody Map<String, Object> req) {
        find(id);
        String password = req(req, "password");
        validatePassword(password);
        jdbc.update("""
                update public.users
                   set password = ?, must_change_password = true, updated_at = now()
                 where id = ?
                """, encoder.encode(password), id);
        return Map.of("message", "Password reset — user must change it on next sign-in");
    }

    /** Admin-set passwords use the same shared policy as self-service change (single source of truth). */
    private static void validatePassword(String password) {
        tz.go.pmo.dmis.common.security.PasswordPolicy.validate(password);
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a user (cannot remove the last Super Admin)")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    @PreAuthorize(CAN_WRITE)
    public void delete(@PathVariable long id) {
        find(id);
        guardLastSuperAdmin(id, List.of()); // deleting = stripping all roles
        jdbc.update("delete from public.model_has_roles where model_id = ? and model_type = ?", id, MODEL_TYPE);
        jdbc.update("delete from public.users where id = ?", id);
    }

    // ── helpers ──

    /** The user's jurisdiction/institution attachment — what JurisdictionScope reads for area scoping. */
    private record Area(Long regionId, Long districtId, Long councilId, Long agencyId, Long stakeholderId) {
    }

    /**
     * Parse + validate the optional attachment ids ({@code regionId}/{@code districtId}/{@code councilId}/
     * {@code agencyId}/{@code stakeholderId}). Every id must exist; a council fills its parent district
     * and region when omitted, so an LGA officer always carries a coherent region_id + district_id too.
     */
    private Area areaAttachment(Map<String, Object> req) {
        Long regionId = idOf(req.get("regionId"), "regionId");
        Long districtId = idOf(req.get("districtId"), "districtId");
        Long councilId = idOf(req.get("councilId"), "councilId");
        Long agencyId = idOf(req.get("agencyId"), "agencyId");
        Long stakeholderId = idOf(req.get("stakeholderId"), "stakeholderId");
        if (regionId != null && !exists("regions", regionId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Region " + regionId + " does not exist");
        }
        if (councilId != null) {
            List<Map<String, Object>> parent = jdbc.queryForList(
                    "select region_id, district_id from public.councils where id = ?", councilId);
            if (parent.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Council/LGA " + councilId + " does not exist");
            }
            Long councilRegion = ((Number) parent.get(0).get("region_id")).longValue();
            Long councilDistrict = ((Number) parent.get(0).get("district_id")).longValue();
            if (regionId != null && !regionId.equals(councilRegion)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Council/LGA " + councilId + " does not belong to region " + regionId);
            }
            if (districtId != null && !districtId.equals(councilDistrict)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Council/LGA " + councilId + " does not belong to district " + districtId);
            }
            regionId = councilRegion;
            districtId = councilDistrict;
        }
        if (districtId != null) {
            List<Long> parent = jdbc.queryForList(
                    "select region_id from public.districts where id = ?", Long.class, districtId);
            if (parent.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "District " + districtId + " does not exist");
            }
            Long districtRegion = parent.get(0);
            if (regionId != null && !regionId.equals(districtRegion)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "District " + districtId + " does not belong to region " + regionId);
            }
            regionId = districtRegion;
        }
        if (agencyId != null && !exists("agencies", agencyId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Agency " + agencyId + " does not exist");
        }
        if (stakeholderId != null && !exists("stakeholders", stakeholderId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Stakeholder " + stakeholderId + " does not exist");
        }
        return new Area(regionId, districtId, councilId, agencyId, stakeholderId);
    }

    /**
     * users.stakeholder_id and stakeholders.user_id are a two-column mirror of the SAME one-to-one link
     * (partner guards read the users side, the directory reads the stakeholders side) — keep both in
     * lockstep whenever this screen (re)attaches or clears a partner.
     */
    private void syncStakeholderLink(long userId, Long stakeholderId) {
        if (stakeholderId == null) {
            jdbc.update("update public.stakeholders set user_id = null, updated_at = now() where user_id = ?", userId);
        } else {
            jdbc.update("update public.stakeholders set user_id = null, updated_at = now()"
                    + " where user_id = ? and id <> ?", userId, stakeholderId);
            jdbc.update("update public.users set stakeholder_id = null, updated_at = now()"
                    + " where stakeholder_id = ? and id <> ?", stakeholderId, userId);
            jdbc.update("update public.stakeholders set user_id = ?, updated_at = now() where id = ?",
                    userId, stakeholderId);
        }
    }

    private boolean exists(String table, long id) {
        Long n = jdbc.queryForObject("select count(*) from " + tz.go.pmo.dmis.common.sql.SafeIdentifiers.publicQualified(table) + " where id = ?", Long.class, id);
        return n != null && n > 0;
    }

    private static Long idOf(Object v, String key) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        String s = String.valueOf(v).trim();
        if (s.isEmpty() || "null".equalsIgnoreCase(s)) {
            return null;
        }
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, key + " must be a numeric id");
        }
    }

    private void setRoles(long userId, List<String> roleNames) {
        jdbc.update("delete from public.model_has_roles where model_id = ? and model_type = ?", userId, MODEL_TYPE);
        for (String roleName : roleNames) {
            Long roleId = roleId(roleName);
            if (roleId != null) {
                jdbc.update("insert into public.model_has_roles(role_id, model_type, model_id) values (?,?,?)"
                        + " on conflict do nothing", roleId, MODEL_TYPE, userId);
            }
        }
    }

    /** Never let the system lose its last Super Admin (would lock everyone out of writes). */
    private void guardLastSuperAdmin(long userId, List<String> newRoles) {
        boolean isSuperAdmin = Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists (select 1 from public.model_has_roles mhr join public.roles r on r.id = mhr.role_id"
                        + " where mhr.model_id = ? and r.name = 'Super Admin')", Boolean.class, userId));
        if (!isSuperAdmin || newRoles.contains("Super Admin")) {
            return;
        }
        Long others = jdbc.queryForObject(
                "select count(distinct mhr.model_id) from public.model_has_roles mhr join public.roles r on r.id = mhr.role_id"
                        + " where r.name = 'Super Admin' and mhr.model_id <> ?", Long.class, userId);
        if (others == null || others == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This is the last Super Admin — assign Super Admin to another user first.");
        }
    }

    @SuppressWarnings("unchecked")
    private static List<String> roleList(Object v) {
        if (v instanceof List<?> list) {
            return list.stream().map(String::valueOf).filter(s -> !s.isBlank()).toList();
        }
        return List.of();
    }

    private Long roleId(String name) {
        List<Long> ids = jdbc.queryForList("select id from public.roles where name = ?", Long.class, name);
        return ids.isEmpty() ? null : ids.get(0);
    }

    private Map<String, Object> find(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select id from public.users where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found");
        }
        return rows.get(0);
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
}
