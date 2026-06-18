package tz.go.pmo.dmis.onehealth;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.format.DateTimeFormatter;
import java.time.format.TextStyle;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Port of OneHealthDashboardController + OneHealthService::getDashboardStats():
 * 12-month event/directive trends, status breakdown, 7-day KPI sparkline data,
 * month-over-month counts, overdue directives, top-10 region stats and the
 * 10 most recent events. The source's unused $ewAlerts collection is not
 * reproduced (issues/onehealth.issues.md OH-9).
 */
@RestController
@RequestMapping("/v1/onehealth/dashboard")
public class OneHealthDashboardController {

    private final JdbcTemplate jdbc;

    public OneHealthDashboardController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public Map<String, Object> index() {
        Map<String, Object> stats = new LinkedHashMap<>();
        LocalDate today = LocalDate.now();

        // ── Monthly trend, last 12 months (events + directives) ──
        List<String> monthLabels = new ArrayList<>();
        Map<String, Long> monthlyEvents = new LinkedHashMap<>();
        Map<String, Long> monthlyDirectives = new LinkedHashMap<>();
        for (int i = 11; i >= 0; i--) {
            YearMonth ym = YearMonth.from(today.minusMonths(i));
            monthLabels.add(ym.getMonth().getDisplayName(TextStyle.SHORT, Locale.ENGLISH));
            monthlyEvents.put(ym.toString(), 0L);
            monthlyDirectives.put(ym.toString(), 0L);
        }
        jdbc.query("""
                select to_char(created_at, 'YYYY-MM') as month_key, count(*) as total
                from public.oh_events
                where created_at >= date_trunc('month', now() - interval '12 months') and deleted_at is null
                group by month_key
                """, rs -> {
            String key = rs.getString(1);
            long count = rs.getLong(2);
            monthlyEvents.computeIfPresent(key, (k, v) -> count);
        });
        jdbc.query("""
                select to_char(created_at, 'YYYY-MM') as month_key, count(*) as total
                from public.oh_directives
                where created_at >= date_trunc('month', now() - interval '12 months') and deleted_at is null
                group by month_key
                """, rs -> {
            String key = rs.getString(1);
            long count = rs.getLong(2);
            monthlyDirectives.computeIfPresent(key, (k, v) -> count);
        });

        // ── Events by status ──
        Map<String, Long> byStatus = new LinkedHashMap<>();
        for (String label : List.of("Submitted", "Under Review", "Directive Issued", "Disseminated", "Monitoring", "Closed")) {
            byStatus.put(label, 0L);
        }
        jdbc.query("select status, count(*) from public.oh_events where deleted_at is null group by status", rs -> {
            String label = OneHealthEventService.statusLabel(rs.getString(1));
            if (byStatus.containsKey(label)) {
                byStatus.put(label, rs.getLong(2));
            }
        });
        long activeEvents = byStatus.get("Submitted") + byStatus.get("Under Review");

        // ── Daily counts last 7 days (KPI sparkline) ──
        Map<String, Long> daily = new LinkedHashMap<>();
        for (int i = 6; i >= 0; i--) {
            daily.put(today.minusDays(i).format(DateTimeFormatter.ISO_LOCAL_DATE), 0L);
        }
        jdbc.query("""
                select to_char(created_at, 'YYYY-MM-DD') as day, count(*) from public.oh_events
                where created_at >= date_trunc('day', now() - interval '6 days') and deleted_at is null
                group by day
                """, rs -> {
            String key = rs.getString(1);
            long count = rs.getLong(2);
            daily.computeIfPresent(key, (k, v) -> count);
        });

        Map<String, Object> windows = jdbc.queryForMap("""
                select count(*) filter (where created_at >= now() - interval '7 days') as events_7d,
                    count(*) filter (where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') as events_prev_7d,
                    count(*) filter (where created_at >= date_trunc('month', now())) as new_this_month,
                    count(*) filter (where created_at >= date_trunc('month', now() - interval '1 month')
                        and created_at < date_trunc('month', now())) as new_last_month,
                    count(*) as total
                from public.oh_events where deleted_at is null
                """);

        Long overdueDirectives = jdbc.queryForObject("""
                select count(*) from public.oh_directives
                where status != 'completed' and deadline is not null and deadline < now() and deleted_at is null
                """, Long.class);

        // ── Top 10 regions ──
        List<Map<String, Object>> regionStats = new ArrayList<>();
        jdbc.query("""
                select e.region_id, r.name as region_name, count(*) as total_events,
                    sum(case when e.status in ('submitted','under_review') then 1 else 0 end) as active_count,
                    sum(case when e.status = 'closed' then 1 else 0 end) as closed_count
                from public.oh_events e
                join public.regions r on r.id = e.region_id
                where e.deleted_at is null and e.region_id is not null
                group by e.region_id, r.name
                order by count(*) desc
                limit 10
                """, rs -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("region_id", rs.getLong("region_id"));
            m.put("name", rs.getString("region_name"));
            m.put("total_events", rs.getInt("total_events"));
            m.put("active_count", rs.getInt("active_count"));
            m.put("closed_count", rs.getInt("closed_count"));
            regionStats.add(m);
        });

