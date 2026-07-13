package tz.go.pmo.dmis.service.impl;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.service.EwManagementReportService;

/**
 * Early Warning Management analytics — links issued warnings to incidents and preparedness.
 * Logic in service.impl (eGA). Read-only. Path {@code GET /v1/reports/early-warnings} unchanged.
 */
@Service
public class EwManagementReportServiceImpl implements EwManagementReportService {



    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;

    public EwManagementReportServiceImpl(JdbcTemplate jdbc, JurisdictionScope jurisdiction) {
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

    @Override
    public Map<String, Object> analysis(String from, String to) {
        // EW effectiveness analytics is a staff/leadership report — a donor/partner account must not read it.
        if (jurisdiction.currentStakeholderId() != null) {
            throw new ResourceNotFoundException("Not found.");
        }
        String fromD = (from != null && from.matches("\\d{4}-\\d{2}-\\d{2}")) ? from : "2000-01-01";
        String toD = (to != null && to.matches("\\d{4}-\\d{2}-\\d{2}")) ? to : "2100-01-01";
        // An area officer sees the EW picture for their OWN region; national sees the whole country.
        Long myRegion = areaRegion();

        // ── issued warnings (source of truth: warning_hazards × warnings), ONE row per warning × region:
        //    the per-district rows are aggregated (min start / max end / district list) BEFORE
        //    classification so a 7-district warning no longer counts 7 times. ──
        List<Object> wParams = new ArrayList<>(List.of(toD, fromD));
        String wRegion = "";
        if (myRegion != null) { wRegion = " and wh.region_id = ? "; wParams.add(myRegion); }
        List<Map<String, Object>> warnings = jdbc.queryForList(
            "select min(wh.id) as id, wh.warning_id, w.warning_code, min(wh.hazard_id) as hazard_id, " +
            "       string_agg(distinct h.name, ' / ') as hazard, " +
            "       (array_agg(wh.warning_level order by case lower(coalesce(wh.warning_level,'')) " +
            "            when 'major warning' then 1 when 'warning' then 2 when 'advisory' then 3 else 4 end))[1] as warning_level, " +
            "       wh.region_id, r.name as area, " +
            "       case when count(distinct wh.district_id) = 1 then min(wh.district_id) end as district_id, " +
            "       count(distinct wh.district_id) as district_count, " +
            "       string_agg(distinct wh.district_id::text, ',') filter (where wh.district_id is not null) as district_ids, " +
            "       string_agg(distinct lower(d.name), '|') filter (where wh.district_id is not null and d.name is not null) as district_keys, " +
            "       case when count(distinct wh.district_id) > 0 then 'district' else 'region' end as area_scope, " +
            "       string_agg(distinct d.name, ', ') filter (where d.name is not null) as districts, " +
            "       string_agg(distinct coalesce(wh.hazard_id::text,'') || '~' || coalesce(h.name,''), '|') as hazard_pairs, " +
            "       min(wh.validity_start) as validity_start, max(wh.validity_end) as validity_end " +
            "from public.warning_hazards wh " +
            "join public.warnings w on w.id = wh.warning_id and w.deleted_at is null " +
            "     and lower(w.status) in ('approved','published') " +
            "left join public.hazards h on h.id = wh.hazard_id " +
            "left join public.regions r on r.id = wh.region_id " +
            "left join public.districts d on d.id = wh.district_id " +
            "where wh.deleted_at is null and wh.validity_start::date <= ?::date and wh.validity_end::date >= ?::date " +
            wRegion +
            "group by wh.warning_id, w.warning_code, wh.region_id, r.name " +
            "order by min(wh.validity_start) desc", wParams.toArray());

        // headline tallies are per DISTINCT warning (a warning spanning several regions counts once)
        Set<Object> allW = new HashSet<>(), hitW = new HashSet<>(), diffW = new HashSet<>(), prepW = new HashSet<>();
        long totalLeadHours = 0; int leadN = 0;
        for (Map<String, Object> w : warnings) {
            allW.add(w.get("warning_id"));
            List<Object[]> warnedHaz = parseHazardPairs((String) w.remove("hazard_pairs"));
            List<Long> districtIds = parseLongCsv(w.remove("district_ids"));
            List<String> districtKeys = parsePipeList(w.remove("district_keys"));
            // incidents in the warned area during the window (+1 day tail)
            List<Map<String, Object>> inc = incidentsInWarnedArea(w, districtIds, districtKeys);
            // split area+time matches by hazard compatibility — only compatible ones are true positives
            List<Map<String, Object>> matched = new ArrayList<>();
            List<Map<String, Object>> otherHazard = new ArrayList<>();
            for (Map<String, Object> i : inc) {
                Object hid = i.get("hazard_id");
                Long incHazardId = hid instanceof Number n ? n.longValue() : null;
                if (hazardCompatible(warnedHaz, incHazardId, (String) i.get("hazard"))) matched.add(i);
                else otherHazard.add(i);
            }
            w.put("incidents", matched);
            w.put("incident_count", matched.size());
            w.put("different_hazard_incidents", otherHazard); // same area+window, NOT the warned hazard
            if (!matched.isEmpty()) {
                w.put("ew_class", "warned_incident");
                hitW.add(w.get("warning_id"));
                // lead time = first compatible incident reported_at − validity_start (hours), if positive
                Long lead = jdbc.queryForObject(
                    "select round(extract(epoch from (?::timestamptz - ?::timestamptz)) / 3600)::bigint",
                    Long.class, matched.get(0).get("reported_at"), w.get("validity_start"));
                if (lead != null) { w.put("lead_time_hours", lead); totalLeadHours += Math.max(lead, 0); leadN++; }
            } else if (!otherHazard.isEmpty()) {
                w.put("ew_class", "same_area_different_hazard");
                diffW.add(w.get("warning_id"));
            } else {
                w.put("ew_class", "warning_no_incident");
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
                "       t.training_start_date as starts, t.training_end_date as ends, " +
                "       coalesce(t.venue, t.geographical_scope::text) as area " +
                "from public.training_plans t " +
                "where t.training_start_date is not null and t.training_end_date is not null " +
                "  and t.training_start_date <= ?::date and t.training_end_date >= ?::date " +
                // F67: same area-match idea as anticipatory plans (venue or geographical_scope tokens).
                // National / unscoped trainings (blank venue+scope) are excluded so a Mtwara warning
                // does not claim a Dar es Salaam workshop as preparedness for that area.
                "  and ( lower(coalesce(t.venue,'')) like lower('%'||coalesce(?,'~')||'%') " +
                "        or lower(coalesce(t.geographical_scope::text,'')) like lower('%'||coalesce(?,'~')||'%') " +
                "        or lower(coalesce(t.organization_name,'')) like lower('%'||coalesce(?,'~')||'%') )",
                w.get("validity_end"), w.get("validity_start"), w.get("area"), w.get("area"),
                w.get("validity_end"), w.get("validity_start"),
                w.get("area"), w.get("area"), w.get("area"));
            w.put("preparedness", prep);
            if (!prep.isEmpty()) prepW.add(w.get("warning_id"));
        }
        diffW.removeAll(hitW); // a warning that scored a real hit anywhere is a hit, not a coincidence
        int warnedIncident = hitW.size();
        int sameAreaDifferentHazard = diffW.size();
        int warningNoIncident = allW.size() - warnedIncident - sameAreaDifferentHazard;
        int prepDuring = prepW.size();

        // ── unwarned incidents: in the window but NOT covered by any approved/published warning's area ──
        List<Object> uParams = new ArrayList<>(List.of(fromD + " 00:00:00", toD + " 23:59:59"));
        String uRegion = "";
        if (myRegion != null) { uRegion = " and i.region_id = ? "; uParams.add(myRegion); }
        List<Map<String, Object>> unwarned = jdbc.queryForList(
            "select i.id, i.title, i.hazard_id, h.name as hazard, i.severity_level, i.status, i.reported_at, " +
            "       coalesce(i.region_name, ri.name) as region_name, coalesce(i.district_name, di.name) as district_name " +
            "from public.incidents i " +
            "left join public.regions ri on ri.id = i.region_id " +
            "left join public.districts di on di.id = i.district_id " +
            "left join public.hazards h on h.id = i.hazard_id " +
            "where i.reported_at >= ?::timestamptz and i.reported_at < (?::timestamptz + interval '1 day') " +
                "  and coalesce(i.is_simulation, false) = false " +
            "  and not exists ( " +
            "     select 1 from public.warning_hazards wh " +
            "     join public.warnings w on w.id = wh.warning_id and w.deleted_at is null " +
            "          and lower(w.status) in ('approved','published') " +
            "     left join public.regions r on r.id = wh.region_id " +
            "     left join public.districts wd on wd.id = wh.district_id " +
            "     where wh.deleted_at is null " +
            "       and i.reported_at >= wh.validity_start and i.reported_at < (wh.validity_end + interval '1 day') " +
            "       and ( (wh.district_id is not null and (i.district_id = wh.district_id " +
            "              or (i.district_id is null " +
            "                  and lower(coalesce(i.district_name, di.name, '')) = lower(coalesce(wd.name,'~')) " +
            "                  and ((i.region_id is not null and i.region_id = wh.region_id) " +
            "                       or lower(coalesce(i.region_name, ri.name, '')) = lower(coalesce(r.name,'~')))))) " +
            "             or (wh.district_id is null and ((i.region_id is not null and i.region_id = wh.region_id) " +
            "                 or lower(coalesce(i.region_name, ri.name, '')) = lower(coalesce(r.name,'~')))) ) ) " +
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
            // F69 honesty: low % is usually missing disaster_event_links, not proof EW failed.
            drr.put("coverage_basis", "manual_disaster_event_links");
            drr.put("note", "ew_coverage_pct is the share of validated/archived repository cards "
                    + "manually linked to an early_warning. A low figure usually means links are "
                    + "still pending curation (use repository card → link suggestions ranked by "
                    + "area/hazard), not that early warning failed.");
        } catch (Exception e) {
            drr.put("disasters_total", 0); drr.put("disasters_ew_linked", 0); drr.put("ew_coverage_pct", 0.0);
            drr.put("coverage_basis", "manual_disaster_event_links");
            drr.put("note", "DRR coverage unavailable for this query window.");
        }

        // ── headline summary (per DISTINCT warning — not per district/area row) ──
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("warnings_issued", allW.size());
        summary.put("warned_incident", warnedIncident);          // (a) true positive (hazard-compatible)
        summary.put("warning_no_incident", warningNoIncident);   // (c) no incident / false alarm
        summary.put("unwarned_incident", unwarned.size());       // (b) the gap
        summary.put("preparedness_during_warning", prepDuring);  // (d)
        summary.put("avg_lead_time_hours", leadN > 0 ? Math.round((double) totalLeadHours / leadN) : null);
        summary.put("native_bus_submissions",
            jdbc.queryForObject("select count(*) from public.ew_agency_submissions where is_latest", Long.class));
        // additive keys (existing consumers unaffected):
        summary.put("same_area_different_hazard", sameAreaDifferentHazard); // spatial coincidence, not a hit
        summary.put("warned_area_windows", warnings.size());                // warning × region rows shown below

        return Map.of("summary", summary, "warnings", warnings, "unwarned_incidents", unwarned, "drr", drr);
    }

    private List<Map<String, Object>> incidentsInWarnedArea(
            Map<String, Object> warningRow, List<Long> districtIds, List<String> districtKeys) {
        boolean districtScoped = !districtIds.isEmpty() || !districtKeys.isEmpty();
        List<Object> params = new ArrayList<>();
        StringBuilder sql = new StringBuilder("""
            select i.id, i.title, i.hazard_id, hi.name as hazard, i.severity_level, i.status, i.reported_at,
                   coalesce(i.region_name, ri.name) as region_name, coalesce(i.district_name, di.name) as district_name
            from public.incidents i
            left join public.regions ri on ri.id = i.region_id
            left join public.districts di on di.id = i.district_id
            left join public.hazards hi on hi.id = i.hazard_id
            where i.reported_at >= ?::timestamptz and i.reported_at < (?::timestamptz + interval '1 day')
              and coalesce(i.is_simulation, false) = false
            """);
        params.add(warningRow.get("validity_start"));
        params.add(warningRow.get("validity_end"));
        if (districtScoped) {
            List<String> districtBranches = new ArrayList<>();
            if (!districtIds.isEmpty()) {
                districtBranches.add("i.district_id in (" + placeholders(districtIds.size()) + ")");
                params.addAll(districtIds);
            }
            if (!districtKeys.isEmpty()) {
                districtBranches.add("(i.district_id is null and lower(coalesce(i.district_name, di.name, '')) in ("
                        + placeholders(districtKeys.size()) + ") "
                        + "and ((i.region_id is not null and i.region_id = ?) "
                        + "or (? is not null and lower(coalesce(i.region_name, ri.name, '')) = lower(?))))");
                params.addAll(districtKeys);
                params.add(warningRow.get("region_id"));
                params.add(warningRow.get("area"));
                params.add(warningRow.get("area"));
            }
            sql.append("  and (").append(String.join(" or ", districtBranches)).append(")\n");
        } else {
            sql.append("""
                  and ( (i.region_id is not null and i.region_id = ?)
                        or (? is not null and lower(coalesce(i.region_name, ri.name, '')) = lower(?)) )
                """);
            params.add(warningRow.get("region_id"));
            params.add(warningRow.get("area"));
            params.add(warningRow.get("area"));
        }
        sql.append("order by i.reported_at");
        List<Map<String, Object>> rows = jdbc.queryForList(sql.toString(), params.toArray());
        for (Map<String, Object> row : rows) {
            row.put("in_warned_district", districtScoped);
        }
        return rows;
    }

    /** Parses the SQL-aggregated "id~name|id~name" warned-hazard pairs of one warning × region row. */
    private static List<Object[]> parseHazardPairs(String pairsCsv) {
        List<Object[]> out = new ArrayList<>();
        if (pairsCsv == null || pairsCsv.isBlank()) return out;
        for (String p : pairsCsv.split("\\|")) {
            int t = p.indexOf('~');
            String idS = t >= 0 ? p.substring(0, t) : p;
            String nm = t >= 0 ? p.substring(t + 1) : "";
            out.add(new Object[]{ idS.isBlank() ? null : Long.valueOf(idS), nm.isBlank() ? null : nm });
        }
        return out;
    }

    private static List<Long> parseLongCsv(Object csv) {
        List<Long> out = new ArrayList<>();
        if (csv == null || csv.toString().isBlank()) return out;
        for (String raw : csv.toString().split(",")) {
            String value = raw.trim();
            if (value.isEmpty()) continue;
            out.add(Long.valueOf(value));
        }
        return out;
    }

    private static List<String> parsePipeList(Object pipeList) {
        List<String> out = new ArrayList<>();
        if (pipeList == null || pipeList.toString().isBlank()) return out;
        for (String raw : pipeList.toString().split("\\|")) {
            String value = raw.trim();
            if (!value.isEmpty()) out.add(value);
        }
        return out;
    }

    private static String placeholders(int count) {
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < count; i++) {
            if (i > 0) out.append(", ");
            out.append("?");
        }
        return out.toString();
    }

