import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { escapeHtml } from '../../core/html';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { addMapNav } from '../../core/tz-map';

declare const L: any;

interface GisPayload {
  stats: { infrastructure: number; riskAssessments: number; incidents: number; warehouses: number };
  infrastructureItems: any[];
  riskAssessments: any[];
  incidents: any[];
  warehouses: any[];
  pastDisasters: any[];
  regionData: Record<string, any>;
}

/** Reproduction of admin/gis_map/index-v2.blade.php — the reference GIS map (blueprint Part 6). */
@Component({
  selector: 'page-gis-map',
  standalone: true,
  imports: [PageHeaderComponent, StatCardComponent],
  styles: [`
    .map-container { position: relative; }
    #gisMap { height: 60vh; min-height: 500px; z-index: 1; }
    .layer-controls { display: flex; flex-wrap: wrap; gap: 0.5rem; padding: 0.85rem 1.15rem; border-top: 1px solid rgba(0,0,0,0.04); }
    .layer-toggle { display: flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.7rem; border-radius: 50px; font-size: 0.68rem; font-weight: 700; cursor: pointer; transition: all 0.2s; border: 2px solid; user-select: none; }
    .layer-toggle input { display: none; }
    .layer-toggle.active { color: #fff; }
    .legend-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.65rem; font-weight: 600; color: var(--text-mid); }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .region-tooltip { background: #fff !important; border: 1px solid rgba(0,0,0,0.1) !important; border-radius: 6px !important; padding: 6px 12px !important; font-size: 12px !important; font-weight: 700 !important; color: var(--primary) !important; box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important; }
    .lake-label { background: transparent !important; border: none !important; box-shadow: none !important; color: #1565C0; font-size: 0.55rem; font-weight: 600; font-style: italic; letter-spacing: 0.5px; text-shadow: 0 1px 2px rgba(255,255,255,0.8); }
    .lake-label::before { display: none !important; }
    .map-back-btn { position: absolute; top: 0.8rem; left: 50%; transform: translateX(-50%); z-index: 500; display: none; align-items: center; gap: 0.35rem; padding: 0.4rem 0.85rem; background: #fff; border-radius: 50px; border: 1px solid rgba(0,51,102,0.18); box-shadow: 0 1px 3px rgba(0,0,0,0.08); cursor: pointer; font-family: 'Inter', sans-serif; font-size: 0.65rem; font-weight: 700; color: var(--primary); }
    .map-back-btn.visible { display: flex; }
    .map-back-btn:hover { background: #fff; }
    .map-back-btn i { font-size: 0.55rem; }
    .map-breadcrumb { position: absolute; top: 2.8rem; left: 0.9rem; z-index: 500; display: none; align-items: center; gap: 0.3rem; padding: 0.3rem 0.65rem; background: #fff; border-radius: 6px; border: 1px solid var(--line, #e2e8f0); box-shadow: 0 1px 3px rgba(0,0,0,0.08); font-size: 0.6rem; font-weight: 600; color: var(--text-mid); }
    .map-breadcrumb.visible { display: flex; }
    .map-breadcrumb .bc-link { color: var(--primary); cursor: pointer; }
    .map-breadcrumb .bc-link:hover { text-decoration: underline; }
    .map-breadcrumb .bc-sep { opacity: 0.4; font-size: 0.4rem; }
    .map-breadcrumb .bc-current { color: var(--text-dark); font-weight: 700; }
    .region-info-panel { position: absolute; bottom: 0.8rem; left: 0.9rem; z-index: 500; width: 240px; background: #fff; border-radius: 6px; border: 1px solid var(--line, #e2e8f0); box-shadow: 0 2px 10px rgba(0,0,0,0.12); opacity: 0; pointer-events: none; transition: opacity 0.2s ease; overflow: hidden; }
    .region-info-panel.visible { opacity: 1; pointer-events: auto; }
    .rip-header { padding: 10px 12px 8px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(0,0,0,0.05); }
    .rip-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .rip-name { font-size: 12px; font-weight: 800; color: #111827; flex: 1; }
    .rip-level { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 7px; border-radius: 4px; }
    .rip-close { width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.04); border: none; cursor: pointer; font-size: 10px; color: #9ca3af; transition: all 0.15s; margin-left: 4px; }
    .rip-close:hover { background: rgba(0,0,0,0.08); color: #111827; }
    .rip-body { padding: 8px 12px 10px; }
    .rip-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
    .rip-row + .rip-row { border-top: 1px solid rgba(0,0,0,0.03); }
    .rip-label { font-size: 10px; color: #6b7280; font-weight: 500; display: flex; align-items: center; gap: 5px; }
    .rip-label i { font-size: 8px; opacity: 0.5; width: 12px; text-align: center; }
    .rip-val { font-size: 11px; font-weight: 700; color: #111827; }
    .rip-bar { height: 4px; border-radius: 2px; background: rgba(0,0,0,0.04); margin-top: 8px; overflow: hidden; }
    .rip-bar-fill { height: 100%; border-radius: 2px; transition: width 0.6s ease; }
    .map-legend { position: absolute; bottom: 0.8rem; right: 0.9rem; z-index: 500; display: flex; flex-direction: column; gap: 0.25rem; background: #fff; border-radius: 6px; border: 1px solid var(--line, #e2e8f0); padding: 0.5rem 0.65rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .map-legend .legend-title { font-size: 0.58rem; font-weight: 700; color: var(--text-dark); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.15rem; }
    .leaflet-container { background: #e8edf2; }
    .leaflet-container path:focus, .leaflet-interactive:focus { outline: none !important; }
    .leaflet-control-attribution { display: none !important; }
    @media (max-width: 575px) { #gisMap { height: 50vh; min-height: 300px; } }
  `],
  template: `
    <dmis-page-header title="Risk Mapping & GIS" icon="fa-map-marked-alt"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Prevention & Mitigation', url:'/m/prevention-mitigation/dashboard'}, {label:'Risk Mapping'}]" />

    <div class="stats-row">
      <dmis-stat-card [value]="stats().infrastructure" label="Infrastructure" icon="fa-building" color="#003366" />
      <dmis-stat-card [value]="stats().riskAssessments" label="Risk Assessments" icon="fa-clipboard-check" color="#FFD700" />
      <dmis-stat-card [value]="stats().incidents" label="Active Incidents" icon="fa-bolt" color="#dc2626" />
      <dmis-stat-card [value]="stats().warehouses" label="Warehouses" icon="fa-warehouse" color="#059669" />
    </div>

    <div class="panel" style="animation-delay:.25s;">
      <div class="panel-head">
        <div class="panel-title"><i class="fas fa-globe-africa"></i> Tanzania Risk Map</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <span class="legend-item"><span class="legend-dot" style="background:#003366;"></span>Infrastructure</span>
          <span class="legend-item"><span class="legend-dot" style="background:#FFD700;"></span>Risk Assessments</span>
          <span class="legend-item"><span class="legend-dot" style="background:#dc2626;"></span>Incidents</span>
          <span class="legend-item"><span class="legend-dot" style="background:#059669;"></span>Warehouses</span>
          <span class="legend-item"><span class="legend-dot" style="background:#004d66;"></span>Past Disasters</span>
        </div>
      </div>
      <div class="map-container">
        <div #gisMap id="gisMap"></div>
        <button class="map-back-btn" [class.visible]="drilled()" (click)="resetToFullMap($event)"><i class="fas fa-arrow-left"></i> Back to Tanzania</button>
        <div class="map-breadcrumb" [class.visible]="drilled()">
          <span class="bc-link" (click)="resetToFullMap($event)">Tanzania</span>
          <i class="fas fa-chevron-right bc-sep"></i>
          <span class="bc-current">{{ currentRegion() }}</span>
        </div>
        <div class="map-legend">
          <div class="legend-title">Risk Level</div>
          <div class="legend-item"><div class="legend-dot" style="background:#dc2626;"></div> High</div>
          <div class="legend-item"><div class="legend-dot" style="background:#f59e0b;"></div> Medium</div>
          <div class="legend-item"><div class="legend-dot" style="background:#10b981;"></div> Low</div>
          <div class="legend-item"><div class="legend-dot" style="background:#3b82f6;"></div> Active</div>
          <div class="legend-item"><div class="legend-dot" style="background:rgba(0,51,102,0.08);border:1px solid rgba(0,51,102,0.2);"></div> No Data</div>
        </div>
        <div class="region-info-panel" [class.visible]="infoVisible()">
          <div class="rip-header">
            <div class="rip-dot" [style.background]="info().color"></div>
            <div class="rip-name">{{ info().name }}</div>
            @if (info().level !== 'None') {
              <span class="rip-level" [style.background]="info().color + '18'" [style.color]="info().color">{{ info().level }}</span>
            }
            <button class="rip-close" (click)="resetToFullMap($event)"><i class="fas fa-times"></i></button>
          </div>
          <div class="rip-body">
            <div class="rip-row"><span class="rip-label"><i class="fas fa-search-location"></i> Risk Assessments</span><span class="rip-val">{{ info().assessments }}</span></div>
            @if (info().assessments > 0) {
              <div class="rip-row"><span class="rip-label"><i class="fas fa-exclamation-triangle"></i> High Risk</span><span class="rip-val" style="color:#dc2626;">{{ info().high }}</span></div>
              <div class="rip-row"><span class="rip-label"><i class="fas fa-exclamation-circle"></i> Medium Risk</span><span class="rip-val" style="color:#f59e0b;">{{ info().medium }}</span></div>
              <div class="rip-row"><span class="rip-label"><i class="fas fa-check-circle"></i> Low Risk</span><span class="rip-val" style="color:#10b981;">{{ info().low }}</span></div>
            }
            <div class="rip-row"><span class="rip-label"><i class="fas fa-shield-alt"></i> Mitigation Measures</span><span class="rip-val">{{ info().measures }}</span></div>
            <div class="rip-bar"><div class="rip-bar-fill" [style.width.%]="info().barPct" [style.background]="info().color"></div></div>
          </div>
        </div>
      </div>
      <div class="layer-controls">
        @for (t of toggles; track t.key) {
          <label class="layer-toggle" [class.active]="layerOn()[t.key]"
                 [style.borderColor]="t.color"
                 [style.background]="layerOn()[t.key] ? t.color : 'transparent'"
                 [style.color]="layerOn()[t.key] ? '#fff' : t.color">
            <input type="checkbox" [checked]="layerOn()[t.key]" (change)="toggleLayer(t.key, $any($event.target).checked)">
            <i class="fas {{ t.icon }}" style="font-size:0.6rem;"></i> {{ t.label }}{{ t.count !== null ? ' (' + t.count + ')' : '' }}
          </label>
        }
      </div>
    </div>
  `,
})
export class GisMapComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  mapEl = viewChild<ElementRef>('gisMap');

  stats = signal({ infrastructure: 0, riskAssessments: 0, incidents: 0, warehouses: 0 });
  data = signal<GisPayload | null>(null);
  drilled = signal(false);
  currentRegion = signal('');
  infoVisible = signal(false);
  info = signal({ name: 'Region', level: 'None', color: '#003366', assessments: 0, high: 0, medium: 0, low: 0, measures: 0, barPct: 0 });
  layerOn = signal<Record<string, boolean>>({ infra: true, risk: true, incidents: true, warehouses: true, pastDisasters: true, choropleth: true, lakes: true });

  toggles: { key: string; label: string; color: string; icon: string; count: number | null }[] = [
    { key: 'infra', label: 'Infrastructure', color: '#003366', icon: 'fa-building', count: 0 },
    { key: 'risk', label: 'Risk Assessments', color: '#FFD700', icon: 'fa-clipboard-check', count: 0 },
    { key: 'incidents', label: 'Incidents', color: '#dc2626', icon: 'fa-bolt', count: 0 },
    { key: 'warehouses', label: 'Warehouses', color: '#059669', icon: 'fa-warehouse', count: 0 },
    { key: 'pastDisasters', label: 'Past Disasters', color: '#004d66', icon: 'fa-history', count: null },
    { key: 'choropleth', label: 'Risk Choropleth', color: '#1565C0', icon: 'fa-map', count: null },
    { key: 'lakes', label: 'Lakes', color: '#2196F3', icon: 'fa-water', count: null },
  ];

  private map: any;
  private layers: Record<string, any> = {};
  private districtLayer: any = null;
  private wardLayer: any = null;
  private activeLayer: any = null;
  private viewReady = false;

  constructor() {
    this.http.get<GisPayload>('/api/v1/gis-map').subscribe(d => {
      this.data.set(d);
      this.stats.set(d.stats);
      this.toggles[0].count = d.stats.infrastructure;
      this.toggles[1].count = d.stats.riskAssessments;
      this.toggles[2].count = d.stats.incidents;
      this.toggles[3].count = d.stats.warehouses;
      this.initMap();
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.initMap();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  toggleLayer(name: string, show: boolean): void {
    this.layerOn.update(s => ({ ...s, [name]: show }));
    if (!this.map || !this.layers[name]) {
      return;
    }
    if (show) {
      this.map.addLayer(this.layers[name]);
    } else {
      this.map.removeLayer(this.layers[name]);
    }
  }

  private regionColor(level: string): string {
    switch (level) {
      case 'High': return '#dc2626';
      case 'Medium': return '#f59e0b';
      case 'Low': return '#10b981';
      case 'Active': return '#3b82f6';
      default: return '#003366';
    }
  }
  private regionOpacity(level: string): number {
    switch (level) {
      case 'High': return 0.35;
      case 'Medium': return 0.25;
      case 'Low': return 0.2;
      case 'Active': return 0.15;
      default: return 0.06;
    }
  }
  private safeName(n: string): string {
    return n.replace(/ /g, '_').replace(/\//g, '_').replace(/'/g, '');
  }
  private makePopup(title: string, sub: string, detail?: string): string {
    return '<div style="font-family:Inter,sans-serif;"><strong style="font-size:0.82rem;">' + escapeHtml(title)
      + '</strong><br><span style="font-size:0.7rem;color:#6b7280;">' + escapeHtml(sub) + '</span>'
      + (detail ? '<br><span style="font-size:0.65rem;font-weight:600;">' + escapeHtml(detail) + '</span>' : '') + '</div>';
  }

  private showRegionInfo(name: string, rd: any): void {
    const level = rd.riskLevel ?? 'None';
    const score = rd.high * 3 + rd.medium * 2 + rd.low;
    this.info.set({
      name, level, color: this.regionColor(level),
      assessments: rd.assessments, high: rd.high, medium: rd.medium, low: rd.low, measures: rd.measures,
      barPct: Math.min((score / 5) * 100, 100),
    });
    this.infoVisible.set(true);
  }

  resetToFullMap(event: Event): void {
    event.stopPropagation();
    this.infoVisible.set(false);
    this.drilled.set(false);
    if (this.activeLayer) {
      const prevName = this.activeLayer.feature.properties.reg_name || '';
      const prevRd = this.data()?.regionData[prevName];
      const prevLevel = prevRd ? prevRd.riskLevel : 'None';
      this.activeLayer.setStyle({ fillColor: this.regionColor(prevLevel), fillOpacity: this.regionOpacity(prevLevel), color: '#1565C0', weight: 1.2, opacity: 0.7 });
      this.activeLayer = null;
    }
    if (this.districtLayer) { this.map.removeLayer(this.districtLayer); this.districtLayer = null; }
    if (this.wardLayer) { this.map.removeLayer(this.wardLayer); this.wardLayer = null; }
    this.currentRegion.set('');
    this.map.flyTo([-6.5, 35.0], 6, { duration: 0.8 });
  }

  private loadDistricts(regionName: string): void {
    if (this.districtLayer) { this.map.removeLayer(this.districtLayer); this.districtLayer = null; }
    if (this.wardLayer) { this.map.removeLayer(this.wardLayer); this.wardLayer = null; }
    fetch('/geojson/adm2_district/by_region/' + this.safeName(regionName) + '.geojson')
      .then(r => r.json())
      .then(data => {
        this.districtLayer = L.geoJSON(data, {
          style: () => ({ fillColor: '#1565C0', fillOpacity: 0.03, color: '#003366', weight: 1, opacity: 0.5, dashArray: '4 3' }),
          onEachFeature: (feature: any, layer: any) => {
            const dName = feature.properties.dist_name || 'District';
            layer.bindTooltip(dName, { className: 'region-tooltip', sticky: true });
            layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.12, weight: 2, opacity: 0.8, dashArray: '' }));
            layer.on('mouseout', () => { if (!layer._selected) layer.setStyle({ fillOpacity: 0.03, weight: 1, opacity: 0.5, dashArray: '4 3' }); });
            layer.on('click', (e: any) => {
              L.DomEvent.stopPropagation(e);
              this.districtLayer.eachLayer((l: any) => { l._selected = false; l.setStyle({ fillOpacity: 0.03, weight: 1, opacity: 0.5, dashArray: '4 3' }); });
              layer._selected = true;
              layer.setStyle({ fillColor: '#1565c0', fillOpacity: 0.15, color: '#1565c0', weight: 2, dashArray: '' });
              this.map.flyToBounds(layer.getBounds(), { padding: [40, 40], duration: 0.8, maxZoom: 11 });
              this.loadWards(regionName, dName);
            });
          },
        }).addTo(this.map);
      }).catch(e => console.warn('District GeoJSON failed:', e));
  }

  private loadWards(regionName: string, districtName: string): void {
    if (this.wardLayer) { this.map.removeLayer(this.wardLayer); this.wardLayer = null; }
    fetch('/geojson/adm3_ward/by_district/' + this.safeName(regionName) + '__' + this.safeName(districtName) + '.geojson')
      .then(r => r.json())
      .then(data => {
        this.wardLayer = L.geoJSON(data, {
          style: () => ({ fillColor: '#1565c0', fillOpacity: 0.03, color: 'rgba(21,101,192,0.35)', weight: 0.6, opacity: 0.5 }),
          onEachFeature: (feature: any, layer: any) => {
            const wName = feature.properties.ward_name || 'Ward';
            layer.bindTooltip(wName, { className: 'region-tooltip', sticky: true });
            layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.15, weight: 1.2, opacity: 0.8 }));
            layer.on('mouseout', () => layer.setStyle({ fillOpacity: 0.03, weight: 0.6, opacity: 0.5 }));
            layer.on('click', (e: any) => {
              L.DomEvent.stopPropagation(e);
              layer.setStyle({ fillColor: '#1565c0', fillOpacity: 0.2, weight: 1.5, opacity: 1 });
              this.map.flyToBounds(layer.getBounds(), { padding: [50, 50], duration: 0.6, maxZoom: 14 });
            });
          },
        }).addTo(this.map);
      }).catch(e => console.warn('Ward GeoJSON failed:', e));
  }

  private initMap(): void {
    const el = this.mapEl()?.nativeElement;
    const d = this.data();
    if (!el || this.map || typeof L === 'undefined' || !this.viewReady || !d) {
      return;
    }
    const tzBounds = L.latLngBounds(L.latLng(-12.0, 29.0), L.latLng(-0.8, 41.0));
    this.map = L.map(el, { maxBounds: tzBounds, maxBoundsViscosity: 1.0, minZoom: 5 }).fitBounds(tzBounds);
    this.map.createPane('maskPane');
    this.map.getPane('maskPane').style.zIndex = 250;
    this.map.getPane('maskPane').style.pointerEvents = 'none';
    this.map.createPane('lakesPane');
    this.map.getPane('lakesPane').style.zIndex = 260;
    this.map.getPane('lakesPane').style.pointerEvents = 'none';
    this.map.createPane('choroplethPane');
    this.map.getPane('choroplethPane').style.zIndex = 270;

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19 }).addTo(this.map);

    addMapNav(this.map, { home: [-6.5, 35.0, 6] });

    fetch('/geojson/tz_boundary_simple.geojson').then(r => r.json()).then(data => {
      const world = [[-90, -180], [90, -180], [90, 180], [-90, 180], [-90, -180]];
      const holes: any[] = [];
      (data.features || [data]).forEach((f: any) => {
        const geom = f.geometry || f;
        if (geom.type === 'MultiPolygon') {
          geom.coordinates.forEach((poly: any) => holes.push(poly[0].map((c: number[]) => [c[1], c[0]])));
        } else if (geom.type === 'Polygon') {
          holes.push(geom.coordinates[0].map((c: number[]) => [c[1], c[0]]));
        }
      });
      L.polygon([world].concat(holes), { fillColor: '#e8edf2', fillOpacity: 1, stroke: false, interactive: false, pane: 'maskPane' }).addTo(this.map);
    });

    this.layers = {
      infra: L.layerGroup().addTo(this.map), risk: L.layerGroup().addTo(this.map),
      incidents: L.layerGroup().addTo(this.map), warehouses: L.layerGroup().addTo(this.map),
      pastDisasters: L.layerGroup().addTo(this.map), choropleth: L.layerGroup().addTo(this.map),
      lakes: L.layerGroup().addTo(this.map),
    };

    fetch('/geojson/tz_lakes.geojson').then(r => r.json()).then(data => {
      L.geoJSON(data, {
        pane: 'lakesPane',
        style: () => ({ fillColor: '#1976D2', fillOpacity: 0.35, color: '#42A5F5', weight: 1, opacity: 0.7 }),
        onEachFeature: (f: any, layer: any) => {
          const name = f.properties.name || '';
          if (name) layer.bindTooltip(name, { permanent: true, direction: 'center', className: 'lake-label', offset: [0, 0] });
        },
      }).addTo(this.layers['lakes']);
    }).catch(() => {});

    const regionData = d.regionData;
    fetch('/geojson/adm1_region/adm1.geojson').then(r => r.json()).then(data => {
      L.geoJSON(data, {
        pane: 'choroplethPane',
        style: () => ({ fillColor: '#003366', fillOpacity: 0, color: '#1565C0', weight: 1.2, opacity: 0 }),
        onEachFeature: (feature: any, layer: any) => {
          const name = feature.properties.reg_name || feature.properties.name || 'Region';
          const rd = regionData[name];
          const targetFillColor = this.regionColor(rd ? rd.riskLevel : 'None');
          const targetOpacity = this.regionOpacity(rd ? rd.riskLevel : 'None');
          let tipText = name;
          if (rd && rd.riskLevel !== 'None') tipText += ' (' + rd.riskLevel + ')';
          layer.bindTooltip(tipText, { className: 'region-tooltip', sticky: false });
          layer.on('mouseover', () => {
            if (this.activeLayer === layer) return;
            layer.setStyle({ fillOpacity: Math.min(targetOpacity + 0.15, 0.5), weight: 2.5, opacity: 1 });
            layer.bringToFront();
          });
          layer.on('mouseout', () => {
            if (this.activeLayer === layer) return;
            layer.setStyle({ fillColor: targetFillColor, fillOpacity: targetOpacity, color: '#1565C0', weight: 1.2, opacity: 0.7 });
          });
          layer.on('click', () => {
            layer.closeTooltip();
            if (this.activeLayer && this.activeLayer !== layer) {
              const prevName = this.activeLayer.feature.properties.reg_name || '';
              const prevRd = regionData[prevName];
              const prevLevel = prevRd ? prevRd.riskLevel : 'None';
              this.activeLayer.setStyle({ fillColor: this.regionColor(prevLevel), fillOpacity: this.regionOpacity(prevLevel), color: '#1565C0', weight: 1.2, opacity: 0.7 });
            }
            this.activeLayer = layer;
            layer.setStyle({ fillOpacity: Math.min(targetOpacity + 0.2, 0.55), weight: 3, color: '#003366', opacity: 1 });
            layer.bringToFront();
            this.map.flyToBounds(layer.getBounds(), { padding: [30, 30], duration: 0.8, maxZoom: 8 });
            this.drilled.set(true);
            this.currentRegion.set(name);
            if (rd) {
              this.showRegionInfo(name, rd);
            }
            this.loadDistricts(name);
          });
          setTimeout(() => {
            layer.setStyle({ fillColor: targetFillColor, fillOpacity: targetOpacity, color: '#1565C0', weight: 1.2, opacity: 0.7 });
          }, 300);
        },
      }).addTo(this.layers['choropleth']);
    });

    d.infrastructureItems.forEach(item => {
      L.circleMarker([item.latitude, item.longitude], { radius: 6, fillColor: '#003366', color: '#fff', weight: 2, fillOpacity: 0.85 })
        .bindPopup(this.makePopup(item.name, item.type, item.status)).addTo(this.layers['infra']);
    });
    const riskColors: Record<string, string> = { Low: '#10b981', Medium: '#f59e0b', High: '#dc2626', Critical: '#111827' };
    d.riskAssessments.forEach(item => {
      L.circleMarker([item.latitude, item.longitude], { radius: 7, fillColor: riskColors[item.risk_level] || '#FFD700', color: '#fff', weight: 2, fillOpacity: 0.85 })
        .bindPopup(this.makePopup(item.assessment_title, item.hazard_name || 'Unknown', 'Risk: ' + (item.risk_level || 'N/A'))).addTo(this.layers['risk']);
    });
    const sevColors: Record<string, string> = { Low: '#f59e0b', Medium: '#f97316', High: '#dc2626', Critical: '#7f1d1d' };
    d.incidents.forEach(item => {
      L.circleMarker([item.latitude, item.longitude], { radius: 8, fillColor: sevColors[item.severity_level] || '#dc2626', color: '#fff', weight: 2, fillOpacity: 0.9 })
        .bindPopup(this.makePopup(item.title, item.hazard_name || 'Incident', item.status + ' | ' + (item.severity_level || ''))).addTo(this.layers['incidents']);
    });
    d.warehouses.forEach(item => {
      L.circleMarker([item.latitude, item.longitude], { radius: 7, fillColor: '#059669', color: '#fff', weight: 2, fillOpacity: 0.85 })
        .bindPopup(this.makePopup(item.name, item.zone || 'Warehouse', item.operational_status)).addTo(this.layers['warehouses']);
    });
    d.pastDisasters.forEach(item => {
      L.circleMarker([item.latitude, item.longitude], { radius: 6, fillColor: '#004d66', color: '#fff', weight: 2, fillOpacity: 0.8 })
        .bindPopup(this.makePopup(item.event_name, item.hazard_name || 'Unknown', item.event_date ? String(item.event_date).substring(0, 10) : '')).addTo(this.layers['pastDisasters']);
    });

    setTimeout(() => this.map.invalidateSize(), 300);
  }
}
