package tz.go.pmo.dmis.stakeholder;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
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

    private final JdbcTemplate jdbc;
    private final tz.go.pmo.dmis.notification.ExternalDeliveryService delivery;
    private final tz.go.pmo.dmis.common.security.JurisdictionScope jurisdiction;
    private final tz.go.pmo.dmis.common.security.AreaLookup areaLookup;

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
    @Operation(summary = "Verify / unverify a partner (the verification workflow)")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @Transactional
    public Map<String, Object> verify(@PathVariable long id, @RequestBody Map<String, Object> req) {
        boolean verified = Boolean.parseBoolean(String.valueOf(req.getOrDefault("verified", "true")));
        jdbc.update("update public.stakeholders set is_verified=?,"
                + " verified_at = case when ? then now() end, updated_at=now() where id=?", verified, verified, id);
        if (verified) {
            // On approval, congratulate the partner on their OWN email + SMS, reusing the single
            // ExternalDeliveryService → MgovSmsService/MailService path (logs sms_logs/email_logs).
            List<Map<String, Object>> r = jdbc.queryForList(
                    "select name, email, phone from public.stakeholders where id=?", id);
            if (!r.isEmpty()) {
                String email = (String) r.get(0).get("email");
                String phone = (String) r.get(0).get("phone");
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
            }
        }
        return Map.of("id", id, "verified", verified, "message", verified ? "Partner verified" : "Verification revoked");
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
        if (email == null || email.isBlank()) {
            jdbc.update("update public.stakeholders set user_id = null, updated_at = now() where id = ?", id);
            return Map.of("id", id, "message", "Login unlinked from this partner.");
        }
        List<Long> uids = jdbc.queryForList(
                "select id from public.users where lower(email) = lower(?) order by id limit 1", Long.class, email);
        if (uids.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No user account found with that email.");
        }
        Long uid = uids.get(0);
        // A login belongs to one partner only: release it from any other stakeholder first.
        jdbc.update("update public.stakeholders set user_id = null, updated_at = now() where user_id = ? and id <> ?", uid, id);
        jdbc.update("update public.stakeholders set user_id = ?, updated_at = now() where id = ?", uid, id);
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
}
