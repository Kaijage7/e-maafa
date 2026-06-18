package tz.go.pmo.dmis.portal;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.Authz;

/**
 * Content Management → Educational Content — admin CRUD over educational_contents,
 * reproducing Admin/EducationalContentController. Published items feed the PUBLIC
 * education portal (/education) via PortalPublicService.
 */
@RestController
@RequestMapping("/v1/content/education")
@RequiredArgsConstructor
@Tag(name = "Content Management", description = "Educational content (admin)")
public class EducationalContentAdminController {

    private final JdbcTemplate jdbc;

    public record EduWriteRequest(String title, String contentType, String summary, String fullContent,
                                  String author, String publicationDate, String targetAudience,
                                  String keywords, Boolean isPublished) {
    }

    @GetMapping
    @Operation(summary = "All educational content + stats")
    @PreAuthorize("isAuthenticated()")
    public Map<String, Object> index() {
        List<Map<String, Object>> items = jdbc.queryForList(
                "select id, title, content_type as \"contentType\", summary, author,"
                        + " target_audience as \"targetAudience\", is_published as \"isPublished\","
                        + " to_char(publication_date, 'DD Mon YYYY') as \"publicationDate\""
                        + " from public.educational_contents order by publication_date desc nulls last, id desc");
        long published = items.stream().filter(i -> Boolean.TRUE.equals(i.get("isPublished"))).count();
        return Map.of("items", items,
                "stats", Map.of("total", items.size(), "published", published, "drafts", items.size() - published));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create educational content")
    @PreAuthorize(Authz.CONTENT_MANAGE)
    @Transactional
    public Map<String, Object> create(@RequestBody EduWriteRequest req) {
        requireTitle(req);
        Long id = jdbc.queryForObject(
                "insert into public.educational_contents(title,content_type,summary,full_content,author,"
                        + "publication_date,target_audience,keywords,is_published,created_at,updated_at)"
                        + " values (?,?,?,?,?,?::date,?,?,?,now(),now()) returning id", Long.class,
                req.title().trim(), nz(req.contentType(), "Article"), req.summary(), req.fullContent(),
                req.author(), blank(req.publicationDate()), req.targetAudience(), req.keywords(),
                req.isPublished() != null && req.isPublished());
        return Map.of("id", id, "message", "Created");
    }

    @PutMapping("/{id}")
    @Operation(summary = "Update educational content")
    @PreAuthorize(Authz.CONTENT_MANAGE)
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody EduWriteRequest req) {
        requireTitle(req);
        int n = jdbc.update("update public.educational_contents set title=?, content_type=?, summary=?,"
                        + " full_content=coalesce(?, full_content), author=?, publication_date=?::date,"
                        + " target_audience=?, keywords=?, is_published=?, updated_at=now() where id=?",
                req.title().trim(), nz(req.contentType(), "Article"), req.summary(), req.fullContent(),
                req.author(), blank(req.publicationDate()), req.targetAudience(), req.keywords(),
                req.isPublished() != null && req.isPublished(), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Content not found");
        }
        return Map.of("id", id, "message", "Updated");
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete educational content")
    @PreAuthorize(Authz.CONTENT_MANAGE)
    @Transactional
    public Map<String, Object> delete(@PathVariable long id) {
        jdbc.update("delete from public.educational_contents where id=?", id);
        return Map.of("id", id, "message", "Deleted");
    }

    private static void requireTitle(EduWriteRequest req) {
        if (req.title() == null || req.title().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title is required");
        }
    }

    private static String nz(String v, String dflt) {
        return (v == null || v.isBlank()) ? dflt : v;
    }

    private static String blank(String v) {
        return (v == null || v.isBlank()) ? null : v;
    }
}
