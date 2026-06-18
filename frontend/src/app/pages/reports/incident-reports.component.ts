import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface IncRow {
  id: number; title: string; status: string; severity_level: string | null;
  region_name: string | null; district_name: string | null; reported_at: string;
  type_name: string | null; deaths_total: number | null; injured_total: number | null; displaced: number | null;
}
interface Bucket { label: string; count: number; }

const SEV_COLOR: Record<string, string> = {
  Catastrophic: '#7c2d12', Critical: '#dc2626', Major: '#ea580c', Moderate: '#d97706', Minor: '#65a30d',
};
const STATUS_BADGE: Record<string, string> = {
  Closed: 'badge-muted', Resolved: 'badge-approved', 'Active Response': 'badge-approved',
  Verified: 'badge-approved', Reported: 'badge-pending', 'Pending Verification': 'badge-pending',
};

/**
 * Incident Reports — the analytical reporting view of incidents for Reports & Analytics (distinct
 * from the operational Active Incidents registry). Date-ranged + filterable: summary tiles, human-
 * loss totals, breakdowns (severity / type / status / region / month) and the records table.
 * Real incidents only (simulations excluded server-side).
 */
@Component({
  selector: 'page-incident-reports',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Incident Reports" icon="fa-file-alt"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Reports & Analytics'}, {label:'Incident Reports'}]">
      <button class="btn-add" style="background:#64748b;" type="button" (click)="print()"><i class="fas fa-print"></i> Print</button>
    </dmis-page-header>

    <div class="panel-row no-print" style="margin-bottom:0.4rem;">
      <dmis-panel title="Filters" icon="fa-filter">
        <div class="panel-body" style="display:flex;gap:0.7rem;align-items:flex-end;flex-wrap:wrap;">
          <div><label class="f-lbl">From</label><input type="date" class="form-control" [(ngModel)]="start"></div>
          <div><label class="f-lbl">To</label><input type="date" class="form-control" [(ngModel)]="end"></div>
          <div><label class="f-lbl">Status</label>
            <select class="form-select" [(ngModel)]="fStatus">
              <option value="">All</option>
              @for (s of opts()['statuses'] || []; track s) { <option [value]="s">{{ s }}</option> }
            </select></div>
          <div><label class="f-lbl">Severity</label>
            <select class="form-select" [(ngModel)]="fSeverity">
              <option value="">All</option>
              @for (s of opts()['severities'] || []; track s) { <option [value]="s">{{ s }}</option> }
            </select></div>
          <div><label class="f-lbl">Region</label>
            <select class="form-select" [(ngModel)]="fRegion">
              <option value="">All</option>
              @for (s of opts()['regions'] || []; track s) { <option [value]="s">{{ s }}</option> }
            </select></div>
          <button class="btn-add" (click)="reload()"><i class="fas fa-magnifying-glass"></i> Generate</button>
          <span style="font-size:0.8rem;color:var(--text-mid);align-self:center;">{{ data()?.start_date }} → {{ data()?.end_date }}</span>
        </div>
      </dmis-panel>
    </div>

    <div class="stats-row">
      <dmis-stat-card [value]="s()['total_incidents'] ?? 0" label="Incidents" icon="fa-triangle-exclamation" color="#003366" />
      <dmis-stat-card [value]="s()['critical'] ?? 0" label="Critical / Catastrophic" icon="fa-fire" color="#dc2626" />
      <dmis-stat-card [value]="s()['open_incidents'] ?? 0" label="Open" icon="fa-folder-open" color="#d97706" />
      <dmis-stat-card [value]="s()['deaths'] ?? 0" label="Deaths" icon="fa-skull" color="#7c2d12" />
      <dmis-stat-card [value]="s()['injured'] ?? 0" label="Injured" icon="fa-kit-medical" color="#ea580c" />
      <dmis-stat-card [value]="s()['displaced'] ?? 0" label="Displaced" icon="fa-people-line" color="#7c3aed" />
    </div>

    <div class="panel-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <dmis-panel title="By severity" icon="fa-signal">
        <div class="panel-body">
          @for (b of bySeverity(); track b.label) {
            <div class="bar-row">
              <span><span class="dot" [style.background]="sevColor(b.label)"></span>{{ b.label }}</span>
              <div class="bar-track"><div class="bar-fill" [style.width.%]="pct(b.count, maxSeverity())" [style.background]="sevColor(b.label)"></div></div>
              <span class="bar-val">{{ b.count }}</span>
            </div>
          } @empty { <div class="empty-line">No data.</div> }
        </div>
      </dmis-panel>
      <dmis-panel title="By hazard type" icon="fa-layer-group">
        <div class="panel-body">
          @for (b of byType(); track b.label) {
            <div class="bar-row">
              <span>{{ b.label }}</span>
              <div class="bar-track"><div class="bar-fill" [style.width.%]="pct(b.count, maxType())" style="background:#0d6efd;"></div></div>
              <span class="bar-val">{{ b.count }}</span>
            </div>
          } @empty { <div class="empty-line">No data.</div> }
        </div>
      </dmis-panel>
    </div>

    <div class="panel-row" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <dmis-panel title="By region" icon="fa-map-location-dot">
        <div class="panel-body">
          @for (b of byRegion(); track b.label) {
            <div class="bar-row"><span>{{ b.label }}</span><span class="bar-val">{{ b.count }}</span></div>
          } @empty { <div class="empty-line">No data.</div> }
        </div>
      </dmis-panel>
      <dmis-panel title="By month" icon="fa-calendar-days">
        <div class="panel-body">
          @for (b of byMonth(); track b.label) {
            <div class="bar-row"><span>{{ b.label }}</span>
              <div class="bar-track"><div class="bar-fill" [style.width.%]="pct(b.count, maxMonth())" style="background:#059669;"></div></div>
              <span class="bar-val">{{ b.count }}</span></div>
          } @empty { <div class="empty-line">No data.</div> }
        </div>
      </dmis-panel>
    </div>

    <div class="panel-row">
      <dmis-panel title="Incident Records" icon="fa-database" [badge]="records().length + ' records'">
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr>
              <th>#</th><th>Title</th><th>Type</th><th>Severity</th><th>Status</th><th>Region</th>
              <th style="text-align:right;">Deaths</th><th style="text-align:right;">Injured</th>
              <th style="text-align:right;">Displaced</th><th>Reported</th>
            </tr></thead>
            <tbody>
              @for (i of records(); track i.id) {
                <tr class="data-row">
                  <td style="color:var(--text-light);">{{ i.id }}</td>
                  <td class="r-title" style="max-width:240px;">{{ i.title }}</td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ i.type_name || '—' }}</td>
                  <td><span class="r-badge" [style.background]="sevColor(i.severity_level) + '22'" [style.color]="sevColor(i.severity_level)">{{ i.severity_level || '—' }}</span></td>
                  <td><span class="r-badge {{ badge(i.status) }}">{{ i.status }}</span></td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ i.region_name || '—' }}</td>
                  <td style="text-align:right;">{{ i.deaths_total ?? 0 }}</td>
                  <td style="text-align:right;">{{ i.injured_total ?? 0 }}</td>
                  <td style="text-align:right;">{{ (i.displaced ?? 0) | number }}</td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ i.reported_at | date:'dd MMM yyyy' }}</td>
                </tr>
              } @empty {
                <tr><td colspan="10" class="empty-state" style="text-align:center;color:var(--text-light);padding:2.5rem;">
                  No incidents match the filter.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>
  `,
  styles: [`
    .f-lbl { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-light); display: block; margin-bottom: 3px; }
    .bar-row { display:flex; align-items:center; justify-content:space-between; gap:0.6rem; padding:0.4rem 0; border-bottom:1px solid var(--border); font-size:0.86rem; }
    .bar-row > span:first-child { min-width:140px; }
    .bar-track { flex:1; height:8px; background:rgba(100,116,139,0.12); border-radius:6px; overflow:hidden; }
    .bar-fill { height:100%; border-radius:6px; }
    .bar-val { font-weight:700; color: var(--text-dark); min-width:28px; text-align:right; }
    .dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:6px; }
    .empty-line { font-size:0.84rem; color: var(--text-light); font-style: italic; }
    @media print { .no-print, .btn-add { display:none !important; } }
  `],
})
export class IncidentReportsComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/reports/incidents';

  data = signal<any | null>(null);
  start = ''; end = '';
  fStatus = ''; fSeverity = ''; fRegion = '';

  s = computed<Record<string, number>>(() => this.data()?.summary ?? {});
  records = computed<IncRow[]>(() => this.data()?.records ?? []);
  bySeverity = computed<Bucket[]>(() => this.data()?.by_severity ?? []);
  byType = computed<Bucket[]>(() => this.data()?.by_type ?? []);
  byRegion = computed<Bucket[]>(() => this.data()?.by_region ?? []);
  byMonth = computed<Bucket[]>(() => this.data()?.by_month ?? []);
  opts = computed<Record<string, string[]>>(() => this.data()?.filter_options ?? {});

  maxSeverity = computed(() => Math.max(1, ...this.bySeverity().map(b => b.count)));
  maxType = computed(() => Math.max(1, ...this.byType().map(b => b.count)));
  maxMonth = computed(() => Math.max(1, ...this.byMonth().map(b => b.count)));

  constructor() { this.reload(); }

  reload(): void {
    const q = new URLSearchParams();
    if (this.start) { q.set('start_date', this.start); }
    if (this.end) { q.set('end_date', this.end); }
    if (this.fStatus) { q.set('status', this.fStatus); }
    if (this.fSeverity) { q.set('severity', this.fSeverity); }
    if (this.fRegion) { q.set('region', this.fRegion); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(r => {
      this.data.set(r);
      if (!this.start) { this.start = r.start_date; }
      if (!this.end) { this.end = r.end_date; }
    });
  }

  pct(v: number, max: number): number { return max > 0 ? Math.round((v / max) * 100) : 0; }
  sevColor(s: string | null): string { return SEV_COLOR[s ?? ''] ?? '#64748b'; }
  badge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }
  print(): void { window.print(); }
}
