package tz.go.pmo.dmis.monitoring;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.common.security.SecurityUtils;
import tz.go.pmo.dmis.mitigation.RegionDataBuilder;

/**
 * Builds the first national M&E layer from existing system evidence: administrative coverage, budget execution,
 * regional/district incident-flow staffing, preparedness assets, response activity, recovery activity,
 * institutions and partner coverage. Missing optional tables fail closed to zero/empty so the dashboard remains
 * usable across partially-migrated environments.
 */
@Service
@RequiredArgsConstructor
public class MonitoringEvaluationService {

    private static final String[] REGIONAL_TEAM_ROLES = {
            "Reg DC", "RAS", "RC", "Regional Planning Officer", "Regional Logistic Officer"
    };
    private static final String[] DISTRICT_TEAM_ROLES = {
            "Dist DC", "DED", "DAS", "District Commissioner", "District Planning Officer", "District Logistic Officer"
    };

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;
    private final RegionDataBuilder regionDataBuilder;

    @Transactional(readOnly = true)
    public Map<String, Object> dashboard() {
        Scope scope = currentScope();
        // Framework aims first (independent of operational SQL) so a later soft-fail cannot empty them.
        List<Map<String, Object>> aims = frameworkAims();
        Map<String, Object> budget = budget(scope);
        Map<String, Object> readiness = readiness(scope);
        Map<String, Object> resources = resourceDistribution(scope);
        Map<String, Object> budgetPulse = budgetPulse(scope, budget);
        Map<String, Object> resourcePulse = resourcePulse(scope, resources);
        Map<String, Object> interventionPulse = interventionPulse(scope);
        // F74: single capability matrix answering incidents / EW / disasters / cost used
        Map<String, Object> capabilityPulse = capabilityPulse(scope, interventionPulse);
        List<Map<String, Object>> scorecard = targetScorecard(scope, budgetPulse, resourcePulse, readiness, interventionPulse);
        Map<String, Object> command = commandSnapshot(budgetPulse, resourcePulse, readiness, interventionPulse, scorecard);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("generatedAt", OffsetDateTime.now().toString());
        out.put("scope", scopeMap(scope));
        out.put("frameworkAims", aims);
        // Smart command layer (primary UI)
        out.put("command", command);
        out.put("budgetPulse", budgetPulse);
        out.put("resourcePulse", resourcePulse);
        out.put("interventionPulse", interventionPulse);
        out.put("capabilityPulse", capabilityPulse);
        out.put("targetScorecard", scorecard);
        out.put("charts", charts(scope, budgetPulse, resourcePulse, resources));
        // Legacy/detail layers (still live, used by expanded tables)
        out.put("summary", summary(scope));
        out.put("budget", budget);
        out.put("readiness", readiness);
        out.put("cycleActivities", cycleActivities(scope));
        out.put("regionIndicators", regionIndicators(scope));
        out.put("lgaIndicators", lgaIndicators(scope));
        out.put("institutionLens", institutionLens(scope));
        out.put("incidentWarningIndicators", incidentWarningIndicators(scope));
        out.put("resourceDistribution", resources);
        return out;
    }

    /**
     * Original M&E module aims with live indicator counts (how many catalogue rows exist per aim).
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> frameworkAimsPublic() {
        return frameworkAims();
    }

    private List<Map<String, Object>> frameworkAims() {
        return rows("""
                select a.aim_code as "aimCode",
                       a.aim_group as "aimGroup",
                       a.title_en as "titleEn",
                       a.title_sw as "titleSw",
                       a.description_en as "descriptionEn",
                       a.me_level as "meLevel",
                       a.indicator_codes as "indicatorCodes",
                       a.sort_order as "sortOrder",
                       (select count(*)::int
                          from public.me_indicator_catalog c
                         where c.active
                           and position(',' || c.code || ',' in ',' || replace(a.indicator_codes, ' ', '') || ',') > 0
                       ) as "indicatorsPresent",
                       (length(replace(a.indicator_codes, ' ', ''))
                         - length(replace(replace(a.indicator_codes, ' ', ''), ',', '')) + 1) as "indicatorsPlanned"
                from public.me_framework_aims a
                where coalesce(a.active,true)
                order by a.sort_order, a.aim_code
                """);
    }

    /**
     * Single command strip: where we are vs thresholds (Sendai/UNDRR-style traffic lights on live evidence).
     */
    private Map<String, Object> commandSnapshot(Map<String, Object> budgetPulse,
                                                Map<String, Object> resourcePulse,
                                                Map<String, Object> readiness,
                                                Map<String, Object> interventionPulse,
                                                List<Map<String, Object>> scorecard) {
        long green = scorecard.stream().filter(s -> "green".equals(s.get("status"))).count();
        long amber = scorecard.stream().filter(s -> "amber".equals(s.get("status"))).count();
        long red = scorecard.stream().filter(s -> "red".equals(s.get("status"))).count();
        // Weighted traffic-light score: green=100, amber=50, red=0
        long total = Math.max(1, green + amber + red);
        int overall = (int) Math.round((green * 100.0 + amber * 50.0) / total);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("headline", "National disaster M&E command view — live system evidence");
        out.put("overallScore", overall);
        out.put("overallStatus", statusFromPct(overall, 70, 45));
        out.put("overallLabel", overall >= 70 ? "On track" : overall >= 45 ? "Needs attention" : "Off track");
        out.put("budgetExecutionPct", budgetPulse.get("executionPct"));
        out.put("budgetStatus", budgetPulse.get("status"));
        out.put("resourceFulfillmentPct", resourcePulse.get("fulfillmentPct"));
        out.put("resourceStatus", resourcePulse.get("status"));
        out.put("readinessScore", readiness.get("readinessScore"));
        out.put("readinessStatus", readiness.get("readinessStatus"));
        out.put("interventionsActive", interventionPulse.get("activePipeline"));
        out.put("scorecardGreen", green);
        out.put("scorecardAmber", amber);
        out.put("scorecardRed", red);
        out.put("stockUnits", resourcePulse.get("stockUnits"));
        out.put("stockValue", resourcePulse.get("stockValue"));
        out.put("availableVsUsedNote",
                "Available = warehouse stock; Used/distributed = allocations fulfilled + stock dispatches + relief distributions + budget disbursed.");
        return out;
    }

    private Map<String, Object> budgetPulse(Scope scope, Map<String, Object> budget) {
        double allocated = number(budget.get("allocated"));
        double committed = number(budget.get("committed"));
        double disbursed = number(budget.get("disbursed"));
        double lineAllocated = number(budget.get("lineAllocated"));
        double ndmf = number(one("""
                select coalesce(sum(amount),0) as v from public.ndmf_disbursements
                where lower(coalesce(status,'')) not in ('voided','cancelled','rejected')
                """).get("v"));
        double pledges = number(one("""
                select coalesce(sum(amount),0) as v from public.support_pledges
                where lower(coalesce(status,'')) in ('approved','accepted','fulfilled','pledged','submitted')
                """).get("v"));
        int executionPct = pct(disbursed, allocated > 0 ? allocated : Math.max(committed, 1));
        int commitPct = pct(committed, allocated > 0 ? allocated : 1);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("allocated", allocated);
        out.put("lineAllocated", lineAllocated);
        out.put("committed", committed);
        out.put("disbursed", disbursed);
        out.put("remaining", Math.max(0, allocated - disbursed));
        out.put("ndmfDisbursed", ndmf);
        out.put("partnerPledges", pledges);
        out.put("executionPct", executionPct);
        out.put("commitmentPct", commitPct);
        out.put("status", statusFromPct(executionPct, 60, 30));
        out.put("targetPct", 80);
        out.put("thresholdGreen", 60);
        out.put("thresholdAmber", 30);
        out.put("currency", "TZS");
        out.put("budgetCount", budget.get("budgetCount"));
        out.put("funnel", List.of(
                metric("Allocated", Math.round(allocated)),
                metric("Committed", Math.round(committed)),
                metric("Disbursed", Math.round(disbursed)),
                metric("NDMF", Math.round(ndmf))));
        return out;
    }

