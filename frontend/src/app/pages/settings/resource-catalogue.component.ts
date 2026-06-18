import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface Resource {
  id: number; name: string; category: string; description: string | null;
  unitOfMeasure: string | null; specifications: string | null;
  lowStockThreshold: number | null; unitCost: number | null; inStock: number;
}

/**
 * System Settings → Resource Management. The relief-resource catalogue the whole supply chain
 * draws on (allocations, dispatch, warehouse stock, bids). Setting an item's unit cost here is
 * what lets the Command Post and Sendai analytics value a response; the low-stock threshold is
 * what the warehouse dashboard flags. Items in use cannot be deleted (the API guards the FKs).
 */
@Component({
  selector: 'page-resource-catalogue',
  standalone: true,
  imports: [FormsModule, DecimalPipe, PageHeaderComponent, PanelComponent, StatCardComponent],
  template: `
    <dmis-page-header title="Resource Catalogue" icon="fa-cubes"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'System Settings'}, {label:'Resource Management'}]">
      <button class="btn-add" type="button" (click)="openForm(null)"><i class="fas fa-plus"></i> Add Item</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats()['total'] ?? 0" label="Catalogue items" icon="fa-cubes" color="#0d6efd" />
      <dmis-stat-card [value]="stats()['categories'] ?? 0" label="Categories" icon="fa-layer-group" color="#7c3aed" />
      <dmis-stat-card [value]="costedCount()" label="Items with a unit cost" icon="fa-coins" color="#059669" />
    </div>

    <div class="panel-row">
      <dmis-panel title="Relief-resource catalogue" icon="fa-database" [badge]="resources().length + ' items'">
        <div class="panel-body" style="display:flex;gap:0.6rem;flex-wrap:wrap;border-bottom:1px solid var(--border);">
          <select class="form-select" style="max-width:220px;" [(ngModel)]="fCategory" (change)="reload()">
            <option value="">All categories</option>
            @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }
          </select>
          <input class="form-control" style="max-width:240px;" placeholder="Search items…" [(ngModel)]="fSearch" (keyup.enter)="reload()">
          <button class="btn-add" style="background:#64748b;" (click)="reload()"><i class="fas fa-magnifying-glass"></i></button>
        </div>
        <div class="panel-body" style="padding:0;">
          <table class="r-table">
            <thead><tr>
              <th>Item</th><th>Category</th><th>Unit</th>
              <th style="text-align:right;">Unit cost (TZS)</th><th style="text-align:right;">Low-stock</th>
              <th style="text-align:right;">In stock</th><th></th>
            </tr></thead>
            <tbody>
              @for (r of resources(); track r.id) {
                <tr class="data-row">
                  <td><div class="r-title">{{ r.name }}</div>@if (r.description) { <div class="r-subtitle">{{ r.description }}</div> }</td>
                  <td><span class="r-badge" style="background:rgba(124,58,237,0.1);color:#7c3aed;">{{ r.category }}</span></td>
                  <td style="font-size:0.82rem;">{{ r.unitOfMeasure || '—' }}</td>
                  <td style="text-align:right;" [style.color]="r.unitCost ? 'var(--text-dark)' : '#cbd5e1'">{{ r.unitCost ? (r.unitCost | number:'1.0-0') : 'not set' }}</td>
                  <td style="text-align:right;font-size:0.82rem;">{{ r.lowStockThreshold ?? '—' }}</td>
                  <td style="text-align:right;">
                    <span [style.color]="lowStock(r) ? '#dc2626' : 'var(--text-mid)'" [style.font-weight]="lowStock(r) ? '700' : '400'">{{ r.inStock | number }}</span>
                    @if (lowStock(r)) { <i class="fas fa-triangle-exclamation" style="color:#dc2626;margin-left:4px;" title="Below low-stock threshold"></i> }
                  </td>
                  <td style="text-align:right;white-space:nowrap;">
                    <div class="ctx-wrap">
                      <button class="ctx-trigger" type="button" [attr.aria-label]="'Actions for ' + r.name" (click)="toggleMenu(r.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                      <div class="ctx-menu" [class.open]="openMenu() === r.id">
                        <a class="ctx-item" (click)="openForm(r)"><i class="fas fa-pen"></i> Edit</a>
                        <a class="ctx-item danger" (click)="remove(r)"><i class="fas fa-trash"></i> Delete</a>
                      </div>
                    </div>
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="7" style="text-align:center;color:var(--text-light);padding:2rem;">No items match — add the first catalogue item.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </dmis-panel>
    </div>

    @if (formOpen()) {
      <div class="modal-backdrop" (click)="formOpen.set(false)">
        <div class="modal-card" (click)="$event.stopPropagation()">
          <h5 style="font-weight:800;margin:0 0 1rem;"><i class="fas fa-cubes me-2"></i>{{ editId ? 'Edit' : 'New' }} catalogue item</h5>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.7rem;">
            <div style="grid-column:1/3;"><label class="f-lbl">Name <span class="text-danger">*</span></label>
              <input class="form-control" [(ngModel)]="m.name" placeholder="e.g. Tarpaulin (4×6m)"></div>
            <div><label class="f-lbl">Category <span class="text-danger">*</span></label>
              <select class="form-select" [(ngModel)]="m.category">
                <option value="" disabled>Select a category</option>
                @for (c of categories(); track c) { <option [value]="c">{{ c }}</option> }
              </select></div>
            <div><label class="f-lbl">Unit of measure</label>
              <select class="form-select" [(ngModel)]="m.unitOfMeasure">
                <option value="">— none —</option>
                @for (u of units(); track u) { <option [value]="u">{{ u }}</option> }
              </select></div>
            <div><label class="f-lbl">Unit cost (TZS)</label>
              <input type="number" min="0" class="form-control" [(ngModel)]="m.unitCost" placeholder="for response valuation"></div>
            <div><label class="f-lbl">Low-stock threshold</label>
              <input type="number" min="0" class="form-control" [(ngModel)]="m.lowStockThreshold" placeholder="warehouse alert level"></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Description</label>
              <input class="form-control" [(ngModel)]="m.description"></div>
            <div style="grid-column:1/3;"><label class="f-lbl">Specifications</label>
              <input class="form-control" [(ngModel)]="m.specifications" placeholder="size, grade, packaging…"></div>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:0.6rem;margin-top:1.1rem;">
            <button class="btn-cancel" (click)="formOpen.set(false)">Cancel</button>
            <button class="btn-add" [disabled]="!m.name?.trim() || !m.category?.trim() || saving()" (click)="save()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ editId ? 'Update item' : 'Add item' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .f-lbl { font-size:0.68rem; text-transform:uppercase; letter-spacing:0.4px; color:var(--text-light); display:block; margin-bottom:3px; }
    /* Anchor the row action menu under its trigger (the global .ctx-menu is position:fixed and detaches). */
    .ctx-menu { position: absolute; top: 100%; right: 0; }
    .modal-backdrop { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1500; display:flex; align-items:flex-start; justify-content:center; padding:6vh 1rem; }
    .modal-card { background:var(--card-bg,#fff); border-radius:16px; max-width:640px; width:100%; padding:1.4rem 1.5rem; }
    .btn-cancel { border:1px solid var(--border); background:#fff; border-radius:9px; padding:0.5rem 1rem; cursor:pointer; }
  `],
})
export class ResourceCatalogueComponent {
  private http = inject(HttpClient);
  private base = '/api/v1/settings/resources';

