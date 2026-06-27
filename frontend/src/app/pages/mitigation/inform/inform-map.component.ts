import { AfterViewInit, Component, ElementRef, OnDestroy, effect, inject, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DecimalPipe } from '@angular/common';
import { StatCardComponent } from '../../../shell/stat-card.component';
import { addMapNav, addTanzaniaGisBase } from '../../../core/tz-map';
import { escapeHtml } from '../../../core/html';
import { InformService, HazardSignal, RiskRow, SignalsRow } from './inform.service';
import { InformRefreshService } from './inform-refresh.service';

declare const L: any;

const CLASSES = [
  { label: 'Very Low',  max: 2,    color: '#2ECC71' },
  { label: 'Low',       max: 3.5,  color: '#A9DFBF' },
  { label: 'Medium',    max: 5,    color: '#F4D03F' },
  { label: 'High',      max: 6.5,  color: '#E67E22' },
  { label: 'Very High', max: 10.1, color: '#E74C3C' },
];
const NO_DATA = '#cfd6dd';
function riskColor(r: number | null | undefined): string { if (r == null || !isFinite(r)) return NO_DATA; for (const c of CLASSES) if (r <= c.max) return c.color; return CLASSES[4].color; }
function riskLabel(r: number | null | undefined): string { if (r == null || !isFinite(r)) return 'No data yet'; for (const c of CLASSES) if (r <= c.max) return c.label; return 'Very High'; }

const BANDS = [
  { label: 'Low',      max: 2,    color: '#2ECC71' },
  { label: 'Moderate', max: 4,    color: '#F4D03F' },
  { label: 'Elevated', max: 6,    color: '#E67E22' },
  { label: 'High',     max: 8,    color: '#E74C3C' },
  { label: 'Severe',   max: 10.1, color: '#922B21' },
];
function signalColor(s: number | null | undefined): string { if (s == null || !isFinite(s)) return NO_DATA; for (const b of BANDS) if (s <= b.max) return b.color; return BANDS[4].color; }
function reliabilityOpacity(rel: string | undefined): number { return rel === 'High' ? 0.85 : rel === 'Moderate' ? 0.58 : 0.35; }

/** INFORM tab — national council choropleth with the two-product toggle (Strategic composite vs Operational
 *  EO hazard signals, reliability encoded as fill opacity). On polygon click, emits a drill-down request. */