        // ── Events by area / concern item / region (chart payloads) ──
        Map<String, Long> byArea = new LinkedHashMap<>();
        jdbc.query("""
                select a.name, count(e.id) from public.oh_areas_of_concern a
                left join public.oh_events e on e.area_of_concern_id = a.id and e.deleted_at is null
                group by a.id, a.name order by a.id
                """, rs -> { byArea.put(rs.getString(1), rs.getLong(2)); });
        Map<String, Long> byConcernItem = new LinkedHashMap<>();
        jdbc.query("""
                select ci.name, count(e.id) from public.oh_concern_items ci
                join public.oh_events e on e.concern_item_id = ci.id and e.deleted_at is null
                group by ci.id, ci.name
                """, rs -> { byConcernItem.put(rs.getString(1), rs.getLong(2)); });
        Map<String, Long> byRegion = new LinkedHashMap<>();
        jdbc.query("""
                select r.name, count(*) from public.oh_events e
                join public.regions r on r.id = e.region_id
                where e.deleted_at is null group by r.name
                """, rs -> { byRegion.put(rs.getString(1), rs.getLong(2)); });

        // ── Recent events (10) ──
        List<Map<String, Object>> recent = new ArrayList<>();
        jdbc.query("""
                select e.id, e.event_id, e.event_title, e.event_description, e.status, e.priority_level,
                    e.created_at, a.category as area_category, s.organization as stakeholder_organization,
                    r.name as region_name
                from public.oh_events e
                left join public.oh_areas_of_concern a on a.id = e.area_of_concern_id
                left join public.stakeholders s on s.id = e.stakeholder_id
                left join public.regions r on r.id = e.region_id
                where e.deleted_at is null
                order by e.created_at desc
                limit 10
                """, rs -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", rs.getLong("id"));
            m.put("event_id", rs.getString("event_id"));
            m.put("event_title", rs.getString("event_title"));
            m.put("event_description", rs.getString("event_description"));
            String st = rs.getString("status");
            m.put("status", st);
            m.put("status_label", OneHealthEventService.statusLabel(st));
            m.put("priority_level", rs.getString("priority_level"));
            m.put("area_category", rs.getString("area_category"));
            m.put("stakeholder_organization", rs.getString("stakeholder_organization"));
            m.put("region_name", rs.getString("region_name"));
            m.put("created_at_relative", diffForHumans(rs.getTimestamp("created_at")));
            recent.add(m);
        });

        Long ewAlertsActive = jdbc.queryForObject("""
                select count(*) from public.oh_events
                where event_type = 'ew_alert' and status not in ('closed','archived') and deleted_at is null
                """, Long.class);

        stats.put("total_events", windows.get("total"));
        stats.put("active_events", activeEvents);
        stats.put("submitted", byStatus.get("Submitted"));
        stats.put("under_review", byStatus.get("Under Review"));
        stats.put("directive_issued", byStatus.get("Directive Issued"));
        stats.put("disseminated", byStatus.get("Disseminated"));
        stats.put("monitoring", byStatus.get("Monitoring"));
        stats.put("closed", byStatus.get("Closed"));
        stats.put("overdue_directives", overdueDirectives);
        stats.put("events_7d", windows.get("events_7d"));
        stats.put("events_prev_7d", windows.get("events_prev_7d"));
        stats.put("new_events_this_month", windows.get("new_this_month"));
        stats.put("new_events_last_month", windows.get("new_last_month"));
        stats.put("daily_events_7d", new ArrayList<>(daily.values()));
        stats.put("region_stats", regionStats);
        stats.put("events_by_area", byArea);
        stats.put("events_by_concern_item", byConcernItem);
        stats.put("events_by_region", byRegion);
        stats.put("events_by_status", byStatus);
        stats.put("month_labels", monthLabels);
        stats.put("monthly_events", new ArrayList<>(monthlyEvents.values()));
        stats.put("monthly_directives", new ArrayList<>(monthlyDirectives.values()));
        stats.put("recent_events", recent);
        stats.put("ew_alerts_active", ewAlertsActive);
        stats.put("trend_start", YearMonth.from(today.minusMonths(11)).atDay(1)
                .format(DateTimeFormatter.ofPattern("MMM uuuu", Locale.ENGLISH)));
        stats.put("trend_end", today.format(DateTimeFormatter.ofPattern("MMM uuuu", Locale.ENGLISH)));
        stats.put("current_month_name", today.format(DateTimeFormatter.ofPattern("MMMM uuuu", Locale.ENGLISH)));
        return stats;
    }

    /** Carbon::diffForHumans() for the dashboard's Time column. */
    static String diffForHumans(java.sql.Timestamp ts) {
        if (ts == null) {
            return "";
        }
        java.time.LocalDateTime then = ts.toLocalDateTime();
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        long seconds = ChronoUnit.SECONDS.between(then, now);
        if (seconds < 60) {
            return seconds <= 1 ? "1 second ago" : seconds + " seconds ago";
        }
        long minutes = ChronoUnit.MINUTES.between(then, now);
        if (minutes < 60) {
            return minutes == 1 ? "1 minute ago" : minutes + " minutes ago";
        }
        long hours = ChronoUnit.HOURS.between(then, now);
        if (hours < 24) {
            return hours == 1 ? "1 hour ago" : hours + " hours ago";
        }
        long days = ChronoUnit.DAYS.between(then, now);
        if (days < 30) {
            return days == 1 ? "1 day ago" : days + " days ago";
        }
        long months = ChronoUnit.MONTHS.between(then, now);
        if (months < 12) {
            return months <= 1 ? "1 month ago" : months + " months ago";
        }
        long years = ChronoUnit.YEARS.between(then, now);
        return years <= 1 ? "1 year ago" : years + " years ago";
    }
}
