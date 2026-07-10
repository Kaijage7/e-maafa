import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { AuthService } from '../../core/auth.service';

interface User {
  id: number; name: string; email: string; roles: string; roleList: string[];
  emailVerifiedAt: string | null; createdAt: string;
  regionId: number | null; regionName: string | null;
  districtId: number | null; districtName: string | null;
  councilId: number | null; councilName: string | null;
  agencyId: number | null; agencyName: string | null;
  agencyClass?: string | null;
  stakeholderId: number | null; stakeholderName: string | null;
  stakeholderClass?: string | null;
  officerPosition: string | null; positionKey: string | null; seededOfficer: boolean;
  accountGroup?: string | null;
}

interface Opt { id: number; name: string; acronym?: string; }
interface Lookups { regions: Opt[]; agencies: Opt[]; stakeholders: Opt[]; }
interface RoleDetail {
  id: number; name: string; description: string | null; category: string; scopeLevel: string;
  sortOrder: number; incidentStage: string | null; assignmentHint: string | null;
  isIncidentFlow: boolean; isAreaScoped: boolean;
}
interface RoleGroup { category: string; count: number; roles: RoleDetail[]; }

/**
 * System Settings → User Management. Administers accounts and their SRS roles — the access-control
 * front door. Roles carry permission grants that drive the module hub and backend @PreAuthorize
 * authority checks. Passwords are BCrypt-hashed by the backend; the last Super Admin cannot be
 * stripped or deleted (a lockout rail).
 */
