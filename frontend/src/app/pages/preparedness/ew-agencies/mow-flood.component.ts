import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgClass } from '@angular/common';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { EwAgencyService } from './ew-agency.service';
import { EwCrossAgencyPanelComponent } from './ew-cross-agency-panel.component';
import { EwPreviewModalComponent } from './ew-preview-modal.component';
import { CATCHMENT_BASINS, BASIN_BY_KEY } from './catchment-basins';
import { ALERT_LEVELS, ALERT_RANK, alertColor, AGENCIES, HAZ_ICON, LIKELIHOOD, IMPACT } from './ew-agency.model';
import { loadCrossAgencyRef, renderCrossAgencyRef, RefMarker } from './cross-agency-ref';

declare const L: any;

interface Assessment {
  basins: string[]; alert_level: string; basinLevels: Record<string, string>; districts: string[];
  description: string; likelihood: string; impact: string; impacts_expected: string;
  drawn_shapes?: any[];
}
interface Day { day_number: number; assessments: Assessment[]; }

/**
 * MoW — Ministry of Water Flood Risk (3-day). DISTINCT from the TMA region map: districts are selected
 * via river BASINS and coloured by their parent-basin alert, with river + lake overlays (native rebuild
 * of mow_page._render_catchment_map; the Python page is untouched). Reads TMA rainfall context, submits
 * to the cross-agency bus so MoW/DMD and everyone else see it.
 */
