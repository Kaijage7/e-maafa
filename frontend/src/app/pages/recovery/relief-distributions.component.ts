import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Row {
  id: number; distribution_date: string; location_name: string; district_name: string | null;
  region_name: string | null; quantity_distributed: number; unit_of_measure: string | null;
  beneficiary_name_or_group: string; beneficiary_contact: string | null; confirmation_status: string;
  resource_name: string | null; resource_category: string | null; agency_name: string | null; incident_title: string;
}

/**
 * Relief Distribution (Recovery) — logs relief items handed to beneficiary groups, traceable to the
 * incident and distributing agency, with a Pending Verification → Confirmed status. Port of the
 * Laravel relief_distributions module.
 */
@Component({
  selector: 'page-relief-distributions',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Relief Distribution" icon="fa-hand-holding-heart"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Recovery'}, {label:'Relief Distribution'}]">
      <button class="btn-add" type="button" (click)="openForm()"><i class="fas fa-plus"></i> Record Distribution</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="s()['total'] ?? 0" label="Distributions" icon="fa-hand-holding-heart" color="#6f42c1" />
      <dmis-stat-card [value]="s()['confirmed'] ?? 0" label="Confirmed" icon="fa-circle-check" color="#059669" />
      <dmis-stat-card [value]="s()['pending'] ?? 0" label="Pending verification" icon="fa-hourglass-half" color="#d97706" />
      <dmis-stat-card [value]="s()['beneficiary_groups'] ?? 0" label="Beneficiary groups" icon="fa-people-group" color="#0d6efd" />
      <dmis-stat-card [value]="s()['total_quantity'] ?? 0" label="Items distributed" icon="fa-boxes-stacked" color="#e83e8c" />
    </div>

    <div class="panel-row">
      <dmis-panel title="Distribution Records" icon="fa-database" [badge]="rows().length + ' shown'">
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <select class="form-select" style="max-width:190px;" [(ngModel)]="fStatus" (change)="reload()">
            <option value="">All statuses</option>
            <option value="Pending Verification">Pending Verification</option>
            <option value="Confirmed">Confirmed</option>
          </select>
          <input class="form-control" style="max-width:260px;" placeholder="Search beneficiary / location / item…"
                 [(ngModel)]="fSearch" (keyup.enter)="reload()">
          <button class="btn-add" style="background:#64748b;" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr>
              <th>Date</th><th>Beneficiary group</th><th>Item</th><th style="text-align:right;">Qty</th>
              <th>Location</th><th>Agency</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr class="data-row">
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ r.distribution_date | date:'dd MMM yyyy' }}</td>
                  <td class="r-title" style="max-width:220px;">{{ r.beneficiary_name_or_group }}
                    @if (r.beneficiary_contact) { <div class="r-subtitle">{{ r.beneficiary_contact }}</div> }</td>
                  <td>{{ r.resource_name || '—' }}</td>
                  <td style="text-align:right;">{{ (r.quantity_distributed ?? 0) | number }} {{ r.unit_of_measure || '' }}</td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ r.location_name }}@if (r.district_name) { <div class="r-subtitle">{{ r.district_name }}, {{ r.region_name }}</div> }</td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ r.agency_name || '—' }}</td>
                  <td><span class="r-badge {{ r.confirmation_status === 'Confirmed' ? 'badge-approved' : 'badge-pending' }}">{{ r.confirmation_status }}</span></td>
                  <td style="text-align:right;">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" (click)="toggleMenu(r.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === r.id">
                        @if (r.confirmation_status !== 'Confirmed') {
                          <a class="ctx-item success" (click)="confirm(r)"><i class="fas fa-check"></i> Confirm receipt</a>
                        } @else { <span class="ctx-item" style="opacity:0.6;cursor:default;"><i class="fas fa-circle-check"></i> Confirmed</span> }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="8" style="text-align:center;color:var(--text-light);padding:2.5rem;">No relief distributions recorded yet.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;"><i class="fas fa-hand-holding-heart me-2"></i>Record Relief Distribution</h5>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;">
            <div style="grid-column:1/3;"><label class="f-lbl">Beneficiary name / group *</label><input class="form-control" [(ngModel)]="m.beneficiary_name_or_group"></div>
            <div><label class="f-lbl">Beneficiary contact</label><input class="form-control" [(ngModel)]="m.beneficiary_contact"></div>
            <div><label class="f-lbl">Distribution date</label><input type="date" class="form-control" [(ngModel)]="m.distribution_date"></div>
            <div><label class="f-lbl">Resource</label>
              <select class="form-select" [(ngModel)]="m.resource_id">
                <option [ngValue]="null">Select…</option>
                @for (r of resources(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }
              </select></div>
            <div><label class="f-lbl">Quantity *</label><input type="number" min="0" class="form-control" [(ngModel)]="m.quantity_distributed"></div>
            <div><label class="f-lbl">Unit</label><input class="form-control" [(ngModel)]="m.unit_of_measure" placeholder="pieces / bags…"></div>
            <div><label class="f-lbl">Distributing agency</label>
              <select class="form-select" [(ngModel)]="m.distributing_agency_id">
                <option [ngValue]="null">Select…</option>
                @for (a of agencies(); track a.id) { <option [ngValue]="a.id">{{ a.name }}</option> }
              </select></div>
            <div><label class="f-lbl">Location *</label><input class="form-control" [(ngModel)]="m.location_name"></div>
            <div><label class="f-lbl">District</label><input class="form-control" [(ngModel)]="m.district_name"></div>
            <div><label class="f-lbl">Region</label><input class="form-control" [(ngModel)]="m.region_name"></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Linked incident</label>
              <select class="form-select" [(ngModel)]="m.incident_id">
                <option [ngValue]="null">None</option>
                @for (i of incidents(); track i.id) { <option [ngValue]="i.id">{{ i.title }}</option> }
              </select></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Notes</label><textarea class="form-control" rows="2" [(ngModel)]="m.notes"></textarea></div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button class="btn-cancel" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!m.beneficiary_name_or_group || !m.location_name || saving()" (click)="save()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> Record
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .f-lbl { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-light); display: block; margin-bottom: 3px; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1500; display: flex; align-items: flex-start; justify-content: center; padding: 3vh 1rem; overflow-y: auto; }
    .modal-card { background: #fff; border-radius: 16px; max-width: 720px; width: 100%; padding: 1.4rem 1.5rem; }
    .btn-cancel { border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 0.5rem 1rem; cursor: pointer; }
    .r-subtitle { font-size: 0.74rem; color: var(--text-light); }
  `],
})
export class ReliefDistributionsComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/recovery/relief-distributions';

  data = signal<any | null>(null);
  formOpen = signal(false);
  saving = signal(false);
  openMenu = signal<number | null>(null);
  fStatus = ''; fSearch = '';
  m: any = {};

  s = computed<Record<string, number>>(() => this.data()?.stats ?? {});
  rows = computed<Row[]>(() => this.data()?.distributions ?? []);
  resources = computed<any[]>(() => this.data()?.resources ?? []);
  agencies = computed<any[]>(() => this.data()?.agencies ?? []);
  incidents = computed<any[]>(() => this.data()?.incidents ?? []);

  constructor() { this.reload(); }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fStatus) { q.set('status', this.fStatus); }
    if (this.fSearch.trim()) { q.set('search', this.fSearch.trim()); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(d => this.data.set(d));
  }

  openForm(): void { this.m = { quantity_distributed: 0, distribution_date: new Date().toISOString().slice(0, 10) }; this.formOpen.set(true); }

  save(): void {
    this.saving.set(true);
    this.http.post<any>(this.base, this.m).subscribe({
      next: () => { this.saving.set(false); this.formOpen.set(false); this.reload(); },
      error: e => { this.saving.set(false); alert(e?.error?.detail ?? 'Could not record distribution.'); },
    });
  }

  confirm(r: Row): void {
    this.http.post(`${this.base}/${r.id}/confirm`, {}).subscribe({ next: () => this.reload() });
  }

  toggleMenu(id: number, event: Event): void { event.stopPropagation(); this.openMenu.update(c => (c === id ? null : id)); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
