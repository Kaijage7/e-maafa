import { HttpClient } from '@angular/common/http';
import { AGENCIES, alertColor } from './ew-agency.model';

declare const L: any;

/** A reference marker: one region another entity has issued, with that entity's colour/icon + its level. */
export interface RefMarker { name: string; color: string; faIcon: string; entity: string; level?: string; }

const RANK: Record<string, number> = { ADVISORY: 1, WARNING: 2, MAJOR_WARNING: 3 };
const REGION_NAME = (f: any) => { const p = f.properties || {}; return p.Region_Nam ?? p.reg_name ?? p.region ?? p.NAME_1 ?? p.name ?? ''; };

/**
 * Fetch the other entities' latest issued areas as region-level reference markers — so any console can show
 * what everyone else issued (interlinking, like PMO sees all). Entities that report DISTRICTS (e.g. MoW) are
 * mapped up to their parent region so they appear on a region map too.
 */
export function loadCrossAgencyRef(http: HttpClient, allLatest: (ex?: string) => any, exclude: string, done: (m: RefMarker[]) => void): void {
  const build = (d2r: Record<string, string>) => allLatest(exclude).subscribe({
    next: (r: any) => {
      const out: RefMarker[] = [];
      const seen = new Set<string>();
      for (const key of Object.keys(AGENCIES)) {
        if (key === exclude) { continue; }
        const env = r.agencies?.[key];
        if (!env?.available) { continue; }
        const def = (AGENCIES as any)[key];
        const regions = new Set<string>(env.regions ?? []);
        for (const d of (env.districts ?? [])) { const rg = d2r[d]; if (rg) { regions.add(rg); } }
        for (const rn of regions) {
          const k = key + '|' + rn; if (seen.has(k)) { continue; } seen.add(k);
          out.push({ name: rn, color: def.color, faIcon: def.icon, entity: def.name, level: env.top_alert });
        }
      }
      done(out);
    },
    error: () => done([]),
  });
  http.get<any>('/geojson/tz_districts_gadm.geojson').subscribe({
    next: gj => {
      const d2r: Record<string, string> = {};
      for (const f of (gj.features ?? [])) { const p = f.properties || {}; if (p.display_name && p.region) { d2r[p.display_name] = p.region; } }
      build(d2r);
    },
    error: () => build({}),
  });
}

/**
 * Build a reference overlay layerGroup for any Leaflet map: each issued region gets a light, dashed,
 * level-coloured fill + a small ringed entity icon (reads as reference, not the operator's own painting).
 */
export function renderCrossAgencyRef(http: HttpClient, markers: RefMarker[], done: (layer: any) => void): void {
  http.get<any>('/geojson/tz_regions_gis.geojson').subscribe({
    next: gj => {
      const lvlByRegion: Record<string, string> = {};
      for (const m of markers) {
        if (m.level && (!lvlByRegion[m.name] || (RANK[m.level] ?? 0) > (RANK[lvlByRegion[m.name]] ?? 0))) { lvlByRegion[m.name] = m.level; }
      }
      const fills = L.geoJSON(gj, {
        interactive: false,   // reference only — never swallow the operator's paint/select clicks
        style: (f: any) => {
          const lvl = lvlByRegion[REGION_NAME(f)];
          return lvl ? { fillColor: alertColor(lvl), fillOpacity: 0.18, color: alertColor(lvl), weight: 1.3, opacity: 0.85, dashArray: '4' }
                     : { fillOpacity: 0, weight: 0, opacity: 0 };
        },
      });
      const group = L.layerGroup([fills]);
      const byName: Record<string, any> = {};
      fills.eachLayer((l: any) => { byName[REGION_NAME(l.feature)] = l; });
      const placed = new Set<string>();
      for (const m of markers) {
        const ly = byName[m.name]; if (!ly) { continue; }
        const k = m.entity + '|' + m.name; if (placed.has(k)) { continue; } placed.add(k);
        const c = ly.getBounds().getCenter();
        const mk = L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'rp-ref',
          html: '<div style="width:18px;height:18px;border-radius:50%;border:1.5px solid ' + m.color + ';background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 2px rgba(0,0,0,.2)"><i class="fas ' + m.faIcon + '" style="color:' + m.color + ';font-size:8px"></i></div>',
          iconSize: [18, 18], iconAnchor: [9, 9] }) });
        mk.bindTooltip(m.entity + (m.level ? ' · ' + String(m.level).replace('_', ' ') : ''), { sticky: true });
        group.addLayer(mk);
      }
      done(group);
    },
    error: () => done(L.layerGroup()),
  });
}
