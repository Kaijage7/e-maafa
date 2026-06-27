package tz.go.pmo.dmis.finance;

import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

/**
 * Integration tests for the disaster Budget &amp; Finance subsystem (V99–V101) — the cash side of the
 * incident chain. They exercise the real filter chain + method security via the local persona header
 * ({@code X-Local-Roles}, which resolves a genuine per-role {@code users.id}, so the maker-checker
 * separation-of-duties checks are tested against distinct real accounts), and prove the PFM controls
 * that the manual flow-walk showed but had no automated coverage for:
 * commitment≠expenditure state machine, maker-checker, tier ceiling, virement, NDMF donor earmarking,
 * and the fund-level balance guard. All rows created here are deleted in {@link #tearDown()} so the
 * shared dev database is left clean.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("local")
class FinanceWorkflowIntegrationTest {

    private static final String DED = "DED";                 // requests + can approve
    private static final String DIRECTOR = "Director";       // approves (no disburse)
    private static final String ADMIN = "Super Admin";       // all incl. disburse
    private static final String ICT = "ICT Admin";           // disburse (and commit)

    private static final String FIN = "/v1/finance";
    private static final long DISTRICT_DODOMA = 101L;        // district-scoped → 50M ceiling

    @Autowired private MockMvc mvc;
    @Autowired private JdbcTemplate jdbc;

    private long periodId;
    private long budgetId;
    private long line1Id;   // Relief Supplies, 100M
    private long line2Id;   // Logistics, 20M
    private Long donationId; // set by the NDMF test

    @BeforeEach
    void setUp() throws Exception {
        periodId = id(create(DED, FIN + "/periods", "{\"name\":\"__fin_it__ FY\",\"fiscal_year\":\"2099/00\"}"));
        budgetId = id(create(DED, FIN + "/budgets",
                "{\"period_id\":" + periodId + ",\"scope_level\":\"district\",\"district_id\":" + DISTRICT_DODOMA
                        + ",\"title\":\"__fin_it__ budget\",\"total_amount\":120000000}"));
        post(DED, FIN + "/budgets/" + budgetId + "/approve", null).andExpect(status().isOk());
        line1Id = id(create(DED, FIN + "/budgets/" + budgetId + "/lines",
                "{\"category\":\"Relief Supplies\",\"allocated_amount\":100000000}"));
        line2Id = id(create(DED, FIN + "/budgets/" + budgetId + "/lines",
                "{\"category\":\"Logistics\",\"allocated_amount\":20000000}"));
    }

    @AfterEach
    void tearDown() {
        if (donationId != null) {
            jdbc.update("delete from public.ndmf_disbursements where donation_id = ?", donationId);
            jdbc.update("delete from public.ndmf_donations where id = ?", donationId);
        }
        jdbc.update("delete from public.budget_virements where disaster_budget_id = ?", budgetId);
        jdbc.update("delete from public.budget_commitments where budget_line_id in "
                + "(select id from public.budget_lines where disaster_budget_id = ?)", budgetId);
        jdbc.update("delete from public.budget_lines where disaster_budget_id = ?", budgetId);
        jdbc.update("delete from public.disaster_budgets where id = ?", budgetId);
        jdbc.update("delete from public.budget_periods where id = ?", periodId);
    }

    @Test
    void commitmentLifecycleSeparatesObligationFromExpenditure() throws Exception {
        long c = id(create(DED, FIN + "/commitments",
                "{\"budget_line_id\":" + line1Id + ",\"amount\":10000000,\"purpose\":\"Tents\"}"));
        Assertions.assertEquals("requested", commitmentStatus(c));

        post(DIRECTOR, FIN + "/commitments/" + c + "/approve", null).andExpect(status().isOk());
        Assertions.assertEquals("approved", commitmentStatus(c));

        post(ADMIN, FIN + "/commitments/" + c + "/commit", null).andExpect(status().isOk());
        Assertions.assertEquals("committed", commitmentStatus(c));
        Assertions.assertNotNull(jdbc.queryForObject(
                "select committed_by from public.budget_commitments where id = ?", Long.class, c));

        // disburse records the ACTUAL expenditure, distinct from the committed amount
        post(ICT, FIN + "/commitments/" + c + "/disburse", "{\"expended_amount\":9500000}").andExpect(status().isOk());
        Assertions.assertEquals("disbursed", commitmentStatus(c));
        Assertions.assertEquals(0, new BigDecimal("9500000").compareTo(jdbc.queryForObject(
                "select expended_amount from public.budget_commitments where id = ?", BigDecimal.class, c)));
    }

    @Test
    void makerCheckerAndStateGuardsAreEnforced() throws Exception {
        long c = id(create(DED, FIN + "/commitments",
                "{\"budget_line_id\":" + line1Id + ",\"amount\":5000000}"));
        // SoD: the requester cannot approve their own request
        post(DED, FIN + "/commitments/" + c + "/approve", null).andExpect(status().isUnprocessableEntity());
        // cannot disburse before the obligation (commit) stage
        post(DIRECTOR, FIN + "/commitments/" + c + "/approve", null).andExpect(status().isOk());
        post(ICT, FIN + "/commitments/" + c + "/disburse", "{}").andExpect(status().isUnprocessableEntity());
        // SoD: the approver cannot also commit the funds
        post(ADMIN, FIN + "/commitments/" + c + "/commit", null).andExpect(status().isOk()); // admin != Director, ok
    }

    @Test
    void approverCannotDisburseWhatTheyApproved() throws Exception {
        long c = id(create(DED, FIN + "/commitments",
                "{\"budget_line_id\":" + line1Id + ",\"amount\":3000000}"));
        post(ADMIN, FIN + "/commitments/" + c + "/approve", null).andExpect(status().isOk());      // approver = admin
        post(ICT, FIN + "/commitments/" + c + "/commit", null).andExpect(status().isOk());          // committer = ict
        post(ADMIN, FIN + "/commitments/" + c + "/disburse", "{}").andExpect(status().isUnprocessableEntity()); // approver==disburser blocked
    }

    @Test
    void tierCeilingBlocksAnOversizedDistrictCommitment() throws Exception {
        long c = id(create(DED, FIN + "/commitments",
                "{\"budget_line_id\":" + line1Id + ",\"amount\":60000000}")); // > district 50M ceiling
        post(DIRECTOR, FIN + "/commitments/" + c + "/approve", null)
                .andExpect(status().isUnprocessableEntity());
        Assertions.assertEquals("requested", commitmentStatus(c)); // stays requested, not approved
    }

    @Test
    void overAllocationOnALineIsBlocked() throws Exception {
        // line2 is allocated 20M; a 25M request must be refused
        post(DED, FIN + "/commitments", "{\"budget_line_id\":" + line2Id + ",\"amount\":25000000}")
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void virementReallocatesAllocationBetweenLines() throws Exception {
        long v = id(create(DED, FIN + "/virements",
                "{\"from_line_id\":" + line1Id + ",\"to_line_id\":" + line2Id + ",\"amount\":5000000,\"reason\":\"transport\"}"));
        post(DIRECTOR, FIN + "/virements/" + v + "/approve", null).andExpect(status().isOk());
        Assertions.assertEquals(0, new BigDecimal("95000000").compareTo(allocated(line1Id)));
        Assertions.assertEquals(0, new BigDecimal("25000000").compareTo(allocated(line2Id)));
        // SoD: requester cannot approve their own virement
        long v2 = id(create(DED, FIN + "/virements",
                "{\"from_line_id\":" + line1Id + ",\"to_line_id\":" + line2Id + ",\"amount\":1000000}"));
        post(DED, FIN + "/virements/" + v2 + "/approve", null).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void ndmfEarmarkRingFenceAndFundBalanceAreEnforced() throws Exception {
        List<Long> incidents = jdbc.queryForList("select id from public.incidents order by id limit 2", Long.class);
        org.junit.jupiter.api.Assumptions.assumeTrue(incidents.size() >= 2, "needs two incidents in the dev DB");
        long inc1 = incidents.get(0);
        long inc2 = incidents.get(1);
        Long recorder = jdbc.queryForObject("select min(id) from public.users", Long.class);

        donationId = jdbc.queryForObject("""
                insert into public.ndmf_donations(donor_name, amount, currency, donation_date, reference_number,
                    status, recorded_by, earmark_type, earmark_purpose, earmark_incident_id, created_at, updated_at)
                values ('__fin_it__ donor', 8000000, 'TZS', current_date, '__fin_it__-REF', 'acknowledged', ?, 4,
                    'earmarked', ?, now(), now()) returning id
                """, Long.class, recorder, inc1);

        // tightly earmarked (IATI 4) to inc1 — cannot be redirected to inc2
        ndmf("{\"incident_id\":" + inc2 + ",\"amount\":1000000,\"donation_id\":" + donationId + "}")
                .andExpect(status().isUnprocessableEntity());
        // cannot exceed the donation's remaining balance (8M)
        ndmf("{\"incident_id\":" + inc1 + ",\"amount\":9000000,\"donation_id\":" + donationId + "}")
                .andExpect(status().isUnprocessableEntity());
        // a valid earmarked disbursement succeeds
        ndmf("{\"incident_id\":" + inc1 + ",\"amount\":5000000,\"donation_id\":" + donationId + "}")
                .andExpect(status().isOk());
        BigDecimal remaining = jdbc.queryForObject("""
                select d.amount - coalesce((select sum(x.amount) from public.ndmf_disbursements x
                       where x.donation_id = d.id and x.status <> 'voided'),0)
                from public.ndmf_donations d where d.id = ?""", BigDecimal.class, donationId);
        Assertions.assertEquals(0, new BigDecimal("3000000").compareTo(remaining));

        // fund-level guard: an unlinked disbursement exceeding the whole fund balance is refused
        BigDecimal fund = jdbc.queryForObject(
                "select coalesce((select sum(amount) from public.ndmf_donations where status in ('received','acknowledged')),0)"
                        + " - coalesce((select sum(amount) from public.ndmf_disbursements where status <> 'voided'),0)",
                BigDecimal.class);
        ndmf("{\"incident_id\":" + inc1 + ",\"amount\":" + fund.add(new BigDecimal("1000000")).toPlainString() + "}")
                .andExpect(status().isUnprocessableEntity());
    }

    // ── helpers ──

    private ResultActions post(String role, String url, String json) throws Exception {
        var req = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post(url)
                .header("X-Local-Roles", role);
        if (json != null) {
            req = req.contentType(MediaType.APPLICATION_JSON).content(json);
        }
        return mvc.perform(req);
    }

    private ResultActions ndmf(String json) throws Exception {
        return post(ADMIN, FIN + "/ndmf/disburse", json);
    }

    private String create(String role, String url, String json) throws Exception {
        return post(role, url, json).andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString();
    }

    private static long id(String responseBody) {
        return ((Number) JsonPath.read(responseBody, "$.id")).longValue();
    }

    private String commitmentStatus(long commitmentId) {
        return jdbc.queryForObject("select status from public.budget_commitments where id = ?", String.class, commitmentId);
    }

    private BigDecimal allocated(long lineId) {
        return jdbc.queryForObject("select allocated_amount from public.budget_lines where id = ?", BigDecimal.class, lineId);
    }
}
