package tz.go.pmo.dmis.reports;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Early Warning Management analytics — links Early Warning THROUGHOUT: each issued warning
 * (warning_hazards, the per-area validity-window source of truth) is correlated with the incidents that
 * occurred in its warned area during its window, and with the preparedness activities active then. This
 * yields the four early-warning-effectiveness classes the user asked to capture:
 *   • warned → incident (true positive, with the days/times)
 *   • warning → no incident (forecast that did not materialise / false alarm)
 *   • unwarned incident (a hazard struck with no covering warning — the gap)
 *   • preparedness during warning (an anticipatory plan / training active in the warned window)
 * It also exposes the DRR-in-the-EW-context metric: % of archived disasters linked to an early warning.
 *
 * <p>Match key: warned AREA (region_id, or region name) + TIME (incident.reported_at within the warning's
 * validity window, with a short tail) — hazard is shown for context and used to refine when both sides
 * carry hazard_id. Read-only; nothing is mutated.
 */
@RestController
@RequestMapping("/v1/reports/early-warnings")
public class EwManagementController {

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;

    public EwManagementController(JdbcTemplate jdbc, JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
    }

    /** The acting area officer's region (REGION/DISTRICT tier), or null for national/non-area (sees all). */
    private Long areaRegion() {
        JurisdictionScope.Tier t = jurisdiction.currentTier();
        if (t == JurisdictionScope.Tier.REGION || t == JurisdictionScope.Tier.DISTRICT) {
            Object r = jurisdiction.currentArea().get("region_id");
            return r instanceof Number n ? n.longValue() : null;
        }
        return null;
    }