@Component({
  selector: 'page-inform-map',
  standalone: true,
  imports: [StatCardComponent, DecimalPipe],
  styles: [`
    :host { display:block; }
    #informMap { height: 60vh; min-height: 460px; z-index: 1; border-radius: 0 0 8px 8px; }
    .leaflet-container { background:#e8edf2; } .leaflet-control-attribution { display:none !important; }
    .mode-bar { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; padding:.8rem 1.15rem; border-bottom:1px solid rgba(0,0,0,.05); }
    .mode-bar button { font:inherit; font-size:.8rem; font-weight:700; padding:.4rem .9rem; border:1.5px solid var(--module-color,#0d6efd); background:#fff; color:var(--module-color,#0d6efd); border-radius:50px; cursor:pointer; }
    .mode-bar button.on { background:var(--module-color,#0d6efd); color:#fff; }
    .mode-bar select { font:inherit; font-size:.8rem; padding:.35rem .6rem; border:1px solid var(--line,#e2e8f0); border-radius:6px; color:var(--text-mid,#475569); }
    .mode-bar .hint { font-size:.72rem; color:var(--text-mid,#64748b); }
    .legend { background:#fff; padding:.5rem .65rem; border:1px solid var(--line,#e2e8f0); border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,.08); font-size:.65rem; line-height:1.5; }
    .legend strong { font-size:.6rem; text-transform:uppercase; letter-spacing:.5px; color:var(--text-dark,#1e293b); }
    .legend i { display:inline-block; width:11px; height:11px; border-radius:2px; margin-right:5px; vertical-align:middle; }
    .drill { position:absolute; top:12px; right:12px; width:300px; max-height:calc(60vh - 24px); overflow:auto; z-index:600;
      background:#fff; border:1px solid var(--line,#e2e8f0); border-radius:10px; box-shadow:0 4px 18px rgba(0,0,0,.14); padding:.9rem 1rem; }
    .drill-x { position:absolute; top:8px; right:10px; border:none; background:none; font-size:1.3rem; line-height:1; color:#94a3b8; cursor:pointer; }
    .drill-name { font-size:.95rem; font-weight:800; padding-right:1.2rem; }
    .drill-code { font-size:.72rem; color:#94a3b8; font-weight:600; }
    .drill-risk { display:flex; align-items:center; gap:.5rem; margin:.6rem 0 .8rem; }
    .drill-risk-v { font-size:1.2rem; font-weight:900; color:#fff; border-radius:8px; padding:.1rem .6rem; }
    .drill-risk-l { font-size:.78rem; font-weight:700; color:var(--text-mid,#475569); }
    .drill-dim { margin:.35rem 0; }
    .drill-dim-head { display:flex; justify-content:space-between; font-size:.74rem; font-weight:600; }
    .drill-bar { height:6px; border-radius:3px; background:#eef2f7; overflow:hidden; margin-top:.15rem; }
    .drill-bar > div { height:100%; border-radius:3px; }
    .drill-sec { font-size:.66rem; text-transform:uppercase; letter-spacing:.04em; color:#94a3b8; font-weight:800; margin:.9rem 0 .35rem; }
    .drill-comp { display:flex; justify-content:space-between; font-size:.76rem; padding:.18rem 0; border-bottom:1px solid #f1f5f9; }
    .drill-ind { display:flex; justify-content:space-between; font-size:.68rem; color:#64748b; padding:.08rem 0 .08rem .9rem; }
    .drill-ind span:last-child { font-variant-numeric:tabular-nums; }
    .drill-sig { background:#f8fafc; border:1px solid var(--line,#e2e8f0); border-radius:7px; padding:.4rem .55rem; margin-bottom:.4rem; }
    .drill-sig-head { display:flex; justify-content:space-between; font-size:.76rem; font-weight:700; }
    .drill-sig-meta { font-size:.66rem; color:var(--text-mid,#64748b); margin-top:.1rem; }
  `],
  template: `
    <div class="stats-row">
      <dmis-stat-card [value]="total()" label="Councils" icon="fa-map" color="#0d6efd" />
      <dmis-stat-card [value]="withData()" label="Scored" icon="fa-check-circle" color="#059669" />
      <dmis-stat-card [value]="veryHigh()" label="Very High risk" icon="fa-triangle-exclamation" color="#E74C3C" />
      <dmis-stat-card [value]="high()" label="High risk" icon="fa-circle-exclamation" color="#E67E22" />
    </div>
    <div class="panel" style="animation-delay:.2s;">
      <div class="mode-bar">
        <button [class.on]="mode()==='strategic'" (click)="setMode('strategic')">Strategic risk</button>
        <button [class.on]="mode()==='signals'" (click)="setMode('signals')">Hazard signals</button>
        @if (mode()==='signals' && hazards().length) {
          <select (change)="onHazard($event)">@for (h of hazards(); track h) { <option [value]="h" [selected]="h===hazard()">{{ h }}</option> }</select>
        }
        <span class="hint">{{ mode()==='strategic'
            ? 'slow, structural — the validated INFORM composite (Hazard × Vulnerability × Coping)'
            : 'fast, decomposed — Tanzania Earth-observation; informs anticipatory action, not the headline risk. Faded = thinner basket coverage.' }}</span>
        <button (click)="refreshNow()" title="Reload approved data" style="margin-left:auto; font:inherit; font-size:.78rem; font-weight:600; padding:.35rem .8rem; border:1px solid var(--line,#cbd5e1); background:#fff; color:var(--text-mid,#475569); border-radius:6px; cursor:pointer;"><i class="fas fa-rotate"></i> Refresh</button>
      </div>
      <div style="position:relative;">
        <div #mapEl id="informMap"></div>
        @if (selected(); as s) {
          <div class="drill">
            <button class="drill-x" (click)="closeDetail()">×</button>
            <div class="drill-name">{{ s.name }} <span class="drill-code">{{ s.area }}</span></div>
            @if (s.loading) { <div class="muted">Loading…</div> }
            @else if (s.error) { <div class="muted">No data for this council.</div> }
            @else {
              <div class="drill-risk">
                <span class="drill-risk-v" [style.background]="riskCol(s.risk)">{{ s.risk != null ? (s.risk | number:'1.1-1') : '—' }}</span>
                <span class="drill-risk-l">INFORM Risk · {{ riskClass(s.risk) }}</span>
              </div>
              <div class="drill-dims">
                @for (d of [{l:'Hazard & Exposure',v:s.hazard,c:'#e11d48'},{l:'Vulnerability',v:s.vulnerability,c:'#f59e0b'},{l:'Lack of Coping',v:s.coping,c:'#0ea5e9'}]; track d.l) {
                  <div class="drill-dim">
                    <div class="drill-dim-head"><span>{{ d.l }}</span><span>{{ d.v != null ? (d.v | number:'1.1-1') : '—' }}</span></div>
                    <div class="drill-bar"><div [style.width.%]="pct(d.v)" [style.background]="d.c"></div></div>
                  </div>
                }
              </div>
              @if (componentList().length) {
                <div class="drill-sec">Components &amp; indicators</div>
                @for (c of componentList(); track c.name) {
                  <div class="drill-comp"><span><strong>{{ c.name }}</strong></span><span>{{ c.value | number:'1.1-1' }}</span></div>
                  @for (i of componentIndicators(c.name); track i.id) {
                    <div class="drill-ind"><span>{{ i.id }}</span><span>{{ i.score | number:'1.1-1' }}</span></div>
                  }
                }
              }
              @if (selSignals().length) {
                <div class="drill-sec">EO hazard signals</div>
                @for (sg of selSignals(); track sg.component) {
                  <div class="drill-sig">
                    <div class="drill-sig-head"><span>{{ sg.component }}</span><span>{{ sg.status }} ({{ sg.signal | number:'1.1-1' }})</span></div>
                    <div class="drill-sig-meta">{{ sg.reliability }} reliability · {{ sg.coveragePct }}% ({{ sg.membersPresent }}/{{ sg.membersDesigned }})</div>
                  </div>
                }
              }
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class InformMapComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private svc = inject(InformService);
  mapEl = viewChild<ElementRef>('mapEl');

  total = signal(0); withData = signal(0); veryHigh = signal(0); high = signal(0);
  mode = signal<'strategic' | 'signals'>('strategic');
  hazard = signal('Drought'); hazards = signal<string[]>([]);
  selected = signal<any>(null);            // drill-down: clicked council risk detail (incl. categories + per-indicator scores)
  selSignals = signal<any[]>([]);          // its EO hazard signals
  private indByComp = new Map<string, string>();   // indicatorId → component (for the deep drill leaves)

  private map: any; private layer: any; private legend: any; private viewReady = false;
  private riskByCode = new Map<string, number | null>();
  private signalsByCode = new Map<string, HazardSignal[]>();
  private signalsLoaded = false;
  private readonly TZ_BOUNDS = [[-12.0, 28.5], [-0.8, 41.2]];

  private refresh = inject(InformRefreshService);

  constructor() {
    // Re-fetch on first render AND whenever an approval/refresh bumps the shared revision — so the map
    // reflects approved data without a page reload.
    effect(() => { this.refresh.rev(); this.loadRisk(); if (this.signalsLoaded) { this.signalsLoaded = false; this.fetchSignals(); } });
    // indicator → component map (once) so the drill-down can list a component's indicator leaves
    this.svc.getIndicators().subscribe({ next: list => { for (const it of list || []) if (it.component) this.indByComp.set(it.id, it.component); }, error: () => {} });
  }

  private loadRisk(): void {
    this.svc.getRiskAll('council').subscribe({
      next: rows => {
        this.riskByCode.clear();
        let scored = 0, vh = 0, hi = 0;
        for (const r of rows as RiskRow[]) {
          this.riskByCode.set(r.area, r.risk);
          if (r.risk != null && isFinite(r.risk)) { scored++; if (r.risk > 6.5) vh++; else if (r.risk > 5) hi++; }
        }
        this.withData.set(scored); this.veryHigh.set(vh); this.high.set(hi);
        if (this.mode() === 'strategic') this.colourAll();
      },
      error: () => { /* leave grey */ },
    });
  }

  refreshNow(): void { this.refresh.bump(); }

  ngAfterViewInit(): void { this.viewReady = true; this.initMap(); }
  ngOnDestroy(): void { this.map?.remove(); }

  // ---- DRILL-DOWN: click a council → its strategic dimensions + components + EO signals ----
  openDetail(code: string, name: string): void {
    if (!code) return;
    this.selected.set({ area: code, name, loading: true });
    this.selSignals.set([]);
    this.svc.getRisk(code).subscribe({ next: (r: any) => this.selected.set({ ...r, name }), error: () => this.selected.set({ area: code, name, error: true }) });
    this.svc.getSignals(code).subscribe({ next: (s: any) => this.selSignals.set(s?.signals || []), error: () => {} });
  }
  closeDetail(): void { this.selected.set(null); }
  componentList(): { name: string; value: number }[] {
    const c = this.selected()?.components || {};
    return Object.entries(c).map(([name, value]) => ({ name, value: value as number })).sort((a, b) => b.value - a.value);
  }
  /** The per-indicator 0–10 leaves under one component (deep drill). */
  componentIndicators(comp: string): { id: string; score: number }[] {
    const scores = this.selected()?.scores || {};
    const out: { id: string; score: number }[] = [];
    for (const [id, sc] of Object.entries(scores)) if (this.indByComp.get(id) === comp) out.push({ id, score: sc as number });
    return out.sort((a, b) => b.score - a.score);
  }
  riskClass(r: number | null | undefined): string { return riskLabel(r); }
  riskCol(r: number | null | undefined): string { return riskColor(r); }
  pct(v: number | null | undefined): number { return v == null || !isFinite(v) ? 0 : Math.max(0, Math.min(100, v * 10)); }

  private initMap(): void {
    const el = this.mapEl()?.nativeElement;
    if (!el || this.map || typeof L === 'undefined' || !this.viewReady) return;
    this.map = L.map(el, { center: [-6.2, 35.0], zoom: 6, minZoom: 5, maxBounds: this.TZ_BOUNDS, maxBoundsViscosity: 0.8 });
    try { addTanzaniaGisBase(this.map, this.http); } catch { /* base optional */ }
    addMapNav(this.map, { home: [-6.2, 35.0, 6] });
    this.renderLegend(); this.loadCouncils();
    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  private renderLegend(): void {
    if (this.legend) this.map.removeControl(this.legend);
    const signals = this.mode() === 'signals';
    this.legend = L.control({ position: 'bottomright' });
    this.legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'legend');
      let html = `<strong>${signals ? escapeHtml(this.hazard()) + ' signal' : 'INFORM risk'}</strong><br>`;
      for (const c of (signals ? BANDS : CLASSES)) html += `<i style="background:${c.color}"></i>${c.label}<br>`;
      html += `<i style="background:${NO_DATA}"></i>No data<br>`;
      if (signals) html += `<div style="margin-top:.25rem;color:#64748b">opacity = reliability (faint = thin basket)</div>`;
      div.innerHTML = html; return div;
    };
    this.legend.addTo(this.map);
  }

  private loadCouncils(): void {
    this.http.get<any>('/geojson/tz_councils.geojson').subscribe({
      next: gj => {
        this.total.set((gj?.features ?? []).length);
        this.layer = L.geoJSON(gj, {
          style: () => ({ color: '#ffffff', weight: 1, fillColor: NO_DATA, fillOpacity: 0.78 }),
          onEachFeature: (feature: any, lyr: any) => {
            const p = feature.properties || {};
            lyr.bindTooltip(`<strong>${escapeHtml(p.name || p.dist || p.code || 'Council')}</strong><br>loading…`, { sticky: true });
            lyr.on('click', () => this.openDetail(p.code, p.name || p.dist || p.code || 'Council'));
          },
        }).addTo(this.map);
        try { this.map.fitBounds(this.layer.getBounds(), { padding: [10, 10] }); } catch { /* keep view */ }
        this.colourAll();
      },
      error: () => { /* leave empty map */ },
    });
  }

  setMode(m: 'strategic' | 'signals'): void {
    if (this.mode() === m) return;
    this.mode.set(m); this.renderLegend();
    if (m === 'signals' && !this.signalsLoaded) { this.fetchSignals(); return; }
    this.colourAll();
  }
  onHazard(e: Event): void { this.hazard.set((e.target as HTMLSelectElement).value); this.renderLegend(); this.colourAll(); }

  private fetchSignals(): void {
    this.svc.getSignalsAll('council').subscribe({
      next: rows => {
        const seen = new Set<string>();
        for (const row of rows as SignalsRow[]) { this.signalsByCode.set(row.area, row.signals || []); for (const s of row.signals || []) seen.add(s.component); }
        this.hazards.set([...seen].sort());
        if (this.hazards().length && !this.hazards().includes(this.hazard())) this.hazard.set(this.hazards()[0]);
        this.signalsLoaded = true; this.colourAll();
      },
      error: () => { this.signalsLoaded = true; },
    });
  }

  private colourAll(): void {
    if (!this.layer) return;
    const signals = this.mode() === 'signals';
    let withData = 0;
    this.layer.eachLayer((lyr: any) => {
      const p = lyr.feature?.properties || {};
      const code: string = p.code; const name = p.name || p.dist || code || 'Council';
      if (!code) return;
      if (!signals) {
        const risk = this.riskByCode.has(code) ? this.riskByCode.get(code)! : null;
        lyr.setStyle({ fillColor: riskColor(risk), fillOpacity: 0.8 });
        lyr.setTooltipContent(`<strong>${escapeHtml(name)}</strong><br>INFORM risk: ${risk != null ? riskLabel(risk) + ' (' + risk.toFixed(1) + ')' : 'No data yet'}`);
        if (risk != null && isFinite(risk)) withData++;
      } else {
        const sig = (this.signalsByCode.get(code) || []).find(s => s.component === this.hazard());
        if (!sig) { lyr.setStyle({ fillColor: NO_DATA, fillOpacity: 0.5 }); lyr.setTooltipContent(`<strong>${escapeHtml(name)}</strong><br>${escapeHtml(this.hazard())}: no EO signal`); return; }
        lyr.setStyle({ fillColor: signalColor(sig.signal), fillOpacity: reliabilityOpacity(sig.reliability) });
        const top = sig.members.slice(0, 3).map(m => `${escapeHtml(m.name)} ${m.score.toFixed(1)}`).join(', ');
        lyr.setTooltipContent(`<strong>${escapeHtml(name)}</strong> — ${escapeHtml(sig.component)}<br>Signal: <b>${escapeHtml(sig.status)} (${sig.signal.toFixed(1)})</b><br>Reliability: ${escapeHtml(sig.reliability)} — ${sig.coveragePct}% (${sig.membersPresent}/${sig.membersDesigned})<br><span style="color:#64748b">${top}</span>`);
        withData++;
      }
    });
    this.withData.set(signals ? withData : this.withData());
  }
}
