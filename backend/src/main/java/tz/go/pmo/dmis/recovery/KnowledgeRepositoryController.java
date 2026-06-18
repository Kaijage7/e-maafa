package tz.go.pmo.dmis.recovery;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.error.BusinessRuleException;
import tz.go.pmo.dmis.common.error.ResourceNotFoundException;
import org.springframework.security.access.prepost.PreAuthorize;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Lessons Learned / Knowledge Repository (Recovery) — port of the Laravel
 * disaster_knowledge_repositories module: the searchable library of case studies, best practices,
 * lessons learned and technical guides captured after disasters, with a Pending → Approved review.
 * Closes the recovery loop: what we learned feeds the next mitigation/preparedness cycle.
 */
@RestController
@RequestMapping("/v1/recovery/knowledge")
public class KnowledgeRepositoryController {

    private static final List<String> TYPES = List.of("Case Study", "Best Practice", "Lesson Learned",
            "Research Report", "Technical Guide", "Guideline", "Bulletin");

    private final JdbcTemplate jdbc;

    public KnowledgeRepositoryController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public Map<String, Object> index(@RequestParam(required = false) String type,
                                     @RequestParam(required = false) String approval,
                                     @RequestParam(required = false) String search) {
        StringBuilder where = new StringBuilder("1=1");
        List<Object> p = new ArrayList<>();
        if (type != null && !type.isBlank()) { where.append(" and coalesce(content_type, document_type) = ?"); p.add(type); }
        if (approval != null && !approval.isBlank()) { where.append(" and coalesce(approval_status,'Pending') = ?"); p.add(approval); }
        if (search != null && !search.isBlank()) {
            where.append(" and (coalesce(content_title, title) ilike ? or description ilike ? or hazard_type ilike ?)");
            p.add("%" + search + "%"); p.add("%" + search + "%"); p.add("%" + search + "%");
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("entries", jdbc.queryForList("""
                select id, coalesce(content_title, title) as title, description,
                       coalesce(content_type, document_type) as content_type, hazard_type,
                       coalesce(date_of_publication, disaster_date) as published_on, location, region,
                       coalesce(uploader_name, contributor) as contributor,
                       coalesce(uploader_institution, contributor_organization) as organization,
                       coalesce(approval_status,'Pending') as approval_status, downloads_count
                from public.disaster_knowledge_repositories
                where %s order by coalesce(date_of_publication, disaster_date) desc nulls last, id desc limit 200
                """.formatted(where), p.toArray()));
        out.put("stats", jdbc.queryForMap("""
                select count(*) as total,
                       count(*) filter (where coalesce(approval_status,'Pending')='Approved') as approved,
                       count(*) filter (where coalesce(approval_status,'Pending')='Pending') as pending,
                       count(*) filter (where coalesce(content_type,document_type)='Lesson Learned') as lessons
                from public.disaster_knowledge_repositories
                """));
        out.put("by_type", jdbc.queryForList("""
                select coalesce(content_type, document_type, 'Other') as content_type, count(*) as count
                from public.disaster_knowledge_repositories
                group by coalesce(content_type, document_type, 'Other') order by count desc
                """));
        out.put("types", TYPES);
        return out;
    }

    @PreAuthorize(Authz.RECOVERY_KNOWLEDGE_SUBMIT)
    @PostMapping
    @Transactional
    public Map<String, Object> store(@RequestBody Map<String, Object> b) {
        String title = require(b.get("title"), "title");
        String type = TYPES.contains(str(b.get("content_type"))) ? str(b.get("content_type")) : "Lesson Learned";
        Long id = jdbc.queryForObject("""
                insert into public.disaster_knowledge_repositories(title, content_title, description,
                    content_type, document_type, hazard_type, disaster_date, date_of_publication, location,
                    region, contributor, uploader_name, contributor_organization, uploader_institution,
                    visibility_level, status, approval_status, downloads_count, version, created_at, updated_at)
                values (?,?,?,?,?,?, coalesce(?::date, current_date), coalesce(?::date, current_date), ?, ?, ?, ?, ?, ?,
                        'public', 'pending', 'Pending', 0, 1, now(), now()) returning id
                """, Long.class, title, title, str(b.get("description")), type, type,
                strOr(b.get("hazard_type"), "General"), str(b.get("published_on")), str(b.get("published_on")),
                strOr(b.get("location"), "National"), strOr(b.get("region"), "National"),
                strOr(b.get("contributor"), "PMO-DMD"), strOr(b.get("contributor"), "PMO-DMD"),
                str(b.get("organization")), str(b.get("organization")));
        return Map.of("success", true, "id", id, "message", "Knowledge entry submitted for review.");
    }

    @PreAuthorize(Authz.RECOVERY_APPROVE)
    @PostMapping("/{id}/approve")
    @Transactional
    public Map<String, Object> approve(@PathVariable long id) {
        if (jdbc.update("update public.disaster_knowledge_repositories set approval_status='Approved', status='approved', approval_date=now(), updated_at=now() where id=?", id) == 0) {
            throw new ResourceNotFoundException("Entry not found.");
        }
        return Map.of("success", true, "message", "Entry approved and published.");
    }

    private static String str(Object v) {
        if (v == null) { return null; }
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
    private static String strOr(Object v, String d) { String s = str(v); return s == null ? d : s; }
    private static String require(Object v, String f) {
        String s = str(v);
        if (s == null) { throw new BusinessRuleException("The " + f + " field is required."); }
        return s;
    }
}
