import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

interface DissRow {
  id: number; event_pk: number; event_code: string; dissemination_type: string;
  alert_message: string; approval_status: string; status: string;
  sms_sent_count: number; email_sent_count: number; created_at: string;
}
interface IndexResponse {
  data: DissRow[]; currentPage: number; lastPage: number; total: number;
  firstItem: number | null; lastItem: number | null;
  stats: { total: number; pending_approval: number; sent: number; failed: number };
}

/**
 * Reproduction of onehealth/dissemination/index.blade.php: KPI stat cards, type /
 * approval / status filters, client-side search and the registry with quick
 * Approve / Resend actions.
 *
 * OH-13 fix: the registry Approve action sends approval_status=approved (the
 * source form posts nothing and always 500s).
 */
@Component({
  selector: 'page-oh-disseminations',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent, StatCardComponent],
  styles: [`
    .filter-bar select { padding: 0.45rem 0.7rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.78rem; background: #fff; color: var(--text-dark); font-family: inherit; }
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
    .page-links span.active { background: #0891b2; color: #fff; font-weight: 700; }
    .page-links span.dim { opacity: 0.4; cursor: default; }
  `],
  template: `
    <dmis-page-header title="One Health Disseminations" icon="fa-bullhorn"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'One Health'}, {label:'Disseminations'}]" />

    <div class="stats-row">
      <dmis-stat-card [value]="stats()?.total ?? 0" label="Total Disseminations" icon="fa-bullhorn" color="#0891b2" />
      <dmis-stat-card [value]="stats()?.pending_approval ?? 0" label="Pending Approval" icon="fa-clock" color="#f59e0b" />
      <dmis-stat-card [value]="stats()?.sent ?? 0" label="Sent" icon="fa-paper-plane" color="#10b981" />
      <dmis-stat-card [value]="stats()?.failed ?? 0" label="Failed" icon="fa-exclamation-triangle" color="#ef4444" />
    </div>

    <div class="filter-bar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search disseminations..." [ngModel]="searchText()" (ngModelChange)="searchText.set($event)">
      </div>
      <select [ngModel]="filterType()" (ngModelChange)="filterType.set($event); reload(1)">
        <option value="">All Types</option>
        <option value="stakeholder">Stakeholder</option>
        <option value="public">Public</option>
      </select>
      <select [ngModel]="filterApproval()" (ngModelChange)="filterApproval.set($event); reload(1)">
        <option value="">All Approvals</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </select>
      <select [ngModel]="filterStatus()" (ngModelChange)="filterStatus.set($event); reload(1)">
        <option value="">All Statuses</option>
        @for (s of ['draft', 'pending_approval', 'approved', 'sent', 'failed']; track s) {
          <option [value]="s">{{ ucfirst(s) }}</option>
        }
      </select>
      @if (filterType() || filterApproval() || filterStatus()) {
        <button class="btn btn-sm btn-outline-secondary" style="font-size:0.78rem;white-space:nowrap;" (click)="resetFilters()"><i class="fas fa-times"></i> Reset</button>
      }
    </div>

    <div class="panel-row" style="animation-delay:.30s;">
      <dmis-panel title="Dissemination Registry" icon="fa-database" [badge]="total() + ' total'">
        <div class="panel-body" style="padding:0;">
          <div style="overflow-x:auto;">
            <table class="r-table">
              <thead>
                <tr>
                  <th>#</th><th>Event</th><th>Type</th><th>Message</th><th>Approval</th>
                  <th>Status</th><th>SMS/Email</th><th>Created</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (d of visibleRows(); track d.id) {
                  <tr class="data-row">
                    <td style="font-size:0.82rem;color:var(--text-mid);">{{ d.id }}</td>
                    <td><a [routerLink]="['/m/one-health/events', d.event_pk]" style="color:#0891b2;font-weight:600;text-decoration:none;">{{ d.event_code }}</a></td>
                    <td><span class="r-badge" [class]="'r-badge ' + (d.dissemination_type === 'stakeholder' ? 'badge-published' : 'badge-approved')">{{ ucfirst(d.dissemination_type) }}</span></td>
                    <td>
                      <a [routerLink]="['/m/one-health/dissemination', d.id]" style="color:var(--text-dark);text-decoration:none;">
                        <div class="r-title">{{ d.alert_message }}</div>
                      </a>
                    </td>
                    <td><span class="r-badge" [class]="'r-badge ' + approvalBadge(d.approval_status)">{{ ucfirst(d.approval_status) }}</span></td>
                    <td><span class="r-badge" [class]="'r-badge ' + statusBadge(d.status)">{{ ucfirst(d.status) }}</span></td>
                    <td style="font-size:0.82rem;color:var(--text-mid);">
                      <span title="SMS sent">{{ d.sms_sent_count }}</span> / <span title="Email sent">{{ d.email_sent_count }}</span>
                    </td>
                    <td style="font-size:0.82rem;color:var(--text-mid);">{{ d.created_at }}</td>
                    <td>
                      <div class="ctx-wrap">
                        <button class="ctx-trigger" type="button" (click)="toggleMenu(d.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                        <div class="ctx-menu" [class.open]="openMenuId() === d.id">
                          <a [routerLink]="['/m/one-health/dissemination', d.id]" class="ctx-item"><i class="fas fa-eye"></i> View</a>
                          @if (d.approval_status === 'pending') {
                            <button type="button" class="ctx-item success" (click)="approve(d)"><i class="fas fa-check-circle"></i> Approve</button>
                          }
                          @if (d.status === 'sent' || d.status === 'failed') {
                            <button type="button" class="ctx-item warning" (click)="resend(d)"><i class="fas fa-paper-plane"></i> Resend</button>
                          }
                          <div class="ctx-divider"></div>
                          <a [routerLink]="['/m/one-health/events', d.event_pk]" class="ctx-item"><i class="fas fa-heartbeat"></i> Go to Event</a>
                        </div>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="9"><div class="empty-state"><i class="fas fa-bullhorn"></i> No disseminations found.</div></td></tr>
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
export class OhDisseminationsComponent implements OnInit {
  private http = inject(HttpClient);

  rows = signal<DissRow[]>([]);
  total = signal(0);
  currentPage = signal(1);
  lastPage = signal(1);
  firstItem = signal<number | null>(null);
  lastItem = signal<number | null>(null);
  stats = signal<IndexResponse['stats'] | null>(null);
  openMenuId = signal<number | null>(null);

  searchText = signal('');
  filterType = signal('');
  filterApproval = signal('');
  filterStatus = signal('');

  visibleRows = computed(() => {
    const q = this.searchText().toLowerCase();
    if (!q) { return this.rows(); }
    return this.rows().filter(d =>
      [String(d.id), d.event_code, d.alert_message, d.dissemination_type].join(' ').toLowerCase().includes(q));
  });

  ngOnInit(): void {
    ensureSweetAlert();
    document.addEventListener('click', () => this.openMenuId.set(null));
    this.reload(1);
  }

  reload(page: number): void {
    const params: Record<string, string> = { page: String(page) };
    if (this.filterType()) { params['dissemination_type'] = this.filterType(); }
    if (this.filterApproval()) { params['approval_status'] = this.filterApproval(); }
    if (this.filterStatus()) { params['status'] = this.filterStatus(); }
    this.http.get<IndexResponse>('/api/v1/onehealth/disseminations', { params }).subscribe(res => {
      this.rows.set(res.data);
      this.total.set(res.total);
      this.currentPage.set(res.currentPage);
      this.lastPage.set(res.lastPage);
      this.firstItem.set(res.firstItem);
      this.lastItem.set(res.lastItem);
      this.stats.set(res.stats);
    });
  }

  resetFilters(): void {
    this.filterType.set(''); this.filterApproval.set(''); this.filterStatus.set('');
    this.reload(1);
  }

  toggleMenu(id: number, ev: Event): void {
    ev.stopPropagation();
    this.openMenuId.set(this.openMenuId() === id ? null : id);
  }

  approve(d: DissRow): void {
    this.openMenuId.set(null);
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Approve this dissemination?', icon: 'question',
        showCancelButton: true, confirmButtonColor: '#198754', confirmButtonText: 'Approve',
      }).then((res: any) => {
        if (!res.isConfirmed) { return; }
        // OH-13 fix: the source registry form posts no approval_status and always 500s
        this.http.post<any>(`/api/v1/onehealth/disseminations/${d.id}/approve`, { approval_status: 'approved' }).subscribe({
          next: r => Swal.fire('Success', r.message, 'success').then(() => this.reload(this.currentPage())),
          error: err => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  resend(d: DissRow): void {
    this.openMenuId.set(null);
    ensureSweetAlert().then(() => {
      Swal.fire({ title: 'Resend this dissemination?', icon: 'question', showCancelButton: true }).then((res: any) => {
        if (!res.isConfirmed) { return; }
        this.http.post<any>(`/api/v1/onehealth/disseminations/${d.id}/resend`, {}).subscribe({
          next: r => Swal.fire('Success', r.message, 'success').then(() => this.reload(this.currentPage())),
          error: err => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  pageWindow(): number[] {
    const out: number[] = [];
    for (let p = Math.max(1, this.currentPage() - 2); p <= Math.min(this.lastPage(), this.currentPage() + 2); p++) { out.push(p); }
    return out;
  }

  approvalBadge(s: string): string {
    return ({ pending: 'badge-pending', approved: 'badge-approved', rejected: 'badge-rejected' } as Record<string, string>)[s] ?? 'badge-inactive';
  }

  statusBadge(s: string): string {
    return ({
      draft: 'badge-draft', pending_approval: 'badge-pending', approved: 'badge-approved',
      sent: 'badge-active', failed: 'badge-rejected',
    } as Record<string, string>)[s] ?? 'badge-inactive';
  }

  ucfirst(s: string): string {
    return (s ?? '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
  }
}

/** Loads SweetAlert2 from the same CDN the Blade page pushes, once. */
let swalPromise: Promise<void> | null = null;
function ensureSweetAlert(): Promise<void> {
  if (typeof Swal !== 'undefined') {
    return Promise.resolve();
  }
  if (!swalPromise) {
    swalPromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
      script.onload = () => resolve();
      document.head.appendChild(script);
    });
  }
  return swalPromise;
}
