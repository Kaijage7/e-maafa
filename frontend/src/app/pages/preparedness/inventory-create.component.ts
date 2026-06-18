import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

interface RefItem { id: number; name: string; category?: string; }

/** Emergency Supplies → New Item — a real create form that POSTs to the Spring Boot inventory API. */
@Component({
  selector: 'page-inventory-create',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent],
  template: `
    <dmis-page-header title="New Emergency Supply Item" icon="fa-boxes"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Emergency Supplies', url:'/m/preparedness/inventory'}, {label:'New Item'}]">
    </dmis-page-header>

    <div class="panel-row">
      <dmis-panel title="Item Details" icon="fa-clipboard-list">
        <div class="form-body">
          <div class="form-grid">
            <div class="fg">
              <label>Resource <span class="req">*</span></label>
              <select [value]="resourceId()" (change)="onResource($any($event.target).value)">
                <option value="">Select resource…</option>
                @for (r of resources(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
              </select>
            </div>
            <div class="fg">
              <label>Item Name <span class="req">*</span></label>
              <input type="text" [value]="itemName()" (input)="itemName.set($any($event.target).value)" placeholder="e.g. Wool Blanket">
            </div>
            <div class="fg">
              <label>Category</label>
              <select [value]="category()" (change)="category.set($any($event.target).value)">
                <option value="">Select category…</option>
                @for (c of categories; track c) { <option [value]="c">{{ c }}</option> }
              </select>
            </div>
            <div class="fg">
              <label>Warehouse <span class="req">*</span></label>
              <select [value]="warehouseId()" (change)="warehouseId.set($any($event.target).value)">
                <option value="">Select warehouse…</option>
                @for (w of warehouses(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
              </select>
            </div>
            <div class="fg">
              <label>Quantity <span class="req">*</span></label>
              <input type="number" min="0" [value]="quantity()" (input)="quantity.set($any($event.target).value)" placeholder="0">
            </div>
            <div class="fg">
              <label>Batch Number</label>
              <input type="text" [value]="batch()" (input)="batch.set($any($event.target).value)" placeholder="e.g. BLK-2026-09">
            </div>
            <div class="fg">
              <label>Expiry Date</label>
              <input type="date" [value]="expiry()" (input)="expiry.set($any($event.target).value)">
            </div>
            <div class="fg">
              <label>Item Status</label>
              <select [value]="status()" (change)="status.set($any($event.target).value)">
                @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </div>
          </div>

          @if (error()) { <div class="form-error"><i class="fas fa-exclamation-circle"></i> {{ error() }}</div> }

          <div class="form-actions">
            <button type="button" class="btn-ghost" (click)="cancel()">Cancel</button>
            <button type="button" class="btn-add" [disabled]="!valid() || saving()" (click)="submit()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ saving() ? 'Saving…' : (editId() ? 'Update Item' : 'Create Item') }}
            </button>
          </div>
        </div>
      </dmis-panel>
    </div>
  `,
  styles: [`
    .form-body { padding: 1.1rem 1.2rem; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem 1.1rem; }
    .fg { display: flex; flex-direction: column; gap: 0.3rem; }
    .fg label { font-size: 0.78rem; font-weight: 600; color: var(--text-mid); }
    .req { color: #dc2626; }
    .fg input, .fg select { border: 1px solid var(--border); border-radius: 9px; padding: 0.5rem 0.65rem; font-size: 0.86rem; font-family: inherit; background: #fff; }
    .fg input:focus, .fg select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(0,51,102,0.08); }
    .form-error { margin-top: 0.9rem; background: rgba(220,38,38,0.08); color: #dc2626; padding: 0.55rem 0.8rem; border-radius: 9px; font-size: 0.82rem; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .btn-ghost { border: 1px solid var(--border); background: #fff; color: var(--text-mid); border-radius: 9px; padding: 0.5rem 1.1rem; font-size: 0.84rem; cursor: pointer; }
    .btn-add[disabled] { opacity: 0.55; cursor: not-allowed; }
  `],
})
export class InventoryCreateComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  editId = signal<number | null>(null);

  categories = ['Search and Rescue Equipment', 'Emergency Shelter', 'Food Items', 'Non-Food Items'];
  statuses = ['Good Condition', 'Expired', 'Damaged', 'Reserved', 'Deployed'];

  resources = signal<RefItem[]>([]);
  warehouses = signal<RefItem[]>([]);
  resourceId = signal('');
  itemName = signal('');
  category = signal('');
  warehouseId = signal('');
  quantity = signal('');
  batch = signal('');
  expiry = signal('');
  status = signal('Good Condition');
  saving = signal(false);
  error = signal('');

  constructor() {
    this.http.get<{ resources: RefItem[]; warehouses: RefItem[] }>('/api/v1/inventory/reference').subscribe(r => {
      this.resources.set(r.resources);
      this.warehouses.set(r.warehouses);
    });
  }

  ngOnInit(): void {
    const edit = this.route.snapshot.queryParamMap.get('edit');
    if (!edit) { return; }
    this.editId.set(Number(edit));
    this.http.get<any>(`/api/v1/inventory/${edit}`).subscribe({
      next: it => {
        this.resourceId.set(it.resourceId != null ? String(it.resourceId) : '');
        this.itemName.set(it.itemName ?? '');
        this.category.set(it.category ?? '');
        this.warehouseId.set(it.warehouseId != null ? String(it.warehouseId) : '');
        this.quantity.set(it.quantity != null ? String(it.quantity) : '');
        this.batch.set(it.batchNumber ?? '');
        this.expiry.set(it.expiryDate ?? '');
        this.status.set(it.status ?? 'Good Condition');
      },
      error: () => this.error.set('Could not load the item for editing.'),
    });
  }

  valid = computed(() => !!this.resourceId() && this.itemName().trim().length > 0
    && !!this.warehouseId() && this.quantity() !== '' && Number(this.quantity()) >= 0);

  onResource(id: string): void {
    this.resourceId.set(id);
    const r = this.resources().find(x => String(x.id) === id);
    if (r && r.category && !this.category()) { this.category.set(r.category); }
    if (r && !this.itemName()) { this.itemName.set(r.name); }
  }

  submit(): void {
    if (!this.valid()) { this.error.set('Please fill the required fields (Resource, Item Name, Warehouse, Quantity).'); return; }
    this.saving.set(true);
    this.error.set('');
    const payload = {
      resourceId: Number(this.resourceId()), itemName: this.itemName().trim(), category: this.category() || null,
      warehouseId: Number(this.warehouseId()), quantity: Number(this.quantity()),
      batchNumber: this.batch() || null, expiryDate: this.expiry() || null, status: this.status(),
    };
    const id = this.editId();
    const req = id == null
      ? this.http.post('/api/v1/inventory', payload)
      : this.http.put(`/api/v1/inventory/${id}`, payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/m/preparedness/inventory']); },
      error: (e) => { this.saving.set(false); this.error.set(e?.error?.message || e?.error?.detail || 'Could not save the item. Please try again.'); },
    });
  }

  cancel(): void { this.router.navigate(['/m/preparedness/inventory']); }
}
