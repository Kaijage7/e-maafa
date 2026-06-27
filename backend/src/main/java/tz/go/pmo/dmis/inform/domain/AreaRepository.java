package tz.go.pmo.dmis.inform.domain;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AreaRepository extends JpaRepository<Area, String> {
    List<Area> findByLevel(String level);
}
