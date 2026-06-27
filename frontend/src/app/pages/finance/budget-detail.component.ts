import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { AuthService } from '../../core/auth.service';

interface LineRow { id: number; category: string; description: string | null; allocated_amount: number; committed: number; disbursed: number; }
interface CommitmentRow {
  id: number; amount: number; expended_amount: number | null; purpose: string | null; payee: string | null;
  status: string; incident_id: number | null; line_category: string; incident_title: string | null;
  requested_by_name: string | null; approved_by_name: string | null; committed_by_name: string | null; disbursed_by_name: string | null;
}
interface VirementRow {
  id: number; amount: number; reason: string | null; status: string; from_line_id: number; to_line_id: number;
  from_category: string; to_category: string; requested_by_name: string | null; approved_by_name: string | null; created_at: string;
}
interface Opt { id: number; name: string; }

/**
 * Budget detail — line-item allocations, the maker-checker commitment ledger (request → approve →
 * commit/obligate → disburse, with commitment≠expenditure shown distinctly) and virements between lines.
 * Every action is permission-gated to match the backend; the queues here ARE the per-budget approval lists.
 */
@Component({
  selector: 'page-budget-detail',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .recon { display: grid; grid-template-columns: repeat(4,1fr); gap: 10px; margin-bottom: 14px; }
    .recon .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .recon b { font-size: 1.2rem; display:block; } .recon span { font-size: 0.7rem; color:#6c757d; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .chip { display:inline-block; font-size:0.66rem; font-weight:600; border-radius:10px; padding:1px 8px; background:#e2e8f0; color:#334155; text-transform:capitalize; }
    .chip.requested { background:#fef3c7; color:#92400e; } .chip.approved { background:#dbeafe; color:#1e40af; }
    .chip.committed { background:#ede9fe; color:#5b21b6; } .chip.disbursed { background:#dcfce7; color:#166534; }
    .chip.rejected { background:#fee2e2; color:#991b1b; }
    .toolbar { display:flex; gap:6px; margin-bottom:10px; align-items:center; flex-wrap:wrap; }
    .btn-sm { font-size:0.72rem; padding:4px 10px; border-radius:7px; border:1px solid #cbd5e1; background:#fff; color:#334155; cursor:pointer; font-family:inherit; font-weight:600; }
    .btn-ok { border-color:#198754; color:#fff; background:#198754; } .btn-warn { border-color:#b45309; color:#fff; background:#d97706; }
    .btn-pri { border-color:#0d6efd; color:#fff; background:#0d6efd; } .btn-no { border-color:#dc3545; color:#dc3545; }
    .btn-sm:disabled { opacity:0.5; cursor:default; }
    .empty { text-align:center; color:#94a3b8; padding:24px 0; font-size:0.85rem; }
    .muted { color:#6c757d; } .small { font-size:0.72rem; }
    .dn-overlay { position:fixed; inset:0; background:rgba(15,23,42,0.45); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .dn-modal { background:#fff; border-radius:14px; padding:1.2rem 1.3rem; width:min(460px,92vw); box-shadow:0 12px 40px rgba(0,0,0,0.25); max-height:90vh; overflow:auto; }
    .dn-head { font-weight:800; color:#1e3a8a; margin-bottom:0.7rem; }
    .dn-l { display:block; font-size:0.78rem; color:#475569; font-weight:600; margin-bottom:0.6rem; }
    .dn-l input, .dn-l select { display:block; width:100%; margin-top:3px; box-sizing:border-box; font-size:0.84rem; border:1px solid #cbd5e1; border-radius:7px; padding:6px 9px; font-family:inherit; background:#fff; }
    .dn-error { background:#fee2e2; color:#991b1b; border-radius:8px; padding:0.5rem 0.7rem; font-size:0.8rem; margin-bottom:0.5rem; }
    .dn-actions { display:flex; justify-content:flex-end; gap:0.5rem; }
  `],
  template: `
    <dmis-page-header [title]="budget()?.title || ('Budget #' + id)" icon="fa-wallet"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Budget & Finance', url:'/m/budget-finance/budgets'}, {label:'Detail'}]">
    </dmis-page-header>

    @if (budget(); as b) {
      <div class="toolbar">
        <a class="btn-sm" routerLink="/m/budget-finance/budgets"><i class="fas fa-arrow-left"></i> All budgets</a>
        <span class="chip">{{ b.scope_level }}</span>
        <span class="chip {{ b.status }}">{{ b.status }}</span>
        <span class="muted small">{{ b.period_name }}</span>
        @if (canApprove && b.status === 'draft') { <button class="btn-sm btn-ok" (click)="approveBudget()">Approve &amp; activate budget</button> }
      </div>

      <div class="recon">
        <div class="stat"><b>{{ recon().allocated | number }}</b><span>Allocated</span></div>
        <div class="stat"><b>{{ recon().committed | number }}</b><span>Committed (obligated)</span></div>
        <div class="stat"><b>{{ recon().disbursed | number }}</b><span>Expended (paid)</span></div>
        <div class="stat"><b>{{ recon().free | number }}</b><span>Uncommitted</span></div>
      </div>
    }

    <!-- Lines -->
    <dmis-panel title="Budget lines" icon="fa-list">
      @if (canManage) { <div class="toolbar"><button class="btn-sm btn-pri" (click)="openLine()"><i class="fas fa-plus"></i> Add line</button></div> }
      <table>
        <thead><tr><th>Category</th><th class="num">Allocated</th><th class="num">Committed</th><th class="num">Expended</th><th class="num">Free</th></tr></thead>
        <tbody>
          @for (l of lines(); track l.id) {
            <tr><td><b>{{ l.category }}</b>@if (l.description) { <br><small class="muted">{{ l.description }}</small> }</td>
              <td class="num">{{ l.allocated_amount | number }}</td><td class="num">{{ l.committed | number }}</td>
              <td class="num">{{ l.disbursed | number }}</td><td class="num">{{ (l.allocated_amount - l.committed) | number }}</td></tr>
          } @empty { <tr><td colspan="5" class="empty">No lines yet.@if (canManage) { Add a line to allocate funds. }</td></tr> }
        </tbody>
      </table>
    </dmis-panel>

    <!-- Commitments -->
    <dmis-panel title="Commitments (maker-checker)" icon="fa-money-check-dollar">
      @if (canManage && lines().length) { <div class="toolbar"><button class="btn-sm btn-pri" (click)="openCommit()"><i class="fas fa-plus"></i> Request spend</button></div> }
      <table>
        <thead><tr><th>Line / Purpose</th><th>Incident</th><th class="num">Amount</th><th class="num">Expended</th><th>Status</th><th>Trail</th><th></th></tr></thead>
        <tbody>
          @for (c of commitments(); track c.id) {
            <tr>
              <td><b>{{ c.line_category }}</b>@if (c.purpose) { <br><small class="muted">{{ c.purpose }}</small> }@if (c.payee) { <br><small class="muted">→ {{ c.payee }}</small> }</td>
              <td>{{ c.incident_title || '—' }}</td>
              <td class="num">{{ c.amount | number }}</td>
              <td class="num">{{ c.expended_amount == null ? '—' : (c.expended_amount | number) }}</td>
              <td><span class="chip {{ c.status }}">{{ c.status }}</span></td>
              <td class="small muted">
                @if (c.requested_by_name) { req: {{ c.requested_by_name }}<br> }
                @if (c.approved_by_name) { app: {{ c.approved_by_name }}<br> }
                @if (c.committed_by_name) { com: {{ c.committed_by_name }}<br> }
                @if (c.disbursed_by_name) { pay: {{ c.disbursed_by_name }} }
              </td>
              <td>
                @if (c.status === 'requested' && canApprove) {
                  <button class="btn-sm btn-ok" [disabled]="busy()" (click)="act(c,'approve')">Approve</button>
                  <button class="btn-sm btn-no" [disabled]="busy()" (click)="reject(c)">Reject</button>
                }
                @if (c.status === 'approved' && canDisburse) { <button class="btn-sm btn-warn" [disabled]="busy()" (click)="act(c,'commit')">Obligate</button> }
                @if (c.status === 'committed' && canDisburse) { <button class="btn-sm btn-ok" [disabled]="busy()" (click)="disburse(c)">Disburse</button> }
              </td>
            </tr>
          } @empty { <tr><td colspan="7" class="empty">No commitments yet.</td></tr> }
        </tbody>
      </table>
    </dmis-panel>

    <!-- Virements -->
    <dmis-panel title="Virements (reallocation between lines)" icon="fa-right-left">
      @if (canManage && lines().length > 1) { <div class="toolbar"><button class="btn-sm btn-pri" (click)="openVirement()"><i class="fas fa-plus"></i> New virement</button></div> }
      <table>
        <thead><tr><th>From → To</th><th class="num">Amount</th><th>Reason</th><th>Status</th><th></th></tr></thead>
        <tbody>
          @for (v of virements(); track v.id) {
            <tr>
              <td>{{ v.from_category }} <i class="fas fa-arrow-right muted"></i> {{ v.to_category }}<br><small class="muted">{{ v.requested_by_name }}</small></td>
              <td class="num">{{ v.amount | number }}</td>
              <td class="small">{{ v.reason || '—' }}</td>
              <td><span class="chip {{ v.status }}">{{ v.status }}</span></td>
              <td>@if (v.status === 'requested' && canApprove) {
                <button class="btn-sm btn-ok" [disabled]="busy()" (click)="actV(v,'approve')">Approve</button>
                <button class="btn-sm btn-no" [disabled]="busy()" (click)="rejectV(v)">Reject</button> }</td>
            </tr>
          } @empty { <tr><td colspan="5" class="empty">No virements.</td></tr> }
        </tbody>
      </table>
    </dmis-panel>

    <!-- Add line dialog -->
    @if (showLine()) {
      <div class="dn-overlay" (click)="showLine.set(false)"><div class="dn-modal" (click)="$event.stopPropagation()">
        <div class="dn-head">Add budget line</div>
        <label class="dn-l">Category<input [(ngModel)]="lCategory" placeholder="e.g. Relief Supplies"></label>
        <label class="dn-l">Description (optional)<input [(ngModel)]="lDesc"></label>
        <label class="dn-l">Allocated amount (TZS)<input type="number" min="0" [(ngModel)]="lAmount"></label>
        @if (err()) { <div class="dn-error">{{ err() }}</div> }
        <div class="dn-actions"><button class="btn-sm" (click)="showLine.set(false)">Cancel</button>
          <button class="btn-sm btn-pri" [disabled]="busy() || !lCategory" (click)="saveLine()">Add</button></div>
      </div></div>
    }

    <!-- Request spend dialog -->
    @if (showCommit()) {
      <div class="dn-overlay" (click)="showCommit.set(false)"><div class="dn-modal" (click)="$event.stopPropagation()">
        <div class="dn-head">Request a spend (commitment)</div>
        <label class="dn-l">Budget line<select [(ngModel)]="cLineId">
          <option [ngValue]="null">Select line…</option>
          @for (l of lines(); track l.id) { <option [ngValue]="l.id">{{ l.category }} ({{ (l.allocated_amount - l.committed) | number }} free)</option> }
        </select></label>
        <label class="dn-l">Incident (optional)<select [(ngModel)]="cIncidentId">
          <option [ngValue]="null">— none —</option>
          @for (i of incidents(); track i.id) { <option [ngValue]="i.id">{{ i.name }}</option> }
        </select></label>
        <label class="dn-l">Amount (TZS)<input type="number" min="1" [(ngModel)]="cAmount"></label>
        <label class="dn-l">Purpose<input [(ngModel)]="cPurpose"></label>
        <label class="dn-l">Payee (optional)<input [(ngModel)]="cPayee"></label>
        @if (err()) { <div class="dn-error">{{ err() }}</div> }
        <div class="dn-actions"><button class="btn-sm" (click)="showCommit.set(false)">Cancel</button>
          <button class="btn-sm btn-pri" [disabled]="busy() || !cLineId || !cAmount || cAmount <= 0" (click)="saveCommit()">Request</button></div>
      </div></div>
    }

    <!-- New virement dialog -->
    @if (showVirement()) {
      <div class="dn-overlay" (click)="showVirement.set(false)"><div class="dn-modal" (click)="$event.stopPropagation()">
        <div class="dn-head">New virement</div>
        <label class="dn-l">From line<select [(ngModel)]="vFrom">
          <option [ngValue]="null">Select…</option>
          @for (l of lines(); track l.id) { <option [ngValue]="l.id">{{ l.category }} ({{ (l.allocated_amount - l.committed) | number }} free)</option> }
        </select></label>
        <label class="dn-l">To line<select [(ngModel)]="vTo">
          <option [ngValue]="null">Select…</option>
          @for (l of lines(); track l.id) { <option [ngValue]="l.id">{{ l.category }}</option> }
        </select></label>
        <label class="dn-l">Amount (TZS)<input type="number" min="1" [(ngModel)]="vAmount"></label>
        <label class="dn-l">Reason<input [(ngModel)]="vReason"></label>
        @if (err()) { <div class="dn-error">{{ err() }}</div> }
        <div class="dn-actions"><button class="btn-sm" (click)="showVirement.set(false)">Cancel</button>
          <button class="btn-sm btn-pri" [disabled]="busy() || !vFrom || !vTo || vFrom === vTo || !vAmount || vAmount <= 0" (click)="saveVirement()">Request</button></div>
      </div></div>
    }
  `,
})
export class BudgetDetailComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  readonly canManage = this.auth.hasPermission('budget_and_finance.manage');
  readonly canApprove = this.auth.hasPermission('budget_and_finance.approve');
  readonly canDisburse = this.auth.hasPermission('budget_and_finance.disburse');

  id = 0;
  readonly budget = signal<any>(null);
  readonly lines = signal<LineRow[]>([]);
  readonly commitments = signal<CommitmentRow[]>([]);
  readonly virements = signal<VirementRow[]>([]);
  readonly incidents = signal<Opt[]>([]);
  readonly busy = signal(false);
  readonly err = signal('');

  readonly recon = computed(() => {
    const ls = this.lines();
    const allocated = ls.reduce((a, l) => a + (+l.allocated_amount || 0), 0);
    const committed = ls.reduce((a, l) => a + (+l.committed || 0), 0);
    const disbursed = ls.reduce((a, l) => a + (+l.disbursed || 0), 0);
    return { allocated, committed, disbursed, free: allocated - committed };
  });

  readonly showLine = signal(false);
  readonly showCommit = signal(false);
  readonly showVirement = signal(false);
  lCategory = ''; lDesc = ''; lAmount: number | null = null;
  cLineId: number | null = null; cIncidentId: number | null = null; cAmount: number | null = null; cPurpose = ''; cPayee = '';
  vFrom: number | null = null; vTo: number | null = null; vAmount: number | null = null; vReason = '';

  ngOnInit(): void {
    this.id = Number(this.route.snapshot.paramMap.get('id'));
    this.load();
  }

  load(): void {
    this.http.get<any>(`/api/v1/finance/budgets/${this.id}`).subscribe(d => {
      this.budget.set(d.budget ?? null);
      this.lines.set(d.lines ?? []);
      this.commitments.set(d.commitments ?? []);
      this.virements.set(d.virements ?? []);
    });
  }

  approveBudget(): void {
    this.run(this.http.post(`/api/v1/finance/budgets/${this.id}/approve`, {}));
  }

  // ── lines ──
  openLine(): void { this.err.set(''); this.lCategory = ''; this.lDesc = ''; this.lAmount = null; this.showLine.set(true); }
  saveLine(): void {
    if (!this.lCategory) { return; }
    this.run(this.http.post(`/api/v1/finance/budgets/${this.id}/lines`,
      { category: this.lCategory, description: this.lDesc || null, allocated_amount: this.lAmount ?? 0 }), () => this.showLine.set(false));
  }

  // ── commitments ──
  openCommit(): void {
    this.err.set(''); this.cLineId = null; this.cIncidentId = null; this.cAmount = null; this.cPurpose = ''; this.cPayee = '';
    if (!this.incidents().length) {
      this.http.get<any>('/api/v1/response/incidents').subscribe(r => {
        const list = Array.isArray(r) ? r : (r.incidents ?? r.data ?? []);
        this.incidents.set(list.map((i: any) => ({ id: i.id, name: i.title ?? i.name ?? ('Incident #' + i.id) })));
      });
    }
    this.showCommit.set(true);
  }
  saveCommit(): void {
    if (!this.cLineId || !this.cAmount || this.cAmount <= 0) { return; }
    this.run(this.http.post('/api/v1/finance/commitments',
      { budget_line_id: this.cLineId, incident_id: this.cIncidentId, amount: this.cAmount, purpose: this.cPurpose || null, payee: this.cPayee || null }),
      () => this.showCommit.set(false));
  }
  act(c: CommitmentRow, action: 'approve' | 'commit'): void {
    this.run(this.http.post(`/api/v1/finance/commitments/${c.id}/${action}`, {}));
  }
  reject(c: CommitmentRow): void {
    const reason = prompt('Reason for rejecting this commitment?');
    if (!reason) { return; }
    this.run(this.http.post(`/api/v1/finance/commitments/${c.id}/reject`, { reason }));
  }
  disburse(c: CommitmentRow): void {
    const raw = prompt('Actual amount paid (TZS). Leave blank to pay the committed amount.', String(c.amount));
    if (raw === null) { return; }
    const body = raw.trim() === '' ? {} : { expended_amount: Number(raw.trim()) };
    this.run(this.http.post(`/api/v1/finance/commitments/${c.id}/disburse`, body));
  }

  // ── virements ──
  openVirement(): void { this.err.set(''); this.vFrom = null; this.vTo = null; this.vAmount = null; this.vReason = ''; this.showVirement.set(true); }
  saveVirement(): void {
    if (!this.vFrom || !this.vTo || this.vFrom === this.vTo || !this.vAmount || this.vAmount <= 0) { return; }
    this.run(this.http.post('/api/v1/finance/virements',
      { from_line_id: this.vFrom, to_line_id: this.vTo, amount: this.vAmount, reason: this.vReason || null }), () => this.showVirement.set(false));
  }
  actV(v: VirementRow, action: 'approve'): void { this.run(this.http.post(`/api/v1/finance/virements/${v.id}/${action}`, {})); }
  rejectV(v: VirementRow): void {
    const reason = prompt('Reason for rejecting this virement?');
    if (!reason) { return; }
    this.run(this.http.post(`/api/v1/finance/virements/${v.id}/reject`, { reason }));
  }

  /** Run a write, reload on success, surface the backend message on failure. */
  private run(obs: any, onOk?: () => void): void {
    this.busy.set(true); this.err.set('');
    obs.subscribe({
      next: () => { this.busy.set(false); if (onOk) { onOk(); } this.load(); },
      error: (e: any) => { this.busy.set(false); this.err.set(e?.error?.detail ?? e?.error?.message ?? 'Action failed.'); alert(this.err()); },
    });
  }
}
