package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * System Settings → User Management. Administers {@code users} and {@code model_has_roles}.
 * Jurisdiction attachment fields feed {@code JurisdictionScope}; passwords use BCrypt + shared
 * {@code PasswordPolicy}. Last Super Admin cannot be deleted or stripped of the role.
 */
public interface UserManagementService {

    Map<String, Object> index(String search, String role, String roleCategory, String scopeLevel,
                              Long regionId, Long districtId, Long councilId, Boolean seeded,
                              String accountGroup);

    Map<String, Object> create(Map<String, Object> request);

    Map<String, Object> update(long id, Map<String, Object> request);

    Map<String, Object> setUserRoles(long id, Map<String, Object> request);

    Map<String, Object> resetPassword(long id, Map<String, Object> request);

    void delete(long id);
}
