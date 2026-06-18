import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

interface DonationRow {
  id: number; status: string; quantity_offered: number; unit_price: number; delivery_date: string;
  notes: string | null; created_at: string; allocated_resource_id: number | null;
  stakeholder_name: string; resource_name: string | null; unit_of_measure: string | null;
  incident_title: string | null;
}
interface NdmfRow {
  id: number; reference_number: string; donor_name: string; amount: number; currency: string;
  donation_date: string; purpose: string | null; status: string; recorded_by_name: string | null;
}

/**
 * Stakeholder donations centre — port of admin/resource-dispatch/
 * stakeholder-donations plus the NDMF cash-donation registry. Resource
 * donations are stakeholder bids (one table serves both this global queue and
 * the per-allocation bidding pool in the dispatch console); cash donations
 * are the National Disaster Management Fund ledger.
 */
@Component({
  selector: 'page-stakeholder-donations',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .stat b { font-size: 1.3rem; display: block; }
    .stat span { font-size: 0.72rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.4px; }
    .queue-tabs { display: flex; gap: 4px; background: #fff; border-bottom: 2px solid #e3e6ed; border-radius: 12px 12px 0 0; padding: 0 4px; margin-bottom: 12px; }
    .queue-tabs button { font-size: 0.82rem; font-weight: 600; color: #6c757d; border: none; background: none; padding: 10px 16px; border-bottom: 2px solid transparent; margin-bottom: -2px; cursor: pointer; font-family: inherit; }
    .queue-tabs button.active { color: #dc3545; border-bottom-color: #dc3545; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .chip { display: inline-block; font-size: 0.66rem; font-weight: 600; border-radius: 10px; padding: 1px 8px; }
    .c-Pending { background: #fef3c7; color: #92400e; } .c-Accepted { background: #d1fae5; color: #065f46; }
    .c-Received { background: #dbeafe; color: #1e40af; } .c-Rejected, .c-Withdrawn { background: #e2e8f0; color: #334155; }
    .c-pending { background: #fef3c7; color: #92400e; } .c-received { background: #d1fae5; color: #065f46; }
    .c-acknowledged { background: #dbeafe; color: #1e40af; }
    .btn-sm { font-size: 0.72rem; padding: 3px 10px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; }
    .b-red { background: #dc3545; color: #fff; } .b-green { background: #198754; color: #fff; }
    .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; }
    .toolbar { display: flex; gap: 6px; margin-bottom: 10px; align-items: center; }
    .toolbar select, .toolbar input { font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 5px 9px; font-family: inherit; }
    .empty { text-align: center; color: #94a3b8; padding: 30px 0; font-size: 0.85rem; }
    .fund-bal { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
    .fb { background: #fff; border: 1px solid #e3e6ed; border-radius: 12px; padding: 10px 16px; min-width: 180px; }
    .fb-cur { font-size: 0.72rem; font-weight: 800; color: #003366; text-transform: uppercase; letter-spacing: 0.5px; }
    .fb-row { display: flex; justify-content: space-between; gap: 18px; font-size: 0.8rem; color: #6c757d; margin-top: 3px; }
    .fb-row b { color: #334155; } .fb-row.bal { border-top: 1px dashed #e3e6ed; margin-top: 5px; padding-top: 5px; }
    .fb-row.bal b { color: #0f5132; font-size: 0.95rem; }
    .fb-empty { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; border-radius: 10px; padding: 10px 14px; font-size: 0.82rem; margin-bottom: 12px; }
    .c-pending { background: #fef3c7; color: #92400e; } .c-received { background: #d1fae5; color: #065f46; }
    .c-acknowledged { background: #dbeafe; color: #1e40af; } .c-paid { background: #d1fae5; color: #065f46; } .c-voided { background: #e2e8f0; color: #334155; }
  `],
  template: `
    <dmis-page-header title="Stakeholder Donations" icon="fa-hand-holding-heart"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Stakeholder Donations'}]">
      <a routerLink="/m/response/dispatch" class="btn-add"><i class="fas fa-truck-fast"></i> Dispatch Console</a>
    </dmis-page-header>

    <div class="stat-strip">
      <div class="stat"><b>{{ stats().total ?? 0 }}</b><span>Total Offers</span></div>
      <div class="stat"><b>{{ stats().pending ?? 0 }}</b><span>Pending Review</span></div>
      <div class="stat"><b>{{ stats().accepted ?? 0 }}</b><span>Accepted</span></div>
      <div class="stat"><b>{{ stats().received ?? 0 }}</b><span>Received</span></div>
      <div class="stat"><b>{{ stats().closed ?? 0 }}</b><span>Rejected / Withdrawn</span></div>
    </div>

    <div class="queue-tabs">
      <button [class.active]="tab() === 'resources'" (click)="tab.set('resources')">Resource Donations</button>
      <button [class.active]="tab() === 'cash'" (click)="tab.set('cash')">NDMF Cash Donations</button>
    </div>

    <!-- ── Resource donations (stakeholder bids across all allocations) ── -->
    @if (tab() === 'resources') {
      <dmis-panel title="Donation Offers" icon="fa-boxes-stacked">
        <div class="toolbar">
          <select [(ngModel)]="statusFilter" (ngModelChange)="load()">
            <option value="">All statuses</option>
            @for (s of ['Pending','Accepted','Received','Rejected','Withdrawn']; track s) { <option [value]="s">{{ s }}</option> }
          </select>
          <input placeholder="Search stakeholder / resource / incident…" [(ngModel)]="search" (keyup.enter)="load()">
          <button class="btn-sm b-outline" (click)="load()"><i class="fas fa-search"></i> Search</button>
        </div>
        <table>
          <thead><tr><th>Stakeholder</th><th>Resource / Incident</th><th>Offered</th><th>Unit Price</th><th>Delivery</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (b of donations(); track b.id) {
              <tr>
                <td><b>{{ b.stakeholder_name }}</b></td>
                <td>{{ b.resource_name ?? '—' }}<br><small style="color:#6c757d">{{ b.incident_title ?? '' }}</small></td>
                <td>{{ b.quantity_offered }} {{ b.unit_of_measure ?? '' }}</td>
                <td>{{ b.unit_price | number }}</td>
                <td>{{ b.delivery_date?.substring(0, 10) }}</td>
                <td><span class="chip c-{{ b.status }}">{{ b.status }}</span>
                  @if (b.notes) { <br><small style="color:#6c757d">{{ b.notes.substring(0, 60) }}</small> }</td>
                <td style="white-space:nowrap">
                  @if (b.status === 'Pending') {
                    <button class="btn-sm b-green" (click)="accept(b)"><i class="fas fa-check"></i> Accept</button>
                    <button class="btn-sm b-outline" (click)="dismiss(b)" style="margin-left:4px">Reject</button>
                  }
                  @if (b.status === 'Accepted') {
                    <button class="btn-sm b-red" (click)="receive(b)"><i class="fas fa-box-open"></i> Mark Received</button>
                  }
                </td>
              </tr>
            } @empty { <tr><td colspan="7" class="empty">No donation offers match the filter.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- ── NDMF fund: balance + cash-in (donations) + cash-out (disbursements) ── -->
    @if (tab() === 'cash') {
      <div class="fund-bal">
        @for (b of fund().balances ?? []; track b.currency) {
          <div class="fb"><span class="fb-cur">{{ b.currency }}</span>
            <div class="fb-row"><span>Cash in</span><b>{{ b.total_received | number }}</b></div>
            <div class="fb-row"><span>Disbursed</span><b>{{ b.total_disbursed | number }}</b></div>
            <div class="fb-row bal"><span>Balance</span><b>{{ b.balance | number }}</b></div>
          </div>
        } @empty { <div class="fb-empty"><i class="fas fa-circle-info"></i> No fund balance yet — mark a recorded donation as <b>received</b> below to make its cash available for disbursement.</div> }
      </div>

      <dmis-panel title="NDMF — Cash In (Donations)" icon="fa-sack-dollar">
        <div class="toolbar">
          <button class="btn-sm b-red" (click)="recordCash()"><i class="fas fa-plus"></i> Record Donation</button>
          <button class="btn-sm b-outline" (click)="disburseProcurement()"><i class="fas fa-truck-ramp-box"></i> Disburse to Procurement</button>
        </div>
        <table>
          <thead><tr><th>Reference</th><th>Donor</th><th>Amount</th><th>Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (d of ndmf(); track d.id) {
              <tr>
                <td><b>{{ d.reference_number }}</b>@if (d.purpose) { <br><small style="color:#6c757d">{{ d.purpose }}</small> }</td>
                <td>{{ d.donor_name }}</td>
                <td>{{ d.amount | number }} {{ d.currency }}</td>
                <td>{{ d.donation_date?.substring(0, 10) }}</td>
                <td><span class="chip c-{{ d.status }}">{{ d.status }}</span></td>
                <td style="white-space:nowrap">
                  @if (d.status === 'pending') { <button class="btn-sm b-green" (click)="markDonation(d, 'received')">Mark received</button> }
                  @if (d.status === 'received') { <button class="btn-sm b-outline" (click)="markDonation(d, 'acknowledged')">Acknowledge</button> }
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No cash donations recorded yet.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>

      <dmis-panel title="NDMF — Cash Out (Disbursements)" icon="fa-money-bill-transfer">
        <table>
          <thead><tr><th>Reference</th><th>Purpose</th><th>For</th><th>Amount</th><th>Date</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (x of fund().disbursements ?? []; track x.id) {
              <tr>
                <td><b>{{ x.reference_number }}</b></td>
                <td><span class="chip">{{ x.purpose_type }}</span></td>
                <td>{{ x.training_title || x.resource_name || x.payee || '—' }}@if (x.quantity) { <small style="color:#6c757d"> ×{{ x.quantity | number }}</small> }</td>
                <td>{{ x.amount | number }} {{ x.currency }}</td>
                <td>{{ x.disbursement_date?.substring(0,10) }}</td>
                <td><span class="chip c-{{ x.status }}">{{ x.status }}</span></td>
                <td>@if (x.status === 'paid') { <button class="btn-sm b-outline" (click)="voidDisbursement(x)">Void</button> }</td>
              </tr>
            } @empty { <tr><td colspan="7" class="empty">No disbursements yet. Use "Disburse to Procurement", or "Fund from NDMF" on a training in Open Needs.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }
  `,
})
export class StakeholderDonationsComponent implements OnInit {
  private readonly http = inject(HttpClient);

  readonly tab = signal<'resources' | 'cash'>('resources');
  readonly donations = signal<DonationRow[]>([]);
  readonly stats = signal<any>({});
  readonly ndmf = signal<NdmfRow[]>([]);
  readonly fund = signal<{ balances: any[]; disbursements: any[] }>({ balances: [], disbursements: [] });
  private refResources: { id: number; name: string }[] = [];
  private refWarehouses: { id: number; name: string }[] = [];
  statusFilter = '';
  search = '';

  ngOnInit(): void {
    ensureSweetAlert();
    this.load();
    this.loadNdmf();
    this.loadFund();
    this.http.get<any>('/api/v1/inventory/reference').subscribe(r => {
      this.refResources = r.resources ?? []; this.refWarehouses = r.warehouses ?? [];
    });
  }

  loadFund(): void {
    this.http.get<any>('/api/v1/response/bidding/ndmf-fund').subscribe(d =>
      this.fund.set({ balances: d.balances ?? [], disbursements: d.disbursements ?? [] }));
  }

  /** Advance a donation's arrival status so its cash counts toward the fund balance. */
  markDonation(d: NdmfRow, status: 'received' | 'acknowledged'): void {
    this.http.post<any>(`/api/v1/response/bidding/ndmf-donations/${d.id}/status`, { status }).subscribe({
      next: () => { this.loadNdmf(); this.loadFund(); },
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? err?.error?.message ?? 'Could not update.', 'error')),
    });
  }

  voidDisbursement(x: any): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Void this disbursement?', text: 'Cash is credited back to the fund. Already-received stock is not reversed.',
      icon: 'warning', showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Void',
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.http.post<any>(`/api/v1/response/bidding/ndmf-disbursements/${x.id}/void`, {}).subscribe({
          next: res => ensureSweetAlert().then(() => Swal.fire('Voided', res.message, 'success').then(() => this.loadFund())),
          error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? err?.error?.message ?? 'Could not void.', 'error')),
        });
      }
    }));
  }

  /** Disburse NDMF cash to procure resources straight into a warehouse. */
  disburseProcurement(): void {
    const resOpts = this.refResources.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
    const whOpts = this.refWarehouses.map(w => `<option value="${w.id}">${w.name}</option>`).join('');
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Disburse to procurement',
      html: `<select id="dp-res" class="swal2-select" style="width:85%">${resOpts}</select>
             <input id="dp-qty" type="number" min="1" class="swal2-input" placeholder="Quantity (units)">
             <input id="dp-amount" type="number" min="1" class="swal2-input" placeholder="Amount paid">
             <input id="dp-currency" class="swal2-input" placeholder="Currency (e.g. TZS)" value="TZS" maxlength="3">
             <select id="dp-wh" class="swal2-select" style="width:85%">${whOpts}</select>
             <input id="dp-supplier" class="swal2-input" placeholder="Supplier / payee">`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Disburse & receive stock',
      preConfirm: () => {
        const qty = Number((document.getElementById('dp-qty') as HTMLInputElement).value);
        const amount = Number((document.getElementById('dp-amount') as HTMLInputElement).value);
        if (!qty || qty <= 0 || !amount || amount <= 0) { Swal.showValidationMessage('Quantity and amount are required'); return false; }
        return {
          resource_id: Number((document.getElementById('dp-res') as HTMLSelectElement).value),
          quantity: qty, amount,
          currency: (document.getElementById('dp-currency') as HTMLInputElement).value || 'TZS',
          destination_type: 'warehouse',
          warehouse_id: Number((document.getElementById('dp-wh') as HTMLSelectElement).value),
          payee: (document.getElementById('dp-supplier') as HTMLInputElement).value || null,
          disbursement_date: new Date().toISOString().substring(0, 10),
        };
      },
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.http.post<any>('/api/v1/response/bidding/ndmf-disbursements/procurement', r.value).subscribe({
          next: res => ensureSweetAlert().then(() => Swal.fire('Done', res.message, 'success').then(() => this.loadFund())),
          error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? err?.error?.message ?? 'Could not disburse.', 'error')),
        });
      }
    }));
  }

  load(): void {
    const params: Record<string, string> = {};
    if (this.statusFilter) { params['status'] = this.statusFilter; }
    if (this.search) { params['search'] = this.search; }
    this.http.get<any>('/api/v1/response/bidding/donations', { params }).subscribe(d => {
      this.donations.set(d.donations);
      this.stats.set(d.stats);
    });
  }

  loadNdmf(): void {
    this.http.get<any>('/api/v1/response/bidding/ndmf-donations').subscribe(d => this.ndmf.set(d.donations));
  }

  accept(b: DonationRow): void {
    this.confirmThenPost(`Accept ${b.quantity_offered} ${b.resource_name ?? 'units'} from ${b.stakeholder_name}?`,
      `/api/v1/response/bidding/bids/${b.id}/accept`, 'notes', 'Acceptance notes (optional)', false);
  }

  dismiss(b: DonationRow): void {
    this.confirmThenPost(`Reject the offer from ${b.stakeholder_name}?`,
      `/api/v1/response/bidding/bids/${b.id}/dismiss`, 'reason', 'Rejection reason (min 10 characters)', true);
  }

  /** Receive dialog: destination store + actual quantity → donor-tracked intake. */
  receive(b: DonationRow): void {
    this.http.get<any>(`/api/v1/response/bidding/allocations/${b.allocated_resource_id}/pool`).subscribe(pool => {
      const options = pool.warehouses.map((w: any) => `<option value="warehouse:${w.id}">${w.name} (zonal)</option>`).join('')
        + pool.temporary_warehouses.map((w: any) => `<option value="temporary_warehouse:${w.id}">${w.name} (${w.level})</option>`).join('');
      ensureSweetAlert().then(() => Swal.fire({
        title: `Receive donation from ${b.stakeholder_name}`,
        html: `<select id="rc-dest" class="swal2-select" style="width:85%">${options}</select>
               <input id="rc-qty" type="number" min="1" class="swal2-input" placeholder="Quantity received" value="${b.quantity_offered}">
               <input id="rc-notes" class="swal2-input" placeholder="Notes (optional)">`,
        showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Receive into Store',
        preConfirm: () => {
          const qty = Number((document.getElementById('rc-qty') as HTMLInputElement).value);
          if (!qty || qty <= 0) { Swal.showValidationMessage('Quantity is required'); return false; }
          const [type, id] = (document.getElementById('rc-dest') as HTMLSelectElement).value.split(':');
          return {
            destination_type: type, received_quantity: qty,
            [type === 'warehouse' ? 'warehouse_id' : 'temporary_warehouse_id']: Number(id),
            notes: (document.getElementById('rc-notes') as HTMLInputElement).value || null,
          };
        },
      }).then((r: any) => {
        if (r.isConfirmed) { this.post(`/api/v1/response/bidding/bids/${b.id}/receive`, r.value); }
      }));
    });
  }

  /** NDMF cash entry form (donor, amount, currency, date, purpose). */
  recordCash(): void {
    ensureSweetAlert().then(() => Swal.fire({
      title: 'Record NDMF cash donation',
      html: `<input id="cd-donor" class="swal2-input" placeholder="Donor name">
             <input id="cd-amount" type="number" min="1" class="swal2-input" placeholder="Amount">
             <input id="cd-currency" class="swal2-input" placeholder="Currency (e.g. TZS)" value="TZS" maxlength="3">
             <input id="cd-date" type="date" class="swal2-input">
             <input id="cd-purpose" class="swal2-input" placeholder="Purpose (optional)">`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Record',
      preConfirm: () => {
        const donor = (document.getElementById('cd-donor') as HTMLInputElement).value.trim();
        const amount = Number((document.getElementById('cd-amount') as HTMLInputElement).value);
        const date = (document.getElementById('cd-date') as HTMLInputElement).value;
        if (!donor || !amount || !date) { Swal.showValidationMessage('Donor, amount and date are required'); return false; }
        return {
          donor_name: donor, amount,
          currency: (document.getElementById('cd-currency') as HTMLInputElement).value || 'TZS',
          donation_date: date,
          purpose: (document.getElementById('cd-purpose') as HTMLInputElement).value || null,
        };
      },
    }).then((r: any) => {
      if (r.isConfirmed) {
        this.http.post<any>('/api/v1/response/bidding/ndmf-donations', r.value).subscribe({
          next: res => ensureSweetAlert().then(() => Swal.fire({
            icon: 'success', title: res.reference_number, text: res.message, timer: 2600, showConfirmButton: false,
          }).then(() => this.loadNdmf())),
          error: err => ensureSweetAlert().then(() =>
            Swal.fire('Error', err?.error?.detail ?? 'An error occurred.', 'error')),
        });
      }
    }));
  }

  private confirmThenPost(title: string, url: string, field: string, inputLabel: string, required: boolean): void {
    ensureSweetAlert().then(() => Swal.fire({
      title, icon: 'question', showCancelButton: true, confirmButtonColor: '#dc3545',
      input: 'textarea', inputLabel,
      preConfirm: (value: string) => {
        if (required && (!value || value.trim().length < 10)) {
          Swal.showValidationMessage('Please provide at least 10 characters');
          return false;
        }
        return value;
      },
    }).then((r: any) => {
      if (r.isConfirmed) { this.post(url, { [field]: r.value || null }); }
    }));
  }

  private post(url: string, body: any): void {
    this.http.post<any>(url, body).subscribe({
      next: r => ensureSweetAlert().then(() => Swal.fire({
        icon: 'success', title: 'Done', text: r.message, timer: 2600, showConfirmButton: false,
      }).then(() => this.load())),
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
