package tz.go.pmo.dmis.repository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * SENDAI ANALYTICS — turns the validated disaster repository into the figures the
 * Sendai Framework Monitor asks for, plus the insight layer that demonstrates DMD
 * intervention value to leadership and partners.
 *
 * <p>Only Validated/Archived event cards count (EOCC freezes a card before it reports).
 * Normalization uses {@code sendai_baselines} (population for per-100,000 — indicators
 * A-1/B-1; GDP for loss-as-share-of-GDP — indicator C-1), falling back to the latest
 * baseline year available.</p>
 */
@Service
@RequiredArgsConstructor
public class SendaiAnalyticsService {

    /** Cards whose figures are allowed into the national numbers. */
    private static final String COUNTED = "('Validated','Archived')";

    private final JdbcTemplate jdbc;

    @Transactional(readOnly = true)
    public Map<String, Object> dashboard(Integer yearParam) {
        int year = yearParam == null ? currentDataYear() : yearParam;
        double population = baseline("population", year, 61_741_120);
        double gdpTzs = baseline("gdp_tzs", year, 196_000_000_000_000.0);

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("year", year);
        out.put("years", jdbc.queryForList("select distinct extract(year from started_on)::int as y"
                + " from disaster_events order by y desc", Integer.class));
        out.put("targets", targets(year, population, gdpTzs));
        out.put("yearlySeries", yearlySeries());
        out.put("hazardProfile", hazardProfile(year));
        out.put("regionRanking", regionRanking(year));
        out.put("insights", insights(year, population, gdpTzs));
        out.put("dataQuality", dataQuality());
        out.put("indicators", jdbc.queryForList("select code, target_letter as \"target\", title, unit,"
                + " computed_from as \"computedFrom\" from sendai_indicators order by target_letter, code"));
        return out;
    }

    // ------------------------------------------------------------------ target panels

