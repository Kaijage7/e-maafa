import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Chart: any; // Chart.js 4.4.0, loaded per-page from the same CDN as the P&M dashboard

interface Target {
  letter: string; title: string; value: number; valueLabel: string;
  normalized: number | null; normalizedLabel: string | null; indicators: string[];
  breakdown?: Record<string, number>;
}
interface Insight { icon: string; color: string; title: string; body: string; }
interface Indicator { code: string; target: string; title: string; unit: string; computedFrom: string; }

/** Sendai target identity colors (consistent across panels, chips and charts). */
const TARGET_COLORS: Record<string, string> = {
  A: '#dc2626', B: '#d97706', C: '#0d6efd', D: '#0891b2', E: '#7c3aed', F: '#e83e8c', G: '#059669',
};

/**
 * Sendai Analytics ("/m/reports-analytics/analytics") — the reporting face of the disaster
 * repository. Live progress panels for the seven Sendai global targets (every figure labeled
 * with the official indicator it reports), national loss trends, hazard and region profiles,
 * and the auto-computed insight cards that turn repository + operational data into the
 * arguments DMD uses with leadership, ministers and partners.
 */
@Component({
  selector: 'page-sendai-analytics',
  standalone: true,
  imports: [DecimalPipe, RouterLink, PageHeaderComponent, PanelComponent],
  template: `
    <dmis-page-header title="Sendai Analytics — Disaster Loss & Target Progress" icon="fa-chart-pie"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Reports & Analytics'}, {label:'Sendai Analytics'}]">
      <select class="form-select" style="min-width:120px;" [value]="year()" (change)="setYear($any($event.target).value)">
        @for (y of years(); track y) { <option [value]="y">{{ y }}</option> }
      </select>
    </dmis-page-header>

    <!-- Data-quality ribbon: how trustworthy the national numbers are right now -->
    <div class="panel-row">
      <div style="display:flex;align-items:center;gap:1.2rem;flex-wrap:wrap;background:#003366;border-radius:14px;padding:0.9rem 1.2rem;color:#fff;">
        <i class="fas fa-shield-halved" style="font-size:1.4rem;opacity:0.85;"></i>
        <div style="font-size:0.86rem;">
          <strong>{{ quality()['counted'] ?? 0 }}</strong> validated event cards feed these figures ·
          <strong>{{ quality()['awaiting'] ?? 0 }}</strong> awaiting EOCC validation ·
          <strong>{{ quality()['effectsRecords'] ?? 0 }}</strong> effects records ·
          <strong>{{ quality()['links'] ?? 0 }}</strong> operational links
        </div>
        <a routerLink="/m/reports-analytics/repository" style="margin-left:auto;color:#fff;font-size:0.8rem;font-weight:700;text-decoration:none;border:1px solid rgba(255,255,255,0.4);border-radius:9px;padding:0.35rem 0.9rem;">
          <i class="fas fa-database me-1"></i> Open the repository
        </a>
      </div>
    </div>

    <!-- The seven Sendai global targets -->
    <div class="panel-row" style="animation-delay:.05s;">
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:0.8rem;">
        @for (t of targets(); track t.letter) {
          <div style="border:1px solid var(--border);border-radius:14px;background:var(--card-bg,#fff);padding:1rem 1.1rem;border-top:4px solid;" [style.border-top-color]="color(t.letter)">
            <div style="display:flex;align-items:center;gap:10px;">
              <span [style.background]="color(t.letter)" style="width:34px;height:34px;border-radius:9px;color:#fff;font-weight:800;display:flex;align-items:center;justify-content:center;">{{ t.letter }}</span>
              <div style="font-size:0.74rem;font-weight:700;color:var(--text-mid);line-height:1.3;">{{ t.title }}</div>
            </div>
            <div style="font-size:1.55rem;font-weight:800;color:var(--text-dark);margin-top:0.55rem;">{{ t.value | number:'1.0-0' }}</div>
            <div style="font-size:0.68rem;color:var(--text-light);">{{ t.valueLabel }}</div>
            @if (t.normalized !== null) {
              <div style="margin-top:0.4rem;font-size:0.8rem;font-weight:700;" [style.color]="color(t.letter)">
                {{ t.normalized | number:'1.0-2' }} <span style="font-weight:500;color:var(--text-light);font-size:0.68rem;">{{ t.normalizedLabel }}</span>
              </div>
            }
            <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:0.55rem;">
              @for (c of t.indicators; track c) {
                <span style="font-size:0.58rem;font-weight:700;border:1px solid var(--border);border-radius:7px;padding:1px 6px;color:var(--text-mid);" [title]="indicatorTitle(c)">{{ c }}</span>
              }
            </div>
          </div>
        }
      </div>
    </div>

    <!-- Trends + hazard profile -->
    <div class="panel-row" style="animation-delay:.1s;display:grid;grid-template-columns:1.5fr 1fr;gap:1rem;">
      <dmis-panel title="National loss trend (validated cards, all years)" icon="fa-chart-line">
        <div class="panel-body"><div style="height:280px;"><canvas #trendChart></canvas></div></div>
      </dmis-panel>
      <dmis-panel title="Mortality by hazard" icon="fa-triangle-exclamation">
        <div class="panel-body"><div style="height:280px;"><canvas #hazardChart></canvas></div></div>
      </dmis-panel>
    </div>

    <!-- Insight layer -->
    <div class="panel-row" style="animation-delay:.15s;">
      <dmis-panel title="Insights — the case for DMD interventions" icon="fa-lightbulb" badge="auto-computed">
        <div class="panel-body" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:0.8rem;">
          @for (ins of insights(); track ins.title) {
            <div style="display:flex;gap:12px;border:1px solid var(--border);border-radius:12px;padding:0.85rem 1rem;">
              <span [style.background]="ins.color" style="flex-shrink:0;width:36px;height:36px;border-radius:10px;color:#fff;display:flex;align-items:center;justify-content:center;">
                <i class="fas {{ ins.icon }}" style="font-size:0.8rem;"></i>
              </span>
              <div>
                <div style="font-size:0.8rem;font-weight:800;color:var(--text-dark);">{{ ins.title }}</div>
                <div style="font-size:0.78rem;color:var(--text-mid);line-height:1.55;margin-top:2px;">{{ ins.body }}</div>
              </div>
            </div>
          } @empty {
            <p style="color:var(--text-light);font-size:0.84rem;margin:0;">Insights appear once validated event cards exist.</p>
          }
        </div>
      </dmis-panel>
    </div>

    <!-- Region ranking + indicator reference -->
    <div class="panel-row" style="animation-delay:.2s;display:grid;grid-template-columns:1fr 1fr;gap:1rem;align-items:start;">
      <dmis-panel title="Regions by recorded impact" icon="fa-map-location-dot" badge="DRR priority list">
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr><th>Region</th><th style="text-align:right;">Events</th><th style="text-align:right;">Deaths</th><th style="text-align:right;">Affected</th><th style="text-align:right;">Loss (TZS)</th></tr></thead>
            <tbody>
              @for (r of regions(); track r['region']) {
                <tr class="data-row">
                  <td class="r-title">{{ r['region'] }}</td>
                  <td style="text-align:right;">{{ r['events'] }}</td>
                  <td style="text-align:right;font-weight:700;color:#dc2626;">{{ r['deaths'] | number }}</td>
                  <td style="text-align:right;">{{ r['affected'] | number }}</td>
                  <td style="text-align:right;">{{ r['lossTzs'] | number:'1.0-0' }}</td>
                </tr>
              } @empty { <tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:1.5rem;">No validated effects yet.</td></tr> }
            </tbody>
          </table>
        </div>
      </dmis-panel>
      <dmis-panel title="Sendai indicator reference" icon="fa-book" [badge]="indicators().length + ' indicators'">
        <div class="panel-body" style="max-height:420px;overflow-y:auto;display:grid;gap:0.4rem;">
          @for (i of indicators(); track i.code) {
            <div style="display:flex;gap:10px;align-items:flex-start;border:1px solid var(--border);border-radius:9px;padding:0.5rem 0.7rem;">
              <span [style.background]="color(i.target)" style="flex-shrink:0;color:#fff;font-size:0.62rem;font-weight:800;border-radius:7px;padding:2px 8px;margin-top:2px;">{{ i.code }}</span>
              <div>
                <div style="font-size:0.74rem;font-weight:700;color:var(--text-dark);line-height:1.35;">{{ i.title }}</div>
                <div style="font-size:0.64rem;color:var(--text-light);margin-top:1px;"><i class="fas fa-plug me-1"></i>{{ i.computedFrom }}</div>
              </div>
            </div>
          }
        </div>
      </dmis-panel>
    </div>
  `,
})
export class SendaiAnalyticsComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  trendCanvas = viewChild<ElementRef<HTMLCanvasElement>>('trendChart');
  hazardCanvas = viewChild<ElementRef<HTMLCanvasElement>>('hazardChart');

  year = signal<number>(new Date().getFullYear());
  years = signal<number[]>([]);
  targets = signal<Target[]>([]);
  insights = signal<Insight[]>([]);
  regions = signal<Record<string, any>[]>([]);
  quality = signal<Record<string, number>>({});
  indicators = signal<Indicator[]>([]);

  private series: Record<string, any>[] = [];
  private hazards: Record<string, any>[] = [];
  private charts: any[] = [];
  private viewReady = false;
  private indicatorIndex = new Map<string, string>();

  constructor() {
    this.load(null);
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c.destroy());
  }

  color(letter: string): string { return TARGET_COLORS[letter] ?? '#64748b'; }
  indicatorTitle(code: string): string { return this.indicatorIndex.get(code) ?? code; }
  setYear(y: string): void { this.load(Number(y)); }

  private load(year: number | null): void {
    const q = year ? `?year=${year}` : '';
    this.http.get<any>(`/api/v1/repository/analytics${q}`).subscribe(r => {
      this.year.set(r.year);
      this.years.set(r.years);
      this.targets.set(r.targets);
      this.insights.set(r.insights);
      this.regions.set(r.regionRanking);
      this.quality.set(r.dataQuality);
      this.indicators.set(r.indicators);
      this.indicatorIndex = new Map(r.indicators.map((i: Indicator) => [i.code, i.title]));
      this.series = r.yearlySeries;
      this.hazards = r.hazardProfile;
      this.renderCharts();
    });
  }

  private renderCharts(): void {
    if (!this.viewReady || !this.series.length && !this.hazards.length) {
      return;
    }
    ensureChartJs().then(() => {
      this.charts.forEach(c => c.destroy());
      this.charts = [];
      const trendEl = this.trendCanvas()?.nativeElement;
      if (trendEl) {
        this.charts.push(new Chart(trendEl, {
          data: {
            labels: this.series.map(s => s['year']),
            datasets: [
              { type: 'bar', label: 'Deaths + missing', data: this.series.map(s => s['deaths']),
                backgroundColor: 'rgba(220,38,38,0.75)', borderRadius: 6, yAxisID: 'y' },
              { type: 'bar', label: 'Affected (thousands)', data: this.series.map(s => Number(s['affected']) / 1000),
                backgroundColor: 'rgba(217,119,6,0.65)', borderRadius: 6, yAxisID: 'y' },
              { type: 'line', label: 'Loss (TZS billions)', data: this.series.map(s => Number(s['lossTzs']) / 1e9),
                borderColor: '#0d6efd', backgroundColor: 'rgba(13,110,253,0.12)', fill: true, tension: 0.35, yAxisID: 'y1' },
            ],
          },
          options: {
            responsive: true, maintainAspectRatio: false,
            scales: { y: { beginAtZero: true }, y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } } },
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
          },
        }));
      }
      const hazardEl = this.hazardCanvas()?.nativeElement;
      if (hazardEl && this.hazards.length) {
        this.charts.push(new Chart(hazardEl, {
          type: 'doughnut',
          data: {
            labels: this.hazards.map(h => h['hazard']),
            datasets: [{ data: this.hazards.map(h => h['deaths']),
              backgroundColor: ['#dc2626', '#d97706', '#0d6efd', '#059669', '#7c3aed', '#0891b2', '#e83e8c', '#64748b'] }],
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '55%',
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
          },
        }));
      }
    });
  }
}

/** Same lazy CDN loader the P&M dashboard uses (Chart.js is not bundled). */
function ensureChartJs(): Promise<void> {
  return new Promise(resolve => {
    if (typeof Chart !== 'undefined') {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
    script.onload = () => resolve();
    document.head.appendChild(script);
  });
}