@Component({
  selector: 'page-user-management',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="User Management" icon="fa-users"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'System Settings'}, {label:'User Management'}]">
      @if (canManage()) {
        <button class="btn-add" type="button" (click)="openCreate()"><i class="fas fa-user-plus"></i> Add User</button>
      }
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['total'] ?? 0" label="All users" icon="fa-users" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['mdaFocals'] ?? 0" label="MDA focals" icon="fa-building-columns" color="#0369a1" />
      <dmis-stat-card [value]="stats()['partnerFocals'] ?? 0" label="Partner focals" icon="fa-handshake" color="#059669" />
      <dmis-stat-card [value]="stats()['nationalSystem'] ?? 0" label="National / system" icon="fa-landmark" color="#7c3aed" />
      <dmis-stat-card [value]="stats()['areaLinked'] ?? 0" label="Area seats" icon="fa-map-location-dot" color="#b45309" />
    </div>

    <div class="group-chips">
      @for (g of accountGroupOptions(); track g.code) {
        <button type="button" class="g-chip" [class.active]="fAccountGroup === g.code" (click)="setAccountGroup(g.code)">{{ g.label }}</button>
      }
    </div>

    <div class="panel-row">
      <dmis-panel title="System users" icon="fa-database" [badge]="users().length + ' shown'">
        <div class="panel-body filters">
          <input class="form-control filter-wide" placeholder="Search name, email, agency, partner…" [(ngModel)]="fSearch" (keyup.enter)="reload()">
          <select class="form-select" [(ngModel)]="fRoleCategory" (change)="reload()">
            <option value="">All role categories</option>
            @for (g of roleGroups(); track g.category) { <option [value]="g.category">{{ g.category }}</option> }
          </select>
          <select class="form-select" [(ngModel)]="fRole" (change)="reload()">
            <option value="">All roles</option>
            @for (g of roleGroups(); track g.category) {
              <optgroup [label]="g.category">
                @for (r of g.roles; track r.name) { <option [value]="r.name">{{ r.name }}</option> }
              </optgroup>
            }
          </select>
          <select class="form-select" [(ngModel)]="fRegionId" (change)="onFilterRegionChange()">
            <option [ngValue]="null">All regions</option>
            @for (r of lookups().regions; track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }
          </select>
          <select class="form-select" [(ngModel)]="fDistrictId" [disabled]="!fRegionId" (change)="onFilterDistrictChange()">
            <option [ngValue]="null">{{ fRegionId ? 'All districts' : 'Select region first' }}</option>
            @for (d of filterDistricts(); track d.id) { <option [ngValue]="d.id">{{ d.name }}</option> }
          </select>
          <select class="form-select" [(ngModel)]="fCouncilId" [disabled]="!fDistrictId" (change)="reload()">
            <option [ngValue]="null">{{ fDistrictId ? 'All councils/LGAs' : 'Select district first' }}</option>
            @for (c of filterCouncils(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
          </select>
          <button class="btn-add search-btn" type="button" title="Apply filters" aria-label="Apply filters" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
          <button class="btn-cancel clear-btn" type="button" title="Clear filters" aria-label="Clear filters" (click)="clearFilters()"><i class="fas fa-rotate-left"></i></button>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr><th>Name</th><th>Email</th><th>Group</th><th>Roles</th><th>Institution / area</th><th>Created</th>@if (canManage()) { <th></th> }</tr></thead>
            <tbody>
              @for (u of users(); track u.id) {
                <tr class="data-row">
                  <td class="r-title">
                    <div class="user-name-line">
                      <span>{{ u.name }}</span>
                      @if (u.seededOfficer) { <span class="seat-chip">seeded</span> }
                    </div>
                    @if (u.officerPosition) { <div class="position-line">{{ u.officerPosition }}</div> }
                  </td>
                  <td style="font-size:0.84rem;color:var(--text-mid);">{{ u.email }}</td>
                  <td><span class="group-badge" [attr.data-g]="u.accountGroup">{{ u.accountGroup || '—' }}</span></td>
                  <td>
                    @for (r of u.roleList; track r) { <span class="role-chip">{{ r }}</span> }
                    @if (!u.roleList.length) { <span style="color:var(--text-light);font-size:0.8rem;">no roles</span> }
                  </td>
                  <td style="font-size:0.8rem;color:var(--text-mid);">
                    @if (u.agencyName) {
                      <div><strong>{{ u.agencyName }}</strong></div>
                      @if (u.agencyClass) { <div class="position-line">{{ u.agencyClass }}</div> }
                    } @else if (u.stakeholderName) {
                      <div><strong>{{ u.stakeholderName }}</strong></div>
                      @if (u.stakeholderClass) { <div class="position-line">{{ u.stakeholderClass }}</div> }
                    } @else {
                      {{ areaLabel(u) }}
                    }
                  </td>
                  <td style="font-size:0.8rem;color:var(--text-light);">{{ u.createdAt }}</td>
                  @if (canManage()) {
                    <td style="text-align:right;white-space:nowrap;">
                      <div class="ctx-wrap">
                        <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + u.name" (click)="toggleMenu(u.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                        <div class="ctx-menu" [class.open]="openMenu() === u.id">
                          <a class="ctx-item" (click)="openEdit(u)"><i class="fas fa-pen"></i> Edit</a>
                          <a class="ctx-item warning" (click)="resetPassword(u)"><i class="fas fa-key"></i> Reset password</a>
                          <a class="ctx-item danger" (click)="remove(u)"><i class="fas fa-trash"></i> Delete</a>
                        </div>
                      </div>
                    </td>
                  }
                </tr>
              } @empty {
                <tr><td colspan="7" style="text-align:center;color:var(--text-light);padding:2rem;">No users match this group/filter.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;"><i class="fas fa-user me-2"></i>{{ editId ? 'Edit user' : 'New user' }}</h5>
          <label class="f-lbl">Full name <span class="text-danger">*</span></label>
          <input class="form-control" [(ngModel)]="m.name">
          <label class="f-lbl">Email <span class="text-danger">*</span></label>
          <input class="form-control" type="email" [(ngModel)]="m.email">
          @if (!editId) {
            <label class="f-lbl">Password <span class="text-danger">*</span></label>
            <input class="form-control" type="text" [(ngModel)]="m.password" placeholder="min 8 chars, incl. a letter & a number">
          }
          <label class="f-lbl">Roles</label>
          <div class="roles-grid">
            @for (g of roleGroups(); track g.category) {
              <div class="role-group">
                <div class="role-group-title">{{ g.category }}</div>
                <div class="role-group-options">
                  @for (r of g.roles; track r.name) {
                    <label class="role-opt" [title]="r.assignmentHint || r.description || r.name">
                      <input type="checkbox" [checked]="selectedRoles().includes(r.name)" (change)="toggleRole(r.name)">
                      <span>{{ r.name }}</span>
                      @if (r.scopeLevel !== 'system') { <span class="scope-dot">{{ scopeLabel(r.scopeLevel) }}</span> }
                    </label>
                  }
                </div>
              </div>
            }
          </div>
          @if (needsRegion() || needsAgency() || needsPartner()) {
            <div class="area-box">
              <div class="area-note"><i class="fas fa-location-dot"></i>
                @if (needsCouncil()) { District-level incident roles must be attached to their region, district and council/LGA. }
                @else if (needsRegion()) { Regional roles must be attached to their region. }
                @else if (needsAgency()) { MDA Focal accounts must be attached to their agency. }
                @else { Partner accounts must be attached to their organisation. }
              </div>
              @if (needsRegion()) {
                <div class="area-row">
                  <div class="area-fg">
                    <label class="f-lbl">Region <span class="text-danger">*</span></label>
                    <select class="form-select" [(ngModel)]="m.regionId" (change)="onRegionChange()">
                      <option [ngValue]="null">Select region…</option>
                      @for (r of lookups().regions; track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }
                    </select>
                  </div>
                  @if (needsDistrict()) {
                    <div class="area-fg">
                      <label class="f-lbl">District <span class="text-danger">*</span></label>
                      <select class="form-select" [(ngModel)]="m.districtId" [disabled]="!m.regionId" (change)="onDistrictChange()">
                        <option [ngValue]="null">{{ m.regionId ? 'Select district…' : 'Select a region first' }}</option>
                        @for (d of districts(); track d.id) { <option [ngValue]="d.id">{{ d.name }}</option> }
                      </select>
                    </div>
                    @if (needsCouncil()) {
                      <div class="area-fg">
                        <label class="f-lbl">Council / LGA <span class="text-danger">*</span></label>
                        <select class="form-select" [(ngModel)]="m.councilId" [disabled]="!m.districtId">
                          <option [ngValue]="null">{{ m.districtId ? 'Select council/LGA…' : 'Select a district first' }}</option>
                          @for (c of councils(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
                        </select>
                      </div>
                    }
                  }
                </div>
              }
              @if (needsAgency()) {
                <label class="f-lbl">Agency (MDA) <span class="text-danger">*</span></label>
                <select class="form-select" [(ngModel)]="m.agencyId">
                  <option [ngValue]="null">Select agency…</option>
                  @for (a of lookups().agencies; track a.id) {
                    <option [ngValue]="a.id">{{ a.name }}{{ a.acronym ? ' (' + a.acronym + ')' : '' }}</option>
                  }
                </select>
              }
              @if (needsPartner()) {
                <label class="f-lbl">Partner organisation <span class="text-danger">*</span></label>
                <select class="form-select" [(ngModel)]="m.stakeholderId">
                  <option [ngValue]="null">Select organisation…</option>
                  @for (s of lookups().stakeholders; track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
                </select>
              }
            </div>
          }
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button class="btn-cancel" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!canSave() || saving()" (click)="save()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ editId ? 'Save changes' : 'Create user' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .f-lbl { font-size:0.75rem; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-light); display:block; margin:0.7rem 0 3px; }
    .role-chip { font-size:0.78rem; font-weight:700; background:rgba(13,110,253,0.1); color:#0d6efd; border-radius:7px; padding:1px 8px; margin:0 4px 2px 0; display:inline-block; }
    .ctx-menu { position:absolute; top:100%; right:0; }
    .stats-row { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:10px; margin-bottom:12px; }
    .group-chips { display:flex; flex-wrap:wrap; gap:8px; margin:0 0 12px; }
    .g-chip { border:1px solid var(--border,#e2e8f0); background:#fff; color:var(--text-mid,#475569); border-radius:999px; padding:0.35rem 0.85rem; font-size:0.78rem; font-weight:700; cursor:pointer; }
    .g-chip:hover { border-color:#94a3b8; }
    .g-chip.active { background:#0f172a; color:#fff; border-color:#0f172a; }
    .group-badge { display:inline-block; font-size:0.7rem; font-weight:800; border-radius:999px; padding:2px 8px; white-space:nowrap; }
    .group-badge[data-g="MDA / Agency"] { background:rgba(3,105,161,0.12); color:#0369a1; }
    .group-badge[data-g="Partner"] { background:rgba(5,150,105,0.12); color:#059669; }
    .group-badge[data-g="Area seat"] { background:rgba(180,83,9,0.12); color:#b45309; }
    .group-badge[data-g="National / System"] { background:rgba(124,58,237,0.12); color:#7c3aed; }
    .filters { display:grid; grid-template-columns:minmax(220px,1.3fr) repeat(5,minmax(135px,1fr)) auto auto; gap:0.5rem; border-bottom:1px solid var(--border); align-items:center; }
    .filter-wide { min-width:220px; }
    .search-btn { background:#64748b; min-width:42px; }
    .clear-btn { min-width:42px; padding:0.45rem 0.7rem; }
    .user-name-line { display:flex; align-items:center; gap:6px; min-width:0; }
    .position-line { margin-top:2px; font-size:0.74rem; color:var(--text-light); font-weight:600; }
    .seat-chip { font-size:0.65rem; line-height:1; text-transform:uppercase; letter-spacing:0.3px; color:#7c3aed; background:rgba(124,58,237,0.1); border-radius:999px; padding:3px 6px; }
    .roles-grid { display:grid; grid-template-columns:1fr; gap:0.55rem; margin-top:4px; max-height:280px; overflow:auto; border:1px solid var(--border); border-radius:8px; padding:0.55rem; }
    .role-group { display:grid; gap:0.25rem; }
    .role-group-title { font-size:0.73rem; font-weight:800; color:var(--text-light); text-transform:uppercase; letter-spacing:0.35px; }
    .role-group-options { display:grid; grid-template-columns:repeat(auto-fill,minmax(190px,1fr)); gap:0.25rem 0.6rem; }
    .scope-dot { margin-left:auto; font-size:0.64rem; color:#475569; background:#f1f5f9; border-radius:999px; padding:1px 6px; }
    .area-box { border:1px solid var(--border); border-radius:8px; background:#f8fafc; padding:0.6rem 0.8rem 0.8rem; margin-top:0.9rem; }
    .area-note { font-size:0.78rem; font-weight:600; color:var(--text-mid); display:flex; align-items:center; gap:6px; }
    .area-row { display:flex; gap:0.8rem; flex-wrap:wrap; }
    .area-fg { flex:1; min-width:180px; }
    .role-opt { font-size:0.82rem; display:flex; align-items:center; gap:6px; cursor:pointer; border:1px solid transparent; border-radius:7px; padding:3px 5px; min-height:28px; }
    .role-opt:hover { border-color:#e2e8f0; background:#f8fafc; }
    .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1500; display:flex; align-items:flex-start; justify-content:center; padding:6vh 1rem; }
    .modal-card { background:var(--card-bg,#fff); border-radius:12px; max-width:720px; width:100%; padding:1.4rem 1.5rem; }
    .btn-cancel { border:1px solid var(--border); background:#fff; border-radius:8px; padding:0.5rem 1rem; cursor:pointer; }
    @media (max-width:1200px){
      .stats-row { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .filters { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .filter-wide { min-width:0; }
    }
    @media (max-width:767px){
      .stats-row { grid-template-columns:1fr 1fr; }
      .filters { grid-template-columns:1fr; }
      .role-group-options { grid-template-columns:1fr; }
    }
  `],
})
export class UserManagementComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = '/api/v1/settings/users';

  users = signal<User[]>([]);
  roles = signal<string[]>([]);
  roleDetails = signal<RoleDetail[]>([]);
  roleGroups = signal<RoleGroup[]>([]);
  stats = signal<Record<string, number>>({});
  accountGroupOptions = signal<{ code: string; label: string }[]>([
    { code: 'institution', label: 'MDA + Partner focals (M&E feeders)' },
    { code: 'mda', label: 'MDA / Agency focals' },
    { code: 'partner', label: 'Partners' },
    { code: 'national', label: 'National / System' },
    { code: 'area', label: 'Area seats (RC/RAS/DED/DAS…)' },
    { code: 'all', label: 'All accounts' },
  ]);
  lookups = signal<Lookups>({ regions: [], agencies: [], stakeholders: [] });
  districts = signal<Opt[]>([]);
  councils = signal<Opt[]>([]);
  filterDistricts = signal<Opt[]>([]);
  filterCouncils = signal<Opt[]>([]);
  formOpen = signal(false);
  saving = signal(false);
  selectedRoles = signal<string[]>([]);
  openMenu = signal<number | null>(null);

  /** Default to institution focals so ~900 area seats do not drown M&E feeders. */
  fAccountGroup = 'institution';
  fSearch = ''; fRole = ''; fRoleCategory = ''; fScopeLevel = ''; fSeeded = '';
  fRegionId: number | null = null;
  fDistrictId: number | null = null;
  fCouncilId: number | null = null;
  editId: number | null = null;
  m: any = {};

  constructor() { this.reload(); }

  canManage = computed(() => this.auth.hasPermission('user_management.manage'));

  setAccountGroup(code: string): void {
    this.fAccountGroup = code || 'all';
    this.reload();
  }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fSearch.trim()) { q.set('search', this.fSearch.trim()); }
    if (this.fRole) { q.set('role', this.fRole); }
    if (this.fRoleCategory) { q.set('roleCategory', this.fRoleCategory); }
    if (this.fScopeLevel) { q.set('scopeLevel', this.fScopeLevel); }
    if (this.fRegionId) { q.set('regionId', String(this.fRegionId)); }
    if (this.fDistrictId) { q.set('districtId', String(this.fDistrictId)); }
    if (this.fCouncilId) { q.set('councilId', String(this.fCouncilId)); }
    if (this.fSeeded) { q.set('seeded', this.fSeeded); }
    if (this.fAccountGroup && this.fAccountGroup !== 'all') {
      q.set('accountGroup', this.fAccountGroup);
    }
    this.http.get<any>(`${this.base}?${q}`).subscribe(r => {
      this.users.set(r.users);
      this.roles.set(r.roles);
      this.roleDetails.set(r.roleDetails ?? []);
      this.roleGroups.set(r.roleGroups ?? this.groupRoles(r.roleDetails ?? []));
      this.stats.set(r.stats);
      if (r.accountGroups?.length) {
        this.accountGroupOptions.set(r.accountGroups);
      }
      if (r.lookups) { this.lookups.set(r.lookups); }
    });
  }

  // ── role → attachment requirements, driven by Settings role metadata ──
  private selectedRoleMeta(): RoleDetail[] {
    const selected = new Set(this.selectedRoles());
    return this.roleDetails().filter(r => selected.has(r.name));
  }
  needsDistrict(): boolean { return this.selectedRoleMeta().some(r => r.scopeLevel === 'district'); }
  needsCouncil(): boolean { return this.needsDistrict(); }
  needsRegion(): boolean { return this.needsDistrict() || this.selectedRoleMeta().some(r => r.scopeLevel === 'regional'); }
  needsAgency(): boolean { return this.selectedRoleMeta().some(r => r.scopeLevel === 'sector' || r.name === 'MDA Focal'); }
  needsPartner(): boolean { return this.selectedRoleMeta().some(r => r.scopeLevel === 'stakeholder' || r.name === 'Partners'); }

  areaLabel(u: User): string {
    if (u.councilName) { return `${u.regionName ?? '?'} / ${u.districtName ?? '?'} / ${u.councilName}`; }
    if (u.districtName) { return `${u.regionName ?? '?'} / ${u.districtName}`; }
    if (u.regionName) { return u.regionName; }
    if (u.agencyName) { return u.agencyName; }
    if (u.stakeholderName) { return u.stakeholderName; }
    return '—';
  }

  canSave(): boolean {
    const base = !!this.m.name?.trim() && !!this.m.email?.trim() && (!!this.editId || !!this.m.password?.trim());
    // an area/agency/partner role without its attachment produces a broken account (sees nothing,
    // cannot action its stage, bypasses partner self-identity) — block it at the source
    return base
      && (!this.needsRegion() || !!this.m.regionId)
      && (!this.needsDistrict() || !!this.m.districtId)
      && (!this.needsCouncil() || !!this.m.councilId)
      && (!this.needsAgency() || !!this.m.agencyId)
      && (!this.needsPartner() || !!this.m.stakeholderId);
  }

  toggleRole(r: string): void {
    this.selectedRoles.update(list => list.includes(r) ? list.filter(x => x !== r) : [...list, r]);
  }

  onRegionChange(): void {
    this.m.districtId = null;
    this.m.councilId = null;
    this.councils.set([]);
    this.loadDistricts(this.m.regionId);
  }

  onDistrictChange(): void {
    this.m.councilId = null;
    this.loadCouncils(this.m.districtId);
  }

  onFilterRegionChange(): void {
    this.fDistrictId = null;
    this.fCouncilId = null;
    this.filterCouncils.set([]);
    if (!this.fRegionId) {
      this.filterDistricts.set([]);
      this.reload();
      return;
    }
    this.http.get<Opt[]>(`/api/v1/portal/regions/${this.fRegionId}/districts`).subscribe({
      next: ds => { this.filterDistricts.set(ds ?? []); this.reload(); },
      error: () => { this.filterDistricts.set([]); this.reload(); },
    });
  }

  onFilterDistrictChange(): void {
    this.fCouncilId = null;
    if (!this.fDistrictId) {
      this.filterCouncils.set([]);
      this.reload();
      return;
    }
    this.http.get<any>(`/api/v1/settings/locations/districts/${this.fDistrictId}/councils`).subscribe({
      next: r => { this.filterCouncils.set(r.councils ?? []); this.reload(); },
      error: () => { this.filterCouncils.set([]); this.reload(); },
    });
  }

  clearFilters(): void {
    this.fSearch = ''; this.fRole = ''; this.fRoleCategory = ''; this.fScopeLevel = ''; this.fSeeded = '';
    this.fAccountGroup = 'institution';
    this.fRegionId = null; this.fDistrictId = null; this.fCouncilId = null; this.filterDistricts.set([]); this.filterCouncils.set([]);
    this.reload();
  }

  private loadDistricts(regionId: number | null): void {
    if (!regionId) { this.districts.set([]); return; }
    this.http.get<Opt[]>(`/api/v1/portal/regions/${regionId}/districts`).subscribe({
      next: ds => this.districts.set(ds ?? []),
      error: () => this.districts.set([]),
    });
  }

  private loadCouncils(districtId: number | null): void {
    if (!districtId) { this.councils.set([]); return; }
    this.http.get<any>(`/api/v1/settings/locations/districts/${districtId}/councils`).subscribe({
      next: r => this.councils.set(r.councils ?? []),
      error: () => this.councils.set([]),
    });
  }

  openCreate(): void {
    if (!this.canManage()) { return; }
    this.editId = null;
    this.m = { regionId: null, districtId: null, councilId: null, agencyId: null, stakeholderId: null };
    this.selectedRoles.set([]);
    this.districts.set([]);
    this.councils.set([]);
    this.formOpen.set(true);
  }

  openEdit(u: User): void {
    if (!this.canManage()) { return; }
    this.editId = u.id;
    this.m = {
      name: u.name, email: u.email,
      regionId: u.regionId ?? null, districtId: u.districtId ?? null, councilId: u.councilId ?? null,
      agencyId: u.agencyId ?? null, stakeholderId: u.stakeholderId ?? null,
    };
    this.selectedRoles.set([...u.roleList]);
    this.districts.set([]);
    this.councils.set([]);
    this.loadDistricts(u.regionId ?? null);
    this.loadCouncils(u.districtId ?? null);
    this.formOpen.set(true);
  }

  /** Attachment payload — only roles that demand a link keep their id; the rest are cleared explicitly. */
  private areaPayload(): Record<string, number | null> {
    return {
      regionId: this.needsRegion() ? this.m.regionId ?? null : null,
      districtId: this.needsDistrict() ? this.m.districtId ?? null : null,
      councilId: this.needsCouncil() ? this.m.councilId ?? null : null,
      agencyId: this.needsAgency() ? this.m.agencyId ?? null : null,
      stakeholderId: this.needsPartner() ? this.m.stakeholderId ?? null : null,
    };
  }

  save(): void {
    if (!this.canManage()) { return; }
    this.saving.set(true);
    if (this.editId) {
      // update name/email/area, then replace roles
      this.http.put(`${this.base}/${this.editId}`, {
        name: this.m.name, email: this.m.email, ...this.areaPayload(),
      }).subscribe({
        next: () => this.http.put(`${this.base}/${this.editId}/roles`, { roles: this.selectedRoles() }).subscribe({
          next: () => { this.saving.set(false); this.formOpen.set(false); this.reload(); },
          error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not update roles.'); this.reload(); },
        }),
        error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not update the user.'); },
      });
    } else {
      this.http.post(this.base, {
        name: this.m.name, email: this.m.email, password: this.m.password, roles: this.selectedRoles(),
        ...this.areaPayload(),
      }).subscribe({
        next: () => { this.saving.set(false); this.formOpen.set(false); this.reload(); },
        error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not create the user.'); },
      });
    }
  }

  resetPassword(u: User): void {
    if (!this.canManage()) { return; }
    const pw = prompt(`Set a new password for ${u.name} (min 8 chars, incl. a letter and a number):`);
    if (!pw) { return; }
    this.http.post(`${this.base}/${u.id}/password`, { password: pw }).subscribe({
      next: () => alert('Password reset.'),
      error: err => alert(err?.error?.detail ?? 'Could not reset the password.'),
    });
  }

  remove(u: User): void {
    if (!this.canManage()) { return; }
    if (!confirm(`Delete the account "${u.name}" (${u.email})?`)) { return; }
    this.http.delete(`${this.base}/${u.id}`).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.error?.detail ?? 'Could not delete the user.'),
    });
  }

  toggleMenu(id: number, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }

  scopeLabel(scope: string): string {
    return ({ national: 'National', regional: 'Region', district: 'District/LGA', sector: 'Agency', stakeholder: 'Partner' } as Record<string, string>)[scope] ?? scope;
  }

  private groupRoles(details: RoleDetail[]): RoleGroup[] {
    const grouped = new Map<string, RoleDetail[]>();
    details.forEach(r => grouped.set(r.category, [...(grouped.get(r.category) ?? []), r]));
    return [...grouped.entries()].map(([category, roles]) => ({ category, count: roles.length, roles }));
  }
}
