import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

interface StoreCard {
  id: number; name: string; level?: string; zone?: string; location: string | null;
  operational_status: string; line_items: number; total_quantity: number;
}
interface StockLine {
  id: number; item_name: string; quantity: number; minimum_threshold: number; batch_number: string | null;
  expiry_date: string | null; status: string | null; resource_name: string; resource_category: string | null;
  resource_id: number;
}
interface Movement {
  id: number; movement_type: string; quantity: number; reason: string | null; notes: string | null;
  created_at: string; resource_name: string; user_name: string | null;
  from_warehouse_name: string | null; to_warehouse_name: string | null;
  from_temp_warehouse_name: string | null; to_temp_warehouse_name: string | null;
  incident_title: string | null;
}

/**
 * Warehouse operations on the single inventory_items ledger — the stocking /
 * restocking / removal / transfer / stock-taking flows behind the dispatch
 * console. Port of admin warehouse stock screens + inventory stock-taking,
 * with stock_movements as the one audit journal.
 */
@Component({
  selector: 'page-warehouse-ops',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .alert-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
    .al { border-radius: 10px; padding: 10px 14px; font-size: 0.8rem; }
    .al b { font-size: 1.25rem; display: block; }
    .al-red { background: #fee2e2; color: #b91c1c; } .al-amber { background: #fef3c7; color: #92400e; }
    .al-blue { background: #e0f2fe; color: #075985; }
    .wh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; margin-bottom: 14px; }
    .wh-card { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 12px 14px; cursor: pointer; font-size: 0.82rem; }
    .wh-card.sel { border-color: #dc3545; box-shadow: 0 0 0 2px rgba(220,53,69,0.15); }
    .wh-card b { display: block; margin-bottom: 2px; }
    .wh-meta { font-size: 0.72rem; color: #6c757d; }
    .tag { font-size: 0.64rem; font-weight: 700; border-radius: 8px; padding: 1px 7px; background: #e2e8f0; color: #334155; }
    .tag.temp { background: #ede9fe; color: #5b21b6; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; }
    .low { color: #b91c1c; font-weight: 700; }
    .btn-sm { font-size: 0.72rem; padding: 4px 11px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; }
    .b-red { background: #dc3545; color: #fff; } .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; }
    .toolbar { display: flex; gap: 6px; margin-bottom: 10px; flex-wrap: wrap; }
    .queue-tabs { display: flex; gap: 4px; background: #fff; border-bottom: 2px solid #e3e6ed; border-radius: 12px 12px 0 0; padding: 0 4px; margin-bottom: 12px; }
    .queue-tabs button { font-size: 0.82rem; font-weight: 600; color: #6c757d; border: none; background: none; padding: 10px 16px; border-bottom: 2px solid transparent; margin-bottom: -2px; cursor: pointer; font-family: inherit; }
    .queue-tabs button.active { color: #dc3545; border-bottom-color: #dc3545; }
    .mv-type { font-size: 0.66rem; font-weight: 700; border-radius: 8px; padding: 1px 7px; }
    .mv-Intake { background: #d1fae5; color: #065f46; } .mv-Dispatch, .mv-Removal, .mv-Deduction { background: #fee2e2; color: #b91c1c; }
    .mv-Transfer { background: #e0f2fe; color: #075985; }
    .mv-Adjustment_Increase, .mv-Adjustment_Decrease { background: #fef3c7; color: #92400e; }
    .count-input { width: 84px; }
    .empty { text-align: center; color: #94a3b8; padding: 28px 0; font-size: 0.85rem; }
    select.cond { width: 110px; font-size: 0.76rem; border: 1px solid #cbd5e1; border-radius: 6px; padding: 3px 6px; }
    .util-bar { display: inline-block; width: 90px; height: 8px; background: #e2e8f0; border-radius: 6px; overflow: hidden; vertical-align: middle; margin-right: 6px; }
    .util-bar .fill { display: block; height: 100%; border-radius: 6px; }
    .util-bar .fill.ok { background: #16a34a; } .util-bar .fill.high { background: #d97706; } .util-bar .fill.full { background: #dc2626; }
    .util-num { font-size: 0.76rem; font-weight: 700; color: #334155; }
    .press { font-size: 0.64rem; font-weight: 700; border-radius: 8px; padding: 1px 8px; text-transform: uppercase; }
    .press.ok { background: #dcfce7; color: #166534; } .press.high { background: #fef3c7; color: #92400e; }
    .press.full { background: #fee2e2; color: #b91c1c; } .press.unknown { background: #e2e8f0; color: #475569; }
    .mv-Borrow { background: #ede9fe; color: #5b21b6; } .mv-Return { background: #d1fae5; color: #065f46; }
    .swal2-input-label { font-size: 0.78rem; color: #475569; margin: 6px 0 0; text-align: left; }
  `],
  template: `
    <dmis-page-header title="Warehouse Operations" icon="fa-warehouse"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Warehouse Operations'}]">
      <a routerLink="/m/response/dispatch" class="btn-add"><i class="fas fa-truck-fast"></i> Dispatch Console</a>
    </dmis-page-header>

    <div class="alert-strip">
      <div class="al al-red"><b>{{ alerts().expired ?? 0 }}</b>Expired batches in stock</div>
      <div class="al al-amber"><b>{{ alerts().expiring_soon ?? 0 }}</b>Expiring within 30 days</div>
      <div class="al al-blue"><b>{{ lowStock().length }}</b>Items at or below minimum threshold</div>
    </div>

    <div class="queue-tabs">
      <button [class.active]="tab() === 'stock'" (click)="tab.set('stock')">Stock by Warehouse</button>
      <button [class.active]="tab() === 'capacity'" (click)="loadCapacity()">Capacity</button>
      <button [class.active]="tab() === 'borrowing'" (click)="loadLoans()">Borrowing</button>
      <button [class.active]="tab() === 'movements'" (click)="loadMovements()">Movements Journal</button>
      <button [class.active]="tab() === 'stocktaking'" (click)="tab.set('stocktaking')">Stock Taking</button>
    </div>

    <!-- ── Stock by warehouse ── -->
    @if (tab() === 'stock') {
      <div class="wh-grid">
        @for (w of warehouses(); track w.id) {
          <div class="wh-card" [class.sel]="isSelected('zonal', w.id)" (click)="selectStore('zonal', w)">
            <b>{{ w.name }} <span class="tag">ZONAL</span></b>
            <span class="wh-meta">{{ w.location ?? w.zone ?? '—' }} · {{ w.operational_status }}</span><br>
            <span class="wh-meta"><b>{{ w.total_quantity }}</b> units across {{ w.line_items }} lines</span>
          </div>
        }
        @for (w of tempWarehouses(); track w.id) {
          <div class="wh-card" [class.sel]="isSelected('temporary', w.id)" (click)="selectStore('temporary', w)">
            <b>{{ w.name }} <span class="tag temp">{{ (w.level ?? 'TEMP').toUpperCase() }}</span></b>
            <span class="wh-meta">{{ w.location ?? '—' }} · {{ w.operational_status }}</span><br>
            <span class="wh-meta"><b>{{ w.total_quantity }}</b> units across {{ w.line_items }} lines</span>
          </div>
        }
      </div>

      @if (store()) {
        <dmis-panel [title]="'Stock — ' + store()!.name" icon="fa-boxes-stacked">
          <div class="toolbar">
            <button class="btn-sm b-red" (click)="intake()"><i class="fas fa-arrow-down"></i> Stock Intake</button>
            <button class="btn-sm b-outline" (click)="remove()"><i class="fas fa-arrow-up"></i> Remove Stock</button>
            <button class="btn-sm b-outline" (click)="transfer()"><i class="fas fa-right-left"></i> Transfer</button>
          </div>
          <table>
            <thead><tr><th>Resource</th><th>Item</th><th>Qty</th><th>Min</th><th>Batch</th><th>Expiry</th><th>Status</th></tr></thead>
            <tbody>
              @for (i of items(); track i.id) {
                <tr>
                  <td><b>{{ i.resource_name }}</b></td>
                  <td>{{ i.item_name }}</td>
                  <td [class.low]="i.minimum_threshold > 0 && i.quantity <= i.minimum_threshold">{{ i.quantity }}</td>
                  <td>{{ i.minimum_threshold }}</td>
                  <td>{{ i.batch_number ?? '—' }}</td>
                  <td>{{ i.expiry_date ?? '—' }}</td>
                  <td>{{ i.status ?? '—' }}</td>
                </tr>
              } @empty { <tr><td colspan="7" class="empty">This store has no stock lines yet.</td></tr> }
            </tbody>
          </table>
        </dmis-panel>
      } @else { <div class="empty">Select a warehouse card to view and manage its stock.</div> }
    }

    <!-- ── Capacity statistics ── -->
    @if (tab() === 'capacity') {
      <div class="alert-strip">
        <div class="al al-blue"><b>{{ capacityData().network.utilisation_pct ?? 0 }}%</b>Network utilisation ({{ capacityData().network.total_used_sqm ?? 0 }} / {{ capacityData().network.total_capacity_sqm ?? 0 }} m²)</div>
        <div class="al al-amber"><b>{{ capacityData().network.warehouses_under_pressure ?? 0 }}</b>Warehouses under space pressure (≥70%)</div>
        <div class="al al-red"><b>{{ capacityData().stockout_forecast.length }}</b>Resources trending to stockout</div>
      </div>
      <dmis-panel title="Capacity utilisation by warehouse" icon="fa-gauge-high">
        <table>
          <thead><tr><th>Warehouse</th><th>Type</th><th>Capacity m²</th><th>Used m²</th><th>Utilisation</th><th>Pressure</th></tr></thead>
          <tbody>
            @for (w of capacityData().warehouses; track w.id) {
              <tr>
                <td><b>{{ w.name }}</b></td>
                <td><span class="tag" [class.temp]="w.type === 'temporary'">{{ w.type === 'temporary' ? 'TEMP' : 'ZONAL' }}</span></td>
                <td>{{ w.capacity_sqm || '—' }}</td>
                <td>{{ w.used_sqm }}</td>
                <td style="min-width:160px">
                  @if (w.utilisation_pct != null) {
                    <div class="util-bar"><span class="fill {{ w.space_pressure }}" [style.width.%]="w.utilisation_pct > 100 ? 100 : w.utilisation_pct"></span></div>
                    <span class="util-num">{{ w.utilisation_pct }}%</span>
                  } @else { <span class="wh-meta">no capacity set</span> }
                </td>
                <td><span class="press {{ w.space_pressure }}">{{ w.space_pressure }}</span></td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No warehouses.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
      <dmis-panel title="Stockout forecast — at current 30-day dispatch velocity" icon="fa-hourglass-half">
        <table>
          <thead><tr><th>Resource</th><th>On hand</th><th>Daily use</th><th>Days to stockout</th></tr></thead>
          <tbody>
            @for (f of capacityData().stockout_forecast; track f.resource_id) {
              <tr><td><b>{{ f.resource_name }}</b></td><td>{{ f.on_hand }}</td><td>{{ f.daily_velocity }}/day</td>
                <td><span [class.low]="f.days_to_stockout <= 14">{{ f.days_to_stockout }} days</span></td></tr>
            } @empty { <tr><td colspan="4" class="empty">No consumption in the last 30 days to forecast from.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- ── Borrowing (inter-warehouse loans) ── -->
    @if (tab() === 'borrowing') {
      <dmis-panel title="Inter-warehouse loans" icon="fa-handshake-angle">
        <div class="toolbar">
          <button class="btn-sm b-red" (click)="borrow()"><i class="fas fa-hand-holding"></i> New Borrow</button>
        </div>
        <table>
          <thead><tr><th>Resource</th><th>Qty</th><th>Lender</th><th>Borrower</th><th>Borrowed</th><th>Due</th><th>Status</th><th>Outstanding</th><th></th></tr></thead>
          <tbody>
            @for (l of loansData(); track l.id) {
              <tr>
                <td><b>{{ l.resource_name }}</b></td><td>{{ l.quantity }}</td>
                <td>{{ l.lender_name }}</td><td>{{ l.borrower_name }}</td>
                <td>{{ l.borrowed_at }}</td>
                <td [class.low]="l.overdue">{{ l.due_date ?? '—' }} @if (l.overdue) { <span class="press full">overdue</span> }</td>
                <td><span class="press {{ l.status === 'Returned' ? 'ok' : 'high' }}">{{ l.status.replace('_', ' ') }}</span></td>
                <td>{{ l.outstanding_quantity }}</td>
                <td>@if (l.outstanding_quantity > 0) { <button class="btn-sm b-outline" (click)="returnLoan(l)"><i class="fas fa-rotate-left"></i> Return</button> }</td>
              </tr>
            } @empty { <tr><td colspan="9" class="empty">No loans recorded. Use "New Borrow" to lend stock between stores with a due date.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- ── Movements journal ── -->
    @if (tab() === 'movements') {
      <dmis-panel title="Stock Movements Journal" icon="fa-clock-rotate-left">
        <div class="toolbar">
          <select class="cond" style="width:auto" [(ngModel)]="movementFilter" (ngModelChange)="loadMovements()">
            <option value="">All movement types</option>
            @for (t of movementTypes; track t) { <option [value]="t">{{ t }}</option> }
          </select>
        </div>
        <table>
          <thead><tr><th>When</th><th>Type</th><th>Resource</th><th>Qty</th><th>From</th><th>To</th><th>Incident</th><th>By</th><th>Notes</th></tr></thead>
          <tbody>
            @for (m of movements(); track m.id) {
              <tr>
                <td style="white-space:nowrap">{{ m.created_at.substring(0, 16).replace('T', ' ') }}</td>
                <td><span class="mv-type mv-{{ m.movement_type }}">{{ m.movement_type }}</span></td>
                <td>{{ m.resource_name }}</td>
                <td>{{ m.quantity }}</td>
                <td>{{ m.from_warehouse_name ?? m.from_temp_warehouse_name ?? '—' }}</td>
                <td>{{ m.to_warehouse_name ?? m.to_temp_warehouse_name ?? '—' }}</td>
                <td>{{ m.incident_title ? '🔗 ' + m.incident_title : '—' }}</td>
                <td>{{ m.user_name ?? '—' }}</td>
                <td style="max-width:240px">{{ m.notes ?? '—' }}</td>
              </tr>
            } @empty { <tr><td colspan="9" class="empty">No stock movements recorded yet.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- ── Stock taking ── -->
    @if (tab() === 'stocktaking') {
      <dmis-panel title="Stock Taking (physical count)" icon="fa-clipboard-list">
        <div class="toolbar">
          <select class="cond" style="width:auto" [(ngModel)]="countWarehouseId" (ngModelChange)="loadSheet()">
            <option [ngValue]="null">Select zonal warehouse…</option>
            @for (w of warehouses(); track w.id) { <option [ngValue]="w.id">{{ w.name }}</option> }
          </select>
          @if (sheet().length) {
            <button class="btn-sm b-red" (click)="submitCount()"><i class="fas fa-check"></i> Post Count & Adjustments</button>
          }
        </div>
        <table>
          <thead><tr><th>Resource</th><th>Item</th><th>Book Qty</th><th>Counted</th><th>Condition</th><th>Remarks</th></tr></thead>
          <tbody>
            @for (i of sheet(); track i.id) {
              <tr>
                <td><b>{{ i.resource_name }}</b></td>
                <td>{{ i.item_name }}</td>
                <td>{{ i.quantity }}</td>
                <td><input class="count-input" type="number" min="0" [(ngModel)]="counts[i.id]"></td>
                <td><select class="cond" [(ngModel)]="conditions[i.id]">
                  <option value="good">Good</option><option value="damaged">Damaged</option><option value="expired">Expired</option>
                </select></td>
                <td><input style="width:170px" [(ngModel)]="remarks[i.id]" placeholder="Optional"></td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">Choose a warehouse to load its count sheet.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }
  `,
})
export class WarehouseOpsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private preselectId: number | null = null;
  private preselectType: 'zonal' | 'temporary' = 'zonal';

  readonly tab = signal<'stock' | 'movements' | 'stocktaking' | 'capacity' | 'borrowing'>('stock');
  readonly warehouses = signal<StoreCard[]>([]);
  readonly tempWarehouses = signal<StoreCard[]>([]);
  readonly alerts = signal<any>({});
  readonly lowStock = signal<any[]>([]);
  readonly store = signal<(StoreCard & { type: 'zonal' | 'temporary' }) | null>(null);
  readonly items = signal<StockLine[]>([]);
  readonly movements = signal<Movement[]>([]);
  readonly sheet = signal<StockLine[]>([]);
  readonly capacityData = signal<any>({ warehouses: [], network: {}, stockout_forecast: [] });
  readonly loansData = signal<any[]>([]);
  incidents: { id: number; title: string; status: string }[] = [];

  readonly movementTypes = ['Intake', 'Transfer', 'Dispatch', 'Removal', 'Deduction',
    'Adjustment_Increase', 'Adjustment_Decrease', 'Deployment'];
  removalReasons: Record<string, string> = {};
  resources: { id: number; name: string; unit_of_measure: string | null }[] = [];
  movementFilter = '';
  countWarehouseId: number | null = null;
  counts: Record<number, number> = {};
  conditions: Record<number, string> = {};
  remarks: Record<number, string> = {};

  ngOnInit(): void {
    ensureSweetAlert();
    // Deep-link from the warehouse registry "Manage Stock" action: ?warehouse=<id>&type=zonal|temporary
    const qp = this.route.snapshot.queryParamMap;
    const wid = qp.get('warehouse');
    if (wid) {
      this.preselectId = Number(wid);
      this.preselectType = qp.get('type') === 'temporary' ? 'temporary' : 'zonal';
    }
    this.load();
  }

  load(): void {
    this.http.get<any>('/api/v1/response/warehouse-ops').subscribe(d => {
      this.warehouses.set(d.warehouses);
      this.tempWarehouses.set(d.temporary_warehouses);
      this.alerts.set(d.alerts);
      this.lowStock.set(d.alerts.low_stock);
      this.removalReasons = d.removal_reasons;
      this.resources = d.resources;
      this.incidents = d.incidents ?? [];
      if (this.store()) {
        this.loadStock(); // refresh the open sheet after an action
      } else if (this.preselectId != null) {
        const list = this.preselectType === 'temporary' ? this.tempWarehouses() : this.warehouses();
        const card = list.find(w => w.id === this.preselectId);
        if (card) { this.selectStore(this.preselectType, card); }
        this.preselectId = null; // one-shot
      }
    });
  }

  isSelected(type: string, id: number): boolean {
    return this.store()?.type === type && this.store()?.id === id;
  }

  selectStore(type: 'zonal' | 'temporary', card: StoreCard): void {
    this.store.set({ ...card, type });
    this.loadStock();
  }

  private loadStock(): void {
    const s = this.store()!;
    this.http.get<any>('/api/v1/response/warehouse-ops/stock',
      { params: { warehouse_type: s.type, warehouse_id: String(s.id) } })
      .subscribe(d => this.items.set(d.items));
  }

  loadMovements(): void {
    this.tab.set('movements');
    const params: Record<string, string> = this.movementFilter ? { movement_type: this.movementFilter } : {};
    this.http.get<any>('/api/v1/response/warehouse-ops/movements', { params })
      .subscribe(d => this.movements.set(d.movements));
  }

  loadCapacity(): void {
    this.tab.set('capacity');
    this.http.get<any>('/api/v1/response/warehouse-ops/capacity').subscribe(d => this.capacityData.set(d));
  }

  loadLoans(): void {
    this.tab.set('borrowing');
    this.http.get<any>('/api/v1/response/warehouse-ops/loans').subscribe(d => this.loansData.set(d.loans));
  }

  /** Borrow stock between two stores with an optional due date + incident link. */
  borrow(): void {
    const stores = [
      ...this.warehouses().map(w => ({ v: `zonal:${w.id}`, n: `${w.name} (zonal)` })),
      ...this.tempWarehouses().map(w => ({ v: `temporary:${w.id}`, n: `${w.name} (${w.level ?? 'temp'})` })),
    ];
    const opts = stores.map(s => `<option value="${s.v}">${s.n}</option>`).join('');
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Borrow stock between stores',
      html: `<select id="bw-from" class="swal2-select" style="width:90%"><option value="">Lender (from)…</option>${opts}</select>
             <select id="bw-to" class="swal2-select" style="width:90%"><option value="">Borrower (to)…</option>${opts}</select>
             <select id="bw-res" class="swal2-select" style="width:90%">${this.resourceOptions()}</select>
             <input id="bw-qty" type="number" min="1" class="swal2-input" placeholder="Quantity">
             <input id="bw-due" type="date" class="swal2-input" title="Due date (optional)">
             ${this.incidentSelect('bw-inc')}
             <input id="bw-notes" class="swal2-input" placeholder="Notes (optional)">`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Borrow',
      preConfirm: () => {
        const from = (document.getElementById('bw-from') as HTMLSelectElement).value;
        const to = (document.getElementById('bw-to') as HTMLSelectElement).value;
        const qty = Number((document.getElementById('bw-qty') as HTMLInputElement).value);
        if (!from || !to) { Swal.showValidationMessage('Lender and borrower are required'); return false; }
        if (from === to) { Swal.showValidationMessage('Lender and borrower must differ'); return false; }
        if (!qty || qty <= 0) { Swal.showValidationMessage('Quantity is required'); return false; }
        const [ft, fi] = from.split(':'); const [tt, ti] = to.split(':');
        return {
          from_type: ft, from_id: Number(fi), to_type: tt, to_id: Number(ti),
          resource_id: Number((document.getElementById('bw-res') as HTMLSelectElement).value), quantity: qty,
          due_date: (document.getElementById('bw-due') as HTMLInputElement).value || null,
          incident_id: this.incidentVal('bw-inc'),
          notes: (document.getElementById('bw-notes') as HTMLInputElement).value || null,
        };
      },
    }).then((r: any) => { if (r.isConfirmed) { this.post('/api/v1/response/warehouse-ops/borrow', r.value); } }));
  }

  /** Record a full or partial return of an outstanding loan. */
  returnLoan(l: any): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: `Return — ${l.resource_name}`,
      html: `<p style="font-size:0.85rem;color:#475569">Outstanding <b>${l.outstanding_quantity}</b> · ${l.borrower_name} → ${l.lender_name}</p>
             <input id="rt-qty" type="number" min="1" max="${l.outstanding_quantity}" value="${l.outstanding_quantity}" class="swal2-input" placeholder="Quantity to return">`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Record Return',
      preConfirm: () => ({ quantity: Number((document.getElementById('rt-qty') as HTMLInputElement).value) || l.outstanding_quantity }),
    }).then((r: any) => { if (r.isConfirmed) { this.post(`/api/v1/response/warehouse-ops/loans/${l.id}/return`, r.value); } }));
  }

  /** Intake form: resource + quantity + batch/expiry/supplier into the selected store. */
  intake(): void {
    const s = this.store()!;
    ensureSweetAlert().then(() => Swal.fire({
      title: `Stock intake — ${s.name}`,
      html: `<select id="in-res" class="swal2-select" style="width:85%">${this.resourceOptions()}</select>
             <input id="in-qty" type="number" min="1" class="swal2-input" placeholder="Quantity">
             <input id="in-batch" class="swal2-input" placeholder="Batch number (optional)">
             <input id="in-expiry" type="date" class="swal2-input" title="Expiry date (optional)">
             <input id="in-supplier" class="swal2-input" placeholder="Supplier / donor (optional)">
             <input id="in-min" type="number" min="0" class="swal2-input" placeholder="Minimum threshold (optional)">
             ${this.incidentSelect('in-inc')}`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Add Stock',
      preConfirm: () => {
        const qty = Number((document.getElementById('in-qty') as HTMLInputElement).value);
        if (!qty || qty <= 0) { Swal.showValidationMessage('Quantity is required'); return false; }
        return {
          warehouse_type: s.type, warehouse_id: s.id,
          resource_id: Number((document.getElementById('in-res') as HTMLSelectElement).value),
          quantity: qty,
          batch_number: (document.getElementById('in-batch') as HTMLInputElement).value || null,
          expiry_date: (document.getElementById('in-expiry') as HTMLInputElement).value || null,
          supplier_donor: (document.getElementById('in-supplier') as HTMLInputElement).value || null,
          minimum_threshold: Number((document.getElementById('in-min') as HTMLInputElement).value) || 0,
          incident_id: this.incidentVal('in-inc'),
        };
      },
    }).then((r: any) => {
      if (r.isConfirmed) { this.post('/api/v1/response/warehouse-ops/intake', r.value); }
    }));
  }

  /** Removal form: resource + quantity + the source's verbatim reason list. */
  remove(): void {
    const s = this.store()!;
    const reasonOptions = Object.entries(this.removalReasons)
      .map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
    ensureSweetAlert().then(() => Swal.fire({
      title: `Remove stock — ${s.name}`,
      html: `<select id="rm-res" class="swal2-select" style="width:85%">${this.stockedResourceOptions()}</select>
             <input id="rm-qty" type="number" min="1" class="swal2-input" placeholder="Quantity">
             <select id="rm-reason" class="swal2-select" style="width:85%">${reasonOptions}</select>
             ${this.incidentSelect('rm-inc')}
             <input id="rm-notes" class="swal2-input" placeholder="Notes (optional)">`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Remove Stock',
      preConfirm: () => {
        const qty = Number((document.getElementById('rm-qty') as HTMLInputElement).value);
        if (!qty || qty <= 0) { Swal.showValidationMessage('Quantity is required'); return false; }
        return {
          warehouse_type: s.type, warehouse_id: s.id,
          resource_id: Number((document.getElementById('rm-res') as HTMLSelectElement).value),
          quantity: qty,
          reason: (document.getElementById('rm-reason') as HTMLSelectElement).value,
          notes: (document.getElementById('rm-notes') as HTMLInputElement).value || null,
          incident_id: this.incidentVal('rm-inc'),
        };
      },
    }).then((r: any) => {
      if (r.isConfirmed) { this.post('/api/v1/response/warehouse-ops/remove', r.value); }
    }));
  }

  /** Transfer form: resource + quantity from the open store into any other store. */
  transfer(): void {
    const s = this.store()!;
    const destinations = this.warehouses().filter(w => !(s.type === 'zonal' && w.id === s.id))
      .map(w => `<option value="zonal:${w.id}">${w.name} (zonal)</option>`).join('')
      + this.tempWarehouses().filter(w => !(s.type === 'temporary' && w.id === s.id))
        .map(w => `<option value="temporary:${w.id}">${w.name} (${w.level})</option>`).join('');
    ensureSweetAlert().then(() => Swal.fire({
      title: `Transfer stock — from ${s.name}`,
      html: `<select id="tr-res" class="swal2-select" style="width:85%">${this.stockedResourceOptions()}</select>
             <input id="tr-qty" type="number" min="1" class="swal2-input" placeholder="Quantity">
             <select id="tr-dest" class="swal2-select" style="width:85%">${destinations}</select>
             ${this.incidentSelect('tr-inc')}
             <input id="tr-notes" class="swal2-input" placeholder="Notes (optional)">`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Transfer',
      preConfirm: () => {
        const qty = Number((document.getElementById('tr-qty') as HTMLInputElement).value);
        if (!qty || qty <= 0) { Swal.showValidationMessage('Quantity is required'); return false; }
        const [toType, toId] = (document.getElementById('tr-dest') as HTMLSelectElement).value.split(':');
        return {
          from_type: s.type, from_id: s.id, to_type: toType, to_id: Number(toId),
          resource_id: Number((document.getElementById('tr-res') as HTMLSelectElement).value),
          quantity: qty,
          notes: (document.getElementById('tr-notes') as HTMLInputElement).value || null,
          incident_id: this.incidentVal('tr-inc'),
        };
      },
    }).then((r: any) => {
      if (r.isConfirmed) { this.post('/api/v1/response/warehouse-ops/transfer', r.value); }
    }));
  }

  // ── Stock taking ──

  loadSheet(): void {
    if (this.countWarehouseId == null) {
      this.sheet.set([]);
      return;
    }
    this.http.get<any>('/api/v1/response/warehouse-ops/stock-taking',
      { params: { warehouse_id: String(this.countWarehouseId) } })
      .subscribe(d => {
        this.sheet.set(d.items);
        this.counts = {};
        this.conditions = {};
        this.remarks = {};
        for (const i of d.items as StockLine[]) {
          this.counts[i.id] = i.quantity; // default to book quantity; auditor edits deviations
          this.conditions[i.id] = 'good';
        }
      });
  }

  submitCount(): void {
    const items = this.sheet().map(i => ({
      inventory_item_id: i.id,
      quantity_counted: this.counts[i.id] ?? i.quantity,
      condition: this.conditions[i.id] ?? 'good',
      remarks: this.remarks[i.id] || null,
    }));
    this.post('/api/v1/response/warehouse-ops/stock-taking',
      { warehouse_id: this.countWarehouseId, items });
  }

  // ── helpers ──

  private resourceOptions(): string {
    return this.resources.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
  }

  /** Optional "link this operation to an incident" selector (normal ops = none). */
  private incidentSelect(id: string): string {
    if (!this.incidents.length) { return ''; }
    return `<select id="${id}" class="swal2-select" style="width:90%">
      <option value="">— routine (no incident) —</option>
      ${this.incidents.map(i => `<option value="${i.id}">${i.title}</option>`).join('')}</select>`;
  }

  private incidentVal(id: string): number | null {
    const el = document.getElementById(id) as HTMLSelectElement | null;
    return el && el.value ? Number(el.value) : null;
  }

  /** For removal/transfer only resources present in the open store make sense. */
  private stockedResourceOptions(): string {
    const stocked = new Map(this.items().map(i => [i.resource_id, i.resource_name]));
    return [...stocked.entries()].map(([id, name]) => `<option value="${id}">${name}</option>`).join('');
  }

  private post(url: string, body: any): void {
    this.http.post<any>(url, body).subscribe({
      next: r => ensureSweetAlert().then(() => Swal.fire({
        icon: 'success', title: 'Done', text: r.message, timer: 2600, showConfirmButton: false,
      }).then(() => {
        this.load();
        if (this.tab() === 'stocktaking') { this.loadSheet(); }
        else if (this.tab() === 'borrowing') { this.loadLoans(); }
        else if (this.tab() === 'capacity') { this.loadCapacity(); }
      })),
      error: err => ensureSweetAlert().then(() =>
        Swal.fire('Error', err?.error?.detail ?? err?.error?.message ?? 'An error occurred.', 'error')),
    });
  }
}

// Module-scoped CDN loader, same pattern as the other response pages.
let swalPromise: Promise<void> | null = null;
function ensureSweetAlert(): Promise<void> {
  if (typeof Swal !== 'undefined') {
    return Promise.resolve();
  }
  if (!swalPromise) {
    swalPromise = new Promise(resolve => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/sweetalert2@11/dist/sweetalert2.min.css';
      document.head.appendChild(link);
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
      script.onload = () => resolve();
      document.body.appendChild(script);
    });
  }
  return swalPromise;
}
