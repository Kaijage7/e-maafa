import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Chart: any;

type Row = Record<string, any>;

interface MonitoringDashboard {
  generatedAt: string;
  scope: Row;
  command: Row;
  budgetPulse: Row;
  resourcePulse: Row;
  interventionPulse: Row;
  /** F74: incidents / EW / disasters / cost-used snapshot */
  capabilityPulse?: Row;
  targetScorecard: Row[];
  charts: Row;
  summary: Row;
  budget: Row;
  readiness: Row;
  cycleActivities: Row[];
  regionIndicators: Row[];
  institutionLens: Row;
  incidentWarningIndicators: Row;
  resourceDistribution: Row;
  frameworkAims?: Row[];
}

/**
 * National M&E dashboard — live operational evidence only.
 *
 * Layout (top → bottom):
 *  1. What this page is + how to read traffic lights
 *  2. Situation strip (budget, resources, readiness, open work)
 *  3. Real charts: budget funnel · cycle · stock · resources · allocations · regions
 *  4. Target scorecard (actual vs threshold)
 *  5. Framework aims coverage + detail tables
 *
 * Charts use Chart.js (same vendor bundle as One Health / Sendai / Frameworks).
 */
@Component({
    selector: 'page-monitoring-evaluation-dashboard',
    imports: [DatePipe, DecimalPipe, RouterLink, PageHeaderComponent, PanelComponent],
    styles: [`
    :host { display:block; }
    .me-toolbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
    .btn-sm {
      border:1px solid #cbd5e1; background:#fff; color:#334155; border-radius:6px;
      padding:7px 11px; font-size:0.78rem; font-weight:700; cursor:pointer;
      font-family:inherit; text-decoration:none; display:inline-flex; gap:6px; align-items:center;
    }
    .btn-sm:hover { background:#f8fafc; }
    .btn-sm.primary { background:#0f766e; border-color:#0f766e; color:#fff; }
    .scope-pill {
      display:inline-flex; align-items:center; gap:6px; border:1px solid #dbe4ef;
      background:#f8fafc; border-radius:999px; padding:6px 11px; font-size:0.78rem;
      font-weight:700; color:#334155;
    }
    .alert {
      background:#fff7ed; border:1px solid #fed7aa; color:#9a3412;
      border-radius:8px; padding:10px 12px; font-size:0.82rem; margin-bottom:12px;
    }
    .empty { color:#94a3b8; text-align:center; padding:28px 8px; font-size:0.83rem; }

    /* Intro: plain language, not marketing */
    .intro {
      background:#fff; border:1px solid #e2e8f0; border-radius:8px;
      padding:14px 16px; margin-bottom:14px;
    }
    .intro h2 {
      margin:0 0 6px; font-size:0.95rem; font-weight:800; color:#0f172a;
    }
    .intro p {
      margin:0; font-size:0.8rem; color:#475569; line-height:1.5; max-width:72rem;
    }
    .intro .legend {
      display:flex; flex-wrap:wrap; gap:14px; margin-top:10px; font-size:0.75rem; color:#475569;
    }
    .intro .legend span { display:inline-flex; align-items:center; gap:6px; font-weight:600; }
    .dot { width:9px; height:9px; border-radius:50%; display:inline-block; }
    .dot.green { background:#16a34a; }
    .dot.amber { background:#d97706; }
    .dot.red { background:#dc2626; }

    /* Situation strip */
    .sit {
      display:grid; grid-template-columns:repeat(5, minmax(0,1fr)); gap:10px; margin-bottom:14px;
    }
    .sit-card {
      background:#fff; border:1px solid #e2e8f0; border-radius:8px;
      padding:12px 13px; border-left:4px solid #94a3b8; min-width:0;
    }
    .sit-card.green { border-left-color:#16a34a; }
    .sit-card.amber { border-left-color:#d97706; }
    .sit-card.red { border-left-color:#dc2626; }
    .sit-card.neutral { border-left-color:#0f766e; }
    .sit-card .lbl {
      font-size:0.68rem; font-weight:800; text-transform:uppercase;
      letter-spacing:.03em; color:#64748b; display:flex; justify-content:space-between; gap:6px;
    }
    .sit-card b {
      display:block; margin-top:4px; font-size:1.45rem; font-weight:800;
      color:#0f172a; font-variant-numeric:tabular-nums; line-height:1.15;
    }
    .sit-card small {
      display:block; margin-top:4px; font-size:0.73rem; color:#64748b; line-height:1.35;
    }
    .chip {
      display:inline-flex; align-items:center; border-radius:999px;
      padding:1px 7px; font-size:0.65rem; font-weight:800; text-transform:uppercase;
    }
    .chip.green { background:#dcfce7; color:#166534; }
    .chip.amber { background:#fef3c7; color:#92400e; }
    .chip.red { background:#fee2e2; color:#991b1b; }
    .chip.neutral { background:#f1f5f9; color:#475569; }

    .grid-2 { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; margin-bottom:14px; }
    .grid-3 { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin-bottom:14px; }
    .panel-body { padding:12px 14px; }
    .panel-help {
      font-size:0.74rem; color:#64748b; line-height:1.4; margin:0 0 10px;
      padding-bottom:8px; border-bottom:1px solid #f1f5f9;
    }

    .chart-box { position:relative; height:260px; }
    .chart-box.sm { height:220px; }
    .chart-box.tall { height:300px; }

    /* Scorecard */
    .score-list { display:grid; gap:0; }
    .score-row {
      display:grid; grid-template-columns:minmax(0,1.5fr) minmax(100px,0.55fr) minmax(120px,0.75fr);
      gap:10px; align-items:center; padding:10px 0; border-bottom:1px solid #f1f5f9;
    }
    .score-row:last-child { border-bottom:0; }
    .score-name { font-weight:800; color:#0f172a; font-size:0.82rem; }
    .score-desc { color:#64748b; font-size:0.72rem; margin-top:2px; line-height:1.35; }
    .score-src { color:#94a3b8; font-size:0.68rem; margin-top:2px; font-family:ui-monospace,monospace; }
    .score-vals { text-align:right; font-variant-numeric:tabular-nums; }
    .score-vals b { display:block; color:#0f172a; font-size:0.95rem; }
    .score-vals span { color:#64748b; font-size:0.72rem; }
    .track { height:8px; border-radius:999px; background:#e2e8f0; overflow:hidden; }
    .fill { height:100%; border-radius:999px; background:#0d9488; }
    .fill.green { background:#16a34a; }
    .fill.amber { background:#d97706; }
    .fill.red { background:#dc2626; }

    .kv { display:flex; justify-content:space-between; gap:8px; border-top:1px solid #edf2f7; padding:7px 0; font-size:0.78rem; }
    .kv:first-child { border-top:0; padding-top:0; }
    .kv span { color:#475569; }
    .kv b { color:#0f172a; font-variant-numeric:tabular-nums; }

    .table-wrap { overflow:auto; max-height:360px; }
    table { width:100%; border-collapse:collapse; font-size:0.78rem; }
    th {
      position:sticky; top:0; z-index:1; background:#f8fafc; color:#64748b;
      text-align:left; text-transform:uppercase; font-size:0.66rem;
      padding:8px; border-bottom:1px solid #e2e8f0; letter-spacing:.02em;
    }
    td { padding:8px; border-bottom:1px solid #edf2f7; color:#334155; }
    td.name { font-weight:700; color:#0f172a; }
    .num { text-align:right; font-variant-numeric:tabular-nums; }

    .note { color:#64748b; font-size:0.74rem; line-height:1.4; margin-top:8px; }
    .section-label {
      font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:.04em;
      color:#64748b; margin:4px 0 10px;
    }
    .details-toggle { margin:4px 0 14px; }
    details summary {
      cursor:pointer; font-weight:800; color:#0f766e; font-size:0.82rem; list-style:none;
    }
    details summary::-webkit-details-marker { display:none; }

    .foot {
      display:flex; flex-wrap:wrap; gap:12px; justify-content:space-between;
      align-items:center; font-size:0.74rem; color:#64748b; margin-top:4px; margin-bottom:20px;
    }

    @media (max-width: 1100px) {
      .sit { grid-template-columns:1fr 1fr; }
      .grid-2, .grid-3 { grid-template-columns:1fr; }
    }
    @media (max-width: 640px) {
      .sit, .score-row { grid-template-columns:1fr; }
      .score-vals { text-align:left; }
    }
  `],
    template: `
    <dmis-page-header title="Monitoring & Evaluation" icon="fa-chart-line"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Monitoring & Evaluation'}, {label:'Dashboard'}]">
      <div class="me-toolbar">
        <span class="scope-pill"><i class="fas fa-location-crosshairs"></i> {{ scopeLabel() }}</span>
        @if (canEnter()) {
          <a class="btn-sm primary" routerLink="/m/monitoring-evaluation/workbench">
            <i class="fas fa-table-cells"></i> Data Workbench
          </a>
        }
        <a class="btn-sm" routerLink="/m/user-management/institutions">
          <i class="fas fa-sitemap"></i> Institutions
        </a>
        <button class="btn-sm" type="button" (click)="load()" [disabled]="loading()">
          <i class="fas fa-rotate"></i> Refresh
        </button>
      </div>
    </dmis-page-header>

    @if (error()) {
      <div class="alert"><i class="fas fa-triangle-exclamation"></i> {{ error() }}</div>
    }

    <!-- 1. What this page is -->
    <div class="intro">
      <h2>What you are looking at</h2>
      <p>
        This dashboard pulls live numbers from DMIS tables — budgets, warehouses, resource requests,
        incidents, warnings, plans and the M&amp;E indicator catalogue. It is not a separate reporting
        spreadsheet. Use it to answer: <strong>is budget moving?</strong>
        <strong>are stocks and requests under control?</strong>
        <strong>where is operational work concentrated?</strong>
        Enter period values in the Data Workbench.
      </p>
      <div class="legend">
        <span><i class="dot green"></i> On track (meets green threshold)</span>
        <span><i class="dot amber"></i> Watch (between amber and green)</span>
        <span><i class="dot red"></i> Off track (below amber / open pipeline high)</span>
        <span>Generated {{ data()?.generatedAt | date:'medium' }}</span>
      </div>
    </div>

    <!-- 2. Situation strip -->
    <div class="section-label">Situation at a glance</div>
    <div class="sit">
      <div class="sit-card" [class]="st(command()['overallStatus'])">
        <div class="lbl">
          Overall status
          <span class="chip" [class]="st(command()['overallStatus'])">{{ st(command()['overallStatus']) }}</span>
        </div>
        <b>{{ n(command()['overallScore']) }}</b>
        <small>
          {{ command()['overallLabel'] || '—' }} ·
          {{ n(command()['scorecardGreen']) }} green ·
          {{ n(command()['scorecardAmber']) }} amber ·
          {{ n(command()['scorecardRed']) }} red
        </small>
      </div>
      <div class="sit-card" [class]="st(command()['budgetStatus'])">
        <div class="lbl">
          Budget execution
          <span class="chip" [class]="st(command()['budgetStatus'])">{{ st(command()['budgetStatus']) }}</span>
        </div>
        <b>{{ n(command()['budgetExecutionPct']) }}%</b>
        <small>Disbursed ÷ allocated · green ≥ 60% · target 80%</small>
      </div>
      <div class="sit-card" [class]="st(command()['resourceStatus'])">
        <div class="lbl">
          Resource fulfillment
          <span class="chip" [class]="st(command()['resourceStatus'])">{{ st(command()['resourceStatus']) }}</span>
        </div>
        <b>{{ n(command()['resourceFulfillmentPct']) }}%</b>
        <small>Qty allocated vs requested · stock {{ n(command()['stockUnits']) | number }} units</small>
      </div>
      <div class="sit-card" [class]="st(command()['readinessStatus'])">
        <div class="lbl">
          Readiness score
          <span class="chip" [class]="st(command()['readinessStatus'])">{{ st(command()['readinessStatus']) }}</span>
        </div>
        <b>{{ n(command()['readinessScore']) }}</b>
        <small>Warehouses, stock, response seats, plans, evacuation</small>
      </div>
      <div class="sit-card neutral">
        <div class="lbl">Open pipeline <span class="chip neutral">live</span></div>
        <b>{{ n(command()['interventionsActive']) | number }}</b>
        <small>Open allocations + active incidents + active warnings</small>
      </div>
    </div>

    <!-- F74: capability matrix — incidents / EW / disasters / cost used -->
    <div class="section-label">Capability snapshot (incidents · early warning · disasters · cost)</div>
    <div class="sit">
      <div class="sit-card neutral">
        <div class="lbl">Incidents <span class="chip neutral">live</span></div>
        <b>{{ n(capabilityPulse()['incidentsTotal']) | number }}</b>
        <small>{{ n(capabilityPulse()['incidentsActive']) }} active · operational pipeline</small>
      </div>
      <div class="sit-card neutral">
        <div class="lbl">Early warning issued <span class="chip neutral">live</span></div>
        <b>{{ n(capabilityPulse()['ewIssuedWindows']) | number }}</b>
        <small>{{ n(capabilityPulse()['ewActive']) }} active · {{ n(capabilityPulse()['ewBulletins']) }} bulletins</small>
      </div>
      <div class="sit-card neutral">
        <div class="lbl">Disasters recorded <span class="chip neutral">repository</span></div>
        <b>{{ n(capabilityPulse()['disastersRecorded']) | number }}</b>
        <small>disaster_events cards (official + operational)</small>
      </div>
      <div class="sit-card neutral">
        <div class="lbl">Cost used (TZS) <span class="chip neutral">live</span></div>
        <b>{{ n(capabilityPulse()['costUsedTzs']) | number:'1.0-0' }}</b>
        <small>
          In-kind {{ n(capabilityPulse()['costInKindTzs']) | number:'1.0-0' }} ·
          Budget {{ n(capabilityPulse()['costBudgetCommittedTzs']) | number:'1.0-0' }} ·
          Linked to cards {{ n(capabilityPulse()['costLinkedToDisastersTzs']) | number:'1.0-0' }}
          ({{ n(capabilityPulse()['incidentLinks']) }} incident links)
        </small>
      </div>
    </div>
    <p class="panel-help" style="margin:0 0 1rem;">
      {{ capabilityPulse()['costNote'] || 'Cost used = system in-kind + budget + recorded gov figures.' }}
      Per-disaster breakdown is on Disaster Repository event cards once incidents are linked.
    </p>

    <!-- 3. Charts row 1: Budget + Cycle -->
    <div class="section-label">Money flow &amp; disaster-management cycle</div>
    <div class="grid-2">
      <dmis-panel title="Budget flow (TZS)" icon="fa-coins" [badge]="budgetBadge()">
        <div class="panel-body">
          <p class="panel-help">
            Allocated → committed → disbursed from disaster budgets.
            NDMF is shown separately (national fund disbursements). Remaining = allocated − disbursed.
          </p>
          <div class="chart-box"><canvas #budgetChart></canvas></div>
          <div class="kv" style="margin-top:10px;"><span>Remaining unspent</span><b>{{ n(budgetPulse()['remaining']) | number:'1.0-0' }}</b></div>
          <div class="kv"><span>Commitment rate</span><b>{{ n(budgetPulse()['commitmentPct']) }}%</b></div>
          <div class="kv"><span>Partner pledges</span><b>{{ n(budgetPulse()['partnerPledges']) | number:'1.0-0' }}</b></div>
          <div class="kv"><span>NDMF disbursed</span><b>{{ n(budgetPulse()['ndmfDisbursed']) | number:'1.0-0' }}</b></div>
        </div>
      </dmis-panel>

      <dmis-panel title="Work by disaster cycle" icon="fa-arrows-spin"
        [badge]="n(interventionPulse()['activePipeline']) + ' open'">
        <div class="panel-body">
          <p class="panel-help">
            Counts of registered activities by phase — prevention (mitigation), preparedness (plans/training),
            response (incidents, tasks, open allocations), recovery (relief, assessments, programmes).
          </p>
          <div class="chart-box"><canvas #cycleChart></canvas></div>
          <div class="kv" style="margin-top:10px;"><span>Mitigation measures</span><b>{{ n(interventionPulse()['mitigationMeasures']) }}</b></div>
          <div class="kv"><span>Training + anticipatory + contingency</span>
            <b>{{ n(interventionPulse()['preparednessTotal']) }}</b></div>
          <div class="kv"><span>Active incidents</span><b>{{ n(interventionPulse()['activeIncidents']) }}</b></div>
          <div class="kv"><span>Relief + assessments + recovery</span>
            <b>{{ n(interventionPulse()['recoveryTotal']) }}</b></div>
        </div>
      </dmis-panel>
    </div>

    <!-- 4. Charts row 2: Resources -->
    <div class="section-label">Resources — available, requested, used</div>
    <div class="grid-3">
      <dmis-panel title="Available vs requested vs allocated" icon="fa-boxes-stacked">
        <div class="panel-body">
          <p class="panel-help">
            Available = warehouse inventory units. Requested / allocated = incident resource requests.
            “Used” here means quantity allocated to incidents (not every physical dispatch).
          </p>
          <div class="chart-box sm"><canvas #resourceChart></canvas></div>
          <div class="kv" style="margin-top:8px;"><span>Open requests</span><b>{{ n(resourcePulse()['openRequests']) }}</b></div>
          <div class="kv"><span>Fulfilled requests</span><b>{{ n(resourcePulse()['fulfilledRequests']) }}</b></div>
          <div class="kv"><span>Low-stock items</span><b>{{ n(resourcePulse()['lowStockItems']) }}</b></div>
          <div class="kv"><span>Stock value (TZS)</span><b>{{ n(resourcePulse()['stockValue']) | number:'1.0-0' }}</b></div>
        </div>
      </dmis-panel>

      <dmis-panel title="Stock by category" icon="fa-chart-bar">
        <div class="panel-body">
          <p class="panel-help">Inventory quantity grouped by resource category in your scope.</p>
          <div class="chart-box sm"><canvas #stockCatChart></canvas></div>
          @if (!stockByCategory().length) {
            <div class="empty" style="padding:8px;">No stock rows in this scope.</div>
          }
        </div>
      </dmis-panel>

      <dmis-panel title="Allocation pipeline by status" icon="fa-truck">
        <div class="panel-body">
          <p class="panel-help">How many resource requests sit in each workflow status.</p>
          <div class="chart-box sm"><canvas #allocChart></canvas></div>
          <div class="note">
            Requested qty {{ n(resourcePulse()['requestedQty']) | number:'1.0-0' }} ·
            allocated {{ n(resourcePulse()['allocatedQty']) | number:'1.0-0' }} ·
            completed dispatches {{ n(resourcePulse()['completedDispatches']) }}
          </div>
        </div>
      </dmis-panel>
    </div>

    <!-- 5. Regions chart + table -->
    <div class="section-label">Regional picture</div>
    <div class="grid-2">
      <dmis-panel title="Regions — stock &amp; active incidents" icon="fa-map-location-dot"
        [badge]="regionChartRows().length + ' locations'">
        <div class="panel-body">
          <p class="panel-help">
            Active incidents by region (red) and warehouse stock by location (teal).
            Stock only appears where inventory is linked to a regional warehouse — national hubs without a region
            show as “National / unassigned”.
          </p>
          <div class="chart-box tall"><canvas #regionChart></canvas></div>
          @if (nationalStockNote()) {
            <div class="note">{{ nationalStockNote() }}</div>
          }
        </div>
      </dmis-panel>

      <dmis-panel title="Regional operations table" icon="fa-table"
        [badge]="regionOps().length + ' regions'">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Region</th>
                <th class="num">Stock units</th>
                <th class="num">Active incidents</th>
                <th class="num">Budget allocated</th>
              </tr>
            </thead>
            <tbody>
              @for (r of regionOps(); track r['label']) {
                <tr>
                  <td class="name">{{ r['label'] }}</td>
                  <td class="num">{{ n(r['stock']) | number:'1.0-0' }}</td>
                  <td class="num">{{ n(r['incidents']) | number }}</td>
                  <td class="num">{{ n(r['budget']) | number:'1.0-0' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="empty">No regional rows in scope.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    <!-- 6. Scorecard -->
    <div class="section-label">Targets &amp; thresholds (scorecard)</div>
    <dmis-panel title="Performance against agreed floors" icon="fa-bullseye"
      badge="live evidence">
      <div class="panel-body score-list">
        <p class="panel-help">
          Each row is one monitored indicator with actual value, target / floor, and traffic-light status.
          Sources are named so you can audit the figure in the operational modules.
        </p>
        @for (s of scorecard(); track s['code']) {
          <div class="score-row">
            <div>
              <div class="score-name">{{ s['name'] }}</div>
              <div class="score-desc">{{ s['description'] }}</div>
              @if (s['detail']) {
                <div class="score-desc">{{ s['detail'] }}</div>
              }
              <div class="score-src">{{ s['source'] }}</div>
            </div>
            <div class="score-vals">
              <b>{{ formatActual(s) }}</b>
              <span>target {{ formatTarget(s) }}</span>
            </div>
            <div>
              <div class="track">
                <div class="fill" [class]="st(s['status'])" [style.width.%]="barW(s['progressPct'])"></div>
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:4px;font-size:0.7rem;color:#64748b;">
                <span class="chip" [class]="st(s['status'])">{{ st(s['status']) }}</span>
                <span>{{ n(s['progressPct']) }}%</span>
              </div>
            </div>
          </div>
        } @empty {
          <div class="empty">No scorecard data loaded.</div>
        }
        <div class="note">{{ command()['availableVsUsedNote'] }}</div>
      </div>
    </dmis-panel>

    <!-- 7. Framework aims -->
    <div class="section-label" style="margin-top:14px;">M&amp;E framework aims (catalogue coverage)</div>
    <dmis-panel title="Original aims — indicators present in catalogue" icon="fa-diagram-project"
      [badge]="frameworkAims().length + ' aims'">
      <div class="panel-body">
        <p class="panel-help">
          These are the module aims (regions, LGAs, ministries, partners, SP, incidents, EW, readiness, FY plans).
          “Indicators” = active catalogue rows linked to that aim / planned count.
          Values are entered in the Data Workbench.
        </p>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Aim</th>
                <th>Group</th>
                <th>Workbench level</th>
                <th class="num">Catalogue</th>
                <th>Coverage</th>
              </tr>
            </thead>
            <tbody>
              @for (a of frameworkAims(); track a['aimCode']) {
                <tr>
                  <td class="name">
                    {{ a['titleEn'] }}
                    <div class="score-desc">{{ a['titleSw'] }}</div>
                  </td>
                  <td>{{ a['aimGroup'] }}</td>
                  <td><span class="chip neutral">{{ a['meLevel'] }}</span></td>
                  <td class="num">{{ n(a['indicatorsPresent']) }}/{{ n(a['indicatorsPlanned']) }}</td>
                  <td><span class="chip" [class]="aimStatus(a)">{{ aimStatus(a) }}</span></td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="empty">Framework aims load after V176 migration.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    </dmis-panel>

    <!-- 8. Detail (collapsed) -->
    <div class="details-toggle" style="margin-top:14px;">
      <details>
        <summary><i class="fas fa-chevron-down"></i> Detail — institutions, readiness, recent incidents</summary>
        <div class="grid-3" style="margin-top:12px;">
          <dmis-panel title="Institution coverage" icon="fa-building-columns">
            <div class="panel-body">
              @if (data()?.institutionLens?.['scopeNote']) {
                <p class="panel-help">{{ data()?.institutionLens?.['scopeNote'] }}</p>
              }
              @for (m of institutionCoverage(); track m['label']) {
                <div class="kv"><span>{{ m['label'] }}</span><b>{{ n(m['value']) | number }}</b></div>
              } @empty {
                <div class="empty">No institution summary.</div>
              }
            </div>
          </dmis-panel>

          <dmis-panel title="Readiness building blocks" icon="fa-hard-hat">
            <div class="panel-body">
              <div class="kv"><span>Operational warehouses</span><b>{{ n(readiness()['operationalWarehouses']) }}</b></div>
              <div class="kv"><span>Temporary warehouses</span><b>{{ n(readiness()['temporaryWarehouses']) }}</b></div>
              <div class="kv"><span>Evacuation centres</span><b>{{ n(readiness()['evacuationCenters']) }}</b></div>
              <div class="kv"><span>Evacuation capacity</span><b>{{ n(readiness()['evacuationCapacity']) | number }}</b></div>
              <div class="kv"><span>Regional team seats</span><b>{{ n(readiness()['regionalTeamSeats']) }}</b></div>
              <div class="kv"><span>District team seats</span><b>{{ n(readiness()['districtTeamSeats']) }}</b></div>
              <div class="kv"><span>Active plans</span><b>{{ n(readiness()['activePlans']) }}</b></div>
              <div class="kv"><span>Stock units</span><b>{{ n(readiness()['stockUnits']) | number }}</b></div>
            </div>
          </dmis-panel>

          <dmis-panel title="Recent incidents" icon="fa-triangle-exclamation">
            <div class="panel-body">
              @for (i of recentIncidents(); track i['id']) {
                <div class="kv">
                  <span>
                    <a [routerLink]="['/m/response/incidents', i['id']]"
                      style="color:#0f766e;font-weight:700;text-decoration:none;">
                      {{ i['title'] || ('#' + i['id']) }}
                    </a>
                    @if (i['regionName']) {
                      <div class="score-desc">{{ i['regionName'] }}{{ i['districtName'] ? ' · ' + i['districtName'] : '' }}</div>
                    }
                  </span>
                  <b>{{ i['status'] }}</b>
                </div>
              } @empty {
                <div class="empty">No recent incidents.</div>
              }
            </div>
          </dmis-panel>
        </div>

        <details style="margin-top:12px;">
          <summary style="font-size:0.78rem;"><i class="fas fa-book"></i> Glossary — terms used on this page</summary>
          <div class="panel-body" style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;margin-top:8px;">
            <div class="kv"><span>Budget execution %</span><b>Disbursed amount ÷ allocated budget × 100</b></div>
            <div class="kv"><span>Resource fulfillment %</span><b>Quantity allocated ÷ quantity requested on incident resource lines</b></div>
            <div class="kv"><span>Available stock</span><b>Sum of inventory_items.quantity in scoped warehouses</b></div>
            <div class="kv"><span>Open pipeline</span><b>Open allocations + active incidents + active warnings</b></div>
            <div class="kv"><span>Readiness score</span><b>0–100 composite of warehouses, stock, seats, plans, evacuation, coverage</b></div>
            <div class="kv"><span>NDMF</span><b>National Disaster Management Fund disbursements (separate ledger)</b></div>
            <div class="kv"><span>Workbench</span><b>Where institutions enter period indicator values against the catalogue</b></div>
          </div>
        </details>
      </details>
    </div>

    <div class="foot">
      <span>Scope: {{ scopeLabel() }} · Live system evidence only (no manual upload on this page)</span>
      <span>@if (loading()) { Loading… } @else { Ready }</span>
    </div>
  `
})
export class MonitoringEvaluationDashboardComponent implements OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private budgetChartEl = viewChild<ElementRef<HTMLCanvasElement>>('budgetChart');
  private cycleChartEl = viewChild<ElementRef<HTMLCanvasElement>>('cycleChart');
  private resourceChartEl = viewChild<ElementRef<HTMLCanvasElement>>('resourceChart');
  private stockCatChartEl = viewChild<ElementRef<HTMLCanvasElement>>('stockCatChart');
  private allocChartEl = viewChild<ElementRef<HTMLCanvasElement>>('allocChart');
  private regionChartEl = viewChild<ElementRef<HTMLCanvasElement>>('regionChart');

  private charts: any[] = [];

  data = signal<MonitoringDashboard | null>(null);
  loading = signal(false);
  error = signal('');

  constructor() {
    this.load();
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<MonitoringDashboard>('/api/v1/monitoring-evaluation/dashboard').subscribe({
      next: data => {
        this.data.set(data);
        this.loading.set(false);
        ensureChartJs().then(() => setTimeout(() => this.renderCharts(), 40));
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Unable to load Monitoring & Evaluation dashboard.');
        this.destroyCharts();
      },
    });
  }

  private destroyCharts(): void {
    this.charts.forEach(c => {
      try { c.destroy(); } catch { /* ignore */ }
    });
    this.charts = [];
  }

  private renderCharts(): void {
    if (typeof Chart === 'undefined') return;
    this.destroyCharts();

    const teal = '#0f766e';
    const tealLt = '#5eead4';
    const blue = '#0369a1';
    const purple = '#7c3aed';
    const gray = '#94a3b8';
    const grid = 'rgba(15,23,42,0.06)';
    const tick = '#94a3b8';

    const baseTooltip = {
      backgroundColor: '#fff',
      titleColor: '#0f172a',
      bodyColor: '#475569',
      borderColor: '#e2e8f0',
      borderWidth: 1,
      cornerRadius: 8,
      padding: 10,
      titleFont: { weight: '700', size: 12 },
      bodyFont: { size: 12 },
    };

    // —— Budget horizontal bar (funnel stages) ——
    const budgetEl = this.budgetChartEl()?.nativeElement;
    if (budgetEl) {
      const funnel = this.budgetFunnel();
      const labels = funnel.length
        ? funnel.map(f => String(f['label']))
        : ['Allocated', 'Committed', 'Disbursed', 'NDMF'];
      const values = funnel.length
        ? funnel.map(f => n0(f['value']))
        : [
            n0(this.budgetPulse()['allocated']),
            n0(this.budgetPulse()['committed']),
            n0(this.budgetPulse()['disbursed']),
            n0(this.budgetPulse()['ndmfDisbursed']),
          ];
      const colors = [teal, '#0d9488', '#14b8a6', blue];
      this.charts.push(new Chart(budgetEl, {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'TZS',
            data: values,
            backgroundColor: colors.slice(0, labels.length),
            borderRadius: 4,
            barThickness: 22,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              ...baseTooltip,
              callbacks: {
                label: (ctx: any) => ' ' + Number(ctx.raw || 0).toLocaleString() + ' TZS',
              },
            },
          },
          scales: {
            x: {
              beginAtZero: true,
              ticks: {
                color: tick,
                font: { size: 11 },
                callback: (v: any) => compactNum(Number(v)),
              },
              grid: { color: grid },
              border: { display: false },
            },
            y: {
              ticks: { color: '#334155', font: { size: 12, weight: '600' } },
              grid: { display: false },
              border: { display: false },
            },
          },
        },
      }));
    }

    // —— Cycle doughnut ——
    const cycleEl = this.cycleChartEl()?.nativeElement;
    if (cycleEl) {
      const bars = this.cycleBars();
      const labels = bars.length ? bars.map(b => String(b['label'])) : ['Prevention', 'Preparedness', 'Response', 'Recovery'];
      const values = bars.length
        ? bars.map(b => n0(b['value']))
        : [
            n0(this.interventionPulse()['preventionTotal']),
            n0(this.interventionPulse()['preparednessTotal']),
            n0(this.interventionPulse()['responseTotal']),
            n0(this.interventionPulse()['recoveryTotal']),
          ];
      const colors = bars.length
        ? bars.map(b => String(b['color'] || teal))
        : ['#0d6efd', '#198754', '#dc3545', '#6f42c1'];
      this.charts.push(new Chart(cycleEl, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{
            data: values,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: '#fff',
            hoverOffset: 4,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '58%',
          plugins: {
            legend: {
              position: 'right',
              labels: {
                boxWidth: 12,
                padding: 12,
                font: { size: 12, weight: '600' },
                color: '#334155',
                generateLabels: (chart: any) => {
                  const ds = chart.data.datasets[0];
                  return (chart.data.labels || []).map((label: string, i: number) => ({
                    text: `${label}: ${Number(ds.data[i] || 0).toLocaleString()}`,
                    fillStyle: ds.backgroundColor[i],
                    strokeStyle: '#fff',
                    lineWidth: 1,
                    hidden: false,
                    index: i,
                  }));
                },
              },
            },
            tooltip: baseTooltip,
          },
        },
      }));
    }

    // —— Resource compare vertical bars ——
    const resEl = this.resourceChartEl()?.nativeElement;
    if (resEl) {
      const rows = this.resourceCompare();
      this.charts.push(new Chart(resEl, {
        type: 'bar',
        data: {
          labels: rows.map(r => String(r['label'])),
          datasets: [{
            label: 'Units',
            data: rows.map(r => n0(r['value'])),
            backgroundColor: rows.map(r => String(r['color'] || teal)),
            borderRadius: 4,
            barThickness: 36,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: baseTooltip },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: tick, font: { size: 11 }, callback: (v: any) => compactNum(Number(v)) },
              grid: { color: grid },
              border: { display: false },
            },
            x: {
              ticks: { color: '#334155', font: { size: 11, weight: '600' } },
              grid: { display: false },
              border: { display: false },
            },
          },
        },
      }));
    }

    // —— Stock by category ——
    const stockEl = this.stockCatChartEl()?.nativeElement;
    if (stockEl) {
      const rows = this.stockByCategory().slice(0, 8);
      const labels = rows.map(r => String(r['category'] || '—'));
      const values = rows.map(r => n0(r['stockUnits']));
      this.charts.push(new Chart(stockEl, {
        type: 'bar',
        data: {
          labels: labels.length ? labels : ['No data'],
          datasets: [{
            label: 'Stock units',
            data: values.length ? values : [0],
            backgroundColor: teal,
            borderRadius: 4,
            barThickness: rows.length > 5 ? 14 : 20,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: baseTooltip },
          scales: {
            x: {
              beginAtZero: true,
              ticks: { color: tick, font: { size: 11 } },
              grid: { color: grid },
              border: { display: false },
            },
            y: {
              ticks: { color: '#334155', font: { size: 11, weight: '600' } },
              grid: { display: false },
              border: { display: false },
            },
          },
        },
      }));
    }

    // —— Allocations by status ——
    const allocEl = this.allocChartEl()?.nativeElement;
    if (allocEl) {
      const rows = this.allocationsByStatus();
      const labels = rows.map(r => String(r['status'] || '—'));
      const values = rows.map(r => n0(r['requests']));
      const palette = [blue, teal, purple, '#d97706', '#dc2626', gray, '#0891b2', '#6f42c1'];
      this.charts.push(new Chart(allocEl, {
        type: 'doughnut',
        data: {
          labels: labels.length ? labels : ['None'],
          datasets: [{
            data: values.length ? values : [1],
            backgroundColor: labels.length
              ? labels.map((_, i) => palette[i % palette.length])
              : ['#e2e8f0'],
            borderWidth: 2,
            borderColor: '#fff',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '55%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: { boxWidth: 10, font: { size: 11 }, color: '#475569', padding: 8 },
            },
            tooltip: baseTooltip,
          },
        },
      }));
    }

    // —— Regions / locations grouped bar (stock + incidents) ——
    const regEl = this.regionChartEl()?.nativeElement;
    if (regEl) {
      const rows = this.regionChartRows().slice(0, 10);
      const labels = rows.map(r => String(r['label'] || '—'));
      this.charts.push(new Chart(regEl, {
        type: 'bar',
        data: {
          labels: labels.length ? labels : ['—'],
          datasets: [
            {
              label: 'Stock units',
              data: rows.length ? rows.map(r => n0(r['stock'])) : [0],
              backgroundColor: teal,
              borderRadius: 3,
            },
            {
              label: 'Active incidents',
              data: rows.length ? rows.map(r => n0(r['incidents'])) : [0],
              backgroundColor: '#dc3545',
              borderRadius: 3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              position: 'top',
              align: 'end',
              labels: { boxWidth: 12, font: { size: 11, weight: '600' }, color: '#475569' },
            },
            tooltip: baseTooltip,
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: { color: tick, font: { size: 11 } },
              grid: { color: grid },
              border: { display: false },
            },
            x: {
              ticks: { color: '#334155', font: { size: 10, weight: '600' }, maxRotation: 45, minRotation: 0 },
              grid: { display: false },
              border: { display: false },
            },
          },
        },
      }));
    }
  }

  // ── data accessors ──

  command(): Row { return this.data()?.command ?? {}; }
  budgetPulse(): Row { return this.data()?.budgetPulse ?? this.data()?.budget ?? {}; }
  resourcePulse(): Row { return this.data()?.resourcePulse ?? {}; }
  interventionPulse(): Row { return this.data()?.interventionPulse ?? {}; }
  capabilityPulse(): Row { return this.data()?.capabilityPulse ?? {}; }
  readiness(): Row { return this.data()?.readiness ?? {}; }
  scorecard(): Row[] { return this.data()?.targetScorecard ?? []; }
  chartsPayload(): Row { return this.data()?.charts ?? {}; }

  budgetFunnel(): Row[] {
    const f = this.budgetPulse()['funnel'] ?? this.chartsPayload()['budgetFunnel'] ?? [];
    return Array.isArray(f) ? f : [];
  }

  cycleBars(): Row[] {
    const c = this.interventionPulse()['cycleBars'] ?? this.chartsPayload()['cycleBars'] ?? [];
    return Array.isArray(c) ? c : [];
  }

  stockByCategory(): Row[] {
    const s = this.resourcePulse()['stockByCategory']
      ?? this.chartsPayload()['stockByCategory']
      ?? this.data()?.resourceDistribution?.['stockByCategory']
      ?? [];
    return Array.isArray(s) ? s : [];
  }

  regionOps(): Row[] {
    const r = this.chartsPayload()['regionOps'] ?? [];
    return Array.isArray(r) ? r : [];
  }

  /** Stock rows by warehouse region (includes National / unassigned). */
  stockByRegion(): Row[] {
    const s = this.chartsPayload()['stockByRegion']
      ?? this.data()?.resourceDistribution?.['stockByRegion']
      ?? [];
    return Array.isArray(s) ? s : [];
  }

  /**
   * Merge incident-heavy regions with stock-by-location so national hubs
   * are visible when regional warehouses hold no inventory.
   */
  regionChartRows(): Row[] {
    const ops = this.regionOps();
    const stockMap = new Map<string, number>();
    for (const s of this.stockByRegion()) {
      const name = String(s['regionName'] || 'National / unassigned');
      stockMap.set(name, n0(s['stockUnits']));
    }
    const byLabel = new Map<string, Row>();
    for (const r of ops) {
      const label = String(r['label'] || '—');
      byLabel.set(label, {
        label,
        stock: stockMap.has(label) ? stockMap.get(label) : n0(r['stock']),
        incidents: n0(r['incidents']),
        budget: n0(r['budget']),
      });
    }
    for (const [name, stock] of stockMap) {
      if (!byLabel.has(name)) {
        byLabel.set(name, { label: name, stock, incidents: 0, budget: 0 });
      } else {
        const row = byLabel.get(name)!;
        row['stock'] = stock;
      }
    }
    const rows = Array.from(byLabel.values());
    rows.sort((a, b) => (n0(b['stock']) + n0(b['incidents']) * 200) - (n0(a['stock']) + n0(a['incidents']) * 200));
    return rows;
  }

  nationalStockNote(): string {
    const national = this.stockByRegion().find(s =>
      /national|unassigned/i.test(String(s['regionName'] || '')));
    if (!national || n0(national['stockUnits']) <= 0) return '';
    return `National hubs hold ${n0(national['stockUnits']).toLocaleString()} stock units `
      + `(${n0(national['stores'])} stores) not yet assigned to a region warehouse.`;
  }

  allocationsByStatus(): Row[] {
    const a = this.resourcePulse()['allocationsByStatus']
      ?? this.chartsPayload()['allocationsByStatus']
      ?? this.data()?.resourceDistribution?.['allocationsByStatus']
      ?? [];
    return Array.isArray(a) ? a : [];
  }

  institutionCoverage(): Row[] {
    return this.data()?.institutionLens?.['coverage'] ?? [];
  }

  frameworkAims(): Row[] {
    return this.data()?.frameworkAims ?? [];
  }

  recentIncidents(): Row[] {
    return this.data()?.incidentWarningIndicators?.['recentIncidents'] ?? [];
  }

  resourceCompare(): Row[] {
    const rp = this.resourcePulse();
    return [
      { label: 'Available stock', value: n0(rp['availableQty']), color: '#0d9488' },
      { label: 'Requested', value: n0(rp['requestedQty']), color: '#0369a1' },
      { label: 'Allocated / used', value: n0(rp['allocatedQty']), color: '#7c3aed' },
    ];
  }

  budgetBadge(): string {
    const pct = n0(this.budgetPulse()['executionPct'] ?? this.command()['budgetExecutionPct']);
    return pct + '% executed';
  }

  aimStatus(a: Row): string {
    const present = n0(a['indicatorsPresent']);
    const planned = n0(a['indicatorsPlanned']);
    if (planned <= 0) return 'neutral';
    if (present >= planned) return 'green';
    if (present >= planned * 0.7) return 'amber';
    return 'red';
  }

  canEnter(): boolean {
    return this.auth.hasPermission('monitoring_evaluation.enter')
      || this.auth.hasPermission('monitoring_evaluation.manage');
  }

  scopeLabel(): string {
    const s = this.data()?.scope ?? {};
    if (s['councilName']) return `Council: ${s['councilName']}`;
    if (s['districtName']) return `District: ${s['districtName']}`;
    if (s['regionName']) return `Region: ${s['regionName']}`;
    return 'National scope';
  }

  n(value: any): number { return n0(value); }

  st(value: any): string {
    const s = String(value || 'neutral').toLowerCase();
    if (s === 'green' || s === 'amber' || s === 'red') return s;
    return 'neutral';
  }

  barW(value: any): number {
    return Math.max(0, Math.min(100, n0(value)));
  }

  formatActual(s: Row): string {
    const unit = String(s['unit'] || '');
    const v = n0(s['actual']);
    if (unit === '%') return `${v}%`;
    if (unit === 'score') return `${v}`;
    const u = unit && !['units', 'values', 'cases', 'measures', 'plans'].includes(unit)
      ? ' ' + unit
      : unit ? ' ' + unit : '';
    return `${v.toLocaleString()}${u}`;
  }

  formatTarget(s: Row): string {
    if (s['targetLabel']) return String(s['targetLabel']);
    if (s['target'] == null || s['target'] === '') return '—';
    const unit = String(s['unit'] || '');
    const v = n0(s['target']);
    if (unit === '%') return `${v}%`;
    return `${v.toLocaleString()}${unit ? ' ' + unit : ''}`;
  }
}

function n0(value: any): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** Compact axis labels: 1.2M, 45k, etc. */
function compactNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1).replace(/\.0$/, '') + 'B';
  if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (abs >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(n));
}

/** Loads Chart.js from the same vendor path as One Health / Sendai / Frameworks. */
let chartJsPromise: Promise<void> | null = null;
function ensureChartJs(): Promise<void> {
  if (typeof Chart !== 'undefined') {
    return Promise.resolve();
  }
  if (!chartJsPromise) {
    chartJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/chartjs/chart.umd.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Chart.js failed to load'));
      document.head.appendChild(script);
    });
  }
  return chartJsPromise;
}
