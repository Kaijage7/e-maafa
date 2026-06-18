import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Row {
  id: number; program_name: string; description: string | null; program_type: string; status: string;
  start_date: string | null; expected_completion_date: string | null; total_budget_allocated: number | null;
  currency: string | null; geographic_scope: string | null; key_objectives_outcomes: string | null;
  lead_agency_name: string | null; incident_title: string;
}

const TYPES = ['Infrastructure Rebuilding', 'Livelihood Support', 'Housing Reconstruction',
  'Health System Recovery', 'Education Recovery', 'Economic Recovery', 'Environmental Restoration'];
const STATUS_BADGE: Record<string, string> = {
  Ongoing: 'badge-approved', Planning: 'badge-pending', Completed: 'badge-muted', Suspended: 'badge-rejected', Cancelled: 'badge-rejected',
};

/**
 * Recovery Programs (Recovery) — long-term recovery/reconstruction initiatives with a
 * Planning → Ongoing → Completed lifecycle, budget, lead agency and objectives. Port of the Laravel
 * recovery_programs module.
 */
@Component({
  selector: 'page-recovery-programs',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Recovery Programs" icon="fa-tools"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Recovery'}, {label:'Recovery Programs'}]">
      <button class="btn-add" type="button" (click)="openForm()"><i class="fas fa-plus"></i> New Program</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="s()['total'] ?? 0" label="Programs" icon="fa-tools" color="#6f42c1" />
      <dmis-stat-card [value]="s()['ongoing'] ?? 0" label="Ongoing" icon="fa-spinner" color="#059669" />
      <dmis-stat-card [value]="s()['planning'] ?? 0" label="Planning" icon="fa-pen-ruler" color="#d97706" />
      <dmis-stat-card [value]="s()['completed'] ?? 0" label="Completed" icon="fa-circle-check" color="#64748b" />
      <dmis-stat-card [value]="budgetBn()" label="Total budget (TZS bn)" icon="fa-coins" color="#e83e8c" />
    </div>

    <div class="panel-row">
      <dmis-panel title="Recovery Programs" icon="fa-database" [badge]="rows().length + ' shown'">
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <select class="form-select" style="max-width:180px;" [(ngModel)]="fStatus" (change)="reload()">
            <option value="">All statuses</option>
            <option value="Planning">Planning</option><option value="Ongoing">Ongoing</option>
            <option value="Completed">Completed</option><option value="Suspended">Suspended</option>
          </select>
          <input class="form-control" style="max-width:260px;" placeholder="Search name / type…" [(ngModel)]="fSearch" (keyup.enter)="reload()">
          <button class="btn-add" style="background:#64748b;" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr><th>Program</th><th>Type</th><th>Lead agency</th><th>Timeline</th><th style="text-align:right;">Budget (TZS)</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr class="data-row">
                  <td class="r-title" style="max-width:280px;">{{ r.program_name }}
                    <div class="r-subtitle">{{ r.geographic_scope || '—' }}</div></td>
                  <td><span class="r-badge" style="background:rgba(111,66,193,0.1);color:#6f42c1;">{{ r.program_type }}</span></td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ r.lead_agency_name || '—' }}</td>
                  <td style="font-size:0.78rem;color:var(--text-mid);">{{ r.start_date | date:'MMM yyyy' }} → {{ r.expected_completion_date | date:'MMM yyyy' }}</td>
                  <td style="text-align:right;">{{ (r.total_budget_allocated ?? 0) | number:'1.0-0' }}</td>
                  <td><span class="r-badge {{ badge(r.status) }}">{{ r.status }}</span></td>
                  <td style="text-align:right;">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" (click)="toggleMenu(r.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === r.id">
                        <a class="ctx-item" (click)="view(r)"><i class="fas fa-eye"></i> View details</a>
                        @if (r.status === 'Planning') { <a class="ctx-item success" (click)="setStatus(r,'Ongoing')"><i class="fas fa-play"></i> Start program</a> }
                        @if (r.status === 'Ongoing') {
                          <a class="ctx-item success" (click)="setStatus(r,'Completed')"><i class="fas fa-flag-checkered"></i> Mark completed</a>
                          <a class="ctx-item warning" (click)="setStatus(r,'Suspended')"><i class="fas fa-pause"></i> Suspend</a>
                        }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty { <tr><td colspan="7" style="text-align:center;color:var(--text-light);padding:2.5rem;">No recovery programs yet.</td></tr> }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;"><i class="fas fa-tools me-2"></i>New Recovery Program</h5>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;">
            <div style="grid-column:1/3;"><label class="f-lbl">Program name *</label><input class="form-control" [(ngModel)]="m.program_name"></div>
            <div><label class="f-lbl">Type *</label>
              <select class="form-select" [(ngModel)]="m.program_type">
                <option value="">Select…</option>@for (t of types; track t) { <option [value]="t">{{ t }}</option> }
              </select></div>
            <div><label class="f-lbl">Lead agency</label>
              <select class="form-select" [(ngModel)]="m.lead_agency_id">
                <option [ngValue]="null">Select…</option>@for (a of agencies(); track a.id) { <option [ngValue]="a.id">{{ a.name }}</option> }
              </select></div>
            <div><label class="f-lbl">Start date</label><input type="date" class="form-control" [(ngModel)]="m.start_date"></div>
            <div><label class="f-lbl">Expected completion</label><input type="date" class="form-control" [(ngModel)]="m.expected_completion_date"></div>
            <div><label class="f-lbl">Budget (TZS)</label><input type="number" min="0" class="form-control" [(ngModel)]="m.total_budget_allocated"></div>
            <div><label class="f-lbl">Geographic scope</label><input class="form-control" [(ngModel)]="m.geographic_scope"></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Key objectives / outcomes</label><textarea class="form-control" rows="2" [(ngModel)]="m.key_objectives_outcomes"></textarea></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Description</label><textarea class="form-control" rows="2" [(ngModel)]="m.description"></textarea></div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button class="btn-cancel" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!m.program_name || !m.program_type || saving()" (click)="save()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> Create
            </button>
          </div>
        </div>
      </div>
    }

    @if (detail(); as r) {
      <div class="modal-backdrop" (click)="detail.set(null)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;">
            <h5 style="font-weight:800;margin:0;">{{ r.program_name }}</h5>
            <span class="r-badge {{ badge(r.status) }}">{{ r.status }}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;font-size:0.84rem;">
            <div><div class="f-lbl">Type</div>{{ r.program_type }}</div>
            <div><div class="f-lbl">Lead agency</div>{{ r.lead_agency_name || '—' }}</div>
            <div><div class="f-lbl">Budget</div>TZS {{ (r.total_budget_allocated ?? 0) | number:'1.0-0' }}</div>
            <div><div class="f-lbl">Timeline</div>{{ r.start_date | date:'dd MMM yyyy' }} → {{ r.expected_completion_date | date:'dd MMM yyyy' }}</div>
            <div style="grid-column:1/3;"><div class="f-lbl">Geographic scope</div>{{ r.geographic_scope || '—' }}</div>
            <div style="grid-column:1/3;"><div class="f-lbl">Objectives / outcomes</div>{{ r.key_objectives_outcomes || '—' }}</div>
            <div style="grid-column:1/3;"><div class="f-lbl">Description</div>{{ r.description || '—' }}</div>
          </div>
          <div style="text-align:right;margin-top:1rem;"><button class="btn-cancel" (click)="detail.set(null)">Close</button></div>
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
    .badge-muted { background: rgba(100,116,139,0.14); color: #64748b; }
  `],
})
export class RecoveryProgramsComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/recovery/recovery-programs';

  data = signal<any | null>(null);
  formOpen = signal(false);
  detail = signal<Row | null>(null);
  saving = signal(false);
  openMenu = signal<number | null>(null);
  fStatus = ''; fSearch = '';
  types = TYPES;
  m: any = {};

  s = computed<Record<string, number>>(() => this.data()?.stats ?? {});
  rows = computed<Row[]>(() => this.data()?.programs ?? []);
  agencies = computed<any[]>(() => this.data()?.agencies ?? []);
  budgetBn = computed(() => Math.round((this.s()['total_budget'] ?? 0) / 1e9));

  constructor() { this.reload(); }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fStatus) { q.set('status', this.fStatus); }
    if (this.fSearch.trim()) { q.set('search', this.fSearch.trim()); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(d => this.data.set(d));
  }

  badge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }
  openForm(): void { this.m = {}; this.formOpen.set(true); }
  view(r: Row): void { this.detail.set(r); }

  save(): void {
    this.saving.set(true);
    this.http.post<any>(this.base, this.m).subscribe({
      next: () => { this.saving.set(false); this.formOpen.set(false); this.reload(); },
      error: e => { this.saving.set(false); alert(e?.error?.detail ?? 'Could not create program.'); },
    });
  }

  setStatus(r: Row, status: string): void {
    this.http.post(`${this.base}/${r.id}/status`, { status }).subscribe({ next: () => this.reload() });
  }

  toggleMenu(id: number, event: Event): void { event.stopPropagation(); this.openMenu.update(c => (c === id ? null : id)); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
