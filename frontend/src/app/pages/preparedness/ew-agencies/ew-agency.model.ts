/**
 * Shared model for the native Early Warning agency screens (distinct-but-interlinked re-platform of the
 * Python agency pages). Every warning entity submits to /api/v1/ew/agency/{agency}/submission; every
 * entity can read each other's latest; PMO-DMD overlays all. The Python authoring pages are untouched —
 * these constants mirror ew/dashboard/config.py so the two stay consistent.
 */

export type AlertLevel = 'ADVISORY' | 'WARNING' | 'MAJOR_WARNING' | 'NONE';

export interface AlertDef { key: AlertLevel; label: string; labelSw: string; color: string; }

/** config.py ALERT_LEVELS + a selectable "No alert" (white) tier so an entity or PMO can paint/draw an
 *  area as cleared / no-alert — selectable in every console's level palette, exactly like the others. */
export const ALERT_LEVELS: AlertDef[] = [
  { key: 'ADVISORY',      label: 'Advisory',      labelSw: 'Angalizo',        color: '#FFFF00' },
  { key: 'WARNING',       label: 'Warning',       labelSw: 'Tahadhari',       color: '#FFA500' },
  { key: 'MAJOR_WARNING', label: 'Major Warning', labelSw: 'Tahadhari Kubwa', color: '#FF0000' },
  { key: 'NONE',          label: 'No alert',      labelSw: 'Hakuna',          color: '#E5E7EB' },
];
export const ALERT_RANK: Record<string, number> = { ADVISORY: 1, WARNING: 2, MAJOR_WARNING: 3 };
export const ALERT_COLOR: Record<string, string> = { ADVISORY: '#FFFF00', WARNING: '#FFA500', MAJOR_WARNING: '#FF0000', NONE: '#E5E7EB' };
export const alertColor = (lvl?: string | null) => ALERT_COLOR[(lvl ?? 'NONE').toUpperCase()] ?? '#F5F5F5';

export type AgencyKey = 'tma' | 'mow' | 'gst' | 'moh' | 'moa' | 'nemc' | 'mlf';

export interface AgencyDef {
  key: AgencyKey;
  name: string;          // short
  fullName: string;
  color: string;         // brand/overlay colour (_AGENCY_OVERLAY_COLORS)
  icon: string;          // font-awesome
  kind: 'days' | 'events';
  dayCount?: number;     // for day-based agencies
  unit: string;          // "Hazard" | "Assessment" | "Event" | "Outbreak"
  bulletin: string;
}

/** Mirrors the agency definitions + _AGENCY_OVERLAY_COLORS in the Python engine. */
export const AGENCIES: Record<AgencyKey, AgencyDef> = {
  tma:  { key: 'tma',  name: 'TMA',  fullName: 'Tanzania Meteorological Authority', color: '#1E88E5', icon: 'fa-cloud-showers-heavy', kind: 'days',   dayCount: 5, unit: 'Hazard',     bulletin: '722E_4 — Five Days Severe Weather Forecast' },
  mow:  { key: 'mow',  name: 'MoW',  fullName: 'Ministry of Water',                 color: '#00ACC1', icon: 'fa-water',             kind: 'days',   dayCount: 3, unit: 'Assessment', bulletin: 'Flood Risk Assessment — 3 Day Forecast' },
  gst:  { key: 'gst',  name: 'GST',  fullName: 'Geological Survey of Tanzania',     color: '#7B1FA2', icon: 'fa-mountain',          kind: 'events',              unit: 'Event',      bulletin: 'Geological Monitoring Bulletin' },
  moh:  { key: 'moh',  name: 'MoH',  fullName: 'Ministry of Health',                color: '#388E3C', icon: 'fa-virus',             kind: 'events',              unit: 'Outbreak',   bulletin: 'Disease Outbreak Report' },
  moa:  { key: 'moa',  name: 'MoA',  fullName: 'Ministry of Agriculture',           color: '#F57C00', icon: 'fa-seedling',          kind: 'events',              unit: 'Assessment', bulletin: 'Drought Monitoring Report' },
  nemc: { key: 'nemc', name: 'NEMC', fullName: 'National Environment Management Council', color: '#D32F2F', icon: 'fa-smog',         kind: 'events',              unit: 'Event',      bulletin: 'Air Quality Bulletin' },
  mlf:  { key: 'mlf',  name: 'MoLF', fullName: 'Ministry of Livestock and Fisheries',     color: '#6D4C41', icon: 'fa-cow',               kind: 'events',              unit: 'Outbreak',   bulletin: 'Livestock & Fisheries Health Report' },
};

