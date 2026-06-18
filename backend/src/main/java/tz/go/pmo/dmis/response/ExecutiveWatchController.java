package tz.go.pmo.dmis.response;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Executive Watch — the national situation picture for the highest level (PM / PS / Director /
 * President): a standing common-operating-picture for national leadership. Modelled on the DHS
 * National Operations Center common-operating-picture doctrine
 * with FEMA Community Lifelines, and the two operating states it describes:
 *
 *   • NORMAL/MONITORING — no active disaster: the national watch picture (hazard feeds, open
 *     incidents, every activation's posture, today's alert dispatch). "We see how monitoring and
 *     national situation."
 *   • ACTIVATED — ≥1 disaster: the incident common operating picture plus the Lifelines status
 *     board and a DECISIONS-PENDING queue (declarations awaiting the executive's signature).
 *
 * Read-only aggregation across the whole Response module; multi-hazard (cyclone, flood, epidemic,
 * earthquake, tsunami) since it reads the same activation machinery regardless of trigger.
 */
@RestController
@RequestMapping("/v1/response/executive")
public class ExecutiveWatchController {

    /** The 7 FEMA Community Lifelines (the executive-consumable green/yellow/red rollup). */
    private static final List<String> LIFELINES = List.of(
            "Safety & Security", "Food, Water & Shelter", "Health & Medical",
            "Energy", "Communications", "Transportation", "Hazardous Materials");

    private final JdbcTemplate jdbc;

    public ExecutiveWatchController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public Map<String, Object> watch() {
        Map<String, Object> out = new LinkedHashMap<>();

        long activeDisaster = count("""
                select count(*) from public.response_activations
                where status = 'active' and posture = 'disaster' and is_simulation = false
                """);
        long activeDeclarations = count("""
                select count(*) from public.disaster_declarations
                where status = 'declared' and is_simulation = false
                  and (effective_until is null or effective_until >= current_date)
                """);
        boolean activated = activeDisaster > 0 || activeDeclarations > 0;
        out.put("mode", activated ? "activated" : "monitoring");
        // Separate exercise indicator — drills are visible in the Command Post, never in the
        // real national picture the executive acts on (simulation-isolation contract, D1).
        out.put("simulations_running", count(
                "select count(*) from public.response_activations where status='active' and is_simulation = true"));

        // National headline counts — REAL data only (is_simulation excluded throughout)
        out.put("national", jdbc.queryForMap("""
                select
                  (select count(*) from public.incidents where status in ('Active Response','Verified','Reported') and coalesce(is_simulation,false)=false) as active_incidents,
                  (select count(*) from public.incidents where severity_level = 'Critical' and status <> 'Closed' and coalesce(is_simulation,false)=false) as critical_incidents,
                  (select count(*) from public.response_activations where status = 'active' and is_simulation=false) as active_activations,
                  (select count(*) from public.response_activations where status='active' and trigger_type='forecast' and is_simulation=false) as anticipatory_activations,
                  (select count(*) from public.allocated_resources where status = 'Deployed') as resources_deployed,
                  (select coalesce(sum(quantity),0) from public.inventory_items where status='Good Condition') as stock_units,
                  (select count(*) from public.damage_assessments where status = 'Pending Verification') as assessments_pending,
                  (select coalesce(sum(affected_people),0) from public.anticipatory_action_plans where status='active') as people_under_aap
                """));

        // Active (real) activations with posture
        out.put("activations", jdbc.queryForList("""
                select ra.id, ra.posture, ra.trigger_type, ra.is_simulation, ra.hazard_description,
                       ra.expected_impact_at, coalesce(i.title, ra.hazard_description) as title,
                       (select count(*) from public.incident_tasks t where t.activation_id=ra.id) as total_tasks,
                       (select count(*) from public.incident_tasks t where t.activation_id=ra.id and t.status='Completed') as completed_tasks
                from public.response_activations ra
                left join public.incidents i on i.id = ra.incident_id
                where ra.status = 'active' and ra.is_simulation = false order by
                    case ra.posture when 'disaster' then 0 when 'emergency' then 1 when 'safeguard' then 2 else 3 end,
                    ra.activated_at desc
                """));

        // Active declarations + the decision queue (what awaits the executive) — real only
        out.put("active_declarations", jdbc.queryForList("""
                select id, declaration_type, authority, area_scope, hazard, effective_until, gazette_reference
                from public.disaster_declarations
                where status = 'declared' and is_simulation = false
                  and (effective_until is null or effective_until >= current_date)
                order by declared_at desc
                """));
        out.put("decisions_pending", jdbc.queryForList("""
                select id, declaration_type, authority, area_scope, status,
                       case when status = 'steering_endorsed' then 'Awaiting ' || authority || ' to declare'
                            when status = 'technical_review' then 'Awaiting National Steering Committee endorsement'
                            when status = 'proposed' then 'Awaiting National Technical Committee review'
                       end as awaiting
                from public.disaster_declarations
                where status in ('proposed','technical_review','steering_endorsed') and is_simulation = false
                order by created_at
                """));

        // Today's alert dispatch (from the R9 stream)
        out.put("alerts_today", jdbc.queryForMap("""
                select count(*) filter (where channels::jsonb ? 'sms') as sms,
                       count(*) filter (where channels::jsonb ? 'email') as email,
                       count(*) filter (where channels::jsonb ? 'app') as app,
                       count(*) as total
                from public.alerts where created_at::date = current_date
                """));

        out.put("lifelines", lifelines());
        out.put("timestamp", OffsetDateTime.now().toString());
        return out;
    }

    /**
     * FEMA Community Lifelines rollup, derived from real signals (open incidents, severity,
     * disaster-posture activations, infrastructure damage). Each lifeline = green/yellow/red + basis.
     */
    private List<Map<String, Object>> lifelines() {
        // Lifelines reflect the REAL national picture only — simulations never colour them.
        long activeCritical = count("select count(*) from public.incidents where severity_level='Critical' and status='Active Response' and coalesce(is_simulation,false)=false");
        long activeResponse = count("select count(*) from public.incidents where status='Active Response' and coalesce(is_simulation,false)=false");
        long disasterPosture = count("select count(*) from public.response_activations where status='active' and posture='disaster' and is_simulation=false");
        long infraDamage = count("""
                select count(*) from public.damage_assessments da
                where da.status <> 'Draft' and exists (
                    select 1 from public.assessment_categories ac
                    where ac.assessment_id = da.id and ac.category = 'Infrastructure')
                """);

        List<Map<String, Object>> out = new ArrayList<>();
        out.add(lifeline("Safety & Security",
                activeCritical > 0 ? "red" : activeResponse > 0 ? "yellow" : "green",
                activeCritical > 0 ? activeCritical + " critical incident(s) in active response"
                        : activeResponse > 0 ? activeResponse + " incident(s) in active response" : "No active security concerns",
                "Tanzania Police Force · DRF 5"));
        out.add(lifeline("Food, Water & Shelter",
                disasterPosture > 0 ? "yellow" : "green",
                disasterPosture > 0 ? disasterPosture + " disaster activation(s) — shelters/relief mobilised" : "Stable",
                "DRF 4/8/11 · NFRA · Red Cross"));
        out.add(lifeline("Health & Medical",
                activeCritical > 0 ? "yellow" : "green",
                activeCritical > 0 ? "Casualty risk in active critical incident(s)" : "Routine",
                "Ministry of Health · DRF 6"));
        out.add(lifeline("Energy", "green", "No reported disruption", "TANESCO · DRF 14"));
        out.add(lifeline("Communications",
                disasterPosture > 0 ? "yellow" : "green",
                disasterPosture > 0 ? "Emergency comms active" : "Networks nominal",
                "TCRA · DRF 9"));
        out.add(lifeline("Transportation",
                infraDamage > 0 ? "yellow" : "green",
                infraDamage > 0 ? "Infrastructure damage reported in assessments" : "Routes open",
                "TANROADS/TARURA · DRF 3"));
        out.add(lifeline("Hazardous Materials", "green", "No HazMat incidents", "Fire & Rescue · GCLA"));
        return out;
    }

    private static Map<String, Object> lifeline(String name, String status, String basis, String lead) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("name", name);
        m.put("status", status);
        m.put("basis", basis);
        m.put("lead", lead);
        return m;
    }

    private long count(String sql) {
        Long c = jdbc.queryForObject(sql, Long.class);
        return c == null ? 0 : c;
    }
}
