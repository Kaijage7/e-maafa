/**
 * Shared NASA GIBS / Worldview EO helpers for Impact Analysis + Risk Mapping.
 * Honesty: open temporal true-colour imagery for human review — not DMIS satellite damage AI.
 * Dual-proved products use GoogleMapsCompatible_Level9 JPEG where available.
 */

declare const L: any;

export interface EoGibsProduct {
  id: string;
  label: string;
  layer: string;
  matrix: string;
  ext: string;
  maxNativeZoom: number;
  /** Earliest reliable archive day (ISO) — clamp historical picks to this. */
  archiveStart: string;
  hint: string;
}

/**
 * Prevention / Risk Mapping compare types — landscape & exposure EO (not weather SAT24).
 * True colour + false colour (land/veg/burn) + flood composite; Sentinel via external.
 */
/** Exposure / landscape types only — never weather radar or SAT24. */
export const EO_GIBS_PRODUCTS: EoGibsProduct[] = [
  {
    id: 'truecolor',
    label: 'True colour',
    layer: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    matrix: 'GoogleMapsCompatible_Level9',
    ext: 'jpg',
    maxNativeZoom: 9,
    archiveStart: '2000-02-24',
    hint: 'True colour landscape (MODIS Terra) — settlements, water, land cover since 2000',
  },
  {
    id: 'falsecolor',
    label: 'Land & vegetation',
    layer: 'MODIS_Terra_CorrectedReflectance_Bands721',
    matrix: 'GoogleMapsCompatible_Level9',
    ext: 'jpg',
    maxNativeZoom: 9,
    archiveStart: '2000-02-24',
    hint: 'Land & vegetation false colour — green veg, bare soil, burn scars',
  },
  {
    id: 'flood',
    label: 'Flood exposure',
    layer: 'MODIS_Combined_Flood_3-Day',
    matrix: 'GoogleMapsCompatible_Level8',
    ext: 'png',
    maxNativeZoom: 8,
    archiveStart: '2011-01-01',
    hint: 'Flood water composite (3-day) — exposure of inundated areas',
  },
  {
    id: 'viirs_hi',
    label: 'Higher detail',
    layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
    matrix: 'GoogleMapsCompatible_Level9',
    ext: 'jpg',
    maxNativeZoom: 9,
    archiveStart: '2018-01-05',
    hint: 'Higher-detail true colour (VIIRS NOAA-20) from 2018 onward',
  },
];

/** @deprecated alias — Impact Analysis may still reference old ids; map common aliases. */
const PRODUCT_ALIASES: Record<string, string> = {
  modis_terra: 'truecolor',
  modis_aqua: 'truecolor',
  viirs_n20: 'viirs_hi',
  viirs_n21: 'viirs_hi',
};

/**
 * Satellite capability catalogue (~24 features) — what DMIS can accommodate where.
 * status: live | ready | deferred | planned
 * surface: impact | risk_mapping | both | platform
 */
export type SatFeatureStatus = 'live' | 'ready' | 'deferred' | 'planned';
export type SatFeatureSurface = 'impact' | 'risk_mapping' | 'both' | 'platform';

export interface SatFeature {
  id: string;
  title: string;
  status: SatFeatureStatus;
  surface: SatFeatureSurface;
  detail: string;
}

