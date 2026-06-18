import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface DirectiveRow {
  id: number; event_pk: number; event_code: string; directive_title: string;
  priority_level: string; deadline: string | null; is_overdue: boolean; status: string;
  issued_by_name: string | null; ack_total: number; ack_acknowledged: number;
  ack_pending: number; impl_avg_percentage: number;
}
interface IndexResponse {
  data: DirectiveRow[]; currentPage: number; lastPage: number; total: number;
  firstItem: number | null; lastItem: number | null;
  stats: { total: number; issued: number; in_progress: number; completed: number; overdue: number };
  my_pending: number;
}

/**
 * Reproduction of onehealth/directives/index.blade.php: KPI stat cards, the
 * filter bar (client-side search narrowing + server filters), and the directives
 * registry with acknowledgement counts and implementation progress bars.
 */
@Component({
  selector: 'page-oh-directives',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent, StatCardComponent],
  styles: [`
    .filter-bar select, .filter-bar input[type="date"] { padding: 0.45rem 0.7rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.78rem; background: #fff; color: var(--text-dark); font-family: inherit; }
    .progress { background: #e9ecef; border-radius: 0.375rem; overflow: hidden; display: flex; }
    .progress-bar { background: #0d6efd; color: #fff; font-size: 0.62rem; display: flex; align-items: center; justify-content: center; white-space: nowrap; transition: width 0.6s ease; }
    .progress-bar.bg-success { background: #198754; }
    .ctx-wrap { position: relative; display: inline-block; }
    .ctx-trigger { width: 28px; height: 28px; border: none; background: transparent; border-radius: 8px; color: var(--text-light); cursor: pointer; }
    .ctx-trigger:hover { background: rgba(0,0,0,0.05); color: var(--text-dark); }
    .ctx-menu { display: none; position: absolute; right: 0; top: 100%; z-index: 50; min-width: 170px; background: #fff; border-radius: 12px; border: 1px solid var(--border, #e5e9f0); box-shadow: 0 12px 36px rgba(0,0,0,0.12); padding: 4px; }
    .ctx-menu.open { display: block; }
    .ctx-item { display: flex; align-items: center; gap: 0.5rem; width: 100%; text-align: left; padding: 0.45rem 0.75rem; border: none; background: none; font-size: 0.78rem; font-family: inherit; color: var(--text-mid); border-radius: 8px; cursor: pointer; text-decoration: none; }
    .ctx-item:hover { background: rgba(8,145,178,0.06); color: var(--text-dark); }
    .ctx-item.success { color: #047857; }
    .ctx-item.warning { color: #b45309; }
    .ctx-item i { width: 14px; font-size: 0.7rem; }
    .ctx-divider { height: 1px; background: rgba(0,0,0,0.05); margin: 3px 6px; }
    .pagination-wrap { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.1rem; font-size: 0.78rem; color: var(--text-light); }
    .page-links { display: flex; gap: 0.25rem; }
    .page-links a, .page-links span { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 8px; text-decoration: none; color: var(--text-mid); cursor: pointer; }
    .page-links a:hover { background: rgba(8,145,178,0.08); }
    .page-links span.active { background: #0891b2; color: #fff; font-weight: 700; }
    .page-links span.dim { opacity: 0.4; cursor: default; }
  `],
  template: `
    <dmis-page-header title="One Health Directives" icon="fa-gavel"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'One Health'}, {label:'Directives'}]">
      @if (myPending() > 0) {
        <span class="r-badge badge-pending" style="font-size:0.82rem;"><i class="fas fa-bell"></i> {{ myPending() }} Pending Acknowledgement</span>
      }
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()?.total ?? 0" label="Total Directives" icon="fa-gavel" color="#0891b2" />
      <dmis-stat-card [value]="stats()?.issued ?? 0" label="Issued" icon="fa-paper-plane" color="#3b82f6" />
      <dmis-stat-card [value]="stats()?.in_progress ?? 0" label="In Progress" icon="fa-spinner" color="#f59e0b" />
      <dmis-stat-card [value]="stats()?.overdue ?? 0" label="Overdue" icon="fa-exclamation-triangle" color="#ef4444" />
    </div>

    <div class="filter-bar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search directives..." [ngModel]="searchText()" (ngModelChange)="searchText.set($event)" (keydown.enter)="applySearch()">
      </div>
      <select [ngModel]="filterStatus()" (ngModelChange)="filterStatus.set($event); reload(1)">
        <option value="">All Statuses</option>
        @for (s of ['draft', 'issued', 'acknowledged', 'in_progress', 'completed', 'overdue']; track s) {
          <option [value]="s">{{ ucfirst(s) }}</option>
        }
      </select>
      <select [ngModel]="filterPriority()" (ngModelChange)="filterPriority.set($event); reload(1)">
        <option value="">All Priorities</option>
        @for (p of ['critical', 'high', 'medium', 'low']; track p) {
          <option [value]="p">{{ ucfirst(p) }}</option>
        }
      </select>
      <select [ngModel]="filterMine()" (ngModelChange)="filterMine.set($event); reload(1)">
        <option value="">All Directives</option>
        <option value="mine">My Directives</option>
      </select>
      <input type="date" [ngModel]="filterDateFrom()" (ngModelChange)="filterDateFrom.set($event); reload(1)" title="Date From" style="font-size:0.82rem;">
      <input type="date" [ngModel]="filterDateTo()" (ngModelChange)="filterDateTo.set($event); reload(1)" title="Date To" style="font-size:0.82rem;">
      @if (anyFilter()) {
        <button class="btn btn-sm btn-outline-secondary" style="font-size:0.78rem;white-space:nowrap;" (click)="resetFilters()"><i class="fas fa-times"></i> Reset</button>
      }
    </div>

    <div class="panel-row" style="animation-delay:.30s;">
      <dmis-panel title="Directives Registry" icon="fa-database" [badge]="total() + ' total'">
        <div class="panel-body" style="padding:0;">
          <div style="overflow-x:auto;">
            <table class="r-table">
              <thead>
                <tr>
                  <th>#</th><th>Event</th><th>Directive Title</th><th>Priority</th><th>Deadline</th>
                  <th>Status</th><th>Acknowledgement</th><th>Implementation</th><th>Issued By</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (d of visibleRows(); track d.id) {
                  <tr class="data-row">
                    <td style="font-size:0.82rem;color:var(--text-mid);">{{ d.id }}</td>
                    <td><a [routerLink]="['/m/one-health/events', d.event_pk]" style="color:#0891b2;font-weight:600;text-decoration:none;">{{ d.event_code }}</a></td>
                    <td>
                      <a [routerLink]="['/m/one-health/directives', d.id]" style="color:var(--text-dark);text-decoration:none;">
                        <div class="r-title">{{ limit(d.directive_title, 40) }}</div>
                      </a>
                    </td>
                    <td><span class="r-badge" [class]="'r-badge ' + priorityBadge(d.priority_level)">{{ ucfirst(d.priority_level) }}</span></td>
                    <td>
                      <div style="font-size:0.82rem;color:var(--text-mid);">{{ d.deadline ?? '-' }}</div>
                      @if (d.is_overdue) { <span class="r-badge badge-rejected" style="font-size:0.65rem;">OVERDUE</span> }
                    </td>
                    <td><span class="r-badge" [class]="'r-badge ' + statusBadge(d.status)">{{ ucfirst(d.status) }}</span></td>
                    <td>
                      <span style="color:#10b981;font-weight:600;font-size:0.82rem;">{{ d.ack_acknowledged }}</span>
                      <span style="color:var(--text-light);font-size:0.82rem;">/</span>
                      <span style="color:var(--text-mid);font-size:0.82rem;">{{ d.ack_total }}</span>
                      @if (d.ack_pending > 0) {
                        <div style="font-size:0.7rem;color:#f59e0b;">({{ d.ack_pending }} pending)</div>
                      }
                    </td>
                    <td>
                      <div class="progress" style="height: 15px; min-width: 60px;">
                        <div class="progress-bar" [class.bg-success]="d.impl_avg_percentage >= 100" [style.width.%]="d.impl_avg_percentage">{{ d.impl_avg_percentage }}%</div>
                      </div>
                    </td>
                    <td><div class="r-title" style="font-size:0.78rem;">{{ d.issued_by_name ?? '-' }}</div></td>
                    <td>
                      <div class="ctx-wrap">
                        <button class="ctx-trigger" type="button" (click)="toggleMenu(d.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                        <div class="ctx-menu" [class.open]="openMenuId() === d.id">
                          <a [routerLink]="['/m/one-health/directives', d.id]" class="ctx-item"><i class="fas fa-eye"></i> View</a>
                          <a [routerLink]="['/m/one-health/directives', d.id]" fragment="edit" class="ctx-item success"><i class="fas fa-edit"></i> Edit</a>
                          <a [routerLink]="['/m/one-health/directives', d.id]" fragment="respond" class="ctx-item warning"><i class="fas fa-reply"></i> Submit Update</a>
                          <div class="ctx-divider"></div>
                          <a [routerLink]="['/m/one-health/events', d.event_pk]" class="ctx-item"><i class="fas fa-heartbeat"></i> Go to Event</a>
                        </div>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="10"><div class="empty-state"><i class="fas fa-gavel"></i> No directives found.</div></td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        @if (lastPage() > 1) {
          <div class="pagination-wrap">
            <span>Showing {{ firstItem() }} to {{ lastItem() }} of {{ total() }}</span>
            <div class="page-links">
              @if (currentPage() === 1) { <span class="dim">&laquo;</span> } @else { <a (click)="reload(currentPage() - 1)">&laquo;</a> }
              @for (p of pageWindow(); track p) {
                @if (p === currentPage()) { <span class="active">{{ p }}</span> } @else { <a (click)="reload(p)">{{ p }}</a> }
              }
              @if (currentPage() < lastPage()) { <a (click)="reload(currentPage() + 1)">&raquo;</a> } @else { <span class="dim">&raquo;</span> }
            </div>
          </div>
        }
      </dmis-panel>
    </div>
  `,
})
export class OhDirectivesComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  rows = signal<DirectiveRow[]>([]);
  total = signal(0);
  currentPage = signal(1);
  lastPage = signal(1);
  firstItem = signal<number | null>(null);
  lastItem = signal<number | null>(null);
  stats = signal<IndexResponse['stats'] | null>(null);
  myPending = signal(0);
  openMenuId = signal<number | null>(null);

  searchText = signal('');
  filterSearch = signal('');
  filterStatus = signal('');
  filterPriority = signal('');
  filterMine = signal('');
  filterDateFrom = signal('');
  filterDateTo = signal('');

  anyFilter = computed(() =>
    !!(this.filterSearch() || this.filterStatus() || this.filterPriority() || this.filterMine()
        || this.filterDateFrom() || this.filterDateTo()));

  /** Client-side narrowing while typing, like the Blade's input handler. */
  visibleRows = computed(() => {
    const q = this.searchText().toLowerCase();
    if (!q || q === this.filterSearch().toLowerCase()) { return this.rows(); }
    return this.rows().filter(d =>
      [String(d.id), d.event_code, d.directive_title, d.issued_by_name ?? ''].join(' ').toLowerCase().includes(q));
  });

  ngOnInit(): void {
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('event_id')) { /* deep link from event screens */ }
    document.addEventListener('click', () => this.openMenuId.set(null));
    this.reload(1);
  }

  reload(page: number): void {
    const params: Record<string, string> = { page: String(page) };
    if (this.filterStatus()) { params['status'] = this.filterStatus(); }
    if (this.filterPriority()) { params['priority'] = this.filterPriority(); }
    if (this.filterMine()) { params['filter'] = this.filterMine(); }
    if (this.filterDateFrom()) { params['date_from'] = this.filterDateFrom(); }
    if (this.filterDateTo()) { params['date_to'] = this.filterDateTo(); }
    if (this.filterSearch()) { params['search'] = this.filterSearch(); }
    const eventId = this.route.snapshot.queryParamMap.get('event_id');
    if (eventId) { params['event_id'] = eventId; }
    this.http.get<IndexResponse>('/api/v1/onehealth/directives', { params }).subscribe(res => {
      this.rows.set(res.data);
      this.total.set(res.total);
      this.currentPage.set(res.currentPage);
      this.lastPage.set(res.lastPage);
      this.firstItem.set(res.firstItem);
      this.lastItem.set(res.lastItem);
      this.stats.set(res.stats);
      this.myPending.set(res.my_pending);
    });
  }

  applySearch(): void {
    this.filterSearch.set(this.searchText().trim());
    this.reload(1);
  }

  resetFilters(): void {
    this.searchText.set(''); this.filterSearch.set(''); this.filterStatus.set('');
    this.filterPriority.set(''); this.filterMine.set(''); this.filterDateFrom.set(''); this.filterDateTo.set('');
    this.reload(1);
  }

  toggleMenu(id: number, ev: Event): void {
    ev.stopPropagation();
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  pageWindow(): number[] {
    const out: number[] = [];
    for (let p = Math.max(1, this.currentPage() - 2); p <= Math.min(this.lastPage(), this.currentPage() + 2); p++) { out.push(p); }
    return out;
  }

  statusBadge(status: string): string {
    return ({
      draft: 'badge-draft', issued: 'badge-published', acknowledged: 'badge-active',
      in_progress: 'badge-pending', completed: 'badge-approved', overdue: 'badge-rejected',
    } as Record<string, string>)[status] ?? 'badge-inactive';
  }

  priorityBadge(priority: string): string {
    return ({
      critical: 'badge-rejected', high: 'badge-pending', medium: 'badge-published', low: 'badge-inactive',
    } as Record<string, string>)[priority] ?? 'badge-inactive';
  }

  ucfirst(s: string): string {
    return (s ?? '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
  }

  limit(s: string | null | undefined, max: number): string {
    if (!s) { return ''; }
    return s.length <= max ? s : s.substring(0, max).trimEnd() + '...';
  }
}
