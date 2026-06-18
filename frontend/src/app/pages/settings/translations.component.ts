import { HttpClient } from '@angular/common/http';
import { Component, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Translation { id: number; labelKey: string; group: string; en: string; sw: string; }

/**
 * System Settings → Translations. The bilingual (English / Kiswahili) UI-string registry, seeded
 * from the public portal labels. Admins edit EN/SW inline; "untranslated" flags rows where the
 * Swahili still equals the English. (Honest: the live i18n is the code-based PortalLabels service;
 * this registry is the managed source of truth a loader can hydrate from — `GET /map`.)
 */
@Component({
  selector: 'page-translations',
  standalone: true,
  imports: [FormsModule, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Translations" icon="fa-language"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'System Settings'}, {label:'Translations'}]">
      <button class="btn-add" type="button" (click)="openForm()"><i class="fas fa-plus"></i> Add Key</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['total'] ?? 0" label="Keys" icon="fa-language" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['groups'] ?? 0" label="Groups" icon="fa-layer-group" color="#7c3aed" />
      <dmis-stat-card [value]="stats()['untranslated'] ?? 0" label="Untranslated (SW = EN)" icon="fa-triangle-exclamation" color="#d97706" />
    </div>

    <div class="panel-row">
      <dmis-panel title="UI strings" icon="fa-database" [badge]="rows().length + ''">
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <select class="form-select" style="max-width:180px;" [(ngModel)]="fGroup" (change)="reload()">
            <option value="">All groups</option>
            @for (g of groups(); track g) { <option [value]="g">{{ g }}</option> }
          </select>
          <input class="form-control" style="max-width:260px;" placeholder="Search key / text…" [(ngModel)]="fSearch" (keyup.enter)="reload()">
          <button class="btn-add" style="background:#64748b;" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr><th style="width:22%;">Key</th><th>English</th><th>Kiswahili</th><th style="width:90px;"></th></tr></thead>
            <tbody>
              @for (t of rows(); track t.id) {
                <tr class="data-row">
                  <td><code style="font-size:0.74rem;color:var(--text-mid);">{{ t.labelKey }}</code>
                    <div style="font-size:0.62rem;color:var(--text-light);text-transform:uppercase;">{{ t.group }}</div></td>
                  <td>
                    <input class="cell" [ngModel]="t.en" (change)="saveCell(t, 'en', $any($event.target).value)">
                  </td>
                  <td>
                    <input class="cell" [class.flag]="t.en === t.sw" [ngModel]="t.sw" (change)="saveCell(t, 'sw', $any($event.target).value)">
                  </td>
                  <td style="text-align:right;white-space:nowrap;">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + t.labelKey" (click)="toggleMenu(t.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === t.id">
                        <a class="ctx-item" (click)="openEdit(t)"><i class="fas fa-pen"></i> Edit</a>
                        <a class="ctx-item danger" (click)="remove(t)"><i class="fas fa-trash"></i> Delete</a>
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty { <tr><td colspan="4" style="text-align:center;color:var(--text-light);padding:2rem;">No translations match.</td></tr> }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;"><i class="fas fa-language me-2"></i>{{ editId ? 'Edit translation' : 'New translation key' }}</h5>
          <label class="f-lbl">Key <span class="text-danger">*</span></label>
          <input class="form-control" [(ngModel)]="m.labelKey" placeholder="e.g. lbl_submit_report" [readonly]="!!editId">
          <label class="f-lbl">Group</label>
          <select class="form-select" [(ngModel)]="m.group">
            @for (g of groups(); track g) { <option [value]="g">{{ g }}</option> }
          </select>
          <label class="f-lbl">English <span class="text-danger">*</span></label>
          <input class="form-control" [(ngModel)]="m.en">
          <label class="f-lbl">Kiswahili <span class="text-danger">*</span></label>
          <input class="form-control" [(ngModel)]="m.sw">
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button class="btn-cancel" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!m.labelKey?.trim() || !m.en?.trim() || !m.sw?.trim()" (click)="save()">{{ editId ? 'Save changes' : 'Add key' }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .cell { width:100%; border:1px solid transparent; border-radius:6px; padding:0.3rem 0.5rem; font-size:0.84rem; background:transparent; }
    .cell:hover { border-color:var(--border); } .cell:focus { border-color:#0d6efd; background:#fff; outline:none; }
    .cell.flag { color:#d97706; font-style:italic; }
    .ctx-menu { position:absolute; top:100%; right:0; }
    .f-lbl { font-size:0.68rem; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-light); display:block; margin:0.7rem 0 3px; }
    .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1500; display:flex; align-items:flex-start; justify-content:center; padding:8vh 1rem; }
    .modal-card { background:var(--card-bg,#fff); border-radius:16px; max-width:480px; width:100%; padding:1.4rem 1.5rem; }
    .btn-cancel { border:1px solid var(--border); background:#fff; border-radius:9px; padding:0.5rem 1rem; cursor:pointer; }
  `],
})
export class TranslationsComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/settings/translations';

  rows = signal<Translation[]>([]);
  groups = signal<string[]>([]);
  stats = signal<Record<string, number>>({});
  formOpen = signal(false);
  openMenu = signal<number | null>(null);
  fGroup = ''; fSearch = '';
  editId: number | null = null;
  m: any = {};

  constructor() { this.reload(); }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fGroup) { q.set('group', this.fGroup); }
    if (this.fSearch.trim()) { q.set('search', this.fSearch.trim()); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(r => {
      this.rows.set(r.translations);
      this.groups.set(r.groups);
      this.stats.set(r.stats);
    });
  }

  /** Inline save of one cell (en or sw) on blur. */
  saveCell(t: Translation, field: 'en' | 'sw', value: string): void {
    if (value === t[field]) { return; }
    this.http.put(`${this.base}/${t.id}`, { [field]: value }).subscribe({
      next: () => { t[field] = value; this.stats.update(s => ({ ...s, untranslated: this.rows().filter(x => x.en === x.sw).length })); },
      error: err => { alert(err?.error?.detail ?? 'Could not save.'); this.reload(); },
    });
  }

  openForm(): void {
    this.editId = null;
    this.m = { group: this.groups()[0] ?? 'General' };
    this.openMenu.set(null);
    this.formOpen.set(true);
  }

  openEdit(t: Translation): void {
    this.editId = t.id;
    this.m = { labelKey: t.labelKey, group: t.group, en: t.en, sw: t.sw };
    this.openMenu.set(null);
    this.formOpen.set(true);
  }

  save(): void {
    if (this.editId) {
      this.http.put(`${this.base}/${this.editId}`, {
        group: this.m.group, en: this.m.en?.trim(), sw: this.m.sw?.trim(),
      }).subscribe({
        next: () => { this.formOpen.set(false); this.reload(); },
        error: err => alert(err?.error?.detail ?? 'Could not save the changes.'),
      });
    } else {
      this.http.post(this.base, {
        labelKey: this.m.labelKey?.trim(), group: this.m.group,
        en: this.m.en?.trim(), sw: this.m.sw?.trim(),
      }).subscribe({
        next: () => { this.formOpen.set(false); this.reload(); },
        error: err => alert(err?.error?.detail ?? 'Could not add the key.'),
      });
    }
  }

  remove(t: Translation): void {
    if (!confirm(`Delete "${t.labelKey}"?`)) { return; }
    this.http.delete(`${this.base}/${t.id}`).subscribe({ next: () => this.reload(), error: () => this.reload() });
  }

  toggleMenu(id: number, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
