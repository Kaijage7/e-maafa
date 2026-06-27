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
  standalone: true,
  imports: [],
  styles: [`
    :host { display:block; font-family:system-ui, -apple-system, "Segoe UI", sans-serif; color:#1e293b; }
    .wrap { max-width:1240px; margin:0 auto; padding:1rem; }
    .card { background:#fff; border:1px solid #e2e8f0; border-radius:12px; }
    .pad { padding:1rem 1.2rem; }
    .eyebrow { font-size:.7rem; font-weight:800; letter-spacing:.09em; text-transform:uppercase; color:#64748b; }
    .muted { color:#64748b; }
    .h2 { font-size:1.25rem; font-weight:900; margin:.1rem 0 .2rem; }

    .hero { background:linear-gradient(135deg,#0d3b66,#1f6feb); color:#fff; padding:1.8rem 1.4rem; border-radius:0 0 14px 14px; }
    .hero-row { max-width:1240px; margin:0 auto; display:flex; justify-content:space-between; align-items:flex-start; gap:1.4rem; flex-wrap:wrap; }
    .hero .eyebrow { color:rgba(255,255,255,.85); }
    .hero h1 { font-size:1.8rem; font-weight:900; margin:.3rem 0 .4rem; }
    .hero p { max-width:680px; opacity:.92; margin:0; font-size:.93rem; }
    .natbadge { text-align:center; background:rgba(255,255,255,.12); border:1px solid rgba(255,255,255,.3); border-radius:14px; padding:.7rem 1.2rem; min-width:130px; }
    .natbadge .v { font-size:2.1rem; font-weight:900; line-height:1; }
    .natbadge .b { font-size:.7rem; font-weight:800; margin-top:.35rem; padding:.12rem .5rem; border-radius:50px; display:inline-block; color:#fff; }

    .stats { display:flex; gap:1rem; flex-wrap:wrap; margin:-1.4rem auto 1rem; max-width:1240px; padding:0 1rem; }
    .stat { background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:.7rem 1rem; box-shadow:0 2px 8px rgba(0,0,0,.06); min-width:108px; }
    .stat .v { font-size:1.4rem; font-weight:900; color:#0d3b66; }
    .stat .l { font-size:.68rem; color:#64748b; font-weight:700; text-transform:uppercase; }

    .controls { margin-bottom:1rem; }
    .ctl-row { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; margin-bottom:.7rem; }
    .chips { display:flex; gap:.4rem; flex-wrap:wrap; }
    .chip { font:inherit; font-size:.78rem; font-weight:700; padding:.4rem .85rem; border-radius:50px; border:1.5px solid #cbd5e1; background:#fff; color:#475569; cursor:pointer; }
    .chip.on { background:#0d3b66; color:#fff; border-color:#0d3b66; }

    .indi { margin-top:.4rem; border-top:1px dashed #e2e8f0; padding-top:.7rem; }
    .indi-top { display:flex; align-items:center; gap:.6rem; flex-wrap:wrap; margin-bottom:.5rem; }
    .indi select { font:inherit; font-size:.8rem; padding:.35rem .5rem; border:1px solid #cbd5e1; border-radius:6px; max-width:340px; }
    .grp { margin:.45rem 0; }
    .grp-cat { font-size:.74rem; font-weight:800; color:#0d3b66; text-transform:uppercase; letter-spacing:.04em; }
    .grp-name { font-size:.72rem; font-weight:700; color:#475569; margin:.25rem 0 .15rem; }
    .ind-chips { display:flex; gap:.3rem; flex-wrap:wrap; }
    .ind-chip { font:inherit; font-size:.7rem; font-weight:600; padding:.2rem .55rem; border-radius:5px; border:1px solid #d7dee6; background:#f8fafc; color:#475569; cursor:pointer; }
    .ind-chip.on { background:#1f6feb; color:#fff; border-color:#1f6feb; }
    .ind-chip .own { opacity:.7; font-weight:500; }

    .catbar { display:flex; gap:.4rem; align-items:center; flex-wrap:nowrap; overflow-x:auto; margin-bottom:.9rem; padding:.5rem .8rem; }
    .cat { font:inherit; font-size:.74rem; font-weight:700; padding:.28rem .65rem; border-radius:50px; border:1.5px solid #cbd5e1; background:#fff; color:#475569; cursor:pointer; display:inline-flex; align-items:center; gap:.3rem; flex:none; white-space:nowrap; }
    .cat:disabled { opacity:.45; cursor:default; }
    .cat-dot { width:10px; height:10px; border-radius:50%; display:inline-block; }
    .cat-n { font-weight:800; opacity:.8; }

    .maprow { display:grid; grid-template-columns:1.35fr 1fr; gap:1rem; margin-bottom:1rem; }
    @media (max-width:980px){ .maprow { grid-template-columns:1fr; } }
    .map-wrap { position:relative; overflow:hidden; }
    #informExpMap { height:62vh; min-height:460px; border-radius:12px; z-index:1; }
    .leaflet-container { background:#e8edf2; } .leaflet-control-attribution { display:none !important; }
    .legend { background:#fff; padding:.5rem .65rem; border:1px solid #e2e8f0; border-radius:6px; box-shadow:0 1px 3px rgba(0,0,0,.08); font-size:.66rem; line-height:1.55; }
    .legend strong { font-size:.68rem; }
    .legend i { display:inline-block; width:11px; height:11px; border-radius:2px; margin-right:5px; vertical-align:middle; }

    .table-wrap { overflow:hidden; margin-bottom:1rem; }
    .table-head { display:flex; align-items:center; gap:.6rem; padding:.6rem 1rem; border-bottom:1px solid #eef2f7; }
    .table-actions { margin-left:auto; display:flex; gap:.4rem; }
    .table-scroll { max-height:52vh; overflow:auto; }
    table { width:100%; border-collapse:collapse; font-size:.82rem; }
    th, td { padding:.45rem .7rem; text-align:left; border-bottom:1px solid #f1f5f9; white-space:nowrap; }
    th { position:sticky; top:0; background:#f8fafc; font-size:.7rem; text-transform:uppercase; letter-spacing:.03em; color:#64748b; z-index:1; }
    th.sortable { cursor:pointer; user-select:none; }
    td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
    tbody tr { cursor:pointer; }
    tbody tr:hover { background:#f8fafc; }
    tbody tr.sel { background:#dbeafe; }
    .badge { font-size:.68rem; font-weight:800; padding:.1rem .5rem; border-radius:50px; color:#fff; }

    .detail-empty { padding:1.4rem; color:#64748b; }
    .detail-head { display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap; }
    .detail-score { text-align:right; font-size:2rem; font-weight:900; line-height:1; }
    .detail-score .badge { display:block; margin-top:.35rem; font-size:.7rem; }
    .dim-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:.9rem; margin-top:1rem; }
    .dim { border:1px solid #e2e8f0; border-radius:10px; padding:.7rem .85rem; }
    .dim-head { display:flex; justify-content:space-between; font-weight:800; font-size:.85rem; margin-bottom:.45rem; }
    .bar-row { display:flex; align-items:center; gap:.5rem; margin:.22rem 0; font-size:.76rem; }
    .bar-label { flex:0 0 46%; color:#334155; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .bar-track { flex:1; height:9px; background:#eef2f7; border-radius:50px; overflow:hidden; }
    .bar-fill { height:100%; border-radius:50px; }
    .bar-val { flex:0 0 28px; text-align:right; font-weight:700; font-variant-numeric:tabular-nums; }

    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom:1rem; }
    @media (max-width:980px){ .grid2 { grid-template-columns:1fr; } }
    .chart-card { background:#fff; border:1px solid #e2e8f0; border-radius:10px; padding:.8rem 1rem; }
    .chart-card h3 { font-size:.92rem; margin:0; }
    .chart-card .sub { font-size:.72rem; color:#64748b; margin:.1rem 0 .5rem; }
    .note { font-size:.73rem; color:#64748b; margin-top:.6rem; }
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
      <!-- LENS SELECTOR ------------------------------------------------------------------------ -->
      <div class="card pad controls">
        <div class="ctl-row">
          <span class="eyebrow">{{ t('colour_councils_by') }}</span>
          <div class="chips">
            @for (l of dimLenses(); track l.key) {
              <button class="chip" [class.on]="activeScope() === l.scope" (click)="setLens(l)">{{ lensLabel(l) }}</button>
            }
          </div>
        </div>

        @if (activeDim(); as dim) {
          <p class="muted" style="font-size:.8rem; margin:.1rem 0 .5rem;">{{ dimDesc() }}</p>
          <div class="indi">
            <div class="indi-top">
              <span class="eyebrow">{{ dimLabel(dim) }} — {{ t('drill_into') }}</span>
              <select (change)="onDrillSelect($event)">
                <option [value]="'dim:' + dim.key" [selected]="metricKey() === 'dim:' + dim.key">{{ t('whole') }} {{ dimLabel(dim) }} {{ t('paren_dimension') }}</option>
                @for (c of dim.categories; track c.category) {
                  <optgroup [label]="t('optgroup_category') + ' ' + c.category">
                    <option [value]="'cat:' + c.category" [selected]="metricKey() === 'cat:' + c.category">{{ c.category }} {{ t('paren_category') }}</option>
                    @for (comp of c.components; track comp.component) {
                      <option [value]="'comp:' + comp.component" [selected]="metricKey() === 'comp:' + comp.component">  {{ comp.component }} {{ t('paren_component') }}</option>
                      @for (ind of comp.indicators; track ind.id) {
                        <option [value]="'ind:' + ind.id" [selected]="metricKey() === 'ind:' + ind.id">    {{ ind.name }}</option>
                      }
                    }
                  </optgroup>
                }
              </select>
            </div>
            @for (c of dim.categories; track c.category) {
              <div class="grp">
                <button class="ind-chip" [class.on]="metricKey() === 'cat:' + c.category"
                        (click)="setMetric('cat:' + c.category, 'cat', c.category)" style="font-weight:800;">
                  <span class="grp-cat">{{ c.category }}</span>
                </button>
                @for (comp of c.components; track comp.component) {
                  <div class="grp-name">{{ comp.component }}</div>
                  <div class="ind-chips">
                    <button class="ind-chip" [class.on]="metricKey() === 'comp:' + comp.component"
                            (click)="setMetric('comp:' + comp.component, 'comp', comp.component)" style="font-style:italic;">{{ t('whole_component') }}</button>
                    @for (ind of comp.indicators; track ind.id) {
                      <button class="ind-chip" [class.on]="metricKey() === 'ind:' + ind.id"
                              (click)="setMetric('ind:' + ind.id, 'ind', ind.name)" [title]="ind.id">
                        {{ ind.name }}@if (ind.owner) { <span class="own"> · {{ ind.owner }}</span> }
                      </button>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>

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

      <!-- MAP + REGIONAL PROFILE --------------------------------------------------------------- -->
      <div class="maprow">
        <div class="card map-wrap">
          <div #mapEl id="informExpMap"></div>
        </div>
        <div class="card pad">
          <div class="eyebrow">{{ t('regional_profile') }}</div>
          <div class="sub muted" style="font-size:.72rem; margin:.1rem 0 .3rem;">{{ t('regional_sub') }}{{ emphasize() ? ' ' + t('highlighting') + ' ' + emphasizeLabel() : '' }}</div>
          <div [innerHTML]="regionalSvg()"></div>
        </div>
      </div>

      <!-- RANKED TABLE ------------------------------------------------------------------------- -->
      <div class="card table-wrap">
        <div class="table-head">
          <span class="muted" style="font-weight:700;">{{ filtered().length }} {{ t('councils') }}</span>
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
              <div class="detail-score" [style.color]="cls(d.risk).color">
                {{ fmt(d.risk) }}
                <span class="badge" [style.background]="cls(d.risk).color">{{ levelLabel(cls(d.risk).level) }}</span>
              </div>
            </div>

            <div class="dim-grid">
              <div class="dim">
                <div class="dim-head"><span>{{ t('dim_hazard') }}</span><b [style.color]="cls(d.hazard).color">{{ fmt(d.hazard) }}</b></div>
                @for (b of catBars(d, 'hazard'); track b.label) {
                  <div class="bar-row" [title]="b.label + ': ' + fmt(b.value)">
                    <span class="bar-label">{{ b.label }}</span>
                    <span class="bar-track"><span class="bar-fill" [style.width]="pct(b.value)" [style.background]="cls(b.value).color"></span></span>
                    <span class="bar-val">{{ fmt(b.value) }}</span>
                  </div>
                }
              </div>
              <div class="dim">
                <div class="dim-head"><span>{{ t('dim_vulnerability') }}</span><b [style.color]="cls(d.vulnerability).color">{{ fmt(d.vulnerability) }}</b></div>
                @for (b of catBars(d, 'vulnerability'); track b.label) {
                  <div class="bar-row" [title]="b.label + ': ' + fmt(b.value)">
                    <span class="bar-label">{{ b.label }}</span>
                    <span class="bar-track"><span class="bar-fill" [style.width]="pct(b.value)" [style.background]="cls(b.value).color"></span></span>
                    <span class="bar-val">{{ fmt(b.value) }}</span>
                  </div>
                }
              </div>
              <div class="dim">
                <div class="dim-head"><span>{{ t('dim_coping_short') }}</span><b [style.color]="cls(d.coping).color">{{ fmt(d.coping) }}</b></div>
                @for (b of catBars(d, 'coping'); track b.label) {
                  <div class="bar-row" [title]="b.label + ': ' + fmt(b.value)">
                    <span class="bar-label">{{ b.label }}</span>
                    <span class="bar-track"><span class="bar-fill" [style.width]="pct(b.value)" [style.background]="cls(b.value).color"></span></span>
                    <span class="bar-val">{{ fmt(b.value) }}</span>
                  </div>
                }
              </div>
              <div class="dim">
                <div class="dim-head"><span>{{ t('top_indicators') }}</span></div>
                @for (b of topIndicatorBars(d); track b.label) {
                  <div class="bar-row" [title]="b.label + ': ' + fmt(b.value)">
                    <span class="bar-label">{{ b.label }}</span>
                    <span class="bar-track"><span class="bar-fill" [style.width]="pct(b.value)" [style.background]="cls(b.value).color"></span></span>
                    <span class="bar-val">{{ fmt(b.value) }}</span>
                  </div>
                }
                @if (!topIndicatorBars(d).length) { <div class="muted" style="font-size:.78rem;">{{ t('no_indicator_data') }}</div> }
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
          </div>
        } @else {
          <div class="detail-empty">{{ t('detail_empty') }}</div>
        }
      </div>

      <p class="note">{{ t('note_a') }} {{ stats().regions }} {{ t('note_regions') }} · {{ stats().councils }} {{ t('note_councils') }} · {{ stats().indicators }} {{ t('note_indicators') }}. {{ t('note_b') }}</p>
    </div>
  `,
})
export class PublicInformExplorerComponent implements AfterViewInit, OnDestroy {
  /** When embedded inside the Portal page, suppress the standalone hero. */
  embedded = input(false);
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  L = inject(PortalLabels);
  mapEl = viewChild<ElementRef>('mapEl');

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
    'hero_desc':          { en: 'Choose a lens — overall INFORM risk, a dimension, or any single indicator — to recolour the council choropleth and the ranked table. Click a council for its full INFORM profile.', sw: 'Chagua kioo — hatari ya jumla ya INFORM, kipimo, au kiashiria chochote kimoja — kutia rangi upya ramani ya halmashauri na jedwali lililopangwa. Bofya halmashauri kuona wasifu wake kamili wa INFORM.' },
    'risk_suffix':        { en: 'Risk', sw: 'Hatari' },
    // Stats
    'stat_councils':      { en: 'Councils', sw: 'Halmashauri' },
    'stat_regions':       { en: 'Regions', sw: 'Mikoa' },
    'stat_dimensions':    { en: 'Dimensions', sw: 'Vipimo' },
    'stat_indicators':    { en: 'Indicators', sw: 'Viashiria' },
    // Lens selector
    'colour_councils_by': { en: 'Colour councils by', sw: 'Tia rangi halmashauri kwa' },
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
  };

  /** Translate a component-local key to the portal's current language; falls back to English, then the key. */
  t(k: string): string { return this.TR[k]?.[this.L.lang()] ?? this.TR[k]?.en ?? k; }
  /** Render a risk-class / relative-band level in the current language (the English `.level` stays the key). */
  levelLabel(level: string): string { return this.TR[level]?.[this.L.lang()] ?? this.TR[level]?.en ?? level; }
  /**
   * Display label for a lens. The overall-risk lens carries a hardcoded English label that we
   * translate; every drill-down lens (dimension / category / component / indicator) carries an
   * API-supplied name, which — like council and region names — renders as-is in both languages.
   */
  lensLabel(l: Lens): string { return l.level === 'risk' ? this.t('overall_inform_risk') : l.label; }
  /** Dimension name shown in the drill panel — supplied by the API, so it renders as-is. */
  dimLabel(dim: Dim): string { return dim.dimension; }
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

  private map: any; private layer: any; private legend: any; private viewReady = false;
  private rowByCode = new Map<string, RiskRow>();
  private regionByCode = new Map<string, string>();
  private readonly TZ_BOUNDS = [[-12.0, 28.5], [-0.8, 41.2]];

  metricKey = computed(() => this.activeLens().key);
  activeScope = computed(() => this.activeLens().scope);
  // The dimension being drilled, if the active lens lives inside one (so we show its drill panel).
  activeDim = computed<Dim | null>(() => {
    const l = this.activeLens();
    if (l.level === 'risk') return null;
    const struct = this.structure();
    if (l.level === 'dim') return struct.find(d => d.key === l.scope) || null;
    if (l.level === 'cat') return struct.find(d => d.categories.some(c => c.category === l.scope)) || null;
    if (l.level === 'comp') return struct.find(d => d.categories.some(c => c.components.some(cm => cm.component === l.scope))) || null;
    if (l.level === 'ind') return struct.find(d => d.categories.some(c => c.components.some(cm => cm.indicators.some(i => i.id === l.scope)))) || null;
    return null;
  });
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
    // load the council geojson region names first (so the table/detail can show the region)
    this.http.get<any>('/geojson/tz_councils.geojson').subscribe({
      next: gj => { for (const f of gj?.features || []) { const p = f.properties || {}; if (p.code) this.regionByCode.set(p.code, p.reg); } this.buildMapLayer(gj); this.loadLens(); },
      error: () => this.loadLens(),
    });

    // recolour + resize whenever the active lens changes; re-fit when the map becomes visible.
    effect(() => {
      this.rows();           // recolour when fresh lens data arrives
      this.selected();
      this.classFilter();
      this.selectedOnly();
      this.L.lang();         // re-render the imperative legend + tooltips on a language switch
      this.colourAll();
      setTimeout(() => { if (this.map) { this.map.invalidateSize(); try { if (this.layer) this.map.fitBounds(this.layer.getBounds(), { padding: [10, 10] }); } catch {} } }, 120);
    });
  }
  ngAfterViewInit(): void { this.viewReady = true; this.initMap(); }
  ngOnDestroy(): void { this.map?.remove(); }

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

  // --- lens control ---
  setLens(l: Lens): void { this.activeLens.set(l); this.classFilter.set(null); this.selectedOnly.set(false); this.loadLens(); }
  setMetric(key: string, level: 'cat' | 'comp' | 'ind', scope: string): void {
    const label = this.labelFor(key, level, scope);
    this.activeLens.set({ key, label, level, scope });
    this.loadLens();
  }
  onDrillSelect(e: Event): void {
    const key = (e.target as HTMLSelectElement).value;
    if (key.startsWith('dim:')) { const dk = key.slice(4); const dim = this.structure().find(d => d.key === dk); if (dim) this.activeLens.set({ key, label: dim.dimension, level: 'dim', scope: dk }); }
    else if (key.startsWith('cat:')) this.activeLens.set({ key, label: this.labelFor(key, 'cat', key.slice(4)), level: 'cat', scope: key.slice(4) });
    else if (key.startsWith('comp:')) this.activeLens.set({ key, label: this.labelFor(key, 'comp', key.slice(5)), level: 'comp', scope: key.slice(5) });
    else if (key.startsWith('ind:')) { const id = key.slice(4); this.activeLens.set({ key, label: this.indName(id), level: 'ind', scope: id }); }
    this.loadLens();
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
    this.http.get<RiskRow[]>(`/api/v1/portal/inform/risk?level=council&metric=${encodeURIComponent(key)}`).subscribe({
      next: rows => {
        const list = (rows || []).map(r => ({ ...r, region: this.regionByCode.get(r.area) }));
        this.rows.set(list);
        this.rowByCode.clear(); for (const r of list) this.rowByCode.set(r.area, r);
        // National headline = mean across councils (subnational model is authoritative; honest summary).
        if (key === 'risk') {
          const mean = (k: keyof RiskRow) => { const v = list.map(r => r[k] as number).filter(x => x != null && isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
          this.national.set({ area: 'TZ', name: 'Tanzania', risk: mean('risk'), hazard: mean('hazard'), vulnerability: mean('vulnerability'), coping: mean('coping'), value: mean('risk') });
        }
        this.colourAll();
      },
      error: () => {},
    });
  }

  // --- table / filter control ---
  toggleSort(): void { this.sortDesc.update(v => !v); }
  showAll(): void { this.classFilter.set(null); this.selectedOnly.set(false); }
  setClassFilter(level: string): void { this.classFilter.set(this.classFilter() === level && !this.selectedOnly() ? null : level); this.selectedOnly.set(false); }
  toggleSelectedOnly(): void { if (!this.selected()) return; this.selectedOnly.update(v => !v); this.classFilter.set(null); }
  selectRow(r: RiskRow): void { this.selectByCode(r.area); }

  private selectByCode(code: string): void {
    const r = this.rowByCode.get(code) || null;
    this.selected.set(r);
    this.detail.set(null);
    if (!r) return;
    this.http.get<any>(`/api/v1/portal/inform/risk/${encodeURIComponent(code)}`).subscribe({
      next: d => this.detail.set({ ...d, name: r.name, region: r.region }),
      error: () => {},
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
    setTimeout(() => this.map?.invalidateSize(), 200);
  }
  private pendingGeo: any = null;
  private buildMapLayer(gj: any): void { if (this.map) this.attachLayer(gj); else this.pendingGeo = gj; }
  private attachLayer(gj: any): void {
    this.layer = L.geoJSON(gj, {
      style: () => ({ color: '#fff', weight: 1, fillColor: NO_DATA, fillOpacity: 0.82 }),
      onEachFeature: (f: any, lyr: any) => {
        const p = f.properties || {};
        lyr.bindTooltip(`<strong>${escapeHtml(p.name || p.code || this.t('council_word'))}</strong>`, { sticky: true });
        lyr.on('click', () => { if (p.code) this.selectByCode(p.code); });
      },
    }).addTo(this.map);
    try { this.map.fitBounds(this.layer.getBounds(), { padding: [10, 10] }); } catch {}
    this.colourAll();
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
    const rel = this.relColor();
    const isInd = this.activeLens().level === 'ind';
    this.layer.eachLayer((lyr: any) => {
      const p = lyr.feature?.properties || {}; const code = p.code; const name = p.name || code || this.t('council_word');
      if (!code) return;
      const r = this.rowByCode.get(code);
      const v = r?.value;
      const isSel = this.selected()?.area === code;
      const cf = this.selectedOnly() ? null : this.classFilter();
      const dimmed = (cf && classifyRisk(v).level !== cf) || (this.selectedOnly() && this.selected() && this.selected()!.area !== code);
      lyr.setStyle({
        fillColor: rel ? rel(v) : classifyRisk(v).color,
        fillOpacity: v == null ? 0.18 : dimmed ? 0.12 : 0.84,
        color: isSel ? '#0f172a' : dimmed ? '#e2e8f0' : '#ffffff',
        weight: isSel ? 2.4 : 1,
      });
      const lbl = this.lensLabel(this.activeLens());
      const cls = classifyRisk(v);
      lyr.setTooltipContent(
        `<strong>${escapeHtml(name)}</strong><br>${escapeHtml(lbl)}: <b>${v != null && isFinite(v) ? fmt(v) : '-'}</b>${v == null || isInd ? '' : ' · ' + this.levelLabel(cls.level)}`
      );
    });
  }

  private legendTitle(): string { return this.lensLabel(this.activeLens()) + (this.activeLens().level === 'ind' ? ' ' + this.t('relative_suffix') : ''); }
  private renderLegend(): void {
    if (!this.map) return;
    if (this.legend) this.map.removeControl(this.legend);
    const isInd = this.activeLens().level === 'ind';
    this.legend = L.control({ position: 'bottomright' });
    this.legend.onAdd = () => {
      const div = L.DomUtil.create('div', 'legend');
      let html = `<strong>${escapeHtml(this.legendTitle())}</strong><br>`;
      if (isInd) { REL_LEGEND.forEach((lv, i) => { html += `<i style="background:${REL_PAL[i]}"></i>${escapeHtml(this.levelLabel(lv))}<br>`; }); }
      else { for (const c of RISK_CLASSES) html += `<i style="background:${c.color}"></i>${escapeHtml(this.levelLabel(c.level))}<br>`; }
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
    // Mean per region across the council rows.
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
    const regional = Object.entries(byReg)
      .map(([name, b]) => ({ name, risk: mean(b.risk), hazard: mean(b.hazard), vuln: mean(b.vuln), cope: mean(b.cope) }))
      .sort((a, b) => (b.risk ?? 0) - (a.risk ?? 0));
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
