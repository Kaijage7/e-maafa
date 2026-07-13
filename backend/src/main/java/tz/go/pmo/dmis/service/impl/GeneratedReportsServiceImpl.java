package tz.go.pmo.dmis.service.impl;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.common.security.JurisdictionScope;
import tz.go.pmo.dmis.service.GeneratedReportsService;

/**
 * Reports &amp; Analytics — registry of generated official documents. Logic moved from the former
 * reports package; area officers see only documents whose incident is in their jurisdiction.
 */
@Service
public class GeneratedReportsServiceImpl implements GeneratedReportsService {

    private final JdbcTemplate jdbc;
    private final JurisdictionScope jurisdiction;

    public GeneratedReportsServiceImpl(JdbcTemplate jdbc, JurisdictionScope jurisdiction) {
        this.jdbc = jdbc;
        this.jurisdiction = jurisdiction;
    }

    @Override
    public Map<String, Object> index(String type, Long incidentId) {
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
        if (incidentId != null) {
            sql.append(" and g.incident_id = ?");
            params.add(incidentId);
        }
        jurisdiction.appendAreaScopeWithCouncil("i", sql, params);
        sql.append(" order by g.generated_at desc limit 300");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("reports", jdbc.queryForList(sql.toString(), params.toArray()));
        out.put("types", List.of("DLNA_ANNEX1", "RECOVERY_PLAN_ANNEX2"));
        return out;
    }
}
