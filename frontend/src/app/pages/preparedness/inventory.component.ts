import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

interface ItemRow {
  id: number; resource: string; itemName: string; category: string; warehouse: string; quantity: number;
  status: string; expiryDate: string; batchNumber: string;
  lowStock: boolean; expiring: boolean; expired: boolean;
}
interface InvResponse {
  items: ItemRow[];
  stats: { total: number; lowStock: number; expiringSoon: number; outOfStock: number; expired: number };
}

@Component({
  selector: 'page-inventory',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, DecimalPipe, RouterLink],
  template: `
    <dmis-page-header title="Emergency Supplies" icon="fa-boxes"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Emergency Supplies'}]">
      <a class="btn-add" routerLink="/m/preparedness/inventory/create"><i class="fas fa-plus"></i> New Item</a>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Items" icon="fa-list" color="#198754" />
      <dmis-stat-card [value]="stats().lowStock" label="Low Stock" icon="fa-exclamation-triangle" color="#f59e0b" />
      <dmis-stat-card [value]="stats().expiringSoon" label="Expiring Soon" icon="fa-clock" color="#f97316" />
      <dmis-stat-card [value]="stats().outOfStock" label="Out of Stock" icon="fa-ban" color="#ef4444" />
    </div>

    <div class="alert-tabs">
      <a class="alert-tab" [class.active]="tab() === ''" (click)="tab.set('')"><i class="fas fa-th-list"></i> All</a>
      <a class="alert-tab" [class.active]="tab() === 'low_stock'" (click)="tab.set('low_stock')"><i class="fas fa-arrow-down"></i> Low Stock <span class="tab-count">{{ stats().lowStock }}</span></a>
      <a class="alert-tab" [class.active]="tab() === 'expiring'" (click)="tab.set('expiring')"><i class="fas fa-clock"></i> Expiring <span class="tab-count">{{ stats().expiringSoon }}</span></a>
      <a class="alert-tab" [class.active]="tab() === 'expired'" (click)="tab.set('expired')"><i class="fas fa-times-circle"></i> Expired <span class="tab-count">{{ stats().expired }}</span></a>
    </div>

    <div class="filter-bar">
      <div class="search-box"><i class="fas fa-search"></i>
        <input type="text" placeholder="Search supplies..." [value]="search()" (input)="search.set($any($event.target).value)"></div>
      <select [value]="warehouse()" (change)="warehouse.set($any($event.target).value)">
        <option value="">All Warehouses</option>
        @for (w of warehouses(); track w) { <option [value]="w">{{ w }}</option> }
      </select>
      <select [value]="category()" (change)="category.set($any($event.target).value)">
        <option value="">All Categories</option>
        <option value="search and rescue equipment">Search and Rescue Equipment</option>
        <option value="emergency shelter">Emergency Shelter</option>
        <option value="food items">Food Items</option>
        <option value="non-food items">Non-Food Items</option>
      </select>
    </div>

    <div class="panel-row" style="animation-delay:.30s;">
      <dmis-panel title="Supply Inventory" icon="fa-database" [badge]="items().length + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (filtered().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead><tr>
                  <th>Resource</th><th>Item Name</th><th>Category</th><th>Warehouse</th>
                  <th>Quantity</th><th>Status</th><th>Expiry Date</th><th>Actions</th>
                </tr></thead>
                <tbody>
                  @for (it of filtered(); track it.batchNumber) {
                    <tr class="data-row">
                      <td style="font-size:0.82rem;color:var(--text-mid);">{{ it.resource || '-' }}</td>
                      <td><div class="r-title">{{ it.itemName }}</div><div class="r-subtitle">{{ it.batchNumber || 'No batch #' }}</div></td>
                      <td><span class="r-badge" style="background:rgba(25,135,84,0.1);color:#198754;">{{ it.category || '-' }}</span></td>
                      <td style="font-size:0.82rem;color:var(--text-mid);">{{ it.warehouse || '-' }}</td>
                      <td>
                        <span style="font-weight:700;" [style.color]="it.quantity === 0 ? '#dc2626' : (it.lowStock ? '#d97706' : 'var(--text-dark)')">{{ it.quantity | number }}</span>
                        @if (it.lowStock) { <span style="font-size:0.6rem;color:#d97706;display:block;"><i class="fas fa-exclamation-triangle"></i> Low</span> }
                      </td>
                      <td><span class="r-badge {{ statusClass(it.status) }}">{{ it.status }}</span></td>
                      <td style="font-size:0.78rem;">
                        @if (it.expiryDate) {
                          <span [style.color]="it.expired ? '#dc2626' : (it.expiring ? '#d97706' : 'var(--text-mid)')">
                            {{ it.expiryDate }}
                            @if (it.expired) { <i class="fas fa-times-circle" style="font-size:0.6rem;"></i> }
                            @if (it.expiring) { <i class="fas fa-exclamation-circle" style="font-size:0.6rem;"></i> }
                          </span>
                        } @else { <span style="color:var(--text-light);">-</span> }
                      </td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(it.batchNumber, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === it.batchNumber">
                            <a class="ctx-item" [routerLink]="['/m/preparedness/inventory/create']" [queryParams]="{edit: it.id}"><i class="fas fa-eye"></i> View Details</a>
                            <a class="ctx-item success" [routerLink]="['/m/preparedness/inventory/create']" [queryParams]="{edit: it.id}"><i class="fas fa-edit"></i> Edit</a>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state"><i class="fas fa-boxes"></i>No inventory items found.</div>
          }
        </div>
      </dmis-panel>
    </div>
  `,
  styles: [`
    .alert-tabs { display: flex; gap: 0.35rem; margin-bottom: 0.85rem; flex-wrap: wrap; }
    .alert-tab { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.4rem 0.85rem; border-radius: 50px; font-size: 0.78rem; font-weight: 600; text-decoration: none; transition: all 0.2s; border: 1px solid rgba(0,0,0,0.06); cursor: pointer; }
    .alert-tab.active { background: var(--primary); color: #fff; border-color: var(--primary); }
    .alert-tab:not(.active) { background: rgba(255,255,255,0.55); color: var(--text-mid); }
    .alert-tab:not(.active):hover { background: rgba(255,255,255,0.8); color: var(--text-dark); }
    .alert-tab .tab-count { background: rgba(255,255,255,0.25); padding: 0.1rem 0.4rem; border-radius: 50px; font-size: 0.68rem; }
    .alert-tab:not(.active) .tab-count { background: rgba(0,0,0,0.06); }
    .badge-good { background: rgba(16,185,129,0.12); color: #059669; }
    .badge-good-condition { background: rgba(16,185,129,0.12); color: #059669; }
    .badge-near-expiry { background: rgba(245,158,11,0.12); color: #d97706; }
    .badge-expired { background: rgba(220,38,38,0.12); color: #dc2626; }
    .badge-damaged { background: rgba(220,38,38,0.12); color: #dc2626; }
    .badge-reserved { background: rgba(0,77,102,0.12); color: #004d66; }
    .badge-deployed { background: rgba(59,130,246,0.12); color: #2563eb; }
  `],
})
export class InventoryComponent {
  private http = inject(HttpClient);
  items = signal<ItemRow[]>([]);
  stats = signal({ total: 0, lowStock: 0, expiringSoon: 0, outOfStock: 0, expired: 0 });
  search = signal('');
  warehouse = signal('');
  category = signal('');
  tab = signal<'' | 'low_stock' | 'expiring' | 'expired'>('');
  openMenu = signal<string | null>(null);

