package tz.go.pmo.dmis.service.impl;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.service.EconomicsOfDisasterService;

/**
 * Economics of Disaster — <b>formula-automated</b> economics from live DMIS tables only.
 *
 * <p>Nothing is hard-coded as a “placed” headline number. Every KPI is either:
 * <ul>
 *   <li>a live SQL aggregate (ledger / stock / plans / threats), or</li>
 *   <li>the result of a named deterministic formula with inputs substituted in
 *       {@code formulaAudit} (step → expression → result).</li>
 * </ul>
 *
 * <p>Forecast is recomputed on every request from trailing incident rates, seasonal factors,
 * threat pressure, preparedness dampener, and category shares. Not ML/AI.
 *
 * <p>Isolation: no outer {@code @Transactional} so one bad query cannot blank the model.
 */
@Service
@RequiredArgsConstructor
public class EconomicsOfDisasterServiceImpl implements EconomicsOfDisasterService {

    private final JdbcTemplate jdbc;

    /** Policy coefficients — single source for all formulas (not hidden in the UI). */
    public static final double K_THREAT_BOOST_MAX = 0.40;
    public static final double K_PREP_DAMP_MAX = 0.25;
    public static final double K_CONTINGENCY_SHARE = 0.15;
    public static final double K_AAP_BASE = 0.25;
    public static final double K_AAP_THREAT = 0.75;
    public static final double K_EW_WEIGHT = 4.0;
    public static final double K_EMERG_EW_WEIGHT = 8.0;
    public static final double K_OPEN_INC_WEIGHT = 5.0;
    public static final double K_SEASONAL_MIN = 0.5;
    public static final double K_SEASONAL_MAX = 2.0;

    @Override

    public Map<String, Object> model() {
        List<Map<String, Object>> audit = new ArrayList<>();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", OffsetDateTime.now().toString());
        out.put("currency", "TZS");
        out.put("modelVersion", "economics-v3-formula-engine");
        out.put("automation", Map.of(
                "mode", "live-recompute",
                "engine", "deterministic-formula",
                "ai", false,
                "note", "Every GET re-reads live ledgers and re-runs formulas. No cached or manually placed KPIs."));
        out.put("coefficients", coefficients());
        out.put("disclaimer",
                "Historical figures are live ledger sums. Forecasts are automated deterministic formulas "
                        + "recomputed on each request from system history, open threats and DRR stocks — "
                        + "not machine learning and not a guarantee of future cost.");

        Map<String, Object> cash = cashHistorical();
        Map<String, Object> inKind = inKindHistorical();
        Map<String, Object> recovery = recoveryHistorical();
        Map<String, Object> interventions = interventionStocks();
        Map<String, Object> threats = threatPressure();
        Map<String, Object> seasonal = seasonalProfile();
        Map<String, Object> readiness = readinessStocks();
        List<Map<String, Object>> hazardEconomics = hazardEconomics();
        List<Map<String, Object>> recentIncidents = recentIncidents();
        List<Map<String, Object>> seasonBands = seasonBands(seasonal);
        List<Map<String, Object>> shares = distributionShares();

        // ── formula: cash total outlay ──
        double cashOut = n(cash.get("disbursedTzs")) + n(cash.get("ndmfDisbursedTzs"))
                + n(cash.get("recordedGovResponseTzs"));
        cash.put("totalCashOutlayTzs", cashOut);
        audit.add(step("H1", "totalCashOutlayTzs",
                "disbursedTzs + ndmfDisbursedTzs + recordedGovResponseTzs",
                Map.of("disbursedTzs", n(cash.get("disbursedTzs")),
                        "ndmfDisbursedTzs", n(cash.get("ndmfDisbursedTzs")),
                        "recordedGovResponseTzs", n(cash.get("recordedGovResponseTzs"))),
                cashOut,
                "Live ledger cash outlay (historical)"));

        double allocated = n(cash.get("allocatedTzs"));
        double execPct = allocated > 0 ? 100.0 * n(cash.get("disbursedTzs")) / allocated : 0;
        cash.put("executionPct", round1(execPct));
        audit.add(step("H2", "executionPct",
                "100 × disbursedTzs / allocatedTzs",
                Map.of("disbursedTzs", n(cash.get("disbursedTzs")), "allocatedTzs", allocated),
                execPct,
                "Budget execution rate"));

        // ── formula: DRR envelope ──
        double drrEnv = n(interventions.get("mitigationBudgetTzs"))
                + n(interventions.get("anticipatoryBudgetTzs"))
                + n(interventions.get("contingencyBudgetTzs"));
        interventions.put("drrInterventionEnvelopeTzs", drrEnv);
        audit.add(step("D1", "drrInterventionEnvelopeTzs",
                "mitigationBudget + anticipatoryBudget + contingencyBudget",
                Map.of("mitigationBudgetTzs", n(interventions.get("mitigationBudgetTzs")),
                        "anticipatoryBudgetTzs", n(interventions.get("anticipatoryBudgetTzs")),
                        "contingencyBudgetTzs", n(interventions.get("contingencyBudgetTzs"))),
                drrEnv,
                "Funded DRR / anticipatory planning envelope"));

        // ── formula: threat pressure ──
        double openEw = n(threats.get("active_ew"));
        double emerg = n(threats.get("emergency_ew"));
        double openInc = n(threats.get("open_incidents"));
        double threatRaw = openEw * K_EW_WEIGHT + emerg * K_EMERG_EW_WEIGHT + openInc * K_OPEN_INC_WEIGHT;
        double threat = Math.min(100, threatRaw);
        threats.put("pressureIndex", round1(threat));
        threats.put("pressureFormula",
                "min(100, active_ew×" + K_EW_WEIGHT + " + emergency_ew×" + K_EMERG_EW_WEIGHT
                        + " + open_incidents×" + K_OPEN_INC_WEIGHT + ")");
        audit.add(step("T1", "threatPressureIndex",
                "min(100, active_ew×kEw + emergency_ew×kEmerg + open_incidents×kInc)",
                Map.of("active_ew", openEw, "emergency_ew", emerg, "open_incidents", openInc,
                        "kEw", K_EW_WEIGHT, "kEmerg", K_EMERG_EW_WEIGHT, "kInc", K_OPEN_INC_WEIGHT,
                        "raw", threatRaw),
                threat,
                "Open threat pressure 0–100"));

        Map<String, Object> prepDetail = preparednessIndexDetailed(interventions, readiness);
        double preparedness = n(prepDetail.get("score"));
        Object prepSteps = prepDetail.get("steps");
        if (prepSteps instanceof List<?> list) {
            for (Object o : list) {
                if (o instanceof Map<?, ?> raw) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    raw.forEach((k, v) -> row.put(String.valueOf(k), v));
                    audit.add(row);
                }
            }
        }

