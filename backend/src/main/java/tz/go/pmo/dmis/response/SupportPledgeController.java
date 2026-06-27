package tz.go.pmo.dmis.response;

import java.math.BigDecimal;
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
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Donor / partner SUPPORT pledges. The partner portal's funding side: a donor sees ONLY the prevention /
 * preparedness items that need support — mitigation measures (DRR priorities) and unfunded trainings, from
 * anywhere — and pledges ITS OWN contribution (cash or in-kind). PMO staff then review and accept/decline;
 * accepting marks the item funded so it leaves the feed. A donor sees only its own pledges; staff see all.
 */
@RestController
@RequestMapping("/v1/response/support")
public class SupportPledgeController {

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;
    private final CurrentUserResolver currentUser;

    public SupportPledgeController(JdbcTemplate jdbc, JurisdictionScope jurisdiction, CurrentUserResolver currentUser) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
        this.currentUser = currentUser;
    }

    /** The discovery feed donors see: measures + trainings needing support (from anywhere — donors help any area). */
    @GetMapping("/needs")
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> needs() {
        List<Map<String, Object>> measures = jdbc.queryForList("""
                select m.id, m.title, m.priority, m.budget, m.additional_support_required,
                       m.implementing_institution, m.type_of_mitigation, m.project_status,
                       coalesce((select sum(p.amount) from public.support_pledges p
                                 where p.mitigation_measure_id = m.id and p.status in ('pledged','accepted')),0) as pledged_total
                from public.mitigation_measures m
                where m.approval_status = 'approved' and m.support_funded_at is null
                  and m.additional_support_required is not null and btrim(m.additional_support_required) <> ''
                  and lower(m.additional_support_required) not in ('no','none','n/a')
                order by case m.priority when 'High' then 0 when 'Medium' then 1 else 2 end, m.id desc
                """);
        List<Map<String, Object>> trainings = jdbc.queryForList("""
                select id, training_id, training_title, implementing_institution, objective,
                       geographical_scope, targeted_audience, venue, training_start_date, training_end_date, support_requested_at,
                       coalesce((select sum(p.amount) from public.support_pledges p
                                 where p.training_plan_id = training_plans.id and p.status in ('pledged','accepted')),0) as pledged_total
                from public.training_plans
                where support_requested_at is not null and (source_of_fund is null or source_of_fund = '')
                order by support_requested_at desc
                """);
        Long myStakeholder = jurisdiction.currentStakeholderId();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("measures", measures);
        out.put("trainings", trainings);
        out.put("stats", Map.of("measures", measures.size(), "trainings", trainings.size(),
                "canPledge", myStakeholder != null));
        return out;
    }

    /** A donor pledges its OWN contribution toward a measure or training. Staff may pledge on a partner's behalf. */
    @PostMapping("/pledges")
    @PreAuthorize("hasAuthority('resource_allocation.request')")
    @Transactional
    public Map<String, Object> pledge(@RequestBody Map<String, Object> b) {
        String type = req(b, "target_type");
        if (!type.equals("measure") && !type.equals("training")) {
            throw new BusinessRuleException("target_type must be 'measure' or 'training'.");
        }
        Long measureId = type.equals("measure") ? lng(req(b, "mitigation_measure_id")) : null;
        Long trainingId = type.equals("training") ? lng(req(b, "training_plan_id")) : null;
        if (measureId != null && one("select id from public.mitigation_measures where id = ? and support_funded_at is null", measureId) == null) {
            throw new BusinessRuleException("That measure is not open for support.");
        }
        if (trainingId != null && one("select id from public.training_plans where id = ? and (source_of_fund is null or source_of_fund = '')", trainingId) == null) {
            throw new BusinessRuleException("That training is not open for support.");
        }
        // The donor pledges as ITS OWN stakeholder; staff (no stakeholder link) must name the partner.
        Long stakeholderId = jurisdiction.currentStakeholderId();
        if (stakeholderId == null) {
            stakeholderId = lng(b.get("stakeholder_id"));
            if (stakeholderId == null) {
                throw new BusinessRuleException("Choose the donating partner organisation.");
            }
        }
        String contrib = b.get("contribution_type") == null ? "cash" : str(b.get("contribution_type"));
        if (!"cash".equals(contrib) && !"in_kind".equals(contrib)) {
            throw new BusinessRuleException("contribution_type must be 'cash' or 'in_kind'.");
        }
        BigDecimal amount = dec(b.get("amount"));
        if ("cash".equals(contrib) && (amount == null || amount.signum() <= 0)) {
            throw new BusinessRuleException("A positive amount is required for a cash pledge.");
        }
        Long id = jdbc.queryForObject("""
                insert into public.support_pledges(target_type, mitigation_measure_id, training_plan_id, stakeholder_id,
                    contribution_type, amount, currency, description, status, pledged_by, created_at, updated_at)
                values (?,?,?,?,?,?, coalesce(?,'TZS'), ?, 'pledged', ?, now(), now()) returning id
                """, Long.class, type, measureId, trainingId, stakeholderId, contrib, amount,
                str(b.get("currency")), str(b.get("description")), me());
        return Map.of("success", true, "id", id, "message", "Thank you — your pledge has been recorded for PMO review.");
    }

    /** Pledges: a donor sees ONLY its own; PMO staff see all (the review queue). */
    @GetMapping("/pledges")
    @PreAuthorize("hasAuthority('resource_allocation.view')")
    public Map<String, Object> pledges() {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> params = new ArrayList<>();
        Long myStakeholder = jurisdiction.currentStakeholderId();
        if (myStakeholder != null) {
            where.append(" and p.stakeholder_id = ?");
            params.add(myStakeholder);
        }
        List<Map<String, Object>> rows = jdbc.queryForList("select p.*, s.name as stakeholder_name,"
                + " m.title as measure_title, t.training_title as training_title,"
                + " pu.name as pledged_by_name, ru.name as reviewed_by_name"
                + " from public.support_pledges p"
                + " join public.stakeholders s on s.id = p.stakeholder_id"
                + " left join public.mitigation_measures m on m.id = p.mitigation_measure_id"
                + " left join public.training_plans t on t.id = p.training_plan_id"
                + " left join public.users pu on pu.id = p.pledged_by"
                + " left join public.users ru on ru.id = p.reviewed_by"
                + " where " + where + " order by case p.status when 'pledged' then 0 else 1 end, p.created_at desc",
                params.toArray());
        return Map.of("pledges", rows);
    }

    /** PMO staff ACCEPTS a pledge → the item is marked funded and leaves the donor feed. */
    @PostMapping("/pledges/{id}/accept")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @Transactional
    public Map<String, Object> accept(@PathVariable long id, @RequestBody(required = false) Map<String, Object> b) {
        Map<String, Object> p = one("select target_type, mitigation_measure_id, training_plan_id, status from public.support_pledges where id = ?", id);
        if (p == null) {
            throw new ResourceNotFoundException("Pledge not found.");
        }
        if (!"pledged".equals(p.get("status"))) {
            throw new BusinessRuleException("Only a pending pledge can be accepted.");
        }
        jdbc.update("update public.support_pledges set status='accepted', reviewed_by=?, reviewed_at=now(), review_note=?, updated_at=now() where id=?",
                me(), b == null ? null : str(b.get("note")), id);
        if ("measure".equals(p.get("target_type")) && p.get("mitigation_measure_id") != null) {
            jdbc.update("update public.mitigation_measures set support_funded_at = now(), updated_at = now() where id = ?", lng(p.get("mitigation_measure_id")));
        } else if ("training".equals(p.get("target_type")) && p.get("training_plan_id") != null) {
            jdbc.update("update public.training_plans set source_of_fund = coalesce(nullif(source_of_fund,''), 'Stakeholder pledge'), updated_at = now() where id = ?", lng(p.get("training_plan_id")));
        }
        return Map.of("success", true, "message", "Pledge accepted — the item is now funded.");
    }

    @PostMapping("/pledges/{id}/decline")
    @PreAuthorize("hasAuthority('resource_allocation.approve')")
    @Transactional
    public Map<String, Object> decline(@PathVariable long id, @RequestBody(required = false) Map<String, Object> b) {
        if (jdbc.update("update public.support_pledges set status='declined', reviewed_by=?, reviewed_at=now(), review_note=?, updated_at=now() where id=? and status='pledged'",
                me(), b == null ? null : str(b.get("note")), id) == 0) {
            throw new BusinessRuleException("Only a pending pledge can be declined.");
        }
        return Map.of("success", true, "message", "Pledge declined.");
    }

    // ── helpers ──
    private Long me() { return currentUser.actingUserId(); }

    private Map<String, Object> one(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    private static String req(Map<String, Object> b, String key) {
        Object v = b == null ? null : b.get(key);
        String s = v == null ? null : String.valueOf(v).trim();
        if (s == null || s.isEmpty()) {
            throw new BusinessRuleException("The field '" + key + "' is required.");
        }
        return s;
    }

    private static String str(Object v) {
        if (v == null) { return null; }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Long lng(Object v) {
        if (v == null) { return null; }
        if (v instanceof Number n) { return n.longValue(); }
        try { return Long.valueOf(String.valueOf(v).trim()); } catch (NumberFormatException e) { return null; }
    }

    private static BigDecimal dec(Object v) {
        if (v == null) { return null; }
        if (v instanceof Number n) { return new BigDecimal(n.toString()); }
        try { return new BigDecimal(String.valueOf(v).trim()); } catch (NumberFormatException e) { return null; }
    }
}
