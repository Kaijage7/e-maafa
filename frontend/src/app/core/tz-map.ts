import { HttpClient } from '@angular/common/http';

declare const L: any;

/**
 * Adds the STANDARD Tanzania map base — the exact same base as Risk Mapping / the Mitigation dashboard
 * (the standard map base): CartoDB Voyager raster tiles + a NEIGHBOR MASK that greys out
 * everything outside Tanzania (so the country reads clean) + the canonical lakes + region outlines, all
 * from the canonical GeoJSON. Panes match Risk Mapping's z-order; screen markers added by each feature
 * (default overlayPane, z400) stay on top. Shared by every Preparedness/public map (Evacuation Centers,
 * Warehouses, …) so the whole system renders ONE consistent base — change it here once, every map updates.
 * Uses an online raster basemap (needs the tile CDN) so every map reads like the Risk Mapping view.
 */
export function addTanzaniaGisBase(map: any, http: HttpClient): void {
  // EXCEPTION — the home hero map (#hero-map) sits OVER a crossfading photo slider and must stay
  // transparent outside Tanzania so the images pass BEHIND it. Give that one map the local vector base
  // (no opaque raster tiles / world-mask), restoring the original transparent home look. Every OTHER map gets
  // the raster base below. Auto-detected by container id so landing.component.ts needs no change.
  if (map.getContainer && map.getContainer() && map.getContainer().id === 'hero-map') {
    http.get<any>('/geojson/tz_country.geojson').subscribe((c: any) => {
      const land = L.geoJSON(c, { style: { fillColor: '#eef2f5', fillOpacity: 1, color: 'transparent', weight: 0 }, interactive: false }).addTo(map);
      land.bringToBack();
    });
    http.get<any>('/geojson/tz_regions_gis.geojson').subscribe((r: any) => { L.geoJSON(r, { style: { fillColor: '#eef2f5', fillOpacity: 0.9, color: '#c2ccd6', weight: 0.7 }, interactive: false }).addTo(map); });
    http.get<any>('/geojson/tz_water_gis.geojson').subscribe((w: any) => { L.geoJSON(w, { style: { fillColor: '#a5cde8', fillOpacity: 1, color: '#7EB8DA', weight: 0.5 }, interactive: false }).addTo(map); });
    http.get<any>('/geojson/tz_boundary_gis.geojson').subscribe((b: any) => { L.geoJSON(b, { style: { color: '#8a99a8', weight: 1.2, fill: false }, interactive: false }).addTo(map); });
    return;
  }
  // 1) Standard raster basemap.
  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png',
    { subdomains: 'abcd', maxZoom: 19 }).addTo(map);
  // Panes — same z-order as Risk Mapping (mask < lakes < regions < the default overlayPane=400 markers).
  const pane = (name: string, z: number) => {
    if (!map.getPane(name)) { map.createPane(name); map.getPane(name).style.zIndex = String(z); map.getPane(name).style.pointerEvents = 'none'; }
  };
  pane('maskPane', 250); pane('lakesPane', 260); pane('regionPane', 270);
  // 2) Neighbor mask: a world polygon with Tanzania punched out as holes → everything OUTSIDE TZ is flat grey.
  http.get<any>('/geojson/tz_boundary_simple.geojson').subscribe((data: any) => {
    const world = [[-90, -180], [90, -180], [90, 180], [-90, 180], [-90, -180]];
    const holes: any[] = [];
    (data.features || [data]).forEach((f: any) => {
      const geom = f.geometry || f;
      if (geom.type === 'MultiPolygon') { geom.coordinates.forEach((poly: any) => holes.push(poly[0].map((c: number[]) => [c[1], c[0]]))); }
      else if (geom.type === 'Polygon') { holes.push(geom.coordinates[0].map((c: number[]) => [c[1], c[0]])); }
    });
    L.polygon([world].concat(holes), { fillColor: '#e8edf2', fillOpacity: 1, stroke: false, interactive: false, pane: 'maskPane' }).addTo(map);
  });
  // 3) Lakes (canonical Waterbodies layer) — Victoria / Tanganyika / Nyasa + coast.
  http.get<any>('/geojson/tz_lakes.geojson').subscribe((data: any) => {
    L.geoJSON(data, { pane: 'lakesPane', interactive: false, style: () => ({ fillColor: '#1976D2', fillOpacity: 0.35, color: '#42A5F5', weight: 1, opacity: 0.7 }) }).addTo(map);
  });
  // 4) Region outlines (no fill — same blue as Risk Mapping).
  http.get<any>('/geojson/tz_regions_gis.geojson').subscribe((data: any) => {
    L.geoJSON(data, { pane: 'regionPane', interactive: false, style: () => ({ fillColor: '#ffffff', fillOpacity: 0, color: '#1565C0', weight: 1.1, opacity: 0.65 }) }).addTo(map);
  });
}

