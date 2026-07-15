package tz.go.pmo.dmis.service.impl;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import tz.go.pmo.dmis.common.security.CurrentUserResolver;
import tz.go.pmo.dmis.dto.request.MobileDeviceRegistrationRequest;
import tz.go.pmo.dmis.service.MobileDeviceService;

/**
 * Upserts the caller's installation and soft-revokes it on logout/uninstall. A later FCM/APNs
 * sender may address only non-revoked rows; it must never put domain content in the push body.
 */
@Service
public class MobileDeviceServiceImpl implements MobileDeviceService {

    private static final int MAX_LIVE_INSTALLATIONS_PER_USER = 20;

    private final JdbcTemplate jdbc;
    private final CurrentUserResolver currentUser;

    public MobileDeviceServiceImpl(JdbcTemplate jdbc, CurrentUserResolver currentUser) {
        this.jdbc = jdbc;
        this.currentUser = currentUser;
    }

    @Override
    @Transactional
    public Map<String, Object> registerCurrent(MobileDeviceRegistrationRequest request) {
        long userId = requireAuthenticatedUser();
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A JSON device registration body is required.");
        }

        String installationId = request.installationId().trim();
        String platform = request.platform().trim().toLowerCase(Locale.ROOT);
        String appVersion = blankToNull(request.appVersion());
        String pushProvider = normalizeProvider(request.pushProvider());
        String pushToken = blankToNull(request.pushToken());

        if ("none".equals(pushProvider)) {
            pushToken = null;
        } else if (pushToken == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "push_token is required when push_provider is fcm or apns.");
        } else if (pushToken.length() < 16) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "push_token is too short to be a valid provider token.");
        }

        // Serialize count + upsert per owner. Without this row lock, concurrent first registrations
        // could each observe the same count and collectively exceed the live-installation cap.
        jdbc.queryForObject(
                "select id from public.users where id = ? for update", Long.class, userId);

        // Cap live installations so a misbehaving client cannot grow unbounded rows per account.
        Integer liveCount = jdbc.queryForObject("""
                select count(*) from platform.mobile_device_installations
                 where user_id = ? and revoked_at is null and installation_id <> ?
                """, Integer.class, userId, installationId);
        if (liveCount != null && liveCount >= MAX_LIVE_INSTALLATIONS_PER_USER) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "This account already has the maximum number of active mobile installations.");
        }

        Timestamp now = Timestamp.from(Instant.now());
        try {
            jdbc.update("""
                    insert into platform.mobile_device_installations(
                        user_id, installation_id, platform, app_version, push_provider, push_token,
                        push_token_set_at, last_seen_at, revoked_at, created_at, updated_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?, null, ?, ?)
                    on conflict (user_id, installation_id) do update set
                        platform = excluded.platform,
                        app_version = excluded.app_version,
                        push_provider = excluded.push_provider,
                        push_token = excluded.push_token,
                        push_token_set_at = case
                            when excluded.push_token is distinct from platform.mobile_device_installations.push_token
                              or excluded.push_provider is distinct from platform.mobile_device_installations.push_provider
                            then excluded.push_token_set_at
                            else platform.mobile_device_installations.push_token_set_at
                        end,
                        last_seen_at = excluded.last_seen_at,
                        revoked_at = null,
                        updated_at = excluded.updated_at
                    """,
                    userId,
                    installationId,
                    platform,
                    appVersion,
                    pushProvider,
                    pushToken,
                    pushToken == null ? null : now,
                    now,
                    now,
                    now);
        } catch (DataIntegrityViolationException conflict) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "That push token is already registered to another live installation.",
                    conflict);
        }

        return loadForUser(userId, installationId);
    }

    @Override
    @Transactional
    public Map<String, Object> revokeCurrent(String installationId) {
        long userId = requireAuthenticatedUser();
        String id = installationId == null ? "" : installationId.trim();
        if (id.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "installation_id is required to revoke the current device.");
        }
        if (!id.matches("^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "installation_id must be 8–128 characters from [A-Za-z0-9._:-]");
        }

        int updated = jdbc.update("""
                update platform.mobile_device_installations
                   set revoked_at = coalesce(revoked_at, now()),
                       push_token = null,
                       push_provider = 'none',
                       push_token_set_at = null,
                       updated_at = now()
                 where user_id = ?
                   and installation_id = ?
                """, userId, id);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "No installation is registered for this user and installation_id.");
        }
        return loadForUser(userId, id);
    }

    private Map<String, Object> loadForUser(long userId, String installationId) {
        try {
            return jdbc.queryForObject("""
                    select id, installation_id, platform, app_version, push_provider, push_token,
                           last_seen_at, revoked_at, created_at, updated_at
                      from platform.mobile_device_installations
                     where user_id = ? and installation_id = ?
                    """, (rs, rowNum) -> {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("id", rs.getLong("id"));
                body.put("installation_id", rs.getString("installation_id"));
                body.put("platform", rs.getString("platform"));
                body.put("app_version", rs.getString("app_version"));
                body.put("push_provider", rs.getString("push_provider"));
                body.put("push_token_present", rs.getString("push_token") != null);
                body.put("last_seen_at", rs.getTimestamp("last_seen_at").toInstant().toString());
                Timestamp revoked = rs.getTimestamp("revoked_at");
                body.put("revoked_at", revoked == null ? null : revoked.toInstant().toString());
                body.put("created_at", rs.getTimestamp("created_at").toInstant().toString());
                body.put("updated_at", rs.getTimestamp("updated_at").toInstant().toString());
                body.put("status", revoked == null ? "active" : "revoked");
                return body;
            }, userId, installationId);
        } catch (EmptyResultDataAccessException missing) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,
                    "No installation is registered for this user and installation_id.",
                    missing);
        }
    }

    private long requireAuthenticatedUser() {
        Long userId = currentUser.currentUserDbId();
        if (userId == null || userId <= 0) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,
                    "A numeric platform user identity is required for device registration.");
        }
        return userId;
    }

    private static String normalizeProvider(String pushProvider) {
        if (pushProvider == null || pushProvider.isBlank()) {
            return "none";
        }
        return pushProvider.trim().toLowerCase(Locale.ROOT);
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
