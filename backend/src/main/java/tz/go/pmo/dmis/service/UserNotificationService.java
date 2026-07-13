package tz.go.pmo.dmis.service;

import java.util.Map;

/** Signed-in user in-app notification feed and channel preferences. Paths/JSON unchanged. */
public interface UserNotificationService {

    Map<String, Object> feed(int limit);

    Map<String, Object> unreadCount();

    Map<String, Object> markRead(long id);

    Map<String, Object> markAllRead();

    Map<String, Object> myPreferences();

    Map<String, Object> saveMyPreferences(Map<String, Object> body);
}