/**
 * Dark, command-grade variant of the Tanzania base for the Command Post storm board and any other
 * dark-themed operational console. Same four LOCAL GeoJSON layers as {@link addTanzaniaGisBase}, but a
 * deep-ocean / dark-slate palette so cyclone overlays (cyan track, red eye, amber wind-field) read like
 * an RSMC/NHC night console instead of a bright daytime atlas. Shares the same geometry — never mutates
 * the light base, so daytime Preparedness maps are unaffected.
 */
export function addTanzaniaDarkBase(map: any, http: HttpClient): void {
  // 1) Solid land base — dark slate, fills the old lake cutouts so they don't ghost as water.
  http.get<any>('/geojson/tz_country.geojson').subscribe(c => {
    const land = L.geoJSON(c, {
      style: { fillColor: '#10243b', fillOpacity: 1, color: 'transparent', weight: 0 },
      interactive: false,
    }).addTo(map);
    land.bringToBack();
  });
  // 2) Region fills + faint glowing borders (subtle graticule, not a daytime atlas)
  http.get<any>('/geojson/tz_regions_gis.geojson').subscribe(r => {
    L.geoJSON(r, {
      style: { fillColor: '#142c47', fillOpacity: 0.92, color: '#23456b', weight: 0.6 },
      interactive: false,
    }).addTo(map);
  });
  // 3) Water — deep ocean, darker than land so the coastline reads and the storm pops over the sea.
  http.get<any>('/geojson/tz_water_gis.geojson').subscribe(w => {
    L.geoJSON(w, { style: { fillColor: '#0a1626', fillOpacity: 1, color: '#15324e', weight: 0.5 }, interactive: false }).addTo(map);
  });
  // 4) National boundary on top — a cool cyan glow
  http.get<any>('/geojson/tz_boundary_gis.geojson').subscribe(b => {
    L.geoJSON(b, { style: { color: '#2f6ea3', weight: 1.2, opacity: 0.85, fill: false }, interactive: false }).addTo(map);
  });
}

/* ------------------------------------------------------------------------------------------------
 * Administrative drill-down — region → district → ward, the same interaction as the Prevention &
 * Mitigation dashboard / Risk Mapping screens. Uses the split GeoJSON set (adm1_region/adm1.geojson,
 * adm2_district/by_region/<Region>.geojson, adm3_ward/by_district/<Region>__<District>.geojson).
 * Shared so the PUBLIC maps (landing hero, /portal) drill exactly like the admin GIS maps.
 * ---------------------------------------------------------------------------------------------- */

/**
 * Uniform DMIS map navigation — call once after L.map(...) + base layers on EVERY map so the whole
 * system pans and zooms the same way, using the STANDARD built-in interactions:
 *   • the zoom (+/−) control (added if the map was created without one),
 *   • mouse-drag panning to any part of the map,
 *   • scroll-wheel / double-click / touch / box zoom + keyboard arrows.
 * The old directional "compass" pan box was removed — it added no value over native drag-to-pan and
 * was a non-standard control. Native dragging + scroll-zoom reach any position and any zoom level
 * within the map's range. The {@code opts} arg is kept for call-site compatibility (now unused).
 */
export function addMapNav(map: any, _opts: { dark?: boolean; home?: [number, number, number] } = {}): void {
  if (!map.zoomControl) { L.control.zoom({ position: 'topleft' }).addTo(map); }
  // Force-enable the built-in handlers so every map is interactive, even if it was created with them
  // disabled (some screens locked the map to a static view — the user wants all maps pan/zoomable).
  map.dragging?.enable();
  map.scrollWheelZoom?.enable();
  map.doubleClickZoom?.enable();
  map.touchZoom?.enable();
  map.boxZoom?.enable();
  map.keyboard?.enable();
}

