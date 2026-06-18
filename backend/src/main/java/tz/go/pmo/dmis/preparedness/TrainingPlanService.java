package tz.go.pmo.dmis.preparedness;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.notification.NotificationService;

/** Reads + creates training_plans for the index screen (json scope/audience). */
@Service
@RequiredArgsConstructor
public class TrainingPlanService {

    private static final DateTimeFormatter D_MON_Y = DateTimeFormatter.ofPattern("dd MMM yyyy");

    private final TrainingPlanRepository repo;
    private final ObjectMapper objectMapper;
    private final JdbcTemplate jdbc;
    private final NotificationService notifications; // the ONE backbone — used for support requests

    /** Creates a new training plan (auto training_id TRN-YYYY-NNNNN, json scope/audience). */
    @Transactional
    public Map<String, Object> create(TrainingPlanWriteRequest req) {
        if (req.title() == null || req.title().isBlank() || req.institution() == null || req.institution().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title and implementing institution are required");
        }
        // gap-safe code (MAX suffix +1), not count(*)+1 — count leaves a permanent gap after any
        // delete so every later create collided on the now-UNIQUE training_id.
        Long seq = jdbc.queryForObject(
                "select coalesce(max(nullif(regexp_replace(substring(training_id from 10), '[^0-9]', '', 'g'), '')::int), 0) + 1"
                        + " from public.training_plans where training_id like 'TRN-2026-%'", Long.class);
        String id = String.format("TRN-2026-%05d", seq == null ? 1 : seq);
        String status = req.status() == null || req.status().isBlank() ? "planned" : req.status();
        jdbc.update("insert into public.training_plans(training_id,training_title,implementing_institution,"
                + "objective,geographical_scope,targeted_audience,venue,training_start_date,training_end_date,"
                + "source_of_fund,status,created_at,updated_at) "
                + "values (?,?,?,?,?::jsonb,?::jsonb,?,?::date,?::date,?,?,now(),now())",
                id, req.title().trim(), req.institution().trim(), blank(req.objective()),
                jsonArray(req.scope()), jsonArray(req.audience()), blank(req.venue()),
                blank(req.startDate()), blank(req.endDate()), blank(req.sourceOfFund()), status);
        return Map.of("trainingId", id, "message", "Training plan created");
    }

