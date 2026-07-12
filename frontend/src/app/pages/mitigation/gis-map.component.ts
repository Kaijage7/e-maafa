import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { escapeHtml } from '../../core/html';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { addDmisBaseLayer, addMapNav } from '../../core/tz-map';
import {
  EAST_AFRICA_AOI,
  EO_GIBS_PRODUCTS,
  TZ_NATIONAL_AOI,
  clampAoiToAfrica,
  clampToProductArchive,
  createGibsTileLayer,
  eoExternalLinks,
  eoProductById,
  eoToday,
  ensureGibsPane,
  isoDateOffset,
  isoYearsBack,
  sentinelLinks,
  snapshotUrl,
  type EoAoi,
} from '../../core/eo-gibs';

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
    .layer-toggle { display: flex; align-items: center; gap: 0.35rem; padding: 0.35rem 0.7rem; border-radius: 50px; font-size: 0.75rem; font-weight: 700; cursor: pointer; transition: all 0.2s; border: 2px solid; user-select: none; }
    .layer-toggle input { display: none; }
    .layer-toggle.active { color: #fff; }
    .legend-item { display: flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; font-weight: 600; color: var(--text-mid); }
    .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .region-tooltip { background: #fff !important; border: 1px solid rgba(0,0,0,0.1) !important; border-radius: 6px !important; padding: 6px 12px !important; font-size: 12px !important; font-weight: 700 !important; color: var(--primary) !important; box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important; }
    .lake-label { background: transparent !important; border: none !important; box-shadow: none !important; color: #1565C0; font-size: 0.75rem; font-weight: 600; font-style: italic; letter-spacing: 0.5px; text-shadow: 0 1px 2px rgba(255,255,255,0.8); }
    .lake-label::before { display: none !important; }
    .map-back-btn { position: absolute; top: 0.8rem; left: 50%; transform: translateX(-50%); z-index: 500; display: none; align-items: center; gap: 0.35rem; padding: 0.4rem 0.85rem; background: #fff; border-radius: 8px; border: 1px solid rgba(0,51,102,0.18); box-shadow: 0 1px 3px rgba(0,0,0,0.08); cursor: pointer; font-family: 'Inter', sans-serif; font-size: 0.8rem; font-weight: 700; color: var(--primary); }
    .map-back-btn.visible { display: flex; }
    .map-back-btn:hover { background: #f1f5f9; }
    .map-back-btn i { font-size: 0.7rem; }
    .map-breadcrumb { position: absolute; top: 2.8rem; left: 0.9rem; z-index: 500; display: none; align-items: center; gap: 0.3rem; padding: 0.3rem 0.65rem; background: #fff; border-radius: 6px; border: 1px solid var(--line, #e2e8f0); box-shadow: 0 1px 3px rgba(0,0,0,0.08); font-size: 0.75rem; font-weight: 600; color: var(--text-mid); }
    .map-breadcrumb.visible { display: flex; }
    .map-breadcrumb .bc-link { color: var(--primary); cursor: pointer; }
    .map-breadcrumb .bc-link:hover { text-decoration: underline; }
    .map-breadcrumb .bc-sep { opacity: 0.4; font-size: 0.7rem; }
    .map-breadcrumb .bc-current { color: var(--text-dark); font-weight: 700; }
    .region-info-panel { position: absolute; bottom: 0.8rem; left: 0.9rem; z-index: 500; width: 240px; background: #fff; border-radius: 6px; border: 1px solid var(--line, #e2e8f0); box-shadow: 0 2px 10px rgba(0,0,0,0.12); opacity: 0; pointer-events: none; transition: opacity 0.2s ease; overflow: hidden; }
    .region-info-panel.visible { opacity: 1; pointer-events: auto; }
    .rip-header { padding: 10px 12px 8px; display: flex; align-items: center; gap: 8px; border-bottom: 1px solid rgba(0,0,0,0.05); }
    .rip-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .rip-name { font-size: 13px; font-weight: 800; color: #111827; flex: 1; }
    .rip-level { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 7px; border-radius: 4px; }
    .rip-close { width: 22px; height: 22px; border-radius: 6px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.04); border: none; cursor: pointer; font-size: 12px; color: #9ca3af; transition: all 0.15s; margin-left: 4px; }
    .rip-close:hover { background: rgba(0,0,0,0.08); color: #111827; }
    .rip-body { padding: 8px 12px 10px; }
    .rip-row { display: flex; align-items: center; justify-content: space-between; padding: 4px 0; }
    .rip-row + .rip-row { border-top: 1px solid rgba(0,0,0,0.03); }
    .rip-label { font-size: 12px; color: #6b7280; font-weight: 500; display: flex; align-items: center; gap: 5px; }
    .rip-label i { font-size: 12px; opacity: 0.5; width: 12px; text-align: center; }
    .rip-val { font-size: 12px; font-weight: 700; color: #111827; }
    .rip-bar { height: 4px; border-radius: 2px; background: rgba(0,0,0,0.04); margin-top: 8px; overflow: hidden; }
    .rip-bar-fill { height: 100%; border-radius: 2px; transition: width 0.6s ease; }
    .map-legend { position: absolute; bottom: 0.8rem; right: 0.9rem; z-index: 500; display: flex; flex-direction: column; gap: 0.25rem; background: #fff; border-radius: 6px; border: 1px solid var(--line, #e2e8f0); padding: 0.5rem 0.65rem; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    .map-legend .legend-title { font-size: 0.75rem; font-weight: 700; color: var(--text-dark); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.15rem; }
    .leaflet-container { background: #e8edf2; }
    .leaflet-container path:focus, .leaflet-interactive:focus { outline: none !important; }
    .leaflet-control-attribution { display: none !important; }
    @media (max-width: 575px) { #gisMap { height: 50vh; min-height: 300px; } }
    /* Prevention EO: two-panel exposure compare only (no weather catalogue rows) */
    .eo-hist {
      margin: 0 0 14px; padding: 0; border-radius: 14px; overflow: hidden;
      border: 1px solid #e2e8f0; background: #fff;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
    }
    .eo-bar {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px;
      padding: 12px 14px; background: linear-gradient(180deg, #f8fafc 0%, #fff 100%);
      border-bottom: 1px solid #f1f5f9;
    }
    .eo-bar h3 {
      margin: 0; font-size: 0.92rem; font-weight: 800; color: #0f172a;
      display: flex; align-items: center; gap: 8px; min-width: 160px;
    }
    .eo-bar h3 small { font-size: 0.7rem; font-weight: 600; color: #64748b; }
    .eo-seg {
      display: inline-flex; flex-wrap: wrap; border: 1px solid #e2e8f0; border-radius: 10px;
      overflow: hidden; background: #fff;
    }
    .eo-seg button {
      border: none; border-right: 1px solid #e2e8f0; background: transparent;
      padding: 7px 12px; font: inherit; font-size: 0.74rem; font-weight: 700;
      color: #475569; cursor: pointer; white-space: nowrap;
    }
    .eo-seg button:last-child { border-right: none; }
    .eo-seg button.on { background: #0f766e; color: #fff; }
    .eo-seg.place button.on { background: #1e293b; color: #fff; }
    .eo-seg button:disabled { opacity: 0.4; cursor: default; }
    .eo-bar .spacer { flex: 1; min-width: 8px; }
    .eo-hint {
      margin: 0; padding: 0 14px 10px; font-size: 0.72rem; color: #64748b; line-height: 1.35;
    }
    .eo-hint b { color: #334155; }
    .eo-compare-grid {
      display: grid; grid-template-columns: 1fr auto 1fr; gap: 0; align-items: stretch;
    }
    @media (max-width: 860px) {
      .eo-compare-grid { grid-template-columns: 1fr; }
      .eo-vs { display: none !important; }
    }
    .eo-panel {
      display: flex; flex-direction: column; background: #fff; min-width: 0;
    }
    .eo-panel.a { border-right: 1px solid #f1f5f9; }
    .eo-panel.b { border-left: 1px solid #f1f5f9; }
    @media (max-width: 860px) {
      .eo-panel.a { border-right: none; border-bottom: 1px solid #f1f5f9; }
      .eo-panel.b { border-left: none; }
    }
    .eo-panel.on-map { background: #f0fdfa; }
    .eo-panel .ph {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px;
      padding: 10px 12px 8px;
    }
    .eo-panel .ph .tag {
      font-size: 0.7rem; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase;
      padding: 3px 8px; border-radius: 6px;
    }
    .eo-panel.a .tag { background: #e0f2fe; color: #0369a1; }
    .eo-panel.b .tag { background: #ffedd5; color: #c2410c; }
    .eo-panel .ph input[type="date"] {
      border: 1px solid #cbd5e1; border-radius: 8px; padding: 5px 8px;
      font: inherit; font-size: 0.78rem; font-weight: 700; color: #0f172a; background: #fff;
    }
    .eo-panel .shot {
      position: relative; aspect-ratio: 16/10; background: #0f172a; cursor: pointer; margin: 0 12px;
      border-radius: 10px; overflow: hidden; border: 1px solid #1e293b;
    }
    .eo-panel .shot img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .eo-panel .shot .empty {
      position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
      color: #94a3b8; font-size: 0.78rem; padding: 16px; text-align: center;
    }
    .eo-panel .shot .badge-map {
      position: absolute; top: 8px; left: 8px; background: #0f766e; color: #fff;
      font-size: 0.65rem; font-weight: 800; padding: 3px 7px; border-radius: 5px;
    }
    .eo-panel .pf {
      display: flex; flex-wrap: wrap; gap: 6px; align-items: center; padding: 10px 12px 12px;
    }
    .eo-vs {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 8px; padding: 8px 6px; background: #f8fafc; border-left: 1px solid #f1f5f9; border-right: 1px solid #f1f5f9;
      min-width: 52px;
    }
    .eo-vs .vs {
      width: 36px; height: 36px; border-radius: 50%; background: #0f172a; color: #fff;
      font-size: 0.65rem; font-weight: 800; display: flex; align-items: center; justify-content: center;
    }
    .eo-vs button {
      border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; padding: 5px 7px;
      font: inherit; font-size: 0.65rem; font-weight: 700; color: #475569; cursor: pointer; width: 100%;
    }
    .eo-vs button:hover { border-color: #0f766e; color: #0f766e; }
    .map-btn {
      border: none; border-radius: 8px; padding: 6px 11px; font-size: 0.72rem; font-weight: 700;
      font-family: inherit; cursor: pointer; background: #e2e8f0; color: #334155;
    }
    .map-btn.on { background: #0f766e; color: #fff; }
    .map-btn.ghost { background: transparent; border: 1px solid #e2e8f0; color: #64748b; }
    .eo-foot {
      display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      padding: 10px 14px; border-top: 1px solid #f1f5f9; background: #fafbfc;
    }
    .eo-foot .lbl {
      font-size: 0.65rem; font-weight: 800; letter-spacing: 0.05em; text-transform: uppercase; color: #94a3b8;
    }
    .eo-foot button.tool {
      color: #0f766e; font-weight: 700; font-size: 0.74rem; font-family: inherit; cursor: pointer;
      border: 1px solid #99f6e4; background: #f0fdfa; border-radius: 8px; padding: 5px 10px;
    }
    .eo-foot button.tool:hover { background: #ccfbf1; }
    .eo-foot button.tool.on { background: #0f766e; color: #fff; border-color: #0f766e; }
    .eo-foot .note { font-size: 0.68rem; color: #94a3b8; margin-left: auto; }
    /* In-system EO viewer — never navigates away */
    .eo-modal-bg {
      position: fixed; inset: 0; z-index: 4000; background: rgba(15,23,42,0.72);
      display: flex; align-items: stretch; justify-content: center; padding: 12px;
    }
    .eo-modal {
      width: min(1200px, 100%); background: #0f172a; border-radius: 14px; overflow: hidden;
      display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(0,0,0,0.45);
      max-height: calc(100vh - 24px);
    }
    .eo-modal-head {
      display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
      padding: 12px 16px; background: #1e293b; color: #f8fafc; border-bottom: 1px solid #334155;
    }
    .eo-modal-head b { font-size: 0.95rem; }
    .eo-modal-head .sub { font-size: 0.72rem; color: #94a3b8; font-weight: 600; }
    .eo-modal-head .x {
      margin-left: auto; border: none; background: #334155; color: #fff; border-radius: 8px;
      width: 36px; height: 36px; font-size: 1.2rem; cursor: pointer; line-height: 1;
    }
    .eo-modal-tabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 12px; background: #1e293b; }
    .eo-modal-tabs button {
      border: 1px solid #475569; background: #0f172a; color: #cbd5e1; border-radius: 8px;
      padding: 6px 12px; font: inherit; font-size: 0.74rem; font-weight: 700; cursor: pointer;
    }
    .eo-modal-tabs button.on { background: #0f766e; border-color: #0f766e; color: #fff; }
    .eo-modal-body { flex: 1; min-height: 0; background: #020617; position: relative; overflow: hidden; }
    .eo-modal-body img.full { width: 100%; height: 100%; object-fit: contain; display: block; min-height: 420px; }
    .eo-swipe-wrap { position: relative; width: 100%; height: min(70vh, 640px); background: #020617; overflow: hidden; user-select: none; }
    .eo-swipe-wrap img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .eo-swipe-wrap .after { clip-path: inset(0 0 0 var(--reveal, 50%)); }
    .eo-swipe-wrap .handle {
      position: absolute; top: 0; bottom: 0; width: 3px; background: #f8fafc;
      left: var(--reveal, 50%); transform: translateX(-50%); pointer-events: none;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.4);
    }
    .eo-swipe-wrap .handle::after {
      content: '⟷'; position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
      background: #0f766e; color: #fff; width: 32px; height: 32px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 800;
    }
    .eo-swipe-wrap .lab {
      position: absolute; top: 12px; z-index: 2; background: rgba(15,23,42,0.75); color: #fff;
      font-size: 0.72rem; font-weight: 800; padding: 4px 10px; border-radius: 6px;
    }
    .eo-swipe-wrap .lab.a { left: 12px; }
    .eo-swipe-wrap .lab.b { right: 12px; }
    .eo-swipe-range {
      position: absolute; left: 0; right: 0; bottom: 16px; width: 70%; margin: 0 auto; display: block;
      z-index: 3; accent-color: #0f766e;
    }
    .eo-modal-foot {
      padding: 8px 14px; background: #1e293b; color: #94a3b8; font-size: 0.72rem;
      border-top: 1px solid #334155;
    }
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

    <!-- Two-panel exposure compare: type · place · pick time · Sentinel (not weather) -->
    <div class="eo-hist">
      <div class="eo-bar">
        <h3><i class="fas fa-clone" style="color:#0f766e"></i> Compare <small>{{ currentAoi().label }}</small></h3>
        <div class="eo-seg" title="Exposure / landscape imagery — not weather">
          @for (p of eoProducts; track p.id) {
            <button type="button" [class.on]="eoProduct()===p.id" (click)="setEoProduct(p.id)" [title]="p.hint">{{ p.label }}</button>
          }
        </div>
        <div class="eo-seg place" title="Frame locked to Tanzania / East Africa">
          <button type="button" [class.on]="aoiMode()==='tz'" (click)="setAoiMode('tz')">Tanzania</button>
          <button type="button" [class.on]="aoiMode()==='eaf'" (click)="setAoiMode('eaf')">East Africa</button>
          <button type="button" [class.on]="aoiMode()==='region'" (click)="setAoiMode('region')"
            [disabled]="!currentRegion()">{{ currentRegion() || 'Pick region on map' }}</button>
        </div>
        <span class="spacer"></span>
        @if (eoOnMap()) {
          <button type="button" class="map-btn ghost" (click)="clearEoMap()">Clear map EO</button>
        }
      </div>
      <p class="eo-hint">
        <b>{{ productHint() }}</b>
        · Pick a date on each panel (archive from {{ archiveMin().slice(0, 4) }}).
        Landscape / flood / vegetation exposure — not live weather satellite.
      </p>

      <div class="eo-compare-grid">
        <div class="eo-panel a" [class.on-map]="eoOnMap() && eoActiveSlot()==='A'">
          <div class="ph">
            <span class="tag">A · Before</span>
            <input type="date" [value]="eoDateA()" [min]="archiveMin()" [max]="eoTodayIso"
              (change)="setEoDateA($any($event.target).value)">
          </div>
          <div class="shot" (click)="showEoSlot('A')" title="Show panel A on the risk map">
            @if (eoOnMap() && eoActiveSlot()==='A') { <span class="badge-map">On map</span> }
            @if (shotA()) {
              <img [src]="shotA()!" alt="Before" loading="lazy" (error)="onShotError('A')">
            } @else {
              <div class="empty">No snapshot for this date — try another day or type</div>
            }
          </div>
          <div class="pf">
            <button type="button" class="map-btn" [class.on]="eoOnMap() && eoActiveSlot()==='A'" (click)="showEoSlot('A')">
              {{ eoOnMap() && eoActiveSlot()==='A' ? 'Showing A' : 'Show A on map' }}
            </button>
            <button type="button" class="map-btn ghost" (click)="applyHorizonYears(5)">−5 years</button>
            <button type="button" class="map-btn ghost" (click)="applyHorizonYears(10)">−10 years</button>
            <button type="button" class="map-btn ghost" (click)="applyHorizonYears(20)">−20 years</button>
          </div>
        </div>

        <div class="eo-vs">
          <span class="vs">VS</span>
          <button type="button" (click)="swapEoDates()" title="Swap dates">A ↔ B</button>
          <button type="button" (click)="jumpToArchiveStart()" title="Earliest archive day">{{ archiveMin().slice(0, 4) }}</button>
        </div>

        <div class="eo-panel b" [class.on-map]="eoOnMap() && eoActiveSlot()==='B'">
          <div class="ph">
            <span class="tag">B · After</span>
            <input type="date" [value]="eoDateB()" [min]="archiveMin()" [max]="eoTodayIso"
              (change)="setEoDateB($any($event.target).value)">
          </div>
          <div class="shot" (click)="showEoSlot('B')" title="Show panel B on the risk map">
            @if (eoOnMap() && eoActiveSlot()==='B') { <span class="badge-map">On map</span> }
            @if (shotB()) {
              <img [src]="shotB()!" alt="After" loading="lazy" (error)="onShotError('B')">
            } @else {
              <div class="empty">No snapshot for this date — try another day or type</div>
            }
          </div>
          <div class="pf">
            <button type="button" class="map-btn" [class.on]="eoOnMap() && eoActiveSlot()==='B'" (click)="showEoSlot('B')">
              {{ eoOnMap() && eoActiveSlot()==='B' ? 'Showing B' : 'Show B on map' }}
            </button>
            <button type="button" class="map-btn ghost" (click)="setEoDateB(eoTodayIso)">Today</button>
            <button type="button" class="map-btn ghost" (click)="setRecentDays(30)">−30 days</button>
          </div>
        </div>
      </div>

      <div class="eo-foot">
        <span class="lbl">Sentinel &amp; tools (in-system)</span>
        <button type="button" class="tool" [class.on]="viewerMode()==='s2a'" (click)="openEoViewer('s2a')">Sentinel-2 · A</button>
        <button type="button" class="tool" [class.on]="viewerMode()==='s2b'" (click)="openEoViewer('s2b')">Sentinel-2 · B</button>
        <button type="button" class="tool" [class.on]="viewerMode()==='swipe'" (click)="openEoViewer('swipe')">Worldview swipe</button>
        <span class="note">Opens inside e-MAAFA · NASA GIBS high-detail · human review only</span>
      </div>
    </div>

    @if (viewerOpen()) {
      <div class="eo-modal-bg" (click)="closeEoViewer()">
        <div class="eo-modal" (click)="$event.stopPropagation()" role="dialog" aria-modal="true" [attr.aria-label]="viewerTitle()">
          <div class="eo-modal-head">
            <div>
              <b><i class="fas fa-satellite" style="margin-right:6px;color:#5eead4"></i>{{ viewerTitle() }}</b>
              <div class="sub">{{ currentAoi().label }} · stay in e-MAAFA · {{ eoProductLabel() }}</div>
            </div>
            <button type="button" class="x" (click)="closeEoViewer()" aria-label="Close">×</button>
          </div>
          <div class="eo-modal-tabs">
            <button type="button" [class.on]="viewerMode()==='s2a'" (click)="openEoViewer('s2a')">Detail · date A ({{ eoDateA() }})</button>
            <button type="button" [class.on]="viewerMode()==='s2b'" (click)="openEoViewer('s2b')">Detail · date B ({{ eoDateB() }})</button>
            <button type="button" [class.on]="viewerMode()==='swipe'" (click)="openEoViewer('swipe')">A / B swipe</button>
          </div>
          <div class="eo-modal-body">
            @if (viewerMode() === 'swipe') {
              <div class="eo-swipe-wrap" [style.--reveal.%]="swipeReveal()">
                <span class="lab a">A · {{ eoDateA() }}</span>
                <span class="lab b">B · {{ eoDateB() }}</span>
                @if (viewerShotA()) {
                  <img [src]="viewerShotA()!" alt="Before A" draggable="false">
                }
                @if (viewerShotB()) {
                  <img class="after" [src]="viewerShotB()!" alt="After B" draggable="false">
                }
                <div class="handle"></div>
                <input class="eo-swipe-range" type="range" min="0" max="100" [value]="swipeReveal()"
                  (input)="swipeReveal.set(+$any($event.target).value)">
              </div>
            } @else {
              @if (viewerSingle()) {
                <img class="full" [src]="viewerSingle()!" [alt]="viewerTitle()" (error)="viewerSingle.set(null)">
              } @else {
                <div style="color:#94a3b8;padding:48px;text-align:center;">No snapshot for this date — try another day or product type.</div>
              }
            }
          </div>
          <div class="eo-modal-foot">
            In-system NASA GIBS / Worldview Snapshots for {{ currentAoi().label }}
            (higher-detail true colour when available). External Copernicus login is not required to review dates here.
          </div>
        </div>
      </div>
    }

    <div class="panel" style="animation-delay:.25s;">
      <div class="panel-head">
        <div class="panel-title"><i class="fas fa-globe-africa"></i> Tanzania Risk Map</div>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <span class="legend-item"><span class="legend-dot" style="background:#003366;"></span>Infrastructure</span>
          <span class="legend-item"><span class="legend-dot" style="background:#FFD700;"></span>Risk Assessments</span>
          <span class="legend-item"><span class="legend-dot" style="background:#dc2626;"></span>Incidents</span>
          <span class="legend-item"><span class="legend-dot" style="background:#059669;"></span>Warehouses</span>
          <span class="legend-item"><span class="legend-dot" style="background:#004d66;"></span>Past Disasters</span>
          @if (eoOnMap()) {
            <span class="legend-item"><span class="legend-dot" style="background:#0f766e;"></span>EO {{ eoActiveSlot() }}</span>
          }
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
            <i class="fas {{ t.icon }}" style="font-size:0.75rem;"></i> {{ t.label }}{{ t.count !== null ? ' (' + t.count + ')' : '' }}
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

  eoProducts = EO_GIBS_PRODUCTS;
  eoTodayIso = eoToday();
  /** Default: true colour landscape (not weather). */
  eoProduct = signal('truecolor');
  /** Default A = 15 years back for real trend compare. */
  eoDateA = signal(clampToProductArchive(isoYearsBack(15), eoProductById('truecolor')));
  eoDateB = signal(isoDateOffset(1));
  eoOnMap = signal(false);
  eoActiveSlot = signal<'A' | 'B'>('B');
  shotA = signal<string | null>(null);
  shotB = signal<string | null>(null);
  /** Frame lock: Tanzania | East Africa | map-selected region (clamped to Africa). */
  aoiMode = signal<'tz' | 'eaf' | 'region'>('tz');
  /** In-app EO tool viewer (Sentinel A/B · Worldview swipe) — no navigation away. */
  viewerOpen = signal(false);
  viewerMode = signal<'s2a' | 's2b' | 'swipe' | null>(null);
  viewerSingle = signal<string | null>(null);
  viewerShotA = signal<string | null>(null);
  viewerShotB = signal<string | null>(null);
  swipeReveal = signal(50);

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
  private gibsLayer: any = null;

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
    this.removeGibs();
    if (this.map) {
      this.map.remove();
    }
  }

  archiveMin(): string {
    return eoProductById(this.eoProduct()).archiveStart;
  }

  /** Short operator hint for the selected exposure product (not weather). */
  productHint(): string {
    return eoProductById(this.eoProduct()).hint;
  }

  setRecentDays(days: number): void {
    this.setEoDateB(isoDateOffset(days));
  }

  /** Locked AOI: Tanzania · East Africa · or selected region (clamped inside Africa). */
  currentAoi(): EoAoi {
    const mode = this.aoiMode();
    if (mode === 'eaf') return EAST_AFRICA_AOI;
    if (mode === 'region' && this.currentRegion() && this.activeLayer?.getBounds) {
      try {
        const b = this.activeLayer.getBounds();
        const c = b.getCenter();
        return clampAoiToAfrica({
          lat: c.lat,
          lng: c.lng,
          label: this.currentRegion(),
          bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
        });
      } catch { /* fall through */ }
    }
    return TZ_NATIONAL_AOI;
  }

  setAoiMode(mode: 'tz' | 'eaf' | 'region'): void {
    if (mode === 'region' && !this.currentRegion()) return;
    this.aoiMode.set(mode);
    this.fitMapToAoi();
    this.refreshCompareShots();
  }

  setEoProduct(id: string): void {
    this.eoProduct.set(id);
    const p = eoProductById(id);
    this.eoDateA.set(clampToProductArchive(this.eoDateA(), p));
    this.eoDateB.set(clampToProductArchive(this.eoDateB(), p));
    this.refreshCompareShots();
    if (this.eoOnMap()) this.applyGibs();
  }

  setEoDateA(iso: string): void {
    if (!iso) return;
    this.eoDateA.set(clampToProductArchive(iso, eoProductById(this.eoProduct())));
    this.refreshCompareShots();
    if (this.eoOnMap() && this.eoActiveSlot() === 'A') this.applyGibs();
  }

  setEoDateB(iso: string): void {
    if (!iso) return;
    this.eoDateB.set(clampToProductArchive(iso, eoProductById(this.eoProduct())));
    this.refreshCompareShots();
    if (this.eoOnMap() && this.eoActiveSlot() === 'B') this.applyGibs();
  }

  swapEoDates(): void {
    const a = this.eoDateA();
    this.eoDateA.set(this.eoDateB());
    this.eoDateB.set(a);
    this.refreshCompareShots();
    if (this.eoOnMap()) this.applyGibs();
  }

  applyHorizonYears(years: number): void {
    const p = eoProductById(this.eoProduct());
    this.eoDateA.set(clampToProductArchive(isoYearsBack(years), p));
    this.eoDateB.set(clampToProductArchive(isoDateOffset(1), p));
    this.refreshCompareShots();
    this.showEoSlot('A');
  }

  jumpToArchiveStart(): void {
    const p = eoProductById(this.eoProduct());
    this.eoDateA.set(p.archiveStart);
    this.eoDateB.set(clampToProductArchive(isoDateOffset(1), p));
    this.refreshCompareShots();
    this.showEoSlot('A');
  }

  onShotError(which: 'A' | 'B'): void {
    if (which === 'A') this.shotA.set(null);
    else this.shotB.set(null);
  }

  sentinelLinksList() {
    return sentinelLinks(this.currentAoi(), this.eoDateA(), this.eoDateB());
  }

  eoProductLabel(): string {
    return eoProductById(this.eoProduct()).label;
  }

  viewerTitle(): string {
    switch (this.viewerMode()) {
      case 's2a': return 'Detail view · date A (in-system)';
      case 's2b': return 'Detail view · date B (in-system)';
      case 'swipe': return 'Before / after swipe (in-system)';
      default: return 'EO tools';
    }
  }

  /**
   * Open Sentinel A/B or Worldview swipe inside e-MAAFA using high-res NASA snapshots
   * for the selected AOI and dates — operator never leaves the system.
   */
  openEoViewer(mode: 's2a' | 's2b' | 'swipe'): void {
    const aoi = this.currentAoi();
    // Prefer higher-detail VIIRS when the archive allows; else current exposure product.
    const detail = this.detailProductFor(this.eoDateA());
    const detailB = this.detailProductFor(this.eoDateB());
    const w = 1280;
    const h = 800;
    this.viewerShotA.set(snapshotUrl(aoi, detail, this.eoDateA(), w, h));
    this.viewerShotB.set(snapshotUrl(aoi, detailB, this.eoDateB(), w, h));
    if (mode === 's2a') {
      this.viewerSingle.set(this.viewerShotA());
    } else if (mode === 's2b') {
      this.viewerSingle.set(this.viewerShotB());
    } else {
      this.viewerSingle.set(null);
      this.swipeReveal.set(50);
    }
    this.viewerMode.set(mode);
    this.viewerOpen.set(true);
  }

  closeEoViewer(): void {
    this.viewerOpen.set(false);
    this.viewerMode.set(null);
  }

  /** Higher-detail product for the date when archive allows (VIIRS from 2018). */
  private detailProductFor(date: string) {
    const hi = eoProductById('viirs_hi');
    if (date >= hi.archiveStart) return hi;
    return eoProductById(this.eoProduct());
  }

  showEoSlot(slot: 'A' | 'B'): void {
    this.eoActiveSlot.set(slot);
    this.eoOnMap.set(true);
    this.fitMapToAoi();
    this.applyGibs();
  }

  clearEoMap(): void {
    this.eoOnMap.set(false);
    this.removeGibs();
  }

  refreshCompareShots(): void {
    const aoi = this.currentAoi();
    const p = eoProductById(this.eoProduct());
    this.shotA.set(snapshotUrl(aoi, p, this.eoDateA(), 480, 300));
    this.shotB.set(snapshotUrl(aoi, p, this.eoDateB(), 480, 300));
  }

  externalLinks() {
    return eoExternalLinks(
      this.currentAoi(),
      this.eoDateB(),
      eoProductById(this.eoProduct()),
      this.eoDateA(),
    );
  }

  /** Keep basemap on Tanzania / EA frame so GIBS never “looks like another continent”. */
  private fitMapToAoi(): void {
    if (!this.map || typeof L === 'undefined') return;
    const [w, s, e, n] = this.currentAoi().bbox;
    try {
      this.map.fitBounds([[s, w], [n, e]], { padding: [20, 20], maxZoom: 7 });
    } catch { /* ignore */ }
  }

  private removeGibs(): void {
    if (this.map && this.gibsLayer) {
      try {
        if (this.map.hasLayer(this.gibsLayer)) this.map.removeLayer(this.gibsLayer);
      } catch { /* ignore */ }
    }
    this.gibsLayer = null;
  }

  private applyGibs(): void {
    if (!this.map || typeof L === 'undefined' || !this.eoOnMap()) {
      this.removeGibs();
      return;
    }
    ensureGibsPane(this.map, 'dmisGibsPane', 265);
    const p = eoProductById(this.eoProduct());
    const raw = this.eoActiveSlot() === 'A' ? this.eoDateA() : this.eoDateB();
    const time = clampToProductArchive(raw, p);
    this.removeGibs();
    this.gibsLayer = createGibsTileLayer(p, time, { opacity: 0.82, pane: 'dmisGibsPane' });
    this.gibsLayer.addTo(this.map);
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
    return '<div style="font-family:Inter,sans-serif;"><strong style="font-size:0.9rem;">' + escapeHtml(title)
      + '</strong><br><span style="font-size:0.8rem;color:#6b7280;">' + escapeHtml(sub) + '</span>'
      + (detail ? '<br><span style="font-size:0.8rem;font-weight:600;">' + escapeHtml(detail) + '</span>' : '') + '</div>';
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

    addDmisBaseLayer(this.map, this.http, 'standard');

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
            if (this.aoiMode() === 'region') {
              this.refreshCompareShots();
            }
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
      const evDate = item.event_date ? String(item.event_date).substring(0, 10) : '';
      const m = L.circleMarker([item.latitude, item.longitude], { radius: 6, fillColor: '#004d66', color: '#fff', weight: 2, fillOpacity: 0.8 })
        .bindPopup(this.makePopup(item.event_name, item.hazard_name || 'Unknown', evDate
          + (evDate ? ' · click marker title area then use Historical EO with date A ≈ event' : '')))
        .addTo(this.layers['pastDisasters']);
      m.on('click', () => {
        if (evDate && /^\d{4}-\d{2}-\d{2}$/.test(evDate)) {
          // Align historical EO: A ≈ event day, B ≈ recent — operator evidence for mitigation review
          this.eoDateA.set(evDate);
          this.eoDateB.set(isoDateOffset(1));
          this.refreshCompareShots();
        }
      });
    });

    this.refreshCompareShots();
    setTimeout(() => this.map.invalidateSize(), 300);
  }
}