export const SAT_FEATURE_CATALOGUE: SatFeature[] = [
  // 1–8 Impact / shared basemap
  { id: 'map_basemap', title: 'Administrative map basemap', status: 'live', surface: 'both', detail: 'Carto/OSM or local TZ vectors' },
  { id: 'esri_basemap', title: 'Esri World Imagery basemap', status: 'ready', surface: 'both', detail: 'Static high-res aerial (not daily time-series)' },
  { id: 'structures_mode', title: 'Structures mode (buildings on map)', status: 'ready', surface: 'impact', detail: 'Esri high-res + translucent paint for roofs' },
  { id: 'google_earth', title: 'Google Earth buildings (external)', status: 'ready', surface: 'impact', detail: 'Near-current structures — Google ToS, not embedded' },
  { id: 'hybrid_labels', title: 'Place labels on satellite', status: 'ready', surface: 'both', detail: 'Carto labels-only hybrid' },
  { id: 'gibs_modis_terra', title: 'GIBS MODIS Terra daily true-colour', status: 'ready', surface: 'both', detail: 'In-map time-enabled WMTS' },
  { id: 'gibs_modis_aqua', title: 'GIBS MODIS Aqua daily true-colour', status: 'ready', surface: 'both', detail: 'In-map time-enabled WMTS' },
  { id: 'gibs_viirs_n20', title: 'GIBS VIIRS NOAA-20 true-colour', status: 'ready', surface: 'both', detail: 'In-map time-enabled WMTS' },
  { id: 'gibs_viirs_n21', title: 'GIBS VIIRS NOAA-21 true-colour', status: 'ready', surface: 'both', detail: 'In-map time-enabled WMTS' },
  { id: 'timeline_scrub', title: '14-day timeline scrubber + play', status: 'ready', surface: 'both', detail: 'Day chips, range, animate' },
  // 9–14 Temporal / historical
  { id: 'filmstrip', title: 'Recent filmstrip (Worldview Snapshots)', status: 'ready', surface: 'both', detail: 'AOI preview frames' },
  { id: 'hist_ab', title: 'Historical A/B date compare', status: 'ready', surface: 'risk_mapping', detail: 'Before/after for DRR / mitigation evidence' },
  { id: 'hist_presets', title: 'Long-horizon presets (−30d/−1y/−5y/−10y)', status: 'ready', surface: 'risk_mapping', detail: 'MODIS archive depth for landscape change' },
  { id: 'worldview_full', title: 'NASA Worldview deep link (timeline)', status: 'ready', surface: 'both', detail: 'Full temporal browser' },
  { id: 'worldview_swipe', title: 'NASA Worldview swipe compare', status: 'ready', surface: 'both', detail: 'External side-by-side dates' },
  { id: 'copernicus_s2', title: 'Copernicus Browser (Sentinel-2)', status: 'ready', surface: 'both', detail: 'External higher-res scenes' },
  // 15–20 Context & ops
  { id: 'eo_browser', title: 'EO Browser (Sentinel Hub)', status: 'ready', surface: 'both', detail: 'External; may need free login' },
  { id: 'street_view', title: 'Street View / Mapillary context', status: 'ready', surface: 'impact', detail: 'External ToS links' },
  { id: 'entity_overlay', title: 'Entity EW + paint over EO', status: 'live', surface: 'impact', detail: 'Translucent districts over GIBS' },
  { id: 'risk_layers_over_eo', title: 'Risk assets over EO (infra/RAS/EC)', status: 'ready', surface: 'risk_mapping', detail: 'Existing GIS layers + GIBS underlay' },
  { id: 'past_disaster_eo', title: 'Past disasters + historical EO', status: 'ready', surface: 'risk_mapping', detail: 'Align event dates with archive day' },
  { id: 'mitigation_evidence', title: 'Mitigation measure evidence note', status: 'ready', surface: 'risk_mapping', detail: 'Operator notes that EO A/B supports DRR review' },
  // 21–24 Deferred / planned (honest)
  { id: 'scene_metadata_db', title: 'Governed satellite_scene metadata SoR', status: 'planned', surface: 'platform', detail: 'F114 catalogue table — not live' },
  { id: 'change_detection_ai', title: 'Automated change detection / damage AI', status: 'deferred', surface: 'platform', detail: 'F105/F114 — never green-lit without dual-proof' },
  { id: 'exposure_intersect', title: 'Footprint ∩ exposure grids', status: 'deferred', surface: 'impact', detail: 'NBS/WorldPop adapters after dual-proof' },
  { id: 'copernicus_ems_ingest', title: 'Copernicus EMS product ingest', status: 'planned', surface: 'platform', detail: 'Activation products after MoU' },
];

