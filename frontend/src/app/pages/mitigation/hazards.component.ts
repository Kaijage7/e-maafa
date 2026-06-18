import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

declare const Chart: any; // Chart.js 4.4.0, loaded per-page from the CDN exactly as index-v2 does

interface HazardRow {
  id: number; name: string; type: string; category: string | null; severity: string | null;
  frequency: string | null; seasonalPattern: string | null; isActive: boolean;
}
interface HazardDetail extends HazardRow {
  severityScale: string | null; description: string | null; typicalDuration: string | null;
  warningSigns: string[];
}
interface HazardIndexResponse {
  hazards: HazardRow[];
  pagination: { currentPage: number; lastPage: number; total: number; firstItem: number; lastItem: number };
  stats: { total: number; natural: number; humanInduced: number; active: number };
  hazardsByCategory: { category: string; total: number }[];
  hazardsBySeverity: { severity: string; frequency: string; total: number }[];
}

/** Reproduction of admin/hazards/index-v2.blade.php (Prevention & Mitigation → Hazard Management). */
@Component({
  selector: 'page-hazards',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, RouterLink],
  styles: [`
    .sev-low { background: rgba(16,185,129,0.12); color: #059669; }
    .sev-medium { background: rgba(245,158,11,0.12); color: #d97706; }
    .sev-high { background: rgba(220,38,38,0.12); color: #dc2626; }
    .sev-critical { background: rgba(17,24,39,0.12); color: #111827; }
    .status-switch { position: relative; display: inline-block; width: 34px; height: 18px; }
    .status-switch input { opacity: 0; width: 0; height: 0; }
    .status-slider { position: absolute; cursor: pointer; inset: 0; background: #cbd5e1; border-radius: 18px; transition: 0.3s; }
    .status-slider::before { content: ''; position: absolute; height: 14px; width: 14px; left: 2px; bottom: 2px; background: #fff; border-radius: 50%; transition: 0.3s; }
    .status-switch input:checked + .status-slider { background: #10b981; }
    .status-switch input:checked + .status-slider::before { transform: translateX(16px); }
    .alert-container { position: fixed; top: calc(var(--topbar-h) + 12px); right: 12px; z-index: 9999; width: 320px; }
  `],
  template: `
    <dmis-page-header title="Hazard Management" icon="fa-exclamation-triangle"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Prevention & Mitigation', url:'/m/prevention-mitigation/dashboard'}, {label:'Hazard Management'}]">
      <a class="btn-add" routerLink="/m/prevention-mitigation/hazards/create"><i class="fas fa-plus"></i> Register New Hazard</a>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Hazards" icon="fa-list" color="#003366" />
      <dmis-stat-card [value]="stats().natural" label="Natural" icon="fa-mountain" color="#006847" />
      <dmis-stat-card [value]="stats().humanInduced" label="Human Induced" icon="fa-industry" color="#FFD700" />
      <dmis-stat-card [value]="stats().active" label="Active" icon="fa-check-circle" color="#dc2626" />
    </div>

    <div class="panel-row" style="animation-delay:.25s;">
      <dmis-panel title="Hazards by Category" icon="fa-th-large" [badge]="categorySum() + ' classified'">
        <div class="panel-body">
          @if (byCategory().length) {
            <div class="chart-wrap"><canvas #categoryChart></canvas></div>
          } @else {
            <div class="empty-state"><i class="fas fa-th-large"></i>No categorized hazard data</div>
          }
        </div>
      </dmis-panel>
      <dmis-panel title="Severity vs Frequency" icon="fa-chart-scatter" [badge]="bySeverity().length + ' combos'">
        <div class="panel-body">
          @if (bySeverity().length) {
            <div class="chart-wrap"><canvas #bubbleChart></canvas></div>
          } @else {
            <div class="empty-state"><i class="fas fa-chart-scatter"></i>No severity/frequency data</div>
          }
        </div>
      </dmis-panel>
    </div>

    <div class="filter-bar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search hazards..." [value]="search()" (input)="search.set($any($event.target).value)">
      </div>
      <select [value]="filterType()" (change)="filterType.set($any($event.target).value)">
        <option value="">All Types</option>
        <option value="Natural">Natural</option>
        <option value="Human_induced">Human Induced</option>
      </select>
      <select [value]="filterSeverity()" (change)="filterSeverity.set($any($event.target).value)">
        <option value="">All Severities</option>
        <option value="Low">Low</option>
        <option value="Medium">Medium</option>
        <option value="High">High</option>
        <option value="Critical">Critical</option>
      </select>
    </div>

    <div class="panel-row full" style="animation-delay:.30s;">
      <dmis-panel title="Hazard Registry" icon="fa-database" [badge]="pagination().total + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (hazards().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead>
                  <tr>
                    <th>Hazard Name</th><th>Type</th><th>Category</th><th>Severity</th>
                    <th>Frequency</th><th>Status</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (h of hazards(); track h.id) {
                    <tr class="hazard-row" [style.display]="rowVisible(h) ? '' : 'none'">
                      <td>
                        <div class="r-title">{{ h.name }}</div>
                        @if (h.seasonalPattern) {
                          <div class="r-subtitle"><i class="fas fa-calendar-alt" style="font-size:0.55rem;margin-right:0.2rem;"></i>{{ h.seasonalPattern }}</div>
                        }
                      </td>
                      <td>
                        <span class="r-badge" style="background:rgba(0,51,102,0.08);color:var(--primary);">
                          <i class="fas {{ h.type === 'Natural' ? 'fa-leaf' : 'fa-industry' }}" style="font-size:0.5rem;margin-right:0.2rem;"></i>
                          {{ typeLabel(h.type) }}
                        </span>
                      </td>
                      <td style="color:var(--text-mid);">{{ h.category || 'N/A' }}</td>
                      <td>
                        @if (h.severity) {
                          <span class="r-badge sev-{{ h.severity.toLowerCase() }}">{{ h.severity }}</span>
                        } @else {
                          <span style="color:var(--text-light);">-</span>
                        }
                      </td>
                      <td style="color:var(--text-mid);font-size:0.72rem;">{{ h.frequency || '-' }}</td>
                      <td>
                        <label class="status-switch">
                          <input type="checkbox" [checked]="h.isActive" (change)="toggleStatus(h, $any($event.target))">
                          <span class="status-slider"></span>
                        </label>
                      </td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(h.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === h.id">
                            <button class="ctx-item" (click)="viewHazard(h.id)"><i class="fas fa-eye"></i> View</button>
                            <a class="ctx-item success" [routerLink]="['/m/prevention-mitigation/hazards', h.id, 'edit']"><i class="fas fa-edit"></i> Edit</a>
                            <div class="ctx-divider"></div>
                            <button class="ctx-item danger" (click)="askDelete(h)"><i class="fas fa-trash"></i> Delete</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state">
              <i class="fas fa-exclamation-triangle"></i>
              No hazards registered yet.<br>
              <a class="btn-add" routerLink="/m/prevention-mitigation/hazards/create" style="margin-top:0.6rem;display:inline-flex;">
                <i class="fas fa-plus"></i> Register First Hazard
              </a>
            </div>
          }
        </div>

        @if (pagination().lastPage > 1) {
          <div class="pagination-wrap">
            <span>Showing {{ pagination().firstItem }} to {{ pagination().lastItem }} of {{ pagination().total }}</span>
            <div class="page-links">
              @if (pagination().currentPage === 1) {
                <span style="opacity:0.4;">&laquo;</span>
              } @else {
                <a (click)="goToPage(pagination().currentPage - 1)" style="cursor:pointer;">&laquo;</a>
              }
              @for (p of pageRange(); track p) {
                @if (p === pagination().currentPage) {
                  <span class="active">{{ p }}</span>
                } @else {
                  <a (click)="goToPage(p)" style="cursor:pointer;">{{ p }}</a>
                }
              }
              @if (pagination().currentPage < pagination().lastPage) {
                <a (click)="goToPage(pagination().currentPage + 1)" style="cursor:pointer;">&raquo;</a>
              } @else {
                <span style="opacity:0.4;">&raquo;</span>
              }
            </div>
          </div>
        }
      </dmis-panel>
    </div>

    <!-- View Hazard Modal -->
    <div class="v2-modal-backdrop" [class.open]="viewOpen()">
      <div class="v2-modal">
        <div class="v2-modal-header">
          <div class="modal-title"><i class="fas fa-eye"></i> Hazard Details</div>
          <button class="v2-modal-close" (click)="viewOpen.set(false)">&times;</button>
        </div>
        <div class="v2-modal-body">
          @if (detail(); as d) {
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Name</div><div style="font-weight:600;">{{ d.name }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Type</div><div><span class="r-badge" style="background:rgba(0,51,102,0.08);color:var(--primary);">{{ typeLabel(d.type || 'N/A') }}</span></div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Category</div><div style="color:var(--text-mid);">{{ d.category || 'N/A' }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Severity</div><div>
                @if (d.severity) { <span class="r-badge sev-{{ d.severity.toLowerCase() }}">{{ d.severity }}</span> } @else { N/A }
              </div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Frequency</div><div style="color:var(--text-mid);">{{ d.frequency || 'N/A' }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Status</div><div>
                @if (d.isActive) { <span class="r-badge" style="background:rgba(16,185,129,0.12);color:#059669;">Active</span> }
                @else { <span class="r-badge" style="background:rgba(156,163,175,0.12);color:#6b7280;">Inactive</span> }
              </div></div>
            </div>
            @if (d.description) {
              <div style="margin-top:0.8rem;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Description</div>
                <div style="font-size:0.78rem;color:var(--text-mid);line-height:1.5;">{{ d.description }}</div></div>
            }
            @if (d.seasonalPattern) {
              <div style="margin-top:0.6rem;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Seasonal Pattern</div>
                <div style="font-size:0.78rem;color:var(--text-mid);">{{ d.seasonalPattern }}</div></div>
            }
            @if (d.warningSigns.length) {
              <div style="margin-top:0.6rem;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Warning Signs</div>
                <div style="display:flex;flex-wrap:wrap;gap:0.25rem;">
                  @for (s of d.warningSigns; track s) {
                    <span class="r-badge" style="background:rgba(245,158,11,0.12);color:#d97706;">{{ s }}</span>
                  }
                </div></div>
            }
          }
        </div>
      </div>
    </div>

    <!-- Delete Confirm Modal -->
    <div class="v2-modal-backdrop" [class.open]="deleteOpen()">
      <div class="v2-modal sm">
        <div class="v2-modal-header">
          <div class="modal-title danger"><i class="fas fa-exclamation-triangle"></i> Confirm Deletion</div>
          <button class="v2-modal-close" (click)="deleteOpen.set(false)">&times;</button>
        </div>
        <div class="v2-modal-body">
          <p style="font-size:0.82rem;color:var(--text-mid);margin-bottom:1rem;">Are you sure you want to delete <strong>{{ deleteTarget()?.name }}</strong>? This action cannot be undone.</p>
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
export class HazardsComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  categoryCanvas = viewChild<ElementRef<HTMLCanvasElement>>('categoryChart');
  bubbleCanvas = viewChild<ElementRef<HTMLCanvasElement>>('bubbleChart');

  hazards = signal<HazardRow[]>([]);
  pagination = signal({ currentPage: 1, lastPage: 1, total: 0, firstItem: 0, lastItem: 0 });
  stats = signal({ total: 0, natural: 0, humanInduced: 0, active: 0 });
  byCategory = signal<{ category: string; total: number }[]>([]);
  bySeverity = signal<{ severity: string; frequency: string; total: number }[]>([]);
  search = signal('');
  filterType = signal('');
  filterSeverity = signal('');
  openMenu = signal<number | null>(null);
  viewOpen = signal(false);
  detail = signal<HazardDetail | null>(null);
  deleteOpen = signal(false);
  deleteTarget = signal<HazardRow | null>(null);
  alerts = signal<{ id: number; type: string; msg: string }[]>([]);

  private charts: any[] = [];
  private viewReady = false;
  private alertSeq = 0;

  constructor() {
    this.load(1);
    // The Blade screens arrive with a session flash after store/update redirects; the form pages
    // pass the same message via router state.
    const flash = history.state?.['success'];
    if (flash) {
      this.showAlert(flash, 'success');
    }
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.renderCharts();
  }

  ngOnDestroy(): void {
    this.charts.forEach(c => c.destroy());
  }

  private load(page: number): void {
    this.http.get<HazardIndexResponse>(`/api/v1/hazards?page=${page}`).subscribe(r => {
      this.hazards.set(r.hazards);
      this.pagination.set(r.pagination);
      this.stats.set(r.stats);
      this.byCategory.set(r.hazardsByCategory);
      this.bySeverity.set(r.hazardsBySeverity);
      this.renderCharts();
    });
  }

  goToPage(page: number): void {
    this.load(page);
  }

  pageRange(): number[] {
    const p = this.pagination();
    const from = Math.max(1, p.currentPage - 2);
    const to = Math.min(p.lastPage, p.currentPage + 2);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }

  categorySum(): number {
    return this.byCategory().reduce((s, c) => s + c.total, 0);
  }

  typeLabel(type: string): string {
    return type.replace('_', ' ');
  }

  /** index-v2 filters rows client-side via data-* attributes; same matching here. */
  rowVisible(h: HazardRow): boolean {
    const q = this.search().toLowerCase();
    const text = (h.name + ' ' + (h.category ?? '') + ' ' + h.type).toLowerCase();
    const matchSearch = !q || text.includes(q);
    const matchType = !this.filterType() || h.type === this.filterType();
    const sev = this.filterSeverity().toLowerCase();
    const matchSev = !sev || (h.severity ?? '').toLowerCase() === sev;
    return matchSearch && matchType && matchSev;
  }

  toggleStatus(h: HazardRow, checkbox: HTMLInputElement): void {
    const isActive = checkbox.checked;
    this.http.post(`/api/v1/hazards/${h.id}/status`, { isActive }).subscribe({
      next: () => this.showAlert('Status updated', 'success'),
      error: () => {
        this.showAlert('Error updating status', 'error');
        checkbox.checked = !isActive;
      },
    });
  }

  viewHazard(id: number): void {
    this.http.get<HazardDetail>(`/api/v1/hazards/${id}`).subscribe({
      next: d => {
        this.detail.set(d);
        this.viewOpen.set(true);
      },
      error: () => this.showAlert('Error loading hazard details', 'error'),
    });
  }

  askDelete(h: HazardRow): void {
    this.deleteTarget.set(h);
    this.deleteOpen.set(true);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) {
      return;
    }
    this.http.delete(`/api/v1/hazards/${target.id}`).subscribe({
      next: () => {
        this.deleteOpen.set(false);
        this.showAlert('Hazard deleted successfully', 'success');
        setTimeout(() => this.load(this.pagination().currentPage), 1000);
      },
      error: err => {
        this.deleteOpen.set(false);
        this.showAlert(err.error?.detail || 'Cannot delete hazard', 'error');
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

  private renderCharts(): void {
    if (!this.viewReady) {
      return;
    }
    // setTimeout lets Angular render the @if-guarded canvases before Chart.js binds to them.
    ensureChartJs().then(() => setTimeout(() => {
      this.charts.forEach(c => c.destroy());
      this.charts = [];
      this.renderCategoryChart();
      this.renderBubbleChart();
    }));
  }

  private tooltipStyle = {
    backgroundColor: 'rgba(255,255,255,0.95)', titleColor: '#111827', bodyColor: '#4b5563',
    borderColor: '#e5e7eb', borderWidth: 1, padding: 12, cornerRadius: 10, titleFont: { weight: '700' },
  };

  private renderCategoryChart(): void {
    const el = this.categoryCanvas()?.nativeElement;
    const data = this.byCategory();
    if (!el || !data.length) {
      return;
    }
    const catColors = ['#003366', '#004d80', '#006847', '#FFD700', '#004d66', '#005499', '#b8860b', '#0a8f5e', '#006666', '#336699'];
    this.charts.push(new Chart(el, {
      type: 'bar',
      data: {
        labels: data.map(d => d.category),
        datasets: [{
          label: 'Hazards', data: data.map(d => d.total),
          backgroundColor: data.map((_, i) => catColors[i % catColors.length] + 'cc'),
          borderRadius: 6, barPercentage: 0.6,
        }],
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: this.tooltipStyle, legend: { display: false } },
        scales: {
          x: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false },
            ticks: { stepSize: 1, font: { size: 10 }, color: '#9ca3af', callback: (v: number) => Number.isInteger(v) ? v : '' } },
          y: { grid: { display: false }, ticks: { font: { size: 11, weight: '600' }, color: '#4b5563' } },
        },
      },
    }));
  }

  private renderBubbleChart(): void {
    const el = this.bubbleCanvas()?.nativeElement;
    const data = this.bySeverity();
    if (!el || !data.length) {
      return;
    }
    const sevMap: Record<string, number> = { Low: 1, Medium: 2, High: 3, Critical: 4 };
    const freqMap: Record<string, number> = { 'Very Rare': 1, Rare: 2, Occasional: 3, Common: 4, 'Very Common': 5 };
    const sevColors: Record<string, string> = { Low: '#10b981', Medium: '#f59e0b', High: '#dc2626', Critical: '#111827' };
    const bubbles = data.map(d => ({
      x: freqMap[d.frequency] || 3,
      y: sevMap[d.severity] || 2,
      r: Math.max(8, Math.min(30, d.total * 8)),
      label: d.severity + ' / ' + d.frequency,
      count: d.total,
      color: sevColors[d.severity] || '#9ca3af',
    }));
    this.charts.push(new Chart(el, {
      type: 'bubble',
      data: { datasets: [{ data: bubbles, backgroundColor: bubbles.map(b => b.color + '66'), borderColor: bubbles.map(b => b.color), borderWidth: 2 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { ...this.tooltipStyle, callbacks: {
            title: (ctx: any[]) => bubbles[ctx[0].dataIndex].label,
            label: (ctx: any) => bubbles[ctx.dataIndex].count + ' hazard(s)',
          } },
        },
        scales: {
          x: { min: 0.5, max: 5.5, grid: { color: 'rgba(0,0,0,0.04)' },
            title: { display: true, text: 'Frequency →', font: { size: 11, weight: '700' }, color: '#6b7280' },
            ticks: { stepSize: 1, font: { size: 9 }, color: '#9ca3af', callback: (v: number) => ['', 'V.Rare', 'Rare', 'Occasional', 'Common', 'V.Common'][v] || '' } },
          y: { min: 0.5, max: 4.5, grid: { color: 'rgba(0,0,0,0.04)' },
            title: { display: true, text: '← Severity', font: { size: 11, weight: '700' }, color: '#6b7280' },
            ticks: { stepSize: 1, font: { size: 9 }, color: '#9ca3af', callback: (v: number) => ['', 'Low', 'Medium', 'High', 'Critical'][v] || '' } },
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
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }
  return chartJsPromise;
}