/** Hazard types per agency (mirrors config.py HAZARD_TYPES / GST_HAZARD_TYPES / fixed types). icon = ew-icons file. */
export interface HazardDef { key: string; label: string; labelSw: string; icon: string; }
export const AGENCY_HAZARDS: Record<AgencyKey, HazardDef[]> = {
  tma: [
    { key: 'HEAVY_RAIN',          label: 'Heavy Rain',          labelSw: 'Mvua Kubwa',       icon: 'heavy_rain.png' },
    { key: 'LARGE_WAVES',         label: 'Large Waves',         labelSw: 'Mawimbi Makubwa',  icon: 'large_waves.png' },
    { key: 'STRONG_WIND',         label: 'Strong Wind',         labelSw: 'Upepo Mkali',      icon: 'strong_wind.png' },
    { key: 'EXTREME_TEMPERATURE', label: 'Extreme Temperature', labelSw: 'Joto/Baridi Kali', icon: 'extreme_temperature.png' },
  ],
  mow: [ { key: 'FLOODS', label: 'Floods', labelSw: 'Mafuriko', icon: 'floods.png' } ],
  gst: [
    { key: 'EARTHQUAKE', label: 'Earthquake', labelSw: 'Tetemeko la Ardhi',     icon: 'earthquake.png' },
    { key: 'LANDSLIDES', label: 'Landslides', labelSw: 'Maporomoko ya Ardhi',   icon: 'landslides.png' },
    { key: 'VOLCANO',    label: 'Volcano',    labelSw: 'Volkano',               icon: 'volcano.png' },
  ],
  moh:  [ { key: 'DISEASE_OUTBREAK', label: 'Disease Outbreak', labelSw: 'Mlipuko wa Ugonjwa', icon: 'disease_outbreak.png' } ],
  moa:  [ { key: 'DROUGHT',        label: 'Drought',        labelSw: 'Ukame',          icon: 'drought.png' } ],
  nemc: [ { key: 'AIR_POLLUTION',  label: 'Air Pollution',  labelSw: 'Uchafuzi wa Hewa', icon: 'air_pollution.png' } ],
  mlf:  [ { key: 'LIVESTOCK_DISEASE', label: 'Livestock Disease', labelSw: 'Ugonjwa wa Mifugo', icon: 'disease_outbreak.png' },
          { key: 'FISHERIES_HAZARD',  label: 'Fisheries Hazard',  labelSw: 'Hatari ya Uvuvi',  icon: 'large_waves.png' } ],
};

/** MoLF livestock-disease / fisheries conditions (mirrors the MoH disease list pattern). */
export const LIVESTOCK_CONDITIONS = ['Foot and Mouth Disease', 'Anthrax', 'Rift Valley Fever', 'Newcastle Disease',
  'African Swine Fever', 'Lumpy Skin Disease', 'Contagious Bovine Pleuropneumonia', 'Avian Influenza',
  'Fish Kill', 'Harmful Algal Bloom', 'Other'];
export const HAZ_ICON = (file: string) => '/ew-icons/' + (file || 'heavy_rain.png');

/** GST earthquake severity scale (config.py GST_SEVERITY_LEVELS). */
export const GST_SEVERITY = [
  { key: 'MINOR',    label: 'Minor (< 3.0)' },
  { key: 'LIGHT',    label: 'Light (3.0-3.9)' },
  { key: 'MODERATE', label: 'Moderate (4.0-4.9)' },
  { key: 'STRONG',   label: 'Strong (5.0-5.9)' },
  { key: 'MAJOR',    label: 'Major (6.0+)' },
];
export const VOLCANO_INDEX = ['Low', 'Moderate', 'High', 'Very High'];
export const VOLCANO_ACTIVITY = ['Seismic Activity', 'Gas Emission', 'Ash Eruption', 'Lava Flow', 'Lahar', 'Full Eruption'];
export const LANDSLIDE_TRIGGER = ['Heavy Rainfall', 'Earthquake-triggered', 'Slope Saturation', 'Human Activity', 'Volcanic Activity', 'Unknown'];
export const LANDSLIDE_SUSCEPTIBILITY = ['Low', 'Moderate', 'High', 'Very High'];

/** MoH (moh_page DISEASE_TYPES). */
export const DISEASES = ['Cholera', 'Dengue Fever', 'Malaria Surge', 'Rift Valley Fever', 'Plague', 'Ebola', 'Measles', 'COVID-19', 'Typhoid', 'Anthrax', 'Rabies', 'Yellow Fever', 'Other'];
export const TRENDS = ['Increasing', 'Stable', 'Decreasing'];

/** MoA drought enums (moa_page). */
export const DROUGHT_SEVERITY = ['D0 — Abnormally Dry', 'D1 — Moderate Drought', 'D2 — Severe Drought', 'D3 — Extreme Drought', 'D4 — Exceptional Drought'];
export const NDVI_LEVELS = ['Normal', 'Below Normal', 'Poor', 'Very Poor'];
export const AFFECTED_SECTORS = ['Crops', 'Livestock', 'Water Supply', 'Pasture', 'Food Security', 'Fisheries'];
export const REPORT_PERIODS = ['Weekly', 'Bi-weekly', 'Monthly', 'Seasonal'];

/** NEMC air-quality enums (nemc_page). */
export const AQI_LEVELS = [
  { key: 'GOOD',           label: 'Good (0-50)',                              color: '#00E400' },
  { key: 'MODERATE',       label: 'Moderate (51-100)',                        color: '#FFFF00' },
  { key: 'UNHEALTHY_SG',   label: 'Unhealthy for Sensitive Groups (101-150)', color: '#FF7E00' },
  { key: 'UNHEALTHY',      label: 'Unhealthy (151-200)',                      color: '#FF0000' },
  { key: 'VERY_UNHEALTHY', label: 'Very Unhealthy (201-300)',                 color: '#8F3F97' },
  { key: 'HAZARDOUS',      label: 'Hazardous (301+)',                         color: '#7E0023' },
];
export const POLLUTION_SOURCES = ['Industrial Emissions', 'Vehicle Emissions', 'Wildfire Smoke', 'Dust Storm', 'Agricultural Burning', 'Waste Burning', 'Volcanic Ash', 'Other'];
export const POLLUTANTS = ['PM2.5', 'PM10', 'SO2', 'NO2', 'CO', 'O3'];

export const LIKELIHOOD = ['LOW', 'MEDIUM', 'HIGH'];
export const IMPACT = ['LOW', 'MEDIUM', 'HIGH'];

/** Cross-agency envelope returned by the backend. */
export interface AgencyEnvelope {
  agency: string; available: boolean; bridge_ts?: string; issue_date?: string; issue_time?: string;
  report_period?: string; top_alert?: string; item_count?: number;
  regions?: string[]; districts?: string[]; hazard_types?: string[];
  alert_summary?: Record<string, number>; data?: any;
}
