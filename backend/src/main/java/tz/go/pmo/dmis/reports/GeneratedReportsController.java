package tz.go.pmo.dmis.reports;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.JurisdictionScope;

/**
 * Reports & Analytics — the registry of GENERATED official documents (NDRF Annex 1 DLNA
 * filings, Annex 2 recovery plans, and future document types). Read-only here: documents
 * are generated and filed by their owning modules; this module lists and serves them.
 * Area officers see only documents whose incident falls in their jurisdiction.
 */
@RestController
@RequestMapping("/v1/reports/generated")
public class GeneratedReportsController {

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;

    public GeneratedReportsController(JdbcTemplate jdbc, JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
    }

    @GetMapping
    @PreAuthorize("hasAuthority('damage_assessment.view')")
    public Map<String, Object> index(@RequestParam(required = false) String type,
                                     @RequestParam(required = false) Long incident_id) {
        StringBuilder sql = new StringBuilder("""
                select g.id, g.report_type, g.title, g.ref_no, g.incident_id, g.file_path, g.file_bytes,
                       g.generated_at, i.title as incident_title, u.name as generated_by_name
                from public.generated_reports g
                left join public.incidents i on i.id = g.incident_id
                left join public.users u on u.id = g.generated_by
                where 1=1
                """);
        List<Object> params = new ArrayList<>();
        if (type != null && !type.isBlank()) {
            sql.append(" and g.report_type = ?");
            params.add(type);
        }
        if (incident_id != null) {
            sql.append(" and g.incident_id = ?");
            params.add(incident_id);
        }
        jurisdiction.appendAreaScopeSharedOrOwn("i", sql, params);
        sql.append(" order by g.generated_at desc limit 300");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reports", jdbc.queryForList(sql.toString(), params.toArray()));
        out.put("types", List.of("DLNA_ANNEX1", "RECOVERY_PLAN_ANNEX2"));
        return out;
    }
}
