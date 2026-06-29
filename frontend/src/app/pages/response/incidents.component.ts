import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { AuthService } from '../../core/auth.service';

interface IncidentRow {
  id: number; title: string; status: string; workflow_status: string; workflow_status_label: string;
  severity_level: string; origin_level: string; hazard_name: string | null;
  district_name: string | null; region_name: string | null; location_description: string;
  reported_at: string | null; assigned_to_name: string | null;
  deaths_total: number; injured_total: number; missing_total: number; displaced: number;
  rollback_count: number; returned?: boolean; last_rollback_by_role?: string; allocations_count: number; tasks_count: number; response_active: boolean;
}
interface IndexResponse {
  data: IncidentRow[]; currentPage: number; lastPage: number; total: number;
  firstItem: number | null; lastItem: number | null;
}
interface FormData {
  hazards: { id: number; name: string }[];
  statuses: string[];
  workflow_statuses: Record<string, string>;
}

/**
 * Reproduction of admin/incidents/index.blade.php as the Response registry:
 * operational-priority status ordering (server-side CASE), status/hazard/workflow
 * filters, casualty figures, workflow badges and the active-response indicator.
 */
@Component({
  selector: 'page-response-incidents',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .filter-bar select { padding: 0.45rem 0.7rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.78rem; background: #fff; color: var(--text-dark); font-family: inherit; }
    .impact { display: flex; gap: 0.6rem; font-size: 0.72rem; color: var(--text-mid); }
    .impact b { color: #b91c1c; }
    .pagination-wrap { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.1rem; font-size: 0.78rem; color: var(--text-light); }
    .page-links { display: flex; gap: 0.25rem; }
    .page-links a, .page-links span { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; padding: 0 6px; border-radius: 8px; color: var(--text-mid); cursor: pointer; text-decoration: none; }
    .page-links span.active { background: #dc3545; color: #fff; font-weight: 700; }
    .page-links span.dim { opacity: 0.4; cursor: default; }
    .live-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #dc3545; animation: pulse 1.5s infinite; margin-right: 4px; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
  `],
  template: `
    <dmis-page-header title="Incident Management" icon="fa-exclamation-triangle"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Incidents'}]">
      @if (canCreate()) { <a routerLink="/m/response/incidents/create" class="btn-add"><i class="fas fa-plus"></i> Log New Incident</a> }
    </dmis-page-header>

    <div class="filter-bar">
      <select [ngModel]="statusFilter()" (ngModelChange)="statusFilter.set($event); reload(1)">
        <option value="">All Operational Statuses</option>
        @for (s of formData()?.statuses ?? []; track s) { <option [value]="s">{{ s }}</option> }
      </select>
      <select [ngModel]="hazardFilter()" (ngModelChange)="hazardFilter.set($event); reload(1)">
        <option value="">All Hazards</option>
        @for (h of formData()?.hazards ?? []; track h.id) { <option [value]="h.id">{{ h.name }}</option> }
      </select>
      <select [ngModel]="workflowFilter()" (ngModelChange)="workflowFilter.set($event); reload(1)">
        <option value="">All Workflow Stages</option>
        @for (entry of workflowEntries(); track entry[0]) { <option [value]="entry[0]">{{ entry[1] }}</option> }
      </select>
      @if (statusFilter() || hazardFilter() || workflowFilter()) {
        <button class="btn btn-sm btn-outline-secondary" style="font-size:0.78rem;" (click)="resetFilters()"><i class="fas fa-times"></i> Reset</button>
      }
    </div>

    <div class="panel-row">
      <dmis-panel title="Incident Registry" icon="fa-database" [badge]="total() + ' total'">
        <div class="panel-body" style="padding:0;">
          <div style="overflow-x:auto;">
            <table class="r-table">
              <thead>
                <tr>
                  <th>#</th><th>Incident</th><th>Hazard</th><th>Location</th><th>Severity</th>
                  <th>Status</th><th>Workflow</th><th>Human Impact</th><th>Reported</th><th>Links</th>
                </tr>
              </thead>
              <tbody>
                @for (i of rows(); track i.id) {
                  <tr class="data-row">
                    <td style="font-size:0.82rem;color:var(--text-mid);">{{ i.id }}</td>
                    <td>
                      <a [routerLink]="['/m/response/incidents', i.id]" style="text-decoration:none;">
                        <div class="r-title" style="color:#dc3545;">
                          @if (i.response_active) { <span class="live-dot" title="Response activated"></span> }
                          {{ limit(i.title, 45) }}
                        </div>
                        <div class="r-subtitle">{{ ucfirst(i.origin_level) }} origin
                          @if (i.rollback_count > 0) { · {{ i.rollback_count }} rollback{{ i.rollback_count > 1 ? 's' : '' }} }
                        </div>
                      </a>
                    </td>
                    <td style="font-size:0.82rem;color:var(--text-mid);">{{ i.hazard_name ?? '-' }}</td>
                    <td>
                      <div class="r-title" style="font-size:0.8rem;">{{ i.district_name ?? '-' }}</div>
                      <div class="r-subtitle">{{ i.region_name ?? '' }}</div>
                    </td>
                    <td><span class="r-badge" [class]="'r-badge ' + severityBadge(i.severity_level)">{{ i.severity_level }}</span></td>
                    <td><span class="r-badge" [class]="'r-badge ' + statusBadge(i.status)">{{ i.status }}</span></td>
                    <td><span class="r-badge" [class]="'r-badge ' + workflowBadge(i.workflow_status)">{{ i.workflow_status_label }}</span>@if (i.returned) { <span class="r-badge" style="background:#fed7aa;color:#9a3412;margin-left:4px;" title="Returned / rolled back{{ i.last_rollback_by_role ? ' by ' + i.last_rollback_by_role : '' }}">↩ Returned</span> }</td>
                    <td>
                      <div class="impact">
                        <span title="Deaths"><b>{{ i.deaths_total }}</b> †</span>
                        <span title="Injured">{{ i.injured_total }} inj</span>
                        <span title="Displaced">{{ i.displaced }} displ</span>
                      </div>
                    </td>
                    <td style="font-size:0.78rem;color:var(--text-mid);">{{ i.reported_at }}</td>
                    <td style="font-size:0.72rem;color:var(--text-light);white-space:nowrap;">
                      <i class="fas fa-truck" title="Resource allocations"></i> {{ i.allocations_count }}
                      &nbsp;<i class="fas fa-tasks" title="Tasks"></i> {{ i.tasks_count }}
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="10"><div class="empty-state"><i class="fas fa-exclamation-triangle"></i> No incidents found.</div></td></tr>
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
export class ResponseIncidentsComponent implements OnInit {
  private http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly canCreate = computed(() => this.auth.hasPermission('incidents.create'));

  rows = signal<IncidentRow[]>([]);
  total = signal(0);
  currentPage = signal(1);
  lastPage = signal(1);
  firstItem = signal<number | null>(null);
  lastItem = signal<number | null>(null);
  formData = signal<FormData | null>(null);
  statusFilter = signal('');
  hazardFilter = signal('');
  workflowFilter = signal('');

  ngOnInit(): void {
    this.http.get<FormData>('/api/v1/response/incidents/form-data').subscribe(fd => this.formData.set(fd));
    this.reload(1);
  }

  reload(page: number): void {
    const params: Record<string, string> = { page: String(page) };
    if (this.statusFilter()) { params['status_filter'] = this.statusFilter(); }
    if (this.hazardFilter()) { params['hazard_filter'] = this.hazardFilter(); }
    if (this.workflowFilter()) { params['workflow_filter'] = this.workflowFilter(); }
    this.http.get<IndexResponse>('/api/v1/response/incidents', { params }).subscribe(res => {
      this.rows.set(res.data);
      this.total.set(res.total);
      this.currentPage.set(res.currentPage);
      this.lastPage.set(res.lastPage);
      this.firstItem.set(res.firstItem);
      this.lastItem.set(res.lastItem);
    });
  }

  resetFilters(): void {
    this.statusFilter.set('');
    this.hazardFilter.set('');
    this.workflowFilter.set('');
    this.reload(1);
  }

  workflowEntries(): [string, string][] {
    return Object.entries(this.formData()?.workflow_statuses ?? {});
  }

  pageWindow(): number[] {
    const out: number[] = [];
    for (let p = Math.max(1, this.currentPage() - 2); p <= Math.min(this.lastPage(), this.currentPage() + 2); p++) { out.push(p); }
    return out;
  }

  severityBadge(s: string): string {
    return ({ Critical: 'badge-rejected', Major: 'badge-pending', Moderate: 'badge-published', Minor: 'badge-inactive' } as Record<string, string>)[s] ?? 'badge-inactive';
  }

  statusBadge(s: string): string {
    return ({
      'Reported': 'badge-active', 'Pending Verification': 'badge-pending', 'Verified': 'badge-published',
      'Active Response': 'badge-rejected', 'Monitoring': 'badge-inactive', 'Escalated': 'badge-rejected',
      'Resolved': 'badge-approved', 'Closed': 'badge-draft', 'Information Only': 'badge-inactive',
    } as Record<string, string>)[s] ?? 'badge-inactive';
  }

  workflowBadge(s: string): string {
    if (s === 'approved') { return 'badge-approved'; }
    if (s === 'draft') { return 'badge-draft'; }
    if (s?.startsWith('rolled_back') || s === 'rejected') { return 'badge-rejected'; }
    return 'badge-pending';
  }

  ucfirst(s: string): string {
    return (s ?? '').replace(/^\w/, c => c.toUpperCase());
  }

  limit(s: string, max: number): string {
    return s.length <= max ? s : s.substring(0, max).trimEnd() + '...';
  }
}
