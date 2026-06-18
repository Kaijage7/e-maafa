import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface CPlanRow {
  id: number; publication_date: string | null; hazard_type: string; timeframe: string | null;
  coverage_regions: string[]; sectors: string[]; budget: number | null; description: string | null;
  status: string;
}

const HAZARDS = ['Floods', 'Cyclone', 'Drought', 'Disease Outbreak', 'Landslide', 'Wildfire',
  'Earthquake', 'Tsunami', 'Heatwave', 'Pest Invasion', 'Volcanic Eruption', 'Sea level rise'];
const STATUS_BADGE: Record<string, string> = {
  active: 'badge-approved', pending: 'badge-pending', draft: 'badge-rejected', archived: 'badge-muted',
};

/**
 * Contingency Plans — the strategic, multi-region, multi-sector standing plans that sit ALONGSIDE
 * the Anticipatory Action Plans. Where an anticipatory plan is forecast-triggered and council-
 * specific, a contingency plan is a standing plan for a hazard over a planning timeframe (the
 * source risk-assessment plan_type was {anticipatory, contingency}). Port of the Laravel
 * ContingencyPlan admin: registry + create/edit + draft→pending→active→archived lifecycle.
 */
@Component({
  selector: 'page-contingency-plans',
  standalone: true,
  imports: [FormsModule, DecimalPipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Contingency Plans" icon="fa-folder-tree"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Contingency Plans'}]">
      <button class="btn-add" type="button" (click)="openForm(null)"><i class="fas fa-plus"></i> New Plan</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['total'] ?? 0" label="Plans" icon="fa-folder-tree" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['active'] ?? 0" label="Active (in force)" icon="fa-circle-check" color="#059669" />
      <dmis-stat-card [value]="stats()['pending'] ?? 0" label="Pending approval" icon="fa-hourglass-half" color="#d97706" />
      <dmis-stat-card [value]="stats()['draft'] ?? 0" label="Draft" icon="fa-pen-ruler" color="#64748b" />
      <dmis-stat-card [value]="budgetBn()" label="Active budget (TZS bn)" icon="fa-coins" color="#e83e8c" />
    </div>

    <div class="panel-row">
      <dmis-panel title="Strategic Contingency Plans" icon="fa-database" [badge]="plans().length + ' shown'">
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <select class="form-select" style="max-width:170px;" [(ngModel)]="fStatus" (change)="reload()">
            <option value="">All statuses</option>
            <option value="active">Active</option><option value="pending">Pending</option>
            <option value="draft">Draft</option><option value="archived">Archived</option>
          </select>
          <select class="form-select" style="max-width:190px;" [(ngModel)]="fHazard" (change)="reload()">
            <option value="">All hazards</option>
            @for (h of byHazard(); track h.hazard_type) { <option [value]="h.hazard_type">{{ h.hazard_type }} ({{ h.count }})</option> }
          </select>
          <button class="btn-add" style="background:#64748b;" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr>
              <th>Hazard</th><th>Timeframe</th><th>Regions</th><th>Sectors</th>
              <th style="text-align:right;">Budget (TZS)</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              @for (p of plans(); track p.id) {
                <tr class="data-row">
                  <td><span class="r-badge" style="background:rgba(13,110,253,0.1);color:#0d6efd;">{{ p.hazard_type }}</span></td>
                  <td style="font-size:0.82rem;color:var(--text-mid);max-width:200px;">{{ p.timeframe || '—' }}</td>
                  <td style="font-size:0.78rem;color:var(--text-mid);max-width:200px;">
                    <span class="chip">{{ (p.coverage_regions || []).length }} region(s)</span>
                    <div style="margin-top:3px;color:var(--text-light);">{{ (p.coverage_regions || []).slice(0,3).join(', ') }}{{ (p.coverage_regions || []).length > 3 ? '…' : '' }}</div>
                  </td>
                  <td style="font-size:0.78rem;"><span class="chip">{{ (p.sectors || []).length }} sector(s)</span></td>
                  <td style="text-align:right;">{{ (p.budget ?? 0) | number:'1.0-0' }}</td>
                  <td><span class="r-badge {{ badge(p.status) }}">{{ p.status }}</span></td>
                  <td style="text-align:right;">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" (click)="toggleMenu(p.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === p.id">
                        <a class="ctx-item" (click)="view(p)"><i class="fas fa-eye"></i> View details</a>
                        @if (p.status === 'draft') {
                          <a class="ctx-item" (click)="openForm(p)"><i class="fas fa-pen"></i> Edit</a>
                          <a class="ctx-item success" (click)="action(p,'submit')"><i class="fas fa-paper-plane"></i> Submit for approval</a>
                        }
                        @if (p.status === 'pending') {
                          <a class="ctx-item success" (click)="action(p,'approve')"><i class="fas fa-check"></i> Approve</a>
                          <a class="ctx-item danger" (click)="action(p,'reject')"><i class="fas fa-rotate-left"></i> Reject to draft</a>
                        }
                        @if (p.status === 'active') { <a class="ctx-item" (click)="action(p,'archive')"><i class="fas fa-box-archive"></i> Archive</a> }
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" style="text-align:center;color:var(--text-light);padding:2rem;">No contingency plans match — create the first one.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    <!-- Create / Edit modal -->
    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;"><i class="fas fa-folder-tree me-2"></i>{{ editId ? 'Edit' : 'New' }} Contingency Plan</h5>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;">
            <div><label class="f-lbl">Hazard <span class="text-danger">*</span></label>
              <select class="form-select" [(ngModel)]="m.hazard_type">
                <option value="">Select hazard</option>
                @for (h of hazards; track h) { <option [value]="h">{{ h }}</option> }
              </select></div>
            <div><label class="f-lbl">Timeframe</label>
              <input class="form-control" [(ngModel)]="m.timeframe" placeholder="e.g. 2026 Masika rainy season"></div>
            <div><label class="f-lbl">Coverage regions (one per line)</label>
              <textarea class="form-control" rows="5" [(ngModel)]="mRegions" placeholder="Dar es Salaam&#10;Morogoro&#10;Pwani"></textarea></div>
            <div><label class="f-lbl">Sectors / DRFs engaged (one per line)</label>
              <textarea class="form-control" rows="5" [(ngModel)]="mSectors" placeholder="Coordination&#10;Search & Rescue&#10;Health&#10;WASH"></textarea></div>
            <div><label class="f-lbl">Budget (TZS)</label>
              <input type="number" min="0" class="form-control" [(ngModel)]="m.budget"></div>
            <div></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Description</label>
              <textarea class="form-control" rows="3" [(ngModel)]="m.description" placeholder="Scope, triggers, resource-sharing protocol…"></textarea></div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button type="button" class="btn-cancel" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!m.hazard_type || saving()" (click)="save()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ editId ? 'Update plan' : 'Create plan (draft)' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Read-only detail -->
    @if (detail(); as p) {
      <div class="modal-backdrop" (click)="detail.set(null)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
            <h5 style="font-weight:800;margin:0;">{{ p.hazard_type }} — Contingency Plan</h5>
            <span class="r-badge {{ badge(p.status) }}">{{ p.status }}</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;font-size:0.84rem;">
            <div><div class="f-lbl">Timeframe</div>{{ p.timeframe || '—' }}</div>
            <div><div class="f-lbl">Budget</div>TZS {{ (p.budget ?? 0) | number:'1.0-0' }}</div>
            <div style="grid-column:1/3;"><div class="f-lbl">Coverage regions ({{ asArray(p.coverage_regions).length }})</div>
              <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:3px;">
                @for (r of asArray(p.coverage_regions); track r) { <span class="chip">{{ r }}</span> }</div></div>
            <div style="grid-column:1/3;"><div class="f-lbl">Sectors / DRFs engaged ({{ asArray(p.sectors).length }})</div>
              <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:3px;">
                @for (s of asArray(p.sectors); track s) { <span class="chip" style="background:rgba(5,150,105,0.12);color:#059669;">{{ s }}</span> }</div></div>
            <div style="grid-column:1/3;"><div class="f-lbl">Description</div>{{ p.description || '—' }}</div>
          </div>
          <div style="text-align:right;margin-top:1rem;"><button class="btn-cancel" (click)="detail.set(null)">Close</button></div>
        </div>
      </div>
    }
  `,
  styles: [`
    .f-lbl { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.4px; color: var(--text-light); display: block; margin-bottom: 3px; }
    .btn-mini { font-size: 0.72rem; padding: 0.25rem 0.7rem; border-radius: 7px; border: 1px solid var(--border); background: #fff; cursor: pointer; margin-left: 4px; color: var(--text-dark); }
    .chip { display:inline-block; font-size: 0.72rem; padding: 2px 8px; border-radius: 20px; background: rgba(13,110,253,0.1); color: #0d6efd; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1500; display: flex; align-items: flex-start; justify-content: center; padding: 3vh 1rem; overflow-y: auto; }
    .modal-card { background: var(--card-bg, #fff); border-radius: 16px; max-width: 760px; width: 100%; padding: 1.4rem 1.5rem; }
    .btn-cancel { border: 1px solid var(--border); background: #fff; border-radius: 9px; padding: 0.5rem 1rem; cursor: pointer; }
    .badge-muted { background: rgba(100,116,139,0.14); color: #64748b; }
  `],
})
export class ContingencyPlansComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/response/contingency-plans';

  plans = signal<CPlanRow[]>([]);
  stats = signal<Record<string, number>>({});
  byHazard = signal<{ hazard_type: string; count: number }[]>([]);
  formOpen = signal(false);
  detail = signal<any | null>(null);
  saving = signal(false);

  fStatus = ''; fHazard = '';
  hazards = HAZARDS;
  openMenu = signal<number | null>(null);

  editId: number | null = null;
  m: any = {};
  mRegions = '';
  mSectors = '';

  budgetBn = computed(() => Math.round((this.stats()['budget_active'] ?? 0) / 1e9));

  constructor() { this.reload(); }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fStatus) { q.set('status', this.fStatus); }
    if (this.fHazard) { q.set('hazard', this.fHazard); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(r => {
      this.plans.set(r.plans);
      this.stats.set(r.stats);
      this.byHazard.set(r.by_hazard);
    });
  }

  badge(s: string): string { return STATUS_BADGE[s] ?? 'badge-pending'; }

  /** PG json fields may arrive parsed (array) or as {type:'json', value:'[...]'} — normalise. */
  asArray(v: any): string[] {
    if (!v) { return []; }
    if (Array.isArray(v)) { return v; }
    if (typeof v === 'object' && v.value) { try { return JSON.parse(v.value); } catch { return []; } }
    if (typeof v === 'string') { try { return JSON.parse(v); } catch { return []; } }
    return [];
  }

  openForm(p: CPlanRow | null): void {
    this.editId = p?.id ?? null;
    if (!p) {
      this.m = {}; this.mRegions = ''; this.mSectors = '';
      this.formOpen.set(true);
      return;
    }
    this.http.get<any>(`${this.base}/${p.id}`).subscribe(r => {
      const f = r.plan;
      this.m = { hazard_type: f.hazard_type, timeframe: f.timeframe, budget: f.budget, description: f.description };
      this.mRegions = this.asArray(f.coverage_regions).join('\n');
      this.mSectors = this.asArray(f.sectors).join('\n');
      this.formOpen.set(true);
    });
  }

  view(p: CPlanRow): void {
    this.http.get<any>(`${this.base}/${p.id}`).subscribe(r => this.detail.set(r.plan));
  }

  save(): void {
    this.saving.set(true);
    const body = {
      ...this.m,
      coverage_regions: this.lines(this.mRegions),
      sectors: this.lines(this.mSectors),
    };
    const url = this.editId ? `${this.base}/${this.editId}` : this.base;
    this.http.post<any>(url, body).subscribe({
      next: () => { this.saving.set(false); this.formOpen.set(false); this.reload(); },
      error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not save the plan.'); },
    });
  }

  action(p: CPlanRow, act: 'submit' | 'approve' | 'reject' | 'archive'): void {
    const labels: Record<string, string> = {
      submit: 'Submit this draft for approval?', approve: 'Approve this plan — it becomes active and in force?',
      reject: 'Return this plan to draft?', archive: 'Archive this plan?',
    };
    if (!confirm(labels[act])) { return; }
    this.http.post(`${this.base}/${p.id}/${act}`, {}).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.error?.detail ?? 'Action failed.'),
    });
  }

  private lines(s: string): string[] {
    return s.split('\n').map(x => x.trim()).filter(Boolean);
  }

  toggleMenu(id: number, event: Event): void { event.stopPropagation(); this.openMenu.update(c => (c === id ? null : id)); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