    /** One training plan's fields for the edit form. */
    @Transactional(readOnly = true)
    public Map<String, Object> detail(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList(
                "select id, training_id, training_title, implementing_institution, objective, "
                        + "geographical_scope::text as scope, targeted_audience::text as audience, venue, "
                        + "training_start_date, training_end_date, source_of_fund, status "
                        + "from public.training_plans where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Training plan not found");
        }
        Map<String, Object> r = rows.get(0);
        Map<String, Object> m = new java.util.LinkedHashMap<>();
        m.put("id", r.get("id"));
        m.put("trainingId", r.get("training_id"));
        m.put("title", r.get("training_title"));
        m.put("institution", r.get("implementing_institution"));
        m.put("objective", r.get("objective"));
        m.put("scope", parse(asText(r.get("scope"))));
        m.put("audience", parse(asText(r.get("audience"))));
        m.put("venue", r.get("venue"));
        m.put("startDate", r.get("training_start_date") == null ? null : r.get("training_start_date").toString());
        m.put("endDate", r.get("training_end_date") == null ? null : r.get("training_end_date").toString());
        m.put("sourceOfFund", r.get("source_of_fund"));
        m.put("status", r.get("status"));
        return m;
    }

    /** Updates an existing training plan (the TRN- code is immutable). */
    @Transactional
    public Map<String, Object> update(long id, TrainingPlanWriteRequest req) {
        if (req.title() == null || req.title().isBlank() || req.institution() == null || req.institution().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title and implementing institution are required");
        }
        String status = req.status() == null || req.status().isBlank() ? "planned" : req.status();
        int n = jdbc.update("update public.training_plans set training_title=?, implementing_institution=?, "
                + "objective=?, geographical_scope=?::jsonb, targeted_audience=?::jsonb, venue=?, "
                + "training_start_date=?::date, training_end_date=?::date, source_of_fund=?, status=?, updated_at=now() "
                + "where id=?",
                req.title().trim(), req.institution().trim(), blank(req.objective()),
                jsonArray(req.scope()), jsonArray(req.audience()), blank(req.venue()),
                blank(req.startDate()), blank(req.endDate()), blank(req.sourceOfFund()), status, id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Training plan not found");
        }
        return Map.of("id", id, "message", "Training plan updated");
    }

    private static String asText(Object o) {
        return o == null ? null : o.toString();
    }

    private Map<String, Object> requireRow(long id) {
        List<Map<String, Object>> rows = jdbc.queryForList("select * from public.training_plans where id = ?", id);
        if (rows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Training plan not found");
        }
        return rows.get(0);
    }

    /** Publish an (upcoming) training as a public News/Event item (portal_news, category 'event'). */
    @Transactional
    public Map<String, Object> publish(long id) {
        Map<String, Object> t = requireRow(id);
        if (t.get("news_id") != null) {
            return Map.of("newsId", t.get("news_id"), "message", "Already published to News & Events.");
        }
        String title = asText(t.get("training_title"));
        String inst = asText(t.get("implementing_institution"));
        String slug = slugify(title) + "-trn-" + id;
        String excerpt = "Capacity-building training" + (inst == null ? "" : " by " + inst) + ".";
        StringBuilder body = new StringBuilder();
        if (t.get("objective") != null) { body.append(asText(t.get("objective"))).append("\n\n"); }
        if (t.get("venue") != null) { body.append("Venue: ").append(asText(t.get("venue"))).append("\n"); }
        if (t.get("training_start_date") != null) {
            body.append("Dates: ").append(asText(t.get("training_start_date")))
                .append(t.get("training_end_date") != null ? " to " + asText(t.get("training_end_date")) : "");
        }
        Long newsId = jdbc.queryForObject(
                "insert into public.portal_news(title, slug, excerpt, body, category, published_at, is_active, created_at, updated_at) "
                        + "values (?,?,?,?, 'event', now(), true, now(), now()) returning id",
                Long.class, title, slug, excerpt, body.toString().trim());
        jdbc.update("update public.training_plans set news_id = ?, published_at = now(), updated_at = now() where id = ?", newsId, id);
        return Map.of("newsId", newsId, "slug", slug, "message", "Training published to News & Events.");
    }

    /** Push a training to DRR priorities — creates a mitigation_measures record carrying the priority. */
    @Transactional
    public Map<String, Object> pushPriority(long id, String priority) {
        String p = priority == null ? "" : priority.trim();
        if (!List.of("Low", "Medium", "High").contains(p)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Priority must be Low, Medium or High");
        }
        Map<String, Object> t = requireRow(id);
        String title = asText(t.get("training_title"));
        String inst = asText(t.get("implementing_institution"));
        String fund = asText(t.get("source_of_fund"));
        boolean gov = fund != null && fund.toLowerCase().contains("government") && !fund.toLowerCase().contains("non");
        Long measureId = jdbc.queryForObject(
                "insert into public.mitigation_measures(title, project_programme_name, implementing_entity, implementing_institution, "
                        + "type_of_mitigation, project_status, priority, description, approval_status, visibility_level, created_at, updated_at) "
                        + "values (?,?,?,?, 'Non-structure', 'Design', ?, ?, 'approved', 'public', now(), now()) returning id",
                Long.class, title, title, gov ? "Government" : "Non-Government", inst, p, asText(t.get("objective")));
        jdbc.update("update public.training_plans set mitigation_measure_id = ?, drr_priority = ?, updated_at = now() where id = ?",
                measureId, p, id);
        return Map.of("measureId", measureId, "priority", p,
                "message", "Pushed to DRR priorities as a " + p + "-priority mitigation measure.");
    }

    /** Request stakeholder funding support for an unfunded training (notifies partners via the backbone). */
    @Transactional
    public Map<String, Object> requestSupport(long id) {
        Map<String, Object> t = requireRow(id);
        String title = asText(t.get("training_title"));
        jdbc.update("update public.training_plans set support_requested_at = now(), updated_at = now() where id = ?", id);
        try {
            notifications.notifyRoles(List.of("Partners"),
                    NotificationService.Notice.inApp("training_support_request", "Training needs funding support",
                            "Training \"" + title + "\" has no funding source — stakeholder support has been requested.",
                            "/m/preparedness/trainings", "training_plan", id, "warning"));
        } catch (Exception ignored) {
            // notification is best-effort; the support request is recorded regardless
        }
        return Map.of("message", "Support requested — stakeholders/partners notified.");
    }

    private static String slugify(String s) {
        if (s == null) { return "training"; }
        String slug = s.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
        return slug.isBlank() ? "training" : slug;
    }

    private String jsonArray(List<String> list) {
        try {
            return objectMapper.writeValueAsString(list == null ? List.of() : list);
        } catch (Exception e) {
            return "[]";
        }
    }

    private static String blank(String v) {
        return (v == null || v.isBlank()) ? null : v.trim();
    }

    @Transactional(readOnly = true)
    public TrainingPlanResponse index() {
        List<TrainingPlan> all = repo.findAllByOrderByTrainingStartDateDesc();
        List<TrainingPlanResponse.Row> rows = all.stream().map(t -> new TrainingPlanResponse.Row(
                t.getId(), t.getTrainingId(), t.getTrainingTitle(), t.getImplementingInstitution(),
                parse(t.getGeographicalScope()), parse(t.getTargetedAudience()), t.getVenue(),
                period(t), capitalize(t.getStatus()),
                t.getPublishedAt() != null, t.getDrrPriority(),
                t.getSupportRequestedAt() != null, t.getSourceOfFund())).toList();

        long total = all.size();
        long planned = countStatus(all, "planned");
        long ongoing = countStatus(all, "ongoing");
        long completed = countStatus(all, "completed");
        return new TrainingPlanResponse(rows, new TrainingPlanResponse.Stats(total, planned, ongoing, completed));
    }

    private List<String> parse(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<List<String>>() { });
        } catch (Exception e) {
            return List.of(json);
        }
    }

    private static String period(TrainingPlan t) {
        if (t.getTrainingStartDate() == null) {
            return "-";
        }
        String start = D_MON_Y.format(t.getTrainingStartDate());
        return t.getTrainingEndDate() == null ? start : start + " – " + D_MON_Y.format(t.getTrainingEndDate());
    }

    private static long countStatus(List<TrainingPlan> all, String status) {
        return all.stream().filter(t -> status.equalsIgnoreCase(t.getStatus())).count();
    }

    private static String capitalize(String s) {
        return (s == null || s.isEmpty()) ? s : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
