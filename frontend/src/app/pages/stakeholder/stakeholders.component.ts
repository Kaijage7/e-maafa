import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { RegionDistrictPickerComponent } from '../../shell/region-district-picker.component';

interface Stakeholder {
  id: number; name: string; organization: string; type: string; sector: string;
  email: string; phone: string; region: string; district: string;
  contactPersonName: string; contactPersonTitle: string;
  isActive: boolean; isVerified: boolean; verifiedAt: string | null;
  userId: number | null; linkedUserName: string | null; linkedUserEmail: string | null;
}

/**
 * Stakeholder Portal — partner directory + verification workflow over the shared
 * stakeholders table (admin/stakeholders/index reproduction): stats, search/filters,
 * register drawer, and the Verify / Revoke action that drives is_verified/verified_at.
 */
@Component({
  selector: 'page-stakeholders',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, RegionDistrictPickerComponent],
  template: `
    <dmis-page-header title="Stakeholder Portal" icon="fa-handshake"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Stakeholder Portal'}]">
      <button class="btn-add" type="button" (click)="openCreate()"><i class="fas fa-plus"></i> Register Stakeholder</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Stakeholders" icon="fa-users" color="#dc2626" />
      <dmis-stat-card [value]="stats().verified" label="Verified Partners" icon="fa-check-double" color="#10b981" />
      <dmis-stat-card [value]="stats().pending" label="Pending Verification" icon="fa-hourglass-half" color="#f59e0b" />
      <dmis-stat-card [value]="stats().active" label="Active Partners" icon="fa-handshake" color="#3b82f6" />
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search by name, organization, email, phone..." [value]="search()" (input)="search.set($any($event.target).value)"></div>
      <select [value]="type()" (change)="type.set($any($event.target).value)">
        <option value="">All Types</option>
        @for (t of types(); track t) { <option [value]="t">{{ t }}</option> }
      </select>
      <select [value]="verifiedF()" (change)="verifiedF.set($any($event.target).value)">
        <option value="">All Statuses</option><option value="true">Verified</option><option value="false">Pending</option>
      </select>
    </div>

    <div class="panel-row" style="animation-delay:.3s;">
      <dmis-panel title="Partner Directory" icon="fa-database" [badge]="rows().length + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (filtered().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr><th>Organization</th><th>Type</th><th>Contact</th><th>Location</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  @for (s of filtered(); track s.id) {
                    <tr class="data-row">
                      <td><div class="r-title">{{ s.organization || s.name }}</div>
                        <div class="r-subtitle">{{ s.contactPersonName || s.name }}{{ s.contactPersonTitle ? ' · ' + s.contactPersonTitle : '' }}</div></td>
                      <td><span class="r-badge" style="background:rgba(0,51,102,0.08);color:#003366;">{{ s.type || '-' }}</span></td>
                      <td style="font-size:0.78rem;color:var(--text-mid);">
                        @if (s.phone) { <div>{{ s.phone }}</div> } @if (s.email) { <div class="r-subtitle">{{ s.email }}</div> }
                      </td>
                      <td style="font-size:0.82rem;color:var(--text-mid);">{{ s.region || '-' }}{{ s.district ? ' · ' + s.district : '' }}</td>
                      <td>
                        <span class="r-badge {{ s.isVerified ? 'badge-approved' : 'badge-pending' }}">{{ s.isVerified ? 'Verified' : 'Pending' }}</span>
                        @if (!s.isActive) { <span class="r-badge badge-rejected" style="margin-left:0.25rem;">Inactive</span> }
                        @if (s.userId) { <span class="r-badge badge-approved" style="margin-left:0.25rem;" [title]="s.linkedUserEmail || ''"><i class="fas fa-link"></i> Login</span> }
                      </td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(s.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === s.id">
                            @if (!s.isVerified) { <a class="ctx-item success" (click)="verify(s, true)"><i class="fas fa-check-double"></i> Verify Partner</a> }
                            @else { <a class="ctx-item" (click)="verify(s, false)"><i class="fas fa-undo"></i> Revoke Verification</a> }
                            <a class="ctx-item" (click)="toggleActive(s)"><i class="fas" [class.fa-ban]="s.isActive" [class.fa-check]="!s.isActive"></i> {{ s.isActive ? 'Deactivate' : 'Activate' }}</a>
                            <a class="ctx-item" (click)="linkLogin(s)"><i class="fas fa-link"></i> {{ s.userId ? 'Change / unlink login' : 'Link login (enable donations)' }}</a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else { <div class="empty-state"><i class="fas fa-handshake"></i>No stakeholders registered yet.</div> }
        </div>
      </dmis-panel>
    </div>

    <!-- Register drawer -->
    @if (createOpen()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1500;display:flex;align-items:center;justify-content:center;padding:1rem;" (click)="createOpen.set(false)">
        <div style="background:#fff;border-radius:16px;max-width:620px;width:100%;padding:1.3rem 1.4rem;" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin-bottom:1rem;">Register Stakeholder</h5>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
            <input class="form-control" placeholder="Organization *" [value]="fOrg()" (input)="fOrg.set($any($event.target).value)">
            <input class="form-control" placeholder="Contact name *" [value]="fName()" (input)="fName.set($any($event.target).value)">
            <select class="form-control" [value]="fType()" (change)="fType.set($any($event.target).value)">
              @for (t of allTypes; track t) { <option [value]="t">{{ t }}</option> }
            </select>
            <input class="form-control" placeholder="Sector (e.g. Health, WASH)" [value]="fSector()" (input)="fSector.set($any($event.target).value)">
            <input class="form-control" placeholder="Email" [value]="fEmail()" (input)="fEmail.set($any($event.target).value)">
            <input class="form-control" placeholder="Phone" [value]="fPhone()" (input)="fPhone.set($any($event.target).value)">
            <div style="grid-column:1 / -1;">
              <dmis-region-district [showCouncil]="false"
                [region]="fRegion()" (regionChange)="fRegion.set($event)"
                [district]="fDistrict()" (districtChange)="fDistrict.set($event)" />
            </div>
          </div>
          @if (error()) { <div style="color:#dc2626;font-size:0.82rem;margin-top:0.7rem;">{{ error() }}</div> }
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1rem;">
            <button type="button" style="border:1px solid var(--border);background:#fff;border-radius:9px;padding:0.5rem 1rem;cursor:pointer;" (click)="createOpen.set(false)">Cancel</button>
            <button class="btn-add" type="button" [disabled]="!fOrg().trim() || !fName().trim() || saving()" (click)="save()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> {{ saving() ? 'Saving…' : 'Register' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class StakeholdersComponent {
  private http = inject(HttpClient);
  rows = signal<Stakeholder[]>([]);
  stats = signal({ total: 0, verified: 0, pending: 0, active: 0 });
  search = signal(''); type = signal(''); verifiedF = signal('');
  openMenu = signal<number | null>(null);
  createOpen = signal(false);
  saving = signal(false);
  error = signal('');
  allTypes = ['Government', 'NGO', 'Private', 'International', 'Community', 'Individual'];
  fOrg = signal(''); fName = signal(''); fType = signal('NGO'); fSector = signal('');
  fEmail = signal(''); fPhone = signal(''); fRegion = signal(''); fDistrict = signal('');

  constructor() { this.reload(); }

  types = computed(() => [...new Set(this.rows().map(s => s.type).filter(Boolean))]);

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const t = this.type();
    const v = this.verifiedF();
    return this.rows().filter(s => {
      const text = `${s.name} ${s.organization} ${s.email} ${s.phone}`.toLowerCase();
      return (!q || text.includes(q)) && (!t || s.type === t)
        && (!v || String(s.isVerified) === v);
    });
  });

  reload(): void {
    this.http.get<{ stakeholders: Stakeholder[]; stats: any }>('/api/v1/stakeholders')
      .subscribe(r => { this.rows.set(r.stakeholders); this.stats.set(r.stats); });
  }

  openCreate(): void {
    this.fOrg.set(''); this.fName.set(''); this.fType.set('NGO'); this.fSector.set('');
    this.fEmail.set(''); this.fPhone.set(''); this.fRegion.set(''); this.fDistrict.set('');
    this.error.set('');
    this.createOpen.set(true);
  }

  save(): void {
    this.saving.set(true);
    this.http.post('/api/v1/stakeholders', {
      organization: this.fOrg().trim(), name: this.fName().trim(), type: this.fType(),
      sector: this.fSector() || null, email: this.fEmail() || null, phone: this.fPhone() || null,
      region: this.fRegion() || null, district: this.fDistrict() || null,
    }).subscribe({
      next: () => { this.saving.set(false); this.createOpen.set(false); this.reload(); },
      error: e => { this.saving.set(false); this.error.set(e?.error?.message || 'Could not register.'); },
    });
  }

  /** Link (or unlink) a login account to this partner so they can donate from Open Needs. */
  linkLogin(s: Stakeholder): void {
    this.openMenu.set(null);
    const email = window.prompt(
      `Link a login to "${s.name}".\nEnter the user account's email (leave blank to unlink):`,
      s.linkedUserEmail ?? '');
    if (email === null) { return; }
    this.http.put<any>(`/api/v1/stakeholders/${s.id}/link-user`, { email: email.trim() }).subscribe({
      next: r => { this.reload(); window.alert(r?.message ?? 'Updated.'); },
      error: e => window.alert(e?.error?.message ?? e?.error?.detail ?? 'Could not link the login.'),
    });
  }

  verify(s: Stakeholder, verified: boolean): void {
    this.http.put(`/api/v1/stakeholders/${s.id}/verify`, { verified }).subscribe(() => this.reload());
  }

  toggleActive(s: Stakeholder): void {
    this.http.put(`/api/v1/stakeholders/${s.id}`, { isActive: !s.isActive }).subscribe(() => this.reload());
  }

  toggleMenu(id: number, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
