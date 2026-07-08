package tz.go.pmo.dmis.stakeholder;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Transactional;
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
import tz.go.pmo.dmis.notification.MailService;

/**
 * Stakeholder Portal — directory + verification workflow over the shared `stakeholders` table,
 * reproducing Admin/StakeholderController (list w/ filters + stats, create, update, verify).
 * The table's operational writes belong to the Response module; this admin surface
 * is additive (no schema change).
 */
@RestController
@RequestMapping("/v1/stakeholders")
@RequiredArgsConstructor
@Tag(name = "Stakeholder Portal", description = "Partner directory + verification")
public class StakeholderAdminController {

    private static final String MODEL_TYPE = "App\\Models\\User";

    private final JdbcTemplate jdbc;
    private final tz.go.pmo.dmis.notification.ExternalDeliveryService delivery;
    private final MailService mail;
    private final tz.go.pmo.dmis.common.security.JurisdictionScope jurisdiction;
    private final tz.go.pmo.dmis.common.security.AreaLookup areaLookup;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${dmis.app.base-url:http://localhost:4200}")
    private String appBaseUrl;

    @Value("${dmis.auth.reset-token-ttl-minutes:60}")
    private long resetTtlMinutes;

    public record StakeholderWriteRequest(String name, String organization, String type, String sector,
                                          String email, String phone, String region, String district,
                                          String contactPersonName, String contactPersonTitle,
                                          Boolean isActive) {
    }

    @GetMapping
    @Operation(summary = "Stakeholder directory + stats")
    @PreAuthorize("hasAuthority('stakeholders.view')")
    public Map<String, Object> index() {
        // jurisdiction visibility: region/district officer sees their own area + shared (null-area) partners;
        // national tier + non-area roles see all. Stats are derived from the returned rows, so they auto-scope.
        StringBuilder where = new StringBuilder(" where 1=1");
        List<Object> params = new java.util.ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("s", where, params);
        // STAKEHOLDER ISOLATION: a partner login (bound to a stakeholder org) sees ONLY its OWN organisation
        // in the directory, never the other partners; operators / PMO keep the full directory to coordinate.
        Long myStakeholder = jurisdiction.currentStakeholderId();
        if (myStakeholder != null) {
            where.append(" and s.id = ?");
            params.add(myStakeholder);
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select s.id, s.name, s.organization, s.type, s.sector, s.email, s.phone, s.region, s.district,"
                        + " s.contact_person_name as \"contactPersonName\", s.contact_person_title as \"contactPersonTitle\","
                        + " s.is_active as \"isActive\", s.is_verified as \"isVerified\","
                        + " to_char(s.verified_at, 'DD Mon YYYY') as \"verifiedAt\","
                        + " s.user_id as \"userId\", u.name as \"linkedUserName\", u.email as \"linkedUserEmail\""
                        + " from public.stakeholders s left join public.users u on u.id = s.user_id"
                        + where
                        + " order by s.created_at desc nulls last, s.id desc",
                params.toArray());
        long verified = rows.stream().filter(r -> Boolean.TRUE.equals(r.get("isVerified"))).count();
        long active = rows.stream().filter(r -> Boolean.TRUE.equals(r.get("isActive"))).count();
        return Map.of("stakeholders", rows,
                "stats", Map.of("total", rows.size(), "verified", verified, "active", active,
                        "pending", rows.size() - verified));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Register a stakeholder (admin)")
    @PreAuthorize("hasAuthority('stakeholders.manage')")
    @Transactional
    public Map<String, Object> create(@RequestBody StakeholderWriteRequest req) {
        if (req.name() == null || req.name().isBlank() || req.organization() == null || req.organization().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name and organization are required");
        }
        Long regionId = areaLookup.regionId(req.region());
        Long districtId = areaLookup.districtId(req.district(), regionId);
        Long id = jdbc.queryForObject(
                "insert into public.stakeholders(name,organization,type,sector,email,phone,region,district,"
                        + "region_id,district_id,"
                        + "contact_person_name,contact_person_title,is_active,is_verified,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,?,?,?,?,true,false,now(),now()) returning id", Long.class,
                req.name().trim(), req.organization().trim(), nz(req.type(), "Government"), req.sector(),
                req.email(), req.phone(), req.region(), req.district(),
                regionId, districtId,
                req.contactPersonName(), req.contactPersonTitle());
        return Map.of("id", id, "message", "Stakeholder registered");
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update a stakeholder")
    @PreAuthorize("hasAuthority('stakeholders.manage')")
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody StakeholderWriteRequest req) {
        // resolve picker names to FK ids; null (e.g. toggleActive sends only isActive) leaves the area unchanged
        Long regionId = areaLookup.regionId(req.region());
        Long districtId = areaLookup.districtId(req.district(), regionId);
        int n = jdbc.update("update public.stakeholders set name=coalesce(?,name),"
                        + " organization=coalesce(?,organization), type=coalesce(?,type), sector=coalesce(?,sector),"
                        + " email=coalesce(?,email), phone=coalesce(?,phone), region=coalesce(?,region),"
                        + " district=coalesce(?,district), region_id=coalesce(?,region_id),"
                        + " district_id=coalesce(?,district_id), contact_person_name=coalesce(?,contact_person_name),"
                        + " contact_person_title=coalesce(?,contact_person_title),"
                        + " is_active=coalesce(?,is_active), updated_at=now() where id=?",
                req.name(), req.organization(), req.type(), req.sector(), req.email(), req.phone(),
                req.region(), req.district(), regionId, districtId,
                req.contactPersonName(), req.contactPersonTitle(),
                req.isActive(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Stakeholder not found");
        }
        return Map.of("id", id, "message", "Updated");
    }

    @PutMapping("/{id}/verify")
    @Operation(summary = "Verify / unverify a partner and provision partner login when possible")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @Transactional
    public Map<String, Object> verify(@PathVariable long id, @RequestBody Map<String, Object> req) {
        boolean verified = Boolean.parseBoolean(String.valueOf(req.getOrDefault("verified", "true")));
        Map<String, Object> stakeholder = stakeholderForApproval(id);
        jdbc.update("update public.stakeholders set is_verified=?,"
                + " verified_at = case when ? then now() end, updated_at=now() where id=?", verified, verified, id);
        String accountMessage = null;
        Long accountUserId = null;
        boolean accountProvisioned = false;
        boolean resetEmailLogged = false;
        if (verified) {
            // On approval, congratulate the partner on their OWN email + SMS, reusing the single
            // ExternalDeliveryService → MgovSmsService/MailService path (logs sms_logs/email_logs).
            String email = str(stakeholder.get("email"));
            String phone = str(stakeholder.get("phone"));
            var notice = tz.go.pmo.dmis.notification.NotificationService.Notice.inApp(
                    "stakeholder_verified", "Stakeholder registration approved",
                    "Congratulations, looking forward to your support and collaboration in disaster management in Tanzania.",
                    "/stakeholders", "stakeholder", id, "info");
            try {
                delivery.deliver(notice,
                        (phone != null && !phone.isBlank()) ? List.of(phone) : List.of(),
                        (email != null && !email.isBlank()) ? List.of(email) : List.of());
            } catch (Exception ignore) {
                // never fail the verify transaction on a gateway/delivery error
            }
            ProvisionResult provision = provisionPartnerLogin(id, stakeholder);
            accountMessage = provision.message();
            accountUserId = provision.userId();
            accountProvisioned = provision.created();
            resetEmailLogged = provision.resetEmailLogged();
        } else {
            accountMessage = "Verification revoked. Existing login links are left unchanged; unlink or disable the user explicitly if access must be removed.";
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("verified", verified);
        out.put("message", verified ? "Partner verified" : "Verification revoked");
        out.put("accountProvisioned", accountProvisioned);
        out.put("resetEmailLogged", resetEmailLogged);
        out.put("accountMessage", accountMessage);
        if (accountUserId != null) {
            out.put("userId", accountUserId);
        }
        return out;
    }

    private ProvisionResult provisionPartnerLogin(long stakeholderId, Map<String, Object> stakeholder) {
        String email = str(stakeholder.get("email"));
        if (email == null || !email.matches("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")) {
            return new ProvisionResult(null, false, false,
                    "Partner verified, but no login was created because this stakeholder has no valid email address.");
        }
        email = email.toLowerCase(Locale.ROOT);
        Long linkedUserId = lng(stakeholder.get("user_id"));
        List<Map<String, Object>> existing = jdbc.queryForList(
                "select id, stakeholder_id from public.users where lower(email) = lower(?) order by id limit 1", email);
        if (!existing.isEmpty()) {
            Long uid = lng(existing.get(0).get("id"));
            Long userStakeholderId = lng(existing.get(0).get("stakeholder_id"));
            if ((linkedUserId != null && linkedUserId.equals(uid))
                    || (userStakeholderId != null && userStakeholderId.equals(stakeholderId))) {
                syncPartnerLoginLink(uid, stakeholderId);
                ensurePartnersRole(uid);
                boolean logged = issuePartnerSetPasswordEmail(email, str(stakeholder.get("name")), stakeholderId);
                return new ProvisionResult(uid, false, logged,
                        mail.isConfigured()
                                ? "Existing linked partner login found; a fresh set-password email was sent."
                                : "Existing linked partner login found; set-password email is logged as pending because SMTP is not configured.");
            }
            return new ProvisionResult(uid, false, false,
                    "Partner verified, but a user with this email already exists. Use Link login after confirming the account belongs to this partner.");
        }

        jdbc.queryForObject("select setval('public.users_id_seq', greatest("
                + "coalesce((select max(id) from public.users), 1), (select last_value from public.users_id_seq)))",
                Long.class);
        Long uid = jdbc.queryForObject("""
                insert into public.users(name, email, password, email_verified_at, stakeholder_id, created_at, updated_at)
                values (?, ?, ?, now(), ?, now(), now())
                returning id
                """, Long.class,
                nz(str(stakeholder.get("name")), nz(str(stakeholder.get("organization")), "Partner")),
                email, encoder.encode(randomToken(32) + ".ResetOnly1!"), stakeholderId);
        ensurePartnersRole(uid);
        syncPartnerLoginLink(uid, stakeholderId);
        boolean logged = issuePartnerSetPasswordEmail(email, str(stakeholder.get("name")), stakeholderId);
        return new ProvisionResult(uid, true, logged,
                mail.isConfigured()
                        ? "Partner login created and a set-password email was sent."
                        : "Partner login created; set-password email is logged as pending because SMTP is not configured.");
    }

    private void ensurePartnersRole(long userId) {
        List<Long> roles = jdbc.queryForList("select id from public.roles where name = 'Partners' order by id limit 1",
                Long.class);
        if (roles.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Partners role is not configured.");
        }
        Long roleId = roles.get(0);
        jdbc.update("""
                insert into public.model_has_roles(role_id, model_type, model_id)
                select ?, ?, ?
                where not exists (
                    select 1 from public.model_has_roles
                    where role_id = ? and model_type = ? and model_id = ?
                )
                """, roleId, MODEL_TYPE, userId, roleId, MODEL_TYPE, userId);
    }

    private void syncPartnerLoginLink(long userId, long stakeholderId) {
        jdbc.update("update public.stakeholders set user_id = null, updated_at = now() where user_id = ? and id <> ?",
                userId, stakeholderId);
        jdbc.update("update public.users set stakeholder_id = null, updated_at = now()"
                + " where stakeholder_id = ? and id <> ?", stakeholderId, userId);
        jdbc.update("update public.users set stakeholder_id = ?, updated_at = now() where id = ?", stakeholderId, userId);
        jdbc.update("update public.stakeholders set user_id = ?, updated_at = now() where id = ?", userId, stakeholderId);
    }

    private boolean issuePartnerSetPasswordEmail(String email, String name, long stakeholderId) {
        try {
            jdbc.update("delete from public.password_reset_tokens where lower(email) = lower(?)", email);
            String token = randomToken(32);
            jdbc.update("""
                    insert into public.password_reset_tokens(email, token_hash, expires_at)
                    values (?, ?, now() + make_interval(mins => ?))
                    """, email, sha256Hex(token), (int) resetTtlMinutes);
            String base = appBaseUrl == null || appBaseUrl.isBlank() ? "http://localhost:4200" : appBaseUrl.trim();
            if (base.endsWith("/")) {
                base = base.substring(0, base.length() - 1);
            }
            String link = base + "/reset-password?token=" + token;
            String body = "<p>Dear " + escHtml(nz(name, "Partner")) + ",</p>"
                    + "<p>Your e-MAAFA partner account has been approved. Use the secure link below to set your password. "
                    + "The link is valid for " + resetTtlMinutes + " minutes and can be used once.</p>"
                    + "<p><a href=\"" + link + "\">" + link + "</a></p>"
                    + "<p>If you did not register as a partner, contact the Prime Minister's Office Disaster Management Department.</p>";
            mail.send(email, "e-MAAFA: set your partner login password", body,
                    "partner_login_invite", stakeholderId, null);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Map<String, Object> stakeholderForApproval(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, name, organization, email, phone, user_id from public.stakeholders where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Stakeholder not found");
        }
        return rows.get(0);
    }

    private String randomToken(int bytes) {
        byte[] raw = new byte[bytes];
        secureRandom.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    private static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static String escHtml(String value) {
        return value == null ? "" : value
                .replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace("\"", "&quot;")
                .replace("'", "&#39;");
    }

    private record ProvisionResult(Long userId, boolean created, boolean resetEmailLogged, String message) {
    }

    /**
     * Link (or unlink) a login account to this stakeholder so the partner can submit donations as
     * themselves from Open Needs. One login maps to one partner; passing a blank email unlinks.
     */
    @PutMapping("/{id}/link-user")
    @Operation(summary = "Link a login account to this partner (enables self-service donations)")
    @PreAuthorize("hasAuthority('stakeholders.manage')")
    @Transactional
    public Map<String, Object> linkUser(@PathVariable long id, @RequestBody Map<String, Object> req) {
        find(id);
        String email = req.get("email") == null ? null : String.valueOf(req.get("email")).trim();
        // The link lives in TWO mirror columns: stakeholders.user_id (directory side) and
        // users.stakeholder_id (what JurisdictionScope.currentStakeholderId() and every partner
        // self-identity guard reads). Every branch below writes BOTH sides.
        if (email == null || email.isBlank()) {
            jdbc.update("update public.users set stakeholder_id = null, updated_at = now() where stakeholder_id = ?", id);
            jdbc.update("update public.stakeholders set user_id = null, updated_at = now() where id = ?", id);
            return Map.of("id", id, "message", "Login unlinked from this partner.");
        }
        List<Long> uids = jdbc.queryForList(
                "select id from public.users where lower(email) = lower(?) order by id limit 1", Long.class, email);
        if (uids.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No user account found with that email.");
        }
        Long uid = uids.get(0);
        // A login belongs to one partner only (and a partner to one login): release the login from any
        // other stakeholder and this stakeholder from any other login, then set both mirror columns.
        jdbc.update("update public.stakeholders set user_id = null, updated_at = now() where user_id = ? and id <> ?", uid, id);
        jdbc.update("update public.users set stakeholder_id = null, updated_at = now() where stakeholder_id = ? and id <> ?", id, uid);
        jdbc.update("update public.stakeholders set user_id = ?, updated_at = now() where id = ?", uid, id);
        jdbc.update("update public.users set stakeholder_id = ?, updated_at = now() where id = ?", id, uid);
        return Map.of("id", id, "userId", uid, "message", "Login linked. The partner can now donate from Open Needs.");
    }

    private void find(long id) {
        Long n = jdbc.queryForObject("select count(*) from public.stakeholders where id = ?", Long.class, id);
        if (n == null || n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Stakeholder not found");
        }
    }

    private static String nz(String v, String dflt) {
        return (v == null || v.isBlank()) ? dflt : v;
    }

    private static String str(Object v) {
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isBlank() || "null".equalsIgnoreCase(s) ? null : s;
    }

    private static Long lng(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(v));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
