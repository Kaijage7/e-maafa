package tz.go.pmo.dmis.common.geo;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * space02 DBA-1.2 — resolve free-text district/region names via {@code geo_name_aliases}
 * to canonical district ids and INFORM area codes. Non-breaking: empty table → identity normalize only.
 */
@Service
public class GeoAliasService {

    private final JdbcTemplate jdbc;

    public GeoAliasService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public static String normalize(String name) {
        if (name == null) {
            return "";
        }
        String s = name.toLowerCase(Locale.ROOT).trim();
        s = s.replaceAll("\\s+(district|municipal|municipality|town|urban|council|city|dc|tc|mc)$", "");
        s = s.replaceAll("[^a-z0-9]+", " ").trim();
        return s;
    }

    /**
     * Expand a set of display names with normalized keys + known aliases so INFORM/EW matching
     * succeeds across GADM vs TMA naming variants.
     */
    public Set<String> expandMatchKeys(Iterable<String> names) {
        Set<String> wanted = new LinkedHashSet<>();
        for (String n : names) {
            if (n == null || n.isBlank()) {
                continue;
            }
            String nk = normalize(n);
            if (!nk.isEmpty()) {
                wanted.add(nk);
            }
        }
        if (wanted.isEmpty()) {
            return wanted;
        }
        try {
            List<String> norms = new ArrayList<>(wanted);
            String placeholders = String.join(",", norms.stream().map(x -> "?").toList());
            Object[] args = new Object[norms.size() * 2];
            for (int i = 0; i < norms.size(); i++) {
                args[i] = norms.get(i);
                args[i + norms.size()] = norms.get(i);
            }
            String sql = "select a.normalized_name, a.alias_name from public.geo_name_aliases a "
                    + "where a.normalized_name in (" + placeholders + ") "
                    + "or a.district_id in ("
                    + "  select b.district_id from public.geo_name_aliases b "
                    + "  where b.district_id is not null and b.normalized_name in (" + placeholders + ")"
                    + ")";
            List<Map<String, Object>> rows = jdbc.queryForList(sql, args);
            for (Map<String, Object> r : rows) {
                wanted.add(normalize(String.valueOf(r.get("normalized_name"))));
                wanted.add(normalize(String.valueOf(r.get("alias_name"))));
            }
        } catch (DataAccessException ignored) {
            // table optional
        }
        wanted.remove("");
        return wanted;
    }

    /**
     * For each input display name, optional INFORM area code from alias map (when populated).
     */
    public Map<String, String> informCodesForNames(Iterable<String> names) {
        Map<String, String> out = new LinkedHashMap<>();
        for (String n : names) {
            if (n == null || n.isBlank()) {
                continue;
            }
            Map<String, Object> r = resolve(n);
            Object code = r.get("informAreaCode");
            if (code != null && !String.valueOf(code).isBlank()) {
                out.put(n, String.valueOf(code));
            }
        }
        return out;
    }

    /** Resolve one free-text name to district_id / inform_area_code when known. */
    public Map<String, Object> resolve(String name) {
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("input", name);
        String nk = normalize(name);
        out.put("normalized", nk);
        if (nk.isEmpty()) {
            return out;
        }
        try {
            List<Map<String, Object>> rows = jdbc.queryForList("""
                    select a.district_id as "districtId", a.region_id as "regionId",
                           a.inform_area_code as "informAreaCode", a.alias_name as "aliasName",
                           d.name as "districtName", r.name as "regionName"
                    from public.geo_name_aliases a
                    left join public.districts d on d.id = a.district_id
                    left join public.regions r on r.id = a.region_id
                    where a.normalized_name = ?
                    order by case when a.inform_area_code is not null then 0 else 1 end,
                             a.district_id nulls last, a.id
                    limit 3
                    """, nk);
            if (!rows.isEmpty()) {
                out.put("matches", rows);
                out.putAll(rows.get(0));
                out.put("resolved", true);
            } else {
                out.put("resolved", false);
            }
        } catch (DataAccessException e) {
            out.put("resolved", false);
            out.put("error", e.getMessage());
        }
        return out;
    }
}