    private Map<String, Object> resourcePulse(Scope scope, Map<String, Object> resources) {
        List<Object> iArgs = new ArrayList<>();
        String iWhere = incidentScope("i", scope, iArgs);
        Map<String, Object> pipeline = one("""
                select coalesce(sum(ar.quantity_requested),0) as "requested",
                       coalesce(sum(ar.quantity_allocated),0) as "allocated",
                       count(*) as "requests",
                       count(*) filter (where lower(coalesce(ar.status,'')) in
                         ('allocated','approved','dispatched','deployed','received','fulfilled','completed','delivered')) as "fulfilledRequests",
                       count(*) filter (where lower(coalesce(ar.status,'')) in ('requested','pending','forwarded','under review')) as "openRequests"
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                where 1=1""" + iWhere, iArgs.toArray());

        double stockUnits = stockUnits(scope);
        List<Object> stockArgs = new ArrayList<>();
        String stockWhere = stockScope("w", "tw", scope, stockArgs);
        double stockValue = number(one("""
                select coalesce(sum(ii.quantity * coalesce(r.unit_cost,0)),0) as v
                from public.inventory_items ii
                left join public.resources r on r.id = ii.resource_id
                left join public.warehouses w on w.id = ii.warehouse_id
                left join public.temporary_warehouses tw on tw.id = ii.temporary_warehouse_id
                where 1=1""" + stockWhere, stockArgs.toArray()).get("v"));

        List<Object> lowArgs = new ArrayList<>();
        String lowWhere = stockScope("w", "tw", scope, lowArgs);
        long lowStock = count(
                "select count(*) from ("
                        + " select ii.resource_id, sum(ii.quantity) as qty"
                        + " from public.inventory_items ii"
                        + " left join public.resources r on r.id = ii.resource_id"
                        + " left join public.warehouses w on w.id = ii.warehouse_id"
                        + " left join public.temporary_warehouses tw on tw.id = ii.temporary_warehouse_id"
                        + " where 1=1" + lowWhere
                        + " group by ii.resource_id"
                        + " having max(coalesce(r.low_stock_threshold,0)) > 0"
                        + " and sum(ii.quantity) <= max(coalesce(r.low_stock_threshold,0))"
                        + ") x",
                lowArgs.toArray());

        long dispatches = count("""
                select count(*) from public.stock_movements sm
                where lower(coalesce(sm.movement_type,'')) in ('dispatch','deployment','deduction')
                  and lower(coalesce(sm.status,'')) in ('completed','complete','done','approved')
                """);
        long bids = count("select count(*) from public.stakeholder_resource_bids");

        double requested = number(pipeline.get("requested"));
        double allocated = number(pipeline.get("allocated"));
        int fulfillmentPct = pct(allocated, requested > 0 ? requested : 1);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stockUnits", stockUnits);
        out.put("stockValue", stockValue);
        out.put("lowStockItems", lowStock);
        out.put("requestedQty", requested);
        out.put("allocatedQty", allocated);
        out.put("availableQty", stockUnits);
        out.put("usedQty", allocated);
        out.put("fulfillmentPct", fulfillmentPct);
        out.put("openRequests", pipeline.get("openRequests"));
        out.put("fulfilledRequests", pipeline.get("fulfilledRequests"));
        out.put("totalRequests", pipeline.get("requests"));
        out.put("completedDispatches", dispatches);
        out.put("partnerBids", bids);
        out.put("status", statusFromPct(fulfillmentPct, 75, 40));
        out.put("targetPct", 90);
        out.put("thresholdGreen", 75);
        out.put("thresholdAmber", 40);
        out.put("stockByCategory", resources.get("stockByCategory"));
        out.put("allocationsByStatus", resources.get("allocationsByStatus"));
        out.put("stockByRegion", resources.get("stockByRegion"));
        return out;
    }

    private Map<String, Object> interventionPulse(Scope scope) {
        long mitigation = count("select count(*) from public.mitigation_measures");
        long training = count("select count(*) from public.training_plans");
        long anticipatory = countAnticipatoryPlans(scope);
        long contingency = countContingencyPlans();
        long relief = countReliefDistributions(scope);
        long assessments = countDamageAssessments(scope);
        long activeIncidents = countIncidents(scope, true);
        long warnings = activeWarnings(scope);
        long tasks = countIncidentTasks(scope);
        long recoveryPrograms = countSafe("select count(*) from public.recovery_programs");
        List<Object> openArgs = new ArrayList<>();
        String openWhere = incidentScope("i", scope, openArgs);
        long openAllocations = count("""
                select count(*) from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                where lower(coalesce(ar.status,'')) not in
                  ('fulfilled','completed','delivered','rejected','cancelled','closed')
                """ + openWhere, openArgs.toArray());

        long activePipeline = openAllocations + activeIncidents + warnings;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mitigationMeasures", mitigation);
        out.put("trainingPlans", training);
        out.put("anticipatoryPlans", anticipatory);
        out.put("contingencyPlans", contingency);
        out.put("reliefDistributions", relief);
        out.put("damageAssessments", assessments);
        out.put("activeIncidents", activeIncidents);
        out.put("activeWarnings", warnings);
        out.put("responseTasks", tasks);
        out.put("recoveryPrograms", recoveryPrograms);
        out.put("openAllocations", openAllocations);
        out.put("activePipeline", activePipeline);
        out.put("preventionTotal", mitigation);
        out.put("preparednessTotal", training + anticipatory + contingency);
        out.put("responseTotal", activeIncidents + openAllocations + tasks);
        out.put("recoveryTotal", relief + assessments + recoveryPrograms);
        out.put("cycleBars", List.of(
                Map.of("label", "Prevention", "value", mitigation, "color", "#0d6efd"),
                Map.of("label", "Preparedness", "value", training + anticipatory + contingency, "color", "#198754"),
                Map.of("label", "Response", "value", activeIncidents + openAllocations + tasks, "color", "#dc3545"),
                Map.of("label", "Recovery", "value", relief + assessments + recoveryPrograms, "color", "#6f42c1")));
        return out;
    }

    /**
     * F74 capability matrix close-out: one honest pulse for the user's ask —
     * incidents, issued early warning, disasters recorded, and cost used (same three-leg join
     * as Disaster Repository {@code costUsedTzs}: in-kind + budget commitments + gov_response_tzs).
     * Soft-fails to zeros if optional tables are absent.
     */
    private Map<String, Object> capabilityPulse(Scope scope, Map<String, Object> interventionPulse) {
        Map<String, Object> out = new LinkedHashMap<>();
        long incidentsTotal = countIncidents(scope, false);
        long incidentsActive = number(interventionPulse.get("activeIncidents"));
        long disasters = countSafe("select count(*) from public.disaster_events");
        long ewWindows = countSafe("""
                select count(*) from public.warnings w
                where lower(coalesce(w.status,'')) not in ('draft')
                """);
        long ewBulletins = countSafe("select count(*) from public.early_warnings");
        long activeWarnings = number(interventionPulse.get("activeWarnings"));

        // Per-disaster cost (only where disaster_event_links join incident / allocation)
        Map<String, Object> linkedCost = one("""
                select
                  coalesce(sum(coalesce(e.gov_response_tzs,0)),0) as recorded_gov_tzs,
                  coalesce(sum(coalesce((
                    select sum(ar.quantity_allocated * coalesce(r.unit_cost,0))
                      from public.allocated_resources ar
                      join public.resources r on r.id = ar.resource_id
                     where ar.incident_id in (
                             select entity_id from public.disaster_event_links li
                              where li.event_id = e.id and li.entity_type = 'incident')
                        or ar.id in (
                             select entity_id from public.disaster_event_links la
                              where la.event_id = e.id and la.entity_type = 'allocated_resource')
                  ),0)),0) as in_kind_tzs,
                  coalesce(sum(coalesce((
                    select sum(c.amount) from public.budget_commitments c
                     where c.status in ('approved','committed','disbursed')
                       and c.incident_id in (
                             select entity_id from public.disaster_event_links lc
                              where lc.event_id = e.id and lc.entity_type = 'incident')
                  ),0)),0) as budget_committed_tzs
                from public.disaster_events e
                """);
        // System-wide operational cost (honest total even when not yet linked to a repository card)
        Map<String, Object> opsCost = one("""
                select
                  coalesce((select sum(ar.quantity_allocated * coalesce(r.unit_cost,0))
                              from public.allocated_resources ar
                              join public.resources r on r.id = ar.resource_id),0) as in_kind_all_tzs,
                  coalesce((select sum(c.amount) from public.budget_commitments c
                             where c.status in ('approved','committed','disbursed')),0) as budget_all_tzs,
                  coalesce((select sum(coalesce(e.gov_response_tzs,0)) from public.disaster_events e),0) as recorded_all_tzs,
                  coalesce((select count(*) from public.disaster_event_links
                             where entity_type = 'incident'),0) as incident_links
                """);
        double linkedRecorded = number(linkedCost.get("recorded_gov_tzs"));
        double linkedInKind = number(linkedCost.get("in_kind_tzs"));
        double linkedBudget = number(linkedCost.get("budget_committed_tzs"));
        double linkedTotal = linkedRecorded + linkedInKind + linkedBudget;
        double opsInKind = number(opsCost.get("in_kind_all_tzs"));
        double opsBudget = number(opsCost.get("budget_all_tzs"));
        double opsRecorded = number(opsCost.get("recorded_all_tzs"));
        double opsTotal = opsInKind + opsBudget + opsRecorded;

        out.put("incidentsTotal", incidentsTotal);
        out.put("incidentsActive", incidentsActive);
        out.put("disastersRecorded", disasters);
        out.put("ewIssuedWindows", ewWindows);
        out.put("ewBulletins", ewBulletins);
        out.put("ewActive", activeWarnings);
        // Primary "cost used" = system operational total (answer the user's ask with a real number)
        out.put("costUsedTzs", opsTotal);
        out.put("costInKindTzs", opsInKind);
        out.put("costBudgetCommittedTzs", opsBudget);
        out.put("costRecordedGovTzs", opsRecorded);
        // Per-disaster join residual (honest): only spend already linked to a repository card
        out.put("costLinkedToDisastersTzs", linkedTotal);
        out.put("costLinkedInKindTzs", linkedInKind);
        out.put("costLinkedBudgetTzs", linkedBudget);
        out.put("costLinkedRecordedTzs", linkedRecorded);
        out.put("incidentLinks", number(opsCost.get("incident_links")));
        out.put("costNote",
                "Cost used (system) = in-kind allocations×unit_cost + budget commitments + recorded gov_response_tzs. "
                        + "Linked-to-disaster is the subset joined via disaster_event_links — link more incidents to cards to complete per-disaster rollups.");
        out.put("source", "incidents / warnings / early_warnings / disaster_events / disaster_event_links / allocated_resources / budget_commitments");
        return out;
    }

