import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Role { id: number; name: string; description: string | null; userCount: number; permissionCount: number; }
interface Permission { id: number; action: string; label: string; }
interface Group { module: string; permissions: Permission[]; }

/**
 * System Settings → Roles & Permissions. The access model that ties the system together: users
 * hold roles, roles hold permissions across every functional area. Pick a role on the left, set
 * its permissions in the matrix on the right. (Honest: Spring authorizes by role today; the matrix
 * governs the documented policy and can drive finer enforcement later.)
 */
@Component({
  selector: 'page-roles-permissions',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Roles & Permissions" icon="fa-user-shield"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'System Settings'}, {label:'Roles & Permissions'}]">
      <button class="btn-add" type="button" (click)="openRoleForm(null)"><i class="fas fa-plus"></i> Add Role</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['roles'] ?? 0" label="Roles" icon="fa-user-shield" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['permissions'] ?? 0" label="Permissions" icon="fa-key" color="#7c3aed" />
      <dmis-stat-card [value]="stats()['assignments'] ?? 0" label="Grants" icon="fa-link" color="#059669" />
    </div>

    <div class="split2">
      <!-- Roles -->
      <dmis-panel title="Roles" icon="fa-user-shield" [badge]="roles().length + ''">
        <div class="panel-body rlist">
          @for (r of roles(); track r.id) {
            <div class="rnode" [class.sel]="selected()?.id === r.id" (click)="selectRole(r)">
              <div style="flex:1;min-width:0;">
                <div class="nm">{{ r.name }}</div>
                <div class="sub">{{ r.userCount }} users · {{ r.permissionCount }} permissions</div>
                @if (r.description) { <div class="desc">{{ r.description }}</div> }
              </div>
              <div class="ctx-wrap acts">
                <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + r.name" (click)="toggleMenu(r.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                <div class="ctx-menu" [class.open]="openMenu() === r.id">
                  <a class="ctx-item" (click)="openRoleForm(r, $event)"><i class="fas fa-pen"></i> Edit</a>
                  <a class="ctx-item danger" (click)="deleteRole(r, $event)"><i class="fas fa-trash"></i> Delete</a>
                </div>
              </div>
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
              <div>
                <button class="btn-mini" (click)="setAll(true)">Select all</button>
                <button class="btn-mini" (click)="setAll(false)">Clear</button>
                <button class="btn-add" style="margin-left:6px;" [disabled]="saving() || !dirty()" (click)="save()">
                  <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> Save
                </button>
              </div>
            </div>
            <div class="matrix">
              @for (g of catalogue(); track g.module) {
                <div class="mrow">
                  <div class="mmod">
                    <label class="modtoggle"><input type="checkbox" [checked]="moduleAll(g)" [indeterminate]="moduleSome(g)" (change)="toggleModule(g, $any($event.target).checked)"> {{ g.module }}</label>
                  </div>
                  <div class="mperms">
                    @for (p of g.permissions; track p.id) {
                      <label class="perm" [class.on]="checked().has(p.id)">
                        <input type="checkbox" [checked]="checked().has(p.id)" (change)="toggle(p.id)"> {{ p.action }}
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
    .rnode { display:flex; gap:8px; border:1px solid var(--border); border-radius:9px; padding:0.55rem 0.7rem; cursor:pointer; }
    .rnode:hover { background:rgba(13,110,253,0.03); } .rnode.sel { border-color:#0d6efd; background:rgba(13,110,253,0.06); }
    .rnode .nm { font-weight:700; font-size:0.86rem; color:var(--text-dark); }
    .rnode .sub { font-size:0.7rem; color:var(--text-light); }
    .rnode .desc { font-size:0.72rem; color:var(--text-mid); margin-top:2px; }
    .rnode .acts { align-items:flex-start; }
    /* Anchor the row action menu under its trigger (the global .ctx-menu is position:fixed and detaches). */
    .ctx-menu { position:absolute; top:100%; right:0; }
    .matrix { display:flex; flex-direction:column; gap:4px; max-height:60vh; overflow-y:auto; }
    .mrow { display:grid; grid-template-columns:210px 1fr; gap:10px; align-items:center; border-bottom:1px dashed var(--border); padding:5px 0; }
    .mmod { font-size:0.8rem; font-weight:600; color:var(--text-dark); }
    .modtoggle { display:flex; align-items:center; gap:6px; cursor:pointer; }
    .mperms { display:flex; gap:6px; flex-wrap:wrap; }
    .perm { font-size:0.74rem; border:1px solid var(--border); border-radius:7px; padding:2px 9px; display:flex; align-items:center; gap:5px; cursor:pointer; color:var(--text-mid); text-transform:capitalize; }
    .perm.on { background:rgba(5,150,105,0.1); border-color:#059669; color:#059669; font-weight:600; }
    .muted { color:var(--text-light); font-size:0.84rem; padding:0.6rem 0; }
    .btn-mini { font-size:0.72rem; padding:0.25rem 0.7rem; border-radius:7px; border:1px solid var(--border); background:#fff; cursor:pointer; margin-left:4px; color:var(--text-dark); }
    .f-lbl { font-size:0.68rem; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-light); display:block; margin:0.7rem 0 3px; }
    .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1500; display:flex; align-items:flex-start; justify-content:center; padding:8vh 1rem; }
    .modal-card { background:var(--card-bg,#fff); border-radius:16px; max-width:460px; width:100%; padding:1.4rem 1.5rem; }
    .btn-cancel { border:1px solid var(--border); background:#fff; border-radius:9px; padding:0.5rem 1rem; cursor:pointer; }
  `],
})
export class RolesPermissionsComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/settings/roles';

  roles = signal<Role[]>([]);
  stats = signal<Record<string, number>>({});
  catalogue = signal<Group[]>([]);
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
  dirty = computed(() => {
    const a = this.checked(), b = this.original();
    return a.size !== b.size || [...a].some(x => !b.has(x));
  });
  protectedId = computed(() => this.roles().find(r => r.name === 'Super Admin')?.id ?? -1);

  constructor() {
    this.reload();
    this.http.get<{ catalogue: Group[] }>(`${this.base}/catalogue`).subscribe(c => this.catalogue.set(c.catalogue));
  }

  reload(): void {
    this.http.get<any>(this.base).subscribe(r => { this.roles.set(r.roles); this.stats.set(r.stats); });
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
    this.checked.update(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  moduleAll(g: Group): boolean { return g.permissions.every(p => this.checked().has(p.id)); }
  moduleSome(g: Group): boolean { const c = this.checked(); return g.permissions.some(p => c.has(p.id)) && !this.moduleAll(g); }

  toggleModule(g: Group, on: boolean): void {
    this.checked.update(s => { const n = new Set(s); g.permissions.forEach(p => on ? n.add(p.id) : n.delete(p.id)); return n; });
  }

  setAll(on: boolean): void {
    this.checked.set(on ? new Set(this.catalogue().flatMap(g => g.permissions.map(p => p.id))) : new Set());
  }

  save(): void {
    if (!this.selected()) { return; }
    this.saving.set(true);
    this.http.put(`${this.base}/${this.selected()!.id}/permissions`, { permissionIds: [...this.checked()] }).subscribe({
      next: () => { this.saving.set(false); this.original.set(new Set(this.checked())); this.reload(); },
      error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not save permissions.'); },
    });
  }

  openRoleForm(r: Role | null, ev?: Event): void {
    ev?.stopPropagation();
    this.roleEditId = r?.id ?? null;
    this.rf = r ? { name: r.name, description: r.description } : {};
    this.roleFormOpen.set(true);
  }

  saveRole(): void {
    const body = { name: this.rf.name?.trim(), description: this.rf.description };
    const obs = this.roleEditId ? this.http.put(`${this.base}/${this.roleEditId}`, body) : this.http.post(this.base, body);
    obs.subscribe({
      next: () => { this.roleFormOpen.set(false); this.reload(); },
      error: err => alert(err?.error?.detail ?? 'Could not save the role.'),
    });
  }

  deleteRole(r: Role, ev: Event): void {
    ev.stopPropagation();
    if (!confirm(`Delete the role "${r.name}"?`)) { return; }
    this.http.delete(`${this.base}/${r.id}`).subscribe({
      next: () => { if (this.selected()?.id === r.id) { this.selected.set(null); } this.reload(); },
      error: err => alert(err?.error?.detail ?? 'Could not delete the role.'),
    });
  }
}
