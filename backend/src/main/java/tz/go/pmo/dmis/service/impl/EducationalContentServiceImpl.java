package tz.go.pmo.dmis.service.impl;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.service.EducationalContentService;

/**
 * Content Management → Educational Content — admin CRUD over educational_contents,
 * reproducing Admin/EducationalContentController. Published items feed the PUBLIC
 * education portal (/education) via PortalPublicService.
 */
@Service
@lombok.RequiredArgsConstructor
public class EducationalContentServiceImpl implements EducationalContentService {


    private final JdbcTemplate jdbc;
    @Override
    public Map<String, Object> index() {
        List<Map<String, Object>> items = jdbc.queryForList(
                "select id, title, content_type as \"contentType\", summary, full_content as \"fullContent\", author,"
                        + " target_audience as \"targetAudience\", is_published as \"isPublished\","
                        + " title_sw as \"titleSw\", summary_sw as \"summarySw\", full_content_sw as \"fullContentSw\","
                        + " to_char(publication_date, 'YYYY-MM-DD') as \"publicationDateIso\","
                        + " to_char(publication_date, 'DD Mon YYYY') as \"publicationDate\""
                        + " from public.educational_contents order by publication_date desc nulls last, id desc");
        long published = items.stream().filter(i -> Boolean.TRUE.equals(i.get("isPublished"))).count();
        return Map.of("items", items,
                "stats", Map.of("total", items.size(), "published", published, "drafts", items.size() - published));
    }

    @Override
    @Transactional
    public Map<String, Object> create(EducationalContentService.EduWriteRequest req) {
        requireTitle(req);
        Long id = jdbc.queryForObject(
                "insert into public.educational_contents(title,content_type,summary,full_content,author,"
                        + "publication_date,target_audience,keywords,is_published,title_sw,summary_sw,full_content_sw,"
                        + "created_at,updated_at)"
                        + " values (?,?,?,?,?,?::date,?,?,?,?,?,?,now(),now()) returning id", Long.class,
                req.title().trim(), nz(req.contentType(), "Article"), req.summary(), req.fullContent(),
                req.author(), blank(req.publicationDate()), req.targetAudience(), req.keywords(),
                req.isPublished() != null && req.isPublished(),
                blank(req.titleSw()), blank(req.summarySw()), blank(req.fullContentSw()));
        return Map.of("id", id, "message", "Created");
    }

    @Override
    @Transactional
    public Map<String, Object> update(long id, EducationalContentService.EduWriteRequest req) {
        requireTitle(req);
        int n = jdbc.update("update public.educational_contents set title=?, content_type=?, summary=?,"
                        + " full_content=coalesce(?, full_content), author=?, publication_date=?::date,"
                        + " target_audience=?, keywords=?, is_published=?,"
                        + " title_sw=?, summary_sw=?, full_content_sw=?,"
                        + " updated_at=now() where id=?",
                req.title().trim(), nz(req.contentType(), "Article"), req.summary(), req.fullContent(),
                req.author(), blank(req.publicationDate()), req.targetAudience(), req.keywords(),
                req.isPublished() != null && req.isPublished(),
                blank(req.titleSw()), blank(req.summarySw()), blank(req.fullContentSw()), id);
        if (n == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Content not found");
        }
        return Map.of("id", id, "message", "Updated");
    }

    @Override
    @Transactional
    public Map<String, Object> delete(long id) {
        jdbc.update("delete from public.educational_contents where id=?", id);
        return Map.of("id", id, "message", "Deleted");
    }

    private static void requireTitle(EducationalContentService.EduWriteRequest req) {
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
