package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * System Settings → Roles &amp; Permissions. Registry, permission catalogue/matrix, and role CRUD.
 * Runtime auth still reads {@code model_has_roles} / {@code role_has_permissions} via security filters.
 */
public interface RolePermissionService {

    Map<String, Object> index();

    Map<String, Object> catalogue();

    Map<String, Object> show(long id);

    Map<String, Object> create(Map<String, Object> request);

    Map<String, Object> update(long id, Map<String, Object> request);

    Map<String, Object> setPermissions(long id, Map<String, Object> request);

    void delete(long id);
}