        out.put("cash", cash);
        out.put("inKind", inKind);
        out.put("recovery", recovery);
        out.put("interventions", interventions);
        out.put("threats", threats);
        out.put("seasonal", seasonal);
        out.put("seasonBands", seasonBands);
        out.put("readiness", readiness);
        out.put("hazardEconomics", hazardEconomics);
        out.put("recentIncidents", recentIncidents);
        out.put("annualSeries", annualSeries());
        out.put("distributionShares", shares);
        out.put("perIncidentEconomics", perIncidentEconomics(cash, inKind, audit));
        out.put("linkages", linkagesNote());

        Map<String, Object> forecast = buildForecast(
                cash, inKind, seasonal, preparedness, threat, interventions, seasonBands, shares, audit);
        out.put("preparednessIndex", round1(preparedness));
        out.put("threatPressureIndex", round1(threat));
        out.put("influenceBoard", influenceBoard(preparedness, threat, interventions, cash, inKind));
        out.put("forecast", forecast);
        out.put("budgetGap", budgetGap(cash, inKind, forecast, audit));
        out.put("formulaAudit", audit);
        return out;
    }

    private static Map<String, Object> coefficients() {
        Map<String, Object> c = new LinkedHashMap<>();
        c.put("K_THREAT_BOOST_MAX", K_THREAT_BOOST_MAX);
        c.put("K_PREP_DAMP_MAX", K_PREP_DAMP_MAX);
        c.put("K_CONTINGENCY_SHARE", K_CONTINGENCY_SHARE);
        c.put("K_AAP_BASE", K_AAP_BASE);
        c.put("K_AAP_THREAT", K_AAP_THREAT);
        c.put("K_EW_WEIGHT", K_EW_WEIGHT);
        c.put("K_EMERG_EW_WEIGHT", K_EMERG_EW_WEIGHT);
        c.put("K_OPEN_INC_WEIGHT", K_OPEN_INC_WEIGHT);
        c.put("K_SEASONAL_MIN", K_SEASONAL_MIN);
        c.put("K_SEASONAL_MAX", K_SEASONAL_MAX);
        c.put("note", "Policy coefficients used by every automated formula. Change here to retune the model.");
        return c;
    }

    private static Map<String, Object> step(String id, String output, String expression,
                                            Map<String, Object> inputs, double result, String meaning) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("id", id);
        s.put("output", output);
        s.put("expression", expression);
        s.put("inputs", inputs);
        s.put("result", round4(result));
        s.put("resultRounded", round0(result) == result && result == Math.rint(result)
                ? round0(result) : round2(result));
        s.put("meaning", meaning);
        return s;
    }

    // ── Historical money ──────────────────────────────────────────────────────

    private Map<String, Object> cashHistorical() {
        Map<String, Object> m = new LinkedHashMap<>();
        Map<String, Object> budget = one("""
                select count(*)::int as budget_count,
                       coalesce(sum(total_amount),0) as budget_envelope_tzs
                from public.disaster_budgets
                """);
        Map<String, Object> lines = one("""
                select coalesce(sum(allocated_amount),0) as line_allocated_tzs
                from public.budget_lines
                """);
        Map<String, Object> commits = one("""
                select
                  coalesce(sum(amount) filter (where status in ('approved','committed','disbursed')),0) as committed_tzs,
                  coalesce(sum(coalesce(expended_amount, amount)) filter (where status='disbursed'),0) as disbursed_tzs,
                  count(*) filter (where status='disbursed')::int as disbursement_count,
                  count(*)::int as commitment_count
                from public.budget_commitments
                """);
        Map<String, Object> ndmf = one("""
                select coalesce((select sum(amount) from public.ndmf_donations
                                 where status in ('received','acknowledged')),0) as donations_tzs,
                       coalesce((select sum(amount) from public.ndmf_disbursements
                                 where status <> 'voided'),0) as disbursed_tzs,
                       (select count(*)::int from public.ndmf_donations) as donation_count,
                       (select count(*)::int from public.ndmf_disbursements where status <> 'voided') as ndmf_disbursement_count,
                       coalesce((select sum(amount) from public.ndmf_disbursements
                                 where status <> 'voided' and training_plan_id is not null),0) as training_linked_disbursed_tzs
                """);
        Map<String, Object> gov = one("""
                select coalesce(sum(gov_response_tzs),0) as recorded_gov_response_tzs,
                       count(*) filter (where coalesce(gov_response_tzs,0) > 0)::int as events_with_gov_cost
                from public.disaster_events
                """);

        double lineAlloc = n(lines.get("line_allocated_tzs"));
        double envelope = n(budget.get("budget_envelope_tzs"));
        double allocated = lineAlloc > 0 ? lineAlloc : envelope;
        double committed = n(commits.get("committed_tzs"));
        double disbursed = n(commits.get("disbursed_tzs"));
        double ndmfIn = n(ndmf.get("donations_tzs"));
        double ndmfOut = n(ndmf.get("disbursed_tzs"));
        double govRec = n(gov.get("recorded_gov_response_tzs"));

        m.putAll(budget);
        m.put("lineAllocatedTzs", lineAlloc);
        m.put("allocatedTzs", allocated);
        m.put("committedTzs", committed);
        m.put("disbursedTzs", disbursed);
        m.put("commitmentCount", commits.get("commitment_count"));
        m.put("disbursementCount", commits.get("disbursement_count"));
        m.put("ndmfDonationsTzs", ndmfIn);
        m.put("ndmfDisbursedTzs", ndmfOut);
        m.put("ndmfBalanceTzs", ndmfIn - ndmfOut);
        m.put("ndmfDonationCount", ndmf.get("donation_count"));
        m.put("ndmfTrainingLinkedDisbursedTzs", n(ndmf.get("training_linked_disbursed_tzs")));
        m.put("recordedGovResponseTzs", govRec);
        m.put("eventsWithGovCost", gov.get("events_with_gov_cost"));
        m.put("totalCashOutlayTzs", disbursed + ndmfOut + govRec);
        m.put("executionPct", allocated > 0 ? round1(100.0 * disbursed / allocated) : 0);
        m.put("sources", List.of(
                "disaster_budgets.total_amount",
                "budget_lines.allocated_amount",
                "budget_commitments (approved/committed/disbursed)",
                "ndmf_donations / ndmf_disbursements (+ training_plan_id link)",
                "disaster_events.gov_response_tzs"));
        return m;
    }

    private Map<String, Object> inKindHistorical() {
        Map<String, Object> m = one("""
                select
                  count(*)::int as allocation_count,
                  coalesce(sum(ar.quantity_allocated * coalesce(r.unit_cost,0)),0) as in_kind_value_tzs,
                  coalesce(sum(ar.quantity_allocated) filter (
                    where lower(coalesce(ar.status,'')) in ('deployed','delivered','fulfilled','completed','dispatched')
                  ),0) as qty_deployed,
                  count(distinct ar.incident_id)::int as incidents_with_allocations,
                  count(distinct ar.resource_id)::int as resource_types_used
                from public.allocated_resources ar
                join public.resources r on r.id = ar.resource_id
                """);
        Map<String, Object> stock = one("""
                select
                  coalesce(sum(ii.quantity * coalesce(r.unit_cost,0)),0) as stock_value_tzs,
                  coalesce(sum(ii.quantity),0) as stock_units,
                  count(distinct ii.warehouse_id)::int as warehouses_with_stock
                from public.inventory_items ii
                left join public.resources r on r.id = ii.resource_id
                where lower(coalesce(ii.current_status, ii.status, 'available'))
                      not in ('expired','disposed','quarantine','unavailable')
                """);
        Map<String, Object> relief = one("""
                select count(*)::int as relief_distributions,
                       coalesce(sum(d.quantity_distributed * coalesce(r.unit_cost,0)),0) as relief_value_tzs
                from public.relief_distributions d
                left join public.resources r on r.id = d.resource_id
                """);
        m.put("stockValueTzs", stock.get("stock_value_tzs"));
        m.put("stockUnits", stock.get("stock_units"));
        m.put("warehousesWithStock", stock.get("warehouses_with_stock"));
        m.put("reliefDistributions", relief.get("relief_distributions"));
        m.put("reliefValueTzs", relief.get("relief_value_tzs"));
        m.put("inKindValueTzs", n(m.get("in_kind_value_tzs")));
        m.put("sources", List.of(
                "allocated_resources × resources.unit_cost",
                "inventory_items × unit_cost",
                "relief_distributions × unit_cost"));
        return m;
    }

    private Map<String, Object> recoveryHistorical() {
        return one("""
                select count(*)::int as recovery_programmes,
                       coalesce(sum(total_budget_allocated),0) as recovery_budget_tzs,
                       count(*) filter (where status='Ongoing')::int as ongoing,
                       count(*) filter (where status='Completed')::int as completed
                from public.recovery_programs
                """);
    }

    // ── DRR / interventions that influence money ─────────────────────────────

    private Map<String, Object> interventionStocks() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("mitigationMeasures", count("select count(*) from public.mitigation_measures"));
        m.put("mitigationBudgetTzs", scalarNum(
                "select coalesce(sum(budget),0) from public.mitigation_measures"));
        m.put("trainingPlans", count("select count(*) from public.training_plans"));
        m.put("trainingsCompleted", count("""
                select count(*) from public.training_plans
                where lower(coalesce(status,'')) in ('completed','done','finished','published')
                """));
        m.put("trainingsPlanned", count("""
                select count(*) from public.training_plans
                where lower(coalesce(status,'')) in ('planned','draft','scheduled')
                """));
        m.put("trainingsLinkedToMitigation", count("""
                select count(*) from public.training_plans where mitigation_measure_id is not null
                """));
        m.put("anticipatoryPlans", count("select count(*) from public.anticipatory_action_plans"));
        m.put("anticipatoryBudgetTzs", scalarNum(
                "select coalesce(sum(budget),0) from public.anticipatory_action_plans"));
        m.put("anticipatoryActivePlans", count("""
                select count(*) from public.anticipatory_action_plans
                where lower(coalesce(status,'')) in ('active','approved','published','triggered')
                """));
        m.put("contingencyPlans", count("select count(*) from public.contingency_plans"));
        m.put("contingencyBudgetTzs", scalarNum(
                "select coalesce(sum(budget),0) from public.contingency_plans"));
        m.put("contingencyActivePlans", count("""
                select count(*) from public.contingency_plans
                where lower(coalesce(status,'')) in ('active','approved')
                """));
        // Planned intervention envelopes that sit ahead of response cash
        double drrEnvelope = n(m.get("mitigationBudgetTzs"))
                + n(m.get("anticipatoryBudgetTzs"))
                + n(m.get("contingencyBudgetTzs"));
        m.put("drrInterventionEnvelopeTzs", drrEnvelope);
        m.put("sources", List.of(
                "mitigation_measures.budget",
                "training_plans (+ mitigation_measure_id, ndmf_disbursements.training_plan_id)",
                "anticipatory_action_plans.budget",
                "contingency_plans.budget"));
        m.put("influenceNote",
                "Higher DRR stocks (measures, trainings, contingency/AAP plans and their budget envelopes) "
                        + "raise the preparedness index, which modestly dampens the 12-month response-cost "
                        + "forecast. Contingency and AAP budgets also fund the anticipatory reserve line. "
                        + "They do not invent cash outside recorded ledgers.");
        return m;
    }

    private Map<String, Object> readinessStocks() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("permanent_warehouses", count("select count(*) from public.warehouses"));
        m.put("temporary_warehouses", count("select count(*) from public.temporary_warehouses"));
        // evacuation_centers uses status text, not is_active
        m.put("evacuation_centres", count("""
                select count(*) from public.evacuation_centers
                where lower(coalesce(status,'active')) not in ('inactive','closed','decommissioned')
                """));
        m.put("evacuationCapacityPeople", scalarNum("""
                select coalesce(sum(capacity_people),0) from public.evacuation_centers
                where lower(coalesce(status,'active')) not in ('inactive','closed','decommissioned')
                """));
        return m;
    }

    private Map<String, Object> threatPressure() {
        Map<String, Object> m = one("""
                select
                  (select count(*)::int from public.early_warnings
                    where lower(coalesce(status,'')) not in ('expired','cancelled','closed','inactive')) as active_ew,
                  (select count(*)::int from public.early_warnings
                    where lower(coalesce(severity_level,'')) in ('emergency','major')) as emergency_ew,
                  (select count(*)::int from public.warnings
                    where lower(coalesce(status,'')) in ('published','approved','active')) as open_warnings,
                  (select count(*)::int from public.incidents
                    where lower(coalesce(status,'')) not in ('closed','resolved','cancelled','closed_rumor')
                      and coalesce(is_simulation,false)=false) as open_incidents,
                  (select count(*)::int from public.incidents
                    where coalesce(is_simulation,false)=false) as incidents_total
                """);
        double openEw = n(m.get("active_ew"));
        double emerg = n(m.get("emergency_ew"));
        double openInc = n(m.get("open_incidents"));
        // 0–100 pressure: open threats + open response load
        double pressure = Math.min(100, openEw * 4 + emerg * 8 + openInc * 5);
        m.put("pressureIndex", round1(pressure));
        m.put("sources", List.of("early_warnings", "warnings", "incidents (non-simulation)"));
        m.put("influenceNote",
                "Open early warnings and active incidents raise threat pressure, which increases the "
                        + "expected incident count (and cash/in-kind need) in the forecast horizon.");
        return m;
    }

    // ── Seasonal / annual / hazard ────────────────────────────────────────────

    private Map<String, Object> seasonalProfile() {
        List<Map<String, Object>> byMonth = rows("""
                select extract(month from coalesce(reported_at, created_at))::int as month,
                       count(*)::int as incidents
                from public.incidents
                where coalesce(is_simulation,false)=false
                group by 1 order by 1
                """);
        List<Map<String, Object>> ewByMonth = rows("""
                select extract(month from created_at)::int as month,
                       count(*)::int as warnings
                from public.early_warnings
                group by 1 order by 1
                """);
        double totalInc = byMonth.stream().mapToDouble(r -> n(r.get("incidents"))).sum();
        double avg = totalInc > 0 ? totalInc / 12.0 : 0;
        List<Map<String, Object>> factors = new ArrayList<>();
        int currentMonth = LocalDate.now().getMonthValue();
        double currentFactor = 1.0;
        for (int m = 1; m <= 12; m++) {
            final int mm = m;
            double cnt = byMonth.stream().filter(r -> ((Number) r.get("month")).intValue() == mm)
                    .mapToDouble(r -> n(r.get("incidents"))).findFirst().orElse(0);
            double f = avg <= 0 ? 1.0
                    : Math.max(K_SEASONAL_MIN, Math.min(K_SEASONAL_MAX, cnt / Math.max(avg, 0.25)));
            // Sparse history (few months only): keep unobserved months neutral
            if (cnt == 0 && totalInc > 0 && byMonth.size() < 6) {
                f = 1.0;
            }
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("month", m);
            row.put("monthName", YearMonth.of(2000, m).getMonth().name());
            row.put("historicalIncidents", cnt);
            row.put("seasonalFactor", round2(f));
            row.put("climateBand", climateBand(m));
            factors.add(row);
            if (m == currentMonth) {
                currentFactor = f;
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("byMonth", factors);
        out.put("ewByMonth", ewByMonth);
        out.put("currentMonth", currentMonth);
        out.put("currentSeasonalFactor", round2(currentFactor));
        out.put("currentClimateBand", climateBand(currentMonth));
        out.put("note", totalInc < 5
                ? "Limited incident history — seasonal factors stay near 1.0 until more years of data accumulate."
                : "Seasonal factor = month share relative to mean monthly incident count (capped 0.5–2.0). "
                        + "Climate bands follow Tanzania rainfall seasons (Masika / Vuli / Dry).");
        return out;
    }

    /** Tanzania-oriented climate bands for seasonal planning (not weather forecasts). */
    private static String climateBand(int month) {
        if (month >= 3 && month <= 5) {
            return "Masika (long rains)";
        }
        if (month >= 10 && month <= 12) {
            return "Vuli (short rains)";
        }
        if (month == 1 || month == 2) {
            return "Dry / inter-season";
        }
        return "Dry season";
    }

    private List<Map<String, Object>> seasonBands(Map<String, Object> seasonal) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> byMonth = (List<Map<String, Object>>) seasonal.getOrDefault("byMonth", List.of());
        Map<String, double[]> agg = new LinkedHashMap<>();
        for (String band : List.of("Masika (long rains)", "Vuli (short rains)", "Dry season", "Dry / inter-season")) {
            agg.put(band, new double[]{0, 0}); // incidents, factor sum
        }
        for (Map<String, Object> row : byMonth) {
            String band = String.valueOf(row.getOrDefault("climateBand", "Dry season"));
            double[] a = agg.computeIfAbsent(band, k -> new double[]{0, 0});
            a[0] += n(row.get("historicalIncidents"));
            a[1] += n(row.get("seasonalFactor"));
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map.Entry<String, double[]> e : agg.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("band", e.getKey());
            row.put("historicalIncidents", e.getValue()[0]);
            // average factor across months in band (approx months count by fixed map)
            int monthsInBand = switch (e.getKey()) {
                case "Masika (long rains)" -> 3;
                case "Vuli (short rains)" -> 3;
                case "Dry / inter-season" -> 2;
                default -> 4;
            };
            row.put("avgSeasonalFactor", round2(e.getValue()[1] / monthsInBand));
            row.put("months", monthsInBand);
            out.add(row);
        }
        return out;
    }

    private List<Map<String, Object>> annualSeries() {
        return rows("""
                select y.year,
                       coalesce(i.incidents,0) as incidents,
                       coalesce(c.cash_disbursed,0) as cash_disbursed_tzs,
                       coalesce(k.in_kind_tzs,0) as in_kind_tzs,
                       coalesce(w.ew_count,0) as early_warnings
                from (
                  select generate_series(
                    greatest(extract(year from now())::int - 4, 2020),
                    extract(year from now())::int
                  ) as year
                ) y
                left join (
                  select extract(year from coalesce(reported_at, created_at))::int as year, count(*) as incidents
                  from public.incidents where coalesce(is_simulation,false)=false
                  group by 1
                ) i on i.year = y.year
                left join (
                  select extract(year from coalesce(disbursed_at, updated_at))::int as year,
                         sum(coalesce(expended_amount, amount)) as cash_disbursed
                  from public.budget_commitments where status='disbursed'
                  group by 1
                ) c on c.year = y.year
                left join (
                  select extract(year from coalesce(ar.allocation_date, ar.created_at))::int as year,
                         sum(ar.quantity_allocated * coalesce(r.unit_cost,0)) as in_kind_tzs
                  from public.allocated_resources ar
                  join public.resources r on r.id = ar.resource_id
                  group by 1
                ) k on k.year = y.year
                left join (
                  select extract(year from created_at)::int as year, count(*) as ew_count
                  from public.early_warnings group by 1
                ) w on w.year = y.year
                order by y.year
                """);
    }

    private List<Map<String, Object>> distributionShares() {
        List<Map<String, Object>> byCategory = rows("""
                select coalesce(nullif(trim(bl.category),''), 'Uncategorised') as category,
                       coalesce(sum(bl.allocated_amount),0) as allocated_tzs,
                       coalesce(sum(c.amount) filter (where c.status in ('approved','committed','disbursed')),0) as committed_tzs,
                       coalesce(sum(coalesce(c.expended_amount,c.amount)) filter (where c.status='disbursed'),0) as disbursed_tzs
                from public.budget_lines bl
                left join public.budget_commitments c on c.budget_line_id = bl.id
                group by 1
                order by allocated_tzs desc
                """);
        double total = byCategory.stream().mapToDouble(r -> n(r.get("allocated_tzs"))).sum();
        for (Map<String, Object> r : byCategory) {
            double a = n(r.get("allocated_tzs"));
            r.put("sharePct", total > 0 ? round1(100.0 * a / total) : 0);
        }
        if (byCategory.isEmpty()) {
            byCategory = rows("""
                    select coalesce(nullif(trim(r.category),''), 'Uncategorised') as category,
                           coalesce(sum(ar.quantity_allocated * coalesce(r.unit_cost,0)),0) as allocated_tzs,
                           0 as committed_tzs,
                           coalesce(sum(ar.quantity_allocated * coalesce(r.unit_cost,0)),0) as disbursed_tzs
                    from public.allocated_resources ar
                    join public.resources r on r.id = ar.resource_id
                    group by 1 order by allocated_tzs desc
                    """);
            total = byCategory.stream().mapToDouble(r -> n(r.get("allocated_tzs"))).sum();
            for (Map<String, Object> r : byCategory) {
                double a = n(r.get("allocated_tzs"));
                r.put("sharePct", total > 0 ? round1(100.0 * a / total) : 0);
            }
        }
        return byCategory;
    }

    private List<Map<String, Object>> hazardEconomics() {
        return rows("""
                select coalesce(nullif(trim(h.name),''), 'Unspecified hazard') as hazard,
                       count(i.*)::int as incidents,
                       count(i.*) filter (
                         where lower(coalesce(i.status,'')) not in ('closed','resolved','cancelled','closed_rumor')
                       )::int as open_incidents,
                       coalesce(sum(ar_val.in_kind_tzs),0) as in_kind_tzs,
                       coalesce(sum(bc_val.cash_tzs),0) as cash_disbursed_tzs
                from public.incidents i
                left join public.hazards h on h.id = i.hazard_id
                left join (
                  select ar.incident_id,
                         sum(ar.quantity_allocated * coalesce(r.unit_cost,0)) as in_kind_tzs
                  from public.allocated_resources ar
                  join public.resources r on r.id = ar.resource_id
                  group by 1
                ) ar_val on ar_val.incident_id = i.id
                left join (
                  select incident_id,
                         sum(coalesce(expended_amount, amount)) as cash_tzs
                  from public.budget_commitments
                  where status = 'disbursed' and incident_id is not null
                  group by 1
                ) bc_val on bc_val.incident_id = i.id
                where coalesce(i.is_simulation,false)=false
                group by 1
                order by incidents desc, in_kind_tzs desc
                limit 20
                """);
    }

    private List<Map<String, Object>> recentIncidents() {
        return rows("""
                select i.id,
                       i.title,
                       coalesce(h.name, 'Unspecified') as hazard,
                       i.status,
                       i.severity_level,
                       coalesce(i.reported_at, i.created_at) as reported_at,
                       coalesce(ar_val.in_kind_tzs, 0) as in_kind_tzs,
                       coalesce(bc_val.cash_tzs, 0) as cash_disbursed_tzs
                from public.incidents i
                left join public.hazards h on h.id = i.hazard_id
                left join (
                  select ar.incident_id,
                         sum(ar.quantity_allocated * coalesce(r.unit_cost,0)) as in_kind_tzs
                  from public.allocated_resources ar
                  join public.resources r on r.id = ar.resource_id
                  group by 1
                ) ar_val on ar_val.incident_id = i.id
                left join (
                  select incident_id,
                         sum(coalesce(expended_amount, amount)) as cash_tzs
                  from public.budget_commitments
                  where status = 'disbursed' and incident_id is not null
                  group by 1
                ) bc_val on bc_val.incident_id = i.id
                where coalesce(i.is_simulation,false)=false
                order by coalesce(i.reported_at, i.created_at) desc nulls last
                limit 12
                """);
    }

    private Map<String, Object> perIncidentEconomics(Map<String, Object> cash, Map<String, Object> inKind,
                                                     List<Map<String, Object>> audit) {
        long incidents = count("select count(*) from public.incidents where coalesce(is_simulation,false)=false");
        long withAlloc = nLong(inKind.get("incidents_with_allocations"));
        double cashOut = n(cash.get("totalCashOutlayTzs"));
        double inKindVal = n(inKind.get("inKindValueTzs"));
        double avgCash = incidents > 0 ? cashOut / incidents : 0;
        double avgIk = withAlloc > 0 ? inKindVal / withAlloc : 0;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("incidentsTotal", incidents);
        m.put("incidentsWithResourceAllocations", withAlloc);
        m.put("avgCashOutlayPerIncidentTzs", round0(avgCash));
        m.put("avgInKindPerIncidentWithAllocTzs", round0(avgIk));
        m.put("combinedHistoricalCostTzs", cashOut + inKindVal);
        m.put("formulas", List.of(
                "avgCash = totalCashOutlayTzs ÷ incidentsTotal",
                "avgInKind = inKindValueTzs ÷ incidentsWithResourceAllocations",
                "combined = totalCashOutlayTzs + inKindValueTzs"));
        m.put("note", "Averages use all non-simulation incidents for cash; in-kind average only over incidents that received allocations.");
        audit.add(step("P1", "avgCashOutlayPerIncidentTzs",
                "totalCashOutlayTzs ÷ incidentsTotal",
                Map.of("totalCashOutlayTzs", cashOut, "incidentsTotal", incidents),
                avgCash, "Unit cash cost per incident (historical)"));
        audit.add(step("P2", "avgInKindPerIncidentWithAllocTzs",
                "inKindValueTzs ÷ incidentsWithAllocations",
                Map.of("inKindValueTzs", inKindVal, "withAlloc", withAlloc),
                avgIk, "Unit in-kind cost per allocated incident"));
        return m;
    }

    // ── Forecast (formula-automated) ──────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private Map<String, Object> preparednessIndexDetailed(Map<String, Object> interventions,
                                                          Map<String, Object> readiness) {
        List<Map<String, Object>> steps = new ArrayList<>();
        double mit = Math.min(20, n(interventions.get("mitigationMeasures")) * 2.5);
        double trn = Math.min(15, n(interventions.get("trainingPlans")) * 2.0);
        double trnLink = Math.min(10, n(interventions.get("trainingsLinkedToMitigation")) * 3);
        double cont = Math.min(12, n(interventions.get("contingencyPlans")) * 2.5);
        double aap = Math.min(12, n(interventions.get("anticipatoryPlans")) * 1.5);
        double drrEnv = n(interventions.get("drrInterventionEnvelopeTzs"));
        double drrScore = Math.min(16, Math.log10(Math.max(drrEnv, 1)) * 2);
        double wh = Math.min(10, n(readiness.get("permanent_warehouses")) * 0.5);
        double ec = Math.min(5, n(readiness.get("evacuation_centres")) * 0.8);
        double raw = mit + trn + trnLink + cont + aap + drrScore + wh + ec;
        double score = Math.min(100, raw);
        steps.add(step("R1", "preparedness.mitigationComponent",
                "min(20, mitigationMeasures × 2.5)",
                Map.of("mitigationMeasures", n(interventions.get("mitigationMeasures"))), mit,
                "Mitigation stock contribution"));
        steps.add(step("R2", "preparedness.trainingComponent",
                "min(15, trainingPlans × 2) + min(10, linkedMitigation × 3)",
                Map.of("trainingPlans", n(interventions.get("trainingPlans")),
                        "linked", n(interventions.get("trainingsLinkedToMitigation"))),
                trn + trnLink, "Training contribution"));
        steps.add(step("R3", "preparedness.plansAndEnvelope",
                "min(12, contingency×2.5) + min(12, aap×1.5) + min(16, log10(max(drrEnv,1))×2)",
                Map.of("contingencyPlans", n(interventions.get("contingencyPlans")),
                        "anticipatoryPlans", n(interventions.get("anticipatoryPlans")),
                        "drrEnv", drrEnv),
                cont + aap + drrScore, "Plans + funded DRR envelope"));
        steps.add(step("R4", "preparednessIndex",
                "min(100, sum of components + warehouse + EC)",
                Map.of("components", raw - wh - ec, "warehouses", wh, "evacuationCentres", ec),
                score, "Preparedness index 0–100 (dampens forecast caseload)"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("score", score);
        out.put("steps", steps);
        return out;
    }

    private Map<String, Object> buildForecast(Map<String, Object> cash, Map<String, Object> inKind,
                                               Map<String, Object> seasonal, double preparedness,
                                               double threat, Map<String, Object> interventions,
                                               List<Map<String, Object>> seasonBands,
                                               List<Map<String, Object>> shares,
                                               List<Map<String, Object>> audit) {
        long incidents = count("""
                select count(*) from public.incidents
                where coalesce(is_simulation,false)=false
                  and coalesce(reported_at, created_at) >= now() - interval '12 months'
                """);
        double monthsCovered = Math.max(1, count("""
                select count(distinct to_char(coalesce(reported_at, created_at), 'YYYY-MM'))
                from public.incidents
                where coalesce(is_simulation,false)=false
                  and coalesce(reported_at, created_at) >= now() - interval '12 months'
                """));
        double monthlyRate = incidents / monthsCovered;
        audit.add(step("F1", "baseMonthlyIncidentRate",
                "trailingIncidentCount ÷ monthsWithData (last 12 months)",
                Map.of("trailingIncidentCount", incidents, "monthsWithData", monthsCovered),
                monthlyRate, "Base monthly caseload from history"));

        double seasonalFactor = n(seasonal.get("currentSeasonalFactor"));
        if (seasonalFactor <= 0) {
            seasonalFactor = 1.0;
        }
        double threatBoost = 1.0 + (threat / 100.0) * K_THREAT_BOOST_MAX;
        double prepDamp = 1.0 - (preparedness / 100.0) * K_PREP_DAMP_MAX;
        audit.add(step("F2", "threatBoost",
                "1 + (threat/100) × K_THREAT_BOOST_MAX",
                Map.of("threat", threat, "K_THREAT_BOOST_MAX", K_THREAT_BOOST_MAX),
                threatBoost, "Open threats raise expected caseload"));
        audit.add(step("F3", "preparednessDampener",
                "1 − (preparedness/100) × K_PREP_DAMP_MAX",
                Map.of("preparedness", preparedness, "K_PREP_DAMP_MAX", K_PREP_DAMP_MAX),
                prepDamp, "DRR/trainings/readiness lower expected intensity"));

        double expectedMonthlyIncidents = monthlyRate * seasonalFactor * threatBoost * prepDamp;
        double expectedAnnualIncidents = expectedMonthlyIncidents * 12;
        audit.add(step("F4", "expectedMonthlyIncidents",
                "baseMonthlyRate × seasonalFactor × threatBoost × preparednessDampener",
                Map.of("baseMonthlyRate", monthlyRate, "seasonalFactor", seasonalFactor,
                        "threatBoost", threatBoost, "preparednessDampener", prepDamp),
                expectedMonthlyIncidents, "Automated monthly caseload"));
        audit.add(step("F5", "expectedAnnualIncidents",
                "expectedMonthlyIncidents × 12",
                Map.of("expectedMonthlyIncidents", expectedMonthlyIncidents),
                expectedAnnualIncidents, "Annual planning caseload"));

        long allInc = count("select count(*) from public.incidents where coalesce(is_simulation,false)=false");
        double avgCash = allInc > 0 ? n(cash.get("totalCashOutlayTzs")) / allInc : 0;
        long withAlloc = nLong(inKind.get("incidents_with_allocations"));
        double avgInKind = withAlloc > 0 ? n(inKind.get("inKindValueTzs")) / withAlloc : 0;

        double forecastCash = expectedAnnualIncidents * avgCash;
        double forecastInKind = expectedAnnualIncidents * avgInKind;
        double aap = n(interventions.get("anticipatoryBudgetTzs"));
        double cont = n(interventions.get("contingencyBudgetTzs"));
        double anticipatory = (aap + cont * K_CONTINGENCY_SHARE)
                * (K_AAP_BASE + threat / 100.0 * K_AAP_THREAT);
        double totalNeed = forecastCash + forecastInKind + anticipatory;

        audit.add(step("F6", "forecastResponseCashTzs",
                "expectedAnnualIncidents × avgCashPerIncident",
                Map.of("expectedAnnualIncidents", expectedAnnualIncidents, "avgCash", avgCash),
                forecastCash, "Automated 12-month response cash need"));
        audit.add(step("F7", "forecastInKindValueTzs",
                "expectedAnnualIncidents × avgInKindPerAllocatedIncident",
                Map.of("expectedAnnualIncidents", expectedAnnualIncidents, "avgInKind", avgInKind),
                forecastInKind, "Automated 12-month in-kind need"));
        audit.add(step("F8", "forecastAnticipatoryReserveTzs",
                "(AAP + K_CONTINGENCY_SHARE×contingency) × (K_AAP_BASE + K_AAP_THREAT×threat/100)",
                Map.of("aap", aap, "contingency", cont, "threat", threat,
                        "K_CONTINGENCY_SHARE", K_CONTINGENCY_SHARE, "K_AAP_BASE", K_AAP_BASE,
                        "K_AAP_THREAT", K_AAP_THREAT),
                anticipatory, "Automated anticipatory reserve from AAP/contingency stocks"));
        audit.add(step("F9", "forecastTotalEconomicNeedTzs",
                "forecastCash + forecastInKind + anticipatoryReserve",
                Map.of("forecastCash", forecastCash, "forecastInKind", forecastInKind,
                        "anticipatory", anticipatory),
                totalNeed, "Total automated economic need (12 months)"));

        String band = String.valueOf(seasonal.getOrDefault("currentClimateBand", "Dry season"));
        double bandMonths = seasonBands.stream()
                .filter(b -> band.equals(String.valueOf(b.get("band"))))
                .mapToDouble(b -> n(b.get("months")))
                .findFirst().orElse(3);
        double seasonHorizonIncidents = expectedMonthlyIncidents * bandMonths;
        double seasonHorizonCash = seasonHorizonIncidents * avgCash;
        double seasonHorizonInKind = seasonHorizonIncidents * avgInKind;
        audit.add(step("F10", "seasonHorizonNeed",
                "expectedMonthly × bandMonths × (avgCash + avgInKind)",
                Map.of("expectedMonthly", expectedMonthlyIncidents, "bandMonths", bandMonths,
                        "avgCash", avgCash, "avgInKind", avgInKind),
                seasonHorizonCash + seasonHorizonInKind,
                "Season-horizon economic pressure (current climate band)"));

        // Automated month-by-month roll-forward (each month uses its own seasonal factor)
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> byMonth = (List<Map<String, Object>>) seasonal.getOrDefault("byMonth", List.of());
        List<Map<String, Object>> monthlyForecast = new ArrayList<>();
        int nowM = LocalDate.now().getMonthValue();
        int nowY = LocalDate.now().getYear();
        for (int i = 0; i < 12; i++) {
            int m = ((nowM - 1 + i) % 12) + 1;
            int y = nowY + ((nowM - 1 + i) / 12);
            final int mm = m;
            double sf = byMonth.stream()
                    .filter(r -> ((Number) r.get("month")).intValue() == mm)
                    .mapToDouble(r -> n(r.get("seasonalFactor")))
                    .findFirst().orElse(1.0);
            double expM = monthlyRate * sf * threatBoost * prepDamp;
            double cashM = expM * avgCash;
            double ikM = expM * avgInKind;
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("year", y);
            row.put("month", m);
            row.put("monthName", YearMonth.of(2000, m).getMonth().name());
            row.put("seasonalFactor", round2(sf));
            row.put("expectedIncidents", round2(expM));
            row.put("forecastCashTzs", round0(cashM));
            row.put("forecastInKindTzs", round0(ikM));
            row.put("forecastTotalTzs", round0(cashM + ikM));
            row.put("formula", "rate×seasonalFactor(m)×threatBoost×prepDamp × unit costs");
            monthlyForecast.add(row);
        }
        audit.add(step("F11", "monthlyForecast[12]",
                "for each of next 12 months: baseRate × Sf(month) × threatBoost × prepDamp × unitCosts",
                Map.of("months", 12, "baseRate", monthlyRate, "threatBoost", threatBoost, "prepDamp", prepDamp),
                monthlyForecast.stream().mapToDouble(r -> n(r.get("forecastTotalTzs"))).sum(),
                "Automated month-by-month roll-forward (sum of cash+in-kind)"));

        List<Map<String, Object>> distForecast = new ArrayList<>();
        for (Map<String, Object> s : shares) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("category", s.get("category"));
            row.put("sharePct", s.get("sharePct"));
            double shareCash = forecastCash * n(s.get("sharePct")) / 100.0;
            row.put("forecastCashTzs", round0(shareCash));
            row.put("formula", "forecastResponseCash × sharePct/100");
            distForecast.add(row);
        }

        Map<String, Object> f = new LinkedHashMap<>();
        f.put("horizon", "12 months");
        f.put("horizonLabel", "Annual planning horizon from today — fully formula-driven");
        f.put("trailingMonthsWithIncidents", monthsCovered);
        f.put("trailingIncidentCount", incidents);
        f.put("baseMonthlyIncidentRate", round2(monthlyRate));
        f.put("seasonalFactor", round2(seasonalFactor));
        f.put("climateBand", band);
        f.put("threatBoost", round2(threatBoost));
        f.put("preparednessDampener", round2(prepDamp));
        f.put("expectedMonthlyIncidents", round2(expectedMonthlyIncidents));
        f.put("expectedAnnualIncidents", round1(expectedAnnualIncidents));
        f.put("expectedSeasonHorizonIncidents", round1(seasonHorizonIncidents));
        f.put("avgHistoricalCashPerIncidentTzs", round0(avgCash));
        f.put("avgHistoricalInKindPerAllocatedIncidentTzs", round0(avgInKind));
        f.put("forecastResponseCashTzs", round0(forecastCash));
        f.put("forecastInKindValueTzs", round0(forecastInKind));
        f.put("forecastAnticipatoryReserveTzs", round0(anticipatory));
        f.put("forecastTotalEconomicNeedTzs", round0(totalNeed));
        f.put("seasonHorizonCashTzs", round0(seasonHorizonCash));
        f.put("seasonHorizonInKindTzs", round0(seasonHorizonInKind));
        f.put("seasonHorizonMonths", bandMonths);
        f.put("distributionForecast", distForecast);
        f.put("monthlyForecast", monthlyForecast);
        f.put("masterFormula",
                "expectedMonthly = (trailingIncidents ÷ monthsWithData) × seasonalFactor × "
                        + "(1 + K_THREAT_BOOST_MAX×threat/100) × (1 − K_PREP_DAMP_MAX×preparedness/100); "
                        + "annualCash = expectedMonthly×12 × (cashOutlay ÷ allIncidents); "
                        + "annualInKind = expectedMonthly×12 × (inKind ÷ incidentsWithAlloc); "
                        + "anticipatory = (AAP + K_CONTINGENCY_SHARE×contingency) × (K_AAP_BASE + K_AAP_THREAT×threat/100); "
                        + "totalNeed = annualCash + annualInKind + anticipatory.");
        f.put("formula", f.get("masterFormula"));
        f.put("honestLimits", List.of(
                "Fully automated: re-runs on every request from live SQL + named coefficients.",
                "Uses only data already in DMIS — sparse years keep seasonality near 1.0.",
                "Does not invent unit prices; zero unit_cost resources contribute 0 to in-kind value.",
                "Not ML/AI; coefficients are fixed policy weights in coefficients{} and formulaAudit[].",
                "DRR trainings/measures/contingency dampen intensity; they do not invent budget lines.",
                "Climate bands are planning labels (Masika/Vuli/Dry), not live meteorological forecasts."));
        return f;
    }

    private Map<String, Object> budgetGap(Map<String, Object> cash, Map<String, Object> inKind,
                                          Map<String, Object> forecast, List<Map<String, Object>> audit) {
        double availableCash = n(cash.get("ndmfBalanceTzs"))
                + Math.max(0, n(cash.get("allocatedTzs")) - n(cash.get("disbursedTzs")));
        double stock = n(inKind.get("stockValueTzs"));
        double needCash = n(forecast.get("forecastResponseCashTzs"))
                + n(forecast.get("forecastAnticipatoryReserveTzs"));
        double needIk = n(forecast.get("forecastInKindValueTzs"));
        double cashGap = needCash - availableCash;
        double ikGap = needIk - stock;
        double coverageCash = needCash > 0 ? 100.0 * availableCash / needCash : 100;
        double coverageIk = needIk > 0 ? 100.0 * stock / needIk : 100;
        Map<String, Object> g = new LinkedHashMap<>();
        g.put("availableCashTzs", round0(availableCash));
        g.put("availableCashFormula", "ndmfBalance + max(0, allocated − disbursed)");
        g.put("warehouseStockValueTzs", round0(stock));
        g.put("forecastCashNeedTzs", round0(needCash));
        g.put("forecastInKindNeedTzs", round0(needIk));
        g.put("cashGapTzs", round0(cashGap));
        g.put("inKindGapTzs", round0(ikGap));
        g.put("cashCoveragePct", round1(Math.min(999, coverageCash)));
        g.put("inKindCoveragePct", round1(Math.min(999, coverageIk)));
        g.put("status", cashGap > 0 || ikGap > 0 ? "GAP" : "COVERED");
        g.put("note", "Gaps are automated: positive cashGap means forecast need exceeds free cash + NDMF balance.");
        audit.add(step("G1", "availableCashTzs",
                "ndmfBalance + max(0, allocated − disbursed)",
                Map.of("ndmfBalance", n(cash.get("ndmfBalanceTzs")),
                        "allocated", n(cash.get("allocatedTzs")),
                        "disbursed", n(cash.get("disbursedTzs"))),
                availableCash, "Liquid planning headroom"));
        audit.add(step("G2", "cashGapTzs",
                "(forecastCash + anticipatory) − availableCash",
                Map.of("needCash", needCash, "availableCash", availableCash),
                cashGap, "Automated funding gap (positive = shortfall)"));
        audit.add(step("G3", "inKindGapTzs",
                "forecastInKind − warehouseStockValue",
                Map.of("needIk", needIk, "stock", stock),
                ikGap, "Automated stock gap (positive = shortfall)"));
        return g;
    }

    private Map<String, Object> influenceBoard(double preparedness, double threat,
                                                Map<String, Object> interventions,
                                                Map<String, Object> cash, Map<String, Object> inKind) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("preparednessIndex", round1(preparedness));
        m.put("threatPressureIndex", round1(threat));
        m.put("responseCashDampenerPct", round1((preparedness / 100.0) * 25.0));
        m.put("threatCaseloadBoostPct", round1((threat / 100.0) * 40.0));
        m.put("drrEnvelopeTzs", interventions.get("drrInterventionEnvelopeTzs"));
        m.put("stockCoverageVsInKind",
                n(inKind.get("inKindValueTzs")) > 0
                        ? round1(100.0 * n(inKind.get("stockValueTzs")) / n(inKind.get("inKindValueTzs")))
                        : 0);
        m.put("ndmfVsBudgetDisbursed",
                n(cash.get("disbursedTzs")) + n(cash.get("ndmfDisbursedTzs")) > 0
                        ? round1(100.0 * n(cash.get("ndmfDisbursedTzs"))
                        / (n(cash.get("disbursedTzs")) + n(cash.get("ndmfDisbursedTzs"))))
                        : 0);
        m.put("rules", List.of(
                "Every mitigation measure / training / contingency / AAP raises preparedness → lowers expected response cash intensity (max −25%).",
                "Every open early warning / open incident raises threat → raises expected caseload (max +40%).",
                "AAP + contingency budget envelopes fund anticipatory reserve (scaled by threat).",
                "NDMF disbursements linked to training_plan_id count as capacity investment, not pure response cost.",
                "Warehouse stock value is readiness buffer; high stock/in-kind ratio improves continuity, not cash inventing."));
        return m;
    }

    private Map<String, Object> linkagesNote() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("moneyFeeds", List.of(
                "Budget & Finance: disaster_budgets → budget_lines → budget_commitments",
                "NDMF: ndmf_donations → ndmf_disbursements (incident earmarks + training_plan_id)",
                "Repository: disaster_events.gov_response_tzs",
                "Recovery: recovery_programs.total_budget_allocated",
                "Preparedness cash plans: contingency_plans.budget, anticipatory_action_plans.budget, mitigation_measures.budget"));
        m.put("resourceFeeds", List.of(
                "Response: allocated_resources × resources.unit_cost",
                "Preparedness: inventory_items stock value",
                "Recovery: relief_distributions × unit_cost"));
        m.put("interventionFeeds", List.of(
                "Prevention: mitigation_measures",
                "Preparedness: training_plans (optionally linked to mitigation_measure_id)",
                "Anticipation: anticipatory_action_plans, contingency_plans",
                "Readiness: warehouses, temporary_warehouses, evacuation_centers"));
        m.put("threatFeeds", List.of(
                "EW: early_warnings / warnings (severity + status)",
                "Response: open incidents (non-simulation)",
                "Hazard catalogue: hazards joined to incidents for per-hazard economics"));
        m.put("horizons", List.of(
                "Annual (12-month planning forecast)",
                "Seasonal climate band (Masika / Vuli / Dry) from incident month histogram",
                "Per-incident (recent series + averages)",
                "Training & DRR envelopes as preparedness dampener + anticipatory reserve"));
        m.put("anticipation", List.of(
                "Seasonal profile from incident month histogram",
                "Active EW + open incidents raise expected caseload",
                "AAP + contingency budget stock funds anticipatory reserve line in forecast"));
        return m;
    }

    // ── SQL helpers (each call isolated — no outer TX) ────────────────────────

    private Map<String, Object> one(String sql, Object... args) {
        try {
            return new LinkedHashMap<>(jdbc.queryForMap(sql, args));
        } catch (DataAccessException e) {
            return new LinkedHashMap<>();
        }
    }

    private List<Map<String, Object>> rows(String sql, Object... args) {
        try {
            List<Map<String, Object>> list = jdbc.queryForList(sql, args);
            List<Map<String, Object>> copy = new ArrayList<>(list.size());
            for (Map<String, Object> row : list) {
                copy.add(new LinkedHashMap<>(row));
            }
            return copy;
        } catch (DataAccessException e) {
            return List.of();
        }
    }

    private long count(String sql, Object... args) {
        try {
            Number num = jdbc.queryForObject(sql, Number.class, args);
            return num == null ? 0 : num.longValue();
        } catch (DataAccessException e) {
            return 0;
        }
    }

    private double scalarNum(String sql, Object... args) {
        try {
            Number num = jdbc.queryForObject(sql, Number.class, args);
            return num == null ? 0 : num.doubleValue();
        } catch (DataAccessException e) {
            return 0;
        }
    }

    private static double n(Object o) {
        if (o == null) {
            return 0;
        }
        if (o instanceof Number num) {
            return num.doubleValue();
        }
        try {
            return Double.parseDouble(o.toString());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private static long nLong(Object o) {
        return (long) n(o);
    }

    private static double round0(double v) {
        return BigDecimal.valueOf(v).setScale(0, RoundingMode.HALF_UP).doubleValue();
    }

    private static double round1(double v) {
        return BigDecimal.valueOf(v).setScale(1, RoundingMode.HALF_UP).doubleValue();
    }

    private static double round2(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    private static double round4(double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) {
            return 0;
        }
        return BigDecimal.valueOf(v).setScale(4, RoundingMode.HALF_UP).doubleValue();
    }
}
