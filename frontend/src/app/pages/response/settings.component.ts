import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

/**
 * R12 System Settings hub. Administers the configurable Response settings:
 *   • Approval chains — the role chain the V24 engine reads live (edit = changes how approvals run)
 *   • Resource catalogue — the resources every allocation/dispatch flow draws from
 *   • Incident types — the hazard classification
 */
@Component({
  selector: 'page-response-settings',
  standalone: true,
  imports: [DecimalPipe, FormsModule, PageHeaderComponent, PanelComponent],
  styles: [`
    .queue-tabs { display: flex; gap: 4px; background: #fff; border-bottom: 2px solid #e3e6ed; border-radius: 12px 12px 0 0; padding: 0 4px; margin-bottom: 12px; }
    .queue-tabs button { font-size: 0.82rem; font-weight: 600; color: #6c757d; border: none; background: none; padding: 10px 16px; border-bottom: 2px solid transparent; margin-bottom: -2px; cursor: pointer; font-family: inherit; }
    .queue-tabs button.active { color: #dc3545; border-bottom-color: #dc3545; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .btn-sm { font-size: 0.72rem; padding: 4px 11px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; }
    .b-red { background: #dc3545; color: #fff; } .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; }
    .chip { font-size: 0.64rem; font-weight: 700; border-radius: 8px; padding: 1px 8px; background: #e2e8f0; color: #334155; }
    .on { background: #d1fae5; color: #065f46; } .off { background: #fee2e2; color: #b91c1c; }
    .step-row { display: grid; grid-template-columns: 30px 1.4fr 1.2fr auto auto; gap: 8px; align-items: center; padding: 6px 0; border-bottom: 1px solid #f1f5f9; }
    .step-row input, .step-row select { font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 6px; padding: 5px 8px; font-family: inherit; width: 100%; box-sizing: border-box; }
    .ord { width: 26px; height: 26px; border-radius: 50%; background: #dc3545; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.78rem; }
    .empty { text-align: center; color: #94a3b8; padding: 26px 0; font-size: 0.85rem; }
    .hint { font-size: 0.76rem; color: #6c757d; margin: 4px 0 10px; }
    .ctx-menu { position: absolute; top: 100%; right: 0; }
    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 1500; display: flex; align-items: flex-start; justify-content: center; padding: 6vh 1rem; }
    .modal-card { background: #fff; border: 1px solid #e3e6ed; border-radius: 12px; max-width: 560px; width: 100%; padding: 1.3rem 1.4rem; box-sizing: border-box; }
    .modal-title { font-weight: 800; margin: 0 0 1rem; font-size: 1rem; }
    .f-lbl { font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.4px; color: #6c757d; display: block; margin: 0.7rem 0 3px; }
    .ff { width: 100%; box-sizing: border-box; font-size: 0.85rem; border: 1px solid #cbd5e1; border-radius: 6px; padding: 7px 9px; font-family: inherit; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 12px; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1.1rem; }
    .icon-preview { margin-top: 8px; font-size: 0.82rem; color: #334155; }
  `],
  template: `
    <dmis-page-header title="System Settings" icon="fa-gears"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'System Settings'}]">
    </dmis-page-header>

    <div class="queue-tabs">
      <button [class.active]="tab() === 'chains'" (click)="tab.set('chains')">Approval Chains</button>
      <button [class.active]="tab() === 'resources'" (click)="tab.set('resources')">Resource Catalogue</button>
      <button [class.active]="tab() === 'types'" (click)="tab.set('types')">Incident Types</button>
    </div>

    <!-- ── Approval chains (live V24 engine config) ── -->
    @if (tab() === 'chains') {
      <dmis-panel title="Approval Workflow Chains" icon="fa-diagram-project">
        <p class="hint">These chains are read live by the approval engine — editing one changes how new requests are approved.</p>
        @if (!editingModule()) {
          <table>
            <thead><tr><th>Module</th><th>Model</th><th>Steps</th><th>Active</th><th></th></tr></thead>
            <tbody>
              @for (m of chains().modules ?? []; track m.id) {
                <tr>
                  <td><b>{{ m.name }}</b><br><small style="color:#6c757d">{{ m.module_code }}</small></td>
                  <td><small>{{ m.model }}</small></td>
                  <td>{{ m.step_count }}</td>
                  <td><span class="chip" [class.on]="m.is_active" [class.off]="!m.is_active">{{ m.is_active ? 'Active' : 'Inactive' }}</span></td>
                  <td style="white-space:nowrap">
                    <button class="btn-sm b-red" (click)="editChain(m.id)">Edit Chain</button>
                    <button class="btn-sm b-outline" style="margin-left:4px" (click)="toggleModule(m.id)">Toggle</button>
                  </td>
                </tr>
              } @empty { <tr><td colspan="5" class="empty">No approval modules configured.</td></tr> }
            </tbody>
          </table>
        } @else {
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px">
            <b>{{ editingModule().module.name }} — approval steps</b>
            <button class="btn-sm b-outline" (click)="editingModule.set(null)">← Back</button>
          </div>
          <p class="hint">Steps run top-to-bottom. The requester's own role is skipped automatically.</p>
          @for (s of editSteps; track $index; let i = $index) {
            <div class="step-row">
              <span class="ord">{{ i + 1 }}</span>
              <input [(ngModel)]="s.name" placeholder="Step name (e.g. RAS Approval)">
              <select [(ngModel)]="s.role_required">
                @for (r of editingModule().roles ?? []; track r.name) { <option [value]="r.name ?? r">{{ r.name ?? r }}</option> }
              </select>
              <label style="font-size:0.74rem; white-space:nowrap"><input type="checkbox" [(ngModel)]="s.can_skip"> can skip</label>
              <button class="btn-sm b-outline" (click)="editSteps.splice(i, 1)">✕</button>
            </div>
          }
          <div style="margin-top:10px; display:flex; gap:8px">
            <button class="btn-sm b-outline" (click)="addStep()"><i class="fas fa-plus"></i> Add step</button>
            <button class="btn-sm b-red" (click)="saveChain()"><i class="fas fa-save"></i> Save Chain</button>
          </div>
        }
      </dmis-panel>
    }

    <!-- ── Resource catalogue ── -->
    @if (tab() === 'resources') {
      <dmis-panel title="Resource Catalogue" icon="fa-box-archive">
        <button class="btn-sm b-red" style="margin-bottom:10px" (click)="openResourceForm(null)"><i class="fas fa-plus"></i> Add Resource</button>
        <table>
          <thead><tr><th>Name</th><th>Category</th><th>Unit</th><th>In Stock</th><th>Low Threshold</th><th>Unit Cost</th><th></th></tr></thead>
          <tbody>
            @for (r of resources().resources ?? []; track r.id) {
              <tr>
                <td><b>{{ r.name }}</b><br><small style="color:#6c757d">{{ r.description }}</small></td>
                <td>{{ r.category ?? '—' }}</td>
                <td>{{ r.unit_of_measure ?? '—' }}</td>
                <td>{{ r.in_stock | number }}</td>
                <td>{{ r.low_stock_threshold ?? '—' }}</td>
                <td>{{ r.unit_cost ? (r.unit_cost | number) : '—' }}</td>
                <td style="white-space:nowrap;text-align:right;">
                  <div class="ctx-wrap">
                    <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + r.name" (click)="toggleMenu('res:' + r.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="ctx-menu" [class.open]="openMenu() === 'res:' + r.id">
                      <a class="ctx-item" (click)="openResourceForm(r)"><i class="fas fa-pen"></i> Edit</a>
                      <a class="ctx-item danger" (click)="deleteResource(r.id)"><i class="fas fa-trash"></i> Delete</a>
                    </div>
                  </div>
                </td>
              </tr>
            } @empty { <tr><td colspan="7" class="empty">Catalogue is empty.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- ── Incident types ── -->
    @if (tab() === 'types') {
      <dmis-panel title="Incident Types" icon="fa-tags">
        <button class="btn-sm b-red" style="margin-bottom:10px" (click)="openTypeForm(null)"><i class="fas fa-plus"></i> Add Incident Type</button>
        <table>
          <thead><tr><th>Name</th><th>Default Severity</th><th>Icon</th><th>Used By</th><th></th></tr></thead>
          <tbody>
            @for (t of types().incident_types ?? []; track t.id) {
              <tr>
                <td><b>{{ t.name }}</b><br><small style="color:#6c757d">{{ t.description }}</small></td>
                <td>{{ t.default_severity ?? '—' }}</td>
                <td><i class="fas {{ t.icon_class }}"></i> {{ t.icon_class ?? '—' }}</td>
                <td>{{ t.incident_count }} incidents</td>
                <td style="white-space:nowrap;text-align:right;">
                  <div class="ctx-wrap">
                    <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + t.name" (click)="toggleMenu('type:' + t.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="ctx-menu" [class.open]="openMenu() === 'type:' + t.id">
                      <a class="ctx-item" (click)="openTypeForm(t)"><i class="fas fa-pen"></i> Edit</a>
                      <a class="ctx-item danger" (click)="deleteType(t.id)"><i class="fas fa-trash"></i> Delete</a>
                    </div>
                  </div>
                </td>
              </tr>
            } @empty { <tr><td colspan="5" class="empty">No incident types.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- ── In-app create/edit form (replaces the typed SweetAlert dialogs) ── -->
    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          @if (formKind() === 'resource') {
            <h5 class="modal-title"><i class="fas fa-box-archive" style="margin-right:8px"></i>{{ editId ? 'Edit resource' : 'Add resource' }}</h5>
            <label class="f-lbl">Name *</label>
            <input class="ff" [(ngModel)]="m.name" placeholder="Resource name">
            <div class="form-grid">
              <div>
                <label class="f-lbl">Category</label>
                <input class="ff" list="rs-cat-opts" [(ngModel)]="m.category" placeholder="Pick or type">
                <datalist id="rs-cat-opts">@for (c of categoryOptions(); track c) { <option [value]="c"></option> }</datalist>
              </div>
              <div>
                <label class="f-lbl">Unit of measure</label>
                <input class="ff" list="rs-unit-opts" [(ngModel)]="m.unit_of_measure" placeholder="Pick or type">
                <datalist id="rs-unit-opts">@for (u of unitOptions(); track u) { <option [value]="u"></option> }</datalist>
              </div>
              <div>
                <label class="f-lbl">Low-stock threshold</label>
                <input class="ff" type="number" [(ngModel)]="m.low_stock_threshold">
              </div>
              <div>
                <label class="f-lbl">Unit cost (TZS)</label>
                <input class="ff" type="number" [(ngModel)]="m.unit_cost">
              </div>
            </div>
            <label class="f-lbl">Description</label>
            <input class="ff" [(ngModel)]="m.description">
          } @else {
            <h5 class="modal-title"><i class="fas fa-tags" style="margin-right:8px"></i>{{ editId ? 'Edit incident type' : 'Add incident type' }}</h5>
            <label class="f-lbl">Name *</label>
            <input class="ff" [(ngModel)]="m.name" placeholder="Incident type name">
            <div class="form-grid">
              <div>
                <label class="f-lbl">Default severity</label>
                <select class="ff" [(ngModel)]="m.default_severity">
                  @for (s of severityOptions(); track s) { <option [value]="s">{{ s }}</option> }
                </select>
              </div>
              <div>
                <label class="f-lbl">Icon</label>
                <select class="ff" [(ngModel)]="m.icon_class">
                  <option value="">— none —</option>
                  @for (ic of iconOptions(); track ic) { <option [value]="ic">{{ ic }}</option> }
                </select>
              </div>
            </div>
            <label class="f-lbl">Description</label>
            <input class="ff" [(ngModel)]="m.description">
            @if (m.icon_class) { <div class="icon-preview"><i class="fas {{ m.icon_class }}"></i> icon preview</div> }
          }
          <div class="form-actions">
            <button class="btn-sm b-outline" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-sm b-red" [disabled]="!m.name || !m.name.trim() || saving()" (click)="saveForm()">
              {{ editId ? 'Save changes' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class ResponseSettingsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  readonly tab = signal<'chains' | 'resources' | 'types'>('chains');
  readonly chains = signal<any>({});
  readonly resources = signal<any>({});
  readonly types = signal<any>({});
  readonly editingModule = signal<any | null>(null);
  editSteps: any[] = [];

  // Row action kebab — composite key ('res:'+id / 'type:'+id) so one menu opens across both tables.
  readonly openMenu = signal<string | null>(null);
  toggleMenu(id: string, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }

  // ── in-app create/edit form (replaces the SweetAlert typed dialogs; pre-filled, dropdown-driven) ──
  readonly formOpen = signal(false);
  readonly formKind = signal<'resource' | 'type'>('resource');
  readonly saving = signal(false);
  editId: number | null = null;
  m: any = {};
  readonly iconOptions = computed<string[]>(() => this.types().icons ?? []);
  readonly severityOptions = computed<string[]>(() => this.types().severities ?? []);
  readonly categoryOptions = computed<string[]>(() =>
    [...new Set((this.resources().resources ?? []).map((r: any) => r.category).filter(Boolean) as string[])].sort());
  readonly unitOptions = computed<string[]>(() =>
    [...new Set((this.resources().resources ?? []).map((r: any) => r.unit_of_measure).filter(Boolean) as string[])].sort());

  ngOnInit(): void {
    ensureSweetAlert();
    const t = this.route.snapshot.data['tab'];
    if (t === 'chains' || t === 'resources' || t === 'types') { this.tab.set(t); }
    this.loadChains();
    this.loadResources();
    this.loadTypes();
  }

  loadChains(): void { this.http.get<any>('/api/v1/response/settings/approval-chains').subscribe(d => this.chains.set(d)); }
  loadResources(): void { this.http.get<any>('/api/v1/response/settings/resources').subscribe(d => this.resources.set(d)); }
  loadTypes(): void { this.http.get<any>('/api/v1/response/settings/incident-types').subscribe(d => this.types.set(d)); }

  // ── approval chain editor ──
  editChain(moduleId: number): void {
    this.http.get<any>(`/api/v1/response/settings/approval-chains/${moduleId}`).subscribe(d => {
      this.editSteps = (d.steps ?? []).map((s: any) => ({ name: s.name, role_required: s.role_required, can_skip: s.can_skip }));
      this.editingModule.set(d);
    });
  }

  addStep(): void {
    const roles = this.editingModule()?.roles ?? [];
    this.editSteps.push({ name: '', role_required: roles[0]?.name ?? roles[0] ?? '', can_skip: false });
  }

  saveChain(): void {
    if (this.editSteps.some(s => !s.name?.trim() || !s.role_required)) {
      ensureSweetAlert().then(() => Swal.fire('Incomplete', 'Every step needs a name and a role.', 'warning'));
      return;
    }
    this.post(`/api/v1/response/settings/approval-chains/${this.editingModule().module.id}/steps`,
      { steps: this.editSteps }, () => { this.editingModule.set(null); this.loadChains(); });
  }

  toggleModule(id: number): void {
    this.post(`/api/v1/response/settings/approval-chains/${id}/toggle`, {}, () => this.loadChains());
  }

  // ── resource catalogue ──
  openResourceForm(r: any | null): void {
    this.openMenu.set(null);
    this.formKind.set('resource');
    this.editId = r?.id ?? null;
    this.m = r
      ? { name: r.name, category: r.category, unit_of_measure: r.unit_of_measure,
          low_stock_threshold: r.low_stock_threshold, unit_cost: r.unit_cost, description: r.description }
      : {};
    this.formOpen.set(true);
  }

  deleteResource(id: number): void {
    this.confirmDelete(`/api/v1/response/settings/resources/${id}`, 'Delete this resource?', () => this.loadResources());
  }

  // ── incident types ──
  openTypeForm(t: any | null): void {
    this.openMenu.set(null);
    this.formKind.set('type');
    this.editId = t?.id ?? null;
    this.m = t
      ? { name: t.name, default_severity: t.default_severity, icon_class: t.icon_class, description: t.description }
      : { default_severity: this.severityOptions()[1] ?? 'Moderate' };
    this.formOpen.set(true);
  }

  /** One save path for both catalogues — POST create / POST update (same contract as before; UI only changed). */
  saveForm(): void {
    if (!this.m.name?.trim()) { return; }
    this.saving.set(true);
    const kind = this.formKind();
    const base = kind === 'resource'
      ? '/api/v1/response/settings/resources'
      : '/api/v1/response/settings/incident-types';
    const url = this.editId ? `${base}/${this.editId}` : base;
    const body = kind === 'resource'
      ? { name: this.m.name.trim(), category: this.m.category || null, unit_of_measure: this.m.unit_of_measure || null,
          low_stock_threshold: this.m.low_stock_threshold || null, unit_cost: this.m.unit_cost || null,
          description: this.m.description || null }
      : { name: this.m.name.trim(), default_severity: this.m.default_severity,
          icon_class: this.m.icon_class || null, description: this.m.description || null };
    this.http.post<any>(url, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.formOpen.set(false);
        if (kind === 'resource') { this.loadResources(); } else { this.loadTypes(); }
      },
      error: (err: any) => {
        this.saving.set(false);
        ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? 'An error occurred.', 'error'));
      },
    });
  }

  deleteType(id: number): void {
    this.confirmDelete(`/api/v1/response/settings/incident-types/${id}`, 'Delete this incident type?', () => this.loadTypes());
  }

  private confirmDelete(url: string, title: string, after: () => void): void {
    ensureSweetAlert().then(() => Swal.fire({ title, icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545' })
      .then((r: any) => {
        if (r.isConfirmed) {
          this.http.delete<any>(url).subscribe({
            next: res => ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Done', text: res.message, timer: 2200, showConfirmButton: false }).then(after)),
            error: err => ensureSweetAlert().then(() => Swal.fire('Cannot delete', err?.error?.detail ?? 'An error occurred.', 'error')),
          });
        }
      }));
  }

  private post(url: string, body: any, after: () => void): void {
    this.http.post<any>(url, body).subscribe({
      next: r => ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Saved', text: r.message, timer: 2400, showConfirmButton: false }).then(after)),
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? 'An error occurred.', 'error')),
    });
  }
}

// Module-scoped CDN loader, same pattern as the other response pages.
let swalPromise: Promise<void> | null = null;
function ensureSweetAlert(): Promise<void> {
  if (typeof Swal !== 'undefined') { return Promise.resolve(); }
  if (!swalPromise) {
    swalPromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }
  return swalPromise;
}
