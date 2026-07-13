package tz.go.pmo.dmis.service;

import java.util.Map;

/**
 * Response → Stakeholder Coordination. Read-only 360° view of partners across response lanes,
 * recovery donations, and agency warehouse stock. SQL coupling only to those tables.
 */
public interface StakeholderCoordinationService {

    Map<String, Object> index();

    Map<String, Object> show(long id);
}
