package tz.go.pmo.dmis.controller;

import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
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
 * In-app notification feed (bell) + preferences. Thin eGA controller.
 * Path {@code /v1/notifications} unchanged. Logic in {@link UserNotificationService}.
 */
@RestController
@RequestMapping("/v1/notifications")
@RequiredArgsConstructor
public class NotificationController {

    private final UserNotificationService service;

    @GetMapping
    public Map<String, Object> feed(@RequestParam(defaultValue = "20") int limit) {
        return service.feed(limit);
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
    @PostMapping("/read-all")
    public Map<String, Object> markAllRead() {
        return service.markAllRead();
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
