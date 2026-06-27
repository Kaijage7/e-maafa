package tz.go.pmo.dmis.inform.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface IndicatorRepository extends JpaRepository<Indicator, String> {
    List<Indicator> findByOwnerIgnoreCase(String owner);
    List<Indicator> findByTier(String tier);
}
