import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { AuthService } from '../../core/auth.service';

interface MeasureRow { id: number; title: string; priority: string; budget: number | null; currency: string | null; additional_support_required: string | null; implementing_institution: string | null; pledged_total: number; }
interface TrainingRow { id: number; training_id: string; training_title: string; implementing_institution: string; objective: string | null; training_start_date: string | null; support_requested_at: string; pledged_total: number; }
interface PledgeRow { id: number; target_type: string; measure_title: string | null; training_title: string | null; stakeholder_name: string; contribution_type: string; amount: number | null; currency: string; description: string | null; status: string; reviewed_by_name: string | null; }

/**
 * Donor / partner SUPPORT feed. A donor sees ONLY the prevention/preparedness items needing support —
 * mitigation measures (DRR priorities) and unfunded trainings, from anywhere — and pledges its OWN
 * contribution (cash or in-kind). Their pledges are private to them. PMO staff (the approve tier) instead
 * see the review queue and accept/decline; accepting funds the item so it leaves the feed.
 */
@Component({
  selector: 'page-support-needs',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background:#fff; border:1px solid #e3e6ed; border-radius:10px; padding:10px 14px; }
    .stat b { font-size:1.3rem; display:block; } .stat span { font-size:0.72rem; color:#6c757d; text-transform:uppercase; letter-spacing:.4px; }
    .queue-tabs { display:flex; gap:4px; background:#fff; border-bottom:2px solid #e3e6ed; border-radius:12px 12px 0 0; padding:0 4px; margin-bottom:12px; }
    .queue-tabs button { font-size:.82rem; font-weight:600; color:#6c757d; border:none; background:none; padding:10px 16px; border-bottom:2px solid transparent; margin-bottom:-2px; cursor:pointer; font-family:inherit; }
    .queue-tabs button.active { color:#6f42c1; border-bottom-color:#6f42c1; }
    table { width:100%; border-collapse:collapse; font-size:.82rem; } th { text-align:left; font-size:.7rem; text-transform:uppercase; color:#6c757d; padding:8px 10px; border-bottom:2px solid #e3e6ed; }
    td { padding:8px 10px; border-bottom:1px solid #f1f5f9; vertical-align:middle; } .num { text-align:right; font-variant-numeric:tabular-nums; }
    .chip { display:inline-block; font-size:.66rem; font-weight:600; border-radius:10px; padding:1px 8px; background:#e2e8f0; color:#334155; text-transform:capitalize; }
    .chip.High { background:#fee2e2; color:#991b1b; } .chip.Medium { background:#fef3c7; color:#92400e; } .chip.Low { background:#ecfeff; color:#155e75; }
    .chip.pledged { background:#ede9fe; color:#5b21b6; } .chip.accepted { background:#dcfce7; color:#166534; } .chip.declined { background:#fee2e2; color:#991b1b; }
    .btn-pri { font-size:.74rem; font-weight:700; padding:5px 12px; border-radius:7px; border:1px solid #6f42c1; background:#6f42c1; color:#fff; cursor:pointer; font-family:inherit; }
    .btn-sm { font-size:.72rem; padding:5px 12px; border-radius:7px; border:1px solid #cbd5e1; background:#fff; color:#334155; cursor:pointer; font-family:inherit; font-weight:600; }
    .btn-ok { border-color:#198754; color:#fff; background:#198754; } .btn-no { border-color:#dc3545; color:#dc3545; }
    .empty { text-align:center; color:#94a3b8; padding:26px 0; font-size:.85rem; } .muted { color:#6c757d; }
    .dn-overlay { position:fixed; inset:0; background:rgba(15,23,42,.45); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .dn-modal { background:#fff; border-radius:14px; padding:1.2rem 1.3rem; width:min(460px,92vw); box-shadow:0 12px 40px rgba(0,0,0,.25); }
    .dn-head { font-weight:800; color:#4c1d95; margin-bottom:.7rem; } .dn-l { display:block; font-size:.78rem; color:#475569; font-weight:600; margin-bottom:.6rem; }
    .dn-l input, .dn-l select, .dn-l textarea { display:block; width:100%; margin-top:3px; box-sizing:border-box; font-size:.84rem; border:1px solid #cbd5e1; border-radius:7px; padding:6px 9px; font-family:inherit; background:#fff; }
    .dn-error { background:#fee2e2; color:#991b1b; border-radius:8px; padding:.5rem .7rem; font-size:.8rem; margin-bottom:.5rem; } .dn-actions { display:flex; justify-content:flex-end; gap:.5rem; }
  `],
  template: `
    <dmis-page-header title="Support Needs" icon="fa-hand-holding-heart"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Stakeholder Portal'}, {label:'Support Needs'}]">
    </dmis-page-header>

    <div class="stat-strip">
      <div class="stat"><b>{{ stats().measures ?? 0 }}</b><span>DRR Priorities needing support</span></div>
      <div class="stat"><b>{{ stats().trainings ?? 0 }}</b><span>Trainings needing support</span></div>
      <div class="stat"><b>{{ pledges().length }}</b><span>{{ canPledge() ? 'My pledges' : 'Pledges to review' }}</span></div>
    </div>

    <div class="queue-tabs">
      <button [class.active]="tab()==='opportunities'" (click)="tab.set('opportunities')">Opportunities to fund</button>
      <button [class.active]="tab()==='pledges'" (click)="tab.set('pledges')">{{ canPledge() ? 'My Pledges' : 'Pledge Review' }}</button>
    </div>

    @if (tab()==='opportunities') {
      <dmis-panel title="Mitigation Measures — DRR Priorities" icon="fa-bullseye">
        <table>
          <thead><tr><th>Measure</th><th>Priority</th><th>Support needed</th><th class="num">Budget</th><th class="num">Pledged</th><th></th></tr></thead>
          <tbody>
            @for (m of measures(); track m.id) {
              <tr>
                <td><b>{{ m.title }}</b>@if (m.implementing_institution) { <br><small class="muted">{{ m.implementing_institution }}</small> }</td>
                <td><span class="chip {{ m.priority }}">{{ m.priority }}</span></td>
                <td class="muted" style="font-size:.78rem;">{{ m.additional_support_required }}</td>
                <td class="num">{{ m.budget == null ? '—' : (m.budget | number) }}</td>
                <td class="num">{{ m.pledged_total | number }}</td>
                <td>@if (canPledge() || canReview()) { <button class="btn-pri" (click)="openPledge('measure', m.id, m.title)"><i class="fas fa-hand-holding-heart"></i> Donate</button> }</td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No DRR priorities are currently awaiting support.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
      <dmis-panel title="Trainings needing support" icon="fa-graduation-cap">
        <table>
          <thead><tr><th>Training</th><th>Institution</th><th>Starts</th><th class="num">Pledged</th><th></th></tr></thead>
          <tbody>
            @for (t of trainings(); track t.id) {
              <tr>
                <td><b>{{ t.training_title }}</b><br><small class="muted">{{ t.training_id }}</small>@if (t.objective) { <br><small class="muted">{{ t.objective }}</small> }</td>
                <td>{{ t.implementing_institution }}</td>
                <td>{{ t.training_start_date | date:'dd MMM yyyy' }}</td>
                <td class="num">{{ t.pledged_total | number }}</td>
                <td>@if (canPledge() || canReview()) { <button class="btn-pri" (click)="openPledge('training', t.id, t.training_title)"><i class="fas fa-hand-holding-heart"></i> Donate</button> }</td>
              </tr>
            } @empty { <tr><td colspan="5" class="empty">No trainings are awaiting funding support.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    @if (tab()==='pledges') {
      <dmis-panel [title]="canPledge() ? 'My pledges' : 'Pledge review queue'" icon="fa-clipboard-check">
        <table>
          <thead><tr><th>Toward</th>@if (!canPledge()) { <th>Donor</th> }<th>Type</th><th class="num">Amount</th><th>Status</th>@if (canReview()) { <th></th> }</tr></thead>
          <tbody>
            @for (p of pledges(); track p.id) {
              <tr>
                <td>{{ p.measure_title || p.training_title || '—' }}<br><small class="muted">{{ p.target_type }}</small></td>
                @if (!canPledge()) { <td>{{ p.stakeholder_name }}</td> }
                <td>{{ p.contribution_type === 'in_kind' ? 'In-kind' : 'Cash' }}@if (p.description) { <br><small class="muted">{{ p.description }}</small> }</td>
                <td class="num">{{ p.amount == null ? '—' : (p.amount | number) }} {{ p.amount != null ? p.currency : '' }}</td>
                <td><span class="chip {{ p.status }}">{{ p.status }}</span></td>
                @if (canReview()) { <td>@if (p.status==='pledged') {
                  <button class="btn-sm btn-ok" (click)="review(p,'accept')">Accept</button>
                  <button class="btn-sm btn-no" (click)="review(p,'decline')">Decline</button> }</td> }
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No pledges yet.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    @if (pledging()) {
      <div class="dn-overlay" (click)="pledging.set(null)"><div class="dn-modal" (click)="$event.stopPropagation()">
        <div class="dn-head"><i class="fas fa-hand-holding-heart"></i> Pledge support — {{ pledging()!.title }}</div>
        @if (!canPledge()) {
          <label class="dn-l">Donating partner
            <select [(ngModel)]="pStakeholderId"><option [ngValue]="null">Select partner…</option>
              @for (s of partners(); track s.id) { <option [ngValue]="s.id">{{ s.name }}</option> }</select></label>
        }
        <label class="dn-l">Contribution
          <select [(ngModel)]="pType"><option value="cash">Cash</option><option value="in_kind">In-kind</option></select></label>
        @if (pType==='cash') {
          <label class="dn-l">Amount (TZS)<input type="number" min="1" [(ngModel)]="pAmount" placeholder="e.g. 5000000"></label>
        }
        <label class="dn-l">Note (optional)<textarea rows="2" [(ngModel)]="pDesc" placeholder="What you can contribute / conditions"></textarea></label>
        @if (err()) { <div class="dn-error">{{ err() }}</div> }
        <div class="dn-actions"><button class="btn-sm" (click)="pledging.set(null)">Cancel</button>
          <button class="btn-pri" [disabled]="saving() || (pType==='cash' && (!pAmount || pAmount<=0)) || (!canPledge() && !pStakeholderId)" (click)="confirmPledge()">{{ saving() ? 'Submitting…' : 'Submit pledge' }}</button></div>
      </div></div>
    }
  `,
})
export class SupportNeedsComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly canReview = computed(() => this.auth.hasPermission('resource_allocation.approve'));

  readonly tab = signal<'opportunities' | 'pledges'>('opportunities');
  readonly measures = signal<MeasureRow[]>([]);
  readonly trainings = signal<TrainingRow[]>([]);
  readonly pledges = signal<PledgeRow[]>([]);
  readonly stats = signal<{ measures?: number; trainings?: number; canPledge?: boolean }>({});
  readonly partners = signal<{ id: number; name: string }[]>([]);
  readonly saving = signal(false);
  readonly err = signal('');
  readonly pledging = signal<{ type: string; id: number; title: string } | null>(null);
  pType = 'cash'; pAmount: number | null = null; pDesc = ''; pStakeholderId: number | null = null;

  /** A donor (bound to a stakeholder org) can pledge; non-stakeholder staff review instead. */
  canPledge(): boolean { return this.stats().canPledge === true; }

  ngOnInit(): void { this.load(); }

  load(): void {
    this.http.get<any>('/api/v1/response/support/needs').subscribe(d => {
      this.measures.set(d.measures ?? []); this.trainings.set(d.trainings ?? []); this.stats.set(d.stats ?? {});
    });
    this.http.get<any>('/api/v1/response/support/pledges').subscribe(d => this.pledges.set(d.pledges ?? []));
    if (this.canReview()) {
      this.http.get<any>('/api/v1/stakeholders').subscribe(d =>
        this.partners.set((d.stakeholders ?? []).map((s: any) => ({ id: s.id, name: s.name }))));
    }
  }

  openPledge(type: string, id: number, title: string): void {
    this.err.set(''); this.pType = 'cash'; this.pAmount = null; this.pDesc = ''; this.pStakeholderId = null;
    this.pledging.set({ type, id, title });
  }

  confirmPledge(): void {
    const p = this.pledging(); if (!p) { return; }
    const body: any = { target_type: p.type, contribution_type: this.pType, amount: this.pType === 'cash' ? this.pAmount : null, description: this.pDesc || null };
    if (p.type === 'measure') { body.mitigation_measure_id = p.id; } else { body.training_plan_id = p.id; }
    if (!this.canPledge()) { body.stakeholder_id = this.pStakeholderId; }
    this.saving.set(true); this.err.set('');
    this.http.post<any>('/api/v1/response/support/pledges', body).subscribe({
      next: () => { this.saving.set(false); this.pledging.set(null); this.load(); },
      error: e => { this.saving.set(false); this.err.set(e?.error?.detail ?? e?.error?.message ?? 'Could not record the pledge.'); },
    });
  }

  review(p: PledgeRow, action: 'accept' | 'decline'): void {
    this.http.post<any>(`/api/v1/response/support/pledges/${p.id}/${action}`, {}).subscribe(() => this.load());
  }
}