    /**
     * Exact scorecard: few indicators, each with target, actual from live tables, threshold status.
     */
    private List<Map<String, Object>> targetScorecard(Scope scope,
                                                      Map<String, Object> budgetPulse,
                                                      Map<String, Object> resourcePulse,
                                                      Map<String, Object> readiness,
                                                      Map<String, Object> interventionPulse) {
        List<Map<String, Object>> cards = new ArrayList<>();
        cards.add(score(
                "BUDGET_EXECUTION",
                "Budget execution",
                "Share of allocated disaster budget disbursed",
                number(budgetPulse.get("executionPct")),
                number(budgetPulse.get("targetPct")),
                "%",
                60, 30,
                "higher",
                "disaster_budgets / budget_commitments"));
        cards.add(score(
                "RESOURCE_FULFILLMENT",
                "Resource request fulfillment",
                "Quantity allocated vs requested for incident resource requests",
                number(resourcePulse.get("fulfillmentPct")),
                number(resourcePulse.get("targetPct")),
                "%",
                75, 40,
                "higher",
                "allocated_resources"));
        cards.add(score(
                "STOCK_AVAILABILITY",
                "Stock units available",
                "Current inventory across warehouses (available resources)",
                number(resourcePulse.get("stockUnits")),
                Math.max(number(resourcePulse.get("stockUnits")), 1), // dynamic floor — show actual availability
                "units",
                1, 0,
                "higher",
                "inventory_items"));
        // Override stock status: green if stock>0 and lowStock low
        Map<String, Object> stockCard = cards.get(cards.size() - 1);
        long low = number(resourcePulse.get("lowStockItems"));
        double stock = number(resourcePulse.get("stockUnits"));
        stockCard.put("actual", stock);
        stockCard.put("target", null);
        stockCard.put("targetLabel", "Maintain stocks above item thresholds");
        stockCard.put("status", stock <= 0 ? "red" : low > 0 ? "amber" : "green");
        stockCard.put("progressPct", stock <= 0 ? 0 : low > 0 ? 55 : 100);
        stockCard.put("detail", low + " item(s) at/below low-stock threshold");

        cards.add(score(
                "READINESS",
                "Operational readiness",
                "Composite of warehouses, stock, teams, plans and evacuation capacity",
                number(readiness.get("readinessScore")),
                75,
                "score",
                70, 45,
                "higher",
                "warehouses / teams / plans"));
        cards.add(score(
                "ACTIVE_PIPELINE",
                "Active interventions",
                "Open allocations + active incidents + active warnings",
                number(interventionPulse.get("activePipeline")),
                0,
                "cases",
                0, 0,
                "lower",
                "allocated_resources / incidents / warnings"));
        // For lower-is-better pipeline, invert status
        Map<String, Object> pipe = cards.get(cards.size() - 1);
        double active = number(pipe.get("actual"));
        pipe.put("status", active == 0 ? "green" : active <= 10 ? "amber" : "red");
        pipe.put("progressPct", active == 0 ? 100 : active <= 10 ? 60 : 25);
        pipe.put("targetLabel", "Clear open pipeline (lower is better)");
        pipe.put("target", 0);

        cards.add(score(
                "PREVENTION_MEASURES",
                "Prevention / mitigation measures",
                "Mitigation measures registered in the system",
                number(interventionPulse.get("mitigationMeasures")),
                Math.max(10, number(interventionPulse.get("mitigationMeasures"))),
                "measures",
                1, 0,
                "higher",
                "mitigation_measures"));
        Map<String, Object> prev = cards.get(cards.size() - 1);
        double m = number(prev.get("actual"));
        prev.put("status", m >= 10 ? "green" : m >= 3 ? "amber" : "red");
        prev.put("progressPct", pct(m, 10));
        prev.put("target", 10);
        prev.put("targetLabel", "≥ 10 active measures (national floor)");

        cards.add(score(
                "PREPAREDNESS_TRAINING",
                "Preparedness training plans",
                "Training plans supporting capacity building",
                number(interventionPulse.get("trainingPlans")),
                8,
                "plans",
                5, 2,
                "higher",
                "training_plans"));

        long meSubmitted = count("""
                select count(*) from public.me_indicator_values
                where status in ('submitted','approved')
                """);
        long meCatalog = count("select count(*) from public.me_indicator_catalog where active");
        cards.add(score(
                "ME_REPORTING",
                "M&E indicator reporting",
                "Submitted/approved indicator values vs active catalogue",
                meSubmitted,
                Math.max(meCatalog, 1),
                "values",
                50, 20,
                "higher",
                "me_indicator_values"));
        Map<String, Object> me = cards.get(cards.size() - 1);
        int mePct = pct(meSubmitted, Math.max(meCatalog, 1));
        me.put("actual", meSubmitted);
        me.put("target", meCatalog);
        me.put("progressPct", mePct);
        me.put("status", meSubmitted == 0 ? "amber" : statusFromPct(mePct, 40, 15));
        me.put("detail", meSubmitted + " of " + meCatalog + " catalogue indicators have values");
        return cards;
    }

