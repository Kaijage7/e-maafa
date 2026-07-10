import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { AuthService } from '../../core/auth.service';

interface Region { id: number; name: string; regionCode: string | null; countryPart: string; population: number | null; districtCount: number; councilCount: number; wardCount: number; }
interface District { id: number; name: string; districtCode: string | null; countryPart: string; population: number | null; councilCount: number; wardCount: number; }
interface Council { id: number; name: string; councilCode: string | null; countryPart: string; population: number | null; isActive: boolean; wardCount: number; userCount: number; }
interface Ward { id: number; name: string; wardCode: string | null; isActive: boolean; }

/**
 * System Settings → Location Management. A regions → districts → councils/LGAs → wards column navigator for the
 * Tanzania administrative hierarchy that every operational module geo-references (incidents,
 * assessments, anticipatory plans, declarations, early warnings, the Sendai repository). Select a
 * region to load its districts, a district to load its councils/LGAs, then a council to load wards.
 * Add / edit / delete at each level, with the hierarchy delete-guards surfaced from the API.
 */
@Component({
  selector: 'page-location-management',
  standalone: true,
  imports: [FormsModule, DecimalPipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Location Management" icon="fa-map-location-dot"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'System Settings'}, {label:'Location Management'}]" />

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['regions'] ?? 0" label="Regions" icon="fa-map" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['mainlandRegions'] ?? 0" label="Mainland Regions" icon="fa-map-pin" color="#7c3aed" />
      <dmis-stat-card [value]="stats()['councils'] ?? 0" label="Councils (LGAs)" icon="fa-building-columns" color="#d97706" />
      <dmis-stat-card [value]="stats()['mainlandCouncils'] ?? 0" label="Mainland LGAs" icon="fa-landmark" color="#0891b2" />
      <dmis-stat-card [value]="stats()['wards'] ?? 0" label="Wards" icon="fa-location-dot" color="#059669" />
    </div>

    <div class="cols">
      <!-- Regions -->
      <dmis-panel title="Regions" icon="fa-map" [badge]="regions().length + ''">
        <div class="panel-body lvl">
          @for (r of regions(); track r.id) {
            <div class="node" [class.sel]="region()?.id === r.id" (click)="selectRegion(r)">
              <div class="nm">{{ r.name }} @if (r.regionCode) { <span class="code">{{ r.regionCode }}</span> }</div>
              <div class="sub">{{ r.districtCount }} districts · {{ r.councilCount }} councils · {{ r.wardCount }} wards @if (r.population) { · pop {{ r.population | number }} }</div>
              @if (canManage()) {
                <div class="acts">
                  <div class="ctx-wrap">
                    <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + r.name" (click)="toggleMenu('region:' + r.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                    <div class="ctx-menu" [class.open]="openMenu() === 'region:' + r.id">
                      <a class="ctx-item" (click)="edit('region', r, $event)"><i class="fas fa-pen"></i> Edit</a>
                      <a class="ctx-item danger" (click)="del('regions', r.id, $event)"><i class="fas fa-trash"></i> Delete</a>
                    </div>
                  </div>
                </div>
              }
            </div>
          } @empty { <div class="muted">No regions.</div> }
          @if (canManage()) { <button class="addbtn" (click)="add('region')"><i class="fas fa-plus"></i> Add region</button> }
        </div>
      </dmis-panel>

      <!-- Districts -->
      <dmis-panel [title]="region() ? region()!.name + ' — districts' : 'Districts'" icon="fa-map-pin" [badge]="districts().length + ''">
        <div class="panel-body lvl">
          @if (!region()) { <div class="muted">Select a region.</div> }
          @else {
            @for (d of districts(); track d.id) {
              <div class="node" [class.sel]="district()?.id === d.id" (click)="selectDistrict(d)">
                <div class="nm">{{ d.name }} @if (d.districtCode) { <span class="code">{{ d.districtCode }}</span> }</div>
                <div class="sub">{{ d.councilCount }} councils · {{ d.wardCount }} wards @if (d.population) { · pop {{ d.population | number }} }</div>
                @if (canManage()) {
                  <div class="acts">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + d.name" (click)="toggleMenu('district:' + d.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === 'district:' + d.id">
                        <a class="ctx-item" (click)="edit('district', d, $event)"><i class="fas fa-pen"></i> Edit</a>
                        <a class="ctx-item danger" (click)="del('districts', d.id, $event)"><i class="fas fa-trash"></i> Delete</a>
                      </div>
                    </div>
                  </div>
                }
              </div>
            } @empty { <div class="muted">No districts yet.</div> }
            @if (canManage()) { <button class="addbtn" (click)="add('district')"><i class="fas fa-plus"></i> Add district</button> }
          }
        </div>
      </dmis-panel>

      <!-- Councils / LGAs -->
      <dmis-panel [title]="district() ? district()!.name + ' — councils/LGAs' : 'Councils / LGAs'" icon="fa-building-columns" [badge]="councils().length + ''">
        <div class="panel-body lvl">
          @if (!district()) { <div class="muted">Select a district.</div> }
          @else {
            @for (c of councils(); track c.id) {
              <div class="node" [class.sel]="council()?.id === c.id" (click)="selectCouncil(c)">
                <div class="nm">{{ c.name }} @if (c.councilCode) { <span class="code">{{ c.councilCode }}</span> }
                  @if (!c.isActive) { <span class="code" style="background:#fee2e2;color:#dc2626;">inactive</span> }</div>
                <div class="sub">{{ c.wardCount }} wards · {{ c.userCount }} users @if (c.population) { · pop {{ c.population | number }} }</div>
                @if (canManage()) {
                  <div class="acts">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + c.name" (click)="toggleMenu('council:' + c.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === 'council:' + c.id">
                        <a class="ctx-item" (click)="edit('council', c, $event)"><i class="fas fa-pen"></i> Edit</a>
                        <a class="ctx-item danger" (click)="del('councils', c.id, $event)"><i class="fas fa-trash"></i> Delete</a>
                      </div>
                    </div>
                  </div>
                }
              </div>
            } @empty { <div class="muted">No councils/LGAs yet.</div> }
            @if (canManage()) { <button class="addbtn" (click)="add('council')"><i class="fas fa-plus"></i> Add council/LGA</button> }
          }
        </div>
      </dmis-panel>

      <!-- Wards -->
      <dmis-panel [title]="council() ? council()!.name + ' — wards' : 'Wards'" icon="fa-location-dot" [badge]="wards().length + ''">
        <div class="panel-body lvl">
          @if (!council()) { <div class="muted">Select a council/LGA.</div> }
          @else {
            @for (w of wards(); track w.id) {
              <div class="node">
                <div class="nm">{{ w.name }} @if (w.wardCode) { <span class="code">{{ w.wardCode }}</span> }
                  @if (!w.isActive) { <span class="code" style="background:#fee2e2;color:#dc2626;">inactive</span> }</div>
                @if (canManage()) {
                  <div class="acts">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + w.name" (click)="toggleMenu('ward:' + w.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === 'ward:' + w.id">
                        <a class="ctx-item" (click)="edit('ward', w, $event)"><i class="fas fa-pen"></i> Edit</a>
                        <a class="ctx-item danger" (click)="del('wards', w.id, $event)"><i class="fas fa-trash"></i> Delete</a>
                      </div>
                    </div>
                  </div>
                }
              </div>
            } @empty { <div class="muted">No wards yet.</div> }
            @if (canManage()) { <button class="addbtn" (click)="add('ward')"><i class="fas fa-plus"></i> Add ward</button> }
          }
        </div>
      </dmis-panel>
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;">{{ editId ? 'Edit' : 'New' }} {{ level() }}</h5>
          <label class="f-lbl">Name <span class="text-danger">*</span></label>
          <input class="form-control" [(ngModel)]="m.name">
          <label class="f-lbl">{{ level() === 'ward' ? 'Ward code' : (level() === 'council' ? 'Council/LGA code' : (level() === 'district' ? 'District code' : 'Region code')) }}</label>
          <input class="form-control" [(ngModel)]="m.code">
          @if (level() === 'region') {
            <label class="f-lbl">Country part</label>
            <select class="form-select" [(ngModel)]="m.countryPart">
              <option value="mainland">Tanzania Mainland</option>
              <option value="zanzibar">Zanzibar</option>
            </select>
          }
          @if (level() !== 'ward') {
            <label class="f-lbl">Population</label>
            <input type="number" min="0" class="form-control" [(ngModel)]="m.population">
          }
          @if ((level() === 'ward' || level() === 'council') && editId) {
            <label class="f-lbl" style="display:flex;align-items:center;gap:8px;"><input type="checkbox" [(ngModel)]="m.isActive" style="width:auto;"> Active</label>
          }
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button class="btn-cancel" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!m.name?.trim() || saving()" (click)="save()">{{ editId ? 'Save' : 'Add' }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .cols { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; align-items:start; }
    .lvl { display:flex; flex-direction:column; gap:6px; max-height:62vh; overflow-y:auto; }
    .node { border:1px solid var(--border); border-radius:9px; padding:0.5rem 0.7rem; cursor:pointer; position:relative; }
    .node:hover { background:rgba(13,110,253,0.03); } .node.sel { border-color:#0d6efd; background:rgba(13,110,253,0.06); }
    .node .nm { font-weight:600; font-size:0.86rem; color:var(--text-dark); }
    .node .sub { font-size:0.8rem; color:var(--text-light); margin-top:1px; }
    .code { font-size:0.78rem; font-weight:700; background:rgba(124,58,237,0.1); color:#7c3aed; border-radius:6px; padding:1px 6px; margin-left:4px; }
    .node .acts { position:absolute; right:8px; top:8px; display:flex; gap:2px; }
    /* Anchor the row action menu under its trigger (the global .ctx-menu is position:fixed and detaches). */
    .ctx-menu { position:absolute; top:100%; right:0; }
    .addbtn { border:1px dashed var(--border); background:transparent; border-radius:9px; padding:0.45rem; cursor:pointer; color:var(--text-mid); font-size:0.8rem; margin-top:4px; }
    .muted { color:var(--text-light); font-size:0.82rem; padding:0.6rem 0; }
    .f-lbl { font-size:0.75rem; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-light); display:block; margin:0.7rem 0 3px; }
    .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1500; display:flex; align-items:flex-start; justify-content:center; padding:8vh 1rem; }
    .modal-card { background:var(--card-bg,#fff); border-radius:12px; max-width:440px; width:100%; padding:1.4rem 1.5rem; }
    .btn-cancel { border:1px solid var(--border); background:#fff; border-radius:8px; padding:0.5rem 1rem; cursor:pointer; }
    @media (max-width:1280px){ .cols { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width:760px){ .cols { grid-template-columns:1fr; } }
  `],
})
export class LocationManagementComponent {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private base = '/api/v1/settings/locations';

  regions = signal<Region[]>([]);
  districts = signal<District[]>([]);
  councils = signal<Council[]>([]);
  wards = signal<Ward[]>([]);
  stats = signal<Record<string, number>>({});
  region = signal<Region | null>(null);
  district = signal<District | null>(null);
  council = signal<Council | null>(null);

  formOpen = signal(false);
  saving = signal(false);
  level = signal<'region' | 'district' | 'council' | 'ward'>('region');
  editId: number | null = null;
  m: any = {};

  // Composite string key ('region:'+id / 'district:'+id / 'council:'+id / 'ward:'+id) so the tables share one menu signal
  // while staying unique across entity types.
  openMenu = signal<string | null>(null);
  toggleMenu(id: string, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }

  constructor() { this.reload(); }

  canManage = computed(() => this.auth.hasPermission('location_management.manage'));

  reload(): void {
    this.http.get<any>(this.base).subscribe(r => { this.regions.set(r.regions); this.stats.set(r.stats); });
  }

  selectRegion(r: Region): void {
    this.region.set(r); this.district.set(null); this.council.set(null); this.councils.set([]); this.wards.set([]);
    this.http.get<any>(`${this.base}/regions/${r.id}/districts`).subscribe(d => this.districts.set(d.districts));
  }

  selectDistrict(d: District): void {
    this.district.set(d); this.council.set(null); this.wards.set([]);
    this.http.get<any>(`${this.base}/districts/${d.id}/councils`).subscribe(c => this.councils.set(c.councils));
  }

  selectCouncil(c: Council): void {
    this.council.set(c);
    this.http.get<any>(`${this.base}/councils/${c.id}/wards`).subscribe(w => this.wards.set(w.wards));
  }

  add(level: 'region' | 'district' | 'council' | 'ward'): void {
    if (!this.canManage()) { return; }
    if (level === 'district' && !this.region()) { return; }
    if (level === 'council' && !this.district()) { return; }
    if (level === 'ward' && !this.council()) { return; }
    this.level.set(level); this.editId = null; this.m = { isActive: true, countryPart: 'mainland' }; this.formOpen.set(true);
  }

  edit(level: 'region' | 'district' | 'council' | 'ward', item: any, ev: Event): void {
    ev.stopPropagation();
    if (!this.canManage()) { return; }
    this.level.set(level); this.editId = item.id;
    this.m = {
      name: item.name,
      code: item.regionCode ?? item.districtCode ?? item.councilCode ?? item.wardCode,
      population: item.population,
      countryPart: item.countryPart ?? 'mainland',
      isActive: item.isActive ?? true,
    };
    this.formOpen.set(true);
  }

  save(): void {
    if (!this.canManage()) { return; }
    this.saving.set(true);
    const lvl = this.level();
    const codeKey = lvl === 'region' ? 'regionCode' : lvl === 'district' ? 'districtCode' : lvl === 'council' ? 'councilCode' : 'wardCode';
    const body: any = { name: this.m.name, [codeKey]: this.m.code, countryPart: this.m.countryPart, population: this.m.population, isActive: this.m.isActive };
    let url: string;
    let method: 'post' | 'put' = this.editId ? 'put' : 'post';
    if (this.editId) {
      url = `${this.base}/${lvl}s/${this.editId}`;
    } else if (lvl === 'region') {
      url = `${this.base}/regions`;
    } else if (lvl === 'district') {
      url = `${this.base}/regions/${this.region()!.id}/districts`;
    } else if (lvl === 'council') {
      url = `${this.base}/districts/${this.district()!.id}/councils`;
    } else {
      url = `${this.base}/councils/${this.council()!.id}/wards`;
    }
    (method === 'put' ? this.http.put(url, body) : this.http.post(url, body)).subscribe({
      next: () => { this.saving.set(false); this.formOpen.set(false); this.afterChange(lvl); },
      error: err => { this.saving.set(false); alert(err?.error?.detail ?? 'Could not save.'); },
    });
  }

  del(kind: 'regions' | 'districts' | 'councils' | 'wards', id: number, ev: Event): void {
    ev.stopPropagation();
    if (!this.canManage()) { return; }
    if (!confirm('Delete this ' + kind.slice(0, -1) + '?')) { return; }
    this.http.delete(`${this.base}/${kind}/${id}`).subscribe({
      next: () => this.afterChange(kind === 'regions' ? 'region' : kind === 'districts' ? 'district' : kind === 'councils' ? 'council' : 'ward'),
      error: err => alert(err?.error?.detail ?? 'Could not delete.'),
    });
  }

  /**
   * Refresh the affected levels after a change WITHOUT dropping the current selection
   * (selectRegion/selectDistrict reset child selection, which would lose the user's place).
   */
  private afterChange(level: 'region' | 'district' | 'council' | 'ward'): void {
    this.reload(); // region registry + counts
    const reg = this.region();
    const dist = this.district();
    const council = this.council();
    if (reg) {
      this.http.get<any>(`${this.base}/regions/${reg.id}/districts`).subscribe(d => this.districts.set(d.districts));
    }
    if (dist) {
      this.http.get<any>(`${this.base}/districts/${dist.id}/councils`).subscribe(c => this.councils.set(c.councils));
    }
    if ((level === 'ward' || level === 'council') && council) {
      this.http.get<any>(`${this.base}/councils/${council.id}/wards`).subscribe(w => this.wards.set(w.wards));
    }
  }
}
