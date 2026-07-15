import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { AuthService } from '../../core/auth.service';

interface Role {
  id: number; name: string; description: string | null; userCount: number; permissionCount: number;
  category: string; scopeLevel: string; sortOrder: number; incidentStage: string | null;
  assignmentHint: string | null; isIncidentFlow: boolean; isAreaScoped: boolean;
}
interface RoleGroup { category: string; count: number; roles: Role[]; }
interface Permission { id: number; name: string; action: string; label: string; hint?: string; }
interface Group { module: string; note?: string; permissions: Permission[]; }
interface ControlHint { title: string; scope: string; permissions: string; }

/**
 * System Settings → Roles & Permissions. The access model that ties the system together: users
 * hold roles, roles hold permissions across every functional area. Pick a role on the left, set
 * its permissions in the matrix on the right. Backend module/action gates consume those permission
 * grants as authorities, so the matrix is the operational access-control surface.
 */
@Component({
    selector: 'page-roles-permissions',
    imports: [FormsModule, PageHeaderComponent, PanelComponent, StatCardComponent],
    template: `
    <dmis-page-header title="Roles & Permissions" icon="fa-user-shield"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'System Settings'}, {label:'Roles & Permissions'}]">
      @if (canManage()) {
        <button class="btn-add" type="button" (click)="openRoleForm(null)"><i class="fas fa-plus"></i> Add Role</button>
      }
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['roles'] ?? 0" label="Roles" icon="fa-user-shield" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['permissions'] ?? 0" label="Permissions" icon="fa-key" color="#7c3aed" />
      <dmis-stat-card [value]="stats()['assignments'] ?? 0" label="Grants" icon="fa-link" color="#059669" />
    </div>

    <div style="margin:0 0 12px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;font-size:0.8rem;color:#334155;line-height:1.45">
      <b><i class="fas fa-sliders"></i> Operational control (honest)</b> —
      This matrix is the single place that gates warehouses, resource allocation, M&amp;E entry and Early Warning / PMO Impact Analysis.
      Area and institution specificity also requires User Management links:
      <code>region_id</code> / <code>district_id</code> / <code>council_id</code> for area officers,
      <code>agency_id</code> for MDA/institution logins, <code>stakeholder_id</code> for partners.
      Without those links a role may hold permissions but see an empty scope. Control cards below document recommended grant packs.
    </div>

    <div class="split2">
      <!-- Roles -->
      <dmis-panel title="Roles" icon="fa-user-shield" [badge]="roles().length + ''">
        <div class="panel-body rlist">
          @for (g of roleGroups(); track g.category) {
            <div class="role-band">
              <div class="role-band-title">
                <span>{{ g.category }}</span>
                <span>{{ g.count }}</span>
              </div>
              @for (r of g.roles; track r.id) {
                <div class="rnode" [class.sel]="selected()?.id === r.id" (click)="selectRole(r)">
                  <div style="flex:1;min-width:0;">
                    <div class="nm">{{ r.name }}</div>
                    <div class="sub">{{ scopeLabel(r.scopeLevel) }} · {{ r.userCount }} users · {{ r.permissionCount }} permissions</div>
                    @if (r.incidentStage || r.isAreaScoped) {
                      <div class="meta">
                        @if (r.incidentStage) { <span>{{ r.incidentStage }}</span> }
                        @if (r.isAreaScoped) { <span>area scoped</span> }
                        @if (r.isIncidentFlow) { <span>incident flow</span> }
                      </div>
                    }
                    @if (r.description) { <div class="desc">{{ r.description }}</div> }
                  </div>
                  @if (canManage()) {
                    <div class="ctx-wrap acts">
                      <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + r.name" (click)="toggleMenu(r.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === r.id">
                        <a class="ctx-item" (click)="openRoleForm(r, $event)"><i class="fas fa-pen"></i> Edit</a>
                        <a class="ctx-item danger" (click)="deleteRole(r, $event)"><i class="fas fa-trash"></i> Delete</a>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      </dmis-panel>

      <!-- Permission matrix -->
      <dmis-panel [title]="selected() ? 'Permissions — ' + selected()!.name : 'Permissions'" icon="fa-table-cells"
                  [badge]="selected() ? checked().size + ' / ' + totalPerms() : ''">
        <div class="panel-body">
          @if (!selected()) {
            <div class="muted">Select a role to view and edit its permissions.</div>
          } @else {
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.7rem;flex-wrap:wrap;gap:8px;">
              <div class="muted" style="padding:0;">Tick the actions this role may perform across the system.</div>
              <div class="perm-tools">
                <input class="perm-search" type="search" [ngModel]="permissionSearch()" (ngModelChange)="permissionSearch.set($event)"
                       placeholder="Search module, label, or key">
                @if (canManage()) {
                  <button class="btn-mini" (click)="setAll(true)">Select all</button>
                  <button class="btn-mini" (click)="setAll(false)">Clear</button>
                  <button class="btn-add" style="margin-left:6px;" [disabled]="saving() || !dirty()" (click)="save()">
                    <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> Save
                  </button>
                }
              </div>
            </div>
            @if (controlMap().length) {
              <div class="control-map">
                @for (c of controlMap(); track c.title) {
                  <div class="control-card">
                    <div class="control-title">{{ c.title }}</div>
                    <div class="control-scope">{{ c.scope }}</div>
                    <code>{{ c.permissions }}</code>
                  </div>
                }
              </div>
            }
            <div class="matrix">
              @for (g of filteredCatalogue(); track g.module) {
                <div class="mrow">
                  <div class="mmod">
                    <label class="modtoggle">
                      <input type="checkbox" [checked]="moduleAll(g)" [indeterminate]="moduleSome(g)" [disabled]="!canManage()" (change)="toggleModule(g, $any($event.target).checked)">
                      <span>{{ g.module }}</span>
                      <span class="modcount">{{ moduleChecked(g) }} / {{ g.permissions.length }}</span>
                    </label>
                    @if (g.note) { <div class="mnote">{{ g.note }}</div> }
                  </div>
                  <div class="mperms">
                    @for (p of g.permissions; track p.id) {
                      <label class="perm" [class.on]="checked().has(p.id)" [title]="p.label + ' - ' + p.name">
                        <span class="perm-main">
                          <input type="checkbox" [checked]="checked().has(p.id)" [disabled]="!canManage()" (change)="toggle(p.id)">
                          <span>{{ p.action }}</span>
                        </span>
                        <span class="perm-label">{{ p.hint || p.label }}</span>
                        <span class="perm-key">{{ p.name }}</span>
                      </label>
                    }
                  </div>
                </div>
              }
            </div>
          }
        </div>
      </dmis-panel>
    </div>

    @if (roleFormOpen()) {
      <div class="modal-backdrop" (click)="roleFormOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;">{{ roleEditId ? 'Edit role' : 'New role' }}</h5>
          <label class="f-lbl">Role name <span class="text-danger">*</span></label>
          <input class="form-control" [(ngModel)]="rf.name" [disabled]="roleEditId === protectedId()">
          <label class="f-lbl">Description</label>
          <input class="form-control" [(ngModel)]="rf.description">
          <div class="role-form-grid">
            <div>
              <label class="f-lbl">Category</label>
              <input class="form-control" list="role-categories" [(ngModel)]="rf.category" placeholder="e.g. District Incident Flow">
              <datalist id="role-categories">
                @for (c of categoryOptions(); track c) { <option [value]="c"></option> }
              </datalist>
            </div>
            <div>
              <label class="f-lbl">Scope</label>
              <select class="form-select" [(ngModel)]="rf.scopeLevel">
                <option value="system">System</option>
                <option value="national">National</option>
                <option value="regional">Regional</option>
                <option value="district">District</option>
                <option value="sector">Sector / Agency</option>
                <option value="stakeholder">Stakeholder</option>
              </select>
            </div>
            <div>
              <label class="f-lbl">Sort order</label>
              <input class="form-control" type="number" min="1" step="1" [(ngModel)]="rf.sortOrder">
            </div>
            <div>
              <label class="f-lbl">Incident stage</label>
              <input class="form-control" [(ngModel)]="rf.incidentStage" placeholder="waiting_ddmc">
            </div>
          </div>
          <label class="f-lbl">Assignment hint</label>
          <input class="form-control" [(ngModel)]="rf.assignmentHint" placeholder="What attachment or context this role needs">
          <div class="role-flags">
            <label><input type="checkbox" [(ngModel)]="rf.isIncidentFlow"> incident flow role</label>
            <label><input type="checkbox" [(ngModel)]="rf.isAreaScoped"> requires area attachment</label>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button class="btn-cancel" (click)="roleFormOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!rf.name?.trim()" (click)="saveRole()">{{ roleEditId ? 'Save' : 'Create role' }}</button>
          </div>
        </div>
      </div>
    }
  `,
    styles: [`
    .split2 { display:grid; grid-template-columns:340px 1fr; gap:12px; align-items:start; }
    .rlist { display:flex; flex-direction:column; gap:6px; max-height:66vh; overflow-y:auto; }
    .role-band { display:grid; gap:5px; }
    .role-band-title { display:flex; justify-content:space-between; align-items:center; font-size:0.72rem; font-weight:800; color:var(--text-light); text-transform:uppercase; letter-spacing:0.35px; padding:2px 2px 0; }
    .rnode { display:flex; gap:8px; border:1px solid var(--border); border-radius:9px; padding:0.55rem 0.7rem; cursor:pointer; }
    .rnode:hover { background:rgba(13,110,253,0.03); } .rnode.sel { border-color:#0d6efd; background:rgba(13,110,253,0.06); }
    .rnode .nm { font-weight:700; font-size:0.86rem; color:var(--text-dark); }
    .rnode .sub { font-size:0.8rem; color:var(--text-light); }
    .rnode .desc { font-size:0.8rem; color:var(--text-mid); margin-top:2px; }
    .rnode .meta { display:flex; flex-wrap:wrap; gap:4px; margin-top:3px; }
    .rnode .meta span { font-size:0.66rem; color:#475569; background:#f1f5f9; border-radius:999px; padding:1px 6px; }
    .rnode .acts { align-items:flex-start; }
    /* Anchor the row action menu under its trigger (the global .ctx-menu is position:fixed and detaches). */
    .ctx-menu { position:absolute; top:100%; right:0; }
    .matrix { display:flex; flex-direction:column; gap:4px; max-height:60vh; overflow-y:auto; }
    .mrow { display:grid; grid-template-columns:210px 1fr; gap:10px; align-items:center; border-bottom:1px dashed var(--border); padding:5px 0; }
    .mmod { font-size:0.8rem; font-weight:600; color:var(--text-dark); }
    .modtoggle { display:flex; align-items:center; gap:6px; cursor:pointer; }
    .modcount { color:var(--text-light); font-size:0.72rem; font-weight:600; }
    .mnote { margin-top:3px; font-size:0.72rem; line-height:1.35; color:var(--text-light); font-weight:500; }
    .mperms { display:flex; gap:6px; flex-wrap:wrap; }
    .perm { min-width:150px; max-width:240px; font-size:0.78rem; border:1px solid var(--border); border-radius:7px; padding:5px 8px; display:flex; flex-direction:column; gap:2px; cursor:pointer; color:var(--text-mid); }
    .perm-main { display:flex; align-items:center; gap:5px; text-transform:capitalize; }
    .perm-label { font-size:0.69rem; line-height:1.25; color:var(--text-mid); overflow-wrap:anywhere; }
    .perm-key { font-size:0.66rem; line-height:1.2; color:var(--text-light); overflow-wrap:anywhere; text-transform:none; }
    .perm.on { background:rgba(5,150,105,0.1); border-color:#059669; color:#059669; font-weight:600; }
    .perm.on .perm-label { color:#047857; }
    .perm.on .perm-key { color:#047857; font-weight:700; }
    .perm-tools { display:flex; align-items:center; gap:4px; flex-wrap:wrap; justify-content:flex-end; }
    .perm-search { min-width:210px; max-width:270px; border:1px solid var(--border); border-radius:7px; padding:0.35rem 0.65rem; font-size:0.78rem; color:var(--text-dark); }
    .control-map { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; margin:0 0 0.75rem; }
    .control-card { border:1px solid #e2e8f0; border-radius:7px; padding:7px 9px; background:#f8fafc; }
    .control-title { font-size:0.75rem; font-weight:800; color:var(--text-dark); }
    .control-scope { font-size:0.7rem; color:var(--text-mid); margin:1px 0 3px; }
    .control-card code { font-size:0.68rem; color:#475569; white-space:normal; overflow-wrap:anywhere; }
    .muted { color:var(--text-light); font-size:0.84rem; padding:0.6rem 0; }
    .btn-mini { font-size:0.78rem; padding:0.35rem 0.8rem; border-radius:7px; border:1px solid var(--border); background:#fff; cursor:pointer; margin-left:4px; color:var(--text-dark); }
    .f-lbl { font-size:0.75rem; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-light); display:block; margin:0.7rem 0 3px; }
    .role-form-grid { display:grid; grid-template-columns:1fr 1fr; gap:0 0.75rem; }
    .role-flags { display:flex; gap:1rem; flex-wrap:wrap; margin-top:0.65rem; font-size:0.82rem; color:var(--text-mid); }
    .role-flags label { display:flex; align-items:center; gap:6px; }
    .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1500; display:flex; align-items:flex-start; justify-content:center; padding:8vh 1rem; }
    .modal-card { background:var(--card-bg,#fff); border-radius:12px; max-width:640px; width:100%; padding:1.4rem 1.5rem; }
    .btn-cancel { border:1px solid var(--border); background:#fff; border-radius:8px; padding:0.5rem 1rem; cursor:pointer; }
    @media (max-width:991px){ .split2 { grid-template-columns:1fr; } .control-map { grid-template-columns:1fr; } }
    @media (max-width:640px){ .role-form-grid { grid-template-columns:1fr; } }
  `]
})
export class RolesPermissionsComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = '/api/v1/settings/roles';

  roles = signal<Role[]>([]);
  roleGroups = signal<RoleGroup[]>([]);
  stats = signal<Record<string, number>>({});
  catalogue = signal<Group[]>([]);
  controlMap = signal<ControlHint[]>([]);
  permissionSearch = signal('');
  selected = signal<Role | null>(null);
  checked = signal<Set<number>>(new Set());
  private original = signal<Set<number>>(new Set());
  saving = signal(false);

  roleFormOpen = signal(false);
  roleEditId: number | null = null;
  rf: any = {};

  openMenu = signal<number | null>(null);
  toggleMenu(id: number, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }

  totalPerms = computed(() => this.catalogue().reduce((n, g) => n + g.permissions.length, 0));
  filteredCatalogue = computed(() => {
    const q = this.permissionSearch().trim().toLowerCase();
    if (!q) {
      return this.catalogue();
    }
    return this.catalogue()
      .map(g => ({
        ...g,
        permissions: g.permissions.filter(p =>
          g.module.toLowerCase().includes(q)
          || p.action.toLowerCase().includes(q)
          || p.label.toLowerCase().includes(q)
          || (p.hint ?? '').toLowerCase().includes(q)
          || p.name.toLowerCase().includes(q)),
      }))
      .filter(g => g.permissions.length);
  });
  dirty = computed(() => {
    const a = this.checked(), b = this.original();
    return a.size !== b.size || [...a].some(x => !b.has(x));
  });
  protectedId = computed(() => this.roles().find(r => r.name === 'Super Admin')?.id ?? -1);
  canManage = computed(() => this.auth.hasPermission('roles_and_permissions.manage'));
  categoryOptions = computed(() => {
    const seen = new Set(this.roleGroups().map(g => g.category));
    ['System Administration', 'National Command', 'National Operations', 'Regional Incident Flow',
      'District Incident Flow', 'Sector / Agency', 'Stakeholder / Partner', 'Other']
      .forEach(c => seen.add(c));
    return [...seen];
  });

  constructor() {
    this.reload();
    this.http.get<{ catalogue: Group[]; controlMap?: ControlHint[] }>(`${this.base}/catalogue`).subscribe(c => {
      this.catalogue.set(c.catalogue);
      this.controlMap.set(c.controlMap ?? []);
    });
  }

  reload(): void {
    this.http.get<any>(this.base).subscribe(r => {
      this.roles.set(r.roles);
      this.roleGroups.set(r.roleGroups ?? this.groupRoles(r.roles ?? []));
      this.stats.set(r.stats);
    });
  }

  selectRole(r: Role): void {
    this.selected.set(r);
    this.http.get<any>(`${this.base}/${r.id}`).subscribe(d => {
      const set = new Set<number>(d.role.permissionIds);
      this.checked.set(new Set(set));
      this.original.set(new Set(set));
    });
  }

  toggle(id: number): void {
    if (!this.canManage()) { return; }
    this.checked.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  moduleAll(g: Group): boolean { return g.permissions.every(p => this.checked().has(p.id)); }
  moduleSome(g: Group): boolean { const c = this.checked(); return g.permissions.some(p => c.has(p.id)) && !this.moduleAll(g); }
  moduleChecked(g: Group): number { const c = this.checked(); return g.permissions.filter(p => c.has(p.id)).length; }

  toggleModule(g: Group, on: boolean): void {
    if (!this.canManage()) { return; }
    this.checked.update(s => { const n = new Set(s); g.permissions.forEach(p => on ? n.add(p.id) : n.delete(p.id)); return n; });
  }

  setAll(on: boolean): void {
    if (!this.canManage()) { return; }
    this.checked.set(on ? new Set(this.catalogue().flatMap(g => g.permissions.map(p => p.id))) : new Set());
  }

  save(): void {
    if (!this.selected() || !this.canManage()) { return; }
    this.saving.set(true);
    this.http.put(`${this.base}/${this.selected()!.id}/permissions`, { permissionIds: [...this.checked()] }).subscribe({
      next: () => {
        this.saving.set(false);
        const role = this.selected();
        this.reload();
        if (role) {
          this.selectRole(role);
        }
      },
      error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not save permissions.'); },
    });
  }

  openRoleForm(r: Role | null, ev?: Event): void {
    ev?.stopPropagation();
    if (!this.canManage()) { return; }
    this.roleEditId = r?.id ?? null;
    this.rf = r ? {
      name: r.name,
      description: r.description,
      category: r.category,
      scopeLevel: r.scopeLevel,
      sortOrder: r.sortOrder,
      incidentStage: r.incidentStage,
      assignmentHint: r.assignmentHint,
      isIncidentFlow: r.isIncidentFlow,
      isAreaScoped: r.isAreaScoped,
    } : {
      category: 'Other',
      scopeLevel: 'system',
      sortOrder: 500,
      isIncidentFlow: false,
      isAreaScoped: false,
    };
    this.roleFormOpen.set(true);
  }

  saveRole(): void {
    if (!this.canManage()) { return; }
    const body = {
      name: this.rf.name?.trim(),
      description: this.rf.description,
      category: this.rf.category || 'Other',
      scopeLevel: this.rf.scopeLevel || 'system',
      sortOrder: Number(this.rf.sortOrder || 500),
      incidentStage: this.rf.incidentStage || null,
      assignmentHint: this.rf.assignmentHint || null,
      isIncidentFlow: !!this.rf.isIncidentFlow,
      isAreaScoped: !!this.rf.isAreaScoped,
    };
    const obs = this.roleEditId ? this.http.put(`${this.base}/${this.roleEditId}`, body) : this.http.post(this.base, body);
    obs.subscribe({
      next: () => { this.roleFormOpen.set(false); this.reload(); },
      error: err => alert(err?.error?.detail ?? 'Could not save the role.'),
    });
  }

  deleteRole(r: Role, ev: Event): void {
    ev.stopPropagation();
    if (!this.canManage()) { return; }
    if (!confirm(`Delete the role "${r.name}"?`)) { return; }
    this.http.delete(`${this.base}/${r.id}`).subscribe({
      next: () => { if (this.selected()?.id === r.id) { this.selected.set(null); } this.reload(); },
      error: err => alert(err?.error?.detail ?? 'Could not delete the role.'),
    });
  }

  scopeLabel(scope: string): string {
    return ({ national: 'National', regional: 'Region', district: 'District', sector: 'Agency', stakeholder: 'Partner', system: 'System' } as Record<string, string>)[scope] ?? scope;
  }

  private groupRoles(roles: Role[]): RoleGroup[] {
    const grouped = new Map<string, Role[]>();
    roles.forEach(r => grouped.set(r.category, [...(grouped.get(r.category) ?? []), r]));
    return [...grouped.entries()].map(([category, roles]) => ({ category, count: roles.length, roles }));
  }
}
