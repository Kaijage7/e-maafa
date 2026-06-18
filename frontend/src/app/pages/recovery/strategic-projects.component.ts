import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Row {
  id: number; entry_id: string; project_name: string; project_category: string; project_sector: string;
  location: string[]; project_coverage: string | null; project_status: string; risk_hazard_type: string | null;
  risk_hazard_names: string[]; has_management_plan: boolean; budget: number | null; elements_at_risk: string | null;
}

const SECTORS = ['Energy', 'Water', 'Health', 'Transport', 'Agriculture', 'Education', 'Other'];
const CATEGORIES = ['Government', 'Private', 'PPP', 'Community', 'Other'];
const STATUSES = ['Mobilization', 'Construction', 'Operational', 'Stopped', 'Decommissioning', 'Closure', 'Other'];
const HAZARDS = ['Floods', 'Cyclone', 'Drought', 'Landslide', 'Earthquake', 'Wildfire', 'Epidemic'];
const STATUS_BADGE: Record<string, string> = {
  Operational: 'badge-approved', Construction: 'badge-pending', Mobilization: 'badge-pending',
  Stopped: 'badge-rejected', Closure: 'badge-muted', Decommissioning: 'badge-muted',
};

/**
 * Reconstruction / Strategic Projects (Recovery) — the risk-managed infrastructure projects
 * (category, sector, location, status, associated hazards, management plan). "Build back better"
 * reconstruction tracking. Port of the Laravel strategic_projects module.
 */
