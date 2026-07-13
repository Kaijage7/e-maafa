package tz.go.pmo.dmis.service;

import java.util.Map;

/** GIS reference map data. Path {@code GET /v1/gis-map} unchanged. */
public interface GisMapService {
    Map<String, Object> index();
}
