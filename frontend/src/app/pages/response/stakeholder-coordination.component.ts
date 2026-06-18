import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface StakeRow {
  id: number; name: string; organization: string | null; type: string | null; sector: string | null;
  region: string | null; district: string | null; is_active: boolean; is_verified: boolean;
  response_tasks: number; donations: number; warehouse_stock: number;
}

/**
 * Stakeholder Coordination — the 360° linkage view tying each partner organisation to the three
 * operational pillars the Disaster Management Act 2022 connects them to: RESPONSE (DRF coordination
 * lanes assigned to them), RECOVERY (donations / resource bids they have offered) and WAREHOUSE
 * (the agency stock they hold and can dispatch). This closes the "stakeholders not linked to
 * warehouse / response / recovery" gap — every stakeholder is now traceable across the supply chain.
 */
@Component({
  selector: 'page-stakeholder-coordination',
  standalone: true,
  imports: [FormsModule, DecimalPipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Stakeholder Coordination" icon="fa-users-between-lines"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Stakeholder Coordination'}]">
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['total_stakeholders'] ?? 0" label="Stakeholders" icon="fa-users" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['engaged_in_response'] ?? 0" label="Engaged in response" icon="fa-bolt" color="#dc3545" />
      <dmis-stat-card [value]="stats()['engaged_in_recovery'] ?? 0" label="Offering donations" icon="fa-hand-holding-heart" color="#059669" />
      <dmis-stat-card [value]="stats()['agency_stock_lines'] ?? 0" label="Agency stock lines" icon="fa-warehouse" color="#7c3aed" />
    </div>

    <div class="panel-row">
      <dmis-panel title="Partner organisations — footprint across the supply chain" icon="fa-network-wired" [badge]="rows().length + ' shown'">
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <input class="form-control" style="max-width:280px;" placeholder="Filter by name / organisation…"
                 [(ngModel)]="fSearch" (input)="applyFilter()">
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr>
              <th>Organisation</th><th>Type / Sector</th><th>Region</th>
              <th style="text-align:center;">Response lanes</th>
              <th style="text-align:center;">Donations</th>
              <th style="text-align:right;">Warehouse stock</th><th></th>
            </tr></thead>
            <tbody>
              @for (s of filtered(); track s.id) {
                <tr class="data-row">
                  <td class="r-title">{{ s.organization || s.name }}
                    @if (s.is_verified) { <i class="fas fa-circle-check" style="color:#059669;font-size:0.72rem;margin-left:4px;" title="Verified"></i> }</td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ s.type || '—' }}<br><span style="font-size:0.74rem;color:var(--text-light);">{{ s.sector || '' }}</span></td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ s.region || '—' }}</td>
                  <td style="text-align:center;">
                    <span class="pill" [class.pill-on]="s.response_tasks > 0" [class.red]="s.response_tasks > 0">{{ s.response_tasks }}</span></td>
                  <td style="text-align:center;">
                    <span class="pill" [class.pill-on]="s.donations > 0" [class.green]="s.donations > 0">{{ s.donations }}</span></td>
                  <td style="text-align:right;">{{ (s.warehouse_stock ?? 0) | number:'1.0-0' }}</td>
                  <td style="text-align:right;"><button class="btn-mini" (click)="open(s)"><i class="fas fa-diagram-project"></i> 360° view</button></td>
                </tr>
              } @empty {
                <tr><td colspan="7" style="text-align:center;color:var(--text-light);padding:2rem;">No stakeholders match.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    <!-- 360 detail drawer -->
    @if (detail(); as d) {
      <div class="modal-backdrop" (click)="detail.set(null)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.4rem;">
            <div>
              <h5 style="font-weight:800;margin:0;">{{ d.stakeholder.organization || d.stakeholder.name }}</h5>
              <div style="font-size:0.8rem;color:var(--text-mid);">{{ d.stakeholder.type || '' }}{{ d.stakeholder.sector ? ' · ' + d.stakeholder.sector : '' }}{{ d.stakeholder.region ? ' · ' + d.stakeholder.region : '' }}</div>
            </div>
            <button class="btn-cancel" (click)="detail.set(null)">Close</button>
          </div>

          <!-- summary band -->
          <div style="display:flex;gap:0.8rem;flex-wrap:wrap;margin:0.8rem 0 1rem;">
            <div class="mini-stat"><div class="ms-v">{{ d.summary.response_tasks }}</div><div class="ms-l">Response lanes</div></div>
            <div class="mini-stat"><div class="ms-v">{{ d.summary.response_completed }}</div><div class="ms-l">Completed</div></div>
            <div class="mini-stat"><div class="ms-v">{{ d.summary.donations }}</div><div class="ms-l">Donations</div></div>
            <div class="mini-stat"><div class="ms-v">{{ (d.summary.donated_quantity ?? 0) | number:'1.0-0' }}</div><div class="ms-l">Qty donated</div></div>
          </div>

          <!-- RESPONSE -->
          <div class="sec-title" style="color:#dc3545;"><i class="fas fa-bolt"></i> Response — DRF coordination lanes</div>
          @if (d.response_lanes.length) {
            <table class="r-table mini"><thead><tr><th>DRF</th><th>Task</th><th>Activation</th><th>Status</th></tr></thead>
              <tbody>@for (l of d.response_lanes; track l.id) {
                <tr><td style="white-space:nowrap;"><strong>DRF-{{ l.drf_number }}</strong> {{ l.drf_name }}</td>
                  <td>{{ l.title }}@if (l.is_72hr_critical) { <span class="r-badge badge-pending" style="margin-left:4px;">72h</span> }</td>
                  <td style="font-size:0.78rem;color:var(--text-mid);">{{ l.activation_title || '—' }}</td>
                  <td><span class="r-badge" [class.badge-approved]="l.status==='Completed'">{{ l.status }}</span></td></tr>
              }</tbody></table>
          } @else { <div class="empty-line">Not currently assigned to any DRF lane.</div> }

          <!-- RECOVERY -->
          <div class="sec-title" style="color:#059669;"><i class="fas fa-hand-holding-heart"></i> Recovery — donations & resource bids</div>
          @if (d.recovery_donations.length) {
            <table class="r-table mini"><thead><tr><th>Resource</th><th style="text-align:right;">Qty offered</th><th>Delivery</th><th>For incident</th><th>Status</th></tr></thead>
              <tbody>@for (b of d.recovery_donations; track b.id) {
                <tr><td>{{ b.resource_name || '—' }}</td>
                  <td style="text-align:right;">{{ (b.quantity_offered ?? 0) | number:'1.0-0' }} {{ b.unit_of_measure || '' }}</td>
                  <td style="font-size:0.78rem;">{{ b.delivery_date || '—' }}</td>
                  <td style="font-size:0.78rem;color:var(--text-mid);">{{ b.incident_title || '—' }}</td>
                  <td><span class="r-badge" [class.badge-approved]="b.status==='Received'||b.status==='Accepted'">{{ b.status }}</span></td></tr>
              }</tbody></table>
          } @else { <div class="empty-line">No donations or resource bids on record.</div> }

          <!-- WAREHOUSE -->
          <div class="sec-title" style="color:#7c3aed;"><i class="fas fa-warehouse"></i> Warehouse — agency stock held</div>
          @if (d.warehouse_stock.length) {
            <table class="r-table mini"><thead><tr><th>Agency</th><th>Resource</th><th style="text-align:right;">Qty</th><th>Condition</th><th>Location</th></tr></thead>
              <tbody>@for (w of d.warehouse_stock; track $index) {
                <tr><td>{{ w.agency_name }}</td><td>{{ w.resource_name }}</td>
                  <td style="text-align:right;">{{ (w.quantity ?? 0) | number:'1.0-0' }}</td>
                  <td style="font-size:0.78rem;">{{ w.condition_status || '—' }}</td>
                  <td style="font-size:0.78rem;color:var(--text-mid);">{{ w.location_description || '—' }}</td></tr>
              }</tbody></table>
          } @else { <div class="empty-line">No agency stock matched to this organisation.</div> }
        </div>
      </div>
    }
  `,
  styles: [`
    .btn-mini { font-size: 0.72rem; padding: 0.25rem 0.7rem; border-radius: 7px; border: 1px solid var(--border); background: #fff; cursor: pointer; margin-left: 4px; color: var(--text-dark); }
    .pill { display:inline-block; min-width:26px; padding:2px 8px; border-radius:20px; font-size:0.78rem; background:rgba(100,116,139,0.12); color:#64748b; }
    .pill-on.red { background:rgba(220,53,69,0.12); color:#dc3545; font-weight:700; }
    .pill-on.green { background:rgba(5,150,105,0.12); color:#059669; font-weight:700; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1500; display: flex; align-items: flex-start; justify-content: center; padding: 3vh 1rem; overflow-y: auto; }
    .modal-card { background: var(--card-bg, #fff); border-radius: 16px; max-width: 900px; width: 100%; padding: 1.4rem 1.5rem; }
    .btn-cancel { border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 0.4rem 0.9rem; cursor: pointer; }
    .sec-title { font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; margin: 1.1rem 0 0.4rem; display:flex; align-items:center; gap:6px; }
    .mini-stat { background: var(--surface, #f8fafc); border:1px solid var(--border); border-radius: 10px; padding: 0.5rem 0.9rem; min-width: 90px; text-align:center; }
    .ms-v { font-size: 1.3rem; font-weight: 800; color: var(--text-dark); }
    .ms-l { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-light); }
    .empty-line { font-size: 0.82rem; color: var(--text-light); padding: 0.4rem 0; font-style: italic; }
    table.mini th { font-size: 0.7rem; } table.mini td { font-size: 0.82rem; }
  `],
})
export class StakeholderCoordinationComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/response/stakeholder-coordination';

  rows = signal<StakeRow[]>([]);
  filtered = signal<StakeRow[]>([]);
  stats = signal<Record<string, number>>({});
  detail = signal<any | null>(null);
  fSearch = '';

  constructor() { this.reload(); }

  reload(): void {
    this.http.get<any>(this.base).subscribe(r => {
      this.rows.set(r.stakeholders);
      this.filtered.set(r.stakeholders);
      this.stats.set(r.stats);
    });
  }

  applyFilter(): void {
    const q = this.fSearch.trim().toLowerCase();
    this.filtered.set(!q ? this.rows()
      : this.rows().filter(s => (s.organization || s.name || '').toLowerCase().includes(q)
          || (s.sector || '').toLowerCase().includes(q) || (s.type || '').toLowerCase().includes(q)));
  }

  open(s: StakeRow): void {
    this.http.get<any>(`${this.base}/${s.id}`).subscribe(r => this.detail.set(r));
  }
}
