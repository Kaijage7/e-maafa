package tz.go.pmo.dmis.service.impl;

import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.stereotype.Service;
import tz.go.pmo.dmis.service.PortalNewsService;

/**
 * Content Management → News & Events — admin CRUD over portal_news, reproducing
 * Admin/PortalNewsController: slug auto-generated from the title (unique), and
 * published_at auto-set the moment an item is activated without a date.
 * The PUBLIC landing/news pages consume what is managed here.
 */
@Service
@lombok.RequiredArgsConstructor
public class PortalNewsServiceImpl implements PortalNewsService {


    private final JdbcTemplate jdbc;
    @Override
    public Map<String, Object> index() {
        List<Map<String, Object>> items = jdbc.queryForList(
                "select id, title, slug, excerpt, body, image, category, is_active as \"isActive\","
                        + " title_sw, excerpt_sw, body_sw,"
                        + " to_char(published_at, 'DD Mon YYYY') as \"publishedAt\""
                        + " from public.portal_news order by published_at desc nulls last, id desc");
        long news = items.stream().filter(i -> "news".equals(i.get("category"))).count();
        long events = items.stream().filter(i -> "event".equals(i.get("category"))).count();
        long published = items.stream().filter(i -> Boolean.TRUE.equals(i.get("isActive"))).count();
        return Map.of("items", items,
                "stats", Map.of("total", items.size(), "news", news, "events", events, "published", published));
    }

    @Override
    @Transactional
    public Map<String, Object> create(PortalNewsService.NewsWriteRequest req) {
        requireTitle(req);
        boolean active = req.isActive() == null || req.isActive();
        String slug = uniqueSlug(slugify(req.title()), null);
        Long id = jdbc.queryForObject(
                "insert into public.portal_news(title,slug,excerpt,body,image,category,title_sw,excerpt_sw,body_sw,"
                        + "published_at,is_active,created_at,updated_at)"
                        + " values (?,?,?,?,?,?,?,?,?, case when ? then now() end, ?, now(), now())"
                        + " returning id", Long.class,
                req.title().trim(), slug, req.excerpt(), req.body(), req.image(),
                req.category() == null ? "news" : req.category(),
                req.title_sw(), req.excerpt_sw(), req.body_sw(), active, active);
        return Map.of("id", id, "slug", slug, "message", "Created");
    }

    @Override
    @Transactional
    public Map<String, Object> update(long id, PortalNewsService.NewsWriteRequest req) {
        requireTitle(req);
        boolean active = req.isActive() == null || req.isActive();
        int updated = jdbc.update(
                "update public.portal_news set title=?, excerpt=?, body=?, image=?, category=?,"
                        + " title_sw=?, excerpt_sw=?, body_sw=?, is_active=?,"
                        + " published_at = case when ? and published_at is null then now() else published_at end,"
                        + " updated_at=now() where id=?",
                req.title().trim(), req.excerpt(), req.body(), req.image(),
                req.category() == null ? "news" : req.category(),
                req.title_sw(), req.excerpt_sw(), req.body_sw(), active, active, id);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Item not found");
        }
        return Map.of("id", id, "message", "Updated");
    }

    @Override
    @Transactional
    public Map<String, Object> delete(long id) {
        jdbc.update("delete from public.portal_news where id=?", id);
        return Map.of("id", id, "message", "Deleted");
    }

    private static void requireTitle(PortalNewsService.NewsWriteRequest req) {
        if (req.title() == null || req.title().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title is required");
        }
    }

    /** Str::slug equivalent: lowercase, alphanumerics, dashes. */
    private static String slugify(String title) {
        return title.toLowerCase().replaceAll("[^a-z0-9]+", "-").replaceAll("(^-|-$)", "");
    }

    /** Ensures slug uniqueness by appending -2, -3 … like Laravel's typical approach. */
    private String uniqueSlug(String base, Long excludeId) {
        String slug = base;
        int n = 2;
        while (Boolean.TRUE.equals(jdbc.queryForObject(
                "select exists(select 1 from public.portal_news where slug=? and (?::bigint is null or id<>?::bigint))",
                Boolean.class, slug, excludeId, excludeId))) {
            slug = base + "-" + n++;
        }
        return slug;
    }

}
