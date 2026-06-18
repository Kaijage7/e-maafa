import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { addMapNav } from '../../core/tz-map';

declare const L: any;     // Leaflet (global, as the Blade page loads it)
declare const Chart: any; // Chart.js 4.4.0, loaded per-page from the same CDN

interface DashboardPayload {
  hazardsCount: number; assessmentsCount: number; frameworksCount: number;
  measuresCount: number; projectsCount: number; repositoryCount: number;
  regionData: Record<string, any>;
  mapAssessments: any[];
  hazardsByCategory: { category: string; severity: string; total: number }[];
  hazardFrequency: { frequency: string; total: number }[];
  riskMatrix: any[];
  populationRisk: any[];
  mitigationPriority: { priority: string; total: number }[];
  riskLevels: { risk_level: string; total: number }[];
  recentFrameworks: any[];
  activeMeasures: any[];
  upcomingTrainings: any[];
}

/** Reproduction of mitigation/index-v2.blade.php — the Prevention & Mitigation dashboard (S1). */
@Component({
  selector: 'page-mitigation-dashboard',
  standalone: true,
  imports: [PageHeaderComponent, RouterLink],
  styles: [`
    .hero-split { display: grid; grid-template-columns: 340px 1fr; gap: 0.85rem; margin-bottom: 1rem; }
    .hero-left { display: flex; flex-direction: column; gap: 0.7rem; }
    .stat-mini { background: #fff; border-radius: 6px; padding: 0.85rem 1rem; border: 1px solid var(--line, #e2e8f0); box-shadow: 0 1px 2px rgba(0,0,0,0.04); display: flex; align-items: center; gap: 0.7rem; text-decoration: none; color: inherit; }
    .stat-mini:hover { background: #f8fafc; border-color: #cbd5e1; }
    .sm-icon { width: 38px; height: 38px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; color: #fff; flex-shrink: 0; }
    .sm-info { flex: 1; }
    .sm-value { font-size: 1.5rem; font-weight: 800; color: var(--text-dark); line-height: 1; letter-spacing: -0.3px; }
    .sm-label { font-size: 0.78rem; font-weight: 600; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.3px; margin-top: 0.1rem; }
    .hero-right { position: relative; border-radius: 6px; overflow: hidden; border: 1px solid var(--line, #e2e8f0); box-shadow: 0 1px 2px rgba(0,0,0,0.04); min-height: 500px; }
    #heroMap { width: 100%; height: 100%; min-height: 500px; background: #e8edf2; }
    .map-label { position: absolute; top: 0.8rem; left: 0.9rem; z-index: 500; display: flex; align-items: center; gap: 0.4rem; padding: 0.35rem 0.75rem; background: #fff; border-radius: 6px; border: 1px solid var(--line, #e2e8f0); box-shadow: 0 1px 3px rgba(0,0,0,0.08); pointer-events: none; }
    .map-label i { color: var(--primary); font-size: 0.65rem; }
    .map-label span { color: var(--text-dark); font-size: 0.74rem; font-weight: 600; }
    .map-legend { position: absolute; bottom: 0.8rem; right: 0.9rem; z-index: 500; padding: 0.5rem 0.7rem; background: #fff; border-radius: 6px; border: 1px solid var(--line, #e2e8f0); box-shadow: 0 1px 3px rgba(0,0,0,0.08); display: flex; gap: 0.65rem; align-items: center; }
    .legend-item { display: flex; align-items: center; gap: 0.25rem; font-size: 0.66rem; font-weight: 600; color: var(--text-mid); }
    .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .map-live { position: absolute; top: 0.8rem; right: 0.9rem; z-index: 500; display: flex; align-items: center; gap: 0.3rem; padding: 0.3rem 0.6rem; background: #fff; border-radius: 50px; border: 1px solid rgba(16,185,129,0.25); font-size: 0.58rem; font-weight: 700; color: #059669; }
    .live-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; }
    .map-back-btn { position: absolute; top: 0.8rem; left: 50%; transform: translateX(-50%); z-index: 500; display: none; align-items: center; gap: 0.35rem; padding: 0.4rem 0.85rem; background: #fff; border-radius: 50px; border: 1px solid rgba(0,51,102,0.18); box-shadow: 0 1px 3px rgba(0,0,0,0.08); cursor: pointer; font-family: 'Inter', sans-serif; font-size: 0.65rem; font-weight: 700; color: var(--primary); }
    .map-back-btn.visible { display: flex; }
    .map-back-btn:hover { background: #f8fafc; }
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
    .rip-name { font-size: 12px; font-weight: 800; color: #111827; letter-spacing: -0.3px; flex: 1; }
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
    .region-tooltip { background: #fff !important; border: 1px solid rgba(0,0,0,0.1) !important; border-radius: 6px !important; padding: 6px 12px !important; font-size: 12px !important; font-weight: 700 !important; color: var(--primary) !important; box-shadow: 0 1px 3px rgba(0,0,0,0.1) !important; letter-spacing: -0.2px !important; }
    .lake-label { background: transparent !important; border: none !important; box-shadow: none !important; color: #1565C0; font-size: 0.55rem; font-weight: 600; font-style: italic; letter-spacing: 0.5px; text-shadow: 0 1px 2px rgba(255,255,255,0.8); }
    .lake-label::before { display: none !important; }
    .leaflet-container { background: #e8edf2; }
    .leaflet-container path:focus, .leaflet-interactive:focus { outline: none !important; }
    .leaflet-control-attribution { display: none !important; }
    .panel-row.two-col { grid-template-columns: repeat(2, 1fr); }
    .panel-body { padding: 1.15rem; }
    .chart-wrap { position: relative; width: 100%; height: 260px; }
    .r-time { color: var(--text-light); font-size: 0.78rem; }
    @media (max-width: 991px) { .hero-split { grid-template-columns: 1fr; } .hero-right { min-height: 350px; } .panel-row.two-col { grid-template-columns: 1fr; } }
  `],
  template: `
    <dmis-page-header title="Prevention & Mitigation" icon="fa-shield-alt"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Prevention & Mitigation'}, {label:'Dashboard'}]" />

    <div class="hero-split">
      <div class="hero-left">
        <a routerLink="/m/prevention-mitigation/hazards" class="stat-mini">
          <div class="sm-icon" style="background:#dc2626;"><i class="fas fa-fire"></i></div>
          <div class="sm-info"><div class="sm-value">{{ counters().hazards }}</div><div class="sm-label">Active Hazards</div></div>
        </a>
        <a routerLink="/m/prevention-mitigation/risk-assessments" class="stat-mini">
          <div class="sm-icon" style="background:#006847;"><i class="fas fa-search-location"></i></div>
          <div class="sm-info"><div class="sm-value">{{ counters().assessments }}</div><div class="sm-label">Risk Assessments</div></div>
        </a>
        <a routerLink="/m/content-management/frameworks" class="stat-mini">
          <div class="sm-icon" style="background:#b8860b;"><i class="fas fa-file-contract"></i></div>
          <div class="sm-info"><div class="sm-value">{{ counters().frameworks }}</div><div class="sm-label">Risk Frameworks</div></div>
        </a>
        <a routerLink="/m/prevention-mitigation/measures" class="stat-mini">
          <div class="sm-icon" style="background:#004d66;"><i class="fas fa-shield-alt"></i></div>
          <div class="sm-info"><div class="sm-value">{{ counters().measures }}</div><div class="sm-label">Mitigation Measures</div></div>
        </a>
        <a routerLink="/m/recovery/projects" class="stat-mini">
          <div class="sm-icon" style="background:#004d80;"><i class="fas fa-project-diagram"></i></div>
          <div class="sm-info"><div class="sm-value">{{ counters().projects }}</div><div class="sm-label">Strategic Projects</div></div>
        </a>
        <a routerLink="/m/recovery/lessons" class="stat-mini">
          <div class="sm-icon" style="background:#005499;"><i class="fas fa-book"></i></div>
          <div class="sm-info"><div class="sm-value">{{ counters().repository }}</div><div class="sm-label">Knowledge Items</div></div>
        </a>
      </div>

      <div class="hero-right">
        <div #heroMap id="heroMap"></div>
        <div class="map-label" [style.display]="mapLabelVisible() ? '' : 'none'"><i class="fas fa-globe-africa"></i> <span>Tanzania Risk Choropleth</span></div>
        <button class="map-back-btn" [class.visible]="drilled()" (click)="resetToFullMap($event)"><i class="fas fa-arrow-left"></i> Back to Tanzania</button>
        <div class="map-breadcrumb" [class.visible]="drilled()">
          <span class="bc-link" (click)="resetToFullMap($event)">Tanzania</span>
          <i class="fas fa-chevron-right bc-sep"></i>
          <span class="bc-current">{{ currentRegion() }}</span>
        </div>
        <div class="map-live"><span class="live-dot"></span> LIVE</div>
        <div class="map-legend">
          <div class="legend-item"><div class="legend-dot" style="background:#dc2626;"></div> High Risk</div>
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
    </div>

    <div class="panel-row two-col">
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="fas fa-th-large"></i> Hazard Severity by Category</div>
          <span class="panel-badge">{{ sum(data()?.hazardsByCategory) }} classified</span></div>
        <div class="panel-body">
          @if (data()?.hazardsByCategory?.length) { <div class="chart-wrap"><canvas #hazardCategoryChart></canvas></div> }
          @else { <div class="empty-state"><i class="fas fa-th-large"></i>No categorized hazard data</div> }
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="fas fa-clock"></i> Hazard Frequency Distribution</div>
          <span class="panel-badge">{{ sum(data()?.hazardFrequency) }} hazards</span></div>
        <div class="panel-body">
          @if (data()?.hazardFrequency?.length) { <div class="chart-wrap"><canvas #hazardFreqChart></canvas></div> }
          @else { <div class="empty-state"><i class="fas fa-clock"></i>No frequency data</div> }
        </div>
      </div>
    </div>

    <div class="panel-row two-col">
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="fas fa-users"></i> Population at Risk by Region</div>
          <span class="panel-badge">{{ populationTotal() }} people</span></div>
        <div class="panel-body">
          @if (data()?.populationRisk?.length) { <div class="chart-wrap" style="height:220px;"><canvas #populationChart></canvas></div> }
          @else { <div class="empty-state"><i class="fas fa-users"></i>No population data</div> }
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="fas fa-money-bill-wave"></i> Budget Allocation vs Risk</div>
          <span class="panel-badge">TZS {{ budgetTotalB() }}B total</span></div>
        <div class="panel-body">
          @if (data()?.populationRisk?.length) { <div class="chart-wrap" style="height:220px;"><canvas #budgetChart></canvas></div> }
          @else { <div class="empty-state"><i class="fas fa-money-bill-wave"></i>No budget data</div> }
        </div>
      </div>
    </div>

    <div class="panel-row two-col">
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="fas fa-exclamation-triangle"></i> Risk Matrix — Likelihood vs Impact</div>
          <span class="panel-badge">{{ data()?.riskMatrix?.length || 0 }} assessments</span></div>
        <div class="panel-body">
          @if (data()?.riskMatrix?.length) { <div class="chart-wrap" style="height:280px;"><canvas #riskMatrixChart></canvas></div> }
          @else { <div class="empty-state"><i class="fas fa-exclamation-triangle"></i>No risk matrix data</div> }
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="fas fa-shield-alt"></i> Mitigation Priority & Risk Levels</div>
          <span class="panel-badge">{{ sum(data()?.mitigationPriority) + sum(data()?.riskLevels) }} records</span></div>
        <div class="panel-body">
          @if (combinedCount()) { <div class="chart-wrap" style="height:280px;"><canvas #priorityRiskChart></canvas></div> }
          @else { <div class="empty-state"><i class="fas fa-shield-alt"></i>No data</div> }
        </div>
      </div>
    </div>

    <div class="panel-row two-col">
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="fas fa-file-contract"></i> Recent Risk Frameworks</div>
          <a routerLink="/m/content-management/frameworks" class="r-view">View All <i class="fas fa-arrow-right"></i></a></div>
        <div class="panel-body" style="padding:0;">
          @if (data()?.recentFrameworks?.length) {
            <div style="overflow-x:auto;"><table class="r-table">
              <thead><tr><th>Document Name</th><th>Type</th><th>Year</th><th>Scope</th></tr></thead>
              <tbody>
                @for (fw of data()!.recentFrameworks; track $index) {
                  <tr>
                    <td class="r-title">{{ limit(fw.document_name, 28) }}</td>
                    <td><span class="r-badge" style="background:rgba(0,51,102,0.08);color:var(--primary);">{{ fw.document_type }}</span></td>
                    <td style="color:var(--text-mid);">{{ fw.year_of_approval }}</td>
                    <td><span class="r-badge" style="background:rgba(0,104,71,0.08);color:#006847;">{{ fw.geographic_scope || 'N/A' }}</span></td>
                  </tr>
                }
              </tbody>
            </table></div>
          } @else { <div class="empty-state"><i class="fas fa-file-contract"></i>No risk frameworks found</div> }
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="fas fa-shield-alt"></i> Active Mitigation Measures</div>
          <a routerLink="/m/prevention-mitigation/measures" class="r-view">View All <i class="fas fa-arrow-right"></i></a></div>
        <div class="panel-body" style="padding:0;">
          @if (data()?.activeMeasures?.length) {
            <div style="overflow-x:auto;"><table class="r-table">
              <thead><tr><th>Project Name</th><th>Entity</th><th>Status</th><th>Priority</th></tr></thead>
              <tbody>
                @for (m of data()!.activeMeasures; track $index) {
                  <tr>
                    <td class="r-title">{{ limit(m.project_programme_name, 24) }}</td>
                    <td style="color:var(--text-mid);">{{ m.implementing_entity || 'N/A' }}</td>
                    <td><span class="r-badge" style="background:rgba(16,185,129,0.1);color:#059669;">{{ m.project_status }}</span></td>
                    <td><span class="r-badge" [style.background]="priorityColors(m.priority)[1]" [style.color]="priorityColors(m.priority)[0]">{{ ucfirst(m.priority || 'N/A') }}</span></td>
                  </tr>
                }
              </tbody>
            </table></div>
          } @else { <div class="empty-state"><i class="fas fa-shield-alt"></i>No active mitigation measures</div> }
        </div>
      </div>
    </div>

    <div class="panel-row">
      <div class="panel">
        <div class="panel-head"><div class="panel-title"><i class="fas fa-chalkboard-teacher"></i> Upcoming Trainings</div>
          <a routerLink="/m/preparedness/trainings" class="r-view">View All <i class="fas fa-arrow-right"></i></a></div>
        <div class="panel-body" style="padding:0;">
          @if (data()?.upcomingTrainings?.length) {
            <div style="overflow-x:auto;"><table class="r-table">
              <thead><tr><th>Title</th><th>Institution</th><th>Start</th><th>End</th><th>Audience</th><th>Status</th></tr></thead>
              <tbody>
                @for (t of data()!.upcomingTrainings; track $index) {
                  <tr>
                    <td class="r-title">{{ limit(t.training_title, 32) }}</td>
                    <td style="color:var(--text-mid);">{{ limit(t.implementing_institution, 22) }}</td>
                    <td class="r-time">{{ fmtDate(t.training_start_date) }}</td>
                    <td class="r-time">{{ fmtDate(t.training_end_date) }}</td>
                    <td style="font-size:0.72rem;color:var(--text-mid);">{{ limit(audience(t.targeted_audience), 18) }}</td>
                    <td><span class="r-badge" style="background:rgba(245,158,11,0.1);color:#f59e0b;">Upcoming</span></td>
                  </tr>
                }
              </tbody>
            </table></div>
          } @else { <div class="empty-state"><i class="fas fa-chalkboard-teacher"></i>No upcoming trainings</div> }
        </div>
      </div>
    </div>
  `,
})
export class MitigationDashboardComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  mapEl = viewChild<ElementRef>('heroMap');
  hazardCategoryCanvas = viewChild<ElementRef<HTMLCanvasElement>>('hazardCategoryChart');
  hazardFreqCanvas = viewChild<ElementRef<HTMLCanvasElement>>('hazardFreqChart');
  populationCanvas = viewChild<ElementRef<HTMLCanvasElement>>('populationChart');
  budgetCanvas = viewChild<ElementRef<HTMLCanvasElement>>('budgetChart');
  riskMatrixCanvas = viewChild<ElementRef<HTMLCanvasElement>>('riskMatrixChart');
  priorityRiskCanvas = viewChild<ElementRef<HTMLCanvasElement>>('priorityRiskChart');

  data = signal<DashboardPayload | null>(null);
  counters = signal({ hazards: 0, assessments: 0, frameworks: 0, measures: 0, projects: 0, repository: 0 });
  drilled = signal(false);
  currentRegion = signal('');
  mapLabelVisible = signal(true);
  infoVisible = signal(false);
  info = signal({ name: 'Region', level: 'None', color: '#003366', assessments: 0, high: 0, medium: 0, low: 0, measures: 0, barPct: 0 });

  private map: any;
  private charts: any[] = [];
  private districtLayer: any = null;
  private wardLayer: any = null;
  private activeLayer: any = null;
  private viewReady = false;

  constructor() {
    this.http.get<DashboardPayload>('/api/v1/mitigation/dashboard').subscribe(d => {
      this.data.set(d);
      this.animateCounters(d);
      this.renderAll();
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderAll();
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c.destroy());
    if (this.map) {
      this.map.remove();
    }
  }

  /* ===== helpers used by the template ===== */
  sum(rows: { total: number }[] | undefined): number {
    return (rows ?? []).reduce((s, r) => s + Number(r.total), 0);
  }
  populationTotal(): string {
    const total = (this.data()?.populationRisk ?? []).reduce((s, r) => s + (Number(r.population_at_risk) || 0), 0);
    return total.toLocaleString();
  }
  budgetTotalB(): string {
    const total = (this.data()?.populationRisk ?? []).reduce((s, r) => s + (Number(r.mitigation_budget) || 0), 0);
    return (total / 1e9).toFixed(1);
  }
  combinedCount(): number {
    return (this.data()?.mitigationPriority?.length || 0) + (this.data()?.riskLevels?.length || 0);
  }
  limit(value: string | null, max: number): string {
    if (!value) {
      return '';
    }
    return value.length > max ? value.slice(0, max) + '...' : value;
  }
  ucfirst(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  fmtDate(value: string | null): string {
    if (!value) {
      return '-';
    }
    return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  audience(value: any): string {
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.join(', ') : value;
      } catch {
        return value || '-';
      }
    }
    return '-';
  }
  priorityColors(priority: string | null): [string, string] {
    const map: Record<string, [string, string]> = {
      high: ['#dc2626', 'rgba(220,38,38,0.1)'], medium: ['#f59e0b', 'rgba(245,158,11,0.1)'], low: ['#9ca3af', 'rgba(156,163,175,0.1)'],
    };
    return map[(priority || '').toLowerCase()] || ['#9ca3af', 'rgba(156,163,175,0.1)'];
  }

  /** The view's data-count count-up animation. */
  private animateCounters(d: DashboardPayload): void {
    const targets = { hazards: d.hazardsCount, assessments: d.assessmentsCount, frameworks: d.frameworksCount, measures: d.measuresCount, projects: d.projectsCount, repository: d.repositoryCount };
    const steps = 30;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const f = step / steps;
      this.counters.set({
        hazards: Math.round(targets.hazards * f), assessments: Math.round(targets.assessments * f),
        frameworks: Math.round(targets.frameworks * f), measures: Math.round(targets.measures * f),
        projects: Math.round(targets.projects * f), repository: Math.round(targets.repository * f),
      });
      if (step >= steps) {
        clearInterval(timer);
      }
    }, 25);
  }

  /* ===== map + charts (logic ported verbatim from mitigation/index-v2.blade.php) ===== */

  private renderAll(): void {
    if (!this.viewReady || !this.data()) {
      return;
    }
    ensureChartJs().then(() => setTimeout(() => {
      this.initMap();
      this.charts.forEach(c => c.destroy());
      this.charts = [];
      this.renderHazardCategoryChart();
      this.renderHazardFreqChart();
      this.renderPopulationChart();
      this.renderBudgetChart();
      this.renderRiskMatrixChart();
      this.renderPriorityRiskChart();
    }));
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
    this.mapLabelVisible.set(true);
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
    if (!el || this.map || typeof L === 'undefined') {
      return;
    }
    const tzBounds = L.latLngBounds(L.latLng(-12.0, 29.0), L.latLng(-0.8, 41.0));
    this.map = L.map(el, {
      center: [-6.5, 35.0], zoom: 6, minZoom: 5, maxZoom: 14,
      maxBounds: tzBounds, maxBoundsViscosity: 1.0,
      zoomControl: true, attributionControl: false, dragging: true, scrollWheelZoom: false,
    });
    this.map.createPane('maskPane');
    this.map.getPane('maskPane').style.zIndex = 250;
    this.map.getPane('maskPane').style.pointerEvents = 'none';
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

    fetch('/geojson/tz_lakes.geojson').then(r => r.json()).then(data => {
      L.geoJSON(data, {
        style: () => ({ fillColor: '#1976D2', fillOpacity: 0.35, color: '#42A5F5', weight: 1, opacity: 0.7 }),
        onEachFeature: (f: any, layer: any) => {
          const name = f.properties.name || '';
          if (name) layer.bindTooltip(name, { permanent: true, direction: 'center', className: 'lake-label', offset: [0, 0] });
        },
      }).addTo(this.map);
    }).catch(() => {});

    const regionData = this.data()!.regionData;
    fetch('/geojson/adm1_region/adm1.geojson').then(r => r.json()).then(data => {
      let delay = 0;
      L.geoJSON(data, {
        style: () => ({ fillColor: '#003366', fillOpacity: 0, color: '#1565C0', weight: 1.2, opacity: 0 }),
        onEachFeature: (feature: any, layer: any) => {
          const name = feature.properties.reg_name || feature.properties.name || 'Region';
          const rd = regionData[name];
          const targetFillColor = this.regionColor(rd ? rd.riskLevel : 'None');
          const targetOpacity = this.regionOpacity(rd ? rd.riskLevel : 'None');
          let tipText = name;
          if (rd && rd.riskLevel !== 'None') tipText += ' (' + rd.riskLevel + ')';
          layer.bindTooltip(tipText, { className: 'region-tooltip', sticky: false, permanent: false });
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
            this.mapLabelVisible.set(false);
            this.currentRegion.set(name);
            this.loadDistricts(name);
            this.showRegionInfo(name, rd || { assessments: 0, high: 0, medium: 0, low: 0, hazards: 0, measures: 0, riskLevel: 'None' });
          });
          setTimeout(() => {
            layer.setStyle({ fillColor: targetFillColor, fillOpacity: targetOpacity, opacity: 0.7 });
          }, 80 + delay);
          delay += 40;
        },
      }).addTo(this.map);
    });

    const lvlColors: Record<string, string> = { High: '#ef4444', 'Very High': '#dc2626', Medium: '#f59e0b', Low: '#10b981' };
    this.data()!.mapAssessments.forEach(a => {
      if (!a.latitude || !a.longitude) return;
      const color = lvlColors[a.risk_level] || '#9ca3af';
      L.circleMarker([parseFloat(a.latitude), parseFloat(a.longitude)], {
        radius: 5, fillColor: color, fillOpacity: 0.9, color: '#fff', weight: 1.5, opacity: 0.9,
      }).addTo(this.map);
    });
    setTimeout(() => this.map.invalidateSize(), 600);
  }

  /* ===== charts (options verbatim from the Blade page) ===== */
  private tooltipStyle = { backgroundColor: 'rgba(255,255,255,0.95)', titleColor: '#111827', bodyColor: '#4b5563', borderColor: '#e5e7eb', borderWidth: 1, padding: 12, cornerRadius: 10, titleFont: { weight: '700' } };
  private palette = ['#003366', '#004d80', '#006847', '#FFD700', '#004d66', '#005499', '#b8860b', '#0a8f5e', '#006666', '#336699'];
  private sevColors: Record<string, string> = { High: '#dc2626', Medium: '#f59e0b', Low: '#10b981' };

  private shortLocation(name: string): string {
    return (name || '').replace(/ - .*| Region.*| Coastal.*| Urban.*| Central.*| Hilly.*/, '');
  }

  private renderHazardCategoryChart(): void {
    const el = this.hazardCategoryCanvas()?.nativeElement;
    const catData = this.data()!.hazardsByCategory;
    if (!el || !catData.length) return;
    const categories = [...new Set(catData.map(d => d.category))];
    const highData = categories.map(c => catData.find(d => d.category === c && d.severity === 'High')?.total || 0);
    const medData = categories.map(c => catData.find(d => d.category === c && d.severity === 'Medium')?.total || 0);
    this.charts.push(new Chart(el, {
      type: 'bar',
      data: { labels: categories, datasets: [
        { label: 'High Severity', data: highData, backgroundColor: '#dc2626', borderRadius: 4, barPercentage: 0.6 },
        { label: 'Medium Severity', data: medData, backgroundColor: '#f59e0b', borderRadius: 4, barPercentage: 0.6 },
      ] },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: this.tooltipStyle, legend: { position: 'bottom', labels: { boxWidth: 10, padding: 12, font: { size: 10, weight: '600' }, color: '#4b5563', usePointStyle: true, pointStyle: 'circle' } } },
        scales: {
          x: { stacked: true, beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { stepSize: 1, font: { size: 10 }, color: '#9ca3af', callback: (v: number) => Number.isInteger(v) ? v : '' } },
          y: { stacked: true, grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#4b5563' } },
        },
      },
    }));
  }

  private renderHazardFreqChart(): void {
    const el = this.hazardFreqCanvas()?.nativeElement;
    const freqData = [...this.data()!.hazardFrequency];
    if (!el || !freqData.length) return;
    const freqOrder = ['Very Common', 'Common', 'Seasonal', 'Occasional', 'Increasing', 'Rare', 'Very Rare'];
    const freqColors = ['#dc2626', '#ef4444', '#f59e0b', '#eab308', '#3b82f6', '#10b981', '#059669'];
    const sorted = freqData.sort((a, b) => freqOrder.indexOf(a.frequency) - freqOrder.indexOf(b.frequency));
    this.charts.push(new Chart(el, {
      type: 'polarArea',
      data: {
        labels: sorted.map(d => d.frequency),
        datasets: [{
          data: sorted.map(d => d.total),
          backgroundColor: sorted.map((d, i) => (freqColors[freqOrder.indexOf(d.frequency)] || this.palette[i]) + 'cc'),
          borderWidth: 2, borderColor: '#fff',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: this.tooltipStyle, legend: { position: 'right', labels: { boxWidth: 8, padding: 8, font: { size: 10, weight: '500' }, color: '#4b5563', usePointStyle: true, pointStyle: 'circle' } } },
        scales: { r: { ticks: { stepSize: 1, display: false }, grid: { color: 'rgba(0,0,0,0.06)' } } },
      },
    }));
  }

  private renderPopulationChart(): void {
    const el = this.populationCanvas()?.nativeElement;
    const popData = this.data()!.populationRisk;
    if (!el || !popData.length) return;
    this.charts.push(new Chart(el, {
      type: 'bar',
      data: {
        labels: popData.map(d => this.shortLocation(d.location_name)),
        datasets: [{ label: 'Population at Risk', data: popData.map(d => parseInt(d.population_at_risk, 10) || 0),
          backgroundColor: popData.map(d => this.sevColors[d.risk_level] || (d.risk_level === 'Very High' ? '#991b1b' : '#9ca3af')), borderRadius: 6, barPercentage: 0.55 }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...this.tooltipStyle, callbacks: { label: (ctx: any) => ctx.parsed.x.toLocaleString() + ' people' } } },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { font: { size: 10 }, color: '#9ca3af', callback: (v: number) => v >= 1000 ? (v / 1000) + 'K' : v } },
          y: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#4b5563' } },
        },
      },
    }));
  }

  private renderBudgetChart(): void {
    const el = this.budgetCanvas()?.nativeElement;
    const popData = this.data()!.populationRisk;
    if (!el || !popData.length) return;
    const budBg = popData.map(d => this.sevColors[d.risk_level] || (d.risk_level === 'Very High' ? '#991b1b' : '#9ca3af'));
    this.charts.push(new Chart(el, {
      type: 'bar',
      data: {
        labels: popData.map(d => this.shortLocation(d.location_name)),
        datasets: [{ label: 'Budget (TZS Billion)', data: popData.map(d => (parseFloat(d.mitigation_budget) || 0) / 1e9),
          backgroundColor: budBg.map(c => c + 'bb'), borderColor: budBg, borderWidth: 2, borderRadius: 6, barPercentage: 0.55 }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { ...this.tooltipStyle, callbacks: { label: (ctx: any) => 'TZS ' + ctx.parsed.y.toFixed(1) + ' Billion' } } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10, weight: '600' }, color: '#4b5563', maxRotation: 45 } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { font: { size: 10 }, color: '#9ca3af', callback: (v: number) => 'TZS ' + v + 'B' } },
        },
      },
    }));
  }

  private renderRiskMatrixChart(): void {
    const el = this.riskMatrixCanvas()?.nativeElement;
    const matrixData = this.data()!.riskMatrix;
    if (!el || !matrixData.length) return;
    const likeMap: Record<string, number> = { Rare: 1, Unlikely: 2, Possible: 3, Likely: 4, 'Almost Certain': 5 };
    const impactMap: Record<string, number> = { Negligible: 1, Minor: 2, Moderate: 3, Major: 4, Catastrophic: 5 };
    const bubbles = matrixData.map(d => {
      const pop = parseInt(d.population_at_risk, 10) || 10000;
      const color = this.sevColors[d.risk_level] || (d.risk_level === 'Very High' ? '#991b1b' : '#9ca3af');
      return { x: likeMap[d.likelihood] || 3, y: impactMap[d.severity_of_impact] || 3,
        r: Math.max(8, Math.min(25, Math.sqrt(pop / 1000))), label: d.assessment_title || d.location_name, risk: d.risk_level, pop, color };
    });
    this.charts.push(new Chart(el, {
      type: 'bubble',
      data: { datasets: [{ data: bubbles, backgroundColor: bubbles.map(b => b.color + '88'), borderColor: bubbles.map(b => b.color), borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { ...this.tooltipStyle, callbacks: {
            title: (ctx: any[]) => bubbles[ctx[0].dataIndex].label,
            label: (ctx: any) => {
              const b = bubbles[ctx.dataIndex];
              return [b.risk + ' Risk', 'Population: ' + b.pop.toLocaleString(),
                'Likelihood: ' + Object.keys(likeMap).find(k => likeMap[k] === b.x),
                'Impact: ' + Object.keys(impactMap).find(k => impactMap[k] === b.y)];
            },
          } },
        },
        scales: {
          x: { min: 0.5, max: 5.5, grid: { color: 'rgba(0,0,0,0.04)' }, title: { display: true, text: 'Likelihood →', font: { size: 11, weight: '700' }, color: '#6b7280' },
            ticks: { stepSize: 1, font: { size: 9 }, color: '#9ca3af', callback: (v: number) => ['', 'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'][v] || '' } },
          y: { min: 0.5, max: 5.5, grid: { color: 'rgba(0,0,0,0.04)' }, title: { display: true, text: '← Impact', font: { size: 11, weight: '700' }, color: '#6b7280' },
            ticks: { stepSize: 1, font: { size: 9 }, color: '#9ca3af', callback: (v: number) => ['', 'Negligible', 'Minor', 'Moderate', 'Major', 'Catastrophic'][v] || '' } },
        },
      },
    }));
  }

  private renderPriorityRiskChart(): void {
    const el = this.priorityRiskCanvas()?.nativeElement;
    if (!el || !this.combinedCount()) return;
    const prioColors: Record<string, string> = { High: '#dc2626', Medium: '#f59e0b', Low: '#10b981' };
    const rlColorMap: Record<string, string> = { 'Very High': '#991b1b', High: '#dc2626', Medium: '#f59e0b', Low: '#10b981' };
    const labels: string[] = [], values: number[] = [], colors: string[] = [];
    this.data()!.mitigationPriority.forEach(d => { labels.push('Priority: ' + d.priority); values.push(d.total); colors.push(prioColors[d.priority] || '#9ca3af'); });
    this.data()!.riskLevels.forEach(d => { labels.push('Risk: ' + d.risk_level); values.push(d.total); colors.push(rlColorMap[d.risk_level] || '#9ca3af'); });
    this.charts.push(new Chart(el, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values, backgroundColor: colors.map(c => c + 'cc'), borderWidth: 3, borderColor: 'rgba(255,255,255,0.9)', hoverOffset: 8 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '55%',
        plugins: { tooltip: this.tooltipStyle, legend: { position: 'right', labels: { boxWidth: 8, padding: 8, font: { size: 10, weight: '500' }, color: '#4b5563', usePointStyle: true, pointStyle: 'circle' } } } },
    }));
  }
}

/** Loads Chart.js 4.4.0 from the same CDN the Blade page pushes, once. */
let chartJsPromise: Promise<void> | null = null;
function ensureChartJs(): Promise<void> {
  if (typeof Chart !== 'undefined') {
    return Promise.resolve();
  }
  if (!chartJsPromise) {
    chartJsPromise = new Promise(resolve => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }
  return chartJsPromise;
}
