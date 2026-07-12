import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

declare const Chart: any; // Chart.js 4.4.0, loaded per-page from the CDN exactly as index-v2 does

interface MeasureRow {
  id: number; projectProgrammeName: string | null; implementingInstitution: string | null;
  hazardRiskAddressed: string | null; projectStatus: string | null; priority: string | null;
  periodStart: string | null; periodEnd: string | null;
}
interface IndexResponse {
  measures: MeasureRow[];
  pagination: { currentPage: number; lastPage: number; total: number; firstItem: number; lastItem: number };
  stats: { total: number; ongoing: number; notStarted: number; completed: number };
  byPriority: { priority: string; total: number }[];
}

/**
 * Reproduction of mitigation/measures/index-v2.blade.php — with the source's broken CRUD
 * DELIBERATELY FIXED: View/Edit/Delete/Create all work here.
 */
@Component({
  selector: 'page-mitigation-measures',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, RouterLink],
  styles: [`
    .status-ongoing { background: rgba(59,130,246,0.12); color: #2563eb; }
    .status-not-started { background: rgba(156,163,175,0.12); color: #6b7280; }
    .status-completed { background: rgba(16,185,129,0.12); color: #059669; }
    .status-design { background: rgba(0,77,102,0.12); color: #004d66; }
    .priority-high { background: rgba(220,38,38,0.12); color: #dc2626; }
    .priority-medium { background: rgba(245,158,11,0.12); color: #d97706; }
    .priority-low { background: rgba(16,185,129,0.12); color: #059669; }
    .alert-container { position: fixed; top: calc(var(--topbar-h) + 12px); right: 12px; z-index: 9999; width: 320px; }
    .flow-note {
      background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 10px; padding: 10px 14px;
      font-size: 0.8rem; color: #0c4a6e; margin-bottom: 12px; line-height: 1.45;
    }
    .flow-note b { color: #075985; }
    .inst-block {
      border: 1px solid #e2e8f0; border-radius: 12px; margin: 10px 12px; overflow: hidden; background: #fff;
    }
    .inst-block > summary {
      list-style: none; cursor: pointer; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px;
      padding: 12px 14px; background: #f8fafc; font-weight: 800; font-size: 0.88rem; color: #0f172a;
      user-select: none;
    }
    .inst-block > summary::-webkit-details-marker { display: none; }
    .inst-block[open] > summary { border-bottom: 1px solid #eef2f7; }
    .inst-block .inst-name { display: flex; align-items: center; gap: 8px; min-width: 180px; }
    .inst-block .inst-name i { color: #0f766e; }
    .inst-meta { font-size: 0.72rem; font-weight: 700; color: #64748b; }
    .inst-pills { display: flex; flex-wrap: wrap; gap: 6px; margin-left: auto; }
    .inst-pill {
      font-size: 0.68rem; font-weight: 800; padding: 2px 8px; border-radius: 999px;
      background: #e2e8f0; color: #334155;
    }
    .inst-pill.ok { background: #d1fae5; color: #047857; }
    .inst-pill.run { background: #dbeafe; color: #1d4ed8; }
    .inst-pill.wait { background: #f1f5f9; color: #64748b; }
    .inst-pill.hi { background: #fee2e2; color: #b91c1c; }
    .inst-block .chev { color: #94a3b8; font-size: 0.75rem; }
    .inst-block[open] .chev { transform: rotate(180deg); }
  `],
  template: `
    <dmis-page-header title="Mitigation Measures" icon="fa-shield-virus"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Prevention & Mitigation', url:'/m/prevention-mitigation/dashboard'}, {label:'Mitigation Measures'}]">
      @if (canManage()) {
        <a class="btn-add" routerLink="/m/prevention-mitigation/measures/create"><i class="fas fa-plus"></i> Add New Measure</a>
      }
    </dmis-page-header>

    <div class="flow-note">
      <b>DRR measures flow:</b>
      Institution registers a measure → status moves Not started → Ongoing → Completed ·
      Priority (high/medium/low) steers funding and partner support ·
      Linked hazard shows which risk the project addresses ·
      Open an institution block below to work its measures (not one flat dump of every project).
    </div>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Measures" icon="fa-list" color="#003366" />
      <dmis-stat-card [value]="institutionGroups().length" label="Institutions" icon="fa-building" color="#0f766e" />
      <dmis-stat-card [value]="stats().ongoing" label="Ongoing" icon="fa-spinner" color="#2563eb" />
      <dmis-stat-card [value]="stats().completed" label="Completed" icon="fa-check-double" color="#059669" />
    </div>

    <div class="panel-row" style="animation-delay:.25s;">
      <dmis-panel title="By Priority Level" icon="fa-chart-pie" [badge]="prioritySum() + ' classified'">
        <div class="panel-body">
          @if (byPriority().length) {
            <div class="chart-wrap"><canvas #priorityChart></canvas></div>
          } @else {
            <div class="empty-state"><i class="fas fa-chart-pie"></i>No priority data</div>
          }
        </div>
      </dmis-panel>
      <dmis-panel title="Status Overview" icon="fa-tasks" [badge]="stats().total + ' total'">
        <div class="panel-body">
          @if (statusData().length) {
            <div class="chart-wrap"><canvas #statusChart></canvas></div>
          } @else {
            <div class="empty-state"><i class="fas fa-tasks"></i>No status data</div>
          }
        </div>
      </dmis-panel>
    </div>

    <div class="filter-bar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search project, hazard, or institution…"
          [value]="search()" (input)="search.set($any($event.target).value)">
      </div>
      <select [value]="filterStatus()" (change)="filterStatus.set($any($event.target).value)">
        <option value="">All Statuses</option>
        <option value="Ongoing">Ongoing</option>
        <option value="Not started">Not Started</option>
        <option value="Completed">Completed</option>
        <option value="Design">Design</option>
      </select>
      <select [value]="filterInst()" (change)="filterInst.set($any($event.target).value)">
        <option value="">All institutions</option>
        @for (g of institutionGroups(); track g.name) {
          <option [value]="g.name">{{ g.name }} ({{ g.items.length }})</option>
        }
      </select>
    </div>

    <div class="panel-row full" style="animation-delay:.30s;">
      <dmis-panel title="Measures Registry — by implementing institution" icon="fa-building"
        [badge]="visibleCount() + ' shown · ' + institutionGroups().length + ' institutions'">
        <div class="panel-body" style="padding:8px 0 12px;">
          @if (institutionGroups().length) {
            @for (g of institutionGroups(); track g.name) {
              @if (!filterInst() || filterInst() === g.name) {
                <details class="inst-block" [open]="institutionGroups().length <= 3 || filterInst() === g.name">
                  <summary>
                    <span class="inst-name"><i class="fas fa-building"></i> {{ g.name }}</span>
                    <span class="inst-meta">{{ g.items.length }} measure{{ g.items.length === 1 ? '' : 's' }}</span>
                    <span class="inst-pills">
                      @if (g.ongoing) { <span class="inst-pill run">{{ g.ongoing }} ongoing</span> }
                      @if (g.completed) { <span class="inst-pill ok">{{ g.completed }} done</span> }
                      @if (g.notStarted) { <span class="inst-pill wait">{{ g.notStarted }} not started</span> }
                      @if (g.highPriority) { <span class="inst-pill hi">{{ g.highPriority }} high priority</span> }
                    </span>
                    <i class="fas fa-chevron-down chev"></i>
                  </summary>
                  <div style="overflow-x:auto;">
                    <table class="r-table">
                      <thead>
                        <tr>
                          <th>Project / programme</th>
                          <th>Hazard addressed</th>
                          <th>Status</th>
                          <th>Priority</th>
                          <th>Period</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (m of g.items; track m.id) {
                          <tr class="measure-row">
                            <td>
                              <div class="r-title">{{ limit(m.projectProgrammeName, 50) }}</div>
                            </td>
                            <td style="color:var(--text-mid);">{{ limit(m.hazardRiskAddressed, 28) || '—' }}</td>
                            <td><span class="r-badge {{ statusClass(m.projectStatus) }}">{{ m.projectStatus || '—' }}</span></td>
                            <td>
                              @if (m.priority) {
                                <span class="r-badge priority-{{ m.priority }}">{{ ucfirst(m.priority) }}</span>
                              } @else { <span style="color:var(--text-light);">—</span> }
                            </td>
                            <td style="color:var(--text-mid);">
                              @if (m.periodStart) {
                                {{ m.periodStart }} – {{ m.periodEnd || 'Ongoing' }}
                              } @else { — }
                            </td>
                            <td>
                              <div class="ctx-wrap">
                                <button class="ctx-trigger" type="button" (click)="toggleMenu(m.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                                <div class="ctx-menu" [class.open]="openMenu() === m.id">
                                  <button class="ctx-item" (click)="viewMeasure(m.id)"><i class="fas fa-eye"></i> View</button>
                                  @if (canManage()) {
                                    <a class="ctx-item success" [routerLink]="['/m/prevention-mitigation/measures', m.id, 'edit']"><i class="fas fa-edit"></i> Edit</a>
                                    <div class="ctx-divider"></div>
                                    <button class="ctx-item danger" (click)="askDelete(m)"><i class="fas fa-trash"></i> Delete</button>
                                  }
                                </div>
                              </div>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </details>
              }
            }
          } @else {
            <div class="empty-state">
              <i class="fas fa-shield-virus"></i>
              No mitigation measures match the current filters.<br>
              @if (canManage()) {
                <a class="btn-add" routerLink="/m/prevention-mitigation/measures/create" style="margin-top:0.6rem;display:inline-flex;"><i class="fas fa-plus"></i> Add First Measure</a>
              }
            </div>
          }
        </div>

        @if (pagination().lastPage > 1) {
          <div class="pagination-wrap">
            <span>Showing page {{ pagination().currentPage }} of {{ pagination().lastPage }} ({{ pagination().total }} total)</span>
            <div class="page-links">
              @if (pagination().currentPage === 1) {
                <span style="opacity:0.4;">&laquo;</span>
              } @else {
                <a (click)="load(pagination().currentPage - 1)" style="cursor:pointer;">&laquo;</a>
              }
              @for (p of pageRange(); track p) {
                @if (p === pagination().currentPage) {
                  <span class="active">{{ p }}</span>
                } @else {
                  <a (click)="load(p)" style="cursor:pointer;">{{ p }}</a>
                }
              }
              @if (pagination().currentPage < pagination().lastPage) {
                <a (click)="load(pagination().currentPage + 1)" style="cursor:pointer;">&raquo;</a>
              } @else {
                <span style="opacity:0.4;">&raquo;</span>
              }
            </div>
          </div>
        }
      </dmis-panel>
    </div>

    <!-- View Modal (the source's intended modal — its missing show method is FIXED here) -->
    <div class="v2-modal-backdrop" [class.open]="viewOpen()">
      <div class="v2-modal">
        <div class="v2-modal-header">
          <div class="modal-title"><i class="fas fa-eye"></i> Measure Details</div>
          <button class="v2-modal-close" (click)="viewOpen.set(false)">&times;</button>
        </div>
        <div class="v2-modal-body">
          @if (detail(); as d) {
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
              <div style="grid-column:1/-1;"><div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Project/Programme</div><div style="font-weight:600;">{{ d.projectProgrammeName || 'N/A' }}</div></div>
              <div><div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Status</div><div><span class="r-badge {{ statusClass(d.projectStatus) }}">{{ d.projectStatus || 'N/A' }}</span></div></div>
              <div><div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Priority</div><div>
                @if (d.priority) { <span class="r-badge priority-{{ d.priority }}">{{ ucfirst(d.priority) }}</span> } @else { N/A }
              </div></div>
              <div><div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Entity</div><div style="color:var(--text-mid);">{{ d.implementingEntity || 'N/A' }}</div></div>
              <div><div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Institution</div><div style="color:var(--text-mid);">{{ d.implementingInstitution || 'N/A' }}</div></div>
            </div>
            @if (d.narrativeDescription) {
              <div style="margin-top:0.8rem;"><div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Description</div>
                <div style="font-size:0.85rem;color:var(--text-mid);line-height:1.5;">{{ d.narrativeDescription }}</div></div>
            }
          }
        </div>
      </div>
    </div>

    <!-- Delete Modal -->
    <div class="v2-modal-backdrop" [class.open]="deleteOpen()">
      <div class="v2-modal sm">
        <div class="v2-modal-header">
          <div class="modal-title danger"><i class="fas fa-exclamation-triangle"></i> Confirm Deletion</div>
        </div>
        <div class="v2-modal-body">
          <p style="font-size:0.82rem;color:var(--text-mid);">Are you sure you want to delete <strong>{{ deleteTarget()?.projectProgrammeName }}</strong>?</p>
        </div>
        <div class="v2-modal-footer">
          <button class="btn-cancel" (click)="deleteOpen.set(false)">Cancel</button>
          <button class="btn-confirm danger" (click)="confirmDelete()"><i class="fas fa-trash"></i> Delete</button>
        </div>
      </div>
    </div>

    <div class="alert-container">
      @for (a of alerts(); track a.id) {
        <div class="v2-alert {{ a.type }}">
          <i class="fas fa-{{ a.type === 'success' ? 'check-circle' : 'exclamation-circle' }}"></i> {{ a.msg }}
          <button class="close-alert" (click)="dismissAlert(a.id)">&times;</button>
        </div>
      }
    </div>
  `,
})
export class MeasuresComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  priorityCanvas = viewChild<ElementRef<HTMLCanvasElement>>('priorityChart');
  statusCanvas = viewChild<ElementRef<HTMLCanvasElement>>('statusChart');

  measures = signal<MeasureRow[]>([]);
  pagination = signal({ currentPage: 1, lastPage: 1, total: 0, firstItem: 0, lastItem: 0 });
  stats = signal({ total: 0, ongoing: 0, notStarted: 0, completed: 0 });
  byPriority = signal<{ priority: string; total: number }[]>([]);
  search = signal('');
  filterStatus = signal('');
  filterInst = signal('');
  openMenu = signal<number | null>(null);
  viewOpen = signal(false);
  detail = signal<any | null>(null);
  deleteOpen = signal(false);
  deleteTarget = signal<MeasureRow | null>(null);
  alerts = signal<{ id: number; type: string; msg: string }[]>([]);

  private charts: any[] = [];
  private viewReady = false;
  private alertSeq = 0;

  constructor() {
    this.load(1);
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c.destroy());
  }

  load(page: number): void {
    this.http.get<IndexResponse>(`/api/v1/mitigation-measures?page=${page}`).subscribe(r => {
      this.measures.set(r.measures);
      this.pagination.set(r.pagination);
      this.stats.set(r.stats);
      this.byPriority.set(r.byPriority);
      this.renderCharts();
    });
  }

  pageRange(): number[] {
    const p = this.pagination();
    const from = Math.max(1, p.currentPage - 2);
    const to = Math.min(p.lastPage, p.currentPage + 2);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }

  prioritySum(): number {
    return this.byPriority().reduce((s, c) => s + c.total, 0);
  }

  canManage(): boolean {
    return this.auth.hasPermission('mitigation_measures.manage');
  }

  /** The source builds the status chart from the 3 stat values (Design deliberately absent). */
  statusData(): { label: string; value: number }[] {
    return [
      { label: 'Ongoing', value: this.stats().ongoing },
      { label: 'Not Started', value: this.stats().notStarted },
      { label: 'Completed', value: this.stats().completed },
    ].filter(d => d.value > 0);
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

  statusClass(status: string | null): string {
    switch (status) {
      case 'Ongoing': return 'status-ongoing';
      case 'Completed': return 'status-completed';
      case 'Not started': return 'status-not-started';
      case 'Design': return 'status-design';
      default: return '';
    }
  }

  rowVisible(m: MeasureRow): boolean {
    const q = this.search().toLowerCase();
    const text = ((m.projectProgrammeName ?? '') + ' ' + (m.hazardRiskAddressed ?? '') + ' '
      + (m.projectStatus ?? '') + ' ' + (m.implementingInstitution ?? '')).toLowerCase();
    const matchSearch = !q || text.includes(q);
    const matchStatus = !this.filterStatus() || m.projectStatus === this.filterStatus();
    const matchInst = !this.filterInst() || (m.implementingInstitution || 'Unassigned institution') === this.filterInst();
    return matchSearch && matchStatus && matchInst;
  }

  /**
   * Group visible measures under implementing institution so a ministry with 12 projects
   * is one expandable block — not twelve loose rows mixed with other agencies.
   */
  institutionGroups(): {
    name: string; items: MeasureRow[];
    ongoing: number; completed: number; notStarted: number; highPriority: number;
  }[] {
    const map = new Map<string, MeasureRow[]>();
    for (const m of this.measures()) {
      if (!this.rowVisible(m)) continue;
      const key = (m.implementingInstitution || '').trim() || 'Unassigned institution';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()]
      .map(([name, items]) => ({
        name,
        items,
        ongoing: items.filter(i => i.projectStatus === 'Ongoing').length,
        completed: items.filter(i => i.projectStatus === 'Completed').length,
        notStarted: items.filter(i => i.projectStatus === 'Not started' || i.projectStatus === 'Design').length,
        highPriority: items.filter(i => String(i.priority || '').toLowerCase() === 'high').length,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  visibleCount(): number {
    return this.institutionGroups().reduce((s, g) => s + g.items.length, 0);
  }

  viewMeasure(id: number): void {
    this.http.get<any>(`/api/v1/mitigation-measures/${id}`).subscribe({
      next: d => {
        this.detail.set(d);
        this.viewOpen.set(true);
      },
      error: () => this.showAlert('Error loading measure details', 'error'),
    });
  }

  askDelete(m: MeasureRow): void {
    if (!this.canManage()) {
      return;
    }
    this.deleteTarget.set(m);
    this.deleteOpen.set(true);
  }

  confirmDelete(): void {
    if (!this.canManage()) {
      return;
    }
    const target = this.deleteTarget();
    if (!target) {
      return;
    }
    this.http.delete(`/api/v1/mitigation-measures/${target.id}`).subscribe({
      next: () => {
        this.deleteOpen.set(false);
        this.showAlert('Measure deleted', 'success');
        setTimeout(() => this.load(this.pagination().currentPage), 1000);
      },
      error: () => {
        this.deleteOpen.set(false);
        this.showAlert('Error deleting measure', 'error');
      },
    });
  }

  toggleMenu(id: number, event: Event): void {
    event.stopPropagation();
    this.openMenu.update(c => (c === id ? null : id));
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.openMenu.set(null);
  }

  showAlert(msg: string, type: 'success' | 'error'): void {
    const id = ++this.alertSeq;
    this.alerts.update(a => [...a, { id, type, msg }]);
    setTimeout(() => this.dismissAlert(id), 5000);
  }

  dismissAlert(id: number): void {
    this.alerts.update(a => a.filter(x => x.id !== id));
  }

  /* ===== Charts — options copied from index-v2.blade.php ===== */

  private tooltipStyle = {
    backgroundColor: 'rgba(255,255,255,0.95)', titleColor: '#111827', bodyColor: '#4b5563',
    borderColor: '#e5e7eb', borderWidth: 1, padding: 12, cornerRadius: 10, titleFont: { weight: '700' },
  };

  private renderCharts(): void {
    if (!this.viewReady) {
      return;
    }
    // setTimeout lets Angular render the @if-guarded canvases before Chart.js binds to them.
    ensureChartJs().then(() => setTimeout(() => {
      this.charts.forEach(c => c.destroy());
      this.charts = [];
      this.renderPriorityChart();
      this.renderStatusChart();
    }));
  }

  private renderPriorityChart(): void {
    const el = this.priorityCanvas()?.nativeElement;
    const data = this.byPriority();
    if (!el || !data.length) {
      return;
    }
    const prColors: Record<string, string> = { high: '#dc2626', medium: '#f59e0b', low: '#10b981' };
    this.charts.push(new Chart(el, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.priority ? d.priority.charAt(0).toUpperCase() + d.priority.slice(1) : 'Unknown'),
        datasets: [{
          data: data.map(d => d.total),
          backgroundColor: data.map(d => (prColors[d.priority] || '#9ca3af') + 'cc'),
          borderWidth: 2, borderColor: '#fff',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          tooltip: this.tooltipStyle,
          legend: { position: 'bottom', labels: { padding: 12, font: { size: 12, weight: '600' }, usePointStyle: true, pointStyle: 'circle' } },
        },
      },
    }));
  }

  private renderStatusChart(): void {
    const el = this.statusCanvas()?.nativeElement;
    const data = this.statusData();
    if (!el || !data.length) {
      return;
    }
    const stColors: Record<string, string> = { Ongoing: '#2563eb', 'Not Started': '#6b7280', Completed: '#059669', Design: '#004d66' };
    this.charts.push(new Chart(el, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.label),
        datasets: [{
          data: data.map(d => d.value),
          backgroundColor: data.map(d => (stColors[d.label] || '#9ca3af') + 'cc'),
          borderWidth: 2, borderColor: '#fff',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          tooltip: this.tooltipStyle,
          legend: { position: 'bottom', labels: { padding: 12, font: { size: 12, weight: '600' }, usePointStyle: true, pointStyle: 'circle' } },
        },
      },
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
      script.src = '/vendor/chartjs/chart.umd.min.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }
  return chartJsPromise;
}
