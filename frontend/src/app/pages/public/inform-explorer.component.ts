import { AfterViewInit, Component, ElementRef, OnDestroy, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { addMapNav, addTanzaniaGisBase } from '../../core/tz-map';
import { escapeHtml } from '../../core/html';
import { PortalLabels } from './portal-i18n';

declare const L: any;

/* ------------------------------------------------------------------------------------------------
 * INFORM 5-class risk scale — the authoritative Tanzania thresholds and colours.
 * `classifyRisk` returns the first class whose `max` strictly exceeds the score.
 * ---------------------------------------------------------------------------------------------- */
const RISK_CLASSES = [
  { level: 'Very Low',  color: '#2E7D32', max: 2.5,  range: '0.0-2.4' },
  { level: 'Low',       color: '#8BC34A', max: 3.4,  range: '2.5-3.3' },
  { level: 'Medium',    color: '#FFC107', max: 4.3,  range: '3.4-4.2' },
  { level: 'High',      color: '#FF9800', max: 5.9,  range: '4.3-5.8' },
  { level: 'Very High', color: '#D32F2F', max: 10.1, range: '5.9-10.0' },
];
const NO_DATA = '#cbd5e1';
const CLASS_LABELS = RISK_CLASSES.map(c => c.level);
function classifyRisk(score: number | null | undefined) {
  if (score == null || Number.isNaN(score) || !isFinite(score)) return { level: 'No data', color: NO_DATA, range: '-' };
  return RISK_CLASSES.find(c => (score as number) < c.max) || RISK_CLASSES[RISK_CLASSES.length - 1];
}
function round1(v: number | null | undefined): number | null { return v == null || !isFinite(v) ? null : Math.round(v * 10) / 10; }
function fmt(v: number | null | undefined): string { const r = round1(v); return r == null ? '-' : String(r); }
function pct(v: number | null | undefined): string { return `${Math.max(0, Math.min(100, ((v ?? 0) / 10) * 100))}%`; }

// Relative quintile palette for indicator lenses — single-indicator 0-10 distributions are clumpy,
// so we colour by their OWN quintiles to surface real hotspots.
const REL_PAL = ['#2E7D32', '#8BC34A', '#FFC107', '#FF9800', '#D32F2F'];
const REL_LEGEND = ['Lowest', 'Low', 'Medium', 'High', 'Highest'];

type RiskRow = { area: string; name: string; risk: number | null; hazard: number | null; vulnerability: number | null; coping: number | null; value: number | null; region?: string };
type Indicator = { id: string; name: string; owner?: string };
type Cmp = { component: string; indicators: Indicator[] };
type Cat = { category: string; components: Cmp[] };
type Dim = { dimension: string; key: string; categories: Cat[] };

// The lens the explorer colours by. `level` distinguishes overall risk / a whole dimension /
// category / component / single indicator — drives both the label and the /risk?metric= key.
type Lens = { key: string; label: string; level: 'risk' | 'dim' | 'cat' | 'comp' | 'ind'; scope: string };

const DIM_DESC: Record<string, string> = {
  hazard: 'Hazard and Exposure — how likely/intense hazards are and what is exposed.',
  vulnerability: 'Vulnerability — susceptibility of people and systems (poverty, health, vulnerable groups).',
  coping: 'Lack of Coping Capacity — resources and institutions available to cope; higher means fewer.',
};

/**
 * PUBLIC INFORM RISK EXPLORER (portal). Pick a LENS — overall INFORM
 * risk, a whole dimension, or drill into any of that dimension's categories / components / single
 * indicators — to recolour a Tanzania council choropleth + a ranked sortable, class-filterable table.
 * Click a council for its full INFORM profile (3 dimension scores + bar graphs of categories, components
 * and top indicators). Plus a regional profile line and distribution/highest-units bar charts. Every value
 * is fetched live from the read-only /v1/portal/inform endpoints — the public can never edit the model.
 */
@Component({
    selector: 'public-inform-explorer',
    imports: [],
    styles: [`
    :host { display:block; font-family:system-ui, -apple-system, "Segoe UI", sans-serif; color:#1e293b; }
    .wrap { max-width:min(1560px, 94vw); margin:0 auto; padding:1rem; }
    .card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; }
    .pad { padding:1rem 1.2rem; }
    .eyebrow { font-size:.8rem; font-weight:800; letter-spacing:.09em; text-transform:uppercase; color:#64748b; }
    .muted { color:#64748b; }
    .h2 { font-size:1.25rem; font-weight:900; margin:.1rem 0 .2rem; }

    .hero { background:#0d3b66; color:#fff; padding:1.8rem 1.4rem; border-radius:0 0 14px 14px; }
    .hero-row { max-width:min(1560px, 94vw); margin:0 auto; display:flex; justify-content:space-between; align-items:flex-start; gap:1.4rem; flex-wrap:wrap; }
    .hero .eyebrow { color:rgba(255,255,255,.85); }
    .hero h1 { font-size:1.8rem; font-weight:900; margin:.3rem 0 .4rem; }
    .hero p { max-width:680px; opacity:.92; margin:0; font-size:1rem; }
    .natbadge { text-align:center; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.3); border-radius:14px; padding:.7rem 1.2rem; min-width:130px; }
    .natbadge .v { font-size:2.1rem; font-weight:900; line-height:1; }
    .natbadge .b { font-size:.8rem; font-weight:800; margin-top:.35rem; padding:.12rem .5rem; border-radius:50px; display:inline-block; color:#fff; }

    .stats { display:flex; gap:1rem; flex-wrap:wrap; margin:-1.4rem auto 1rem; max-width:min(1560px, 94vw); padding:0 1rem; }
    .stat { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:.7rem 1rem; box-shadow:0 2px 8px rgba(0,0,0,.06); min-width:108px; }
    .stat .v { font-size:1.7rem; font-weight:900; color:#0d3b66; }
    .stat .l { font-size:.8rem; color:#64748b; font-weight:700; text-transform:uppercase; }

    .controls { margin-bottom:1rem; }
    .ctl-row { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; margin-bottom:.7rem; }
    .chips { display:flex; gap:.4rem; flex-wrap:wrap; }
    .chip { font:inherit; font-size:.9rem; font-weight:700; padding:.45rem .95rem; border-radius:50px; border:1.5px solid #cbd5e1; background:#fff; color:#475569; cursor:pointer; }
    .chip.on { background:#0d3b66; color:#fff; border-color:#0d3b66; }

    .indi { margin-top:.4rem; border-top:1px dashed #e2e8f0; padding-top:.7rem; }
    .indi-top { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; margin-bottom:.5rem; }
    .indi select { font:inherit; font-size:1rem; padding:.4rem .55rem; border:1px solid #cbd5e1; border-radius:6px; max-width:380px; }
    .crumb { display:flex; flex-wrap:wrap; align-items:center; gap:.35rem; font-size:.82rem; margin:.2rem 0 .55rem; }
    .crumb button { font:inherit; font-size:.82rem; font-weight:700; border:none; background:transparent; color:#0369a1; cursor:pointer; padding:0; }
    .crumb button:hover { text-decoration:underline; }
    .crumb .sep { color:#94a3b8; }
    .crumb .here { font-weight:800; color:#0f172a; }
    .drill-tools { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; margin-bottom:.55rem; }
    .drill-tools input[type=search] { flex:1; min-width:180px; font:inherit; font-size:.9rem; padding:.4rem .65rem; border:1px solid #cbd5e1; border-radius:8px; }
    .cat-block { border:1px solid #e2e8f0; border-radius:10px; margin-bottom:.5rem; overflow:hidden; background:#fff; }
    .cat-head { width:100%; display:flex; justify-content:space-between; align-items:center; gap:.6rem; text-align:left;
      font:inherit; font-size:.84rem; font-weight:800; padding:.55rem .75rem; border:none; background:#f8fafc; color:#0d3b66; cursor:pointer; }
    .cat-head:hover { background:#f1f5f9; }
    .cat-head.on-cat { background:#e0f2fe; }
    .cat-body { padding:.35rem .65rem .65rem; border-top:1px solid #e2e8f0; max-height:280px; overflow:auto; }
    .comp-block { margin:.35rem 0; }
    .comp-head { width:100%; display:flex; justify-content:space-between; align-items:center; gap:.4rem; text-align:left;
      font:inherit; font-size:.8rem; font-weight:700; padding:.35rem .45rem; border:1px solid transparent; border-radius:7px; background:transparent; color:#334155; cursor:pointer; }
    .comp-head:hover { background:#f8fafc; }
    .comp-head.on-comp { background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; }
    .ind-list { display:flex; flex-direction:column; gap:2px; margin:.2rem 0 .35rem .55rem; padding-left:.45rem; border-left:2px solid #e2e8f0; }
    .ind-row { display:flex; justify-content:space-between; align-items:center; gap:.5rem; width:100%; text-align:left;
      font:inherit; font-size:.8rem; font-weight:600; padding:.32rem .45rem; border:1px solid transparent; border-radius:6px; background:transparent; color:#475569; cursor:pointer; }
    .ind-row:hover { background:#f8fafc; border-color:#e2e8f0; }
    .ind-row.on { background:#1f6feb; color:#fff; border-color:#1f6feb; }
    .ind-row .own { opacity:.75; font-weight:500; font-size:.72rem; }
    .ind-row .id { font-size:.68rem; opacity:.7; font-family:ui-monospace,monospace; }
    .map-status { position:absolute; top:10px; left:10px; z-index:500; background:rgba(15,23,42,.88); color:#fff; font-size:.75rem; font-weight:700;
      padding:.28rem .55rem; border-radius:6px; pointer-events:none; }

    .catbar { display:flex; flex-direction:row; gap:.4rem .5rem; align-items:center; flex-wrap:wrap; margin-bottom:.9rem; padding:.5rem .8rem; }
    .cat { font:inherit; font-size:.85rem; font-weight:700; padding:.32rem .7rem; border-radius:50px; border:1.5px solid #cbd5e1; background:#fff; color:#475569; cursor:pointer; display:inline-flex; align-items:center; gap:.3rem; flex:none; white-space:nowrap; }
    .cat:disabled { opacity:.45; cursor:default; }
    .cat-dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
    .cat-n { font-weight:800; opacity:.8; }

    .maprow { display:grid; grid-template-columns:1.35fr 1fr; gap:1rem; margin-bottom:1rem; }
    .maprow.split { grid-template-columns:1.2fr 0.8fr; }
    @media (max-width:980px){ .maprow, .maprow.split { grid-template-columns:1fr; } }
    .map-wrap { position:relative; overflow:hidden; }
    #informExpMap, #informFocusMap { height:62vh; min-height:460px; border-radius:12px; z-index:1; }
    .maprow.split #informExpMap, .maprow.split #informFocusMap { height:56vh; min-height:400px; }
    .focus-empty { display:flex; align-items:center; justify-content:center; height:56vh; min-height:400px; color:#64748b; font-size:.95rem; padding:1.2rem; text-align:center; }
    .split-panel { display:flex; flex-direction:column; gap:.55rem; max-height:62vh; overflow:auto; }
    .level-select { font:inherit; font-size:.9rem; font-weight:700; padding:.4rem .7rem; border:1.5px solid #cbd5e1; border-radius:8px; background:#fff; color:#0d3b66; cursor:pointer; }
    .level-count { font-size:.85rem; color:#64748b; font-weight:600; }
    .split-area { border:1px solid #e2e8f0; border-radius:10px; padding:.65rem .75rem; background:#f8fafc; cursor:pointer; }
    .split-area:hover { border-color:#93c5fd; background:#eff6ff; }
    .split-area.on { border-color:#1d4ed8; background:#dbeafe; }
    .split-area .nm { font-weight:800; color:#0f172a; }
    .split-area .rg { font-size:.8rem; color:#64748b; }
    .split-area .sc { font-size:1.15rem; font-weight:900; font-variant-numeric:tabular-nums; }
    .layout-bar { display:flex; flex-wrap:wrap; gap:.5rem; align-items:center; margin-bottom:.75rem; }
    .layout-bar .hint { font-size:.82rem; color:#64748b; flex:1; min-width:180px; }
    .leaflet-container { background:#e8edf2; } .leaflet-control-attribution { display:none !important; }
    .legend { background:#fff; padding:.5rem .65rem; border:1px solid #e2e8f0; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,.08); font-size:.8rem; line-height:1.55; }
    .legend strong { font-size:.85rem; }
    .legend i { display:inline-block; width:11px; height:11px; border-radius:2px; margin-right:5px; vertical-align:middle; }

    .table-wrap { overflow:hidden; margin-bottom:1rem; }
    .table-head { display:flex; align-items:center; gap:.6rem; padding:.6rem 1rem; border-bottom:1px solid #eef2f7; }
    .table-actions { margin-left:auto; display:flex; gap:.4rem; }
    .table-scroll { max-height:52vh; overflow:auto; }
    table { width:100%; border-collapse:collapse; font-size:.9rem; }
    th, td { padding:.45rem .7rem; text-align:left; border-bottom:1px solid #f1f5f9; white-space:nowrap; }
    th { position:sticky; top:0; background:#f8fafc; font-size:.8rem; text-transform:uppercase; letter-spacing:.03em; color:#64748b; z-index:1; }
    th.sortable { cursor:pointer; user-select:none; }
    td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
    tbody tr { cursor:pointer; }
    tbody tr:hover { background:#f8fafc; }
    tbody tr.sel { background:#dbeafe; }
    .badge { font-size:.8rem; font-weight:800; padding:.1rem .5rem; border-radius:50px; color:#fff; }

    .detail-empty { padding:1.4rem; color:#64748b; }
    .detail-head { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap; }
    .detail-score { text-align:right; font-size:2rem; font-weight:900; line-height:1; }
    .detail-score .badge { display:block; margin-top:.35rem; font-size:.8rem; }
    .dim-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:.9rem; margin-top:1rem; }
    .dim { border:1px solid #e2e8f0; border-radius:10px; padding:.7rem .85rem; }
    .dim-head { display:flex; justify-content:space-between; font-weight:800; font-size:.95rem; margin-bottom:.45rem; }
    .bar-row { display:flex; align-items:center; gap:.5rem; margin:.22rem 0; font-size:.85rem; }
    .bar-label { flex:0 0 46%; color:#334155; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .bar-track { flex:1; height:9px; background:#eef2f7; border-radius:50px; overflow:hidden; }
    .bar-fill { height:100%; border-radius:50px; }
    .bar-val { flex:0 0 28px; text-align:right; font-weight:700; font-variant-numeric:tabular-nums; }

    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem; }
    @media (max-width:980px){ .grid2 { grid-template-columns:1fr; } }
    .chart-card { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:.8rem 1rem; }
    .chart-card h3 { font-size:1.1rem; margin:0; }
    .chart-card .sub { font-size:.85rem; color:#64748b; margin:.1rem 0 .5rem; }
    .note { font-size:.85rem; color:#64748b; margin-top:.6rem; }
  `],
    template: `
    @if (!embedded()) {
    <div class="hero">
      <div class="hero-row">
        <div>
          <div class="eyebrow">{{ t('eyebrow') }}</div>
          <h1>{{ t('risk_explorer') }}</h1>
          <p>{{ t('hero_desc') }}</p>
        </div>
        @if (national(); as n) {
          <div class="natbadge" [style.borderColor]="cls(n.risk).color">
            <div class="v">{{ fmt(n.risk) }}</div>
            <span class="b" [style.background]="cls(n.risk).color">{{ levelLabel(cls(n.risk).level) }} {{ t('risk_suffix') }}</span>
          </div>
        }
      </div>
    </div>
    }
    <div class="stats">
      <div class="stat"><div class="v">{{ stats().councils }}</div><div class="l">{{ t('stat_councils') }}</div></div>
      <div class="stat"><div class="v">{{ stats().regions }}</div><div class="l">{{ t('stat_regions') }}</div></div>
      <div class="stat"><div class="v">{{ stats().dimensions }}</div><div class="l">{{ t('stat_dimensions') }}</div></div>
      <div class="stat"><div class="v">{{ stats().indicators }}</div><div class="l">{{ t('stat_indicators') }}</div></div>
    </div>

    <div class="wrap">
      <!-- VIEW LEVEL (inform.co.tz pattern): each unit keeps its own score — map redistributes by level -->
      <div class="card pad controls" style="margin-bottom:.75rem;">
        <div class="ctl-row">
          <span class="eyebrow">{{ t('view_level') }}</span>
          <select class="level-select" [value]="mapLevel()" (change)="setMapLevel(($any($event.target).value))">
            <option value="council">{{ t('level_council') }}</option>
            <option value="region">{{ t('level_region') }}</option>
          </select>
          <span class="level-count">{{ ranked().length }} {{ mapLevel() === 'region' ? t('note_regions') : t('note_councils') }}</span>
          <span class="muted" style="font-size:.85rem;">{{ t('view_level_hint') }}</span>
        </div>
      </div>

      <!-- PRODUCT MODE: strategic risk vs operational EO hazard signals (F54) ------------------ -->
      <div class="card pad controls" style="margin-bottom:.75rem;">
        <div class="ctl-row">
          <span class="eyebrow">{{ t('map_product') }}</span>
          <div class="chips">
            <button class="chip" [class.on]="mapMode() === 'strategic'" (click)="setMapMode('strategic')">{{ t('mode_strategic') }}</button>
            <button class="chip" [class.on]="mapMode() === 'signals'" (click)="setMapMode('signals')">{{ t('mode_signals') }}</button>
          </div>
          @if (mapMode() === 'signals' && signalHazards().length) {
            <select class="chip" style="border-radius:8px;cursor:pointer;" (change)="onSignalHazard($event)">
              @for (h of signalHazards(); track h) {
                <option [value]="h" [selected]="h === signalHazard()">{{ h }}</option>
              }
            </select>
          }
        </div>
        <p class="muted" style="font-size:.85rem;margin:.35rem 0 0;">
          {{ mapMode() === 'signals' ? t('mode_signals_hint') : t('mode_strategic_hint') }}
        </p>
      </div>

      <!-- LENS SELECTOR ------------------------------------------------------------------------ -->
      @if (mapMode() === 'strategic') {
      <div class="card pad controls">
        <div class="ctl-row">
          <span class="eyebrow">{{ t('colour_councils_by') }}</span>
          <div class="chips">
            @for (l of dimLenses(); track l.key) {
              <button class="chip" [class.on]="isDimChipOn(l)" (click)="setLens(l)">{{ lensLabel(l) }}</button>
            }
          </div>
        </div>

        @if (drillDim(); as dim) {
          <p class="muted" style="font-size:.9rem; margin:.1rem 0 .5rem;">{{ dimDesc() }}</p>
          <div class="indi">
            <!-- Breadcrumb: dimension → category → component → indicator (stays visible while map recolours) -->
            <div class="crumb">
              <button type="button" (click)="setLens({ key: 'dim:' + dim.key, label: dim.dimension, level: 'dim', scope: dim.key })">{{ dimLabel(dim) }}</button>
              @if (crumbCat()) {
                <span class="sep">›</span>
                <button type="button" (click)="setMetric('cat:' + crumbCat()!, 'cat', crumbCat()!)">{{ nm(crumbCat()!) }}</button>
              }
              @if (crumbComp()) {
                <span class="sep">›</span>
                <button type="button" (click)="setMetric('comp:' + crumbComp()!, 'comp', crumbComp()!)">{{ crumbComp() }}</button>
              }
              @if (activeLens().level === 'ind') {
                <span class="sep">›</span>
                <span class="here">{{ lensLabel(activeLens()) }}</span>
              } @else if (activeLens().level === 'dim') {
                <span class="sep">›</span>
                <span class="here">{{ t('whole') }} {{ dimLabel(dim) }}</span>
              }
            </div>

            <div class="drill-tools">
              <input type="search" [value]="indQuery()" (input)="indQuery.set(($any($event.target).value || ''))"
                     [placeholder]="t('search_indicators')" aria-label="Search indicators">
              <button type="button" class="chip" (click)="setLens({ key: 'dim:' + dim.key, label: dim.dimension, level: 'dim', scope: dim.key })">
                {{ t('whole') }} {{ dimLabel(dim) }}
              </button>
            </div>

            @for (c of filteredCategories(dim); track c.category) {
              <div class="cat-block">
                <button type="button" class="cat-head"
                        [class.on-cat]="metricKey() === 'cat:' + c.category || openCat() === c.category"
                        (click)="toggleCat(c.category)">
                  <span>{{ nm(c.category) }} · {{ countIndicators(c) }} {{ t('indicators_word') }}</span>
                  <span>{{ openCat() === c.category || indQuery().trim() ? '▾' : '▸' }}</span>
                </button>
                @if (openCat() === c.category || indQuery().trim()) {
                  <div class="cat-body">
                    <button type="button" class="comp-head" [class.on-comp]="metricKey() === 'cat:' + c.category"
                            (click)="setMetric('cat:' + c.category, 'cat', c.category)">
                      <span>{{ t('whole') }} {{ nm(c.category) }}</span>
                      <span class="muted">{{ t('paren_category') }}</span>
                    </button>
                    @for (comp of filteredComponents(c); track comp.component) {
                      <div class="comp-block">
                        <button type="button" class="comp-head"
                                [class.on-comp]="metricKey() === 'comp:' + comp.component || openComp() === comp.component"
                                (click)="toggleComp(comp.component, c.category)">
                          <span>{{ comp.component }} · {{ filteredIndicators(comp).length }}</span>
                          <span>{{ openComp() === comp.component || indQuery().trim() ? '▾' : '▸' }}</span>
                        </button>
                        @if (openComp() === comp.component || indQuery().trim()) {
                          <div class="ind-list">
                            <button type="button" class="ind-row" [class.on]="metricKey() === 'comp:' + comp.component"
                                    (click)="setMetric('comp:' + comp.component, 'comp', comp.component)">
                              <span>{{ t('whole_component') }}</span>
                            </button>
                            @for (ind of filteredIndicators(comp); track ind.id) {
                              <button type="button" class="ind-row" [class.on]="metricKey() === 'ind:' + ind.id"
                                      (click)="selectIndicator(ind, dim.key, c.category, comp.component)" [title]="ind.id">
                                <span>
                                  {{ ind.name }}
                                  @if (ind.owner) { <span class="own"> · {{ ind.owner }}</span> }
                                </span>
                                <span class="id">{{ ind.id }}</span>
                              </button>
                            }
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }
            @if (!filteredCategories(dim).length) {
              <p class="muted" style="font-size:.85rem;">{{ t('no_indicator_match') }}</p>
            }
          </div>
        }
      </div>
      }

      <!-- CLASS / SELECTED FILTER --------------------------------------------------------------- -->
      <div class="card pad catbar">
        <span class="eyebrow">{{ t('view') }}</span>
        <button class="cat" [class.on]="!classFilter() && !selectedOnly()"
                [style.background]="!classFilter() && !selectedOnly() ? '#0d3b66' : ''"
                [style.color]="!classFilter() && !selectedOnly() ? '#fff' : ''"
                (click)="showAll()">{{ t('all') }} <span class="cat-n">{{ ranked().length }}</span></button>
        <button class="cat" [class.on]="selectedOnly()" [disabled]="!selected()"
                [style.background]="selectedOnly() ? '#0d3b66' : ''" [style.color]="selectedOnly() ? '#fff' : ''"
                (click)="toggleSelectedOnly()">{{ t('selected') }}{{ selected() ? ': ' + selected()!.name : '' }}</button>
        @for (c of classes; track c.level) {
          <button class="cat" [class.on]="classFilter() === c.level && !selectedOnly()"
                  [style.background]="classFilter() === c.level && !selectedOnly() ? c.color : ''"
                  [style.color]="classFilter() === c.level && !selectedOnly() ? '#fff' : ''"
                  [style.borderColor]="c.color"
                  (click)="setClassFilter(c.level)">
            <span class="cat-dot" [style.background]="c.color"></span>{{ levelLabel(c.level) }} <span class="cat-n">{{ classCount(c.level) }}</span>
          </button>
        }
      </div>

      <!-- Layout: optional map split for selected areas --------------------------------------- -->
      <div class="layout-bar">
        <button type="button" class="chip" [class.on]="mapSplit()" (click)="requestMapSplit()">
          {{ mapSplit() ? t('split_on') : t('split_offer') }}
        </button>
        @if (mapSplit()) {
          <button type="button" class="chip" (click)="clearSplitPins()">{{ t('split_clear') }}</button>
        }
        <span class="hint">{{ mapSplit() ? t('split_hint_on') : t('split_hint_off') }}</span>
      </div>

      <!-- MAP + (focus map when split | regional profile) — main map always distributes scores per unit -->
      <div class="maprow" [class.split]="mapSplit()">
        <div class="card map-wrap">
          @if (mapBusy()) {
            <div class="map-status">{{ t('map_updating') }}</div>
          }
          <div #mapEl id="informExpMap"></div>
        </div>
        @if (mapSplit()) {
          <div class="card map-wrap">
            @if (selected()) {
              <div #focusMapEl id="informFocusMap"></div>
            } @else {
              <div class="focus-empty">{{ t('focus_empty') }}</div>
            }
            @if (splitPins().length) {
              <div class="pad" style="border-top:1px solid #e2e8f0;max-height:28vh;overflow:auto;">
                @for (r of splitPins(); track r.area) {
                  <div class="split-area" [class.on]="selected()?.area === r.area" (click)="selectRow(r)" style="margin-bottom:.4rem;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:.5rem;">
                      <div>
                        <div class="nm">{{ r.name }}</div>
                        <div class="rg">{{ r.region || '—' }}</div>
                      </div>
                      <div class="sc" [style.color]="cls(r.value).color">{{ fmt(r.value) }}</div>
                    </div>
                    <div style="display:flex;gap:.45rem;margin-top:.35rem;flex-wrap:wrap;font-size:.78rem;color:#475569;">
                      <span>H {{ fmt(r.hazard) }}</span>
                      <span>V {{ fmt(r.vulnerability) }}</span>
                      <span>C {{ fmt(r.coping) }}</span>
                      <span class="badge" [style.background]="cls(r.value).color">{{ levelLabel(cls(r.value).level) }}</span>
                    </div>
                  </div>
                }
              </div>
            } @else if (!selected()) {
              <p class="muted" style="font-size:.9rem;margin:.6rem 0;padding:0 1rem;">{{ t('split_empty') }}</p>
            }
          </div>
        } @else {
          <div class="card pad">
            <div class="eyebrow">{{ t('regional_profile') }}</div>
            <div class="sub muted" style="font-size:.85rem; margin:.1rem 0 .3rem;">{{ t('regional_sub') }}{{ emphasize() ? ' ' + t('highlighting') + ' ' + emphasizeLabel() : '' }}</div>
            <div [innerHTML]="regionalSvg()"></div>
          </div>
        }
      </div>

      <!-- When map is split, regional INFORM profile charts sit full-width below the map ------- -->
      @if (mapSplit()) {
        <div class="card pad" style="margin-bottom:1rem;">
          <div class="eyebrow">{{ t('regional_profile') }}</div>
          <div class="sub muted" style="font-size:.85rem; margin:.1rem 0 .3rem;">
            {{ t('regional_sub') }}{{ emphasize() ? ' ' + t('highlighting') + ' ' + emphasizeLabel() : '' }}
          </div>
          <div [innerHTML]="regionalSvg()"></div>
        </div>
      }

      <!-- RANKED TABLE ------------------------------------------------------------------------- -->
      <div class="card table-wrap">
        <div class="table-head">
          <span class="muted" style="font-weight:700;">{{ filtered().length }} {{ mapLevel() === 'region' ? t('note_regions') : t('councils') }}</span>
          <div class="table-actions">
            @if (tableOpen()) {
              <button class="chip" (click)="toggleSort()">{{ sortDesc() ? t('high_to_low') : t('low_to_high') }}</button>
            }
            <button class="chip" (click)="tableOpen.set(!tableOpen())">{{ tableOpen() ? t('hide_table') : t('show_table') }}</button>
          </div>
        </div>
        @if (tableOpen()) {
          <div class="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>#</th><th>{{ t('th_council_lga') }}</th><th>{{ t('th_region') }}</th>
                  <th class="sortable num" (click)="toggleSort()">{{ lensLabel(activeLens()) }} {{ sortDesc() ? '▼' : '▲' }}</th>
                  <th class="num">{{ t('th_hazard') }}</th><th class="num">{{ t('th_vulnerability') }}</th><th class="num">{{ t('th_coping') }}</th><th>{{ t('th_class') }}</th>
                </tr>
              </thead>
              <tbody>
                @for (r of filtered(); track r.area; let i = $index) {
                  <tr [class.sel]="selected()?.area === r.area" (click)="selectRow(r)">
                    <td class="muted">{{ i + 1 }}</td>
                    <td><strong>{{ r.name }}</strong></td>
                    <td class="muted">{{ r.region }}</td>
                    <td class="num"><b [style.color]="cls(r.value).color">{{ fmt(r.value) }}</b></td>
                    <td class="num">{{ fmt(r.hazard) }}</td>
                    <td class="num">{{ fmt(r.vulnerability) }}</td>
                    <td class="num">{{ fmt(r.coping) }}</td>
                    <td><span class="badge" [style.background]="cls(r.value).color">{{ levelLabel(cls(r.value).level) }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <!-- DISTRIBUTION + HIGHEST UNITS -------------------------------------------- -->
      <div class="grid2">
        <div class="chart-card">
          <h3>{{ t('distribution') }}</h3>
          <div class="sub">{{ scored().length }} {{ t('councils_by') }} {{ lensLabel(activeLens()).toLowerCase() }}</div>
          <div [innerHTML]="distSvg()"></div>
        </div>
        <div class="chart-card">
          <h3>{{ t('highest_councils') }}</h3>
          <div class="sub">{{ t('top_12_by') }} {{ lensLabel(activeLens()).toLowerCase() }}</div>
          <div [innerHTML]="topSvg()"></div>
        </div>
      </div>

      <!-- DISTRICT DETAIL (profile + bars) ----------------------------------------------------- -->
      <div class="card">
        @if (detail(); as d) {
          <div class="pad">
            <div class="detail-head">
              <div>
                <div class="eyebrow">{{ d.region || '' }}{{ d.region ? ' ' + t('region_word') + ' · ' : '' }}{{ d.area }}</div>
                <h3 class="h2">{{ d.name }}</h3>
              </div>
              @if (!d.signalMode) {
                <div class="detail-score" [style.color]="cls(d.risk).color">
                  {{ fmt(d.risk) }}
                  <span class="badge" [style.background]="cls(d.risk).color">{{ levelLabel(cls(d.risk).level) }}</span>
                </div>
              }
            </div>

            @if (d.signalMode) {
              <div class="eyebrow" style="margin-bottom:.6rem;">{{ t('mode_signals') }}</div>
              @for (s of d.signals || []; track s.component) {
                <div style="border:1px solid #e2e8f0;border-radius:8px;padding:.55rem .7rem;margin-bottom:.45rem;background:#f8fafc;">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;">
                    <strong>{{ s.component }}</strong>
                    <span class="badge" [style.background]="signalColor(s.signal)">{{ fmt(s.signal) }} · {{ s.status || '—' }}</span>
                  </div>
                  <div class="muted" style="font-size:.8rem;margin-top:.2rem;">
                    {{ t('reliability_word') }}: {{ s.reliability || '—' }}
                    · {{ t('coverage_word') }}: {{ s.coveragePct != null ? s.coveragePct + '%' : '—' }}
                    · {{ s.membersPresent ?? 0 }}/{{ s.membersDesigned ?? 0 }}
                  </div>
                  @for (m of s.members || []; track m.id) {
                    <div style="display:flex;justify-content:space-between;font-size:.78rem;color:#475569;padding:.1rem 0 .1rem .4rem;">
                      <span>{{ m.name }}@if (m.owner) { <span class="muted"> · {{ m.owner }}</span> }</span>
                      <span style="font-variant-numeric:tabular-nums;">{{ fmt(m.score) }}</span>
                    </div>
                  }
                </div>
              }
              @if (!(d.signals || []).length) { <div class="muted">{{ t('no_indicator_data') }}</div> }
            } @else {
            <div class="dim-grid">
              <div class="dim">
                <div class="dim-head"><span>{{ t('dim_hazard') }}</span><b [style.color]="cls(d.hazard).color">{{ fmt(d.hazard) }}</b></div>
                @for (b of catBars(d, 'hazard'); track b.label) {
                  <div class="bar-row" [title]="nm(b.label) + ': ' + fmt(b.value)">
                    <span class="bar-label">{{ nm(b.label) }}</span>
                    <span class="bar-track"><span class="bar-fill" [style.width]="pct(b.value)" [style.background]="cls(b.value).color"></span></span>
                    <span class="bar-val">{{ fmt(b.value) }}</span>
                  </div>
                }
              </div>
              <div class="dim">
                <div class="dim-head"><span>{{ t('dim_vulnerability') }}</span><b [style.color]="cls(d.vulnerability).color">{{ fmt(d.vulnerability) }}</b></div>
                @for (b of catBars(d, 'vulnerability'); track b.label) {
                  <div class="bar-row" [title]="nm(b.label) + ': ' + fmt(b.value)">
                    <span class="bar-label">{{ nm(b.label) }}</span>
                    <span class="bar-track"><span class="bar-fill" [style.width]="pct(b.value)" [style.background]="cls(b.value).color"></span></span>
                    <span class="bar-val">{{ fmt(b.value) }}</span>
                  </div>
                }
              </div>
              <div class="dim">
                <div class="dim-head"><span>{{ t('dim_coping_short') }}</span><b [style.color]="cls(d.coping).color">{{ fmt(d.coping) }}</b></div>
                @for (b of catBars(d, 'coping'); track b.label) {
                  <div class="bar-row" [title]="nm(b.label) + ': ' + fmt(b.value)">
                    <span class="bar-label">{{ nm(b.label) }}</span>
                    <span class="bar-track"><span class="bar-fill" [style.width]="pct(b.value)" [style.background]="cls(b.value).color"></span></span>
                    <span class="bar-val">{{ fmt(b.value) }}</span>
                  </div>
                }
              </div>
              <div class="dim">
                <div class="dim-head"><span>{{ t('top_indicators') }}</span></div>
                @for (b of topIndicatorBars(d); track b.label) {
                  <div class="bar-row" [title]="nm(b.label) + ': ' + fmt(b.value)">
                    <span class="bar-label">{{ nm(b.label) }}</span>
                    <span class="bar-track"><span class="bar-fill" [style.width]="pct(b.value)" [style.background]="cls(b.value).color"></span></span>
                    <span class="bar-val">{{ fmt(b.value) }}</span>
                  </div>
                }
                @if (!topIndicatorBars(d).length) { <div class="muted" style="font-size:.9rem;">{{ t('no_indicator_data') }}</div> }
              </div>
            </div>

            <!-- Component breakdown (horizontal SVG bars) -->
            <div class="grid2" style="margin-top:1.1rem; margin-bottom:0;">
              <div class="chart-card">
                <h3>{{ t('component_breakdown') }}</h3>
                <div class="sub">{{ d.name }} — {{ t('by_inform_component') }}</div>
                <div [innerHTML]="detailCompSvg()"></div>
              </div>
              <div class="chart-card">
                <h3>{{ t('council_vs_national') }}</h3>
                <div class="sub">{{ t('across_dimensions') }}</div>
                <div [innerHTML]="detailCompareSvg()"></div>
              </div>
            </div>
            }
          </div>
        } @else {
          <div class="detail-empty">{{ t('detail_empty') }}</div>
        }
      </div>

      <p class="note">{{ t('note_a') }} {{ stats().regions }} {{ t('note_regions') }} · {{ stats().councils }} {{ t('note_councils') }} · {{ stats().indicators }} {{ t('note_indicators') }}. {{ t('note_b') }}</p>
    </div>
  `
})
export class PublicInformExplorerComponent implements AfterViewInit, OnDestroy {
  /** When embedded inside the Portal page, suppress the standalone hero. */
  embedded = input(false);
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  L = inject(PortalLabels);
  mapEl = viewChild<ElementRef>('mapEl');
  focusMapEl = viewChild<ElementRef>('focusMapEl');

  classes = RISK_CLASSES;
  classLabels = CLASS_LABELS;

  /* ------------------------------------------------------------------------------------------------
   * Component-local bilingual table (English + Kiswahili). Keyed by a stable English string so the
   * five INFORM risk classes / relative-quintile bands keep their English `.level` as the logical
   * key for filtering & counting, while rendering in the portal's current language. A missing key
   * falls back to its English value, then to the key itself — the view is never blank.
   * ---------------------------------------------------------------------------------------------- */
  private TR: Record<string, { en: string; sw: string }> = {
    // Hero
    'eyebrow':            { en: 'INFORM Risk Index · Tanzania', sw: 'Fahirisi ya Hatari ya INFORM · Tanzania' },
    'risk_explorer':      { en: 'Risk Explorer', sw: 'Chunguza Hatari' },
    'hero_desc':          { en: 'Choose a level and a lens — overall INFORM risk, a dimension, or any single indicator — to recolour each unit with its own score. Click a unit for its full INFORM profile (selection highlights only; it does not repaint the whole map).', sw: 'Chagua ngazi na kioo — hatari ya jumla ya INFORM, kipimo, au kiashiria — kutia rangi kila eneo kwa alama yake. Bofya eneo kuona wasifu kamili (uteuzi unaangazia tu; haubadilishi rangi ya ramani yote).' },
    'risk_suffix':        { en: 'Risk', sw: 'Hatari' },
    // Stats
    'stat_councils':      { en: 'Councils', sw: 'Halmashauri' },
    'stat_regions':       { en: 'Regions', sw: 'Mikoa' },
    'stat_dimensions':    { en: 'Dimensions', sw: 'Vipimo' },
    'stat_indicators':    { en: 'Indicators', sw: 'Viashiria' },
    // Level (inform.co.tz pattern)
    'view_level':         { en: 'View at level', sw: 'Ona katika ngazi' },
    'level_council':      { en: 'Council / LGA (195)', sw: 'Halmashauri / LGA (195)' },
    'level_region':       { en: 'Region (31)', sw: 'Mkoa (31)' },
    'view_level_hint':    { en: 'Each polygon keeps its own INFORM score — the map redistributes colours by level, not by the selected unit.', sw: 'Kila poligoni huhifadhi alama yake ya INFORM — ramani hugawa rangi kwa ngazi, si kwa eneo lililochaguliwa.' },
    'focus_empty':        { en: 'Select an area on the main map or table to focus this panel on it (zoomed map of that unit).', sw: 'Chagua eneo kwenye ramani kuu au jedwali ili kulenga paneli hii (ramani iliyokuzwa ya eneo hilo).' },
    // Lens selector
    'colour_councils_by': { en: 'Colour units by', sw: 'Tia rangi maeneo kwa' },
    'overall_inform_risk':{ en: 'Overall INFORM Risk', sw: 'Hatari ya Jumla ya INFORM' },
    'drill_into':         { en: 'drill into a category, component or indicator', sw: 'ingia ndani ya kundi, kijenzi au kiashiria' },
    'whole':              { en: 'Whole', sw: 'Kizima' },
    'paren_dimension':    { en: '(dimension)', sw: '(kipimo)' },
    'paren_category':     { en: '(category)', sw: '(kundi)' },
    'paren_component':    { en: '(component)', sw: '(kijenzi)' },
    'optgroup_category':  { en: 'Category ·', sw: 'Kundi ·' },
    'whole_component':    { en: 'whole component', sw: 'kijenzi kizima' },
    // Class / selected filter
    'view':               { en: 'View', sw: 'Mwonekano' },
    'all':                { en: 'All', sw: 'Zote' },
    'selected':           { en: 'Selected', sw: 'Iliyochaguliwa' },
    // Regional profile
    'regional_profile':   { en: 'Regional INFORM profile', sw: 'Wasifu wa INFORM wa Kimkoa' },
    'regional_sub':       { en: 'dimension means by region, ordered by overall risk', sw: 'wastani wa vipimo kwa mkoa, vimepangwa kwa hatari ya jumla' },
    'highlighting':       { en: '· highlighting', sw: '· inaangazia' },
    // Ranked table
    'councils':           { en: 'councils', sw: 'halmashauri' },
    'high_to_low':        { en: 'High to Low', sw: 'Juu hadi Chini' },
    'low_to_high':        { en: 'Low to High', sw: 'Chini hadi Juu' },
    'hide_table':         { en: 'Hide table', sw: 'Ficha jedwali' },
    'show_table':         { en: 'Show table', sw: 'Onyesha jedwali' },
    'th_council_lga':     { en: 'Council / LGA', sw: 'Halmashauri / LGA' },
    'th_region':          { en: 'Region', sw: 'Mkoa' },
    'th_hazard':          { en: 'Hazard', sw: 'Janga' },
    'th_vulnerability':   { en: 'Vulnerability', sw: 'Uathirikaji' },
    'th_coping':          { en: 'Coping', sw: 'Kukabili' },
    'th_class':           { en: 'Class', sw: 'Daraja' },
    // Distribution + highest
    'distribution':       { en: 'Distribution', sw: 'Mgawanyo' },
    'councils_by':        { en: 'councils by', sw: 'halmashauri kwa' },
    'highest_councils':   { en: 'Highest councils', sw: 'Halmashauri za Juu Zaidi' },
    'top_12_by':          { en: 'top 12 by', sw: '12 za juu kwa' },
    // District detail
    'region_word':        { en: 'Region', sw: 'Mkoa' },
    'dim_hazard':         { en: 'Hazard and Exposure', sw: 'Janga na Uwazi' },
    'dim_vulnerability':  { en: 'Vulnerability', sw: 'Uathirikaji' },
    'dim_coping_short':   { en: 'Lack of Coping', sw: 'Ukosefu wa Uwezo wa Kukabili' },
    'top_indicators':     { en: 'Top indicators', sw: 'Viashiria vya Juu' },
    'no_indicator_data':  { en: 'No indicator data', sw: 'Hakuna data ya kiashiria' },
    'component_breakdown':{ en: 'Component breakdown', sw: 'Mchanganuo wa Vijenzi' },
    'by_inform_component':{ en: 'by INFORM component', sw: 'kwa kijenzi cha INFORM' },
    'council_vs_national':{ en: 'Council vs national', sw: 'Halmashauri dhidi ya kitaifa' },
    'across_dimensions':  { en: 'across the INFORM dimensions', sw: 'katika vipimo vya INFORM' },
    'detail_empty':       { en: 'Select a council on the map or table to see its full INFORM profile — the three dimension scores plus bar graphs of its categories, components and top indicators.', sw: 'Chagua halmashauri kwenye ramani au jedwali kuona wasifu wake kamili wa INFORM — alama za vipimo vitatu pamoja na chati za kategoria, vijenzi na viashiria vyake vya juu.' },
    // Footer note
    'note_a':             { en: 'Sub-national analysis built from the INFORM Tanzania country-model workbook on the NBS-2022 structure —', sw: 'Uchambuzi wa ngazi za chini umejengwa kutoka kwa kitabu cha modeli ya nchi ya INFORM Tanzania kwenye muundo wa NBS-2022 —' },
    'note_regions':       { en: 'regions', sw: 'mikoa' },
    'note_councils':      { en: 'councils', sw: 'halmashauri' },
    'note_indicators':    { en: 'indicators', sw: 'viashiria' },
    'note_b':             { en: 'Read-only public view.', sw: 'Mwonekano wa umma wa kusoma tu.' },
    // Risk class levels (display only — English `.level` remains the logical key)
    'Very Low':           { en: 'Very Low', sw: 'Chini Sana' },
    'Low':                { en: 'Low', sw: 'Chini' },
    'Medium':             { en: 'Medium', sw: 'Wastani' },
    'High':               { en: 'High', sw: 'Juu' },
    'Very High':          { en: 'Very High', sw: 'Juu Sana' },
    'No data':            { en: 'No data', sw: 'Hakuna data' },
    // Relative-quintile band labels (indicator lens legend)
    'Lowest':             { en: 'Lowest', sw: 'Chini Zaidi' },
    'Highest':            { en: 'Highest', sw: 'Juu Zaidi' },
    // Dimension descriptions (drill panel)
    'desc_hazard':        { en: 'Hazard and Exposure — how likely/intense hazards are and what is exposed.', sw: 'Janga na Uwazi — uwezekano/ukali wa majanga na kilicho hatarini.' },
    'desc_vulnerability': { en: 'Vulnerability — susceptibility of people and systems (poverty, health, vulnerable groups).', sw: 'Uathirikaji — uwezekano wa watu na mifumo kuathirika (umaskini, afya, makundi yaliyo hatarini).' },
    'desc_coping':        { en: 'Lack of Coping Capacity — resources and institutions available to cope; higher means fewer.', sw: 'Ukosefu wa Uwezo wa Kukabili — rasilimali na taasisi zilizopo za kukabili; juu zaidi maana yake chache zaidi.' },
    // Map legend / tooltips / SVG
    'inform_risk':        { en: 'INFORM Risk', sw: 'Hatari ya INFORM' },
    'relative_suffix':    { en: '(relative)', sw: '(linganishi)' },
    'council_word':       { en: 'Council', sw: 'Halmashauri' },
    'national_word':      { en: 'National', sw: 'Kitaifa' },
    'x_region_ordered':   { en: 'Region (ordered by INFORM Risk →)', sw: 'Mkoa (umepangwa kwa Hatari ya INFORM →)' },
    'x_inform_dimension': { en: 'INFORM dimension', sw: 'Kipimo cha INFORM' },
    'map_product':        { en: 'Map product', sw: 'Aina ya ramani' },
    'mode_strategic':     { en: 'Strategic INFORM risk', sw: 'Hatari ya kimkakati ya INFORM' },
    'mode_signals':       { en: 'EO hazard signals', sw: 'Ishara za hatari (EO)' },
    'mode_strategic_hint':{ en: 'Slow structural composite — Hazard × Vulnerability × Coping (validated INFORM).', sw: 'Muundo wa kimkakati — Janga × Uathirikaji × Uwezo wa kukabili (INFORM).' },
    'mode_signals_hint':  { en: 'Fast operational Earth-observation signals by hazard component. Faded fill = thinner basket reliability. Informs anticipatory action; not the headline risk score.', sw: 'Ishara za uendeshaji za EO kwa kila hatari. Rangi dhaifu = uaminifu mdogo wa data. Kwa hatua za mapema; si alama kuu ya hatari.' },
    'signal_word':        { en: 'Signal', sw: 'Ishara' },
    'reliability_word':   { en: 'Reliability', sw: 'Uaminifu' },
    'coverage_word':      { en: 'Basket coverage', sw: 'Ufunikaji wa kikapu' },
    'search_indicators':  { en: 'Search indicators by name or code…', sw: 'Tafuta viashiria kwa jina au msimbo…' },
    'indicators_word':    { en: 'indicators', sw: 'viashiria' },
    'no_indicator_match': { en: 'No indicators match this search.', sw: 'Hakuna kiashiria kinacholingana na utafutaji huu.' },
    'map_updating':       { en: 'Updating map colours…', sw: 'Inasasisha rangi za ramani…' },
    // Optional map-split layout
    'split_offer':        { en: 'Split map · selected areas panel', sw: 'Gawa ramani · paneli ya maeneo yaliyochaguliwa' },
    'split_on':           { en: 'Split map ON', sw: 'Mgawanyo wa ramani UMEWASHWA' },
    'split_clear':        { en: 'Clear selected areas', sw: 'Futa maeneo yaliyochaguliwa' },
    'split_hint_off':     { en: 'Optional: open a side panel for pinned councils; regional INFORM charts then move below the map.', sw: 'Hiari: fungua paneli ya pembeni kwa halmashauri zilizochaguliwa; chati za INFORM za kimkoa zinahamia chini ya ramani.' },
    'split_hint_on':      { en: 'Click councils on the map or table to pin them here. Regional profile charts are below the map.', sw: 'Bofya halmashauri kwenye ramani au jedwali kuzibandika hapa. Wasifu wa kimkoa uko chini ya ramani.' },
    'split_panel_title':  { en: 'Selected areas', sw: 'Maeneo yaliyochaguliwa' },
    'split_panel_sub':    { en: 'Pinned councils for comparison (same lens as the map)', sw: 'Halmashauri zilizobandikwa kwa ulinganisho (kioo sawa na ramani)' },
    'split_empty':        { en: 'No areas pinned yet — click a council on the map or table.', sw: 'Hakuna eneo lililobandikwa bado — bofya halmashauri kwenye ramani au jedwali.' },
    'split_confirm':      { en: 'Split the map and show a focused map of the selected area beside it? Regional INFORM profile charts will move below the maps. The main map still shows every unit with its own score.', sw: 'Ungependa kugawa ramani na kuonyesha ramani iliyolengwa ya eneo lililochaguliwa kando yake? Chati za wasifu wa INFORM wa kimkoa zitahamia chini. Ramani kuu bado inaonyesha kila eneo kwa alama yake.' },
  };

  /** Active language only — never mixes EN into SW (or the reverse). */
  t(k: string): string {
    const e = this.TR[k];
    if (!e) return k;
    const v = (e[this.L.lang()] ?? '').trim();
    return v || k;
  }
  /** Risk-class / relative-band label in the active language only. */
  levelLabel(level: string): string {
    const e = this.TR[level];
    if (!e) return level;
    const v = (e[this.L.lang()] ?? '').trim();
    return v || level;
  }
  /**
   * Display label for a lens. The overall-risk lens carries a hardcoded English label that we
   * translate; every drill-down lens (dimension / category / component / indicator) carries an
   * API-supplied name, which — like council and region names — renders as-is in both languages.
   */
  lensLabel(l: Lens): string { return l.level === 'risk' ? this.t('overall_inform_risk') : this.nm(l.label); }
  /** Dimension name shown in the drill panel — translated for the fixed dimension set. */
  dimLabel(dim: Dim): string { return this.nm(dim.dimension); }
  /** The fixed INFORM dimension + category names translated for DISPLAY only (metric keys stay English). */
  private readonly NAME_SW: Record<string, string> = {
    'Hazards & Exposure': 'Janga na Uwazi', 'Vulnerability': 'Uathirikaji', 'Coping Capacity': 'Uwezo wa Kukabili',
    'Natural': 'Asili', 'Human': 'Kibinadamu', 'Socio-Economics': 'Kijamii-Kiuchumi',
    'Vulnerable Groups': 'Makundi Hatarishi', 'Infrastructure': 'Miundombinu', 'Institutional': 'Kitaasisi',
  };
  nm(name: string): string { return this.L.lang() === 'sw' ? (this.NAME_SW[name] ?? name) : name; }
  /** Translate the emphasised-dimension hint in the regional-profile subtitle. */
  emphasizeLabel(): string {
    const l = this.activeLens();
    if (l.scope === 'hazard') return this.t('dim_hazard');
    if (l.scope === 'vulnerability') return this.t('dim_vulnerability');
    if (l.scope === 'coping') return this.t('dim_coping_short');
    return l.level === 'risk' ? this.t('inform_risk') : '';
  }

  // --- state ---
  structure = signal<Dim[]>([]);
  rows = signal<RiskRow[]>([]);                 // councils for the active lens (value = lens score)
  stats = signal<{ indicators: number; councils: number; regions: number; dimensions: number }>({ indicators: 76, councils: 195, regions: 31, dimensions: 3 });
  national = signal<RiskRow | null>(null);
  activeLens = signal<Lens>({ key: 'risk', label: 'Overall INFORM Risk', level: 'risk', scope: 'risk' });
  selected = signal<RiskRow | null>(null);
  detail = signal<any>(null);                   // full /risk/{area} profile of the selected council
  sortDesc = signal(true);
  classFilter = signal<string | null>(null);
  selectedOnly = signal(false);
  tableOpen = signal(true);
  /** F54 — public explorer consumes /portal/inform/signals for operational EO layer. */
  mapMode = signal<'strategic' | 'signals'>('strategic');
  signalHazards = signal<string[]>([]);
  signalHazard = signal<string>('Drought');
  private signalRows = new Map<string, { area: string; name: string; signals: any[] }>();
  private signalReliability = new Map<string, string>();
  /** Keeps the dimension drill panel open while an indicator/category/component lens is active. */
  drillDimKey = signal<string | null>(null);
  openCat = signal<string | null>(null);
  openComp = signal<string | null>(null);
  indQuery = signal('');
  mapBusy = signal(false);
  /** Optional layout: main map + focus map of selected unit (inform.co.tz split panel). */
  mapSplit = signal(false);
  /** Geographic level of the choropleth — each unit still has its own score. */
  mapLevel = signal<'council' | 'region'>('council');
  /** Pinned councils when map-split is on (max 12). */
  splitPins = signal<RiskRow[]>([]);
  private crumbPath = signal<{ cat?: string; comp?: string }>({});

  private map: any; private layer: any; private legend: any; private viewReady = false;
  private focusMap: any; private focusLayer: any;
  private rowByCode = new Map<string, RiskRow>();
  private regionByCode = new Map<string, string>();
  private fittedOnce = false;
  private pendingGeo: any = null;
  private currentGeo: any = null;
  private readonly TZ_BOUNDS = [[-12.0, 28.5], [-0.8, 41.2]];
  private readonly SIGNAL_BANDS = [
    { label: 'Low', max: 2, color: '#2ECC71' },
    { label: 'Moderate', max: 4, color: '#F4D03F' },
    { label: 'Elevated', max: 6, color: '#E67E22' },
    { label: 'High', max: 8, color: '#E74C3C' },
    { label: 'Severe', max: 10.1, color: '#922B21' },
  ];

  metricKey = computed(() => this.activeLens().key);
  activeScope = computed(() => this.activeLens().scope);
  /** Dimension panel: sticky via drillDimKey so indicator clicks never wipe the tree. */
  drillDim = computed<Dim | null>(() => {
    const key = this.drillDimKey();
    if (!key) { return null; }
    return this.structure().find(d => d.key === key) || null;
  });
  /** Alias used by dimDesc() and older template paths. */
  activeDim = computed<Dim | null>(() => this.drillDim());
  crumbCat = computed(() => this.crumbPath().cat || null);
  crumbComp = computed(() => this.crumbPath().comp || null);
  // The top-level lens chips: overall risk + each dimension.
  dimLenses = computed<Lens[]>(() => {
    const base: Lens[] = [{ key: 'risk', label: 'Overall INFORM Risk', level: 'risk', scope: 'risk' }];
    for (const d of this.structure()) base.push({ key: 'dim:' + d.key, label: d.dimension, level: 'dim', scope: d.key });
    return base;
  });

  ranked = computed(() => {
    const desc = this.sortDesc();
    return [...this.rows()].sort((a, b) => {
      const av = a.value ?? -1, bv = b.value ?? -1;
      return desc ? bv - av : av - bv;
    });
  });
  filtered = computed(() => {
    const r = this.ranked();
    const sel = this.selected();
    if (this.selectedOnly() && sel) return r.filter(x => x.area === sel.area);
    const cf = this.classFilter();
    return cf ? r.filter(x => classifyRisk(x.value).level === cf) : r;
  });
  scored = computed(() => this.rows().filter(r => r.value != null && isFinite(r.value)));

  emphasize = computed(() => {
    const l = this.activeLens();
    return l.scope === 'hazard' ? 'Hazard and Exposure' : l.scope === 'vulnerability' ? 'Vulnerability' : l.scope === 'coping' ? 'Lack of Coping' : (l.level === 'risk' ? 'INFORM Risk' : '');
  });

  constructor() {
    this.http.get<Dim[]>('/api/v1/portal/inform/structure').subscribe({ next: s => this.structure.set(s || []), error: () => {} });
    this.http.get<any>('/api/v1/portal/inform/stats').subscribe({ next: s => { if (s) this.stats.set(s); }, error: () => {} });
    // Council geojson first — supplies region names for table + seeds main map.
    this.loadGeoForLevel('council');

    // Recolour only — do NOT re-fitBounds on every lens change (that felt like a full map refresh and lost place).
    // Selection only thickens border / dims on "Selected only" filter — never paints every unit with the selected score.
    effect(() => {
      this.rows();
      this.selected();
      this.classFilter();
      this.selectedOnly();
      this.L.lang();
      this.mapMode();
      this.signalHazard();
      this.colourAll();
      this.syncFocusMap();
    });
  }
  ngAfterViewInit(): void { this.viewReady = true; this.initMap(); this.syncFocusMap(); }
  ngOnDestroy(): void { this.map?.remove(); this.focusMap?.remove(); }

  /** Switch choropleth geography (council ↔ region). Scores stay per-unit; selection is cleared. */
  setMapLevel(level: 'council' | 'region'): void {
    if (level !== 'council' && level !== 'region') {
      return;
    }
    if (this.mapLevel() === level) {
      return;
    }
    this.mapLevel.set(level);
    this.selected.set(null);
    this.detail.set(null);
    this.selectedOnly.set(false);
    this.classFilter.set(null);
    this.splitPins.set([]);
    this.fittedOnce = false;
    this.loadGeoForLevel(level);
  }

  private loadGeoForLevel(level: 'council' | 'region'): void {
    const url = level === 'region'
      ? '/geojson/adm1_region/adm1.geojson'
      : '/geojson/tz_councils.geojson';
    this.http.get<any>(url).subscribe({
      next: gj => {
        const features = (gj?.features || []).map((f: any) => {
          const p = { ...(f.properties || {}) };
          if (level === 'region') {
            // INFORM area codes are TZ##; adm1 uses reg_code like "07".
            const rc = p.reg_code != null ? String(p.reg_code).padStart(2, '0') : '';
            p.code = rc ? `TZ${rc}` : p.code;
            p.name = p.reg_name || p.name || p.code;
            p.reg = p.reg_name || p.name;
          }
          if (p.code && p.reg) {
            this.regionByCode.set(p.code, p.reg);
          }
          return { ...f, properties: p };
        });
        const normalized = { type: 'FeatureCollection', features };
        this.currentGeo = normalized;
        this.buildMapLayer(normalized);
        if (this.mapMode() === 'signals') {
          this.loadSignals();
        } else {
          this.loadLens();
        }
      },
      error: () => {
        if (this.mapMode() === 'signals') {
          this.loadSignals();
        } else {
          this.loadLens();
        }
      },
    });
  }

  // --- helpers exposed to the template ---
  cls(v: number | null | undefined) { return classifyRisk(v); }
  fmt(v: number | null | undefined) { return fmt(v); }
  pct(v: number | null | undefined) { return pct(v); }
  dimDesc(): string {
    const d = this.activeDim();
    if (!d) return '';
    const key = d.key === 'hazard' ? 'desc_hazard' : d.key === 'vulnerability' ? 'desc_vulnerability' : d.key === 'coping' ? 'desc_coping' : '';
    return key ? this.t(key) : (DIM_DESC[d.key] || '');
  }
  classCount(level: string): number { return this.ranked().filter(r => classifyRisk(r.value).level === level).length; }

  // --- product mode (strategic vs EO signals) ---
  setMapMode(mode: 'strategic' | 'signals'): void {
    this.mapMode.set(mode);
    this.classFilter.set(null);
    this.selectedOnly.set(false);
    if (mode === 'signals') {
      this.loadSignals();
    } else {
      this.loadLens();
    }
  }
  onSignalHazard(e: Event): void {
    const h = (e.target as HTMLSelectElement).value;
    this.signalHazard.set(h);
    this.applySignalLens();
  }
  private loadSignals(): void {
    const level = this.mapLevel();
    this.http.get<any[]>(`/api/v1/portal/inform/signals?level=${encodeURIComponent(level)}`).subscribe({
      next: rows => {
        this.signalRows.clear();
        const seen = new Set<string>();
        for (const row of rows || []) {
          this.signalRows.set(row.area, row);
          for (const s of row.signals || []) {
            if (s?.component) { seen.add(s.component); }
          }
        }
        const hazards = [...seen].sort();
        this.signalHazards.set(hazards);
        if (hazards.length && !hazards.includes(this.signalHazard())) {
          this.signalHazard.set(hazards[0]);
        }
        this.applySignalLens();
      },
      error: () => { this.rows.set([]); this.colourAll(); },
    });
  }
  private applySignalLens(): void {
    const hazard = this.signalHazard();
    const list: RiskRow[] = [];
    this.signalReliability.clear();
    this.rowByCode.clear();
    for (const [area, row] of this.signalRows) {
      const sig = (row.signals || []).find((s: any) => s.component === hazard);
      const value = sig?.signal != null && isFinite(+sig.signal) ? +sig.signal : null;
      const r: RiskRow = {
        area,
        name: row.name || area,
        risk: value,
        hazard: value,
        vulnerability: null,
        coping: null,
        value,
        region: this.regionByCode.get(area),
      };
      list.push(r);
      this.rowByCode.set(area, r);
      if (sig?.reliability) { this.signalReliability.set(area, String(sig.reliability)); }
    }
    this.rows.set(list);
    this.colourAll();
  }
  /** Exposed for template signal badges. */
  signalColor(v: number | null | undefined): string {
    if (v == null || !isFinite(v)) { return NO_DATA; }
    for (const b of this.SIGNAL_BANDS) { if (v <= b.max) { return b.color; } }
    return this.SIGNAL_BANDS[this.SIGNAL_BANDS.length - 1].color;
  }
  private reliabilityOpacity(rel: string | undefined): number {
    return rel === 'High' ? 0.85 : rel === 'Moderate' ? 0.58 : rel ? 0.35 : 0.72;
  }

  // --- lens control ---
  isDimChipOn(l: Lens): boolean {
    if (l.level === 'risk') { return this.activeLens().level === 'risk' && this.mapMode() === 'strategic'; }
    return this.drillDimKey() === l.scope || (this.activeLens().level === 'dim' && this.activeLens().scope === l.scope);
  }

  setLens(l: Lens): void {
    this.activeLens.set(l);
    this.classFilter.set(null);
    this.selectedOnly.set(false);
    if (l.level === 'risk') {
      this.drillDimKey.set(null);
      this.openCat.set(null);
      this.openComp.set(null);
      this.crumbPath.set({});
      this.indQuery.set('');
    } else if (l.level === 'dim') {
      this.drillDimKey.set(l.scope);
      this.openCat.set(null);
      this.openComp.set(null);
      this.crumbPath.set({});
    }
    this.loadLens();
  }

  setMetric(key: string, level: 'cat' | 'comp' | 'ind', scope: string): void {
    // scope for indicators MUST be the indicator id (not display name) so the drill panel stays resolved.
    const label = this.labelFor(key, level, scope);
    const dimKey = this.drillDimKey() || this.inferDimKey(level, scope);
    if (dimKey) { this.drillDimKey.set(dimKey); }
    if (level === 'cat') {
      this.openCat.set(scope);
      this.openComp.set(null);
      this.crumbPath.set({ cat: scope });
    } else if (level === 'comp') {
      const cat = this.findCatForComp(scope);
      if (cat) { this.openCat.set(cat); }
      this.openComp.set(scope);
      this.crumbPath.set({ cat: cat || this.crumbPath().cat, comp: scope });
    }
    this.activeLens.set({ key, label, level, scope });
    this.classFilter.set(null);
    this.loadLens();
  }

  selectIndicator(ind: Indicator, dimKey: string, cat: string, comp: string): void {
    this.drillDimKey.set(dimKey);
    this.openCat.set(cat);
    this.openComp.set(comp);
    this.crumbPath.set({ cat, comp });
    // Pass indicator **id** as scope (bugfix: previously passed display name → activeDim became null and the tree vanished).
    this.activeLens.set({ key: 'ind:' + ind.id, label: ind.name, level: 'ind', scope: ind.id });
    this.classFilter.set(null);
    this.loadLens();
  }

  toggleCat(cat: string): void {
    this.openCat.update(c => c === cat ? null : cat);
    // Always clear component when switching/collapsing categories (avoids stale openComp from another cat).
    this.openComp.set(null);
  }
  toggleComp(comp: string, cat: string): void {
    this.openCat.set(cat);
    this.openComp.update(c => c === comp ? null : comp);
  }

  filteredCategories(dim: Dim): Cat[] {
    const q = this.indQuery().trim().toLowerCase();
    if (!q) { return dim.categories; }
    return dim.categories
      .map(c => ({
        ...c,
        components: this.filteredComponents(c),
      }))
      .filter(c => c.components.length > 0 || c.category.toLowerCase().includes(q));
  }
  filteredComponents(c: Cat): Cmp[] {
    const q = this.indQuery().trim().toLowerCase();
    if (!q) { return c.components; }
    return c.components
      .map(comp => ({ ...comp, indicators: this.filteredIndicators(comp) }))
      .filter(comp =>
        comp.indicators.length > 0
        || comp.component.toLowerCase().includes(q));
  }
  filteredIndicators(comp: Cmp): Indicator[] {
    const q = this.indQuery().trim().toLowerCase();
    if (!q) { return comp.indicators; }
    return comp.indicators.filter(i =>
      i.name.toLowerCase().includes(q)
      || i.id.toLowerCase().includes(q)
      || (i.owner || '').toLowerCase().includes(q));
  }
  countIndicators(c: Cat): number {
    return c.components.reduce((n, comp) => n + comp.indicators.length, 0);
  }

  private inferDimKey(level: 'cat' | 'comp' | 'ind', scope: string): string | null {
    for (const d of this.structure()) {
      for (const c of d.categories) {
        if (level === 'cat' && c.category === scope) { return d.key; }
        for (const cm of c.components) {
          if (level === 'comp' && cm.component === scope) { return d.key; }
          if (level === 'ind' && cm.indicators.some(i => i.id === scope)) { return d.key; }
        }
      }
    }
    return null;
  }
  private findCatForComp(comp: string): string | null {
    for (const d of this.structure()) {
      for (const c of d.categories) {
        if (c.components.some(cm => cm.component === comp)) { return c.category; }
      }
    }
    return null;
  }

  private labelFor(_key: string, level: 'cat' | 'comp' | 'ind', scope: string): string {
    return level === 'ind' ? this.indName(scope) : scope;
  }
  private indName(id: string): string {
    for (const d of this.structure()) for (const c of d.categories) for (const cm of c.components) { const i = cm.indicators.find(x => x.id === id); if (i) return i.name; }
    return id;
  }
  private loadLens(): void {
    const key = this.metricKey();
    const level = this.mapLevel();
    this.mapBusy.set(true);
    this.http.get<RiskRow[]>(`/api/v1/portal/inform/risk?level=${encodeURIComponent(level)}&metric=${encodeURIComponent(key)}`).subscribe({
      next: rows => {
        const list = (rows || []).map(r => ({
          ...r,
          // Keep each unit's own risk/hazard/vuln/coping for the regional profile; never copy selected unit.
          region: this.regionByCode.get(r.area) || (level === 'region' ? r.name : undefined),
        }));
        this.rows.set(list);
        this.rowByCode.clear(); for (const r of list) this.rowByCode.set(r.area, r);
        // National headline = mean across units at current level (honest summary).
        if (key === 'risk') {
          const mean = (k: keyof RiskRow) => { const v = list.map(r => r[k] as number).filter(x => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
          this.national.set({ area: 'TZ', name: 'Tanzania', risk: mean('risk'), hazard: mean('hazard'), vulnerability: mean('vulnerability'), coping: mean('coping'), value: mean('risk') });
        }
        this.mapBusy.set(false);
        this.colourAll();
        this.syncFocusMap();
      },
      error: () => { this.mapBusy.set(false); },
    });
  }

  // --- table / filter control ---
  toggleSort(): void { this.sortDesc.update(v => !v); }
  showAll(): void { this.classFilter.set(null); this.selectedOnly.set(false); }
  setClassFilter(level: string): void { this.classFilter.set(this.classFilter() === level && !this.selectedOnly() ? null : level); this.selectedOnly.set(false); }
  toggleSelectedOnly(): void { if (!this.selected()) return; this.selectedOnly.update(v => !v); this.classFilter.set(null); }
  selectRow(r: RiskRow): void { this.selectByCode(r.area); }

  /** Prompt before enabling split layout so the change is intentional. */
  requestMapSplit(): void {
    if (this.mapSplit()) {
      this.mapSplit.set(false);
      if (this.focusMap) {
        try { this.focusMap.remove(); } catch { /* ignore */ }
        this.focusMap = null;
        this.focusLayer = null;
      }
      setTimeout(() => this.map?.invalidateSize(), 80);
      return;
    }
    if (!window.confirm(this.t('split_confirm'))) {
      return;
    }
    this.mapSplit.set(true);
    // Seed pins with current selection if any.
    const sel = this.selected();
    if (sel) {
      this.pinSplit(sel);
    }
    setTimeout(() => {
      this.map?.invalidateSize();
      this.syncFocusMap();
    }, 80);
  }

  clearSplitPins(): void {
    this.splitPins.set([]);
  }

  private pinSplit(r: RiskRow): void {
    const cur = this.splitPins();
    if (cur.some(x => x.area === r.area)) {
      return;
    }
    this.splitPins.set([r, ...cur].slice(0, 12));
  }

  private selectByCode(code: string): void {
    const r = this.rowByCode.get(code) || null;
    this.selected.set(r);
    this.detail.set(null);
    if (!r) return;
    // Selection highlights + zooms to the unit — does NOT recolor other units to this unit's score.
    this.focusFeature(code);
    if (this.mapSplit()) {
      this.pinSplit(r);
      // Allow Angular to create #focusMapEl before init.
      setTimeout(() => this.syncFocusMap(), 50);
    }
    if (this.mapMode() === 'signals') {
      const row = this.signalRows.get(code);
      this.detail.set({
        area: code,
        name: r.name,
        region: r.region,
        signals: row?.signals || [],
        signalMode: true,
      });
      return;
    }
    this.http.get<any>(`/api/v1/portal/inform/risk/${encodeURIComponent(code)}`).subscribe({
      next: d => this.detail.set({ ...d, name: r.name, region: r.region }),
      error: () => {},
    });
  }

  /** Fly the main map to the selected polygon bounds (inform.co.tz focusUnit behaviour). */
  private focusFeature(code: string): void {
    if (!this.layer || !this.map || !code) {
      return;
    }
    this.layer.eachLayer((lyr: any) => {
      const p = lyr.feature?.properties || {};
      if (p.code === code) {
        try {
          this.map.fitBounds(lyr.getBounds(), {
            padding: [36, 36],
            maxZoom: this.mapLevel() === 'region' ? 7.5 : 9,
          });
        } catch { /* ignore */ }
      }
    });
  }

  // --- map ---
  private initMap(): void {
    const el = this.mapEl()?.nativeElement;
    if (!el || this.map || typeof L === 'undefined' || !this.viewReady) return;
    this.map = L.map(el, { center: [-6.2, 35.0], zoom: 6, minZoom: 5, maxBounds: this.TZ_BOUNDS, maxBoundsViscosity: 0.8 });
    try { addTanzaniaGisBase(this.map, this.http); } catch {}
    addMapNav(this.map, { home: [-6.2, 35.0, 6] });
    this.renderLegend();
    if (this.pendingGeo) { this.attachLayer(this.pendingGeo); this.pendingGeo = null; }
    else if (this.currentGeo) { this.attachLayer(this.currentGeo); }
    setTimeout(() => this.map?.invalidateSize(), 200);
  }
  private buildMapLayer(gj: any): void {
    this.currentGeo = gj;
    if (this.map) {
      this.attachLayer(gj);
    } else {
      this.pendingGeo = gj;
    }
  }
  private attachLayer(gj: any): void {
    if (this.layer) {
      try { this.map.removeLayer(this.layer); } catch { /* ignore */ }
      this.layer = null;
    }
    this.layer = L.geoJSON(gj, {
      style: () => ({ color: '#fff', weight: 1, fillColor: NO_DATA, fillOpacity: 0.82 }),
      onEachFeature: (f: any, lyr: any) => {
        const p = f.properties || {};
        lyr.bindTooltip(`<strong>${escapeHtml(p.name || p.code || this.t('council_word'))}</strong>`, { className: 'map-tip', sticky: true });
        lyr.on('click', () => { if (p.code) this.selectByCode(p.code); });
      },
    }).addTo(this.map);
    if (!this.fittedOnce) {
      try { this.map.fitBounds(this.layer.getBounds(), { padding: [10, 10] }); this.fittedOnce = true; } catch {}
    } else {
      try { this.map.fitBounds(this.layer.getBounds(), { padding: [10, 10] }); } catch {}
    }
    this.colourAll();
    this.syncFocusMap();
  }

  /**
   * Split-panel focus map: same metric colours, zoomed to the selected unit and isolating it
   * (other units dimmed) — mirrors inform.co.tz DistrictMap isolateKey + focusUnit.
   */
  private syncFocusMap(): void {
    if (!this.mapSplit() || !this.selected() || !this.currentGeo || typeof L === 'undefined') {
      if (this.focusMap && !this.mapSplit()) {
        try { this.focusMap.remove(); } catch { /* ignore */ }
        this.focusMap = null;
        this.focusLayer = null;
      }
      return;
    }
    const el = this.focusMapEl()?.nativeElement;
    if (!el) {
      return;
    }
    const code = this.selected()!.area;
    if (!this.focusMap) {
      this.focusMap = L.map(el, {
        center: [-6.2, 35.0],
        zoom: 7,
        minZoom: 5,
        maxBounds: this.TZ_BOUNDS,
        maxBoundsViscosity: 0.8,
        zoomControl: true,
      });
      try {
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap',
          maxZoom: 18,
        }).addTo(this.focusMap);
      } catch { /* ignore */ }
    }
    if (this.focusLayer) {
      try { this.focusMap.removeLayer(this.focusLayer); } catch { /* ignore */ }
      this.focusLayer = null;
    }
    const signals = this.mapMode() === 'signals';
    const rel = signals ? null : this.relColor();
    this.focusLayer = L.geoJSON(this.currentGeo, {
      style: (f: any) => {
        const c = f?.properties?.code;
        const r = c ? this.rowByCode.get(c) : null;
        const v = r?.value;
        const isSel = c === code;
        const fill = signals ? this.signalColor(v) : (rel ? rel(v) : classifyRisk(v).color);
        return {
          fillColor: fill,
          fillOpacity: v == null ? 0.12 : (isSel ? 0.88 : 0.12),
          color: isSel ? '#0f172a' : '#e2e8f0',
          weight: isSel ? 2.6 : 0.6,
        };
      },
      onEachFeature: (f: any, lyr: any) => {
        const p = f.properties || {};
        const r = p.code ? this.rowByCode.get(p.code) : null;
        lyr.bindTooltip(
          `<strong>${escapeHtml(p.name || p.code || '')}</strong><br>${escapeHtml(this.lensLabel(this.activeLens()))}: <b>${fmt(r?.value)}</b>`,
          { sticky: true, className: 'map-tip' },
        );
        lyr.on('click', () => { if (p.code) this.selectByCode(p.code); });
      },
    }).addTo(this.focusMap);
    // Zoom to the selected feature only.
    this.focusLayer.eachLayer((lyr: any) => {
      if (lyr.feature?.properties?.code === code) {
        try {
          this.focusMap.fitBounds(lyr.getBounds(), { padding: [24, 24], maxZoom: 10 });
        } catch { /* ignore */ }
      }
    });
    setTimeout(() => this.focusMap?.invalidateSize(), 80);
  }

  // Indicator lenses get a relative-quintile colour scale (own distribution); risk/dimension/category/
  // component lenses keep the authoritative INFORM class thresholds + colours.
  private relColor(): ((v: number | null | undefined) => string) | null {
    if (this.activeLens().level !== 'ind') return null;
    const vals = this.scored().map(r => r.value as number).sort((a, b) => a - b);
    if (!vals.length) return () => NO_DATA;
    const q = (pp: number) => vals[Math.max(0, Math.min(vals.length - 1, Math.floor(pp * (vals.length - 1))))];
    const th = [q(0.2), q(0.4), q(0.6), q(0.8)];
    return (v: number | null | undefined) => { if (v == null || !isFinite(v)) return NO_DATA; let i = 0; while (i < 4 && v > th[i]) i++; return REL_PAL[i]; };
  }

  private colourAll(): void {
    if (!this.layer) return;
    this.renderLegend();
    const signals = this.mapMode() === 'signals';
    const rel = signals ? null : this.relColor();
    const isInd = !signals && this.activeLens().level === 'ind';
    this.layer.eachLayer((lyr: any) => {
      const p = lyr.feature?.properties || {}; const code = p.code; const name = p.name || code || this.t('council_word');
      if (!code) return;
      const r = this.rowByCode.get(code);
      const v = r?.value;
      const isSel = this.selected()?.area === code;
      const cf = this.selectedOnly() ? null : this.classFilter();
      const dimmed = (cf && classifyRisk(v).level !== cf) || (this.selectedOnly() && this.selected() && this.selected()!.area !== code);
      const fill = signals ? this.signalColor(v) : (rel ? rel(v) : classifyRisk(v).color);
      const baseOp = signals
        ? (v == null ? 0.18 : this.reliabilityOpacity(this.signalReliability.get(code)))
        : (v == null ? 0.18 : 0.84);
      lyr.setStyle({
        fillColor: fill,
        fillOpacity: dimmed ? 0.12 : baseOp,
        color: isSel ? '#0f172a' : dimmed ? '#e2e8f0' : '#ffffff',
        weight: isSel ? 2.4 : 1,
      });
      if (signals) {
        const relTxt = this.signalReliability.get(code);
        lyr.setTooltipContent(
          `<strong>${escapeHtml(name)}</strong><br>${escapeHtml(this.signalHazard())} ${escapeHtml(this.t('signal_word'))}: <b>${v != null && isFinite(v) ? fmt(v) : '-'}</b>`
          + (relTxt ? `<br>${escapeHtml(this.t('reliability_word'))}: ${escapeHtml(relTxt)}` : '')
        );
      } else {
        const lbl = this.lensLabel(this.activeLens());
        const cls = classifyRisk(v);
        lyr.setTooltipContent(
          `<strong>${escapeHtml(name)}</strong><br>${escapeHtml(lbl)}: <b>${v != null && isFinite(v) ? fmt(v) : '-'}</b>${v == null || isInd ? '' : ' · ' + this.levelLabel(cls.level)}`
        );
      }
    });
  }

  private legendTitle(): string {
    if (this.mapMode() === 'signals') {
      return `${this.signalHazard()} ${this.t('signal_word')}`;
    }
    return this.lensLabel(this.activeLens()) + (this.activeLens().level === 'ind' ? ' ' + this.t('relative_suffix') : '');
  }
  private renderLegend(): void {
    if (!this.map) return;
    if (this.legend) this.map.removeControl(this.legend);
    const signals = this.mapMode() === 'signals';
    const isInd = !signals && this.activeLens().level === 'ind';
    this.legend = L.control({ position: 'bottomright' });
    this.legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'legend');
      let html = `<strong>${escapeHtml(this.legendTitle())}</strong><br>`;
      if (signals) {
        for (const b of this.SIGNAL_BANDS) html += `<i style="background:${b.color}"></i>${escapeHtml(b.label)}<br>`;
        html += `<div style="margin-top:.25rem;color:#64748b;font-size:.72rem">${escapeHtml(this.t('reliability_word'))} → opacity</div>`;
      } else if (isInd) {
        REL_LEGEND.forEach((lv, i) => { html += `<i style="background:${REL_PAL[i]}"></i>${escapeHtml(this.levelLabel(lv))}<br>`; });
      } else {
        for (const c of RISK_CLASSES) html += `<i style="background:${c.color}"></i>${escapeHtml(this.levelLabel(c.level))}<br>`;
      }
      html += `<i style="background:${NO_DATA}"></i>${escapeHtml(this.t('No data'))}<br>`;
      div.innerHTML = html; return div;
    };
    this.legend.addTo(this.map);
  }

  /* ============================================================================================
   * DISTRICT-DETAIL BARS — from the full /risk/{area} profile (categories / components / scores).
   * ============================================================================================ */

  // The two categories of a dimension, with their 0-10 scores.
  catBars(d: any, dimKey: 'hazard' | 'vulnerability' | 'coping'): { label: string; value: number | null }[] {
    const dim = this.structure().find(x => x.key === dimKey);
    const cats = d?.categories || {};
    if (!dim) return [];
    return dim.categories.map(c => ({ label: c.category, value: round1(cats[c.category]) }));
  }
  // The selected council's 4 highest indicator scores.
  topIndicatorBars(d: any): { label: string; value: number | null }[] {
    const scores = d?.scores || {};
    const arr: { label: string; value: number }[] = [];
    for (const id of Object.keys(scores)) { const v = scores[id]; if (typeof v === 'number' && isFinite(v)) arr.push({ label: this.indName(id), value: v }); }
    return arr.sort((a, b) => b.value - a.value).slice(0, 4).map(x => ({ label: x.label, value: round1(x.value) }));
  }
  // All component scores for the selected council, sorted high→low.
  private compBarData(d: any): { label: string; value: number | null }[] {
    const comps = d?.components || {};
    return Object.keys(comps)
      .map(k => ({ label: k, value: round1(comps[k]) }))
      .filter(x => x.value != null)
      .sort((a, b) => (b.value as number) - (a.value as number))
      .slice(0, 12);
  }

  /* ============================================================================================
   * PURE-SVG CHARTS — academic / Excel-style, dependency-free (BarChart / LineChart ports).
   * Rendered to HTML strings and bound with [innerHTML] (escapeHtml on every label).
   * ============================================================================================ */

  // Vertical column bar chart (distribution).
  private barColumnSvg(data: { label: string; value: number; color: string }[], max: number): string {
    const W = 540, H = 260, padL = 40, padR = 14, padT = 22, padB = 40;
    const plotW = W - padL - padR, plotH = H - padT - padB, x0 = padL, y0 = padT + plotH;
    const n = data.length || 1, band = plotW / n, bw = band * 0.52;
    const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
    const yOf = (v: number) => padT + plotH - (Math.max(0, v) / max) * plotH;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="font-family:Calibri,system-ui,sans-serif">`;
    for (const t of ticks) { s += `<line x1="${x0}" y1="${yOf(t)}" x2="${W - padR}" y2="${yOf(t)}" stroke="#edf1f6"/><text x="${x0 - 7}" y="${yOf(t) + 3.5}" text-anchor="end" font-size="10" fill="#334155">${Math.round(t)}</text>`; }
    s += `<line x1="${x0}" y1="${padT}" x2="${x0}" y2="${y0}" stroke="#94a3b8" stroke-width="1.25"/><line x1="${x0}" y1="${y0}" x2="${W - padR}" y2="${y0}" stroke="#94a3b8" stroke-width="1.25"/>`;
    data.forEach((d, i) => {
      const x = padL + i * band + (band - bw) / 2, y = yOf(d.value);
      s += `<rect x="${x}" y="${y}" width="${bw}" height="${y0 - y}" fill="${d.color}"/><text x="${x + bw / 2}" y="${y - 5}" text-anchor="middle" font-size="12" font-weight="700" fill="#0a0f1a">${d.value}</text><text x="${x + bw / 2}" y="${y0 + 15}" text-anchor="middle" font-size="9.5" fill="#334155">${escapeHtml(d.label)}</text>`;
    });
    return s + '</svg>';
  }

  // Horizontal bar chart (top units / component breakdown).
  private barHorizSvg(data: { label: string; sub?: string; value: number | null; color: string }[], max = 10): string {
    const rowH = 26, padL = 150, padR = 46, padT = 10, padB = 26, W = 540;
    const H = padT + padB + data.length * rowH, x0 = padL, plotW = W - padL - padR;
    const xOf = (v: number) => x0 + (Math.max(0, v) / max) * plotW;
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="font-family:Calibri,system-ui,sans-serif">`;
    for (const t of [0, max / 2, max]) { s += `<line x1="${xOf(t)}" y1="${padT}" x2="${xOf(t)}" y2="${H - padB}" stroke="#edf1f6"/><text x="${xOf(t)}" y="${H - padB + 15}" text-anchor="middle" font-size="10" fill="#334155">${Math.round(t)}</text>`; }
    s += `<line x1="${x0}" y1="${padT}" x2="${x0}" y2="${H - padB}" stroke="#94a3b8" stroke-width="1.25"/><line x1="${x0}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" stroke="#94a3b8" stroke-width="1.25"/>`;
    data.forEach((d, i) => {
      const y = padT + i * rowH, w = Math.max(1, (Math.max(0, d.value ?? 0) / max) * plotW);
      s += `<text x="${x0 - 8}" y="${y + rowH / 2 - 2}" text-anchor="end" font-size="11.5" font-weight="600" fill="#0a0f1a">${escapeHtml(d.label)}</text>`;
      if (d.sub) s += `<text x="${x0 - 8}" y="${y + rowH / 2 + 10}" text-anchor="end" font-size="9.5" fill="#334155">${escapeHtml(d.sub)}</text>`;
      s += `<rect x="${x0}" y="${y + 6}" width="${w}" height="${rowH - 13}" fill="${d.color}"/><text x="${x0 + w + 6}" y="${y + rowH / 2 + 2}" font-size="11.5" font-weight="700" fill="#0a0f1a">${d.value == null ? '-' : round1(d.value)}</text>`;
    });
    return s + '</svg>';
  }

  // Multi-series smooth line chart (regional profile + council-vs-national comparison).
  // `name` is the (translated) display label; the optional language-stable `key` is what the
  // `emphasize` argument is matched against, so highlighting survives the EN/SW switch.
  private lineSvg(series: { name: string; key?: string; color: string; values: (number | null)[] }[], xLabels: string[], emphasize: string, height: number, xTitle: string): string {
    const max = 10, W = 820, padL = 56, padR = 20, padT = 50, padB = 100, H = height;
    const plotW = W - padL - padR, plotH = H - padT - padB, x0 = padL, y0 = padT + plotH, n = xLabels.length || 1;
    const xOf = (i: number) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yOf = (v: number) => padT + plotH - (Math.max(0, Math.min(max, v)) / max) * plotH;
    const step = Math.ceil(n / 18);
    const smooth = (pts: number[][]) => {
      if (pts.length < 2) return pts.length ? `M${pts[0][0]},${pts[0][1]}` : '';
      let d = `M${pts[0][0]},${pts[0][1]}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
        d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)},${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)},${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
      }
      return d;
    };
    let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" style="font-family:Calibri,system-ui,sans-serif">`;
    // legend
    s += `<g transform="translate(${padL},22)">`;
    series.forEach((se, i) => { s += `<g transform="translate(${i * 188},0)"><line x1="0" y1="0" x2="24" y2="0" stroke="${se.color}" stroke-width="3" stroke-linecap="round"/><circle cx="12" cy="0" r="3.6" fill="#fff" stroke="${se.color}" stroke-width="2"/><text x="32" y="5" font-size="13" font-weight="600" fill="#0a0f1a">${escapeHtml(se.name)}</text></g>`; });
    s += `</g>`;
    for (const t of [0, 2, 4, 6, 8, 10]) { s += `<line x1="${x0}" y1="${yOf(t)}" x2="${padL + plotW}" y2="${yOf(t)}" stroke="#e8edf3"/><text x="${x0 - 11}" y="${yOf(t) + 4.5}" text-anchor="end" font-size="12" fill="#1e293b">${t}</text>`; }
    s += `<line x1="${x0}" y1="${padT}" x2="${x0}" y2="${y0}" stroke="#94a3b8" stroke-width="1.4"/><line x1="${x0}" y1="${y0}" x2="${padL + plotW}" y2="${y0}" stroke="#94a3b8" stroke-width="1.4"/>`;
    xLabels.forEach((lbl, i) => { if (i % step === 0) { const xx = xOf(i); s += `<line x1="${xx}" y1="${y0}" x2="${xx}" y2="${y0 + 5}" stroke="#94a3b8"/><text x="${xx}" y="${y0 + 9}" font-size="11" fill="#1e293b" text-anchor="end" transform="rotate(-45,${xx},${y0 + 9})">${escapeHtml(lbl)}</text>`; } });
    s += `<text x="${padL + plotW / 2}" y="${H - 8}" text-anchor="middle" font-size="13" font-weight="600" fill="#0a0f1a">${escapeHtml(xTitle)}</text>`;
    for (const se of series) {
      const em = emphasize && (se.key ?? se.name) === emphasize, dim = emphasize && !em;
      const pts = se.values.map((v, i) => (v == null ? null : [xOf(i), yOf(v)])).filter(Boolean) as number[][];
      if (!pts.length) continue;
      s += `<g opacity="${dim ? 0.72 : 1}"><path d="${smooth(pts)}" fill="none" stroke="${se.color}" stroke-width="${em ? 4 : 2.6}" stroke-linejoin="round" stroke-linecap="round"/>`;
      for (const [cx, cy] of pts) s += `<circle cx="${cx}" cy="${cy}" r="${em ? 4.2 : 3.2}" fill="#fff" stroke="${se.color}" stroke-width="${em ? 2.4 : 1.8}"/>`;
      s += `</g>`;
    }
    return s + '</svg>';
  }

  // SVG strings are built solely from numbers + escapeHtml'd labels, so they are safe to trust as HTML
  // (Angular's default sanitizer would otherwise strip the <svg> elements bound via [innerHTML]).
  private safe(svg: string): SafeHtml { return this.sanitizer.bypassSecurityTrustHtml(svg); }

  // --- chart bindings (recomputed reactively) ---
  distSvg = computed<SafeHtml>(() => {
    const counts: Record<string, number> = {}; for (const c of CLASS_LABELS) counts[c] = 0;
    for (const r of this.scored()) { const lvl = classifyRisk(r.value).level; counts[lvl] = (counts[lvl] || 0) + 1; }
    const data = RISK_CLASSES.map(c => ({ label: this.levelLabel(c.level), value: counts[c.level] || 0, color: c.color }));
    const max = Math.max(1, ...data.map(d => d.value)); const niceMax = Math.ceil(max / 5) * 5 || 5;
    return this.safe(this.barColumnSvg(data, niceMax));
  });
  topSvg = computed<SafeHtml>(() => {
    const top = [...this.scored()].sort((a, b) => (b.value as number) - (a.value as number)).slice(0, 12)
      .map(r => ({ label: r.name, sub: r.region, value: r.value, color: this.activeLens().level === 'ind' ? '#1f6feb' : classifyRisk(r.value).color }));
    return this.safe(this.barHorizSvg(top, 10));
  });
  regionalSvg = computed<SafeHtml>(() => {
    // Each unit keeps its own scores — never copy the selected unit onto all series.
    // Region level: rows ARE regions. Council level: average councils up to their parent region.
    let regional: { name: string; risk: number | null; hazard: number | null; vuln: number | null; cope: number | null }[];
    if (this.mapLevel() === 'region') {
      regional = this.rows()
        .map(r => ({
          name: r.name,
          risk: r.risk,
          hazard: r.hazard,
          vuln: r.vulnerability,
          cope: r.coping,
        }))
        .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0));
    } else {
      const byReg: Record<string, { risk: number[]; hazard: number[]; vuln: number[]; cope: number[] }> = {};
      for (const r of this.rows()) {
        const reg = r.region || 'Unknown';
        const b = (byReg[reg] = byReg[reg] || { risk: [], hazard: [], vuln: [], cope: [] });
        if (r.risk != null && isFinite(r.risk)) b.risk.push(r.risk);
        if (r.hazard != null && isFinite(r.hazard)) b.hazard.push(r.hazard);
        if (r.vulnerability != null && isFinite(r.vulnerability)) b.vuln.push(r.vulnerability);
        if (r.coping != null && isFinite(r.coping)) b.cope.push(r.coping);
      }
      const mean = (a: number[]) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
      regional = Object.entries(byReg)
        .map(([name, b]) => ({ name, risk: mean(b.risk), hazard: mean(b.hazard), vuln: mean(b.vuln), cope: mean(b.cope) }))
        .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0));
    }
    const series = [
      { name: this.t('inform_risk'), key: 'INFORM Risk', color: '#0f172a', values: regional.map(r => round1(r.risk)) },
      { name: this.t('dim_hazard'), key: 'Hazard and Exposure', color: '#FF9800', values: regional.map(r => round1(r.hazard)) },
      { name: this.t('dim_vulnerability'), key: 'Vulnerability', color: '#1f6feb', values: regional.map(r => round1(r.vuln)) },
      { name: this.t('dim_coping_short'), key: 'Lack of Coping', color: '#7c3aed', values: regional.map(r => round1(r.cope)) },
    ];
    return this.safe(this.lineSvg(series, regional.map(r => r.name), this.emphasize(), 440, this.t('x_region_ordered')));
  });
  detailCompSvg = computed<SafeHtml>(() => {
    const d = this.detail(); if (!d) return this.safe('');
    const data = this.compBarData(d).map(c => ({ label: c.label, value: c.value, color: classifyRisk(c.value).color }));
    return this.safe(this.barHorizSvg(data, 10));
  });
  detailCompareSvg = computed<SafeHtml>(() => {
    const d = this.detail(); if (!d) return this.safe('');
    const n = this.national();
    const xLabels = [this.t('dim_hazard'), this.t('dim_vulnerability'), this.t('dim_coping_short'), this.t('inform_risk')];
    const series = [
      { name: d.name, color: '#1f6feb', values: [round1(d.hazard), round1(d.vulnerability), round1(d.coping), round1(d.risk)] },
      { name: this.t('national_word'), color: '#94a3b8', values: n ? [round1(n.hazard), round1(n.vulnerability), round1(n.coping), round1(n.risk)] : [null, null, null, null] },
    ];
    return this.safe(this.lineSvg(series, xLabels, '', 280, this.t('x_inform_dimension')));
  });
}