/** Region/district names → split-file names (same rule as the admin GIS map). */
function safeName(name: string): string {
  return name.replace(/ /g, '_').replace(/\//g, '_').replace(/'/g, '');
}

/**
 * Adds clickable region polygons that drill into districts, then wards.
 * Returns a `reset()` handle so callers can offer a "back to national view" control.
 */
/** Optional choropleth: returns a fill colour for a region, or null for "no data" (pale). */
export type RegionFill = (regionName: string) => string | null;
/** District choropleth: a fill colour for a specific district (within its region), or null. */
export type DistrictFill = (regionName: string, districtName: string) => string | null;

export function addAdminDrilldown(map: any, http: HttpClient, regionFill?: RegionFill,
                                  opts?: { districtFill?: DistrictFill; districtRegions?: string[] }): { reset: () => void } {
  let districtLayer: any = null;
  let wardLayer: any = null;

  const clearDetail = () => {
    if (districtLayer) { map.removeLayer(districtLayer); districtLayer = null; }
    if (wardLayer) { map.removeLayer(wardLayer); wardLayer = null; }
  };

  const loadWards = (region: string, district: string) => {
    if (wardLayer) { map.removeLayer(wardLayer); wardLayer = null; }
    fetch(`/geojson/adm3_ward/by_district/${safeName(region)}__${safeName(district)}.geojson`)
      .then(r => r.json())
      .then(data => {
        wardLayer = L.geoJSON(data, {
          style: () => ({ fillColor: '#1565c0', fillOpacity: 0.03, color: 'rgba(21,101,192,0.35)', weight: 0.6, opacity: 0.5 }),
          onEachFeature: (f: any, layer: any) => {
            layer.bindTooltip(f.properties.ward_name || 'Ward', { sticky: true });
            layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.15, weight: 1.2, opacity: 0.8 }));
            layer.on('mouseout', () => layer.setStyle({ fillOpacity: 0.03, weight: 0.6, opacity: 0.5 }));
            layer.on('click', (e: any) => {
              L.DomEvent.stopPropagation(e);
              map.flyToBounds(layer.getBounds(), { padding: [50, 50], duration: 0.6, maxZoom: 14 });
            });
          },
        }).addTo(map);
      }).catch(() => { /* ward file missing for this district — stay at district level */ });
  };

  const loadDistricts = (region: string) => {
    clearDetail();
    fetch(`/geojson/adm2_district/by_region/${safeName(region)}.geojson`)
      .then(r => r.json())
      .then(data => {
        districtLayer = L.geoJSON(data, {
          style: () => ({ fillColor: '#1565C0', fillOpacity: 0.03, color: '#003366', weight: 1, opacity: 0.5, dashArray: '4 3' }),
          onEachFeature: (f: any, layer: any) => {
            const district = f.properties.dist_name || 'District';
            layer.bindTooltip(district, { sticky: true });
            layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.12, weight: 2, opacity: 0.8, dashArray: '' }));
            layer.on('mouseout', () => layer.setStyle({ fillOpacity: 0.03, weight: 1, opacity: 0.5, dashArray: '4 3' }));
            layer.on('click', (e: any) => {
              L.DomEvent.stopPropagation(e);
              layer.setStyle({ fillColor: '#1565c0', fillOpacity: 0.15, color: '#1565c0', weight: 2, dashArray: '' });
              map.flyToBounds(layer.getBounds(), { padding: [40, 40], duration: 0.8, maxZoom: 11 });
              loadWards(region, district);
            });
          },
        }).addTo(map);
      }).catch(() => { /* district file missing — stay at region level */ });
  };

  // Region layer (invisible fills over the GIS base) — the drill-down entry point
  http.get<any>('/geojson/adm1_region/adm1.geojson').subscribe(adm1 => {
    L.geoJSON(adm1, {
      style: (f: any) => {
        const fill = regionFill?.(f.properties.reg_name) ?? null;
        return fill
          ? { fillColor: fill, fillOpacity: 0.55, color: '#fff', weight: 1.2, opacity: 0.9 }
          : { fillColor: '#003366', fillOpacity: regionFill ? 0.04 : 0, color: regionFill ? '#b8c4d0' : 'transparent', weight: regionFill ? 0.8 : 0 };
      },
      onEachFeature: (f: any, layer: any) => {
        const region = f.properties.reg_name;
        const fill = regionFill?.(region) ?? null;
        const baseOpacity = fill ? 0.55 : (regionFill ? 0.04 : 0);
        layer.bindTooltip(region, { sticky: true });
        layer.on('mouseover', () => layer.setStyle({ fillOpacity: Math.min(baseOpacity + 0.15, 0.8) }));
        layer.on('mouseout', () => layer.setStyle({ fillOpacity: baseOpacity }));
        layer.on('click', () => {
          map.flyToBounds(layer.getBounds(), { padding: [30, 30], duration: 0.8, maxZoom: 9 });
          loadDistricts(region);
        });
      },
    }).addTo(map);

    // District-level alerts: colour only the affected district(s) of each such region (not the whole
    // region). A non-interactive overlay so the region drill-down underneath keeps working ("hotlink as is").
    if (opts?.districtFill && opts?.districtRegions?.length) {
      const seen = new Set<string>();
      for (const region of opts.districtRegions) {
        const key = (region || '').toLowerCase();
        if (!region || seen.has(key)) { continue; }
        seen.add(key);
        fetch(`/geojson/adm2_district/by_region/${safeName(region)}.geojson`)
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            if (!data) { return; }
            L.geoJSON(data, {
              interactive: false,
              style: (f: any) => {
                const c = opts.districtFill!(f.properties.reg_name, f.properties.dist_name);
                return c
                  ? { fillColor: c, fillOpacity: 0.6, color: '#fff', weight: 1, opacity: 0.9 }
                  : { fillColor: 'transparent', fillOpacity: 0, color: 'transparent', weight: 0 };
              },
            }).addTo(map);
          }).catch(() => { /* region district file missing — region stays region-level */ });
      }
    }
  });

  return {
    reset: () => {
      clearDetail();
      map.flyTo([-6.3, 35.0], 6, { duration: 0.8 });
    },
  };
}
