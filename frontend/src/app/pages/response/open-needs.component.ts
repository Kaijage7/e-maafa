import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { AuthService } from '../../core/auth.service';

interface OpenAllocationRow {
  id: number; status: string; quantity_allocated: number; unit_of_measure: string;
  bid_deadline: string; committed_quantity: number; still_needed: number;
  resource_id: number; resource_name: string; category: string | null;
  incident_id: number; incident_title: string; severity_level: string | null;
  region_name: string | null; district_name: string | null;
}
interface UnfundedTrainingRow {
  id: number; training_id: string; training_title: string; implementing_institution: string;
  objective: string | null; geographical_scope: string | null; targeted_audience: string | null;
  venue: string | null; training_start_date: string | null; training_end_date: string | null;
  support_requested_at: string;
}

/**
 * Open Needs — the partner-facing discovery list of what the platform currently needs help with:
 * resource donation calls (allocations published for stakeholder bidding, still awaiting fulfilment)
 * and trainings whose funding support has been requested but is unfunded. Read-only: it surfaces the
 * need, how much is still required and how soon; the offer/accept lifecycle lives on the response
 * dispatch console, and an item drops off this list automatically once it is fulfilled or closed.
 */
@Component({
  selector: 'page-open-needs',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .stat b { font-size: 1.3rem; display: block; }
    .stat span { font-size: 0.72rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.4px; }
    .queue-tabs { display: flex; gap: 4px; background: #fff; border-bottom: 2px solid #e3e6ed; border-radius: 12px 12px 0 0; padding: 0 4px; margin-bottom: 12px; }
    .queue-tabs button { font-size: 0.82rem; font-weight: 600; color: #6c757d; border: none; background: none; padding: 10px 16px; border-bottom: 2px solid transparent; margin-bottom: -2px; cursor: pointer; font-family: inherit; }
    .queue-tabs button.active { color: #198754; border-bottom-color: #198754; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .chip { display: inline-block; font-size: 0.66rem; font-weight: 600; border-radius: 10px; padding: 1px 8px; background: #e2e8f0; color: #334155; }
    .chip.sev { background: #fee2e2; color: #991b1b; }
    .chip.urgent { background: #fef3c7; color: #92400e; }
    .tag { display: inline-block; font-size: 0.66rem; background: rgba(0,0,0,0.05); border-radius: 6px; padding: 1px 7px; margin: 1px 2px 1px 0; color: #475569; }
    .bar { height: 6px; border-radius: 4px; background: #e9eef3; overflow: hidden; margin-top: 4px; max-width: 160px; }
    .bar > span { display: block; height: 100%; background: #198754; }
    .needed { font-weight: 700; color: #0f5132; }
    .toolbar { display: flex; gap: 6px; margin-bottom: 10px; align-items: center; flex-wrap: wrap; }
    .toolbar input { font-size: 0.8rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 5px 9px; font-family: inherit; }
    .btn-sm { font-size: 0.72rem; padding: 5px 12px; border-radius: 7px; border: 1px solid #cbd5e1; background: #fff; color: #334155; cursor: pointer; font-family: inherit; font-weight: 600; }
    .empty { text-align: center; color: #94a3b8; padding: 30px 0; font-size: 0.85rem; }
    .muted { color: #6c757d; }
    .link-hint { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; border-radius: 10px; padding: 8px 12px; font-size: 0.8rem; margin-bottom: 12px; }
    .btn-donate { font-size: 0.74rem; font-weight: 700; padding: 5px 12px; border-radius: 7px; border: 1px solid #198754; background: #198754; color: #fff; cursor: pointer; font-family: inherit; white-space: nowrap; }
    .btn-donate:disabled { opacity: 0.55; cursor: default; }
    .dn-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .dn-modal { background: #fff; border-radius: 14px; padding: 1.2rem 1.3rem; width: min(440px, 92vw); box-shadow: 0 12px 40px rgba(0,0,0,0.25); }
    .dn-head { font-weight: 800; color: #0f5132; display: flex; align-items: center; gap: 0.45rem; font-size: 0.95rem; }
    .dn-need { margin: 0.6rem 0 0.9rem; font-size: 0.88rem; color: #334155; }
    .dn-l { display: block; font-size: 0.78rem; color: #475569; font-weight: 600; margin-bottom: 0.6rem; }
    .dn-l input, .dn-l select { display: block; width: 100%; margin-top: 3px; box-sizing: border-box; font-size: 0.84rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 9px; font-family: inherit; background: #fff; }
    .dn-error { background: #fee2e2; color: #991b1b; border-radius: 8px; padding: 0.5rem 0.7rem; font-size: 0.8rem; margin-bottom: 0.5rem; }
    .dn-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.3rem; }
  `],
  template: `
    <dmis-page-header title="Open Needs" icon="fa-hand-holding-heart"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Stakeholder Portal'}, {label:'Open Needs'}]">
    </dmis-page-header>

    <div class="stat-strip">
      <div class="stat"><b>{{ stats().openAllocations ?? 0 }}</b><span>Open Donation Calls</span></div>
      <div class="stat"><b>{{ stats().unfundedTrainings ?? 0 }}</b><span>Unfunded Trainings</span></div>
      <div class="stat"><b>{{ stats().urgent ?? 0 }}</b><span>Closing soon</span></div>
    </div>
    @if (stats().canPledge === false) {
      <div class="link-hint"><i class="fas fa-circle-info"></i> Your login isn't a linked partner, so "Record pledge" logs an offer <b>on a partner's behalf</b> (you choose the organisation). Partners who log in with a linked account donate as themselves.</div>
    }

    <div class="queue-tabs">
      <button [class.active]="tab() === 'donations'" (click)="tab.set('donations')">Donation Calls</button>
      <button [class.active]="tab() === 'trainings'" (click)="tab.set('trainings')">Training Support</button>
    </div>

    <!-- ── Resource donation calls awaiting fulfilment ── -->
    @if (tab() === 'donations') {
      <dmis-panel title="Resources needed — open for partner donations" icon="fa-boxes-stacked">
        <div class="toolbar">
          <input placeholder="Filter by region…" [(ngModel)]="region" (keyup.enter)="load()">
          <input placeholder="Filter by category…" [(ngModel)]="category" (keyup.enter)="load()">
          <button class="btn-sm" (click)="load()"><i class="fas fa-filter"></i> Apply</button>
          @if (region || category) { <button class="btn-sm" (click)="region=''; category=''; load()">Clear</button> }
        </div>
        <table>
          <thead><tr><th>Resource</th><th>Incident / Location</th><th>Still needed</th><th>Open until</th><th>Severity</th><th></th></tr></thead>
          <tbody>
            @for (a of allocations(); track a.id) {
              <tr>
                <td><b>{{ a.resource_name }}</b>@if (a.category) { <br><small class="muted">{{ a.category }}</small> }</td>
                <td>{{ a.incident_title }}<br><small class="muted">{{ location(a) }}</small></td>
                <td>
                  <span class="needed">{{ a.still_needed | number }}</span> <small class="muted">of {{ a.quantity_allocated | number }} {{ a.unit_of_measure }}</small>
                  <div class="bar"><span [style.width.%]="committedPct(a)"></span></div>
                </td>
                <td>{{ a.bid_deadline | date:'dd MMM yyyy' }}
                  @if (isUrgent(a.bid_deadline)) { <br><span class="chip urgent">closing soon</span> }</td>
                <td>@if (a.severity_level) { <span class="chip sev">{{ a.severity_level }}</span> } @else { — }</td>
                <td><button class="btn-donate" (click)="openDonate(a)"><i class="fas fa-hand-holding-heart"></i> {{ stats().canPledge ? 'Donate' : 'Record pledge' }}</button></td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No open donation calls right now. Published needs appear here, and drop off once fulfilled or closed.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- ── Trainings requesting funding support ── -->
    @if (tab() === 'trainings') {
      <dmis-panel title="Trainings needing funding support" icon="fa-graduation-cap">
        <table>
          <thead><tr><th>Training</th><th>Implementing Institution</th><th>Scope / Audience</th><th>Dates</th><th>Requested</th><th></th></tr></thead>
          <tbody>
            @for (t of trainings(); track t.id) {
              <tr>
                <td><b>{{ t.training_title }}</b><br><small class="muted">{{ t.training_id }}</small>
                  @if (t.objective) { <br><small class="muted">{{ t.objective }}</small> }</td>
                <td>{{ t.implementing_institution }}@if (t.venue) { <br><small class="muted">{{ t.venue }}</small> }</td>
                <td>
                  @for (s of jsonList(t.geographical_scope); track s) { <span class="tag">{{ s }}</span> }
                  @for (au of jsonList(t.targeted_audience); track au) { <span class="tag">{{ au }}</span> }
                </td>
                <td>{{ t.training_start_date | date:'dd MMM yyyy' }}@if (t.training_end_date) { <br><small class="muted">→ {{ t.training_end_date | date:'dd MMM yyyy' }}</small> }</td>
                <td>{{ t.support_requested_at | date:'dd MMM yyyy' }}</td>
                <td>@if (canDisburse) { <button class="btn-donate" (click)="openFund(t)"><i class="fas fa-money-bill-transfer"></i> Fund from NDMF</button> }</td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No trainings are awaiting funding support.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- donate / pledge dialog -->
    @if (donating(); as a) {
      <div class="dn-overlay" (click)="closeDonate()">
        <div class="dn-modal" (click)="$event.stopPropagation()">
          <div class="dn-head"><i class="fas fa-hand-holding-heart"></i> {{ stats().canPledge ? 'Pledge a donation' : 'Record a pledge for a partner' }}</div>
          <div class="dn-need">{{ a.resource_name }} · <b>{{ a.still_needed | number }}</b> {{ a.unit_of_measure }} still needed
            <br><small class="muted">{{ a.incident_title }} — open until {{ a.bid_deadline | date:'dd MMM yyyy' }}</small></div>
          @if (!stats().canPledge) {
            <label class="dn-l">Donating partner
              <select [(ngModel)]="dnStakeholderId">
                <option [ngValue]="null">Select partner organisation…</option>
                @for (s of stakeholders(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }
              </select>
            </label>
          }
          <label class="dn-l">Quantity you can provide ({{ a.unit_of_measure }})
            <input type="number" min="1" [(ngModel)]="dnQuantity" placeholder="e.g. 50"></label>
          <label class="dn-l">Unit price (optional, TZS)
            <input type="number" min="0" [(ngModel)]="dnUnitPrice" placeholder="0 if donated free"></label>
          <label class="dn-l">Expected delivery date
            <input type="date" [(ngModel)]="dnDeliveryDate"></label>
          <label class="dn-l">Notes (optional)
            <input type="text" [(ngModel)]="dnNotes" placeholder="Anything PMO should know"></label>
          @if (donateError()) { <div class="dn-error">{{ donateError() }}</div> }
          <div class="dn-actions">
            <button class="btn-sm" (click)="closeDonate()">Cancel</button>
            <button class="btn-donate" [disabled]="dnSaving() || !dnQuantity || dnQuantity <= 0 || !dnDeliveryDate || (!stats().canPledge && !dnStakeholderId)" (click)="confirmDonate()">
              {{ dnSaving() ? 'Submitting…' : (stats().canPledge ? 'Submit pledge' : 'Record pledge') }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- fund-a-training-from-NDMF dialog -->
    @if (funding(); as t) {
      <div class="dn-overlay" (click)="closeFund()">
        <div class="dn-modal" (click)="$event.stopPropagation()">
          <div class="dn-head"><i class="fas fa-money-bill-transfer"></i> Fund training from NDMF</div>
          <div class="dn-need">{{ t.training_title }}<br><small class="muted">{{ t.implementing_institution }} — paid from the National Disaster Management Fund</small></div>
          <label class="dn-l">Amount to disburse
            <input type="number" min="1" [(ngModel)]="ftAmount" placeholder="e.g. 5000000"></label>
          <label class="dn-l">Currency
            <input type="text" maxlength="3" [(ngModel)]="ftCurrency" placeholder="TZS"></label>
          <label class="dn-l">Payee (institution, optional)
            <input type="text" [(ngModel)]="ftPayee" [placeholder]="t.implementing_institution"></label>
          @if (fundError()) { <div class="dn-error">{{ fundError() }}</div> }
          <div class="dn-actions">
            <button class="btn-sm" (click)="closeFund()">Cancel</button>
            <button class="btn-donate" [disabled]="ftSaving() || !ftAmount || ftAmount <= 0 || ftCurrency.length !== 3" (click)="confirmFund()">
              {{ ftSaving() ? 'Disbursing…' : 'Disburse from NDMF' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class OpenNeedsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  // Disbursing NDMF cash is a finance/oversight action (mirrors the RESPONSE_OVERSIGHT backend gate).
  readonly canDisburse = ['Super Admin', 'ICT Admin', 'EOCC', 'Director', 'Asst. Director'].some(r => this.auth.hasRole(r));

  // fund-a-training dialog
  readonly funding = signal<UnfundedTrainingRow | null>(null);
  readonly ftSaving = signal(false);
  readonly fundError = signal('');
  ftAmount: number | null = null;
  ftCurrency = 'TZS';
  ftPayee = '';

  readonly tab = signal<'donations' | 'trainings'>('donations');
  readonly allocations = signal<OpenAllocationRow[]>([]);
  readonly trainings = signal<UnfundedTrainingRow[]>([]);
  readonly stats = signal<any>({});
  readonly stakeholders = signal<{ id: number; name: string }[]>([]);
  region = '';
  category = '';

  // donate dialog
  readonly donating = signal<OpenAllocationRow | null>(null);
  readonly dnSaving = signal(false);
  readonly donateError = signal('');
  dnStakeholderId: number | null = null;
  dnQuantity: number | null = null;
  dnUnitPrice: number | null = null;
  dnDeliveryDate = '';
  dnNotes = '';

  ngOnInit(): void { this.load(); }

  openDonate(a: OpenAllocationRow): void {
    this.donateError.set('');
    this.dnStakeholderId = null;
    this.dnQuantity = null; this.dnUnitPrice = null; this.dnDeliveryDate = ''; this.dnNotes = '';
    this.donating.set(a);
  }

  closeDonate(): void { this.donating.set(null); }

  openFund(t: UnfundedTrainingRow): void {
    this.fundError.set('');
    this.ftAmount = null; this.ftCurrency = 'TZS'; this.ftPayee = t.implementing_institution ?? '';
    this.funding.set(t);
  }

  closeFund(): void { this.funding.set(null); }

  confirmFund(): void {
    const t = this.funding();
    if (!t || !this.ftAmount || this.ftAmount <= 0 || this.ftCurrency.length !== 3) { return; }
    this.ftSaving.set(true);
    this.fundError.set('');
    this.http.post<any>('/api/v1/response/bidding/ndmf-disbursements/training', {
      training_plan_id: t.id,
      amount: this.ftAmount,
      currency: this.ftCurrency.toUpperCase(),
      payee: this.ftPayee || null,
      disbursement_date: new Date().toISOString().substring(0, 10),
    }).subscribe({
      next: () => { this.ftSaving.set(false); this.funding.set(null); this.load(); },
      error: err => {
        this.ftSaving.set(false);
        this.fundError.set(err?.error?.detail ?? err?.error?.message ?? 'Could not disburse from NDMF.');
      },
    });
  }

  confirmDonate(): void {
    const a = this.donating();
    if (!a || !this.dnQuantity || this.dnQuantity <= 0 || !this.dnDeliveryDate) { return; }
    const onBehalf = !this.stats().canPledge;
    if (onBehalf && !this.dnStakeholderId) { return; }
    this.dnSaving.set(true);
    this.donateError.set('');
    const base: any = {
      allocated_resource_id: a.id,
      quantity_offered: this.dnQuantity,
      unit_price: this.dnUnitPrice ?? 0,
      delivery_date: this.dnDeliveryDate,
      notes: this.dnNotes || null,
    };
    // Linked partner → self-service pledge (donor resolved server-side); staff → on-behalf bid with chosen org.
    const url = onBehalf ? '/api/v1/response/bidding/bids' : '/api/v1/response/bidding/pledge';
    const payload = onBehalf ? { ...base, stakeholder_id: this.dnStakeholderId } : base;
    this.http.post<any>(url, payload).subscribe({
      next: () => { this.dnSaving.set(false); this.donating.set(null); this.load(); },
      error: err => {
        this.dnSaving.set(false);
        this.donateError.set(err?.error?.detail ?? err?.error?.message ?? 'Could not submit the pledge.');
      },
    });
  }

  load(): void {
    const params: Record<string, string> = {};
    if (this.region) { params['region'] = this.region; }
    if (this.category) { params['category'] = this.category; }
    this.http.get<any>('/api/v1/response/bidding/open-needs', { params }).subscribe(d => {
      this.allocations.set(d.allocations ?? []);
      this.trainings.set(d.trainings ?? []);
      this.stats.set(d.stats ?? {});
      this.stakeholders.set(d.stakeholders ?? []);
    });
  }

  location(a: OpenAllocationRow): string {
    return [a.district_name, a.region_name].filter(Boolean).join(', ') || '—';
  }

  committedPct(a: OpenAllocationRow): number {
    const allocated = Number(a.quantity_allocated) || 0;
    if (allocated <= 0) { return 0; }
    return Math.min(100, Math.round((Number(a.committed_quantity) / allocated) * 100));
  }

  isUrgent(deadline: string | null): boolean {
    if (!deadline) { return false; }
    const days = (new Date(deadline).getTime() - Date.now()) / 86400000;
    return days <= 3;
  }

  /** Render a JSON-text array column (geographical_scope / targeted_audience) as a clean list. */
  jsonList(value: string | null): string[] {
    if (!value) { return []; }
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(v => String(v)).filter(v => v.trim()) : [String(parsed)];
    } catch {
      return [value];
    }
  }
}