@Component({
  selector: 'page-mow-flood',
  standalone: true,
  imports: [FormsModule, NgClass, RouterLink, EwCrossAgencyPanelComponent, EwPreviewModalComponent],
  styles: [`
    .wrap { padding: 14px 18px 40px; }
    .hd { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
    .hd .ic { width: 42px; height: 42px; border-radius: 11px; background: #e0f7fa; color: #00838f; display: flex; align-items: center; justify-content: center; font-size: 1.3rem; }
    .hd h1 { font-size: 1.18rem; margin: 0; color: #14303a; } .hd .sub { font-size: 0.78rem; color: #6c757d; }
    .toolbar { display: flex; align-items: center; gap: 10px; margin-left: auto; }
    .btn { font-size: 0.8rem; font-weight: 600; border-radius: 8px; padding: 8px 16px; border: 1px solid transparent; cursor: pointer; font-family: inherit; }
    .btn.primary { background: #00838f; color: #fff; } .btn.primary:disabled { opacity: 0.5; cursor: default; }
    .grid { display: grid; grid-template-columns: 420px 1fr; gap: 14px; align-items: start; }
    @media (max-width: 1100px) { .grid { grid-template-columns: 1fr; } }
    .panel { background: #fff; border: 1px solid #e3e6ed; border-radius: 12px; padding: 12px 14px; }
    .day-tabs { display: flex; gap: 4px; margin-bottom: 10px; }
    .day-tabs button { flex: 1; font-size: 0.78rem; font-weight: 600; color: #607089; border: 1px solid #e3e6ed; background: #f8fafc; padding: 8px; border-radius: 8px; cursor: pointer; font-family: inherit; }
    .day-tabs button.on { background: #00838f; color: #fff; border-color: #00838f; }
    .assess { border: 1px solid #e8ebf0; border-radius: 10px; padding: 10px; margin-bottom: 10px; }
    .assess .ah { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
    .assess .ah b { font-size: 0.8rem; color: #1f2d3d; }
    .x { border: none; background: none; color: #b91c1c; cursor: pointer; font-size: 0.9rem; }
    .lbl { font-size: 0.68rem; font-weight: 700; text-transform: uppercase; color: #94a3b8; margin: 8px 0 4px; letter-spacing: 0.3px; }
    .basin-chips { display: flex; flex-wrap: wrap; gap: 5px; }
    .bchip { font-size: 0.68rem; font-weight: 600; border: 1px solid #cbd5e1; background: #fff; color: #475569; border-radius: 16px; padding: 3px 10px; cursor: pointer; font-family: inherit; }
    .bchip.on { background: #00838f; color: #fff; border-color: #00838f; }
    select, textarea, input { font-size: 0.78rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 8px; font-family: inherit; width: 100%; box-sizing: border-box; }
    textarea { resize: vertical; min-height: 42px; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .dist-list { font-size: 0.7rem; color: #475569; margin-top: 4px; line-height: 1.6; }
    .dchip { display: inline-block; background: #eef2f7; border-radius: 6px; padding: 1px 7px; margin: 2px 3px 0 0; }
    .dchip i { cursor: pointer; color: #94a3b8; margin-left: 4px; }
    .add { font-size: 0.76rem; font-weight: 600; color: #00838f; background: #e0f7fa; border: 1px dashed #00838f; border-radius: 8px; padding: 7px; width: 100%; cursor: pointer; font-family: inherit; }
    .alvl { display: flex; gap: 5px; }
    .alvl button { flex: 1; font-size: 0.68rem; font-weight: 700; border: 1px solid #cbd5e1; background: #fff; border-radius: 7px; padding: 5px; cursor: pointer; font-family: inherit; color: #475569; }
    .alvl button.on { color: #1a1a1a; border-color: #1a1a1a; }
    #mowmap { height: 600px; border-radius: 12px; border: 1px solid #e3e6ed; }
    .legend { display: flex; gap: 14px; margin-top: 8px; font-size: 0.72rem; color: #475569; align-items: center; flex-wrap: wrap; }
    .legend .sw { display: inline-block; width: 13px; height: 13px; border-radius: 3px; margin-right: 4px; vertical-align: -2px; border: 1px solid rgba(0,0,0,0.15); }
    .flash { padding: 8px 12px; border-radius: 8px; font-size: 0.8rem; margin-bottom: 10px; }
    .flash.ok { background: #d1fae5; color: #065f46; } .flash.err { background: #fee2e2; color: #b91c1c; }
    .tma-note { font-size: 0.74rem; color: #0c5460; background: #d1ecf1; border: 1px solid #bee5eb; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; }
  `],
  template: `
    <div class="wrap">
      <a routerLink="/m/preparedness/early-warnings" style="display:inline-flex;align-items:center;gap:6px;font-size:0.76rem;color:#64748b;text-decoration:none;margin-bottom:10px"><i class="fas fa-arrow-left"></i> Early Warning Systems</a>
      <div class="hd">
        <div class="ic"><i class="fas fa-water"></i></div>
        <div>
          <h1>MoW — Flood Risk Assessment</h1>
          <div class="sub">{{ def.fullName }} · {{ def.bulletin }}</div>
        </div>
        <div class="toolbar">
          <button class="btn primary" [disabled]="generating()" (click)="generateWarning()" style="background:#fff;color:#1f2d3d;border:1px solid #cbd5e1;margin-right:8px">
            <i class="fas fa-file-pdf"></i> {{ generating() ? 'Generating…' : 'Generate Warning' }}
          </button>
          <button class="btn primary" [disabled]="submitting()" (click)="pushToEocc()">
            <i class="fas fa-tower-broadcast"></i> {{ submitting() ? 'Pushing…' : 'Push to EOCC' }}
          </button>
        </div>
      </div>

      @if (flash(); as f) { <div class="flash" [ngClass]="f.err ? 'err' : 'ok'">{{ f.msg }}</div> }
      @if (previewUrl()) {
        <ew-preview-modal [title]="def.name + ' — ' + def.bulletin" [url]="previewUrl()!" [rawUrl]="previewRaw()"
          file="mow-bulletin.pdf" (close)="previewUrl.set(null)" (push)="pushFromPreview()"></ew-preview-modal>
      }

      <ew-cross-agency-panel current="mow"></ew-cross-agency-panel>

      @if (tmaNote(); as t) { <div class="tma-note"><i class="fas fa-cloud-showers-heavy"></i> {{ t }}</div> }

      <div class="grid">
        <div class="panel">
          <div class="day-tabs">
            @for (d of days(); track d.day_number) {
              <button [class.on]="activeDay() === d.day_number" (click)="activeDay.set(d.day_number); restyle()">Day {{ d.day_number }}</button>
            }
          </div>

          @for (a of current().assessments; track $index; let i = $index) {
            <div class="assess">
              <div class="ah"><b>Assessment {{ i + 1 }}</b><button class="x" (click)="removeAssessment(i)"><i class="fas fa-trash"></i></button></div>

              <div class="lbl">Active paint level <span style="font-weight:500;text-transform:none;color:#94a3b8">— colours basins you add next; existing keep their own</span></div>
              <div class="alvl">
                @for (lv of levels; track lv.key) {
                  <button [class.on]="a.alert_level === lv.key" [style.background]="a.alert_level === lv.key ? lv.color : '#fff'"
                          (click)="a.alert_level = lv.key; restyle()">{{ lv.label }}</button>
                }
              </div>

              <div class="lbl">Catchment basins</div>
              <div class="basin-chips">
                @for (b of basins; track b.key) {
                  <button class="bchip" [class.on]="a.basins.includes(b.key)"
                          [style.background]="a.basins.includes(b.key) ? alertColor(a.basinLevels?.[b.key] || a.alert_level) : ''"
                          [style.border-color]="a.basins.includes(b.key) ? alertColor(a.basinLevels?.[b.key] || a.alert_level) : ''"
                          (click)="toggleBasin(a, b.key)">{{ b.label }}</button>
                }
              </div>

              @if (a.districts.length) {
                <div class="lbl">Affected districts ({{ a.districts.length }}) — auto from basins, editable</div>
                <div class="dist-list">
                  @for (dn of a.districts; track dn) {
                    <span class="dchip">{{ dn }}<i class="fas fa-times" (click)="removeDistrict(a, dn)"></i></span>
                  }
                </div>
              }

              <div class="lbl">Description</div>
              <textarea [(ngModel)]="a.description" placeholder="Flood situation, river levels, basis…"></textarea>
              <div class="row2" style="margin-top:8px">
                <div><div class="lbl">Likelihood</div>
                  <select [(ngModel)]="a.likelihood">@for (l of likelihood; track l) { <option [value]="l">{{ l }}</option> }</select></div>
                <div><div class="lbl">Impact</div>
                  <select [(ngModel)]="a.impact">@for (l of impact; track l) { <option [value]="l">{{ l }}</option> }</select></div>
              </div>
              <div class="lbl">Impacts expected</div>
              <textarea [(ngModel)]="a.impacts_expected" placeholder="Expected impacts on communities, infrastructure…"></textarea>
            </div>
          }
          <button class="add" (click)="addAssessment()"><i class="fas fa-plus"></i> Add assessment</button>
        </div>

        <div class="panel">
          @if (crossRef().length) {
            <label style="display:flex;align-items:center;gap:6px;font-size:0.74rem;color:#475569;margin-bottom:6px;cursor:pointer">
              <input type="checkbox" [checked]="refOn()" (change)="refOn.set($any($event.target).checked); applyRef()">
              <i class="fas fa-diagram-project" style="color:#94a3b8"></i> Show what other entities issued — reference only
            </label>
          }
          <div id="mowmap"></div>
          <div class="legend">
            <span><i class="fas fa-tint" style="color:#4A90D9"></i> Rivers</span>
            <span><span class="sw" style="background:#B0D4F1"></span>Lakes</span>
            @for (lv of levels; track lv.key) { <span><span class="sw" [style.background]="lv.color"></span>{{ lv.label }}</span> }
            <span><span class="sw" style="background:#F5F5F5"></span>No assessment</span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class MowFloodComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private svc = inject(EwAgencyService);
  private sanitizer = inject(DomSanitizer);
  previewUrl = signal<SafeResourceUrl | null>(null);
  previewRaw = signal<string>('');
  def = AGENCIES['mow'];
  levels = ALERT_LEVELS;
  alertColor = alertColor;
  basins = CATCHMENT_BASINS;
  likelihood = LIKELIHOOD;
  impact = IMPACT;

  days = signal<Day[]>([1, 2, 3].map(n => ({ day_number: n, assessments: [] })));
  activeDay = signal(1);
  submitting = signal(false);
  generating = signal(false);
  flash = signal<{ msg: string; err: boolean } | null>(null);
  tmaNote = signal<string>('');

  private map: any;
  private districtLayer: any;
  private drawnGroup: any;
  private shapeSeq = 0;
  refOn = signal(true);                              // overlay what OTHER entities issued (reference, like PMO)
  crossRef = signal<RefMarker[]>([]);
  private refLayer: any;

  current(): Day { return this.days().find(d => d.day_number === this.activeDay())!; }

  ngOnInit(): void {
    this.seedOne();
    this.loadTmaContext();
    this.loadCrossRef();
    setTimeout(() => this.initMap(), 0);
  }
  ngOnDestroy(): void { if (this.map) { this.map.remove(); this.map = null; } }

  private loadCrossRef(): void {
    loadCrossAgencyRef(this.http, ex => this.svc.allLatest(ex), 'mow', m => { this.crossRef.set(m); this.applyRef(); });
  }
  /** Add / refresh / remove the cross-agency reference overlay on this map. */
  applyRef(): void {
    if (!this.map) { return; }
    if (this.refLayer) { this.map.removeLayer(this.refLayer); this.refLayer = null; }
    if (!this.refOn() || !this.crossRef().length) { return; }
    renderCrossAgencyRef(this.http, this.crossRef(), layer => { this.refLayer = layer; if (this.map && this.refOn()) { layer.addTo(this.map); } });
  }

  private seedOne(): void {
    const d = this.days();
    d[0].assessments.push({ basins: [], alert_level: 'ADVISORY', basinLevels: {}, districts: [], description: '', likelihood: 'MEDIUM', impact: 'MEDIUM', impacts_expected: '', drawn_shapes: [] });
    this.days.set([...d]);
  }

  /** Read TMA's latest rainfall so the analyst can factor it into the flood assessment. */
  private loadTmaContext(): void {
    this.svc.latest('tma').subscribe({
      next: env => {
        if (!env?.available) return;
        const regs = (env.regions ?? []).slice(0, 4).join(', ');
        this.tmaNote.set(`TMA has issued a ${(env.top_alert ?? '').replace('_', ' ')} (${(env.hazard_types ?? []).join(', ')})` +
          (regs ? ` over ${regs}` : '') + ' — factor this rainfall into your basin assessment.');
      },
      error: () => {},
    });
  }

  // ── assessment editing ──
  addAssessment(): void {
    this.current().assessments.push({ basins: [], alert_level: 'ADVISORY', basinLevels: {}, districts: [], description: '', likelihood: 'MEDIUM', impact: 'MEDIUM', impacts_expected: '', drawn_shapes: [] });
    this.days.set([...this.days()]);
  }
  removeAssessment(i: number): void { this.current().assessments.splice(i, 1); this.days.set([...this.days()]); this.restyle(); }
  toggleBasin(a: Assessment, key: string): void {
    a.basinLevels = a.basinLevels ?? {};
    const i = a.basins.indexOf(key);
    if (i >= 0) { a.basins.splice(i, 1); delete a.basinLevels[key]; }
    else { a.basins.push(key); a.basinLevels[key] = a.alert_level; }   // each basin captures the ACTIVE level → keeps its own colour
    a.districts = this.expandDistricts(a.basins);
    this.days.set([...this.days()]); this.restyle();
  }
  removeDistrict(a: Assessment, dn: string): void { a.districts = a.districts.filter(x => x !== dn); this.days.set([...this.days()]); }
  private expandDistricts(basinKeys: string[]): string[] {
    const set = new Set<string>();
    for (const k of basinKeys) for (const d of (BASIN_BY_KEY[k]?.districts ?? [])) set.add(d);
    return [...set].sort();
  }

  /** highest alert per district across the active day's assessments (basin overlap → keep highest). */
  private districtAlerts(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const a of this.current().assessments) {
      for (const bk of a.basins) {
        const lvl = (a.basinLevels?.[bk]) || a.alert_level;
        if (lvl === 'NONE') { continue; }
        for (const dn of (BASIN_BY_KEY[bk]?.districts ?? [])) {
          if ((ALERT_RANK[lvl] ?? 0) > (ALERT_RANK[out[dn]] ?? 0)) { out[dn] = lvl; }
        }
      }
    }
    return out;
  }

  // ── map ──
  private initMap(): void {
    if (typeof L === 'undefined') return;
    this.map = L.map('mowmap', { minZoom: 5, maxZoom: 9, zoomControl: true })
      .setView([-6.4, 35.0], 6);
    this.map.setMaxBounds([[-12.5, 28.0], [1.0, 41.5]]);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
      { attribution: '© OpenStreetMap, © CARTO', subdomains: 'abcd' }).addTo(this.map);
    this.map.createPane('ewshapes'); this.map.getPane('ewshapes').style.zIndex = 550;  // shapes above district fills
    this.drawnGroup = L.featureGroup().addTo(this.map);
    this.initDraw();

    this.map.createPane('rivers'); this.map.getPane('rivers').style.zIndex = 450;
    this.map.createPane('lakes'); this.map.getPane('lakes').style.zIndex = 440;

    this.http.get<any>('/geojson/tz_districts_gadm.geojson').subscribe(gj => {
      this.districtLayer = L.geoJSON(gj, {
        style: (f: any) => this.styleDistrict(f.properties.display_name),
        onEachFeature: (f: any, lyr: any) => {
          const nm = f.properties.display_name;
          lyr.bindTooltip(() => `<b>${nm}</b><br>Alert: ${(this.districtAlerts()[nm] ?? 'None').replace('_', ' ')}`, { sticky: true });
        },
      }).addTo(this.map);
      try { this.map.fitBounds(this.districtLayer.getBounds(), { padding: [8, 8] }); } catch {}
      this.applyRef();
    });
    this.http.get<any>('/geojson/tz_lakes.geojson').subscribe(w =>
      L.geoJSON(w, { pane: 'lakes', style: { fillColor: '#B0D4F1', fillOpacity: 0.6, color: '#7EB8DA', weight: 0.6 } }).addTo(this.map));
    this.http.get<any>('/geojson/tz_rivers.geojson').subscribe(r =>
      L.geoJSON(r, { pane: 'rivers', style: { color: '#4A90D9', weight: 1.4, opacity: 0.85 } }).addTo(this.map));
  }

  private styleDistrict(name: string): any {
    const lvl = this.districtAlerts()[name];
    return { fillColor: alertColor(lvl), fillOpacity: lvl ? 0.78 : 0.25, color: '#5a6b7b', weight: 0.45, opacity: 1 };
  }
  restyle(): void {
    if (this.districtLayer) this.districtLayer.eachLayer((l: any) => l.setStyle(this.styleDistrict(l.feature.properties.display_name)));
    this.renderShapes();
  }

  // ── delineation (draw circles/polygons) — each shape keeps its assessment's colour + the flood icon ──
  private initDraw(): void {
    if (!(L.Control && L.Control.Draw)) return;
    const ctl = new L.Control.Draw({
      position: 'topleft',
      edit: { featureGroup: this.drawnGroup, edit: false, remove: true },
      draw: { polygon: { shapeOptions: { color: '#374151' } }, polyline: { shapeOptions: { color: '#374151' } },
        rectangle: { shapeOptions: { color: '#374151' } }, circle: { shapeOptions: { color: '#374151' } }, marker: false, circlemarker: false },
    });
    this.map.addControl(ctl);
    this.map.on(L.Draw.Event.CREATED, (e: any) => this.onDraw(e));
    this.map.on(L.Draw.Event.DELETED, (e: any) => {
      const ids = new Set<number>(); e.layers.eachLayer((l: any) => { if (l._shapeId) ids.add(l._shapeId); });
      if (ids.size) { for (const a of this.current().assessments) { a.drawn_shapes = (a.drawn_shapes ?? []).filter((s: any) => !ids.has(s.id)); } this.days.set([...this.days()]); this.renderShapes(); }
    });
  }
  private onDraw(e: any): void {
    const target = this.current().assessments.find(a => a.basins.length) ?? this.current().assessments[0];
    if (!target) return;
    const layer = e.layer, type = e.layerType, lvl = target.alert_level;
    let s: any;
    if (type === 'circle') { const c = layer.getLatLng(); s = { id: ++this.shapeSeq, kind: 'circle', level: lvl, radius: Math.round(layer.getRadius()), geojson: { type: 'Feature', properties: { kind: 'circle', radius: Math.round(layer.getRadius()), level: lvl }, geometry: { type: 'Point', coordinates: [c.lng, c.lat] } } }; }
    else { const gj = layer.toGeoJSON(); gj.properties = { ...(gj.properties || {}), kind: type, level: lvl }; s = { id: ++this.shapeSeq, kind: type, level: lvl, geojson: gj }; }
    target.drawn_shapes = [...(target.drawn_shapes ?? []), s];
    this.days.set([...this.days()]); this.renderShapes();
  }
  private renderShapes(): void {
    if (!this.drawnGroup || typeof L === 'undefined') return;
    this.drawnGroup.clearLayers();
    for (const a of this.current().assessments) {
      for (const s of (a.drawn_shapes ?? [])) {
        const col = alertColor(s.level); const style = { color: col, weight: 2, fillColor: col, fillOpacity: 0.45, pane: 'ewshapes' };
        const geom = s.geojson?.geometry; let lyr: any = null;
        if (s.kind === 'circle' && geom?.type === 'Point') { const [lng, lat] = geom.coordinates; lyr = L.circle([lat, lng], { radius: s.radius ?? 10000, ...style }); }
        else if (geom?.type === 'Polygon') { lyr = L.polygon(geom.coordinates.map((r: any[]) => r.map(([lng, lat]: number[]) => [lat, lng])), style); }
        else if (geom?.type === 'LineString') { lyr = L.polyline(geom.coordinates.map(([lng, lat]: number[]) => [lat, lng]), style); }
        if (!lyr) continue; lyr._shapeId = s.id; this.drawnGroup.addLayer(lyr);
        const c = lyr.getBounds ? lyr.getBounds().getCenter() : null;
        if (c) { this.drawnGroup.addLayer(L.marker([c.lat, c.lng], { icon: L.divIcon({ className: 'mow-haz', html: `<div style="width:28px;height:28px;border-radius:50%;border:3px solid ${col};background:#fff;display:flex;align-items:center;justify-content:center"><img src="${HAZ_ICON('floods.png')}" style="width:18px;height:18px"></div>`, iconSize: [28, 28], iconAnchor: [14, 14] }) })); }
      }
    }
  }

  // ── submit ──
  private buildPayload(): any | null {
    // Split each assessment's basins + drawn shapes by their OWN level → one engine item per distinct level,
    // so basins painted at different levels keep their own severity (white / "No alert" is dropped).
    const split = (a: Assessment) => {
      const byLevel = new Map<string, { basins: string[]; shapes: any[] }>();
      const bucket = (lv: string) => { if (!byLevel.has(lv)) { byLevel.set(lv, { basins: [], shapes: [] }); } return byLevel.get(lv)!; };
      for (const bk of (a.basins ?? [])) { const lv = (a.basinLevels?.[bk]) || a.alert_level; if (lv && lv !== 'NONE') { bucket(lv).basins.push(bk); } }
      for (const s of (a.drawn_shapes ?? [])) { const lv = s.level || a.alert_level; if (lv && lv !== 'NONE') { bucket(lv).shapes.push(s.geojson); } }
      return [...byLevel.entries()].map(([lv, g]) => ({
        basins: g.basins, alert_level: lv, districts: this.expandDistricts(g.basins),
        regions: [], description: a.description, likelihood: a.likelihood, impact: a.impact,
        impacts_expected: a.impacts_expected, drawn_shapes: g.shapes,
      }));
    };
    const days = this.days().map(d => ({
      day_number: d.day_number,
      // the Python engine keys each forecast day by `date`; derive it from the issue date + day offset.
      date: new Date(Date.now() + (d.day_number - 1) * 86400000).toISOString().slice(0, 10),
      assessments: d.assessments.flatMap(split),
    }));
    if (!days.some(d => d.assessments.length)) {
      this.flash.set({ msg: 'Add a basin (Advisory/Warning/Major) or draw a delineation first — "No alert" areas are not disseminated.', err: true });
      return null;
    }
    return { source: 'mow', issue_date: new Date().toISOString().slice(0, 10), issue_time: new Date().toTimeString().slice(0, 5), days };
  }

  /** Generate Warning: build the MoW flood-risk PDF via the Python engine, open it, add it to the registry. */
  generateWarning(): void {
    const payload = this.buildPayload(); if (!payload) return;
    this.generating.set(true);
    this.flash.set({ msg: 'Generating the flood-risk bulletin…', err: false });
    this.svc.generate('mow', payload).subscribe({
      next: (blob) => {
        this.generating.set(false);
        const url = URL.createObjectURL(blob);
        this.previewRaw.set(url);
        this.previewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));   // inline preview (no popup blocker)
        this.svc.storeProduct(blob, this.productMeta(payload)).subscribe({ next: () => {}, error: () => {} });
        this.flash.set({ msg: 'Preview ready — review it, edit and regenerate as needed, then push to the EOCC. Saved to Dissemination.', err: false });
      },
      error: () => { this.generating.set(false); this.flash.set({ msg: 'Generation failed — check the inputs / engine.', err: true }); },
    });
  }
  pushFromPreview(): void { this.previewUrl.set(null); this.pushToEocc(); }

  /** Push to EOCC: share with the cross-agency bus → PMO consolidates for Impact Analysis; all entities see it. */
  pushToEocc(): void {
    const payload = this.buildPayload(); if (!payload) return;
    this.submitting.set(true);
    this.svc.submit('mow', payload).subscribe({
      next: (r: any) => { this.submitting.set(false); this.flash.set({ msg: `Pushed to EOCC — ${r.items} flood assessment(s) shared; PMO will consolidate for impact analysis, and all entities can see it.`, err: false }); },
      error: () => { this.submitting.set(false); this.flash.set({ msg: 'Push to EOCC failed.', err: true }); },
    });
  }

  /** Product-registry metadata: top alert + affected districts + a map centroid from the district layer. */
  private productMeta(payload: any): any {
    const assessments = payload.days.flatMap((d: any) => d.assessments ?? []);
    let best = 'ADVISORY';
    for (const a of assessments) { if ((ALERT_RANK[a.alert_level] ?? 0) > (ALERT_RANK[best] ?? 0)) best = a.alert_level; }
    const districts: string[] = [...new Set<string>(assessments.flatMap((a: any) => (a.districts ?? []) as string[]))];
    const c = this.centroidOf(districts);
    return {
      title: `${this.def.name} Flood Risk — ${best.replace('_', ' ')} (${districts.slice(0, 2).join(', ')}${districts.length > 2 ? '…' : ''})`,
      bulletin_type: 'MOW', issue_date: payload.issue_date, issue_time: payload.issue_time,
      severity: best, regions: districts, centroid_lat: c.lat, centroid_lng: c.lng,
      envelope: { agency: 'mow', payload },
    };
  }
  private centroidOf(districts: string[]): { lat: number | null; lng: number | null } {
    if (!this.districtLayer || !districts.length) return { lat: null, lng: null };
    let lat = 0, lng = 0, n = 0;
    this.districtLayer.eachLayer((l: any) => {
      if (districts.includes(l.feature?.properties?.display_name)) { const ce = l.getBounds().getCenter(); lat += ce.lat; lng += ce.lng; n++; }
    });
    return n ? { lat: lat / n, lng: lng / n } : { lat: null, lng: null };
  }
}
