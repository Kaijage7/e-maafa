package tz.go.pmo.dmis.mitigation;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FrameworkRepository extends JpaRepository<DisasterRiskFramework, Long> {

    long countByDocumentType(String documentType);

    long countByGeographicScope(String geographicScope);
}