    private Map<String, Object> charts(Scope scope,
                                       Map<String, Object> budgetPulse,
                                       Map<String, Object> resourcePulse,
                                       Map<String, Object> resources) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("budgetFunnel", budgetPulse.get("funnel"));
        out.put("cycleBars", interventionPulse(scope).get("cycleBars"));
        out.put("stockByCategory", takeTop(resources.get("stockByCategory"), 6));
        out.put("stockByRegion", takeTop(resources.get("stockByRegion"), 8));
        out.put("allocationsByStatus", resources.get("allocationsByStatus"));
        // Compact region risk/ops for one chart
        List<Map<String, Object>> regions = regionIndicators(scope);
        List<Map<String, Object>> topOps = new ArrayList<>();
        for (Map<String, Object> r : regions) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("label", r.get("regionName"));
            row.put("stock", r.get("stockUnits"));
            row.put("incidents", r.get("activeIncidents"));
            row.put("budget", r.get("budgetAllocated"));
            topOps.add(row);
        }
        topOps.sort((a, b) -> Long.compare(number(b.get("stock")) + number(b.get("incidents")) * 100,
                number(a.get("stock")) + number(a.get("incidents")) * 100));
        if (topOps.size() > 8) {
            topOps = topOps.subList(0, 8);
        }
        out.put("regionOps", topOps);
        out.put("resourceFulfillment", List.of(
                Map.of("label", "Requested", "value", number(resourcePulse.get("requestedQty"))),
                Map.of("label", "Allocated", "value", number(resourcePulse.get("allocatedQty"))),
                Map.of("label", "Available stock", "value", number(resourcePulse.get("availableQty")))));
        return out;
    }

    private Map<String, Object> score(String code, String name, String description,
                                      double actual, double target, String unit,
                                      int greenAt, int amberAt, String direction, String source) {
        int progress;
        String status;
        if ("lower".equals(direction)) {
            progress = actual <= target ? 100 : pct(target, actual);
            status = actual <= greenAt ? "green" : actual <= amberAt ? "amber" : "red";
        } else {
            progress = pct(actual, target > 0 ? target : 100);
            if ("%".equals(unit) || "score".equals(unit)) {
                status = statusFromPct((int) Math.round(actual), greenAt, amberAt);
                progress = (int) Math.min(100, Math.round(actual));
            } else {
                status = statusFromPct(progress, greenAt <= 100 ? greenAt : 70, amberAt <= 100 ? amberAt : 40);
            }
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("code", code);
        out.put("name", name);
        out.put("description", description);
        out.put("actual", actual);
        out.put("target", target);
        out.put("unit", unit);
        out.put("progressPct", progress);
        out.put("status", status);
        out.put("direction", direction);
        out.put("source", source);
        out.put("thresholdGreen", greenAt);
        out.put("thresholdAmber", amberAt);
        return out;
    }

    private String statusFromPct(int pct, int greenAt, int amberAt) {
        if (pct >= greenAt) {
            return "green";
        }
        if (pct >= amberAt) {
            return "amber";
        }
        return "red";
    }

    private int pct(double num, double den) {
        if (den <= 0) {
            return 0;
        }
        return (int) Math.round(Math.min(100, Math.max(0, (num / den) * 100.0)));
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> takeTop(Object listObj, int n) {
        if (!(listObj instanceof List<?> list) || list.isEmpty()) {
            return List.of();
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Object o : list) {
            if (o instanceof Map<?, ?> m) {
                out.add((Map<String, Object>) m);
            }
            if (out.size() >= n) {
                break;
            }
        }
        return out;
    }

    private long countSafe(String sql, Object... args) {
        try {
            return count(sql, args);
        } catch (DataAccessException e) {
            return 0;
        }
    }

    private Map<String, Object> summary(Scope scope) {
        Map<String, Object> out = new LinkedHashMap<>();

        List<Object> rArgs = new ArrayList<>();
        String regionWhere = regionScope("r", scope, rArgs);
        out.put("regionsTotal", count("select count(*) from public.regions r where 1=1" + regionWhere,
                rArgs.toArray()));
        out.put("mainlandRegions", count("select count(*) from public.regions r where coalesce(r.country_part,'mainland') = 'mainland'"
                + regionWhere, rArgs.toArray()));
        out.put("zanzibarRegions", count("select count(*) from public.regions r where coalesce(r.country_part,'mainland') = 'zanzibar'"
                + regionWhere, rArgs.toArray()));

        List<Object> dArgs = new ArrayList<>();
        String districtWhere = districtScope("d", "r", scope, dArgs);
        out.put("districtsTotal", count("""
                select count(*) from public.districts d
                left join public.regions r on r.id = d.region_id
                where 1=1""" + districtWhere, dArgs.toArray()));

        List<Object> cArgs = new ArrayList<>();
        String councilWhere = councilScope("c", "d", "r", scope, cArgs);
        out.put("councilsTotal", count("""
                select count(*) from public.councils c
                left join public.districts d on d.id = c.district_id
                left join public.regions r on r.id = c.region_id
                where 1=1""" + councilWhere, cArgs.toArray()));
        out.put("mainlandCouncils", count("""
                select count(*) from public.councils c
                left join public.districts d on d.id = c.district_id
                left join public.regions r on r.id = c.region_id
                where coalesce(c.country_part,'mainland') = 'mainland'""" + councilWhere, cArgs.toArray()));
        out.put("zanzibarCouncils", count("""
                select count(*) from public.councils c
                left join public.districts d on d.id = c.district_id
                left join public.regions r on r.id = c.region_id
                where coalesce(c.country_part,'mainland') = 'zanzibar'""" + councilWhere, cArgs.toArray()));

        out.put("activeIncidents", countIncidents(scope, true));
        out.put("allIncidents", countIncidents(scope, false));
        out.put("activeWarnings", activeWarnings(scope));
        out.put("stockUnits", stockUnits(scope));
        out.put("activeAgencies", count("select count(*) from public.agencies where coalesce(is_active,true)"));
        out.put("activeStakeholders", countStakeholders(scope));
        out.put("regionalTeamSeats", countRoleSeats(scope, REGIONAL_TEAM_ROLES));
        out.put("districtTeamSeats", countRoleSeats(scope, DISTRICT_TEAM_ROLES));
        return out;
    }

    private Map<String, Object> budget(Scope scope) {
        List<Object> lineArgs = new ArrayList<>();
        List<Object> committedArgs = new ArrayList<>();
        List<Object> disbursedArgs = new ArrayList<>();
        List<Object> mainArgs = new ArrayList<>();
        String lineWhere = budgetScope("db2", scope, lineArgs);
        String committedWhere = budgetScope("db3", scope, committedArgs);
        String disbursedWhere = budgetScope("db4", scope, disbursedArgs);
        String mainWhere = budgetScope("db", scope, mainArgs);
        List<Object> args = new ArrayList<>();
        args.addAll(lineArgs);
        args.addAll(committedArgs);
        args.addAll(disbursedArgs);
        args.addAll(mainArgs);
        return one("""
                select coalesce(sum(db.total_amount),0) as "allocated",
                       coalesce((select sum(bl.allocated_amount)
                                 from public.budget_lines bl
                                 join public.disaster_budgets db2 on db2.id = bl.disaster_budget_id
                                 where 1=1""" + lineWhere + """
                       ),0) as "lineAllocated",
                       coalesce((select sum(c.amount)
                                 from public.budget_commitments c
                                 join public.budget_lines bl on bl.id = c.budget_line_id
                                 join public.disaster_budgets db3 on db3.id = bl.disaster_budget_id
                                 where c.status in ('approved','committed','disbursed')""" + committedWhere + """
                       ),0) as "committed",
                       coalesce((select sum(coalesce(c.expended_amount, c.amount))
                                 from public.budget_commitments c
                                 join public.budget_lines bl on bl.id = c.budget_line_id
                                 join public.disaster_budgets db4 on db4.id = bl.disaster_budget_id
                                 where c.status = 'disbursed'""" + disbursedWhere + """
                       ),0) as "disbursed",
                       count(*) as "budgetCount"
                from public.disaster_budgets db
                where 1=1""" + mainWhere, args.toArray());
    }

    private Map<String, Object> readiness(Scope scope) {
        long regionalSeats = countRoleSeats(scope, REGIONAL_TEAM_ROLES);
        long districtSeats = countRoleSeats(scope, DISTRICT_TEAM_ROLES);
        long warehouses = countPermanentWarehouses(scope);
        long tempWh = countTemporaryWarehouses(scope);
        long evacuation = countEvacuationCenters(scope);
        long capacity = evacuationCapacity(scope);
        long stock = stockUnits(scope);
        long plans = countAnticipatoryPlans(scope) + countContingencyPlans();
        int districtCoverage = coveragePercent(
                countCoveredCouncils(scope, DISTRICT_TEAM_ROLES),
                (Number) summary(scope).get("councilsTotal")).intValue();

        // Composite readiness 0–100 from live operational capacity (best-practice multi-signal score)
        int score = 0;
        score += warehouses > 0 ? Math.min(20, 8 + (int) warehouses) : 0;
        score += stock > 0 ? Math.min(20, 10 + (int) Math.min(10, stock / 50)) : 0;
        score += Math.min(15, (int) regionalSeats * 2);
        score += Math.min(15, (int) districtSeats);
        score += Math.min(15, (int) plans * 3);
        score += Math.min(10, (int) evacuation);
        score += Math.min(5, districtCoverage / 20);
        score = Math.min(100, score);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("regionalTeamSeats", regionalSeats);
        out.put("districtTeamSeats", districtSeats);
        out.put("operationalWarehouses", warehouses);
        out.put("temporaryWarehouses", tempWh);
        out.put("evacuationCenters", evacuation);
        out.put("evacuationCapacity", capacity);
        out.put("stockUnits", stock);
        out.put("activePlans", plans);
        out.put("districtCoveragePercent", districtCoverage);
        out.put("readinessScore", score);
        out.put("readinessStatus", statusFromPct(score, 70, 45));
        out.put("readinessTarget", 75);
        return out;
    }

    private List<Map<String, Object>> cycleActivities(Scope scope) {
        Map<String, Object> prevention = mappedPrevention(scope);
        Map<String, Object> preparedness = new LinkedHashMap<>();
        preparedness.put("Warehouses", countPermanentWarehouses(scope) + countTemporaryWarehouses(scope));
        preparedness.put("Temporary warehouses", countTemporaryWarehouses(scope));
        preparedness.put("Evacuation centers", countEvacuationCenters(scope));
        preparedness.put("Training plans", count("select count(*) from public.training_plans"));
        preparedness.put("Anticipatory plans", countAnticipatoryPlans(scope));
        preparedness.put("Contingency plans", countContingencyPlans());

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("Incidents", countIncidents(scope, false));
        response.put("Active incidents", countIncidents(scope, true));
        response.put("Resource requests", countAllocatedResources(scope));
        response.put("Response tasks", countIncidentTasks(scope));
        response.put("Active warnings", activeWarnings(scope));

        Map<String, Object> recovery = new LinkedHashMap<>();
        recovery.put("Damage assessments", countDamageAssessments(scope));
        recovery.put("Relief distributions", countReliefDistributions(scope));
        recovery.put("Recovery programs", count("select count(*) from public.recovery_programs"));
        recovery.put("Strategic projects", count("select count(*) from public.strategic_projects"));
        recovery.put("Lessons / documents", count("select count(*) from public.disaster_knowledge_repositories"));

        return List.of(
                phase("Prevention / Mitigation", "fa-shield-halved", "#0d6efd", prevention),
                phase("Preparedness", "fa-hard-hat", "#198754", preparedness),
                phase("Response", "fa-bolt", "#dc3545", response),
                phase("Recovery", "fa-hands-helping", "#6f42c1", recovery));
    }

    private Map<String, Object> mappedPrevention(Scope scope) {
        String regionName = scopedRegionName(scope);
        if (regionName != null) {
            Map<String, Map<String, Object>> regionData = regionDataBuilder.build();
            Map<String, Object> r = regionData.getOrDefault(regionName, Map.of());
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("Hazards", count("select count(*) from public.hazards where coalesce(is_active,true)"));
            out.put("Mapped risk assessments", number(r.get("assessments")));
            out.put("Mapped mitigation measures", number(r.get("measures")));
            out.put("Strategic infrastructure", count("select count(*) from public.infrastructure_items"));
            out.put("Past disasters", count("select count(*) from public.past_disasters"));
            return out;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("Hazards", count("select count(*) from public.hazards where coalesce(is_active,true)"));
        out.put("Risk assessments", count("select count(*) from public.risk_assessments"));
        out.put("Mitigation measures", count("select count(*) from public.mitigation_measures"));
        out.put("Strategic infrastructure", count("select count(*) from public.infrastructure_items"));
        out.put("Past disasters", count("select count(*) from public.past_disasters"));
        return out;
    }

    private List<Map<String, Object>> regionIndicators(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = regionScope("r", scope, args);
        List<Map<String, Object>> rows = rows("""
                select r.id,
                       r.name as "regionName",
                       coalesce(r.country_part,'mainland') as "countryPart",
                       (select count(*) from public.districts d where d.region_id = r.id) as "districts",
                       (select count(*) from public.councils c where c.region_id = r.id) as "councils",
                       (select count(*) from public.councils c where c.region_id = r.id and coalesce(c.country_part,'mainland') = 'mainland') as "mainlandLgas",
                       (select coalesce(sum(db.total_amount),0) from public.disaster_budgets db where db.region_id = r.id) as "budgetAllocated",
                       (select coalesce(sum(coalesce(bc.expended_amount, bc.amount)),0)
                          from public.budget_commitments bc
                          join public.budget_lines bl on bl.id = bc.budget_line_id
                          join public.disaster_budgets db on db.id = bl.disaster_budget_id
                         where db.region_id = r.id
                           and bc.status = 'disbursed'
                           and bc.incident_id is not null) as "regionalBudgetResponseUsed",
                       (select count(*) from public.incidents i where i.region_id = r.id) as "incidents",
                       (select count(*) from public.incidents i where i.region_id = r.id and lower(coalesce(i.status,'')) not in ('resolved','closed','information only')) as "activeIncidents",
                       (select count(distinct w.id) from public.warnings w join public.warning_hazards wh on wh.warning_id = w.id
                         where wh.region_id = r.id and lower(coalesce(w.status,'')) not in ('expired','cancelled','closed')) as "activeWarnings",
                       (select count(*) from public.warehouses w where w.region_id = r.id) as "warehouses",
                       (select count(*) from public.temporary_warehouses tw where tw.region_id = r.id and coalesce(tw.is_active,true)) as "temporaryWarehouses",
                       (select coalesce(sum(ii.quantity),0)
                          from public.inventory_items ii
                          left join public.warehouses w on w.id = ii.warehouse_id
                          left join public.temporary_warehouses tw on tw.id = ii.temporary_warehouse_id
                         where w.region_id = r.id or tw.region_id = r.id) as "stockUnits",
                       (select count(*) from public.evacuation_centers e where lower(e.region) = lower(r.name)) as "evacuationCenters",
                       (select coalesce(sum(e.capacity_people),0) from public.evacuation_centers e where lower(e.region) = lower(r.name)) as "evacuationCapacity",
                       (select count(distinct u.id)
                          from public.users u
                          join public.model_has_roles m on m.model_id = u.id
                          join public.roles ro on ro.id = m.role_id
                         where u.region_id = r.id and ro.name in ('Reg DC','RAS','RC','Regional Planning Officer','Regional Logistic Officer')) as "responseTeamSeats"
                from public.regions r
                where 1=1""" + where + "\n order by coalesce(r.country_part,'mainland'), r.name", args.toArray());

        Map<String, Map<String, Object>> regionData = regionDataBuilder.build();
        for (Map<String, Object> row : rows) {
            Map<String, Object> risk = regionData.getOrDefault(String.valueOf(row.get("regionName")), Map.of());
            row.put("riskAssessments", number(risk.get("assessments")));
            row.put("mappedMitigationMeasures", number(risk.get("measures")));
            row.put("riskLevel", risk.getOrDefault("riskLevel", "None"));
        }
        return rows;
    }

    private List<Map<String, Object>> lgaIndicators(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = councilScope("c", "d", "r", scope, args);
        return rows("""
                select c.id,
                       c.name as "councilName",
                       coalesce(c.country_part,'mainland') as "countryPart",
                       d.name as "districtName",
                       r.name as "regionName",
                       (select coalesce(sum(db.total_amount),0) from public.disaster_budgets db where db.district_id = d.id) as "budgetAllocated",
                       (select count(*) from public.incidents i where i.district_id = d.id) as "incidents",
                       (select count(*) from public.incidents i where i.district_id = d.id and lower(coalesce(i.status,'')) not in ('resolved','closed','information only')) as "activeIncidents",
                       (select count(distinct w.id) from public.warnings w join public.warning_hazards wh on wh.warning_id = w.id
                         where wh.district_id = d.id and lower(coalesce(w.status,'')) not in ('expired','cancelled','closed')) as "activeWarnings",
                       (select count(*) from public.anticipatory_action_plans a where a.district_id = d.id or lower(a.district_council) = lower(c.name)) as "anticipatoryPlans",
                       (select count(*) from public.evacuation_centers e where lower(e.district) = lower(d.name)) as "evacuationCenters",
                       (select coalesce(sum(e.capacity_people),0) from public.evacuation_centers e where lower(e.district) = lower(d.name)) as "evacuationCapacity",
                       (select count(distinct u.id)
                          from public.users u
                          join public.model_has_roles m on m.model_id = u.id
                          join public.roles ro on ro.id = m.role_id
                         where (u.council_id = c.id or (u.council_id is null and u.district_id = d.id))
                           and ro.name in ('Dist DC','DED','DAS','District Commissioner','District Planning Officer','District Logistic Officer')) as "incidentFlowSeats"
                from public.councils c
                left join public.districts d on d.id = c.district_id
                left join public.regions r on r.id = c.region_id
                where 1=1""" + where + "\n order by r.name, c.name", args.toArray());
    }

    /**
     * Institution lens on the M&E dashboard.
     * PMO ({@code monitoring_evaluation.manage}) sees the national institution picture.
     * MDA focals see only their own agency; area officers do not get the full national MDA registry.
     * Stakeholders stay area-scoped via {@link #stakeholderScope}.
     */
    private Map<String, Object> institutionLens(Scope scope) {
        List<Object> stArgs = new ArrayList<>();
        String stWhere = stakeholderScope("s", scope, stArgs);
        Map<String, Object> out = new LinkedHashMap<>();
        boolean pmo = SecurityUtils.hasAuthority("monitoring_evaluation.manage");
        Long ownAgency = jurisdiction.currentAgencyId();
        Long ownStakeholder = jurisdiction.currentStakeholderId();
        out.put("nationalRegistry", pmo);
        out.put("scopeNote", pmo
                ? "National institution registry (PMO M&E manage)"
                : ownAgency != null
                    ? "Your institution only — report indicators for your mandate"
                    : ownStakeholder != null
                        ? "Your organisation only"
                        : "Area-scoped partners; full MDA registry is PMO-only");

        if (pmo) {
            out.put("agenciesByType", rows("""
                    select coalesce(agency_type,'Unclassified') as "category", count(*) as "total"
                    from public.agencies
                    where coalesce(is_active,true)
                    group by 1 order by 2 desc, 1
                    """));
            out.put("agenciesByClass", rows("""
                    select coalesce(institution_class,'Unclassified') as "category", count(*) as "total"
                    from public.agencies
                    where coalesce(is_active,true)
                    group by 1 order by 2 desc, 1
                    """));
            out.put("stakeholdersByClass", rows("""
                    select coalesce(institution_class,'Unclassified') as "category", count(*) as "total"
                    from public.stakeholders s
                    where coalesce(s.is_active,true)""" + stWhere + """
                    group by 1 order by 2 desc, 1
                    """, stArgs.toArray()));
            out.put("indicatorsByLevel", rows("""
                    select level as "category", count(*) as "total"
                    from public.me_indicator_catalog
                    where active
                    group by 1 order by 2 desc, 1
                    """));
            out.put("coverage", List.of(
                    metric("Ministries", count("select count(*) from public.agencies where coalesce(is_active,true) and institution_class = 'Ministry'")),
                    metric("Gov. institutions", count("select count(*) from public.agencies where coalesce(is_active,true) and institution_class = 'Government Institution'")),
                    metric("LGAs", count("select count(*) from public.agencies where coalesce(is_active,true) and institution_class = 'Local Government Authority'")),
                    metric("Academic / research", count("select count(*) from public.agencies where coalesce(is_active,true) and institution_class = 'Academic and Research Institution'")),
                    metric("UN agencies", count("""
                            select count(*) from public.stakeholders s
                            where coalesce(s.is_active,true) and s.institution_class = 'UN Agency'""" + stWhere, stArgs.toArray())),
                    metric("NGOs", count("""
                            select count(*) from public.stakeholders s
                            where coalesce(s.is_active,true) and s.institution_class = 'NGO'""" + stWhere, stArgs.toArray())),
                    metric("Private sector", count("""
                            select count(*) from public.stakeholders s
                            where coalesce(s.is_active,true) and s.institution_class = 'Private Sector'""" + stWhere, stArgs.toArray())),
                    metric("FBO / Media / Diplomatic", count("""
                            select count(*) from public.stakeholders s
                            where coalesce(s.is_active,true)
                              and s.institution_class in ('Faith-Based Organization','Media','Diplomatic Mission')"""
                            + stWhere, stArgs.toArray()))));
        } else if (ownAgency != null) {
            out.put("agenciesByType", rows("""
                    select coalesce(agency_type,'Unclassified') as "category", count(*) as "total"
                    from public.agencies
                    where coalesce(is_active,true) and id = ?
                    group by 1 order by 2 desc, 1
                    """, ownAgency));
            out.put("ownAgency", one("""
                    select id, name, acronym, agency_type as "agencyType", institution_class as "institutionClass",
                           sector_tags as "sectorTags", me_required as "meRequired"
                    from public.agencies where id = ?
                    """, ownAgency));
            out.put("coverage", List.of(
                    metric("Your institution", 1),
                    metric("M&E required", count("select count(*) from public.agencies where id = ? and coalesce(me_required,false)", ownAgency))));
        } else {
            // Area officers / others: no national MDA roll-up
            out.put("agenciesByType", List.of());
            out.put("coverage", List.of(
                    metric("Government agencies (national — PMO only)", 0),
                    metric("Government stakeholders (your area)", count("""
                            select count(*) from public.stakeholders s
                            where coalesce(s.is_active,true) and s.type = 'Government'""" + stWhere, stArgs.toArray())),
                    metric("NGO / FBO / civil society (your area)", count("""
                            select count(*) from public.stakeholders s
                            where coalesce(s.is_active,true) and (s.type = 'NGO' or s.sector ilike '%faith%' or s.organization ilike '%church%' or s.organization ilike '%islam%')"""
                            + stWhere, stArgs.toArray())),
                    metric("INGO / international (your area)", count("""
                            select count(*) from public.stakeholders s
                            where coalesce(s.is_active,true) and s.type = 'International'""" + stWhere, stArgs.toArray())),
                    metric("Private sector (your area)", count("""
                            select count(*) from public.stakeholders s
                            where coalesce(s.is_active,true) and s.type = 'Private'""" + stWhere, stArgs.toArray()))));
        }

        if (ownStakeholder != null && !pmo) {
            stWhere = stWhere + " and s.id = ?";
            stArgs.add(ownStakeholder);
        }
        out.put("stakeholdersByType", rows("""
                select coalesce(type,'Unclassified') as "category",
                       count(*) as "total",
                       count(*) filter (where coalesce(is_verified,false)) as "verified"
                from public.stakeholders s
                where coalesce(s.is_active,true)""" + stWhere + """
                group by 1 order by 2 desc, 1
                """, stArgs.toArray()));
        out.put("stakeholdersBySector", rows("""
                select coalesce(sector,'Unclassified') as "sector", count(*) as "total"
                from public.stakeholders s
                where coalesce(s.is_active,true)""" + stWhere + """
                group by 1 order by 2 desc, 1 limit 12
                """, stArgs.toArray()));
        return out;
    }

    private Map<String, Object> incidentWarningIndicators(Scope scope) {
        List<Object> iArgs = new ArrayList<>();
        String iWhere = incidentScope("i", scope, iArgs);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("incidentStatus", rows("""
                select coalesce(i.status,'Unclassified') as "status", count(*) as "total"
                from public.incidents i
                where 1=1""" + iWhere + """
                group by 1 order by 2 desc, 1
                """, iArgs.toArray()));
        out.put("warningStatus", rows("""
                select coalesce(w.status,'Unclassified') as "status", count(distinct w.id) as "total"
                from public.warnings w
                left join public.warning_hazards wh on wh.warning_id = w.id
                where 1=1""" + warningScope("wh", scope, new ArrayList<>()) + """
                group by 1 order by 2 desc, 1
                """, warningArgs(scope)));
        out.put("activeIncidents", countIncidents(scope, true));
        out.put("activeWarnings", activeWarnings(scope));
        out.put("peopleAtRisk", flatWarningPeopleAtRisk(scope));
        out.put("recentIncidents", rows("""
                select i.id, i.title, i.status, i.severity_level as "severity", i.reported_at as "reportedAt",
                       r.name as "regionName", d.name as "districtName"
                from public.incidents i
                left join public.regions r on r.id = i.region_id
                left join public.districts d on d.id = i.district_id
                where 1=1""" + iWhere + """
                order by coalesce(i.reported_at, i.created_at) desc nulls last limit 8
                """, iArgs.toArray()));
        out.put("recentWarnings", recentWarnings(scope));
        return out;
    }

    private Map<String, Object> resourceDistribution(Scope scope) {
        List<Object> stockArgs = new ArrayList<>();
        String stockWhere = stockScope("w", "tw", scope, stockArgs);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("stockByCategory", rows("""
                select coalesce(r.category, ii.category, 'Unclassified') as "category",
                       coalesce(sum(ii.quantity),0) as "stockUnits",
                       coalesce(sum(ii.quantity * coalesce(r.unit_cost,0)),0) as "stockValue"
                from public.inventory_items ii
                left join public.resources r on r.id = ii.resource_id
                left join public.warehouses w on w.id = ii.warehouse_id
                left join public.temporary_warehouses tw on tw.id = ii.temporary_warehouse_id
                where 1=1""" + stockWhere + " group by 1 order by 2 desc, 1", stockArgs.toArray()));
        // rebuild stock args — previous query may not have consumed them if empty, but safe to rebuild
        List<Object> regionStockArgs = new ArrayList<>();
        String regionStockWhere = stockScope("w", "tw", scope, regionStockArgs);
        out.put("stockByRegion", rows("""
                select coalesce(rg.name, 'National / unassigned') as "regionName",
                       coalesce(sum(ii.quantity),0) as "stockUnits",
                       count(distinct coalesce(w.id, tw.id)) as "stores"
                from public.inventory_items ii
                left join public.warehouses w on w.id = ii.warehouse_id
                left join public.temporary_warehouses tw on tw.id = ii.temporary_warehouse_id
                left join public.regions rg on rg.id = coalesce(w.region_id, tw.region_id)
                where 1=1""" + regionStockWhere + " group by 1 order by 2 desc, 1 limit 20",
                regionStockArgs.toArray()));
        List<Object> arArgs = new ArrayList<>();
        String arWhere = incidentScope("i", scope, arArgs);
        out.put("allocationsByStatus", rows("""
                select coalesce(ar.status,'Unclassified') as "status",
                       count(*) as "requests",
                       coalesce(sum(ar.quantity_requested),0) as "requested",
                       coalesce(sum(ar.quantity_allocated),0) as "allocated"
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                where 1=1""" + arWhere + " group by 1 order by 2 desc, 1", arArgs.toArray()));
        List<Object> whArgs = new ArrayList<>();
        String whWhere = warehouseScope("w", scope, whArgs);
        out.put("warehouseStatus", rows("""
                select coalesce(w.operational_status,'Unknown') as "status", count(*) as "total"
                from public.warehouses w
                where 1=1""" + whWhere + " group by 1 order by 2 desc, 1", whArgs.toArray()));
        return out;
    }

    private Map<String, Object> phase(String title, String icon, String color, Map<String, Object> indicators) {
        long total = indicators.values().stream().mapToLong(this::number).sum();
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("title", title);
        out.put("icon", icon);
        out.put("color", color);
        out.put("total", total);
        out.put("indicators", indicators);
        return out;
    }

    private Map<String, Object> metric(String label, long value) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("label", label);
        out.put("value", value);
        return out;
    }

    private Scope currentScope() {
        JurisdictionScope.AreaFilter f = jurisdiction.sharedOrOwnFilter();
        return new Scope(f.scope(), f.regionId(), f.districtId(), f.councilId());
    }

    private Map<String, Object> scopeMap(Scope scope) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("level", scope.level());
        out.put("regionId", scope.regionId());
        out.put("districtId", scope.districtId());
        out.put("councilId", scope.councilId());
        out.put("regionName", scope.regionId() == null ? null : nameOf("regions", scope.regionId()));
        out.put("districtName", scope.districtId() == null ? null : nameOf("districts", scope.districtId()));
        out.put("councilName", scope.councilId() == null ? null : nameOf("councils", scope.councilId()));
        return out;
    }

    private long countIncidents(Scope scope, boolean activeOnly) {
        List<Object> args = new ArrayList<>();
        String where = incidentScope("i", scope, args);
        String active = activeOnly ? " and lower(coalesce(i.status,'')) not in ('resolved','closed','information only')" : "";
        return count("select count(*) from public.incidents i where 1=1" + where + active, args.toArray());
    }

    private long activeWarnings(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = warningScope("wh", scope, args);
        return count("""
                select count(distinct w.id)
                from public.warnings w
                left join public.warning_hazards wh on wh.warning_id = w.id
                where lower(coalesce(w.status,'')) not in ('expired','cancelled','closed')""" + where,
                args.toArray());
    }

    private long flatWarningPeopleAtRisk(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = flatWarningScope("ew", scope, args);
        return number(one("""
                select coalesce(sum(ew.people_at_risk),0) as "peopleAtRisk"
                from public.early_warnings ew
                where coalesce(ew.show_on_map,true)""" + where, args.toArray()).get("peopleAtRisk"));
    }

    private List<Map<String, Object>> recentWarnings(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = flatWarningScope("ew", scope, args);
        return rows("""
                select ew.id, ew.warning_code as "warningCode", ew.hazard_type as "hazardType",
                       ew.severity_level as "severity", ew.status, ew.affected_regions as "affectedRegions",
                       ew.people_at_risk as "peopleAtRisk", ew.created_at as "createdAt"
                from public.early_warnings ew
                where coalesce(ew.show_on_map,true)""" + where + "\n order by ew.created_at desc nulls last limit 8", args.toArray());
    }

    private long countStakeholders(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = stakeholderScope("s", scope, args);
        return count("select count(*) from public.stakeholders s where coalesce(s.is_active,true)" + where,
                args.toArray());
    }

    private long countRoleSeats(Scope scope, String[] roles) {
        List<Object> args = new ArrayList<>();
        String where = userScope("u", scope, args);
        return count("""
                select count(distinct u.id)
                from public.users u
                join public.model_has_roles m on m.model_id = u.id
                join public.roles r on r.id = m.role_id
                where r.name in (""" + placeholders(roles.length) + ")" + where,
                join(args, roles));
    }

    private long countCoveredCouncils(Scope scope, String[] roles) {
        List<Object> args = new ArrayList<>();
        String where = councilScope("c", "d", "rg", scope, args);
        return count("""
                select count(*) from (
                    select c.id
                    from public.councils c
                    left join public.districts d on d.id = c.district_id
                    left join public.regions rg on rg.id = c.region_id
                    left join public.users u on u.council_id = c.id or (u.council_id is null and u.district_id = d.id)
                    left join public.model_has_roles m on m.model_id = u.id
                    left join public.roles r on r.id = m.role_id and r.name in (""" + placeholders(roles.length) + """
                    )
                    where 1=1""" + where + "\n group by c.id having count(distinct r.name) >= 2 ) x", join(args, roles));
    }

    private long stockUnits(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = stockScope("w", "tw", scope, args);
        return number(one("""
                select coalesce(sum(ii.quantity),0) as "stockUnits"
                from public.inventory_items ii
                left join public.warehouses w on w.id = ii.warehouse_id
                left join public.temporary_warehouses tw on tw.id = ii.temporary_warehouse_id
                where 1=1""" + where, args.toArray()).get("stockUnits"));
    }

    private long countPermanentWarehouses(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = warehouseScope("w", scope, args);
        return count("select count(*) from public.warehouses w where lower(coalesce(w.operational_status,'operational')) not in ('closed','inactive')" + where,
                args.toArray());
    }

    private long countTemporaryWarehouses(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = temporaryWarehouseScope("tw", scope, args);
        return count("select count(*) from public.temporary_warehouses tw where coalesce(tw.is_active,true)" + where,
                args.toArray());
    }

    private long countEvacuationCenters(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = nameScope("e.region", "e.district", scope, args);
        return count("select count(*) from public.evacuation_centers e where lower(coalesce(e.status,'active')) <> 'inactive'"
                + where, args.toArray());
    }

    private long evacuationCapacity(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = nameScope("e.region", "e.district", scope, args);
        return number(one("select coalesce(sum(e.capacity_people),0) as capacity from public.evacuation_centers e where 1=1"
                + where, args.toArray()).get("capacity"));
    }

    private long countAnticipatoryPlans(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = areaScope("a", scope, args);
        return count("select count(*) from public.anticipatory_action_plans a where 1=1" + where, args.toArray());
    }

    private long countContingencyPlans() {
        return count("select count(*) from public.contingency_plans");
    }

    private long countAllocatedResources(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = incidentScope("i", scope, args);
        return count("""
                select count(*)
                from public.allocated_resources ar
                join public.incidents i on i.id = ar.incident_id
                where 1=1""" + where, args.toArray());
    }

    private long countIncidentTasks(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = incidentScope("i", scope, args);
        return count("""
                select count(*)
                from public.incident_tasks t
                join public.incidents i on i.id = t.incident_id
                where 1=1""" + where, args.toArray());
    }

    private long countDamageAssessments(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = incidentScope("i", scope, args);
        return count("""
                select count(*)
                from public.damage_assessments da
                left join public.incidents i on i.id = da.incident_id
                where 1=1""" + where, args.toArray());
    }

    private long countReliefDistributions(Scope scope) {
        List<Object> args = new ArrayList<>();
        String where = incidentScope("i", scope, args);
        return count("""
                select count(*)
                from public.relief_distributions rd
                left join public.damage_assessments da on da.id = rd.damage_assessment_id
                left join public.incidents i on i.id = da.incident_id
                where 1=1""" + where, args.toArray());
    }

    private String regionScope(String alias, Scope scope, List<Object> args) {
        String p = alias + ".";
        if ("REGION".equals(scope.level()) && scope.regionId() != null) {
            args.add(scope.regionId());
            return " and " + p + "id = ?";
        }
        if ("DISTRICT".equals(scope.level())) {
            if (scope.districtId() != null) {
                args.add(scope.districtId());
                return " and " + p + "id = (select region_id from public.districts where id = ?)";
            }
            if (scope.councilId() != null) {
                args.add(scope.councilId());
                return " and " + p + "id = (select region_id from public.councils where id = ?)";
            }
        }
        return "";
    }

    private String districtScope(String districtAlias, String regionAlias, Scope scope, List<Object> args) {
        if ("REGION".equals(scope.level()) && scope.regionId() != null) {
            args.add(scope.regionId());
            return " and " + regionAlias + ".id = ?";
        }
        if ("DISTRICT".equals(scope.level())) {
            if (scope.districtId() != null) {
                args.add(scope.districtId());
                return " and " + districtAlias + ".id = ?";
            }
            if (scope.councilId() != null) {
                args.add(scope.councilId());
                return " and " + districtAlias + ".id = (select district_id from public.councils where id = ?)";
            }
        }
        return "";
    }

    private String councilScope(String councilAlias, String districtAlias, String regionAlias,
                                Scope scope, List<Object> args) {
        if ("REGION".equals(scope.level()) && scope.regionId() != null) {
            args.add(scope.regionId());
            return " and " + regionAlias + ".id = ?";
        }
        if ("DISTRICT".equals(scope.level())) {
            if (scope.councilId() != null) {
                args.add(scope.councilId());
                return " and " + councilAlias + ".id = ?";
            }
            if (scope.districtId() != null) {
                args.add(scope.districtId());
                return " and " + districtAlias + ".id = ?";
            }
        }
        return "";
    }

    private String areaScope(String alias, Scope scope, List<Object> args) {
        if ("REGION".equals(scope.level()) && scope.regionId() != null) {
            args.add(scope.regionId());
            return " and " + alias + ".region_id = ?";
        }
        if ("DISTRICT".equals(scope.level()) && scope.districtId() != null) {
            args.add(scope.districtId());
            return " and " + alias + ".district_id = ?";
        }
        return "";
    }

    private String budgetScope(String alias, Scope scope, List<Object> args) {
        return areaScope(alias, scope, args);
    }

    private String incidentScope(String alias, Scope scope, List<Object> args) {
        return areaScope(alias, scope, args);
    }

    private String stakeholderScope(String alias, Scope scope, List<Object> args) {
        return areaScope(alias, scope, args);
    }

    private String warehouseScope(String alias, Scope scope, List<Object> args) {
        return areaScope(alias, scope, args);
    }

    private String temporaryWarehouseScope(String alias, Scope scope, List<Object> args) {
        return areaScope(alias, scope, args);
    }

    private String warningScope(String alias, Scope scope, List<Object> args) {
        return areaScope(alias, scope, args);
    }

    private String userScope(String alias, Scope scope, List<Object> args) {
        if ("REGION".equals(scope.level()) && scope.regionId() != null) {
            args.add(scope.regionId());
            return " and " + alias + ".region_id = ?";
        }
        if ("DISTRICT".equals(scope.level())) {
            if (scope.councilId() != null) {
                args.add(scope.councilId());
                return " and " + alias + ".council_id = ?";
            }
            if (scope.districtId() != null) {
                args.add(scope.districtId());
                return " and " + alias + ".district_id = ?";
            }
        }
        return "";
    }

    private String stockScope(String warehouseAlias, String temporaryAlias, Scope scope, List<Object> args) {
        if ("REGION".equals(scope.level()) && scope.regionId() != null) {
            args.add(scope.regionId());
            args.add(scope.regionId());
            return " and (" + warehouseAlias + ".region_id = ? or " + temporaryAlias + ".region_id = ?)";
        }
        if ("DISTRICT".equals(scope.level()) && scope.districtId() != null) {
            args.add(scope.districtId());
            args.add(scope.districtId());
            return " and (" + warehouseAlias + ".district_id = ? or " + temporaryAlias + ".district_id = ?)";
        }
        return "";
    }

    private String nameScope(String regionColumn, String districtColumn, Scope scope, List<Object> args) {
        if ("REGION".equals(scope.level()) && scope.regionId() != null) {
            String name = nameOf("regions", scope.regionId());
            if (name == null) {
                return " and 1=0";
            }
            args.add(name);
            return " and lower(" + regionColumn + ") = lower(?)";
        }
        if ("DISTRICT".equals(scope.level()) && scope.districtId() != null) {
            String name = nameOf("districts", scope.districtId());
            if (name == null) {
                return " and 1=0";
            }
            args.add(name);
            return " and lower(" + districtColumn + ") = lower(?)";
        }
        return "";
    }

    private String flatWarningScope(String alias, Scope scope, List<Object> args) {
        if ("REGION".equals(scope.level()) && scope.regionId() != null) {
            String name = nameOf("regions", scope.regionId());
            if (name == null) {
                return " and 1=0";
            }
            args.add("%" + name.toLowerCase(Locale.ROOT) + "%");
            return " and lower(coalesce(" + alias + ".affected_regions,'')) like ?";
        }
        if ("DISTRICT".equals(scope.level()) && scope.districtId() != null) {
            String name = nameOf("districts", scope.districtId());
            if (name == null) {
                return " and 1=0";
            }
            args.add("%" + name.toLowerCase(Locale.ROOT) + "%");
            return " and lower(coalesce(" + alias + ".affected_districts,'')) like ?";
        }
        return "";
    }

    private Object[] warningArgs(Scope scope) {
        List<Object> args = new ArrayList<>();
        warningScope("wh", scope, args);
        return args.toArray();
    }

    private Object[] incidentArgs(Scope scope) {
        List<Object> args = new ArrayList<>();
        incidentScope("i", scope, args);
        return args.toArray();
    }

    private Object[] warehouseArgs(Scope scope) {
        List<Object> args = new ArrayList<>();
        warehouseScope("w", scope, args);
        return args.toArray();
    }

    private String scopedRegionName(Scope scope) {
        if (scope.regionId() != null) {
            return nameOf("regions", scope.regionId());
        }
        if (scope.districtId() != null) {
            return value("select r.name from public.districts d join public.regions r on r.id = d.region_id where d.id = ?",
                    scope.districtId());
        }
        return null;
    }

    private String nameOf(String table, Long id) {
        return value("select name from public." + table + " where id = ?", id);
    }

    private String value(String sql, Object... args) {
        try {
            return jdbc.queryForObject(sql, String.class, args);
        } catch (DataAccessException e) {
            return null;
        }
    }

    private Map<String, Object> one(String sql, Object... args) {
        try {
            return jdbc.queryForMap(sql, args);
        } catch (DataAccessException e) {
            return new LinkedHashMap<>();
        }
    }

    private List<Map<String, Object>> rows(String sql, Object... args) {
        try {
            return jdbc.queryForList(sql, args);
        } catch (DataAccessException e) {
            return List.of();
        }
    }

    private long count(String sql, Object... args) {
        try {
            Number value = jdbc.queryForObject(sql, Number.class, args);
            return value == null ? 0 : value.longValue();
        } catch (DataAccessException e) {
            return 0;
        }
    }

    private long number(Object value) {
        if (value instanceof Number n) {
            return n.longValue();
        }
        if (value == null) {
            return 0;
        }
        try {
            return new BigDecimal(value.toString()).longValue();
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private BigDecimal coveragePercent(long covered, Number total) {
        if (total == null || total.longValue() <= 0) {
            return BigDecimal.ZERO;
        }
        return BigDecimal.valueOf(covered)
                .multiply(BigDecimal.valueOf(100))
                .divide(BigDecimal.valueOf(total.longValue()), 1, RoundingMode.HALF_UP);
    }

    private String placeholders(int count) {
        return String.join(",", java.util.Collections.nCopies(count, "?"));
    }

    private Object[] join(List<Object> tail, String[] head) {
        List<Object> args = new ArrayList<>(head.length + tail.size());
        args.addAll(List.of(head));
        args.addAll(tail);
        return args.toArray();
    }

    private record Scope(String level, Long regionId, Long districtId, Long councilId) {}
}