    /**
     * True when the incident's hazard is the warned hazard (exact hazard_id) or a member of the same
     * related family ({@link #hazardFamily}). A side that carries NO hazard information cannot be
     * refuted, so it stays a match (citizen reports often lack hazard_id) — only a positive hazard
     * CONFLICT demotes the incident to the same-area-different-hazard bucket.
     */
    private static boolean hazardCompatible(List<Object[]> warnedHaz, Long incHazardId, String incHazardName) {
        if (incHazardId == null && (incHazardName == null || incHazardName.isBlank())) return true;
        boolean warnedCarriesHazard = false;
        for (Object[] p : warnedHaz) {
            Long wid = (Long) p[0];
            String wname = (String) p[1];
            if (wid == null && (wname == null || wname.isBlank())) continue; // hazard-less warned row
            warnedCarriesHazard = true;
            if (wid != null && wid.equals(incHazardId)) return true;
            String fam = hazardFamily(wname);
            if (fam != null && fam.equals(hazardFamily(incHazardName))) return true;
        }
        return !warnedCarriesHazard;
    }

    /**
     * Related-hazard FAMILY map — the ONE place the warned-hazard ⇄ incident-hazard relatedness rule
     * lives (keep any future tuning here). Rationale: a heavy-rainfall/storm/cyclone warning
     * legitimately "covers" the flood or rain-triggered landslide it causes; a drought warning covers
     * the crop/livestock/food-security impact; a disease warning covers the outbreak. Different
     * families (e.g. rainfall warning vs fire incident) are a spatial coincidence, not a forecast hit.
     * Returns null when the hazard belongs to no family — then only exact hazard_id equality matches.
     */
    private static String hazardFamily(String hazardName) {
        if (hazardName == null) return null;
        String n = hazardName.toLowerCase();
        if (n.contains("flood") || n.contains("rain") || n.contains("storm") || n.contains("wind")
            || n.contains("cyclone") || n.contains("lightning") || n.contains("landslide") || n.contains("mudslide"))
            return "flood-storm";
        if (n.contains("drought") || n.contains("crop") || n.contains("livestock") || n.contains("famine")
            || n.contains("food") || n.contains("pest") || n.contains("heat"))
            return "drought-agri";
        if (n.contains("epidemic") || n.contains("disease") || n.contains("outbreak")
            || n.contains("cholera") || n.contains("pandemic"))
            return "disease";
        if (n.contains("fire")) return "fire";
        if (n.contains("earthquake") || n.contains("tsunami") || n.contains("volcan")) return "geophysical";
        return null;
    }
}