    @GetMapping
    public Map<String, Object> analysis(@RequestParam(required = false) String from,
                                        @RequestParam(required = false) String to) {
        // EW effectiveness analytics is a staff/leadership report — a donor/partner account must not read it.
        if (jurisdiction.currentStakeholderId() != null) {
            throw new ResourceNotFoundException("Not found.");
        }
        String fromD = (from != null && from.matches("\\d{4}-\\d{2}-\\d{2}")) ? from : "2000-01-01";
        String toD = (to != null && to.matches("\\d{4}-\\d{2}-\\d{2}")) ? to : "2100-01-01";
        // An area officer sees the EW picture for their OWN region; national sees the whole country.
        Long myRegion = areaRegion();

        // ── issued warnings (source of truth: warning_hazards × warnings), with the warned area name ──
        List<Object> wParams = new ArrayList<>(List.of(toD, fromD));
        String wRegion = "";
        if (myRegion != null) { wRegion = " and wh.region_id = ? "; wParams.add(myRegion); }
        List<Map<String, Object>> warnings = jdbc.queryForList(
            "select wh.id, w.warning_code, wh.hazard_id, h.name as hazard, wh.warning_level, " +
            "       wh.region_id, r.name as area, wh.district_id, " +
            "       wh.validity_start, wh.validity_end " +
            "from public.warning_hazards wh " +
            "join public.warnings w on w.id = wh.warning_id and w.deleted_at is null " +
            "     and lower(w.status) in ('approved','published') " +
            "left join public.hazards h on h.id = wh.hazard_id " +
            "left join public.regions r on r.id = wh.region_id " +
            "where wh.deleted_at is null and wh.validity_start::date <= ?::date and wh.validity_end::date >= ?::date " +
            wRegion +
            "order by wh.validity_start desc", wParams.toArray());

        int warnedIncident = 0, warningNoIncident = 0, prepDuring = 0;
        long totalLeadHours = 0; int leadN = 0;
        for (Map<String, Object> w : warnings) {
            // incidents in the warned area during the window (+1 day tail)
            List<Map<String, Object>> inc = jdbc.queryForList(
                "select i.id, i.title, i.hazard_id, i.severity_level, i.status, i.reported_at, " +
                "       coalesce(i.region_name, ri.name) as region_name " +
                "from public.incidents i " +
                "left join public.regions ri on ri.id = i.region_id " +
                "where i.reported_at >= ?::timestamptz and i.reported_at < (?::timestamptz + interval '1 day') " +
                "  and ( (i.region_id is not null and i.region_id = ?) " +
                "        or (? is not null and lower(coalesce(i.region_name, ri.name, '')) = lower(?)) ) " +
                "order by i.reported_at",
                w.get("validity_start"), w.get("validity_end"),
                w.get("region_id"), w.get("area"), w.get("area"));
            w.put("incidents", inc);
            w.put("incident_count", inc.size());
            if (inc.isEmpty()) {
                w.put("ew_class", "warning_no_incident");
                warningNoIncident++;
            } else {
                w.put("ew_class", "warned_incident");
                warnedIncident++;
                // lead time = first incident reported_at − validity_start (hours), if positive
                Long lead = jdbc.queryForObject(
                    "select round(extract(epoch from (?::timestamptz - ?::timestamptz)) / 3600)::bigint",
                    Long.class, inc.get(0).get("reported_at"), w.get("validity_start"));
                if (lead != null) { w.put("lead_time_hours", lead); totalLeadHours += Math.max(lead, 0); leadN++; }
            }
            // preparedness active during the warned window in the warned area (anticipatory plans + trainings)
            List<Map<String, Object>> prep = jdbc.queryForList(
                "select 'anticipatory_plan' as kind, coalesce(p.description, p.hazard_type) as name, p.hazard_type, p.status, " +
                "       p.activation_start as starts, p.activation_end as ends, p.district_council as area " +
                "from public.anticipatory_action_plans p " +
                "where p.activation_start is not null and p.activation_end is not null " +
                "  and p.activation_start <= ?::date and p.activation_end >= ?::date " +
                "  and ( lower(coalesce(p.district_council,'')) like lower('%'||coalesce(?,'~')||'%') " +
                "        or lower(coalesce(p.coverage_location,'')) like lower('%'||coalesce(?,'~')||'%') ) " +
                "union all " +
                "select 'training' as kind, t.training_title as name, null, t.status, " +
                "       t.training_start_date as starts, t.training_end_date as ends, t.venue as area " +
                "from public.training_plans t " +
                "where t.training_start_date is not null and t.training_end_date is not null " +
                "  and t.training_start_date <= ?::date and t.training_end_date >= ?::date",
                w.get("validity_end"), w.get("validity_start"), w.get("area"), w.get("area"),
                w.get("validity_end"), w.get("validity_start"));
            w.put("preparedness", prep);
            if (!prep.isEmpty()) prepDuring++;
        }

        // ── unwarned incidents: in the window but NOT covered by any approved/published warning's area ──
        List<Object> uParams = new ArrayList<>(List.of(fromD + " 00:00:00", toD + " 23:59:59"));
        String uRegion = "";
        if (myRegion != null) { uRegion = " and i.region_id = ? "; uParams.add(myRegion); }
        List<Map<String, Object>> unwarned = jdbc.queryForList(
            "select i.id, i.title, i.hazard_id, h.name as hazard, i.severity_level, i.status, i.reported_at, " +
            "       coalesce(i.region_name, ri.name) as region_name " +
            "from public.incidents i " +
            "left join public.regions ri on ri.id = i.region_id " +
            "left join public.hazards h on h.id = i.hazard_id " +
            "where i.reported_at >= ?::timestamptz and i.reported_at < (?::timestamptz + interval '1 day') " +
            "  and not exists ( " +
            "     select 1 from public.warning_hazards wh " +
            "     join public.warnings w on w.id = wh.warning_id and w.deleted_at is null " +
            "          and lower(w.status) in ('approved','published') " +
            "     left join public.regions r on r.id = wh.region_id " +
            "     where wh.deleted_at is null " +
            "       and i.reported_at >= wh.validity_start and i.reported_at < (wh.validity_end + interval '1 day') " +
            "       and ( (i.region_id is not null and i.region_id = wh.region_id) " +
            "             or lower(coalesce(i.region_name, ri.name, '')) = lower(coalesce(r.name,'~')) ) ) " +
            uRegion +
            "order by i.reported_at desc",
            uParams.toArray());

        // ── DRR (EW context): % of validated/archived disaster events linked to an early warning ──
        Map<String, Object> drr = new LinkedHashMap<>();
        try {
            Long totalEvents = jdbc.queryForObject(
                "select count(*) from public.disaster_events where lower(status) in ('validated','archived')", Long.class);
            Long ewLinked = jdbc.queryForObject(
                "select count(distinct l.event_id) from public.disaster_event_links l " +
                "join public.disaster_events e on e.id = l.event_id and lower(e.status) in ('validated','archived') " +
                "where l.entity_type = 'early_warning'", Long.class);
            drr.put("disasters_total", totalEvents == null ? 0 : totalEvents);
            drr.put("disasters_ew_linked", ewLinked == null ? 0 : ewLinked);
            drr.put("ew_coverage_pct", (totalEvents != null && totalEvents > 0)
                ? Math.round((ewLinked == null ? 0 : ewLinked) * 1000.0 / totalEvents) / 10.0 : 0.0);
        } catch (Exception e) {
            drr.put("disasters_total", 0); drr.put("disasters_ew_linked", 0); drr.put("ew_coverage_pct", 0.0);
        }

        // ── headline summary ──
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("warnings_issued", warnings.size());
        summary.put("warned_incident", warnedIncident);          // (a) true positive
        summary.put("warning_no_incident", warningNoIncident);   // (c) no incident / false alarm
        summary.put("unwarned_incident", unwarned.size());       // (b) the gap
        summary.put("preparedness_during_warning", prepDuring);  // (d)
        summary.put("avg_lead_time_hours", leadN > 0 ? Math.round((double) totalLeadHours / leadN) : null);
        summary.put("native_bus_submissions",
            jdbc.queryForObject("select count(*) from public.ew_agency_submissions where is_latest", Long.class));

        return Map.of("summary", summary, "warnings", warnings, "unwarned_incidents", unwarned, "drr", drr);
    }
}
