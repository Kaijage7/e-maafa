import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface AllocRow {
  id: number; quantity_allocated: number | null; quantity_requested: number | null; status: string;
  created_at: string; unit_of_measure: string | null; incident_title: string;
  resource_name: string | null; resource_category: string | null; unit_cost: number | null;
  line_value: number | null;
}

const STATUS_BADGE: Record<string, string> = {
  Approved: 'badge-approved', Deployed: 'badge-approved', Rejected: 'badge-rejected',
  Requested: 'badge-pending', 'Pending PMO Approval': 'badge-pending',
};

/**
 * Resource Allocation Report — port of ResourceAllocationController@generateReport +
 * response/resource-allocation/report.blade.php. Date-ranged: four summary tiles + total allocated
 * value + the allocation records table. The "Resource Reports" item under Reports & Analytics.
 */
@Component({
  selector: 'page-resource-reports',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Resource Allocation Report" icon="fa-chart-bar"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Reports & Analytics'}, {label:'Resource Reports'}]">
      <button class="btn-add" style="background:#64748b;" type="button" (click)="print()"><i class="fas fa-print"></i> Print</button>
    </dmis-page-header>

    <div class="panel-row no-print" style="margin-bottom:0.4rem;">
      <dmis-panel title="Reporting period" icon="fa-calendar-range">
        <div class="panel-body" style="display:flex;gap:0.7rem;align-items:flex-end;flex-wrap:wrap;">
          <div><label class="f-lbl">From</label><input type="date" class="form-control" [(ngModel)]="start"></div>
          <div><label class="f-lbl">To</label><input type="date" class="form-control" [(ngModel)]="end"></div>
          <button class="btn-add" (click)="reload()"><i class="fas fa-filter"></i> Generate</button>
          <span style="font-size:0.8rem;color:var(--text-mid);align-self:center;">Showing {{ data()?.start_date }} → {{ data()?.end_date }}</span>
        </div>
      </dmis-panel>
    </div>

    <div class="stats-row">
      <dmis-stat-card [value]="s()['total_requests'] ?? 0" label="Total Requests" icon="fa-clipboard-list" color="#003366" />
      <dmis-stat-card [value]="s()['approved'] ?? 0" label="Approved" icon="fa-check-circle" color="#059669" />
      <dmis-stat-card [value]="s()['rejected'] ?? 0" label="Rejected" icon="fa-times-circle" color="#ef4444" />
      <dmis-stat-card [value]="s()['deployed'] ?? 0" label="Deployed" icon="fa-truck" color="#3b82f6" />
      <dmis-stat-card [value]="valueMillions()" label="Allocated value (TZS m)" icon="fa-coins" color="#e83e8c" />
    </div>

    <div class="panel-row">
      <dmis-panel title="Allocation Records" icon="fa-database" [badge]="records().length + ' records'">
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr>
              <th>#</th><th>Incident</th><th>Resource</th><th>Category</th>
              <th style="text-align:right;">Qty Allocated</th><th style="text-align:right;">Value (TZS)</th>
              <th>Status</th><th>Date</th>
            </tr></thead>
            <tbody>
              @for (a of records(); track a.id) {
                <tr class="data-row">
                  <td style="color:var(--text-light);">{{ a.id }}</td>
                  <td class="r-title" style="max-width:240px;">{{ a.incident_title }}</td>
                  <td>{{ a.resource_name || '—' }}</td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ a.resource_category || '—' }}</td>
                  <td style="text-align:right;">{{ (a.quantity_allocated ?? 0) | number }} {{ a.unit_of_measure || '' }}</td>
                  <td style="text-align:right;">{{ (a.line_value ?? 0) | number:'1.0-0' }}</td>
                  <td><span class="r-badge {{ badge(a.status) }}">{{ a.status }}</span></td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ a.created_at | date:'dd MMM yyyy' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="8" class="empty-state" style="text-align:center;color:var(--text-light);padding:2.5rem;">
                  No resource allocations in this period.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    <div class="panel-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <dmis-panel title="By status" icon="fa-list-check">
        <div class="panel-body">
          @for (r of byStatus(); track r.status) {
            <div class="bar-row"><span>{{ r.status }}</span><span class="bar-val">{{ r.count }}</span></div>
          } @empty { <div class="empty-line">No data.</div> }
        </div>
      </dmis-panel>
      <dmis-panel title="By category" icon="fa-boxes-stacked">
        <div class="panel-body">
          @for (r of byCategory(); track r.category) {
            <div class="bar-row"><span>{{ r.category }}</span><span class="bar-val">{{ r.count }} · {{ r.quantity | number:'1.0-0' }} units</span></div>
          } @empty { <div class="empty-line">No data.</div> }
        </div>
      </dmis-panel>
    </div>
  `,
  styles: [`
    .f-lbl { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-light); display: block; margin-bottom: 3px; }
    .bar-row { display:flex; justify-content:space-between; padding:0.4rem 0; border-bottom:1px solid var(--border); font-size:0.86rem; }
    .bar-val { font-weight:700; color: var(--text-dark); }
    .empty-line { font-size:0.84rem; color: var(--text-light); font-style: italic; }
    @media print { .no-print, .btn-add { display:none !important; } }
  `],
})
export class ResourceReportsComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/reports/resource-allocations';

  data = signal<any | null>(null);
  start = '';
  end = '';

  s = computed<Record<string, number>>(() => this.data()?.summary ?? {});
  records = computed<AllocRow[]>(() => this.data()?.records ?? []);
  byStatus = computed<{ status: string; count: number }[]>(() => this.data()?.by_status ?? []);
  byCategory = computed<{ category: string; count: number; quantity: number }[]>(() => this.data()?.by_category ?? []);
  valueMillions = computed(() => Math.round((this.s()['total_value'] ?? 0) / 1e6));

  constructor() { this.reload(); }

  reload(): void {
    const q = new URLSearchParams();
    if (this.start) { q.set('start_date', this.start); }
    if (this.end) { q.set('end_date', this.end); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(r => {
      this.data.set(r);
      if (!this.start) { this.start = r.start_date; }
      if (!this.end) { this.end = r.end_date; }
    });
  }

  badge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }
  print(): void { window.print(); }
}