@Component({
  selector: 'page-strategic-projects',
  standalone: true,
  imports: [FormsModule, DecimalPipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Reconstruction Projects" icon="fa-hammer"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Recovery'}, {label:'Reconstruction Projects'}]">
      <button class="btn-add" type="button" (click)="openForm()"><i class="fas fa-plus"></i> Register Project</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="s()['total'] ?? 0" label="Projects" icon="fa-hammer" color="#6f42c1" />
      <dmis-stat-card [value]="s()['construction'] ?? 0" label="In construction" icon="fa-person-digging" color="#d97706" />
      <dmis-stat-card [value]="s()['operational'] ?? 0" label="Operational" icon="fa-circle-check" color="#059669" />
      <dmis-stat-card [value]="s()['with_plan'] ?? 0" label="With management plan" icon="fa-clipboard-check" color="#0d6efd" />
      <dmis-stat-card [value]="budgetBn()" label="Total budget (TZS bn)" icon="fa-coins" color="#e83e8c" />
    </div>

    <div class="panel-row">
      <dmis-panel title="Strategic / Reconstruction Projects" icon="fa-database" [badge]="rows().length + ' shown'">
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <select class="form-select" style="max-width:170px;" [(ngModel)]="fStatus" (change)="reload()">
            <option value="">All statuses</option>@for (st of statuses; track st) { <option [value]="st">{{ st }}</option> }
          </select>
          <select class="form-select" style="max-width:160px;" [(ngModel)]="fSector" (change)="reload()">
            <option value="">All sectors</option>@for (sec of sectors; track sec) { <option [value]="sec">{{ sec }}</option> }
          </select>
          <input class="form-control" style="max-width:240px;" placeholder="Search name / id…" [(ngModel)]="fSearch" (keyup.enter)="reload()">
          <button class="btn-add" style="background:#64748b;" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr><th>ID</th><th>Project</th><th>Sector</th><th>Category</th><th>Hazards</th><th style="text-align:right;">Budget (TZS)</th><th>Status</th><th></th></tr></thead>
            <tbody>
              @for (r of rows(); track r.id) {
                <tr class="data-row">
                  <td style="font-family:monospace;font-size:0.78rem;">{{ r.entry_id }}</td>
                  <td class="r-title" style="max-width:240px;">{{ r.project_name }}
                    <div class="r-subtitle">{{ (asArr(r.location)).join(', ') }}</div></td>
                  <td><span class="r-badge" style="background:rgba(13,110,253,0.1);color:#0d6efd;">{{ r.project_sector }}</span></td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">{{ r.project_category }}</td>
                  <td style="font-size:0.78rem;">{{ asArr(r.risk_hazard_names).join(', ') || '—' }}</td>
                  <td style="text-align:right;">{{ (r.budget ?? 0) | number:'1.0-0' }}</td>
                  <td><span class="r-badge {{ badge(r.project_status) }}">{{ r.project_status }}</span></td>
                  <td style="text-align:right;">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" (click)="toggleMenu(r.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === r.id">
                        <a class="ctx-item" (click)="view(r)"><i class="fas fa-eye"></i> View details</a>
                        @for (st of nextStatuses(r.project_status); track st) {
                          <a class="ctx-item" (click)="setStatus(r, st)"><i class="fas fa-arrow-right"></i> Mark {{ st }}</a>
                        }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty { <tr><td colspan="8" style="text-align:center;color:var(--text-light);padding:2.5rem;">No projects registered yet.</td></tr> }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;"><i class="fas fa-hammer me-2"></i>Register Reconstruction Project</h5>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;">
            <div style="grid-column:1/3;"><label class="f-lbl">Project name *</label><input class="form-control" [(ngModel)]="m.project_name"></div>
            <div><label class="f-lbl">Category</label><select class="form-select" [(ngModel)]="m.project_category">@for (c of categories; track c) { <option [value]="c">{{ c }}</option> }</select></div>
            <div><label class="f-lbl">Sector</label><select class="form-select" [(ngModel)]="m.project_sector">@for (sec of sectors; track sec) { <option [value]="sec">{{ sec }}</option> }</select></div>
            <div><label class="f-lbl">Status</label><select class="form-select" [(ngModel)]="m.project_status">@for (st of statuses; track st) { <option [value]="st">{{ st }}</option> }</select></div>
            <div><label class="f-lbl">Budget (TZS)</label><input type="number" min="0" class="form-control" [(ngModel)]="m.budget"></div>
            <div><label class="f-lbl">Regions (comma-separated)</label><input class="form-control" [(ngModel)]="mRegions" placeholder="Dar es Salaam, Pwani"></div>
            <div><label class="f-lbl">Associated hazards (comma-separated)</label><input class="form-control" [(ngModel)]="mHazards" placeholder="Floods, Cyclone"></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Elements at risk</label><textarea class="form-control" rows="2" [(ngModel)]="m.elements_at_risk" placeholder="people, infrastructure, farms…"></textarea></div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button class="btn-cancel" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!m.project_name || saving()" (click)="save()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> Register
            </button>
          </div>
        </div>
      </div>
    }

    @if (detail(); as r) {
      <div class="modal-backdrop" (click)="detail.set(null)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.6rem;">
            <h5 style="font-weight:800;margin:0;">{{ r.entry_id }} — {{ r.project_name }}</h5>
            <span class="r-badge {{ badge(r.project_status) }}">{{ r.project_status }}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;font-size:0.84rem;">
            <div><div class="f-lbl">Sector</div>{{ r.project_sector }}</div>
            <div><div class="f-lbl">Category</div>{{ r.project_category }}</div>
            <div><div class="f-lbl">Budget</div>TZS {{ (r.budget ?? 0) | number:'1.0-0' }}</div>
            <div><div class="f-lbl">Management plan</div>{{ r.has_management_plan ? 'Yes' : 'No' }}</div>
            <div style="grid-column:1/3;"><div class="f-lbl">Location</div>{{ asArr(r.location).join(', ') || '—' }}</div>
            <div style="grid-column:1/3;"><div class="f-lbl">Associated hazards</div>{{ asArr(r.risk_hazard_names).join(', ') || '—' }}</div>
            <div style="grid-column:1/3;"><div class="f-lbl">Elements at risk</div>{{ r.elements_at_risk || '—' }}</div>
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
export class StrategicProjectsComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/recovery/strategic-projects';

  data = signal<any | null>(null);
  formOpen = signal(false);
  detail = signal<Row | null>(null);
  saving = signal(false);
  openMenu = signal<number | null>(null);
  fStatus = ''; fSector = ''; fSearch = '';
  sectors = SECTORS; categories = CATEGORIES; statuses = STATUSES; hazards = HAZARDS;
  m: any = {};
  mRegions = ''; mHazards = '';

  s = computed<Record<string, number>>(() => this.data()?.stats ?? {});
  rows = computed<Row[]>(() => this.data()?.projects ?? []);
  budgetBn = computed(() => Math.round((this.s()['total_budget'] ?? 0) / 1e9));

  constructor() { this.reload(); }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fStatus) { q.set('status', this.fStatus); }
    if (this.fSector) { q.set('sector', this.fSector); }
    if (this.fSearch.trim()) { q.set('search', this.fSearch.trim()); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(d => this.data.set(d));
  }

  badge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }
  asArr(v: any): string[] { return Array.isArray(v) ? v : []; }
  view(r: Row): void { this.detail.set(r); }
  openForm(): void { this.m = { project_category: 'Government', project_sector: 'Other', project_status: 'Mobilization' }; this.mRegions = ''; this.mHazards = ''; this.formOpen.set(true); }

  nextStatuses(status: string): string[] {
    const flow: Record<string, string[]> = {
      Mobilization: ['Construction', 'Stopped'], Construction: ['Operational', 'Stopped'],
      Operational: ['Decommissioning', 'Closure'], Stopped: ['Construction', 'Closure'],
    };
    return flow[status] ?? [];
  }

  save(): void {
    this.saving.set(true);
    const body = { ...this.m, location: this.split(this.mRegions), risk_hazard_names: this.split(this.mHazards), risk_hazard_type: 'Natural' };
    this.http.post<any>(this.base, body).subscribe({
      next: () => { this.saving.set(false); this.formOpen.set(false); this.reload(); },
      error: e => { this.saving.set(false); alert(e?.error?.detail ?? 'Could not register project.'); },
    });
  }

  setStatus(r: Row, status: string): void {
    this.http.post(`${this.base}/${r.id}/status`, { status }).subscribe({ next: () => this.reload() });
  }

  private split(s: string): string[] { return s.split(',').map(x => x.trim()).filter(Boolean); }
  toggleMenu(id: number, event: Event): void { event.stopPropagation(); this.openMenu.update(c => (c === id ? null : id)); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