export function isoDateOffset(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

export function isoYearsBack(years: number): string {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d.toISOString().slice(0, 10);
}

/** Fixed calendar day in a given UTC year (e.g. mid-year trend samples). */
export function isoOnYear(year: number, month = 7, day = 15): string {
  const m = String(Math.max(1, Math.min(12, month))).padStart(2, '0');
  const dd = String(Math.max(1, Math.min(28, day))).padStart(2, '0');
  return `${year}-${m}-${dd}`;
}

export function eoToday(): string {
  return isoDateOffset(0);
}

export function eoProductById(id: string): EoGibsProduct {
  const resolved = PRODUCT_ALIASES[id] || id;
  return EO_GIBS_PRODUCTS.find(p => p.id === resolved) || EO_GIBS_PRODUCTS[0];
}

/** Sentinel-2 deep links for higher-res exposure (external — not weather). */
export function sentinelLinks(aoi: EoAoi, dateA: string, dateB: string): Array<{ key: string; title: string; url: string }> {
  const fixed = clampAoiToAfrica(aoi);
  const mk = (d: string) =>
    `https://browser.dataspace.copernicus.eu/?lat=${fixed.lat}&lng=${fixed.lng}&zoom=8`
    + `&fromTime=${d}T00%3A00%3A00.000Z&toTime=${d}T23%3A59%3A59.999Z`;
  return [
    { key: 's2a', title: 'Sentinel-2 · A', url: mk(dateA) },
    { key: 's2b', title: 'Sentinel-2 · B', url: mk(dateB) },
  ];
}

/** Clamp ISO date into product archive … today. */
export function clampToProductArchive(iso: string, product: EoGibsProduct): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return product.archiveStart;
  const today = eoToday();
  if (iso < product.archiveStart) return product.archiveStart;
  if (iso > today) return today;
  return iso;
}