    /**
     * One panel per Sendai global target. Targets A–D come straight from the repository;
     * E from the DRR strategy registry (disaster_risk_frameworks); F from partner/donation
     * activity; G from the early-warning operation — every figure traceable to a module.
     */
    private List<Map<String, Object>> targets(int year, double population, double gdpTzs) {
        Map<String, Object> y = jdbc.queryForMap(
                "select coalesce(sum(x.deaths_total),0) as deaths, coalesce(sum(x.missing_total),0) as missing,"
                        + " coalesce(sum(x.injured_total),0) as injured,"
                        + " coalesce(sum(x.directly_affected + x.displaced + x.relocated),0) as affected,"
                        + " coalesce(sum(x.houses_destroyed),0) as houses_destroyed,"
                        + " coalesce(sum(x.houses_damaged),0) as houses_damaged,"
                        + " coalesce(sum(x.total_loss_tzs),0) as loss_tzs,"
                        + " coalesce(sum(x.agriculture_loss_tzs),0) as agri_loss,"
                        + " coalesce(sum(x.housing_loss_tzs),0) as housing_loss,"
                        + " coalesce(sum(x.infrastructure_loss_tzs),0) as infra_loss,"
                        + " coalesce(sum(x.schools_damaged),0) as schools,"
                        + " coalesce(sum(x.health_facilities_damaged),0) as health,"
                        + " coalesce(sum(x.roads_km_damaged),0) as roads_km,"
                        + " coalesce(sum(x.bridges_damaged + x.water_systems_damaged + x.power_systems_damaged),0) as other_infra"
                        + " from disaster_event_effects x join disaster_events e on e.id = x.event_id"
                        + " where e.status in " + COUNTED + " and extract(year from e.started_on) = ?", year);

        long deaths = n(y, "deaths");
        long missing = n(y, "missing");
        long affected = n(y, "affected") + n(y, "injured");
        double lossTzs = dd(y, "loss_tzs");

        // Target E — DRR governance instruments on record (strategies, plans, policies)
        Long drrInstruments = jdbc.queryForObject("select count(*) from disaster_risk_frameworks"
                + " where document_type in ('Plans and Strategies','Policies','DRR Guidelines')", Long.class);
        // Target F — partner engagement proxy: registered partners + donations recorded
        Long partners = jdbc.queryForObject("select count(*) from stakeholders", Long.class);
        Long donations = jdbc.queryForObject("select count(*) from ndmf_donations", Long.class);
        // Target G — the early-warning operation
        Map<String, Object> g = jdbc.queryForMap(
                "select (select count(*) from early_warnings where extract(year from created_at) = ?) as warnings,"
                        + " (select coalesce(sum(people_at_risk),0) from early_warnings"
                        + "    where extract(year from created_at) = ?) as people_at_risk,"
                        + " (select count(*) from alert_subscriptions) as subscribers", year, year);

        List<Map<String, Object>> targets = new ArrayList<>();
        targets.add(target("A", "Reduce disaster mortality",
                deaths + missing, "deaths + missing",
                round2((deaths + missing) * 100_000.0 / population), "per 100,000 population (A-1)",
                List.of("A-1", "A-2", "A-3")));
        targets.add(target("B", "Reduce affected people",
                affected, "injured + directly affected + displaced",
                round2(affected * 100_000.0 / population), "per 100,000 population (B-1)",
                List.of("B-1", "B-2", "B-3", "B-4", "B-5")));
        targets.add(target("C", "Reduce direct economic loss",
                Math.round(lossTzs), "TZS, validated cards",
                round2(lossTzs * 100.0 / gdpTzs), "% of GDP (C-1)",
                List.of("C-1", "C-2", "C-3", "C-4", "C-5", "C-6")));
        targets.add(target("D", "Reduce infrastructure damage & service disruption",
                n(y, "schools") + n(y, "health") + n(y, "other_infra"), "facilities damaged",
                dd(y, "roads_km"), "km of roads damaged (D-1)",
                List.of("D-1", "D-2", "D-3", "D-4", "D-5", "D-6", "D-7", "D-8")));
        targets.add(target("E", "DRR strategies in place",
                drrInstruments == null ? 0 : drrInstruments, "strategies/policies/guidelines on record",
                null, null, List.of("E-1", "E-2")));
        targets.add(target("F", "International cooperation & partnership",
                (partners == null ? 0 : partners) + (donations == null ? 0 : donations),
                "registered partners + NDMF donations", null, null, List.of("F-1")));
        targets.add(target("G", "Early warning & risk information",
                n(g, "warnings"), "warnings issued this year",
                round2(n(g, "people_at_risk") * 100_000.0 / population), "people covered per 100,000 (G-3)",
                List.of("G-1", "G-2", "G-3", "G-4", "G-5", "G-6")));

        // detail figures the UI shows under the C and D panels
        targets.get(2).put("breakdown", Map.of(
                "agriculture", dd(y, "agri_loss"), "housing", dd(y, "housing_loss"),
                "infrastructure", dd(y, "infra_loss")));
        targets.get(3).put("breakdown", Map.of(
                "schools", n(y, "schools"), "healthFacilities", n(y, "health"),
                "housesDestroyed", n(y, "houses_destroyed"), "housesDamaged", n(y, "houses_damaged")));
        targets.get(6).put("breakdown", Map.of(
                "peopleAtRisk", n(g, "people_at_risk"), "subscribers", n(g, "subscribers")));
        return targets;
    }

    private Map<String, Object> target(String letter, String title, Number value, String valueLabel,
                                       Double normalized, String normalizedLabel, List<String> indicators) {
        Map<String, Object> t = new LinkedHashMap<>();
        t.put("letter", letter);
        t.put("title", title);
        t.put("value", value);
        t.put("valueLabel", valueLabel);
        t.put("normalized", normalized);
        t.put("normalizedLabel", normalizedLabel);
        t.put("indicators", indicators);
        return t;
    }

    // ------------------------------------------------------------------ series + profiles

    /** Year-by-year national series — the headline trend charts. */
    private List<Map<String, Object>> yearlySeries() {
        return jdbc.queryForList(
                "select extract(year from e.started_on)::int as year, count(distinct e.id) as events,"
                        + " coalesce(sum(x.deaths_total + x.missing_total),0) as deaths,"
                        + " coalesce(sum(x.directly_affected + x.displaced),0) as affected,"
                        + " coalesce(sum(x.total_loss_tzs),0) as \"lossTzs\""
                        + " from disaster_events e left join disaster_event_effects x on x.event_id = e.id"
                        + " where e.status in " + COUNTED
                        + " group by 1 order by 1");
    }