  constructor() {
    this.http.get<InvResponse>('/api/v1/inventory').subscribe(response => {
      this.items.set(response.items);
      this.stats.set(response.stats);
    });
  }

  warehouses = computed(() => [...new Set(this.items().map(i => i.warehouse).filter(Boolean))]);

  filtered = computed(() => {
    const q = this.search().toLowerCase();
    const w = this.warehouse();
    const c = this.category();
    const t = this.tab();
    return this.items().filter(it => {
      const text = (it.itemName + ' ' + it.category + ' ' + it.warehouse + ' ' + it.batchNumber).toLowerCase();
      const tabMatch = t === '' || (t === 'low_stock' && it.lowStock) || (t === 'expiring' && it.expiring) || (t === 'expired' && it.expired);
      return tabMatch && (!q || text.includes(q)) && (!w || it.warehouse === w)
        && (!c || (it.category || '').toLowerCase() === c);
    });
  });

  // Reproduced as-is from the source: slug = status lowercased with spaces→dashes (so "Good Condition"
  // yields badge-good-condition). Source issue: that class isn't in the original CSS — logged.
  statusClass(status: string): string {
    return 'badge-' + (status || '').toLowerCase().replace(/ /g, '-');
  }

  toggleMenu(id: string, event: Event): void {
    event.stopPropagation();
    this.openMenu.update(c => (c === id ? null : id));
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.openMenu.set(null);
  }
}
