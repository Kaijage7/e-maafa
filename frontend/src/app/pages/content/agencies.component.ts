import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Agency {
  id: number; name: string; acronym: string; agencyType: string; mandate: string;
  contactPersonName: string; contactPersonEmail: string; contactPersonPhone: string;
  website: string; isActive: boolean;
}

/** Content Management → Agencies — partner agency registry (the EWE institutions + partners). */
@Component({
  selector: 'page-agencies',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Agencies" icon="fa-building"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'Agencies'}]">
      <button class="btn-add" type="button" (click)="openCreate()"><i class="fas fa-plus"></i> New Agency</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Agencies" icon="fa-list" color="#e83e8c" />
      <dmis-stat-card [value]="stats().active" label="Active" icon="fa-check-circle" color="#10b981" />
      <dmis-stat-card [value]="stats().government" label="Government" icon="fa-landmark" color="#3b82f6" />
      <dmis-stat-card [value]="stats().other" label="Other" icon="fa-handshake" color="#f59e0b" />
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search agencies..." [value]="search()" (input)="search.set($any($event.target).value)"></div>
    </div>

    <div class="panel-row" style="animation-delay:.3s;">
      <dmis-panel title="Agency Registry" icon="fa-database" [badge]="items().length + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (filtered().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr><th>Agency</th><th>Type</th><th>Mandate</th><th>Website</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  @for (a of filtered(); track a.id) {
                    <tr class="data-row">
                      <td><div class="r-title">{{ a.name }}</div>@if (a.acronym) { <div class="r-subtitle">{{ a.acronym }}</div> }</td>
                      <td><span class="r-badge" style="background:rgba(0,51,102,0.08);color:#003366;">{{ a.agencyType }}</span></td>
                      <td style="font-size:0.8rem;color:var(--text-mid);max-width:340px;">{{ (a.mandate || '-').slice(0, 90) }}</td>
                      <td style="font-size:0.78rem;">@if (a.website) { <a [href]="a.website" target="_blank" style="color:#2563eb;">{{ a.website.replace('https://','') }}</a> } @else { - }</td>
                      <td><span class="r-badge {{ a.isActive ? 'badge-approved' : 'badge-rejected' }}">{{ a.isActive ? 'Active' : 'Inactive' }}</span></td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(a.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === a.id">
                            <a class="ctx-item success" (click)="openEdit(a)"><i class="fas fa-edit"></i> Edit</a>
                            <a class="ctx-item" (click)="toggleActive(a)"><i class="fas" [class.fa-ban]="a.isActive" [class.fa-check]="!a.isActive"></i> {{ a.isActive ? 'Deactivate' : 'Activate' }}</a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else { <div class="empty-state"><i class="fas fa-building"></i>No agencies registered yet.</div> }
        </div>
      </dmis-panel>
    </div>

    @if (editorOpen()) {
      <div style="position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1500;display:flex;align-items:center;justify-content:center;padding:1rem;" (click)="editorOpen.set(false)">
        <div style="background:#fff;border-radius:16px;max-width:640px;width:100%;padding:1.3rem 1.4rem;" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin-bottom:1rem;">{{ editId() ? 'Edit Agency' : 'New Agency' }}</h5>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
            <input class="form-control" placeholder="Agency name *" [value]="fName()" (input)="fName.set($any($event.target).value)">
            <input class="form-control" placeholder="Acronym" [value]="fAcr()" (input)="fAcr.set($any($event.target).value)">
            <select class="form-control" [value]="fType()" (change)="fType.set($any($event.target).value)">
              <option>Government</option><option>NGO</option><option>Private Sector</option><option>International</option>
            </select>
            <input class="form-control" placeholder="Website" [value]="fWeb()" (input)="fWeb.set($any($event.target).value)">
            <input class="form-control" placeholder="Contact person" [value]="fCName()" (input)="fCName.set($any($event.target).value)">
            <input class="form-control" placeholder="Contact phone" [value]="fCPhone()" (input)="fCPhone.set($any($event.target).value)">
          </div>
          <textarea class="form-control" rows="3" placeholder="Mandate description" style="margin-top:0.75rem;width:100%;" [value]="fMandate()" (input)="fMandate.set($any($event.target).value)"></textarea>
          @if (error()) { <div style="color:#dc2626;font-size:0.82rem;margin-top:0.6rem;">{{ error() }}</div> }
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1rem;">
            <button type="button" style="border:1px solid var(--border);background:#fff;border-radius:9px;padding:0.5rem 1rem;cursor:pointer;" (click)="editorOpen.set(false)">Cancel</button>
            <button class="btn-add" type="button" [disabled]="!fName().trim() || saving()" (click)="save()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i> {{ saving() ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AgenciesComponent {
  private http = inject(HttpClient);
  items = signal<Agency[]>([]);
  stats = signal({ total: 0, active: 0, government: 0, other: 0 });
  search = signal('');
  openMenu = signal<number | null>(null);
  editorOpen = signal(false);
  editId = signal<number | null>(null);
  fName = signal(''); fAcr = signal(''); fType = signal('Government'); fWeb = signal('');
  fCName = signal(''); fCPhone = signal(''); fMandate = signal('');
  saving = signal(false); error = signal('');

  constructor() { this.reload(); }

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    return this.items().filter(a => !q || (a.name + ' ' + (a.acronym ?? '')).toLowerCase().includes(q));
  });

  reload(): void {
    this.http.get<{ items: Agency[]; stats: any }>('/api/v1/content/agencies')
      .subscribe(r => { this.items.set(r.items); this.stats.set(r.stats); });
  }

  openCreate(): void {
    this.editId.set(null);
    this.fName.set(''); this.fAcr.set(''); this.fType.set('Government'); this.fWeb.set('');
    this.fCName.set(''); this.fCPhone.set(''); this.fMandate.set('');
    this.error.set('');
    this.editorOpen.set(true);
  }

  openEdit(a: Agency): void {
    this.editId.set(a.id);
    this.fName.set(a.name); this.fAcr.set(a.acronym ?? ''); this.fType.set(a.agencyType);
    this.fWeb.set(a.website ?? ''); this.fCName.set(a.contactPersonName ?? '');
    this.fCPhone.set(a.contactPersonPhone ?? ''); this.fMandate.set(a.mandate ?? '');
    this.error.set('');
    this.editorOpen.set(true);
  }

  save(): void {
    this.saving.set(true);
    const payload = { name: this.fName().trim(), acronym: this.fAcr() || null, agencyType: this.fType(),
      website: this.fWeb() || null, contactPersonName: this.fCName() || null,
      contactPersonPhone: this.fCPhone() || null, mandateDescription: this.fMandate() || null };
    const req = this.editId()
      ? this.http.put(`/api/v1/content/agencies/${this.editId()}`, payload)
      : this.http.post('/api/v1/content/agencies', payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.editorOpen.set(false); this.reload(); },
      error: e => { this.saving.set(false); this.error.set(e?.error?.message || 'Could not save.'); },
    });
  }

  toggleActive(a: Agency): void {
    this.http.put(`/api/v1/content/agencies/${a.id}`, { isActive: !a.isActive }).subscribe(() => this.reload());
  }

  toggleMenu(id: number, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