    /** Which hazards actually hurt Tanzania — frequency, mortality and loss share. */
    private List<Map<String, Object>> hazardProfile(int year) {
        return jdbc.queryForList(
                "select coalesce(e.hazard_type,'Unclassified') as hazard, count(distinct e.id) as events,"
                        + " coalesce(sum(x.deaths_total + x.missing_total),0) as deaths,"
                        + " coalesce(sum(x.directly_affected + x.displaced),0) as affected,"
                        + " coalesce(sum(x.total_loss_tzs),0) as \"lossTzs\""
                        + " from disaster_events e left join disaster_event_effects x on x.event_id = e.id"
                        + " where e.status in " + COUNTED
                        + " group by 1 order by deaths desc, \"lossTzs\" desc");
    }

    /** Regions ranked by recorded impact — where DRR investment is most needed. */
    private List<Map<String, Object>> regionRanking(int year) {
        return jdbc.queryForList(
                "select x.region, count(distinct e.id) as events,"
                        + " coalesce(sum(x.deaths_total + x.missing_total),0) as deaths,"
                        + " coalesce(sum(x.directly_affected + x.displaced),0) as affected,"
                        + " coalesce(sum(x.total_loss_tzs),0) as \"lossTzs\""
                        + " from disaster_event_effects x join disaster_events e on e.id = x.event_id"
                        + " where e.status in " + COUNTED
                        + " group by 1 order by deaths desc, \"lossTzs\" desc limit 10");
    }

    // ------------------------------------------------------------------ the insight layer

    /**
     * Auto-computed narrative findings — the "selling DMD interventions" layer. Each insight
     * is derived live from the repository + operational links, with its evidence stated, so
     * a director can quote it to ministers/donors without further analysis.
     */
    private List<Map<String, Object>> insights(int year, double population, double gdpTzs) {
        List<Map<String, Object>> insights = new ArrayList<>();

        // 1 — dominant hazard
        List<Map<String, Object>> hazards = hazardProfile(year);
        long totalDeaths = hazards.stream().mapToLong(h -> n(h, "deaths")).sum();
        if (!hazards.isEmpty() && totalDeaths > 0) {
            Map<String, Object> top = hazards.get(0);
            insights.add(insight("fa-triangle-exclamation", "#dc2626", "Dominant hazard",
                    String.format("%s accounts for %d of %d recorded deaths (%.0f%%) across %d events — "
                                    + "the strongest case for targeted mitigation investment.",
                            top.get("hazard"), n(top, "deaths"), totalDeaths,
                            n(top, "deaths") * 100.0 / totalDeaths, n(top, "events"))));
        }

        // 2 — early-warning coverage of recorded disasters (Target G evidence)
        Map<String, Object> ew = jdbc.queryForMap(
                "select count(distinct e.id) as events,"
                        + " count(distinct e.id) filter (where exists (select 1 from disaster_event_links l"
                        + "   where l.event_id = e.id and l.entity_type in ('early_warning','threat','alert'))) as warned"
                        + " from disaster_events e where e.status in " + COUNTED);
        if (n(ew, "events") > 0) {
            double pct = n(ew, "warned") * 100.0 / n(ew, "events");
            insights.add(insight("fa-broadcast-tower", "#2563eb", "Early-warning coverage",
                    String.format("%d of %d archived disasters (%.0f%%) are linked to an early warning, threat watch "
                                    + "or alert issued through this system — direct Target G evidence.",
                            n(ew, "warned"), n(ew, "events"), pct)));
        }

        // 3 — response investment vs recorded loss
        Map<String, Object> inv = jdbc.queryForMap(
                "select coalesce(sum(ar.quantity_allocated * coalesce(r.unit_cost,0)),0) as invested"
                        + " from allocated_resources ar join resources r on r.id = ar.resource_id"
                        + " where ar.incident_id in (select l.entity_id from disaster_event_links l"
                        + "   join disaster_events e on e.id = l.event_id"
                        + "   where l.entity_type = 'incident' and e.status in " + COUNTED + ")");
        Double recordedLoss = jdbc.queryForObject("select coalesce(sum(x.total_loss_tzs),0)"
                + " from disaster_event_effects x join disaster_events e on e.id = x.event_id"
                + " where e.status in " + COUNTED, Double.class);
        if (dd(inv, "invested") > 0) {
            insights.add(insight("fa-truck-fast", "#059669", "DMD response delivered",
                    String.format("TZS %,.0f of relief resources dispatched against the repository's disasters "
                                    + "(vs TZS %,.0f recorded direct losses) — every dispatch traceable from warehouse "
                                    + "to incident in this system.", dd(inv, "invested"),
                            recordedLoss == null ? 0 : recordedLoss)));
        }

        // 4 — geographic concentration
        List<Map<String, Object>> regions = regionRanking(year);
        double totalLoss = regions.stream().mapToDouble(r -> dd(r, "lossTzs")).sum();
        if (regions.size() >= 3 && totalLoss > 0) {
            double top3 = regions.subList(0, 3).stream().mapToDouble(r -> dd(r, "lossTzs")).sum();
            insights.add(insight("fa-map-location-dot", "#7c3aed", "Loss concentration",
                    String.format("%s, %s and %s carry %.0f%% of recorded economic losses — prioritising these "
                                    + "regions maximises DRR return on investment.",
                            regions.get(0).get("region"), regions.get(1).get("region"), regions.get(2).get("region"),
                            top3 * 100.0 / totalLoss)));
        }

        // 5 — citizen pipeline (public reports → incidents → repository)
        Map<String, Object> citizen = jdbc.queryForMap(
                "select (select count(*) from public_hazard_reports) as reports,"
                        + " (select count(*) from disaster_event_links where entity_type='public_hazard_report') as linked");
        if (n(citizen, "reports") > 0) {
            insights.add(insight("fa-bullhorn", "#ca8a04", "Citizen reporting pipeline",
                    String.format("%d citizen hazard reports received through the public portal; %d already tied "
                            + "into archived disasters — the public is a working sensor network.",
                            n(citizen, "reports"), n(citizen, "linked"))));
        }

        // 6 — normalized severity headline (A-1 style)
        Map<String, Object> yr = jdbc.queryForMap(
                "select coalesce(sum(x.deaths_total + x.missing_total),0) as dm"
                        + " from disaster_event_effects x join disaster_events e on e.id = x.event_id"
                        + " where e.status in " + COUNTED + " and extract(year from e.started_on) = ?", year);
        insights.add(insight("fa-chart-line", "#0d6efd", "Sendai A-1 headline",
                String.format("%d: %.2f disaster deaths/missing per 100,000 population (baseline %,.0f) — "
                                + "the exact figure Tanzania reports to the Sendai Framework Monitor.",
                        year, n(yr, "dm") * 100_000.0 / population, population)));

        return insights;
    }

