package tz.go.pmo.dmis.finance;

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
import tz.go.pmo.dmis.common.security.AreaGuard;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Disaster Budget &amp; Finance (full budgeting) — the cash side of the resource-mobilization flow
 * (INCIDENT-WORKFLOW-PLAN.md). Fiscal periods → tier-scoped budgets → line-item allocations → commitments
 * against an incident under maker-checker: a Planning Officer REQUESTS the spend, the tier executive
 * (DED / RAS) APPROVES it, and a Logistic Officer DISBURSES it (three distinct authorities). Plus the NDMF
 * path: donor/stakeholder cash disbursed to a specific incident. Budgets are area-scoped — a district
 * executive sees their own district's budgets (or shared/national); the national tier sees all.
 */
@RestController
@RequestMapping("/v1/finance")
public class BudgetController {

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;
    private final CurrentUserResolver currentUser;
    private final AreaGuard areaGuard;

    public BudgetController(JdbcTemplate jdbc, JurisdictionScope jurisdiction, CurrentUserResolver currentUser,
            AreaGuard areaGuard) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
        this.currentUser = currentUser;
        this.areaGuard = areaGuard;
    }

    // ─── Periods ───

    @GetMapping("/periods")
    @PreAuthorize("hasAuthority('budget_and_finance.view')")
    public Map<String, Object> periods() {
        return Map.of("periods", jdbc.queryForList(
                "select id, name, fiscal_year, start_date, end_date, status, is_active from public.budget_periods order by start_date desc nulls last, id desc"));
    }

    @PostMapping("/periods")
    @PreAuthorize("hasAuthority('budget_and_finance.manage')")
    @Transactional
    public Map<String, Object> createPeriod(@RequestBody Map<String, Object> b) {
        String name = req(b, "name");
        Long id = jdbc.queryForObject("""
                insert into public.budget_periods(name, fiscal_year, start_date, end_date, status, is_active, created_at, updated_at)
                values (?,?,?::date,?::date,'open', true, now(), now()) returning id
                """, Long.class, name, str(b.get("fiscal_year")), str(b.get("start_date")), str(b.get("end_date")));
        return Map.of("success", true, "id", id);
    }

    // ─── Budgets ───

    /** Area-scoped budgets + a roll-up (allocated / committed / disbursed). */
    @GetMapping("/budgets")
    @PreAuthorize("hasAuthority('budget_and_finance.view')")
    public Map<String, Object> budgets() {
        StringBuilder sql = new StringBuilder("""
                select db.id, db.title, db.scope_level, db.district_id, db.region_id, db.total_amount, db.currency,
                       db.status, p.name as period_name, d.name as district_name, rg.name as region_name,
                       coalesce((select sum(bl.allocated_amount) from public.budget_lines bl where bl.disaster_budget_id = db.id),0) as allocated,
                       coalesce((select sum(c.amount) from public.budget_commitments c
                                 join public.budget_lines bl2 on bl2.id = c.budget_line_id
                                 where bl2.disaster_budget_id = db.id and c.status in ('approved','committed','disbursed')),0) as committed,
                       coalesce((select sum(coalesce(c.expended_amount, c.amount)) from public.budget_commitments c
                                 join public.budget_lines bl3 on bl3.id = c.budget_line_id
                                 where bl3.disaster_budget_id = db.id and c.status = 'disbursed'),0) as disbursed
                from public.disaster_budgets db
                join public.budget_periods p on p.id = db.period_id
                left join public.districts d on d.id = db.district_id
                left join public.regions rg on rg.id = db.region_id
                where 1=1""");
        List<Object> params = new ArrayList<>();
        jurisdiction.appendAreaScopeSharedOrOwn("db", sql, params);
        sql.append(" order by db.created_at desc");
        return Map.of("budgets", jdbc.queryForList(sql.toString(), params.toArray()));
    }

    @PostMapping("/budgets")
    @PreAuthorize("hasAuthority('budget_and_finance.manage')")
    @Transactional
    public Map<String, Object> createBudget(@RequestBody Map<String, Object> b) {
        Long periodId = lng(req(b, "period_id"));
        String scope = req(b, "scope_level");           // district | region | national
        // Bind the area to the caller: a sub-national executive can only create budgets in their OWN area;
        // body-supplied region/district is ignored. Only the national tier may set the area from the body.
        Long districtId = lng(b.get("district_id"));
        Long regionId = lng(b.get("region_id"));
        JurisdictionScope.Tier tier = jurisdiction.currentTier();
        if (tier == JurisdictionScope.Tier.REGION || tier == JurisdictionScope.Tier.DISTRICT) {
            Map<String, Object> area = jurisdiction.currentArea();
            districtId = lng(area.get("district_id"));
            regionId = lng(area.get("region_id"));
        }
        Long id = jdbc.queryForObject("""
                insert into public.disaster_budgets(period_id, scope_level, district_id, region_id, title, total_amount,
                    currency, status, created_by, created_at, updated_at)
                values (?,?,?,?,?,?, coalesce(?,'TZS'), 'draft', ?, now(), now()) returning id
                """, Long.class, periodId, scope, districtId, regionId,
                str(b.get("title")), dec(b.get("total_amount")), str(b.get("currency")), me());
        return Map.of("success", true, "id", id);
    }

    @GetMapping("/budgets/{id}")
    @PreAuthorize("hasAuthority('budget_and_finance.view')")
    public Map<String, Object> budget(@PathVariable long id) {
        areaGuard.assertOwnOrShared("public.disaster_budgets", id);   // 404 if cross-area
        Map<String, Object> budget = one("select db.*, p.name as period_name from public.disaster_budgets db "
                + "join public.budget_periods p on p.id = db.period_id where db.id = ?", id);
        List<Map<String, Object>> lines = jdbc.queryForList("""
                select bl.id, bl.category, bl.description, bl.allocated_amount,
                       coalesce((select sum(c.amount) from public.budget_commitments c where c.budget_line_id = bl.id and c.status in ('approved','committed','disbursed')),0) as committed,
                       coalesce((select sum(coalesce(c.expended_amount, c.amount)) from public.budget_commitments c where c.budget_line_id = bl.id and c.status = 'disbursed'),0) as disbursed
                from public.budget_lines bl where bl.disaster_budget_id = ? order by bl.id
                """, id);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("budget", budget);
        out.put("lines", lines);
        out.put("commitments", jdbc.queryForList("""
                select c.id, c.amount, c.expended_amount, c.purpose, c.payee, c.status, c.incident_id,
                       bl.category as line_category, i.title as incident_title, ru.name as requested_by_name,
                       au.name as approved_by_name, cu.name as committed_by_name, du.name as disbursed_by_name
                from public.budget_commitments c
                join public.budget_lines bl on bl.id = c.budget_line_id
                left join public.incidents i on i.id = c.incident_id
                left join public.users ru on ru.id = c.requested_by
                left join public.users au on au.id = c.approved_by
                left join public.users cu on cu.id = c.committed_by
                left join public.users du on du.id = c.disbursed_by
                where bl.disaster_budget_id = ? order by c.created_at desc
                """, id));
        out.put("virements", jdbc.queryForList("""
                select v.id, v.amount, v.reason, v.status, v.from_line_id, v.to_line_id,
                       fl.category as from_category, tl.category as to_category,
                       ru.name as requested_by_name, au.name as approved_by_name, v.created_at
                from public.budget_virements v
                join public.budget_lines fl on fl.id = v.from_line_id
                join public.budget_lines tl on tl.id = v.to_line_id
                left join public.users ru on ru.id = v.requested_by
                left join public.users au on au.id = v.approved_by
                where v.disaster_budget_id = ? order by v.created_at desc
                """, id));
        return out;
    }

    @PostMapping("/budgets/{id}/approve")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    @Transactional
    public Map<String, Object> approveBudget(@PathVariable long id) {
        areaGuard.assertOwnOrShared("public.disaster_budgets", id);   // 404 if cross-area
        if (jdbc.update("update public.disaster_budgets set status='active', approved_by=?, approved_at=now(), updated_at=now() "
                + "where id=? and status in ('draft','approved')", me(), id) == 0) {
            throw new BusinessRuleException("Budget not found or not in an approvable state.");
        }
        return Map.of("success", true, "message", "Budget approved and active.");
    }

    @PostMapping("/budgets/{id}/lines")
    @PreAuthorize("hasAuthority('budget_and_finance.manage')")
    @Transactional
    public Map<String, Object> addLine(@PathVariable long id, @RequestBody Map<String, Object> b) {
        areaGuard.assertOwnOrShared("public.disaster_budgets", id);   // 404 if missing or cross-area
        Long lineId = jdbc.queryForObject("""
                insert into public.budget_lines(disaster_budget_id, category, description, allocated_amount, created_at, updated_at)
                values (?,?,?,?, now(), now()) returning id
                """, Long.class, id, req(b, "category"), str(b.get("description")), dec(b.get("allocated_amount")));
        return Map.of("success", true, "id", lineId);
    }

    // ─── Commitments (maker-checker) ───

    /** Planning Officer REQUESTS a spend against a line for an incident. Blocked if it overspends the line. */
    @PostMapping("/commitments")
    @PreAuthorize("hasAuthority('budget_and_finance.manage')")
    @Transactional
    public Map<String, Object> request(@RequestBody Map<String, Object> b) {
        Long lineId = lng(req(b, "budget_line_id"));
        BigDecimal amount = dec(req(b, "amount"));
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("A positive amount is required.");
        }
        // Scope the line by its parent budget's area (budget_line -> disaster_budget); 404 if cross-area.
        areaGuard.assertParentOwnOrShared("public.budget_lines", "disaster_budget_id",
                "public.disaster_budgets", lineId);
        // Lock the line row so concurrent commitments serialize — without this, two requests can both
        // pass the remaining-allocation check and overspend the line (TOCTOU).
        Map<String, Object> line = one("select allocated_amount from public.budget_lines where id = ? for update", lineId);
        BigDecimal allocated = dec(line.get("allocated_amount"));
        BigDecimal already = dec(jdbc.queryForObject(
                "select coalesce(sum(amount),0) from public.budget_commitments where budget_line_id = ? and status in ('requested','approved','committed','disbursed')",
                BigDecimal.class, lineId));
        if (allocated != null && already.add(amount).compareTo(allocated) > 0) {
            throw new BusinessRuleException("This commitment exceeds the remaining allocation on the budget line ("
                    + allocated.subtract(already) + " left).");
        }
        Long id = jdbc.queryForObject("""
                insert into public.budget_commitments(budget_line_id, incident_id, amount, purpose, payee, status,
                    requested_by, created_at, updated_at)
                values (?,?,?,?,?, 'requested', ?, now(), now()) returning id
                """, Long.class, lineId, lng(b.get("incident_id")), amount, str(b.get("purpose")), str(b.get("payee")), me());
        return Map.of("success", true, "id", id, "message", "Spend requested — awaiting approval.");
    }

    /**
     * DED / RAS APPROVES (authorises) the commitment. Maker-checker: cannot approve one you requested.
     * Tier ceiling: an amount above the configured threshold for the budget's tier must escalate higher.
     */
    @PostMapping("/commitments/{id}/approve")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    @Transactional
    public Map<String, Object> approveCommitment(@PathVariable long id) {
        Map<String, Object> c = one("""
                select c.status, c.requested_by, c.amount, db.scope_level, db.id as budget_id
                from public.budget_commitments c
                join public.budget_lines bl on bl.id = c.budget_line_id
                join public.disaster_budgets db on db.id = bl.disaster_budget_id
                where c.id = ?""", id);
        // Scope via the owning budget (commitment -> budget_line -> disaster_budget); 404 if cross-area.
        areaGuard.assertOwnOrShared("public.disaster_budgets", lng(c.get("budget_id")));
        if (!"requested".equals(c.get("status"))) {
            throw new BusinessRuleException("Only a requested commitment can be approved.");
        }
        if (me() != null && me().equals(lng(c.get("requested_by")))) {
            throw new BusinessRuleException("Separation of duties: you cannot approve a spend you requested.");
        }
        BigDecimal amount = dec(c.get("amount"));
        BigDecimal ceiling = tierCeiling(str(c.get("scope_level")));
        if (ceiling != null && amount != null && amount.compareTo(ceiling) > 0) {
            throw new BusinessRuleException("This commitment (" + amount + ") exceeds the " + c.get("scope_level")
                    + "-tier approval ceiling of " + ceiling + " — fund it from a higher-tier (region or national) "
                    + "budget, or have an authorized officer raise the ceiling.");
        }
        jdbc.update("update public.budget_commitments set status='approved', approved_by=?, approved_at=now(), updated_at=now() where id=?", me(), id);
        return Map.of("success", true, "message", "Commitment approved — awaiting obligation.");
    }

    /**
     * Logistic Officer COMMITS (obligates / encumbers) the approved funds — the distinct commitment stage
     * (IMF/PEFA/IPSAS 24) that reserves the budget before any cash moves. SoD: cannot be the approver.
     */
    @PostMapping("/commitments/{id}/commit")
    @PreAuthorize("hasAuthority('budget_and_finance.disburse')")
    @Transactional
    public Map<String, Object> commit(@PathVariable long id) {
        assertCommitmentInArea(id);   // 404 if cross-area
        Map<String, Object> c = one("select status, requested_by, approved_by from public.budget_commitments where id = ?", id);
        if (!"approved".equals(c.get("status"))) {
            throw new BusinessRuleException("Only an approved commitment can be obligated.");
        }
        // Three distinct authorities: neither the requester nor the approver may obligate the funds.
        if (me() != null && (me().equals(lng(c.get("approved_by"))) || me().equals(lng(c.get("requested_by"))))) {
            throw new BusinessRuleException("Separation of duties: the requester/approver cannot obligate the funds.");
        }
        jdbc.update("update public.budget_commitments set status='committed', committed_by=?, committed_at=now(), updated_at=now() where id=?", me(), id);
        return Map.of("success", true, "message", "Funds obligated (committed) — awaiting disbursement.");
    }

    /**
     * Logistic Officer DISBURSES (pays out) — the actual expenditure, recorded distinctly from the
     * obligation. Optional 'expended_amount' captures a payment that differs from the committed amount.
     */
    @PostMapping("/commitments/{id}/disburse")
    @PreAuthorize("hasAuthority('budget_and_finance.disburse')")
    @Transactional
    public Map<String, Object> disburse(@PathVariable long id, @RequestBody(required = false) Map<String, Object> b) {
        assertCommitmentInArea(id);   // 404 if cross-area
        Map<String, Object> c = one("select status, amount, requested_by, approved_by from public.budget_commitments where id = ?", id);
        if (!"committed".equals(c.get("status"))) {
            throw new BusinessRuleException("Only an obligated (committed) commitment can be disbursed.");
        }
        // Three distinct authorities: neither the requester nor the approver may pay it out.
        if (me() != null && (me().equals(lng(c.get("approved_by"))) || me().equals(lng(c.get("requested_by"))))) {
            throw new BusinessRuleException("Separation of duties: the requester/approver cannot also disburse.");
        }
        BigDecimal expended = b == null ? null : dec(b.get("expended_amount"));
        if (expended == null) {
            expended = dec(c.get("amount"));   // default the actual expenditure to the committed amount
        }
        jdbc.update("update public.budget_commitments set status='disbursed', expended_amount=?, disbursed_by=?, disbursed_at=now(), updated_at=now() where id=?",
                expended, me(), id);
        return Map.of("success", true, "message", "Commitment disbursed (paid).");
    }

    @PostMapping("/commitments/{id}/reject")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    @Transactional
    public Map<String, Object> reject(@PathVariable long id, @RequestBody Map<String, Object> b) {
        assertCommitmentInArea(id);   // 404 if cross-area
        if (jdbc.update("update public.budget_commitments set status='rejected', reject_reason=?, approved_by=?, approved_at=now(), updated_at=now() "
                + "where id=? and status='requested'", req(b, "reason"), me(), id) == 0) {
            throw new BusinessRuleException("Only a requested commitment can be rejected.");
        }
        return Map.of("success", true, "message", "Commitment rejected.");
    }

    // ─── Virement (reallocation between budget lines) — an authorized budget change (IPSAS 24) ───

    /** Planning Officer REQUESTS moving allocation from one line to another (same budget). */
    @PostMapping("/virements")
    @PreAuthorize("hasAuthority('budget_and_finance.manage')")
    @Transactional
    public Map<String, Object> requestVirement(@RequestBody Map<String, Object> b) {
        Long fromLine = lng(req(b, "from_line_id"));
        Long toLine = lng(req(b, "to_line_id"));
        BigDecimal amount = dec(req(b, "amount"));
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("A positive amount is required.");
        }
        if (fromLine.equals(toLine)) {
            throw new BusinessRuleException("Choose two different budget lines.");
        }
        Map<String, Object> from = one("select disaster_budget_id, allocated_amount from public.budget_lines where id = ? for update", fromLine);
        Map<String, Object> to = one("select disaster_budget_id from public.budget_lines where id = ?", toLine);
        Long budgetId = lng(from.get("disaster_budget_id"));
        if (!budgetId.equals(lng(to.get("disaster_budget_id")))) {
            throw new BusinessRuleException("Both lines must belong to the same budget.");
        }
        // Scope via the owning budget; a sub-national officer cannot virement another area's budget. 404 if cross-area.
        areaGuard.assertOwnOrShared("public.disaster_budgets", budgetId);
        BigDecimal free = uncommitted(fromLine, dec(from.get("allocated_amount")));
        if (amount.compareTo(free) > 0) {
            throw new BusinessRuleException("The source line has only " + free + " uncommitted — cannot move " + amount + ".");
        }
        Long id = jdbc.queryForObject("""
                insert into public.budget_virements(disaster_budget_id, from_line_id, to_line_id, amount, reason,
                    status, requested_by, created_at, updated_at)
                values (?,?,?,?,?, 'requested', ?, now(), now()) returning id
                """, Long.class, budgetId, fromLine, toLine, amount, str(b.get("reason")), me());
        return Map.of("success", true, "id", id, "message", "Virement requested — awaiting approval.");
    }

    /** Approver authorises the virement; the allocation moves and the record stands as the disclosure. */
    @PostMapping("/virements/{id}/approve")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    @Transactional
    public Map<String, Object> approveVirement(@PathVariable long id) {
        // Scope via the virement's budget (budget_virements.disaster_budget_id); 404 if cross-area.
        areaGuard.assertParentOwnOrShared("public.budget_virements", "disaster_budget_id",
                "public.disaster_budgets", id);
        Map<String, Object> v = one("select status, from_line_id, to_line_id, amount, requested_by from public.budget_virements where id = ?", id);
        if (!"requested".equals(v.get("status"))) {
            throw new BusinessRuleException("Only a requested virement can be approved.");
        }
        if (me() != null && me().equals(lng(v.get("requested_by")))) {
            throw new BusinessRuleException("Separation of duties: you cannot approve a virement you requested.");
        }
        Long fromLine = lng(v.get("from_line_id"));
        BigDecimal amount = dec(v.get("amount"));
        Map<String, Object> from = one("select allocated_amount from public.budget_lines where id = ? for update", fromLine);
        BigDecimal free = uncommitted(fromLine, dec(from.get("allocated_amount")));
        if (amount.compareTo(free) > 0) {
            throw new BusinessRuleException("The source line now has only " + free + " uncommitted — cannot move " + amount + ".");
        }
        jdbc.update("update public.budget_lines set allocated_amount = allocated_amount - ?, updated_at = now() where id = ?", amount, fromLine);
        jdbc.update("update public.budget_lines set allocated_amount = allocated_amount + ?, updated_at = now() where id = ?", amount, lng(v.get("to_line_id")));
        jdbc.update("update public.budget_virements set status='approved', approved_by=?, approved_at=now(), updated_at=now() where id=?", me(), id);
        return Map.of("success", true, "message", "Virement approved — allocation reallocated.");
    }

    @PostMapping("/virements/{id}/reject")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    @Transactional
    public Map<String, Object> rejectVirement(@PathVariable long id, @RequestBody Map<String, Object> b) {
        // Scope via the virement's budget (budget_virements.disaster_budget_id); 404 if cross-area.
        areaGuard.assertParentOwnOrShared("public.budget_virements", "disaster_budget_id",
                "public.disaster_budgets", id);
        if (jdbc.update("update public.budget_virements set status='rejected', reject_reason=?, approved_by=?, approved_at=now(), updated_at=now() where id=? and status='requested'",
                req(b, "reason"), me(), id) == 0) {
            throw new BusinessRuleException("Only a requested virement can be rejected.");
        }
        return Map.of("success", true, "message", "Virement rejected.");
    }

    // ─── Tier approval thresholds (configurable ceilings; not hardcoded) ───

    @GetMapping("/thresholds")
    @PreAuthorize("hasAuthority('budget_and_finance.view')")
    public Map<String, Object> thresholds() {
        return Map.of("thresholds", jdbc.queryForList(
                "select scope_level, max_amount from public.budget_approval_thresholds order by max_amount nulls last"));
    }

    @PostMapping("/thresholds")
    @PreAuthorize("hasAuthority('budget_and_finance.approve')")
    @Transactional
    public Map<String, Object> setThreshold(@RequestBody Map<String, Object> b) {
        String scope = req(b, "scope_level");
        BigDecimal max = dec(b.get("max_amount"));   // null = unlimited
        jdbc.update("""
                insert into public.budget_approval_thresholds(scope_level, max_amount, created_at, updated_at)
                values (?,?, now(), now())
                on conflict (scope_level) do update set max_amount = excluded.max_amount, updated_at = now()
                """, scope, max);
        return Map.of("success", true, "message", "Threshold updated.");
    }

    // ─── NDMF: donor/stakeholder cash, earmarked (ring-fenced) and disbursed to a specific incident ───

    /** Donations with their earmark + remaining ring-fence balance, and the fund-level reconciliation summary. */
    @GetMapping("/ndmf/donations")
    @PreAuthorize("hasAuthority('budget_and_finance.view')")
    public Map<String, Object> ndmfDonations() {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("donations", jdbc.queryForList("""
                select d.id, d.donor_name, d.amount, d.currency, d.donation_date, d.purpose, d.status,
                       d.earmark_type, d.earmark_purpose, d.earmark_incident_id, i.title as earmark_incident_title,
                       coalesce((select sum(x.amount) from public.ndmf_disbursements x where x.donation_id = d.id and x.status <> 'voided'),0) as disbursed,
                       (d.amount - coalesce((select sum(x.amount) from public.ndmf_disbursements x where x.donation_id = d.id and x.status <> 'voided'),0)) as remaining
                from public.ndmf_donations d
                left join public.incidents i on i.id = d.earmark_incident_id
                order by d.donation_date desc nulls last, d.id desc
                """));
        BigDecimal received = dec(jdbc.queryForObject(
                "select coalesce(sum(amount),0) from public.ndmf_donations where status in ('received','acknowledged')", BigDecimal.class));
        BigDecimal disbursed = dec(jdbc.queryForObject(
                "select coalesce(sum(amount),0) from public.ndmf_disbursements where status <> 'voided'", BigDecimal.class));
        out.put("summary", Map.of("received", received, "disbursed", disbursed, "balance", fundBalance()));
        return out;
    }

    @PostMapping("/ndmf/disburse")
    @PreAuthorize("hasAuthority('budget_and_finance.disburse')")
    @Transactional
    public Map<String, Object> ndmfDisburse(@RequestBody Map<String, Object> b) {
        Long incidentId = lng(req(b, "incident_id"));
        BigDecimal amount = dec(req(b, "amount"));
        if (amount == null || amount.signum() <= 0) {
            throw new BusinessRuleException("A positive amount is required.");
        }
        // Serialize disbursements against the fund so the balance check below cannot be raced (TOCTOU).
        jdbc.query("select pg_advisory_xact_lock(?)", rs -> null, NDMF_FUND_LOCK);
        // Fund-level guard: total paid out cannot exceed total cash received into the fund — applies
        // whether or not a specific donation is linked (closes the unlinked-disbursement gap).
        BigDecimal fund = fundBalance();
        if (fund != null && amount.compareTo(fund) > 0) {
            throw new BusinessRuleException("This exceeds the available NDMF balance (" + fund + ").");
        }
        Long donationId = lng(b.get("donation_id"));
        if (donationId != null) {
            Map<String, Object> d = one("select status, earmark_type, earmark_incident_id from public.ndmf_donations where id = ?", donationId);
            // The cash must actually be in hand: a pledged/pending donation cannot be paid out yet.
            String dStatus = str(d.get("status"));
            if (!"received".equals(dStatus) && !"acknowledged".equals(dStatus)) {
                throw new BusinessRuleException("This donation is not yet received — only received/acknowledged funds can be disbursed.");
            }
            // Ring-fence: cannot disburse more than the donation still holds.
            BigDecimal remaining = dec(jdbc.queryForObject("""
                    select d.amount - coalesce((select sum(x.amount) from public.ndmf_disbursements x
                                                where x.donation_id = d.id and x.status <> 'voided'),0)
                    from public.ndmf_donations d where d.id = ?""", BigDecimal.class, donationId));
            if (remaining != null && amount.compareTo(remaining) > 0) {
                throw new BusinessRuleException("Only " + remaining + " remains undisbursed on this donation.");
            }
            // Tightly earmarked (IATI code 4) to a specific incident: cannot be redirected.
            Long earmarkType = lng(d.get("earmark_type"));
            Long earmarkIncident = lng(d.get("earmark_incident_id"));
            if (earmarkType != null && earmarkType == 4L && earmarkIncident != null && !earmarkIncident.equals(incidentId)) {
                throw new BusinessRuleException("This donation is tightly earmarked to incident #" + earmarkIncident + " and cannot be redirected.");
            }
        }
        Long id = jdbc.queryForObject("""
                insert into public.ndmf_disbursements(reference_number, purpose_type, amount, currency, disbursement_date,
                    status, incident_id, donation_id, payee, notes, disbursed_by, created_at, updated_at)
                values (coalesce(?, 'NDMF-' || to_char(now(),'YYYYMMDDHH24MISSMS')), 'incident_response', ?,
                    coalesce(?,'TZS'), current_date, 'paid', ?, ?, ?, ?, ?, now(), now()) returning id
                """, Long.class, str(b.get("reference_number")), amount, str(b.get("currency")), incidentId, donationId,
                str(b.get("payee")), str(b.get("notes")), me());
        return Map.of("success", true, "id", id, "message", "NDMF cash disbursed to incident #" + incidentId + ".");
    }

    // ── helpers ──

    /** Stable key for the per-fund advisory lock that serializes NDMF disbursements. */
    private static final long NDMF_FUND_LOCK = 740_111L;

    /** NDMF cash actually in hand: received/acknowledged donations minus all non-voided disbursements. */
    private BigDecimal fundBalance() {
        BigDecimal in = dec(jdbc.queryForObject(
                "select coalesce(sum(amount),0) from public.ndmf_donations where status in ('received','acknowledged')",
                BigDecimal.class));
        BigDecimal out = dec(jdbc.queryForObject(
                "select coalesce(sum(amount),0) from public.ndmf_disbursements where status <> 'voided'",
                BigDecimal.class));
        return (in == null ? BigDecimal.ZERO : in).subtract(out == null ? BigDecimal.ZERO : out);
    }

    /** Configured approval ceiling for a budget tier (null = unlimited / no row). */
    private BigDecimal tierCeiling(String scopeLevel) {
        if (scopeLevel == null) {
            return null;
        }
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select max_amount from public.budget_approval_thresholds where scope_level = ?", scopeLevel);
        return rows.isEmpty() ? null : dec(rows.get(0).get("max_amount"));
    }

    /** Allocation on a line not yet tied up by active commitments (requested → disbursed). */
    private BigDecimal uncommitted(long lineId, BigDecimal allocated) {
        BigDecimal used = dec(jdbc.queryForObject(
                "select coalesce(sum(amount),0) from public.budget_commitments where budget_line_id = ? and status in ('requested','approved','committed','disbursed')",
                BigDecimal.class, lineId));
        BigDecimal alloc = allocated == null ? BigDecimal.ZERO : allocated;
        return alloc.subtract(used == null ? BigDecimal.ZERO : used);
    }

    private Long me() {
        return currentUser.actingUserId();
    }

    /**
     * Scope a commitment by the area of its owning budget (commitment -&gt; budget_line -&gt; disaster_budget).
     * 404 if the commitment is missing or hangs off a budget outside the caller's area.
     */
    private void assertCommitmentInArea(long commitmentId) {
        Map<String, Object> c = one("""
                select bl.disaster_budget_id
                from public.budget_commitments c
                join public.budget_lines bl on bl.id = c.budget_line_id
                where c.id = ?""", commitmentId);
        areaGuard.assertOwnOrShared("public.disaster_budgets", lng(c.get("disaster_budget_id")));
    }

    private Map<String, Object> one(String sql, Object... args) {
        List<Map<String, Object>> rows = jdbc.queryForList(sql, args);
        if (rows.isEmpty()) {
            throw new ResourceNotFoundException("Record not found.");
        }
        return rows.get(0);
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
        if (v == null) {
            return null;
        }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }

    private static Long lng(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.longValue();
        }
        try {
            return Long.valueOf(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static BigDecimal dec(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return new BigDecimal(n.toString());
        }
        try {
            return new BigDecimal(String.valueOf(v).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
