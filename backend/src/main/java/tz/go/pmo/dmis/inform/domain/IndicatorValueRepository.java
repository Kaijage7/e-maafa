package tz.go.pmo.dmis.inform.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface IndicatorValueRepository extends JpaRepository<IndicatorValue, Long> {
    List<IndicatorValue> findByAreaCodeAndIsLatestTrue(String areaCode);
    List<IndicatorValue> findByIndicatorIdAndAreaCodeAndIsLatestTrue(String indicatorId, String areaCode);

    // compute path: the authoritative value must be BOTH latest AND approved — never trust is_latest alone
    List<IndicatorValue> findByAreaCodeAndIsLatestTrueAndStatus(String areaCode, String status);

    // approval queue: submissions awaiting PMO sign-off (newest first), optionally scoped to a sector/owner
    List<IndicatorValue> findByStatusOrderByTsDesc(String status);
    List<IndicatorValue> findByStatusAndOwnerOrderByTsDesc(String status, String owner);
}
