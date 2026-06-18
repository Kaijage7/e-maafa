import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

declare const Chart: any; // Chart.js 4.4.0, loaded per-page from the CDN exactly as index-v2 does

interface DisasterRow {
  id: number; eventName: string; eventDate: string | null; locationDescription: string | null;
  hazardName: string | null; reportDocumentPath: string | null;
}
interface DisasterDetail {
  id: number; eventName: string; eventDate: string | null; locationDescription: string | null;
  latitude: number | null; longitude: number | null; hazardId: number | null; hazardName: string | null;
  descriptionOfEvent: string | null; impactDescription: string | null; lessonsLearned: string | null;
  sourceOfInformation: string | null; reportDocumentPath: string | null;
}
interface IndexResponse {
  pastDisasters: DisasterRow[];
  pagination: { currentPage: number; lastPage: number; total: number; firstItem: number; lastItem: number };
  stats: { total: number; last12Months: number; withReports: number; geoLocated: number };
  hazards: { id: number; name: string }[];
  byHazardType: { hazardName: string; total: number }[];
  byYear: { year: number; total: number }[];
}

/** Reproduction of admin/past_disasters/index-v2.blade.php (Prevention & Mitigation → Disaster Repository). */
@Component({
  selector: 'page-past-disasters',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, RouterLink],
  styles: [`
    .r-view.download { background: rgba(0,77,102,0.08); color: #004d66; }
    .r-view.download:hover { background: rgba(0,77,102,0.15); }
    .alert-container { position: fixed; top: calc(var(--topbar-h) + 12px); right: 12px; z-index: 9999; width: 320px; }
  `],
  template: `
    <dmis-page-header title="Disaster Repository" icon="fa-history"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Prevention & Mitigation', url:'/m/prevention-mitigation/dashboard'}, {label:'Disaster Repository'}]">
      <a class="btn-add" routerLink="/m/prevention-mitigation/past-disasters/create"><i class="fas fa-plus"></i> Add New Record</a>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Events" icon="fa-archive" color="#003366" />
      <dmis-stat-card [value]="stats().last12Months" label="Last 12 Months" icon="fa-calendar-alt" color="#dc2626" />
      <dmis-stat-card [value]="stats().withReports" label="With Reports" icon="fa-file-alt" color="#059669" />
      <dmis-stat-card [value]="stats().geoLocated" label="Geo-located" icon="fa-map-pin" color="#FFD700" />
    </div>

    <div class="panel-row" style="animation-delay:.25s;">
      <dmis-panel title="By Hazard Type" icon="fa-chart-pie" [badge]="hazardTypeSum() + ' classified'">
        <div class="panel-body">
          @if (byHazardType().length) {
            <div class="chart-wrap"><canvas #hazardTypeChart></canvas></div>
          } @else {
            <div class="empty-state"><i class="fas fa-chart-pie"></i>No hazard type data</div>
          }
        </div>
      </dmis-panel>
      <dmis-panel title="Disasters by Year" icon="fa-chart-line" [badge]="byYear().length + ' years'">
        <div class="panel-body">
          @if (byYear().length) {
            <div class="chart-wrap"><canvas #yearChart></canvas></div>
          } @else {
            <div class="empty-state"><i class="fas fa-chart-line"></i>No timeline data</div>
          }
        </div>
      </dmis-panel>
    </div>

    <div class="filter-bar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search disasters..." [value]="search()" (input)="search.set($any($event.target).value)">
      </div>
      <select [value]="filterHazard()" (change)="filterHazard.set($any($event.target).value)">
        <option value="">All Hazards</option>
        @for (h of hazardOptions(); track h.id) { <option [value]="h.name">{{ h.name }}</option> }
      </select>
    </div>

    <div class="panel-row full" style="animation-delay:.30s;">
      <dmis-panel title="Disaster Records" icon="fa-database" [badge]="pagination().total + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (disasters().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr><th>Event</th><th>Date</th><th>Location</th><th>Hazard</th><th>Report</th><th>Actions</th></tr></thead>
                <tbody>
                  @for (d of disasters(); track d.id) {
                    <tr class="disaster-row" [style.display]="rowVisible(d) ? '' : 'none'">
                      <td><div class="r-title">{{ limit(d.eventName, 40) }}</div></td>
                      <td style="color:var(--text-mid);font-size:0.72rem;">{{ d.eventDate || '-' }}</td>
                      <td style="color:var(--text-mid);font-size:0.72rem;">{{ limit(d.locationDescription, 25) || '-' }}</td>
                      <td>
                        @if (d.hazardName) {
                          <span class="r-badge" style="background:rgba(212,160,23,0.12);color:#b8860b;">{{ d.hazardName }}</span>
                        } @else { <span style="color:var(--text-light);">-</span> }
                      </td>
                      <td>
                        @if (d.reportDocumentPath) {
                          <a [href]="'/api/storage/' + d.reportDocumentPath" target="_blank" class="r-view download"><i class="fas fa-download" style="font-size:0.55rem;"></i> PDF</a>
                        } @else { <span style="color:var(--text-light);font-size:0.65rem;">None</span> }
                      </td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(d.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === d.id">
                            <button class="ctx-item" (click)="viewDisaster(d.id)"><i class="fas fa-eye"></i> View</button>
                            <a class="ctx-item success" [routerLink]="['/m/prevention-mitigation/past-disasters', d.id, 'edit']"><i class="fas fa-edit"></i> Edit</a>
                            <div class="ctx-divider"></div>
                            <button class="ctx-item danger" (click)="askDelete(d)"><i class="fas fa-trash"></i> Delete</button>
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
              <i class="fas fa-history"></i>
              No disaster records yet.<br>
              <a class="btn-add" routerLink="/m/prevention-mitigation/past-disasters/create" style="margin-top:0.6rem;display:inline-flex;">
                <i class="fas fa-plus"></i> Add First Record
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

    <!-- View Modal -->
    <div class="v2-modal-backdrop" [class.open]="viewOpen()">
      <div class="v2-modal">
        <div class="v2-modal-header">
          <div class="modal-title"><i class="fas fa-eye"></i> Disaster Details</div>
          <button class="v2-modal-close" (click)="viewOpen.set(false)">&times;</button>
        </div>
        <div class="v2-modal-body">
          @if (detail(); as d) {
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
              <div style="grid-column:1/-1;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Event Name</div><div style="font-weight:600;">{{ d.eventName || 'N/A' }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Date</div><div style="color:var(--text-mid);">{{ formatDate(d.eventDate) }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Hazard</div><div>
                @if (d.hazardName) { <span class="r-badge" style="background:rgba(212,160,23,0.12);color:#b8860b;">{{ d.hazardName }}</span> } @else { N/A }
              </div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Location</div><div style="color:var(--text-mid);">{{ d.locationDescription || 'N/A' }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Source</div><div style="color:var(--text-mid);">{{ d.sourceOfInformation || 'N/A' }}</div></div>
            </div>
            @if (d.descriptionOfEvent) {
              <div style="margin-top:0.8rem;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Description</div>
                <div style="font-size:0.78rem;color:var(--text-mid);line-height:1.5;">{{ d.descriptionOfEvent }}</div></div>
            }
            @if (d.impactDescription) {
              <div style="margin-top:0.6rem;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Impact</div>
                <div style="font-size:0.78rem;color:var(--text-mid);line-height:1.5;">{{ d.impactDescription }}</div></div>
            }
            @if (d.lessonsLearned) {
              <div style="margin-top:0.6rem;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Lessons Learned</div>
                <div style="font-size:0.78rem;color:var(--text-mid);line-height:1.5;">{{ d.lessonsLearned }}</div></div>
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
          <button class="v2-modal-close" (click)="deleteOpen.set(false)">&times;</button>
        </div>
        <div class="v2-modal-body">
          <p style="font-size:0.82rem;color:var(--text-mid);margin-bottom:1rem;">Are you sure you want to delete <strong>{{ deleteTarget()?.eventName }}</strong>?</p>
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
export class PastDisastersComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  hazardTypeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('hazardTypeChart');
  yearCanvas = viewChild<ElementRef<HTMLCanvasElement>>('yearChart');

  disasters = signal<DisasterRow[]>([]);
  pagination = signal({ currentPage: 1, lastPage: 1, total: 0, firstItem: 0, lastItem: 0 });
  stats = signal({ total: 0, last12Months: 0, withReports: 0, geoLocated: 0 });
  hazardOptions = signal<{ id: number; name: string }[]>([]);
  byHazardType = signal<{ hazardName: string; total: number }[]>([]);
  byYear = signal<{ year: number; total: number }[]>([]);
  search = signal('');
  filterHazard = signal('');
  openMenu = signal<number | null>(null);
  viewOpen = signal(false);
  detail = signal<DisasterDetail | null>(null);
  deleteOpen = signal(false);
  deleteTarget = signal<DisasterRow | null>(null);
  alerts = signal<{ id: number; type: string; msg: string }[]>([]);

  private charts: any[] = [];
  private viewReady = false;
  private alertSeq = 0;

  constructor() {
    this.load(1);
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

  load(page: number): void {
    this.http.get<IndexResponse>(`/api/v1/past-disasters?page=${page}`).subscribe(r => {
      this.disasters.set(r.pastDisasters);
      this.pagination.set(r.pagination);
      this.stats.set(r.stats);
      this.hazardOptions.set(r.hazards);
      this.byHazardType.set(r.byHazardType);
      this.byYear.set(r.byYear);
      this.renderCharts();
    });
  }

  pageRange(): number[] {
    const p = this.pagination();
    const from = Math.max(1, p.currentPage - 2);
    const to = Math.min(p.lastPage, p.currentPage + 2);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }

  hazardTypeSum(): number {
    return this.byHazardType().reduce((s, c) => s + c.total, 0);
  }

  /** Str::limit equivalent (40 for event, 25 for location). */
  limit(value: string | null, max: number): string {
    if (!value) {
      return '';
    }
    return value.length > max ? value.slice(0, max) + '...' : value;
  }

  formatDate(iso: string | null): string {
    if (!iso) {
      return 'N/A';
    }
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** index-v2 filters rows client-side via data-search / data-hazard; same matching here. */
  rowVisible(d: DisasterRow): boolean {
    const q = this.search().toLowerCase();
    const text = (d.eventName + ' ' + (d.locationDescription ?? '') + ' ' + (d.hazardName ?? '')).toLowerCase();
    const matchSearch = !q || text.includes(q);
    const matchHazard = !this.filterHazard() || d.hazardName === this.filterHazard();
    return matchSearch && matchHazard;
  }

  viewDisaster(id: number): void {
    this.http.get<DisasterDetail>(`/api/v1/past-disasters/${id}`).subscribe({
      next: d => {
        this.detail.set(d);
        this.viewOpen.set(true);
      },
      error: () => this.showAlert('Error loading details', 'error'),
    });
  }

  askDelete(d: DisasterRow): void {
    this.deleteTarget.set(d);
    this.deleteOpen.set(true);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) {
      return;
    }
    this.http.delete(`/api/v1/past-disasters/${target.id}`).subscribe({
      next: () => {
        this.deleteOpen.set(false);
        this.showAlert('Record deleted', 'success');
        setTimeout(() => this.load(this.pagination().currentPage), 1000);
      },
      error: err => {
        this.deleteOpen.set(false);
        this.showAlert(err.error?.detail || 'Error deleting record', 'error');
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
  private chartColors = ['#003366', '#004d80', '#006847', '#FFD700', '#dc2626', '#004d66', '#005499', '#b8860b', '#0a8f5e', '#004d66'];

  private renderCharts(): void {
    if (!this.viewReady) {
      return;
    }
    // setTimeout lets Angular render the @if-guarded canvases before Chart.js binds to them.
    ensureChartJs().then(() => setTimeout(() => {
      this.charts.forEach(c => c.destroy());
      this.charts = [];
      this.renderHazardTypeChart();
      this.renderYearChart();
    }));
  }

  private renderHazardTypeChart(): void {
    const el = this.hazardTypeCanvas()?.nativeElement;
    const data = this.byHazardType();
    if (!el || !data.length) {
      return;
    }
    this.charts.push(new Chart(el, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.hazardName),
        datasets: [{
          data: data.map(d => d.total),
          backgroundColor: data.map((_, i) => this.chartColors[i % this.chartColors.length] + 'cc'),
          borderWidth: 2, borderColor: '#fff',
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: {
          tooltip: this.tooltipStyle,
          legend: { position: 'bottom', labels: { padding: 12, font: { size: 10, weight: '600' }, usePointStyle: true, pointStyle: 'circle' } },
        },
      },
    }));
  }

  private renderYearChart(): void {
    const el = this.yearCanvas()?.nativeElement;
    const data = this.byYear();
    if (!el || !data.length) {
      return;
    }
    this.charts.push(new Chart(el, {
      type: 'line',
      data: {
        labels: data.map(d => d.year),
        datasets: [{
          label: 'Disasters', data: data.map(d => d.total),
          borderColor: '#003366', backgroundColor: 'rgba(0,51,102,0.08)', fill: true,
          tension: 0.4, pointRadius: 4, pointBackgroundColor: '#003366', borderWidth: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { tooltip: this.tooltipStyle, legend: { display: false } },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#9ca3af' } },
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { stepSize: 1, font: { size: 10 }, color: '#9ca3af' } },
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
