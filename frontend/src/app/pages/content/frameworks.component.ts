import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

declare const Chart: any; // Chart.js 4.4.0, loaded per-page from the CDN exactly as index-v2 does

interface FrameworkRow {
  id: number; documentName: string; documentType: string; yearOfApproval: number | null;
  hazardTypes: string[]; geographicScope: string | null; narrativeDescription: string | null;
  attachmentPath: string | null; status: string | null;
}
interface IndexResponse {
  frameworks: FrameworkRow[];
  pagination: { currentPage: number; lastPage: number; total: number; firstItem: number; lastItem: number };
  stats: { total: number; acts: number; policies: number; national: number };
  byDocType: { document_type: string; total: number }[];
  byScope: { geographic_scope: string; total: number }[];
}

/**
 * Reproduction of mitigation/frameworks/index-v2.blade.php (Content Management → Risk Frameworks).
 * The source's "Add New Framework" redirects straight back to the index (no v2 create UI,
 * deliberately FIXED: it links to the working form page implementing frameworkStore's rules).
 */
@Component({
  selector: 'page-frameworks',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, RouterLink],
  styles: [`
    .alert-container { position: fixed; top: calc(var(--topbar-h) + 12px); right: 12px; z-index: 9999; width: 320px; }
  `],
  template: `
    <dmis-page-header title="Risk Frameworks" icon="fa-file-contract"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'Risk Frameworks'}]">
      <a class="btn-add" routerLink="/m/content-management/frameworks/create"><i class="fas fa-plus"></i> Add New Framework</a>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Frameworks" icon="fa-layer-group" color="#003366" />
      <dmis-stat-card [value]="stats().acts" label="Acts" icon="fa-gavel" color="#006847" />
      <dmis-stat-card [value]="stats().policies" label="Policies" icon="fa-scroll" color="#FFD700" />
      <dmis-stat-card [value]="stats().national" label="National Scope" icon="fa-flag" color="#dc2626" />
    </div>

    <div class="panel-row" style="animation-delay:.25s;">
      <dmis-panel title="By Document Type" icon="fa-chart-pie" [badge]="sum(byDocType()) + ' classified'">
        <div class="panel-body">
          @if (byDocType().length) { <div class="chart-wrap"><canvas #docTypeChart></canvas></div> }
          @else { <div class="empty-state"><i class="fas fa-chart-pie"></i>No document type data</div> }
        </div>
      </dmis-panel>
      <dmis-panel title="By Geographic Scope" icon="fa-globe-africa" [badge]="sum(byScope()) + ' classified'">
        <div class="panel-body">
          @if (byScope().length) { <div class="chart-wrap"><canvas #scopeChart></canvas></div> }
          @else { <div class="empty-state"><i class="fas fa-globe-africa"></i>No scope data</div> }
        </div>
      </dmis-panel>
    </div>

    <div class="filter-bar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search frameworks..." [value]="search()" (input)="search.set($any($event.target).value)">
      </div>
      <select [value]="filterType()" (change)="filterType.set($any($event.target).value)">
        <option value="">All Types</option>
        <option value="Act">Act</option>
        <option value="Policies">Policies</option>
        <option value="Regulations">Regulations</option>
        <option value="DRR Guidelines">DRR Guidelines</option>
        <option value="Plans and Strategies">Plans & Strategies</option>
        <option value="Other">Other</option>
      </select>
    </div>

    <div class="panel-row full" style="animation-delay:.30s;">
      <dmis-panel title="Framework Registry" icon="fa-database" [badge]="pagination().total + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (rows().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr><th>Document Name</th><th>Type</th><th>Year</th><th>Hazards</th><th>Scope</th><th>Actions</th></tr></thead>
                <tbody>
                  @for (fw of rows(); track fw.id) {
                    <tr class="fw-row" [style.display]="rowVisible(fw) ? '' : 'none'">
                      <td>
                        <div class="r-title">{{ limit(fw.documentName, 50) }}</div>
                        @if (fw.narrativeDescription) { <div class="r-subtitle">{{ limit(fw.narrativeDescription, 60) }}</div> }
                      </td>
                      <td><span class="r-badge" style="background:rgba(0,51,102,0.08);color:var(--primary);">{{ fw.documentType }}</span></td>
                      <td style="color:var(--text-mid);">{{ fw.yearOfApproval || '-' }}</td>
                      <td>
                        @if (fw.hazardTypes.length) {
                          @for (ht of fw.hazardTypes.slice(0, 2); track ht) {
                            <span class="r-badge" style="background:rgba(212,160,23,0.12);color:#b8860b;margin-right:0.15rem;">{{ ht }}</span>
                          }
                          @if (fw.hazardTypes.length > 2) {
                            <span style="font-size:0.6rem;color:var(--text-light);">+{{ fw.hazardTypes.length - 2 }}</span>
                          }
                        } @else { <span style="color:var(--text-light);">-</span> }
                      </td>
                      <td style="color:var(--text-mid);font-size:0.72rem;">{{ fw.geographicScope || '-' }}</td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(fw.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === fw.id">
                            <button class="ctx-item" (click)="viewFramework(fw.id)"><i class="fas fa-eye"></i> View</button>
                            <a class="ctx-item success" [routerLink]="['/m/content-management/frameworks', fw.id, 'edit']"><i class="fas fa-edit"></i> Edit</a>
                            @if (fw.attachmentPath) {
                              <a class="ctx-item" [href]="'/api/storage/' + fw.attachmentPath" target="_blank"><i class="fas fa-download"></i> Download</a>
                            }
                            <div class="ctx-divider"></div>
                            <button class="ctx-item danger" (click)="askDelete(fw)"><i class="fas fa-trash"></i> Delete</button>
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
              <i class="fas fa-file-contract"></i>
              No frameworks registered yet.<br>
              <a class="btn-add" routerLink="/m/content-management/frameworks/create" style="margin-top:0.6rem;display:inline-flex;">
                <i class="fas fa-plus"></i> Add First Framework
              </a>
            </div>
          }
        </div>

        @if (pagination().lastPage > 1) {
          <div class="pagination-wrap">
            <span>Showing {{ pagination().firstItem }} to {{ pagination().lastItem }} of {{ pagination().total }}</span>
            <div class="page-links">
              @if (pagination().currentPage === 1) { <span style="opacity:0.4;">&laquo;</span> }
              @else { <a (click)="load(pagination().currentPage - 1)" style="cursor:pointer;">&laquo;</a> }
              @for (p of pageRange(); track p) {
                @if (p === pagination().currentPage) { <span class="active">{{ p }}</span> }
                @else { <a (click)="load(p)" style="cursor:pointer;">{{ p }}</a> }
              }
              @if (pagination().currentPage < pagination().lastPage) { <a (click)="load(pagination().currentPage + 1)" style="cursor:pointer;">&raquo;</a> }
              @else { <span style="opacity:0.4;">&raquo;</span> }
            </div>
          </div>
        }
      </dmis-panel>
    </div>

    <!-- View Modal -->
    <div class="v2-modal-backdrop" [class.open]="viewOpen()">
      <div class="v2-modal">
        <div class="v2-modal-header">
          <div class="modal-title"><i class="fas fa-eye"></i> Framework Details</div>
          <button class="v2-modal-close" (click)="viewOpen.set(false)">&times;</button>
        </div>
        <div class="v2-modal-body">
          @if (detail(); as f) {
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.8rem;">
              <div style="grid-column:1/-1;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Document Name</div><div style="font-weight:600;">{{ f.documentName || 'N/A' }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Type</div><div><span class="r-badge" style="background:rgba(0,51,102,0.08);color:var(--primary);">{{ f.documentType || 'N/A' }}</span></div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Year</div><div style="color:var(--text-mid);">{{ f.yearOfApproval || 'N/A' }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Scope</div><div style="color:var(--text-mid);">{{ f.geographicScope || 'N/A' }}</div></div>
              <div><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Status</div><div style="color:var(--text-mid);">{{ f.status || 'N/A' }}</div></div>
            </div>
            @if (f.narrativeDescription) {
              <div style="margin-top:0.8rem;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Description</div>
                <div style="font-size:0.78rem;color:var(--text-mid);line-height:1.5;">{{ f.narrativeDescription }}</div></div>
            }
            @if (f.hazardTypes?.length) {
              <div style="margin-top:0.6rem;"><div style="font-size:0.6rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.2rem;">Hazard Types</div>
                <div style="display:flex;flex-wrap:wrap;gap:0.25rem;">
                  @for (s of f.hazardTypes; track s) { <span class="r-badge" style="background:rgba(212,160,23,0.12);color:#b8860b;">{{ s }}</span> }
                </div></div>
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
          <p style="font-size:0.82rem;color:var(--text-mid);">Are you sure you want to delete <strong>{{ deleteTarget()?.documentName }}</strong>? This action cannot be undone.</p>
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
export class FrameworksComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  docTypeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('docTypeChart');
  scopeCanvas = viewChild<ElementRef<HTMLCanvasElement>>('scopeChart');

  rows = signal<FrameworkRow[]>([]);
  pagination = signal({ currentPage: 1, lastPage: 1, total: 0, firstItem: 0, lastItem: 0 });
  stats = signal({ total: 0, acts: 0, policies: 0, national: 0 });
  byDocType = signal<{ document_type: string; total: number }[]>([]);
  byScope = signal<{ geographic_scope: string; total: number }[]>([]);
  search = signal('');
  filterType = signal('');
  openMenu = signal<number | null>(null);
  viewOpen = signal(false);
  detail = signal<any | null>(null);
  deleteOpen = signal(false);
  deleteTarget = signal<FrameworkRow | null>(null);
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
    this.http.get<IndexResponse>(`/api/v1/frameworks?page=${page}`).subscribe(r => {
      this.rows.set(r.frameworks);
      this.pagination.set(r.pagination);
      this.stats.set(r.stats);
      this.byDocType.set(r.byDocType);
      this.byScope.set(r.byScope);
      this.renderCharts();
    });
  }

  pageRange(): number[] {
    const p = this.pagination();
    const from = Math.max(1, p.currentPage - 2);
    const to = Math.min(p.lastPage, p.currentPage + 2);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }

  sum(rows: { total: number }[]): number {
    return rows.reduce((s, r) => s + Number(r.total), 0);
  }

  limit(value: string | null, max: number): string {
    if (!value) {
      return '';
    }
    return value.length > max ? value.slice(0, max) + '...' : value;
  }

  rowVisible(fw: FrameworkRow): boolean {
    const q = this.search().toLowerCase();
    const text = (fw.documentName + ' ' + fw.documentType + ' ' + (fw.geographicScope ?? '')).toLowerCase();
    const matchSearch = !q || text.includes(q);
    const matchType = !this.filterType() || fw.documentType === this.filterType();
    return matchSearch && matchType;
  }

  viewFramework(id: number): void {
    this.http.get<any>(`/api/v1/frameworks/${id}`).subscribe({
      next: f => {
        this.detail.set(f);
        this.viewOpen.set(true);
      },
      error: () => this.showAlert('Error loading framework details', 'error'),
    });
  }

  askDelete(fw: FrameworkRow): void {
    this.deleteTarget.set(fw);
    this.deleteOpen.set(true);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) {
      return;
    }
    this.http.delete(`/api/v1/frameworks/${target.id}`).subscribe({
      next: () => {
        this.deleteOpen.set(false);
        this.showAlert('Framework deleted successfully', 'success');
        setTimeout(() => this.load(this.pagination().currentPage), 1000);
      },
      error: err => {
        this.deleteOpen.set(false);
        this.showAlert(err.error?.detail || 'Error deleting framework', 'error');
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
  private tooltipStyle = { backgroundColor: 'rgba(255,255,255,0.95)', titleColor: '#111827', bodyColor: '#4b5563', borderColor: '#e5e7eb', borderWidth: 1, padding: 12, cornerRadius: 10, titleFont: { weight: '700' } };
  private chartColors = ['#003366', '#004d80', '#006847', '#FFD700', '#004d66', '#005499', '#b8860b', '#0a8f5e'];

  private renderCharts(): void {
    if (!this.viewReady) {
      return;
    }
    ensureChartJs().then(() => setTimeout(() => {
      this.charts.forEach(c => c.destroy());
      this.charts = [];
      this.renderDoughnut(this.docTypeCanvas()?.nativeElement, this.byDocType().map(d => d.document_type),
        this.byDocType().map(d => d.total), 0);
      this.renderDoughnut(this.scopeCanvas()?.nativeElement, this.byScope().map(d => d.geographic_scope),
        this.byScope().map(d => d.total), 3);
    }));
  }

  private renderDoughnut(el: HTMLCanvasElement | undefined, labels: string[], values: number[], colorOffset: number): void {
    if (!el || !labels.length) {
      return;
    }
    this.charts.push(new Chart(el, {
      type: 'doughnut',
      data: { labels, datasets: [{ data: values,
        backgroundColor: labels.map((_, i) => this.chartColors[(i + colorOffset) % this.chartColors.length] + 'cc'),
        borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%',
        plugins: { tooltip: this.tooltipStyle, legend: { position: 'bottom', labels: { padding: 12, font: { size: 10, weight: '600' }, usePointStyle: true, pointStyle: 'circle' } } } },
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
