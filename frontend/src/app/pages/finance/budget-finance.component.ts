import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { AuthService } from '../../core/auth.service';

interface BudgetRow {
  id: number; title: string | null; scope_level: string; district_id: number | null; region_id: number | null;
  total_amount: number; currency: string; status: string; period_name: string;
  district_name: string | null; region_name: string | null;
  allocated: number; committed: number; disbursed: number;
}
interface PeriodRow { id: number; name: string; fiscal_year: string | null; status: string; is_active: boolean; }
interface DonationRow {
  id: number; donor_name: string; amount: number; currency: string; donation_date: string | null;
  purpose: string | null; status: string; earmark_type: number; earmark_purpose: string | null;
  earmark_incident_id: number | null; earmark_incident_title: string | null; disbursed: number; remaining: number;
}
interface Opt { id: number; name: string; }

/**
 * Disaster Budget &amp; Finance — the cash side of the incident chain. Area-scoped fiscal budgets with a
 * commitment≠expenditure reconciliation roll-up, and the NDMF fund (donor cash, earmarked and ring-fenced,
 * disbursed to an incident). Maker-checker commitment + virement management lives on the budget detail page.
 * Everything is permission-gated to mirror the backend ({@code budget_and_finance.*}).
 */
@Component({
  selector: 'page-budget-finance',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .stat b { font-size: 1.25rem; display: block; color: #0f5132; }
    .stat span { font-size: 0.7rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.4px; }
    .stat small { font-size: 0.68rem; color: #94a3b8; }
    .queue-tabs { display: flex; gap: 4px; background: #fff; border-bottom: 2px solid #e3e6ed; border-radius: 12px 12px 0 0; padding: 0 4px; margin-bottom: 12px; }
    .queue-tabs button { font-size: 0.82rem; font-weight: 600; color: #6c757d; border: none; background: none; padding: 10px 16px; border-bottom: 2px solid transparent; margin-bottom: -2px; cursor: pointer; font-family: inherit; }
    .queue-tabs button.active { color: #0d6efd; border-bottom-color: #0d6efd; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    tr.clickable:hover { background: #f8fafc; cursor: pointer; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .chip { display: inline-block; font-size: 0.66rem; font-weight: 600; border-radius: 10px; padding: 1px 8px; background: #e2e8f0; color: #334155; text-transform: capitalize; }
    .chip.active, .chip.acknowledged, .chip.received { background: #dcfce7; color: #166534; }
    .chip.draft, .chip.pending { background: #fef3c7; color: #92400e; }
    .chip.scope { background: #e0e7ff; color: #3730a3; }
    .chip.ear4 { background: #fee2e2; color: #991b1b; }
    .chip.ear3 { background: #ffedd5; color: #9a3412; }
    .chip.ear2 { background: #fef9c3; color: #854d0e; }
    .chip.ear1 { background: #ecfeff; color: #155e75; }
    .bar { height: 6px; border-radius: 4px; background: #e9eef3; overflow: hidden; margin-top: 3px; max-width: 150px; }
    .bar > span { display: block; height: 100%; }
    .bar > span.c { background: #f59e0b; }
    .bar > span.d { background: #198754; }
    .toolbar { display: flex; gap: 6px; margin-bottom: 10px; align-items: center; flex-wrap: wrap; }
    .btn-sm { font-size: 0.72rem; padding: 5px 12px; border-radius: 7px; border: 1px solid #cbd5e1; background: #fff; color: #334155; cursor: pointer; font-family: inherit; font-weight: 600; }
    .btn-pri { font-size: 0.74rem; font-weight: 700; padding: 5px 12px; border-radius: 7px; border: 1px solid #0d6efd; background: #0d6efd; color: #fff; cursor: pointer; font-family: inherit; }
    .btn-pri:disabled { opacity: 0.55; cursor: default; }
    .empty { text-align: center; color: #94a3b8; padding: 30px 0; font-size: 0.85rem; }
    .muted { color: #6c757d; }
    .dn-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.45); display: flex; align-items: center; justify-content: center; z-index: 1000; }
    .dn-modal { background: #fff; border-radius: 14px; padding: 1.2rem 1.3rem; width: min(460px, 92vw); box-shadow: 0 12px 40px rgba(0,0,0,0.25); max-height: 90vh; overflow:auto; }
    .dn-head { font-weight: 800; color: #1e3a8a; display: flex; align-items: center; gap: 0.45rem; font-size: 0.95rem; margin-bottom: 0.7rem; }
    .dn-l { display: block; font-size: 0.78rem; color: #475569; font-weight: 600; margin-bottom: 0.6rem; }
    .dn-l input, .dn-l select { display: block; width: 100%; margin-top: 3px; box-sizing: border-box; font-size: 0.84rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 9px; font-family: inherit; background: #fff; }
    .dn-error { background: #fee2e2; color: #991b1b; border-radius: 8px; padding: 0.5rem 0.7rem; font-size: 0.8rem; margin-bottom: 0.5rem; }
    .dn-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 0.3rem; }
  `],
  template: `
    <dmis-page-header title="Budget & Finance" icon="fa-coins"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Budget & Finance'}]">
    </dmis-page-header>

    <div class="stat-strip">
      <div class="stat"><b>{{ totals().allocated | number }}</b><span>Allocated (TZS)</span></div>
      <div class="stat"><b>{{ totals().committed | number }}</b><span>Committed</span><br><small>obligated, not yet paid</small></div>
      <div class="stat"><b>{{ totals().disbursed | number }}</b><span>Expended</span><br><small>actually paid out</small></div>
      <div class="stat"><b>{{ ndmfSummary().balance ?? 0 | number }}</b><span>NDMF Balance</span><br><small>received − disbursed</small></div>
    </div>

    <div class="queue-tabs">
      <button [class.active]="tab() === 'budgets'" (click)="tab.set('budgets')">Budgets</button>
      <button [class.active]="tab() === 'ndmf'" (click)="tab.set('ndmf')">NDMF Fund</button>
      <button [class.active]="tab() === 'thresholds'" (click)="tab.set('thresholds')">Approval Ceilings</button>
    </div>

    <!-- ── Budgets ── -->
    @if (tab() === 'budgets') {
      <dmis-panel title="Disaster budgets" icon="fa-wallet">
        @if (canManage) {
          <div class="toolbar">
            <button class="btn-sm" (click)="openPeriod()"><i class="fas fa-calendar-plus"></i> New Period</button>
            <button class="btn-pri" (click)="openBudget()"><i class="fas fa-plus"></i> New Budget</button>
          </div>
        }
        <table>
          <thead><tr>
            <th>Budget</th><th>Period</th><th>Scope</th>
            <th class="num">Allocated</th><th class="num">Committed</th><th class="num">Expended</th><th>Status</th>
          </tr></thead>
          <tbody>
            @for (b of budgets(); track b.id) {
              <tr class="clickable" [routerLink]="['/m/budget-finance/budgets', b.id]">
                <td><b>{{ b.title || ('Budget #' + b.id) }}</b></td>
                <td>{{ b.period_name }}</td>
                <td><span class="chip scope">{{ b.scope_level }}</span>
                  @if (area(b)) { <br><small class="muted">{{ area(b) }}</small> }</td>
                <td class="num">{{ b.allocated | number }}</td>
                <td class="num">{{ b.committed | number }}
                  <div class="bar"><span class="c" [style.width.%]="pct(b.committed, b.allocated)"></span></div></td>
                <td class="num">{{ b.disbursed | number }}
                  <div class="bar"><span class="d" [style.width.%]="pct(b.disbursed, b.allocated)"></span></div></td>
                <td><span class="chip {{ b.status }}">{{ b.status }}</span></td>
              </tr>
            } @empty { <tr><td colspan="7" class="empty">No budgets in your scope yet.@if (canManage) { Create a period, then a budget. }</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- ── NDMF Fund ── -->
    @if (tab() === 'ndmf') {
      <dmis-panel title="National Disaster Management Fund" icon="fa-hand-holding-dollar">
        <div class="stat-strip" style="grid-template-columns: repeat(3,1fr);">
          <div class="stat"><b>{{ ndmfSummary().received ?? 0 | number }}</b><span>Received (TZS)</span></div>
          <div class="stat"><b>{{ ndmfSummary().disbursed ?? 0 | number }}</b><span>Disbursed</span></div>
          <div class="stat"><b>{{ ndmfSummary().balance ?? 0 | number }}</b><span>Balance</span></div>
        </div>
        <table>
          <thead><tr><th>Donor</th><th>Earmark</th><th class="num">Amount</th><th class="num">Remaining</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (d of donations(); track d.id) {
              <tr>
                <td><b>{{ d.donor_name }}</b>@if (d.purpose) { <br><small class="muted">{{ d.purpose }}</small> }</td>
                <td><span class="chip ear{{ d.earmark_type }}">{{ earmarkLabel(d.earmark_type) }}</span>
                  @if (d.earmark_incident_title) { <br><small class="muted">→ {{ d.earmark_incident_title }}</small> }</td>
                <td class="num">{{ d.amount | number }} {{ d.currency }}</td>
                <td class="num">{{ d.remaining | number }}</td>
                <td><span class="chip {{ d.status }}">{{ d.status }}</span></td>
                <td>@if (canDisburse && d.remaining > 0 && d.status !== 'pending') {
                  <button class="btn-pri" (click)="openDisburse(d)"><i class="fas fa-money-bill-transfer"></i> Disburse</button> }</td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No donations recorded.</td></tr> }
          </tbody>
        </table>
        @if (canDisburse) { <div class="toolbar" style="margin-top:10px;">
          <button class="btn-sm" (click)="openDisburse(null)"><i class="fas fa-money-bill-transfer"></i> Disburse unlinked fund cash</button>
        </div> }
      </dmis-panel>
    }

    <!-- ── Approval ceilings ── -->
    @if (tab() === 'thresholds') {
      <dmis-panel title="Tier approval ceilings" icon="fa-gauge-high">
        <p class="muted" style="font-size:0.8rem;">A commitment above its budget tier's ceiling must be funded from a higher-tier budget. Operational defaults — set by PMO policy.</p>
        <table style="max-width:480px;">
          <thead><tr><th>Tier</th><th class="num">Ceiling (TZS)</th>@if (canApprove) { <th></th> }</tr></thead>
          <tbody>
            @for (t of thresholds(); track t.scope_level) {
              <tr>
                <td><span class="chip scope">{{ t.scope_level }}</span></td>
                <td class="num">{{ t.max_amount == null ? 'Unlimited' : (t.max_amount | number) }}</td>
                @if (canApprove) { <td><button class="btn-sm" (click)="editThreshold(t)">Edit</button></td> }
              </tr>
            }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- New Period dialog -->
    @if (showPeriod()) {
      <div class="dn-overlay" (click)="showPeriod.set(false)"><div class="dn-modal" (click)="$event.stopPropagation()">
        <div class="dn-head"><i class="fas fa-calendar-plus"></i> New budget period</div>
        <label class="dn-l">Name<input [(ngModel)]="pName" placeholder="e.g. FY 2025/26"></label>
        <label class="dn-l">Fiscal year<input [(ngModel)]="pFy" placeholder="2025/26"></label>
        <label class="dn-l">Start date<input type="date" [(ngModel)]="pStart"></label>
        <label class="dn-l">End date<input type="date" [(ngModel)]="pEnd"></label>
        @if (err()) { <div class="dn-error">{{ err() }}</div> }
        <div class="dn-actions"><button class="btn-sm" (click)="showPeriod.set(false)">Cancel</button>
          <button class="btn-pri" [disabled]="saving() || !pName" (click)="savePeriod()">{{ saving() ? 'Saving…' : 'Create' }}</button></div>
      </div></div>
    }

    <!-- New Budget dialog -->
    @if (showBudget()) {
      <div class="dn-overlay" (click)="showBudget.set(false)"><div class="dn-modal" (click)="$event.stopPropagation()">
        <div class="dn-head"><i class="fas fa-wallet"></i> New disaster budget</div>
        <label class="dn-l">Title<input [(ngModel)]="bTitle" placeholder="e.g. Dodoma flood response"></label>
        <label class="dn-l">Period<select [(ngModel)]="bPeriod">
          <option [ngValue]="null">Select period…</option>
          @for (p of periods(); track p.id) { <option [ngValue]="p.id">{{ p.name }}</option> }
        </select></label>
        <label class="dn-l">Tier<select [(ngModel)]="bScope" (ngModelChange)="onScopeChange()">
          <option value="district">District</option><option value="region">Region</option><option value="national">National</option>
        </select></label>
        @if (bScope !== 'national') {
          <label class="dn-l">Region<select [(ngModel)]="bRegionId" (ngModelChange)="loadDistricts($event)">
            <option [ngValue]="null">Select region…</option>
            @for (r of regions(); track r.id) { <option [ngValue]="r.id">{{ r.name }}</option> }
          </select></label>
        }
        @if (bScope === 'district') {
          <label class="dn-l">District<select [(ngModel)]="bDistrictId">
            <option [ngValue]="null">Select district…</option>
            @for (d of districts(); track d.id) { <option [ngValue]="d.id">{{ d.name }}</option> }
          </select></label>
        }
        <label class="dn-l">Total amount (TZS)<input type="number" min="0" [(ngModel)]="bTotal" placeholder="e.g. 100000000"></label>
        @if (err()) { <div class="dn-error">{{ err() }}</div> }
        <div class="dn-actions"><button class="btn-sm" (click)="showBudget.set(false)">Cancel</button>
          <button class="btn-pri" [disabled]="saving() || !bPeriod || (bScope==='district' && !bDistrictId) || (bScope==='region' && !bRegionId)" (click)="saveBudget()">{{ saving() ? 'Saving…' : 'Create' }}</button></div>
      </div></div>
    }

    <!-- NDMF disburse dialog -->
    @if (disbursing() !== undefined) {
      <div class="dn-overlay" (click)="disbursing.set(undefined)"><div class="dn-modal" (click)="$event.stopPropagation()">
        <div class="dn-head"><i class="fas fa-money-bill-transfer"></i> Disburse NDMF cash to an incident</div>
        @if (disbursing(); as d) {
          <div class="dn-l" style="font-weight:700;">From: {{ d.donor_name }} — {{ d.remaining | number }} {{ d.currency }} remaining
            @if (d.earmark_type === 4 && d.earmark_incident_title) { <br><small class="muted" style="font-weight:500;">Tightly earmarked to {{ d.earmark_incident_title }}</small> }</div>
        } @else {
          <div class="muted" style="font-size:0.78rem; margin-bottom:0.6rem;">Unlinked disbursement — drawn from the fund balance ({{ ndmfSummary().balance ?? 0 | number }} TZS).</div>
        }
        <label class="dn-l">Incident<select [(ngModel)]="dIncidentId">
          <option [ngValue]="null">Select incident…</option>
          @for (i of incidents(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }
        </select></label>
        <label class="dn-l">Amount (TZS)<input type="number" min="1" [(ngModel)]="dAmount" placeholder="e.g. 5000000"></label>
        <label class="dn-l">Payee (optional)<input [(ngModel)]="dPayee" placeholder="Who is paid"></label>
        <label class="dn-l">Notes (optional)<input [(ngModel)]="dNotes"></label>
        @if (err()) { <div class="dn-error">{{ err() }}</div> }
        <div class="dn-actions"><button class="btn-sm" (click)="disbursing.set(undefined)">Cancel</button>
          <button class="btn-pri" [disabled]="saving() || !dIncidentId || !dAmount || dAmount <= 0" (click)="saveDisburse()">{{ saving() ? 'Disbursing…' : 'Disburse' }}</button></div>
      </div></div>
    }
  `,
})
export class BudgetFinanceComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly canView = this.auth.hasPermission('budget_and_finance.view');
  readonly canManage = this.auth.hasPermission('budget_and_finance.manage');
  readonly canApprove = this.auth.hasPermission('budget_and_finance.approve');
  readonly canDisburse = this.auth.hasPermission('budget_and_finance.disburse');

  readonly tab = signal<'budgets' | 'ndmf' | 'thresholds'>('budgets');
  readonly budgets = signal<BudgetRow[]>([]);
  readonly periods = signal<PeriodRow[]>([]);
  readonly donations = signal<DonationRow[]>([]);
  readonly ndmfSummary = signal<{ received?: number; disbursed?: number; balance?: number }>({});
  readonly thresholds = signal<{ scope_level: string; max_amount: number | null }[]>([]);
  readonly regions = signal<Opt[]>([]);
  readonly districts = signal<Opt[]>([]);
  readonly incidents = signal<Opt[]>([]);

  readonly totals = computed(() => this.budgets().reduce((a, b) => ({
    allocated: a.allocated + (+b.allocated || 0),
    committed: a.committed + (+b.committed || 0),
    disbursed: a.disbursed + (+b.disbursed || 0),
  }), { allocated: 0, committed: 0, disbursed: 0 }));

  readonly saving = signal(false);
  readonly err = signal('');

  // dialogs
  readonly showPeriod = signal(false);
  readonly showBudget = signal(false);
  // undefined = closed; null = unlinked; DonationRow = from that donation
  readonly disbursing = signal<DonationRow | null | undefined>(undefined);

  pName = ''; pFy = ''; pStart = ''; pEnd = '';
  bTitle = ''; bPeriod: number | null = null; bScope = 'district'; bRegionId: number | null = null; bDistrictId: number | null = null; bTotal: number | null = null;
  dIncidentId: number | null = null; dAmount: number | null = null; dPayee = ''; dNotes = '';

  ngOnInit(): void {
    this.loadBudgets();
    this.loadNdmf();
    if (this.canManage) { this.http.get<any>('/api/v1/finance/periods').subscribe(d => this.periods.set(d.periods ?? [])); }
    this.http.get<any>('/api/v1/finance/thresholds').subscribe(d => this.thresholds.set(d.thresholds ?? []));
  }

  loadBudgets(): void {
    this.http.get<any>('/api/v1/finance/budgets').subscribe(d => this.budgets.set(d.budgets ?? []));
  }
  loadNdmf(): void {
    this.http.get<any>('/api/v1/finance/ndmf/donations').subscribe(d => {
      this.donations.set(d.donations ?? []);
      this.ndmfSummary.set(d.summary ?? {});
    });
  }

  area(b: BudgetRow): string { return [b.district_name, b.region_name].filter(Boolean).join(', '); }
  pct(part: number, whole: number): number {
    const w = +whole || 0; if (w <= 0) { return 0; } return Math.min(100, Math.round((+part / w) * 100));
  }
  earmarkLabel(t: number): string {
    return ({ 1: 'Unearmarked', 2: 'Softly earmarked', 3: 'Earmarked', 4: 'Tightly earmarked' } as any)[t] ?? 'Unearmarked';
  }

  // ── period ──
  openPeriod(): void { this.err.set(''); this.pName = ''; this.pFy = ''; this.pStart = ''; this.pEnd = ''; this.showPeriod.set(true); }
  savePeriod(): void {
    if (!this.pName) { return; }
    this.saving.set(true); this.err.set('');
    this.http.post<any>('/api/v1/finance/periods', { name: this.pName, fiscal_year: this.pFy || null, start_date: this.pStart || null, end_date: this.pEnd || null })
      .subscribe({ next: () => { this.saving.set(false); this.showPeriod.set(false); this.http.get<any>('/api/v1/finance/periods').subscribe(d => this.periods.set(d.periods ?? [])); },
        error: e => { this.saving.set(false); this.err.set(this.msg(e)); } });
  }

  // ── budget ──
  openBudget(): void {
    this.err.set(''); this.bTitle = ''; this.bPeriod = null; this.bScope = 'district'; this.bRegionId = null; this.bDistrictId = null; this.bTotal = null;
    if (!this.regions().length) { this.http.get<Opt[]>('/api/v1/portal/regions').subscribe(r => this.regions.set(r ?? [])); }
    this.showBudget.set(true);
  }
  onScopeChange(): void { this.bRegionId = null; this.bDistrictId = null; this.districts.set([]); }
  loadDistricts(regionId: number | null): void {
    this.bDistrictId = null; this.districts.set([]);
    if (regionId) { this.http.get<Opt[]>(`/api/v1/portal/regions/${regionId}/districts`).subscribe(d => this.districts.set(d ?? [])); }
  }
  saveBudget(): void {
    if (!this.bPeriod) { return; }
    this.saving.set(true); this.err.set('');
    this.http.post<any>('/api/v1/finance/budgets', {
      period_id: this.bPeriod, scope_level: this.bScope, title: this.bTitle || null,
      region_id: this.bScope === 'national' ? null : this.bRegionId,
      district_id: this.bScope === 'district' ? this.bDistrictId : null,
      total_amount: this.bTotal ?? 0,
    }).subscribe({ next: () => { this.saving.set(false); this.showBudget.set(false); this.loadBudgets(); },
      error: e => { this.saving.set(false); this.err.set(this.msg(e)); } });
  }

  // ── ndmf disburse ──
  openDisburse(d: DonationRow | null): void {
    this.err.set(''); this.dIncidentId = null; this.dAmount = null; this.dPayee = ''; this.dNotes = '';
    if (!this.incidents().length) {
      this.http.get<any>('/api/v1/response/incidents').subscribe(r => {
        const list = Array.isArray(r) ? r : (r.incidents ?? r.data ?? []);
        this.incidents.set(list.map((i: any) => ({ id: i.id, name: i.title ?? i.name ?? ('Incident #' + i.id) })));
      });
    }
    this.disbursing.set(d);
  }
  saveDisburse(): void {
    if (!this.dIncidentId || !this.dAmount || this.dAmount <= 0) { return; }
    const d = this.disbursing();
    this.saving.set(true); this.err.set('');
    this.http.post<any>('/api/v1/finance/ndmf/disburse', {
      incident_id: this.dIncidentId, amount: this.dAmount, donation_id: d ? d.id : null,
      payee: this.dPayee || null, notes: this.dNotes || null,
    }).subscribe({ next: () => { this.saving.set(false); this.disbursing.set(undefined); this.loadNdmf(); },
      error: e => { this.saving.set(false); this.err.set(this.msg(e)); } });
  }

  // ── thresholds ──
  editThreshold(t: { scope_level: string; max_amount: number | null }): void {
    const raw = prompt(`Approval ceiling for the ${t.scope_level} tier (TZS). Leave blank for unlimited.`,
      t.max_amount == null ? '' : String(t.max_amount));
    if (raw === null) { return; }
    const max = raw.trim() === '' ? null : Number(raw.trim());
    if (max !== null && (isNaN(max) || max < 0)) { return; }
    this.http.post<any>('/api/v1/finance/thresholds', { scope_level: t.scope_level, max_amount: max })
      .subscribe(() => this.http.get<any>('/api/v1/finance/thresholds').subscribe(d => this.thresholds.set(d.thresholds ?? [])));
  }

  private msg(e: any): string { return e?.error?.detail ?? e?.error?.message ?? 'Action failed.'; }
}
