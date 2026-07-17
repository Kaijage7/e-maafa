package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tz.go.pmo.dmis.common.security.Authz;
import tz.go.pmo.dmis.service.UserNotificationService;

/**
 * Next-level in-app notification feed (bell + centre) and channel preferences.
 * Path {@code /v1/notifications}. Logic in {@link UserNotificationService}.
 */
@RestController
@RequestMapping("/v1/notifications")
@PreAuthorize(Authz.AUTHENTICATED)
@RequiredArgsConstructor
public class NotificationController {

    private final UserNotificationService service;

    /**
     * Feed with productive filters. All query params optional; nonsense category → 422,
     * nonsense type/severity → empty list (0 rows).
     * Class-level authentication applies; rows are always scoped to the caller in the service.
     */
    @GetMapping
    public Map<String, Object> feed(@RequestParam(defaultValue = "20") int limit,
                                    @RequestParam(required = false) Boolean unread,
                                    @RequestParam(required = false) String type,
                                    @RequestParam(required = false) String category,
                                    @RequestParam(required = false) String severity,
                                    @RequestParam(required = false) String q,
                                    @RequestParam(required = false) Long before_id) {
        boolean unreadOnly = Boolean.TRUE.equals(unread);
        return service.feed(limit, unreadOnly, type, category, severity, q, before_id);
    }

    /**
     * Resumable mobile/web catch-up for newly delivered notices. The client persists
     * {@code next_after_sequence} only after it has committed the returned page locally.
     */
    @PreAuthorize(Authz.AUTHENTICATED)
    @GetMapping("/changes")
    public Map<String, Object> changes(@RequestParam(defaultValue = "0") long after_sequence,
                                       @RequestParam(defaultValue = "100") int limit) {
        return service.changes(after_sequence, limit);
    }

    @GetMapping("/unread-count")
    public Map<String, Object> unreadCount() {
        return service.unreadCount();
    }

    @PreAuthorize(Authz.AUTHENTICATED)
    @PostMapping("/{id}/read")
    public Map<String, Object> markRead(@PathVariable long id) {
        return service.markRead(id);
    }

    @PreAuthorize(Authz.AUTHENTICATED)
    @PostMapping("/{id}/unread")
    public Map<String, Object> markUnread(@PathVariable long id) {
        return service.markUnread(id);
    }

    @PreAuthorize(Authz.AUTHENTICATED)
    @PostMapping("/read-all")
    public Map<String, Object> markAllRead() {
        return service.markAllRead();
    }

    @PreAuthorize(Authz.AUTHENTICATED)
    @DeleteMapping("/{id}")
    public Map<String, Object> dismiss(@PathVariable long id) {
        return service.dismiss(id);
    }

    @GetMapping("/preferences")
    public Map<String, Object> myPreferences() {
        return service.myPreferences();
    }

    @PreAuthorize(Authz.AUTHENTICATED)
    @PostMapping("/preferences")
    public Map<String, Object> saveMyPreferences(@RequestBody Map<String, Object> body) {
        return service.saveMyPreferences(body);
    }
}