  resources = signal<Resource[]>([]);
  categories = signal<string[]>([]);
  units = signal<string[]>([]);
  stats = signal<Record<string, number>>({});
  formOpen = signal(false);
  saving = signal(false);
  openMenu = signal<number | null>(null);

  fCategory = ''; fSearch = '';
  editId: number | null = null;
  m: any = {};

  costedCount = computed(() => this.resources().filter(r => r.unitCost && r.unitCost > 0).length);

  constructor() { this.reload(); }

  reload(): void {
    const q = new URLSearchParams();
    if (this.fCategory) { q.set('category', this.fCategory); }
    if (this.fSearch.trim()) { q.set('search', this.fSearch.trim()); }
    this.http.get<any>(`${this.base}?${q}`).subscribe(r => {
      this.resources.set(r.resources);
      this.categories.set(r.categories);
      this.units.set(r.units ?? []);
      this.stats.set(r.stats);
    });
  }

  lowStock(r: Resource): boolean {
    return r.lowStockThreshold != null && r.lowStockThreshold > 0 && r.inStock < r.lowStockThreshold;
  }

  openForm(r: Resource | null): void {
    this.editId = r?.id ?? null;
    this.m = r ? { ...r } : {};
    this.formOpen.set(true);
  }

  save(): void {
    this.saving.set(true);
    const body = {
      name: this.m.name, category: this.m.category, description: this.m.description,
      unitOfMeasure: this.m.unitOfMeasure, specifications: this.m.specifications,
      lowStockThreshold: this.m.lowStockThreshold, unitCost: this.m.unitCost,
    };
    const obs = this.editId
      ? this.http.put(`${this.base}/${this.editId}`, body)
      : this.http.post(this.base, body);
    obs.subscribe({
      next: () => { this.saving.set(false); this.formOpen.set(false); this.reload(); },
      error: err => { this.saving.set(false); alert(err?.error?.message ?? 'Could not save the item.'); },
    });
  }

  remove(r: Resource): void {
    if (!confirm(`Delete "${r.name}" from the catalogue?`)) { return; }
    this.http.delete(`${this.base}/${r.id}`).subscribe({
      next: () => this.reload(),
      error: err => alert(err?.error?.message ?? 'Could not delete the item.'),
    });
  }

  toggleMenu(id: number, e: Event): void { e.stopPropagation(); this.openMenu.update(c => c === id ? null : id); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }
}