    private Map<String, Object> insight(String icon, String color, String title, String body) {
        return Map.of("icon", icon, "color", color, "title", title, "body", body);
    }

    /** Validation pipeline health — how trustworthy the national numbers are right now. */
    private Map<String, Object> dataQuality() {
        return jdbc.queryForMap(
                "select count(*) as total,"
                        + " count(*) filter (where status in " + COUNTED + ") as counted,"
                        + " count(*) filter (where status = 'Open') as awaiting,"
                        + " (select count(*) from disaster_event_links) as links,"
                        + " (select count(*) from disaster_event_effects) as \"effectsRecords\""
                        + " from disaster_events");
    }

    // ------------------------------------------------------------------ helpers

    private int currentDataYear() {
        Integer y = jdbc.queryForObject("select max(extract(year from started_on))::int from disaster_events"
                + " where status in " + COUNTED, Integer.class);
        return y == null ? java.time.Year.now().getValue() : y;
    }

    /** Latest baseline at or before the requested year; a sensible national fallback otherwise. */
    private double baseline(String metric, int year, double fallback) {
        List<Double> rows = jdbc.queryForList(
                "select value from sendai_baselines where metric = ? and year <= ? order by year desc limit 1",
                Double.class, metric, year);
        return rows.isEmpty() ? fallback : rows.get(0);
    }

    private static long n(Map<String, Object> row, String key) {
        Object v = row.get(key);
        return v == null ? 0 : ((Number) v).longValue();
    }

    private static double dd(Map<String, Object> row, String key) {
        Object v = row.get(key);
        return v == null ? 0 : ((Number) v).doubleValue();
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
