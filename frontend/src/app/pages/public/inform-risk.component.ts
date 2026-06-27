import { AfterViewInit, Component, ElementRef, OnDestroy, effect, inject, input, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { addMapNav, addTanzaniaGisBase } from '../../core/tz-map';
import { escapeHtml } from '../../core/html';
import { PortalLabels } from './portal-i18n';

declare const L: any;

const CLASSES = [
  { label: 'Very Low',  max: 2,    color: '#2ECC71' },
  { label: 'Low',       max: 3.5,  color: '#A9DFBF' },
  { label: 'Medium',    max: 5,    color: '#F4D03F' },
  { label: 'High',      max: 6.5,  color: '#E67E22' },
  { label: 'Very High', max: 10.1, color: '#E74C3C' },
];
const NO_DATA = '#cfd6dd';
function riskColor(r: number | null | undefined) { if (r == null || !isFinite(r)) return NO_DATA; for (const c of CLASSES) if (r <= c.max) return c.color; return CLASSES[4].color; }
function riskLabel(r: number | null | undefined) { if (r == null || !isFinite(r)) return 'No data yet'; for (const c of CLASSES) if (r <= c.max) return c.label; return 'Very High'; }
const BANDS = [
  { label: 'Low', max: 2, color: '#2ECC71' }, { label: 'Moderate', max: 4, color: '#F4D03F' },
  { label: 'Elevated', max: 6, color: '#E67E22' }, { label: 'High', max: 8, color: '#E74C3C' }, { label: 'Severe', max: 10.1, color: '#922B21' },
];
function signalColor(s: number | null | undefined) { if (s == null || !isFinite(s)) return NO_DATA; for (const b of BANDS) if (s <= b.max) return b.color; return BANDS[4].color; }
function reliabilityOpacity(rel: string | undefined) { return rel === 'High' ? 0.85 : rel === 'Moderate' ? 0.58 : 0.35; }

type Tab = 'overview' | 'map' | 'hazard' | 'vulnerability' | 'coping';
interface Row { risk: number | null; hazard: number | null; vulnerability: number | null; coping: number | null; }

/**
 * PUBLIC, citizen-facing INFORM RISK EXPLORER (portal). Read-only. The INFORM Risk view:
 * a national value badge + tabs (Overview, Explore Map, and the three INFORM dimensions Hazard & Exposure /
 * Vulnerability / Lack of Coping Capacity) where the map recolours per dimension; plus the operational EO
 * hazard-signals layer. Served by the unauthenticated /v1/portal/inform endpoint — the public can never edit
 * the model. Bilingual via PortalLabels.
 */
@Component({
  selector: 'public-inform-risk',
  standalone: true,
  imports: [],
  styles: [`
    :host { display:block; }
    .hero { background:linear-gradient(135deg,#0d3b66,#1f6feb); color:#fff; padding:2.2rem 1.4rem; border-radius:0 0 14px 14px; }
    .hero-row { max-width:1200px; margin:0 auto; display:flex; justify-content:space-between; align-items:flex-start; gap:1.5rem; flex-wrap:wrap; }
    .hero .eyebrow { font-size:.72rem; font-weight:800; letter-spacing:.1em; text-transform:uppercase; opacity:.85; }
    .hero h1 { font-size:1.9rem; font-weight:900; margin:.3rem 0 .4rem; }
    .hero p { max-width:680px; opacity:.92; margin:0; font-size:.95rem; }
    .natbadge { text-align:center; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.3); border-radius:14px; padding:.7rem 1.2rem; min-width:130px; }
    .natbadge .v { font-size:2.2rem; font-weight:900; line-height:1; }
    .natbadge .c { font-size:.8rem; font-weight:800; margin:.2rem 0; }
    .natbadge .l { font-size:.62rem; text-transform:uppercase; letter-spacing:.05em; opacity:.85; }
    .wrap { max-width:1200px; margin:0 auto; padding:1.2rem 1rem 2.4rem; }
    .stats { display:flex; gap:1rem; flex-wrap:wrap; margin:-1.6rem auto 1.2rem; max-width:1200px; padding:0 1rem; }
    .stat { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:.8rem 1.1rem; box-shadow:0 2px 8px rgba(0,0,0,.06); min-width:120px; }
    .stat .v { font-size:1.5rem; font-weight:900; color:#0d3b66; }
    .stat .l { font-size:.72rem; color:#64748b; font-weight:700; text-transform:uppercase; }
    .tabbar { display:flex; gap:.25rem; flex-wrap:wrap; border-bottom:2px solid #e2e8f0; margin-bottom:1.1rem; }
    .tabbar button { font:inherit; font-size:.84rem; font-weight:700; padding:.6rem 1.05rem; border:none; background:transparent; color:#64748b; cursor:pointer; border-bottom:3px solid transparent; margin-bottom:-2px; }
    .tabbar button.on { color:#0d3b66; border-bottom-color:#0d3b66; }
    .overview-card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:1.3rem 1.5rem; }
    .overview-card h2 { color:#1f6feb; font-size:1.3rem; font-weight:800; margin:0 0 .6rem; }
    .overview-card p { color:#475569; line-height:1.8; margin:0 0 1rem; }
    .dimgrid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; margin-top:1rem; }
    .dimcard { border:1px solid #e2e8f0; border-top:4px solid; border-radius:10px; padding:.9rem 1rem; }
    .dimcard .n { font-size:.85rem; font-weight:800; color:#1e293b; }
    .dimcard .s { font-size:1.6rem; font-weight:900; }
    .dimcard .d { font-size:.74rem; color:#64748b; margin-top:.3rem; line-height:1.5; }
    .dimdesc { font-size:.85rem; color:#475569; margin:.2rem 0 .8rem; }
    .mode-bar { display:flex; gap:.5rem; align-items:center; flex-wrap:wrap; margin:.4rem 0 .8rem; }
    .mode-bar button { font:inherit; font-size:.82rem; font-weight:700; padding:.45rem 1rem; border:1.5px solid #0d3b66; background:#fff; color:#0d3b66; border-radius:50px; cursor:pointer; }
    .mode-bar button.on { background:#0d3b66; color:#fff; }
    .mode-bar select { font:inherit; font-size:.82rem; padding:.4rem .6rem; border:1px solid #cbd5e1; border-radius:6px; }
    .mode-bar .hint { font-size:.75rem; color:#64748b; }
    #pubInformMap { height:58vh; min-height:440px; border-radius:12px; border:1px solid #e2e8f0; z-index:1; }
    .leaflet-container { background:#e8edf2; } .leaflet-control-attribution { display:none !important; }
    .legend { background:#fff; padding:.5rem .65rem; border:1px solid #e2e8f0; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,.08); font-size:.66rem; line-height:1.5; }
    .legend i { display:inline-block; width:11px; height:11px; border-radius:2px; margin-right:5px; vertical-align:middle; }
    .note { font-size:.75rem; color:#64748b; margin-top:.8rem; }
  `],
  template: `
    @if (!embedded()) {
    <div class="hero">
      <div class="hero-row">
        <div>
          <div class="eyebrow">{{ L.t('inform_eyebrow') }}</div>
          <h1>{{ L.t('inform_national_risk_index') }}</h1>
          <p>{{ L.t('inform_hero_desc') }}</p>
        </div>
        @if (national(); as n) {
          <div class="natbadge" [style.borderColor]="riskCol(n.risk)">
            <div class="v">{{ n.risk != null ? n.risk.toFixed(1) : '—' }}</div>
            <div class="c">{{ riskClass(n.risk) }}</div>
            <div class="l">{{ L.t('inform_national_value_label') }}</div>
          </div>
        }
      </div>
    </div>
    }
    <div class="stats">
      <div class="stat"><div class="v">{{ total() }}</div><div class="l">{{ L.t('inform_councils') }}</div></div>
      <div class="stat"><div class="v">{{ scored() }}</div><div class="l">{{ L.t('inform_scored') }}</div></div>
      <div class="stat"><div class="v">3</div><div class="l">{{ L.t('inform_dimensions') }}</div></div>
      <div class="stat"><div class="v">31</div><div class="l">{{ L.t('inform_regions') }}</div></div>
    </div>
    <div class="wrap">
      <div class="tabbar">
        <button [class.on]="tab()==='overview'" (click)="tab.set('overview')">{{ L.t('inform_tab_overview') }}</button>
        <button [class.on]="tab()==='map'" (click)="tab.set('map')">{{ L.t('inform_tab_map') }}</button>
        <button [class.on]="tab()==='hazard'" (click)="tab.set('hazard')">{{ L.t('inform_dim_hazard') }}</button>
        <button [class.on]="tab()==='vulnerability'" (click)="tab.set('vulnerability')">{{ L.t('inform_dim_vulnerability') }}</button>
        <button [class.on]="tab()==='coping'" (click)="tab.set('coping')">{{ L.t('inform_dim_coping') }}</button>
      </div>

      @if (tab()==='overview') {
        <div class="overview-card">
          <h2>{{ L.t('inform_overview_title') }}</h2>
          <p>{{ L.t('inform_overview_body') }}</p>
          @if (national(); as n) {
            <div class="dimgrid">
              <div class="dimcard" [style.borderTopColor]="riskCol(n.hazard)"><div class="n">{{ L.t('inform_dim_hazard') }}</div><div class="s" [style.color]="riskCol(n.hazard)">{{ fmt(n.hazard) }}</div><div class="d">{{ L.t('inform_dim_hazard_desc') }}</div></div>
              <div class="dimcard" [style.borderTopColor]="riskCol(n.vulnerability)"><div class="n">{{ L.t('inform_dim_vulnerability') }}</div><div class="s" [style.color]="riskCol(n.vulnerability)">{{ fmt(n.vulnerability) }}</div><div class="d">{{ L.t('inform_dim_vulnerability_desc') }}</div></div>
              <div class="dimcard" [style.borderTopColor]="riskCol(n.coping)"><div class="n">{{ L.t('inform_dim_coping') }}</div><div class="s" [style.color]="riskCol(n.coping)">{{ fmt(n.coping) }}</div><div class="d">{{ L.t('inform_dim_coping_desc') }}</div></div>
            </div>
          }
        </div>
      }

      <!-- the map is kept mounted across the map/dimension tabs (hidden under Overview) so Leaflet inits once -->
      <div [style.display]="tab()==='overview' ? 'none' : 'block'">
        @if (tab()==='map') {
          <div class="mode-bar">
            <button [class.on]="mode()==='strategic'" (click)="setMode('strategic')">{{ L.t('inform_strategic_risk') }}</button>
            <button [class.on]="mode()==='signals'" (click)="setMode('signals')">{{ L.t('inform_hazard_signals') }}</button>
            @if (mode()==='signals' && hazards().length) {
              <select (change)="onHazard($event)">@for (h of hazards(); track h) { <option [value]="h" [selected]="h===hazard()">{{ h }}</option> }</select>
            }
            <span class="hint">{{ mode()==='strategic' ? L.t('inform_hint_strategic') : L.t('inform_hint_signals') }}</span>
          </div>
        } @else if (tab()!=='overview') {
          <p class="dimdesc">{{ dimDesc() }}</p>
        }
        <div #mapEl id="pubInformMap"></div>
        <p class="note">{{ L.t('inform_source_note') }}</p>
      </div>
    </div>
  `,
})
export class PublicInformRiskComponent implements AfterViewInit, OnDestroy {
  /** When embedded inside the Portal page, suppress the standalone hero (the portal provides the header). */
  embedded = input(false);
  L = inject(PortalLabels);
  private http = inject(HttpClient);
  mapEl = viewChild<ElementRef>('mapEl');
  total = signal(0); scored = signal(0);
  tab = signal<Tab>('map');   // open on the map so it's visible immediately (Overview is map-less)
  national = signal<Row | null>(null);
  mode = signal<'strategic' | 'signals'>('strategic');
  hazard = signal('Drought'); hazards = signal<string[]>([]);
  private map: any; private layer: any; private legend: any; private viewReady = false;
  private dataByCode = new Map<string, Row>();
  private signalsByCode = new Map<string, any[]>();
  private signalsLoaded = false;
  private readonly TZ_BOUNDS = [[-12.0, 28.5], [-0.8, 41.2]];

  constructor() {
    this.http.get<any[]>('/api/v1/portal/inform/risk?level=council').subscribe({
      next: rows => {
        let n = 0; for (const r of rows || []) { this.dataByCode.set(r.area, r); if (r.risk != null && isFinite(r.risk)) n++; } this.scored.set(n);
        // National headline = the average across the 195 councils (honest, data-driven). The national-level
        // INFORM area row is a sparse-input seed artefact, so we summarise from the subnational model instead.
        const mean = (k: keyof Row) => { const v = (rows || []).map((r: any) => r[k]).filter((x: any) => x != null && isFinite(x)); return v.length ? v.reduce((a: number, b: number) => a + b, 0) / v.length : null; };
        this.national.set({ risk: mean('risk'), hazard: mean('hazard'), vulnerability: mean('vulnerability'), coping: mean('coping') });
        this.colourAll();
      },
      error: () => {},
    });
    // recolour + resize whenever the tab (dimension) changes; RE-FIT bounds when a map tab is revealed,
    // because the map may have been initialised while hidden under Overview (0-size → broken view otherwise).
    effect(() => {
      const t = this.tab(); this.mode(); this.hazard();
      this.renderLegend(); this.colourAll();
      setTimeout(() => {
        if (!this.map) return;
        this.map.invalidateSize();
        if (t !== 'overview' && this.layer) { try { this.map.fitBounds(this.layer.getBounds(), { padding: [10, 10] }); } catch {} }
      }, 130);
    });
  }
  ngAfterViewInit(): void { this.viewReady = true; this.initMap(); }
  ngOnDestroy(): void { this.map?.remove(); }

  private initMap(): void {
    const el = this.mapEl()?.nativeElement;
    if (!el || this.map || typeof L === 'undefined' || !this.viewReady) return;
    this.map = L.map(el, { center: [-6.2, 35.0], zoom: 6, minZoom: 5, maxBounds: this.TZ_BOUNDS, maxBoundsViscosity: 0.8 });
    try { addTanzaniaGisBase(this.map, this.http); } catch {}
    addMapNav(this.map, { home: [-6.2, 35.0, 6] });
    this.renderLegend(); this.loadCouncils();
    setTimeout(() => this.map?.invalidateSize(), 200);
  }
  private legendTitle(): string {
    const t = this.tab();
    if (t === 'map' && this.mode() === 'signals') return escapeHtml(this.hazard()) + ' ' + this.L.t('inform_signal_word');
    if (t === 'hazard') return this.L.t('inform_dim_hazard');
    if (t === 'vulnerability') return this.L.t('inform_dim_vulnerability');
    if (t === 'coping') return this.L.t('inform_dim_coping');
    return this.L.t('inform_legend_inform_risk');
  }
  private renderLegend(): void {
    if (!this.map) return;
    if (this.legend) this.map.removeControl(this.legend);
    const signals = this.tab() === 'map' && this.mode() === 'signals';
    this.legend = L.control({ position: 'bottomright' });
    this.legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'legend');
      let html = `<strong>${this.legendTitle()}</strong><br>`;
      for (const c of (signals ? BANDS : CLASSES)) html += `<i style="background:${c.color}"></i>${c.label}<br>`;
      html += `<i style="background:${NO_DATA}"></i>${this.L.t('inform_no_data')}<br>`;
      div.innerHTML = html; return div;
    };
    this.legend.addTo(this.map);
  }
  private loadCouncils(): void {
    this.http.get<any>('/geojson/tz_councils.geojson').subscribe({
      next: gj => {
        this.total.set((gj?.features ?? []).length);
        this.layer = L.geoJSON(gj, {
          style: () => ({ color: '#fff', weight: 1, fillColor: NO_DATA, fillOpacity: 0.78 }),
          onEachFeature: (f: any, lyr: any) => { const p = f.properties || {}; lyr.bindTooltip(`<strong>${escapeHtml(p.name || p.code || this.L.t('inform_council'))}</strong>`, { sticky: true }); },
        }).addTo(this.map);
        try { this.map.fitBounds(this.layer.getBounds(), { padding: [10, 10] }); } catch {}
        this.colourAll();
      }, error: () => {},
    });
  }
  setMode(m: 'strategic' | 'signals'): void { if (this.mode() === m) return; this.mode.set(m); if (m === 'signals' && !this.signalsLoaded) { this.fetchSignals(); } }
  onHazard(e: Event): void { this.hazard.set((e.target as HTMLSelectElement).value); }
  dimDesc(): string {
    const t = this.tab();
    return t === 'hazard' ? this.L.t('inform_dim_hazard_desc') : t === 'vulnerability' ? this.L.t('inform_dim_vulnerability_desc') : t === 'coping' ? this.L.t('inform_dim_coping_desc') : '';
  }
  riskCol(v: number | null | undefined) { return riskColor(v); }
  riskClass(v: number | null | undefined) { return riskLabel(v); }
  fmt(v: number | null | undefined) { return v == null || !isFinite(v) ? '—' : v.toFixed(1); }

  private fetchSignals(): void {
    this.http.get<any[]>('/api/v1/portal/inform/signals?level=council').subscribe({
      next: rows => { const seen = new Set<string>(); for (const row of rows || []) { this.signalsByCode.set(row.area, row.signals || []); for (const s of row.signals || []) seen.add(s.component); } this.hazards.set([...seen].sort()); if (this.hazards().length && !this.hazards().includes(this.hazard())) this.hazard.set(this.hazards()[0]); this.signalsLoaded = true; this.colourAll(); },
      error: () => { this.signalsLoaded = true; },
    });
  }
  /** Colour the council layer for the active tab: overview/map = overall risk; dimension tabs = that dimension; signals = EO. */
  private colourAll(): void {
    if (!this.layer) return;
    const t = this.tab();
    const signals = t === 'map' && this.mode() === 'signals';
    this.layer.eachLayer((lyr: any) => {
      const p = lyr.feature?.properties || {}; const code = p.code; const name = p.name || code || this.L.t('inform_council');
      if (!code) return;
      if (signals) {
        const sig = (this.signalsByCode.get(code) || []).find((s: any) => s.component === this.hazard());
        if (!sig) { lyr.setStyle({ fillColor: NO_DATA, fillOpacity: 0.5 }); lyr.setTooltipContent(`<strong>${escapeHtml(name)}</strong><br>${escapeHtml(this.hazard())}: ${this.L.t('inform_no_signal')}`); return; }
        lyr.setStyle({ fillColor: signalColor(sig.signal), fillOpacity: reliabilityOpacity(sig.reliability) });
        lyr.setTooltipContent(`<strong>${escapeHtml(name)}</strong> — ${escapeHtml(sig.component)}<br>${this.L.t('inform_tt_signal')} <b>${escapeHtml(sig.status)} (${sig.signal?.toFixed(1)})</b><br>${this.L.t('inform_tt_reliability')} ${escapeHtml(sig.reliability)} — ${sig.coveragePct}%`);
        return;
      }
      const d = this.dataByCode.get(code);
      const val = t === 'hazard' ? d?.hazard : t === 'vulnerability' ? d?.vulnerability : t === 'coping' ? d?.coping : d?.risk;
      lyr.setStyle({ fillColor: riskColor(val), fillOpacity: 0.8 });
      const label = t === 'map' || t === 'overview' ? this.L.t('inform_tt_inform_risk') : this.legendTitle() + ':';
      lyr.setTooltipContent(`<strong>${escapeHtml(name)}</strong><br>${label} ${val != null && isFinite(val) ? riskLabel(val) + ' (' + val.toFixed(1) + ')' : this.L.t('inform_no_data_yet')}`);
    });
  }
}
