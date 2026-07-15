import { DecimalPipe, DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

type Row = Record<string, any>;

/**
 * Economics of Disaster — formula-automated view.
 * Every KPI is recomputed live via GET /v1/finance/economics (no static placed figures).
 * formulaAudit[] shows expression → substituted inputs → result for each step.
 */
@Component({
    selector: 'page-economics-of-disaster',
    imports: [DecimalPipe, DatePipe, RouterLink, PageHeaderComponent, PanelComponent],
    styles: [`
    .intro { background:#f0f9ff; border:1px solid #bae6fd; border-radius:10px; padding:12px 14px; margin-bottom:14px; font-size:0.88rem; color:#0c4a6e; line-height:1.5; }
    .intro strong { color:#0f172a; }
    .auto-bar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:12px; }
    .auto-bar .pill { font-size:0.75rem; font-weight:700; padding:4px 10px; border-radius:999px; background:#dcfce7; color:#166534; }
    .auto-bar .pill.warn { background:#ffedd5; color:#9a3412; }
    .auto-bar button { font-size:0.8rem; font-weight:700; border:1px solid #0d6efd; background:#0d6efd; color:#fff; border-radius:8px; padding:6px 12px; cursor:pointer; font-family:inherit; }
    .auto-bar button:disabled { opacity:0.55; cursor:default; }
    .stat-strip { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:10px; margin-bottom:14px; }
    .stat { background:#fff; border:1px solid #e3e6ed; border-radius:10px; padding:10px 14px; }
    .stat b { font-size:1.15rem; display:block; color:#0f5132; font-variant-numeric:tabular-nums; }
    .stat span { font-size:0.72rem; color:#6c757d; text-transform:uppercase; letter-spacing:0.35px; font-weight:700; }
    .stat small { font-size:0.75rem; color:#94a3b8; }
    .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
    @media (max-width:960px){ .grid2 { grid-template-columns:1fr; } }
    table { width:100%; border-collapse:collapse; font-size:0.82rem; }
    th { text-align:left; font-size:0.72rem; text-transform:uppercase; color:#6c757d; padding:7px 8px; border-bottom:2px solid #e3e6ed; }
    td { padding:7px 8px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
    .num { text-align:right; font-variant-numeric:tabular-nums; }
    .chip { display:inline-block; font-size:0.72rem; font-weight:700; border-radius:8px; padding:2px 8px; background:#e0e7ff; color:#3730a3; }
    .chip.gap { background:#fee2e2; color:#991b1b; }
    .chip.ok { background:#dcfce7; color:#166534; }
    .bar { height:8px; background:#e9eef3; border-radius:4px; overflow:hidden; max-width:160px; }
    .bar > i { display:block; height:100%; background:#0d6efd; }
    .kv { display:flex; justify-content:space-between; gap:10px; padding:5px 0; border-bottom:1px dashed #f1f5f9; font-size:0.84rem; }
    .kv b { font-variant-numeric:tabular-nums; }
    .formula { font-size:0.78rem; color:#475569; background:#f8fafc; border-left:3px solid #0d6efd; padding:8px 10px; margin:8px 0; line-height:1.45; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
    .limits { font-size:0.8rem; color:#64748b; margin:0; padding-left:1.1rem; }
    .limits li { margin:3px 0; }
    .err { background:#fee2e2; color:#991b1b; padding:10px 12px; border-radius:8px; margin-bottom:12px; }
    .muted { color:#64748b; font-size:0.82rem; }
    .linkrow { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
    .linkrow a { font-size:0.8rem; font-weight:600; color:#0d6efd; text-decoration:none; border:1px solid #bfdbfe; background:#eff6ff; padding:5px 10px; border-radius:7px; }
    .rules { font-size:0.8rem; color:#475569; margin:6px 0 0; padding-left:1.1rem; }
    .rules li { margin:4px 0; }
    .audit-id { font-family:ui-monospace,monospace; font-weight:700; color:#1e40af; }
    .expr { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:0.76rem; color:#334155; }
    .inputs { font-size:0.74rem; color:#64748b; max-width:280px; word-break:break-word; }
  `],
    template: `
    <dmis-page-header title="Economics of Disaster" icon="fa-chart-line"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Budget & Finance', url:'/m/budget-finance/budgets'}, {label:'Economics of Disaster'}]">
    </dmis-page-header>

    <div class="linkrow">
      <a routerLink="/m/budget-finance/budgets"><i class="fas fa-wallet me-1"></i> Budgets &amp; NDMF</a>
      <a routerLink="/m/monitoring-evaluation/dashboard"><i class="fas fa-gauge me-1"></i> M&amp;E dashboard</a>
      <a routerLink="/m/response/resources"><i class="fas fa-boxes-stacked me-1"></i> Resources</a>
      <a routerLink="/m/preparedness/trainings"><i class="fas fa-chalkboard-user me-1"></i> Trainings</a>
    </div>

    @if (error()) {
      <div class="err"><i class="fas fa-triangle-exclamation me-1"></i> {{ error() }}</div>
    }

    <div class="auto-bar">
      <span class="pill">Formula engine · live recompute</span>
      <span class="pill" [class.warn]="r(data() || {},'budgetGap')['status'] === 'GAP'">
        Gap status: {{ r(data() || {},'budgetGap')['status'] || '—' }}
      </span>
      <button type="button" (click)="load()" [disabled]="loading()">
        <i class="fas fa-arrows-rotate me-1"></i> {{ loading() ? 'Recomputing…' : 'Recompute formulas' }}
      </button>
      @if (data(); as d) {
        <span class="muted">Last run {{ d['generatedAt'] | date:'medium' }} · {{ d['modelVersion'] }}</span>
      }
    </div>

    @if (data(); as d) {
      <div class="intro">
        <strong>Automated economics — not static placements.</strong>
        Every figure is either a live SQL ledger sum or the output of a named formula with substituted inputs
        (see <em>Formula workbook</em> below). Forecast is deterministic (not AI) and recomputes on each load from
        trailing incidents, seasonal factors, open threats, DRR preparedness, and category shares.
        <br><span class="muted">{{ r(d,'automation')['note'] || d['disclaimer'] }}</span>
      </div>

      <div class="stat-strip">
        <div class="stat">
          <b>{{ n(r(d,'cash')['totalCashOutlayTzs']) | number:'1.0-0' }}</b>
          <span>Historical cash outlay</span>
          <small>H1 · disbursed + NDMF + gov</small>
        </div>
        <div class="stat">
          <b>{{ n(r(d,'inKind')['inKindValueTzs']) | number:'1.0-0' }}</b>
          <span>In-kind deployed value</span>
          <small>allocations × unit cost</small>
        </div>
        <div class="stat">
          <b>{{ n(r(d,'interventions')['drrInterventionEnvelopeTzs']) | number:'1.0-0' }}</b>
          <span>DRR envelope</span>
          <small>D1 · mitigation + AAP + contingency</small>
        </div>
        <div class="stat">
          <b>{{ n(r(d,'forecast')['forecastTotalEconomicNeedTzs']) | number:'1.0-0' }}</b>
          <span>12-mo economic need</span>
          <small>F9 · cash + in-kind + anticipatory</small>
        </div>
        <div class="stat">
          <b>{{ d['preparednessIndex'] ?? 0 }}</b>
          <span>Preparedness index</span>
          <small>R4 · dampens caseload</small>
        </div>
        <div class="stat">
          <b>{{ d['threatPressureIndex'] ?? 0 }}</b>
          <span>Threat pressure</span>
          <small>T1 · open EW + incidents</small>
        </div>
      </div>

      <dmis-panel title="Automated budget gap (formulas)" icon="fa-scale-balanced"
        [badge]="r(d,'budgetGap')['status'] || ''">
        <div class="stat-strip">
          <div class="stat">
            <b>{{ n(r(d,'budgetGap')['availableCashTzs']) | number:'1.0-0' }}</b>
            <span>Available cash</span>
            <small>{{ r(d,'budgetGap')['availableCashFormula'] }}</small>
          </div>
          <div class="stat">
            <b>{{ n(r(d,'budgetGap')['forecastCashNeedTzs']) | number:'1.0-0' }}</b>
            <span>Forecast cash need</span>
            <small>response + anticipatory</small>
          </div>
          <div class="stat">
            <b>{{ n(r(d,'budgetGap')['cashGapTzs']) | number:'1.0-0' }}</b>
            <span>Cash gap (G2)</span>
            <small>positive = shortfall</small>
          </div>
          <div class="stat">
            <b>{{ n(r(d,'budgetGap')['inKindGapTzs']) | number:'1.0-0' }}</b>
            <span>In-kind gap (G3)</span>
            <small>need − warehouse stock</small>
          </div>
          <div class="stat">
            <b>{{ r(d,'budgetGap')['cashCoveragePct'] ?? 0 }}%</b>
            <span>Cash coverage</span>
            <small>available ÷ need</small>
          </div>
          <div class="stat">
            <b>{{ r(d,'budgetGap')['inKindCoveragePct'] ?? 0 }}%</b>
            <span>Stock coverage</span>
            <small>stock ÷ in-kind need</small>
          </div>
        </div>
        <p class="muted">{{ r(d,'budgetGap')['note'] }}</p>
      </dmis-panel>

      <div class="grid2">
        <dmis-panel title="Cash economy (historical · live SQL)" icon="fa-coins">
          <div class="kv"><span>Budget envelope / line allocated</span><b>{{ n(r(d,'cash')['allocatedTzs']) | number:'1.0-0' }}</b></div>
          <div class="kv"><span>Committed</span><b>{{ n(r(d,'cash')['committedTzs']) | number:'1.0-0' }}</b></div>
          <div class="kv"><span>Disbursed</span><b>{{ n(r(d,'cash')['disbursedTzs']) | number:'1.0-0' }}</b></div>
          <div class="kv"><span>Execution % (H2)</span><b>{{ r(d,'cash')['executionPct'] ?? 0 }}%</b></div>
          <div class="kv"><span>NDMF donations / disbursed / balance</span>
            <b>{{ n(r(d,'cash')['ndmfDonationsTzs']) | number:'1.0-0' }} /
               {{ n(r(d,'cash')['ndmfDisbursedTzs']) | number:'1.0-0' }} /
               {{ n(r(d,'cash')['ndmfBalanceTzs']) | number:'1.0-0' }}</b></div>
          <div class="kv"><span>NDMF linked to trainings</span><b>{{ n(r(d,'cash')['ndmfTrainingLinkedDisbursedTzs']) | number:'1.0-0' }}</b></div>
          <div class="kv"><span>Recorded gov response</span><b>{{ n(r(d,'cash')['recordedGovResponseTzs']) | number:'1.0-0' }}</b></div>
        </dmis-panel>

        <dmis-panel title="Resources &amp; interventions (live SQL)" icon="fa-boxes-stacked">
          <div class="kv"><span>In-kind allocation value</span><b>{{ n(r(d,'inKind')['inKindValueTzs']) | number:'1.0-0' }}</b></div>
          <div class="kv"><span>Stock value / relief value</span>
            <b>{{ n(r(d,'inKind')['stockValueTzs']) | number:'1.0-0' }} /
               {{ n(r(d,'inKind')['reliefValueTzs']) | number:'1.0-0' }}</b></div>
          <div class="kv"><span>Mitigation / training / contingency / AAP</span>
            <b>{{ r(d,'interventions')['mitigationMeasures'] || 0 }} /
               {{ r(d,'interventions')['trainingPlans'] || 0 }} /
               {{ r(d,'interventions')['contingencyPlans'] || 0 }} /
               {{ r(d,'interventions')['anticipatoryPlans'] || 0 }}</b></div>
          <div class="kv"><span>AAP / contingency budgets</span>
            <b>{{ n(r(d,'interventions')['anticipatoryBudgetTzs']) | number:'1.0-0' }} /
               {{ n(r(d,'interventions')['contingencyBudgetTzs']) | number:'1.0-0' }}</b></div>
          <div class="kv"><span>Active EW / open incidents</span>
            <b>{{ r(d,'threats')['active_ew'] || 0 }} / {{ r(d,'threats')['open_incidents'] || 0 }}</b></div>
          <div class="kv"><span>Warehouses / EC capacity</span>
            <b>{{ r(d,'readiness')['permanent_warehouses'] || 0 }} /
               {{ n(r(d,'readiness')['evacuationCapacityPeople']) | number:'1.0-0' }}</b></div>
        </dmis-panel>
      </div>

      <dmis-panel title="12-month forecast (formula-driven)" icon="fa-chart-area"
        [badge]="(r(d,'forecast')['expectedAnnualIncidents'] ?? 0) + ' exp. incidents'">
        <div class="stat-strip">
          <div class="stat"><b>{{ r(d,'forecast')['expectedAnnualIncidents'] ?? 0 }}</b><span>Expected incidents / year (F5)</span></div>
          <div class="stat"><b>{{ n(r(d,'forecast')['forecastResponseCashTzs']) | number:'1.0-0' }}</b><span>Forecast response cash (F6)</span></div>
          <div class="stat"><b>{{ n(r(d,'forecast')['forecastInKindValueTzs']) | number:'1.0-0' }}</b><span>Forecast in-kind (F7)</span></div>
          <div class="stat"><b>{{ n(r(d,'forecast')['forecastAnticipatoryReserveTzs']) | number:'1.0-0' }}</b><span>Anticipatory reserve (F8)</span></div>
        </div>
        <div class="kv"><span>Base monthly rate (F1)</span><b>{{ r(d,'forecast')['baseMonthlyIncidentRate'] }}</b></div>
        <div class="kv"><span>Seasonal factor × threat boost × prep dampener</span>
          <b>× {{ r(d,'forecast')['seasonalFactor'] }} · × {{ r(d,'forecast')['threatBoost'] }} · × {{ r(d,'forecast')['preparednessDampener'] }}</b></div>
        <div class="kv"><span>Climate band / season-horizon</span>
          <b>{{ r(d,'forecast')['climateBand'] }} · {{ r(d,'forecast')['expectedSeasonHorizonIncidents'] }} inc</b></div>
        <div class="formula">{{ r(d,'forecast')['masterFormula'] || r(d,'forecast')['formula'] }}</div>
        <ul class="limits">
          @for (l of r(d,'forecast')['honestLimits'] || []; track l) {
            <li>{{ l }}</li>
          }
        </ul>
      </dmis-panel>

      <div class="grid2">
        <dmis-panel title="Monthly roll-forward (automated · F11)" icon="fa-calendar-days">
          <p class="muted">Each month uses its own seasonal factor: rate × Sf(m) × threatBoost × prepDamp × unit costs.</p>
          <table>
            <thead><tr>
              <th>Month</th><th class="num">Sf</th><th class="num">Exp. inc.</th>
              <th class="num">Cash</th><th class="num">In-kind</th><th class="num">Total</th>
            </tr></thead>
            <tbody>
              @for (m of r(d,'forecast')['monthlyForecast'] || []; track m.year + '-' + m.month) {
                <tr>
                  <td>{{ m.monthName }} {{ m.year }}</td>
                  <td class="num">× {{ m.seasonalFactor }}</td>
                  <td class="num">{{ m.expectedIncidents }}</td>
                  <td class="num">{{ n(m.forecastCashTzs) | number:'1.0-0' }}</td>
                  <td class="num">{{ n(m.forecastInKindTzs) | number:'1.0-0' }}</td>
                  <td class="num">{{ n(m.forecastTotalTzs) | number:'1.0-0' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="muted">No monthly series (insufficient history).</td></tr>
              }
            </tbody>
          </table>
        </dmis-panel>

        <dmis-panel title="Distribution by category (share × forecast cash)" icon="fa-pie-chart">
          <table>
            <thead><tr><th>Category</th><th class="num">Share %</th><th class="num">Forecast cash</th><th></th></tr></thead>
            <tbody>
              @for (row of r(d,'forecast')['distributionForecast'] || []; track row.category) {
                <tr>
                  <td>{{ row.category }}</td>
                  <td class="num">{{ row.sharePct }}</td>
                  <td class="num">{{ n(row.forecastCashTzs) | number:'1.0-0' }}</td>
                  <td><div class="bar"><i [style.width.%]="row.sharePct"></i></div></td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="muted">No budget lines or allocations to derive shares.</td></tr>
              }
            </tbody>
          </table>
        </dmis-panel>
      </div>

      <dmis-panel title="Formula workbook (full audit trail)" icon="fa-flask">
        <p class="muted">Every step is recomputed server-side. Inputs are live values; coefficients are policy constants.</p>
        <div class="formula" style="margin-bottom:10px;">
          Coefficients:
          @for (k of coefKeys(d); track k) {
            <span class="chip" style="margin:2px;">{{ k }} = {{ r(d,'coefficients')[k] }}</span>
          }
        </div>
        <table>
          <thead><tr>
            <th>Step</th><th>Output</th><th>Expression</th><th>Inputs</th><th class="num">Result</th>
          </tr></thead>
          <tbody>
            @for (s of d['formulaAudit'] || []; track s.id) {
              <tr>
                <td class="audit-id">{{ s.id }}</td>
                <td>{{ s.output }}</td>
                <td class="expr">{{ s.expression }}</td>
                <td class="inputs">{{ fmtInputs(s.inputs) }}</td>
                <td class="num">{{ n(s.resultRounded ?? s.result) | number:'1.0-4' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </dmis-panel>

      <div class="grid2">
        <dmis-panel title="How money, DRR and threats influence each other" icon="fa-diagram-project">
          <div class="stat-strip">
            <div class="stat"><b>−{{ r(d,'influenceBoard')['responseCashDampenerPct'] ?? 0 }}%</b><span>Prep dampens intensity</span></div>
            <div class="stat"><b>+{{ r(d,'influenceBoard')['threatCaseloadBoostPct'] ?? 0 }}%</b><span>Threat boosts caseload</span></div>
            <div class="stat"><b>{{ r(d,'influenceBoard')['stockCoverageVsInKind'] ?? 0 }}%</b><span>Stock vs deployed in-kind</span></div>
            <div class="stat"><b>{{ r(d,'influenceBoard')['ndmfVsBudgetDisbursed'] ?? 0 }}%</b><span>NDMF share of cash outlay</span></div>
          </div>
          <ul class="rules">
            @for (rule of r(d,'influenceBoard')['rules'] || []; track rule) {
              <li>{{ rule }}</li>
            }
          </ul>
        </dmis-panel>

        <dmis-panel title="Per-incident unit costs" icon="fa-file-invoice-dollar">
          <div class="kv"><span>Incidents (non-simulation)</span><b>{{ r(d,'perIncidentEconomics')['incidentsTotal'] ?? 0 }}</b></div>
          <div class="kv"><span>With resource allocations</span><b>{{ r(d,'perIncidentEconomics')['incidentsWithResourceAllocations'] ?? 0 }}</b></div>
          <div class="kv"><span>Avg cash / incident (P1)</span><b>{{ n(r(d,'perIncidentEconomics')['avgCashOutlayPerIncidentTzs']) | number:'1.0-0' }}</b></div>
          <div class="kv"><span>Avg in-kind / allocated (P2)</span><b>{{ n(r(d,'perIncidentEconomics')['avgInKindPerIncidentWithAllocTzs']) | number:'1.0-0' }}</b></div>
          <p class="muted">{{ r(d,'perIncidentEconomics')['note'] }}</p>
        </dmis-panel>
      </div>

      <div class="grid2">
        <dmis-panel title="Annual series (history)" icon="fa-calendar">
          <table>
            <thead><tr>
              <th>Year</th><th class="num">Incidents</th><th class="num">EW</th>
              <th class="num">Cash disbursed</th><th class="num">In-kind</th>
            </tr></thead>
            <tbody>
              @for (y of d['annualSeries'] || []; track y.year) {
                <tr>
                  <td>{{ y.year }}</td>
                  <td class="num">{{ y.incidents }}</td>
                  <td class="num">{{ y.early_warnings }}</td>
                  <td class="num">{{ n(y.cash_disbursed_tzs) | number:'1.0-0' }}</td>
                  <td class="num">{{ n(y.in_kind_tzs) | number:'1.0-0' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </dmis-panel>

        <dmis-panel title="Economics by hazard" icon="fa-house-flood-water">
          <table>
            <thead><tr>
              <th>Hazard</th><th class="num">Incidents</th><th class="num">Open</th>
              <th class="num">In-kind</th><th class="num">Cash</th>
            </tr></thead>
            <tbody>
              @for (h of d['hazardEconomics'] || []; track h.hazard) {
                <tr>
                  <td>{{ h.hazard }}</td>
                  <td class="num">{{ h.incidents }}</td>
                  <td class="num">{{ h.open_incidents }}</td>
                  <td class="num">{{ n(h.in_kind_tzs) | number:'1.0-0' }}</td>
                  <td class="num">{{ n(h.cash_disbursed_tzs) | number:'1.0-0' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </dmis-panel>
      </div>

      <dmis-panel title="Data feeds (interlinked)" icon="fa-link">
        <p class="muted"><strong>Money:</strong> {{ (r(d,'linkages')['moneyFeeds'] || []).join(' · ') }}</p>
        <p class="muted"><strong>Resources:</strong> {{ (r(d,'linkages')['resourceFeeds'] || []).join(' · ') }}</p>
        <p class="muted"><strong>Interventions:</strong> {{ (r(d,'linkages')['interventionFeeds'] || []).join(' · ') }}</p>
        <p class="muted"><strong>Threats:</strong> {{ (r(d,'linkages')['threatFeeds'] || []).join(' · ') }}</p>
        <p class="muted" style="margin-top:8px;">{{ d['disclaimer'] }}</p>
      </dmis-panel>
    }
  `
})
export class EconomicsOfDisasterComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  data = signal<Row | null>(null);
  error = signal('');
  loading = signal(false);
  Math = Math;
  private timer: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    document.title = 'Economics of Disaster — e-MAAFA';
    this.load();
    // Auto-refresh formulas every 3 minutes so the page stays live-linked to ledgers.
    this.timer = setInterval(() => this.load(true), 180_000);
  }

  ngOnDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  load(silent = false): void {
    if (!silent) {
      this.loading.set(true);
    }
    this.http.get<Row>('/api/v1/finance/economics').subscribe({
      next: d => {
        this.data.set(d);
        this.error.set('');
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err?.error?.detail || err?.error?.message || 'Could not load economics model (need budget_and_finance.view).');
        this.loading.set(false);
      },
    });
  }

  n(v: unknown): number {
    if (v == null || v === '') return 0;
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  }

  r(d: Row, key: string): Row {
    const v = d[key];
    return v && typeof v === 'object' ? v as Row : {};
  }

  coefKeys(d: Row): string[] {
    const c = this.r(d, 'coefficients');
    return Object.keys(c).filter(k => k.startsWith('K_'));
  }

  fmtInputs(inputs: unknown): string {
    if (!inputs || typeof inputs !== 'object') return '—';
    return Object.entries(inputs as Record<string, unknown>)
      .map(([k, v]) => {
        const num = typeof v === 'number' ? v : Number(v);
        if (Number.isFinite(num) && Math.abs(num) >= 1000) {
          return `${k}=${Math.round(num).toLocaleString()}`;
        }
        return `${k}=${v}`;
      })
      .join(', ');
  }
}