export function gibsTileUrl(product: EoGibsProduct, timeIso: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${product.layer}/default/${timeIso}/${product.matrix}/{z}/{y}/{x}.${product.ext}`;
}

export function createGibsTileLayer(
  product: EoGibsProduct,
  timeIso: string,
  opts?: { opacity?: number; pane?: string },
): any {
  return L.tileLayer(gibsTileUrl(product, timeIso), {
    attribution: 'Imagery © NASA GIBS / EOSDIS — time-enabled true-colour (not DMIS AI)',
    maxNativeZoom: product.maxNativeZoom,
    maxZoom: 18,
    minZoom: 4,
    opacity: opts?.opacity ?? 0.75,
    pane: opts?.pane,
    crossOrigin: true,
    errorTileUrl: '',
  });
}

export function ensureGibsPane(map: any, name = 'dmisGibsPane', zIndex = 320): void {
  if (!map.getPane(name)) {
    map.createPane(name);
  }
  map.getPane(name).style.zIndex = String(zIndex);
  map.getPane(name).style.pointerEvents = 'none';
}

export interface EoAoi {
  lat: number;
  lng: number;
  bbox: [number, number, number, number];
  label: string;
}

/** Tanzania national frame — always prefer this over global defaults. */
export const TZ_NATIONAL_AOI: EoAoi = {
  lat: -6.3690,
  lng: 34.8888,
  label: 'Tanzania',
  // minLon, minLat, maxLon, maxLat (covers TZ + near borders for context)
  bbox: [29.2, -11.8, 40.6, -0.9],
};

/** East Africa / Great Lakes — wider than TZ only (still not Europe/US). */
export const EAST_AFRICA_AOI: EoAoi = {
  lat: -2.5,
  lng: 35.0,
  label: 'East Africa',
  bbox: [28.0, -12.5, 42.5, 5.5],
};

/** Hard clamp so previews never drift to other continents. */
export function clampAoiToAfrica(aoi: EoAoi): EoAoi {
  const [w, s, e, n] = aoi.bbox;
  // Africa-ish envelope
  const minLon = Math.max(-20, Math.min(w, e));
  const maxLon = Math.min(55, Math.max(w, e));
  const minLat = Math.max(-35, Math.min(s, n));
  const maxLat = Math.min(38, Math.max(s, n));
  // Reject empty / inverted / tiny boxes that snap elsewhere
  if (maxLon - minLon < 0.3 || maxLat - minLat < 0.3) {
    return TZ_NATIONAL_AOI;
  }
  // If centre is outside Africa, force Tanzania
  const clat = (minLat + maxLat) / 2;
  const clng = (minLon + maxLon) / 2;
  if (clng < -20 || clng > 55 || clat < -35 || clat > 38) {
    return TZ_NATIONAL_AOI;
  }
  return {
    lat: clat,
    lng: clng,
    label: aoi.label || 'AOI',
    bbox: [minLon, minLat, maxLon, maxLat],
  };
}

export function snapshotUrl(aoi: EoAoi, product: EoGibsProduct, date: string, w = 240, h = 180): string {
  const fixed = clampAoiToAfrica(aoi);
  const time = clampToProductArchive(date, product);
  const [minLon, minLat, maxLon, maxLat] = fixed.bbox;
  // Worldview Snapshots: BBOX = minLon,minLat,maxLon,maxLat — no AUTOSCALE (avoids wrong zoom-out)
  return 'https://wvs.earthdata.nasa.gov/api/v1/snapshot?'
    + 'REQUEST=GetSnapshot'
    + `&TIME=${encodeURIComponent(time)}`
    + `&BBOX=${minLon.toFixed(4)},${minLat.toFixed(4)},${maxLon.toFixed(4)},${maxLat.toFixed(4)}`
    + '&CRS=EPSG:4326'
    + `&LAYERS=${encodeURIComponent(product.layer)},Coastlines_15m`
    + `&FORMAT=image/jpeg&WIDTH=${w}&HEIGHT=${h}`;
}

/**
 * Multi-year trend sample dates (same calendar day each year) for visual change detection.
 * Uses product archive start … current year.
 */
export function trendYearDates(
  product: EoGibsProduct,
  opts?: { stepYears?: number; month?: number; day?: number; maxFrames?: number },
): string[] {
  const step = opts?.stepYears ?? 5;
  const month = opts?.month ?? 7;
  const day = opts?.day ?? 15;
  const maxFrames = opts?.maxFrames ?? 8;
  const startY = parseInt(product.archiveStart.slice(0, 4), 10);
  const endY = parseInt(eoToday().slice(0, 4), 10);
  const years: number[] = [];
  for (let y = startY; y <= endY; y += step) {
    years.push(y);
  }
  if (years[years.length - 1] !== endY) {
    years.push(endY);
  }
  // Keep last maxFrames
  const sliced = years.length > maxFrames ? years.slice(years.length - maxFrames) : years;
  return sliced.map(y => clampToProductArchive(isoOnYear(y, month, day), product));
}

export function eoExternalLinks(
  aoi: EoAoi,
  date: string,
  product: EoGibsProduct,
  compareDate?: string,
): Array<{ key: string; title: string; url: string; note: string }> {
  const fixed = clampAoiToAfrica(aoi);
  const [minLon, minLat, maxLon, maxLat] = fixed.bbox;
  // Worldview extent: west,south,east,north
  const v = `${minLon},${minLat},${maxLon},${maxLat}`;
  const t = clampToProductArchive(date, product);
  const t2 = clampToProductArchive(compareDate || isoYearsBack(5), product);
  return [
    {
      key: 'worldview',
      title: 'NASA Worldview (timeline)',
      url: `https://worldview.earthdata.nasa.gov/?v=${v}&t=${t}T00:00:00Z&l=${product.layer},Coastlines_15m`,
      note: 'Scrub years on Tanzania frame · animate · download',
    },
    {
      key: 'worldview_compare',
      title: 'Worldview A/B compare',
      url: `https://worldview.earthdata.nasa.gov/?v=${v}&t=${t}T00:00:00Z&l=${product.layer},Coastlines_15m&ca=true&cm=${t2}T00:00:00Z`,
      note: 'Swipe before/after on the same Tanzania extent',
    },
    {
      key: 'copernicus',
      title: 'Copernicus Browser (Sentinel)',
      url: `https://browser.dataspace.copernicus.eu/?lat=${fixed.lat}&lng=${fixed.lng}&zoom=7&fromTime=${t}T00%3A00%3A00.000Z&toTime=${t}T23%3A59%3A59.999Z`,
      note: 'Higher-res Sentinel-2 — external',
    },
    {
      key: 'eo_browser',
      title: 'EO Browser',
      url: `https://apps.sentinel-hub.com/eo-browser/?lat=${fixed.lat}&lng=${fixed.lng}&zoom=7&time=${t}`,
      note: 'Sentinel Hub — may require free login',
    },
  ];
}
