package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Signed-in user in-app notification feed and channel preferences.
 * Feed supports productive filters (unread / type / category / severity / search / cursor).
 */
public interface UserNotificationService {

    /**
     * @param limit max rows (1–100)
     * @param unreadOnly when true, only unread
     * @param type exact type match (case-insensitive) when non-blank
     * @param category derived bucket: workflow|early_warning|approval|logistics|training|scanner|system
     * @param severity info|warning|high|critical (normalized)
     * @param q title/message search
     * @param beforeId cursor: return rows with id &lt; beforeId
     */
    Map<String, Object> feed(int limit, boolean unreadOnly, String type, String category,
                             String severity, String q, Long beforeId);

    /** Unread badge + latest id (for efficient client poll) + severity breakdown. */
    Map<String, Object> unreadCount();

    Map<String, Object> markRead(long id);

    Map<String, Object> markUnread(long id);

    Map<String, Object> markAllRead();

    /** Soft-remove from the actor's feed (delete own row only). */
    Map<String, Object> dismiss(long id);

    Map<String, Object> myPreferences();

    Map<String, Object> saveMyPreferences(Map<String, Object> body);
}
