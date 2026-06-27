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
 * Content Management → News & Events — admin CRUD over portal_news, reproducing
 * Admin/PortalNewsController: slug auto-generated from the title (unique), and
 * published_at auto-set the moment an item is activated without a date.
 * The PUBLIC landing/news pages consume what is managed here.
 */
@RestController
@RequestMapping("/v1/content/news")
@RequiredArgsConstructor
@Tag(name = "Content Management", description = "Portal news & events (admin)")
public class PortalNewsAdminController {

    private final JdbcTemplate jdbc;

    public record NewsWriteRequest(String title, String excerpt, String body, String image,
                                   String category, Boolean isActive,
                                   String title_sw, String excerpt_sw, String body_sw) {
    }

    @GetMapping
    @Operation(summary = "All news/events with stats (admin list)")
    @PreAuthorize("isAuthenticated()")
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

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Create a news/event item (slug auto-generated)")
    @PreAuthorize("hasAuthority('content_management.manage')")
    @Transactional
    public Map<String, Object> create(@RequestBody NewsWriteRequest req) {
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

    @PutMapping("/{id}")
    @Operation(summary = "Update a news/event item")
    @PreAuthorize("hasAuthority('content_management.manage')")
    @Transactional
    public Map<String, Object> update(@PathVariable long id, @RequestBody NewsWriteRequest req) {
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

    @DeleteMapping("/{id}")
    @Operation(summary = "Delete a news/event item")
    @PreAuthorize("hasAuthority('content_management.manage')")
    @Transactional
    public Map<String, Object> delete(@PathVariable long id) {
        jdbc.update("delete from public.portal_news where id=?", id);
        return Map.of("id", id, "message", "Deleted");
    }

    private static void requireTitle(NewsWriteRequest req) {
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
