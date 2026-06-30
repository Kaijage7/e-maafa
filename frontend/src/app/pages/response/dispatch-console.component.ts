import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded on demand from the CDN like the Blade pages

interface BoardResource {
  resource_id: number; resource_name: string; resource_category: string; unit_of_measure: string;
  quantity_requested: number; quantity_allocated: number; dispatched_quantity: number;
  allocation_ids: number[]; statuses: string[]; latest_allocation_id: number;
}
interface BoardIncident { incident_id: number; incident_title: string; severity_level: string; resources: BoardResource[]; }
interface DispatchSource {
  source_type: string; source_id: number; source_name: string; location_name: string | null;
  level: string | null; available_quantity: number | null; source_type_label: string;
  requires_approval: boolean; distance_km: number | null;
}
interface ApprovalRow {
  id: number; status: string; quantity: number; source_type: string; source_name: string;
  incident_title: string; resource_name: string; unit_of_measure: string;
  requested_by_name: string | null; notes: string | null; rejection_reason: string | null; created_at: string;
}
interface ProcurementRow {
  allocation_id: number; status: string; quantity: number; total_delivered?: number;
  estimated_cost?: number; preferred_vendor?: string; urgency: string;
  incident_title: string; resource_name: string; unit_of_measure: string; requested_by_name: string | null;
}

/**
 * Reproduction of admin/resource-dispatch (index + dispatch-form +
 * pending-approvals + procurement-requests): the dispatch console.
 *
 * The board groups fully-approved allocations by incident and aggregates
 * same-resource rows; "Dispatch" opens the source picker (warehouses and
 * temporary warehouses behind the manager-approval gate, agency stock direct,
 * plus the procurement channel). The Approvals tab is the source manager's
 * yes/no queue — approving is the moment stock actually leaves the ledger.
 */
@Component({
  selector: 'page-dispatch-console',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .stat-strip { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 14px; }
    .stat { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 14px; }
    .stat b { font-size: 1.3rem; display: block; }
    .stat span { font-size: 0.72rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.4px; }
    .queue-tabs { display: flex; gap: 4px; background: #fff; border-bottom: 2px solid #e3e6ed; border-radius: 12px 12px 0 0; padding: 0 4px; margin-bottom: 12px; }
    .queue-tabs button { font-size: 0.82rem; font-weight: 600; color: #6c757d; border: none; background: none; padding: 10px 16px; border-bottom: 2px solid transparent; margin-bottom: -2px; cursor: pointer; font-family: inherit; }
    .queue-tabs button.active { color: #dc3545; border-bottom-color: #dc3545; }
    .q-badge { background: rgba(220,53,69,0.1); color: #dc3545; border-radius: 10px; padding: 0 6px; font-size: 0.68rem; margin-left: 4px; }
    .incident-card { background: #fff; border: 1px solid #e3e6ed; border-radius: 10px; margin-bottom: 12px; overflow: hidden; }
    .incident-head { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #f8f9fb; border-bottom: 1px solid #e3e6ed; font-size: 0.85rem; }
    .res-row { display: grid; grid-template-columns: 1.6fr 1fr 1fr 1.2fr auto; gap: 10px; align-items: center; padding: 9px 14px; border-bottom: 1px solid #f1f5f9; font-size: 0.82rem; }
    .res-row:last-child { border-bottom: none; }
    .chip { display: inline-block; font-size: 0.66rem; font-weight: 600; border-radius: 10px; padding: 1px 8px; margin-right: 3px; }
    .c-approved { background: #d1fae5; color: #065f46; } .c-sourcing { background: #fef3c7; color: #92400e; }
    .c-waiting { background: #ede9fe; color: #5b21b6; } .c-other { background: #e2e8f0; color: #334155; }
    .sev { font-size: 0.66rem; font-weight: 700; border-radius: 10px; padding: 1px 8px; background: #fee2e2; color: #b91c1c; }
    table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
    th { text-align: left; font-size: 0.7rem; text-transform: uppercase; color: #6c757d; padding: 8px 10px; border-bottom: 2px solid #e3e6ed; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .btn-sm { font-size: 0.72rem; padding: 3px 10px; border-radius: 6px; border: 1px solid transparent; cursor: pointer; font-family: inherit; font-weight: 600; }
    .b-red { background: #dc3545; color: #fff; } .b-green { background: #198754; color: #fff; }
    .b-outline { background: #fff; border-color: #cbd5e1; color: #334155; }
    .drawer-back { position: fixed; inset: 0; background: rgba(15,23,42,0.45); z-index: 1100; display: flex; justify-content: flex-end; }
    .drawer { width: 560px; max-width: 95vw; background: #fff; height: 100%; overflow-y: auto; box-shadow: -12px 0 40px rgba(0,0,0,0.25); }
    .drawer-head { background: #dc3545; color: #fff; padding: 14px 18px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 1; }
    .drawer-body { padding: 16px 18px; }
    .src-item { display: flex; gap: 10px; align-items: flex-start; border: 1px solid #e3e6ed; border-radius: 10px; padding: 10px 12px; margin-bottom: 8px; cursor: pointer; font-size: 0.82rem; }
    .src-item.sel { border-color: #dc3545; background: #fff5f5; }
    .src-meta { font-size: 0.72rem; color: #6c757d; }
    .gate { font-size: 0.64rem; background: #ede9fe; color: #5b21b6; border-radius: 8px; padding: 1px 7px; font-weight: 700; }
    .direct { font-size: 0.64rem; background: #d1fae5; color: #065f46; border-radius: 8px; padding: 1px 7px; font-weight: 700; }
    label { display: block; font-size: 0.74rem; font-weight: 600; color: #334155; margin: 10px 0 3px; }
    input, select, textarea { width: 100%; font-size: 0.82rem; border: 1px solid #cbd5e1; border-radius: 7px; padding: 6px 9px; font-family: inherit; box-sizing: border-box; }
    .empty { text-align: center; color: #94a3b8; padding: 34px 0; font-size: 0.85rem; }
    .urg-critical { color: #b91c1c; font-weight: 700; } .urg-high { color: #c2410c; font-weight: 600; }
  `],
  template: `
    <dmis-page-header title="Resource Dispatch" icon="fa-truck-fast"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Resource Dispatch'}]">
      <a routerLink="/m/response/warehouse-ops" class="btn-add"><i class="fas fa-warehouse"></i> Warehouse Ops</a>
    </dmis-page-header>

    <div class="stat-strip">
      <div class="stat"><b>{{ stats().total_pending ?? 0 }}</b><span>Pending Dispatch</span></div>
      <div class="stat"><b>{{ stats().awaiting_approval ?? 0 }}</b><span>Awaiting Approval</span></div>
      <div class="stat"><b>{{ stats().in_transit ?? 0 }}</b><span>In Transit</span></div>
      <div class="stat"><b>{{ stats().deployed ?? 0 }}</b><span>Deployed</span></div>
      <div class="stat"><b>{{ stats().delivered ?? 0 }}</b><span>Delivered</span></div>
    </div>

    <div class="queue-tabs">
      <button [class.active]="tab() === 'board'" (click)="tab.set('board')">Dispatch Board</button>
      <button [class.active]="tab() === 'approvals'" (click)="tab.set('approvals')">Dispatch Approvals <span class="q-badge">{{ pendingApprovalCount() }}</span></button>
      <button [class.active]="tab() === 'procurement'" (click)="tab.set('procurement')">Procurement <span class="q-badge">{{ procurement().length }}</span></button>
    </div>

    <!-- ── Board: approved allocations grouped per incident ── -->
    @if (tab() === 'board') {
      @for (inc of board(); track inc.incident_id) {
        <div class="incident-card">
          <div class="incident-head">
            <span><i class="fas fa-triangle-exclamation" style="color:#dc3545"></i>
              <a [routerLink]="['/m/response/incidents', inc.incident_id]" style="font-weight:600; color:#1e293b; margin-left:6px;">{{ inc.incident_title }}</a></span>
            <span class="sev">{{ inc.severity_level }}</span>
          </div>
          @for (r of inc.resources; track r.resource_id) {
            <div class="res-row">
              <span><b>{{ r.resource_name }}</b><br><small style="color:#6c757d">{{ r.resource_category }}</small></span>
              <span>{{ r.quantity_allocated }} {{ r.unit_of_measure }}<br><small style="color:#6c757d">allocated</small></span>
              <span>{{ r.dispatched_quantity }}<br><small style="color:#6c757d">dispatched</small></span>
              <span>
                @for (s of r.statuses; track s) { <span class="chip" [class]="chipClass(s)">{{ s }}</span> }
              </span>
              <span style="white-space:nowrap">
                <button class="btn-sm b-red" (click)="openDispatch(r.latest_allocation_id)"
                        [disabled]="r.statuses.length === 1 && r.statuses[0] === 'Awaiting Dispatch Approval'">
                  <i class="fas fa-truck-arrow-right"></i> Dispatch</button>
                @if (r.statuses.includes('Requested to Stakeholders')) {
                  <button class="btn-sm b-outline" style="margin-left:4px" (click)="openPool(r.latest_allocation_id)">
                    <i class="fas fa-hand-holding-heart"></i> Pool</button>
                }
              </span>
            </div>
          }
        </div>
      } @empty { <div class="empty">No allocations are waiting for dispatch.</div> }
    }

    <!-- ── Source-manager approval queue ── -->
    @if (tab() === 'approvals') {
      <dmis-panel title="Dispatch Approval Requests" icon="fa-clipboard-check">
        <table>
          <thead><tr><th>Resource / Incident</th><th>Source</th><th>Qty</th><th>Requested By</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (a of approvals(); track a.id) {
              <tr>
                <td><b>{{ a.resource_name }}</b><br><small style="color:#6c757d">{{ a.incident_title }}</small></td>
                <td>{{ a.source_name }}<br><small style="color:#6c757d">{{ a.source_type }}</small></td>
                <td>{{ a.quantity }} {{ a.unit_of_measure }}</td>
                <td>{{ a.requested_by_name ?? '—' }}</td>
                <td><span class="chip" [class]="a.status === 'Pending' ? 'c-waiting' : a.status === 'Approved' ? 'c-approved' : 'c-other'">{{ a.status }}</span>
                  @if (a.rejection_reason) { <br><small style="color:#b91c1c">{{ a.rejection_reason }}</small> }</td>
                <td style="white-space:nowrap">
                  @if (a.status === 'Pending') {
                    <button class="btn-sm b-green" (click)="approveDispatch(a)"><i class="fas fa-check"></i> Approve</button>
                    <button class="btn-sm b-outline" (click)="rejectDispatch(a)" style="margin-left:4px">Reject</button>
                  }
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No dispatch approval requests.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- ── Procurement queue ── -->
    @if (tab() === 'procurement') {
      <dmis-panel title="Procurement Requests" icon="fa-cart-shopping">
        <table>
          <thead><tr><th>Resource / Incident</th><th>Qty</th><th>Delivered</th><th>Urgency</th><th>Status</th><th></th></tr></thead>
          <tbody>
            @for (p of procurement(); track p.allocation_id) {
              <tr>
                <td><b>{{ p.resource_name }}</b><br><small style="color:#6c757d">{{ p.incident_title }}</small></td>
                <td>{{ p.quantity }} {{ p.unit_of_measure }}</td>
                <td>{{ p.total_delivered ?? 0 }}</td>
                <td><span [class]="'urg-' + p.urgency">{{ p.urgency }}</span></td>
                <td><span class="chip" [class]="p.status === 'Delivered' ? 'c-approved' : p.status === 'Cancelled' ? 'c-other' : 'c-sourcing'">{{ p.status }}</span></td>
                <td style="white-space:nowrap">
                  @if (p.status === 'Pending Procurement') {
                    <button class="btn-sm b-green" (click)="approveProcurement(p)">Approve</button>
                    <button class="btn-sm b-outline" (click)="cancelProcurement(p)" style="margin-left:4px">Cancel</button>
                  }
                  @if (p.status === 'Procurement Approved' || p.status === 'In Procurement') {
                    <button class="btn-sm b-red" (click)="openDeliver(p)"><i class="fas fa-box-open"></i> Record Delivery</button>
                  }
                </td>
              </tr>
            } @empty { <tr><td colspan="6" class="empty">No procurement requests.</td></tr> }
          </tbody>
        </table>
      </dmis-panel>
    }

    <!-- ── Dispatch drawer: source picker ── -->
    @if (drawer()) {
      <div class="drawer-back" (click)="drawer.set(null)">
        <div class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-head">
            <div><b>Dispatch — {{ drawer()!.allocation.resource_name ?? ('Allocation #' + drawer()!.allocation.id) }}</b>
              <div style="font-size:0.74rem; opacity:0.85">Quantity needed: {{ drawer()!.quantity_needed }} {{ drawer()!.allocation.unit_of_measure }}</div></div>
            <button class="btn-sm b-outline" (click)="drawer.set(null)">✕</button>
          </div>
          <div class="drawer-body">
            <label style="margin-top:0">Select a source</label>
            @for (s of stockedSources(); track $index) {
              <div class="src-item" [class.sel]="selected() === s" (click)="selected.set(s)">
                <input type="radio" [checked]="selected() === s" style="width:auto; margin-top:3px">
                <div style="flex:1">
                  <b>{{ s.source_name }}</b>
                  @if (s.requires_approval) { <span class="gate">MANAGER APPROVAL</span> } @else { <span class="direct">DIRECT</span> }
                  <div class="src-meta">{{ s.source_type_label }} · {{ s.location_name ?? '—' }}
                    @if (s.distance_km !== null) { · {{ s.distance_km }} km }
                    · <b>{{ s.available_quantity }}</b> available</div>
                </div>
              </div>
            } @empty { <div class="empty" style="padding:14px 0">No stocked source holds this resource — use procurement below.</div> }

            @if (stockedSources().length) {
              <label>Quantity to dispatch</label>
              <input type="number" min="1" [(ngModel)]="form.quantity">
              <label>Estimated arrival (optional)</label>
              <input type="date" [(ngModel)]="form.estimated_arrival">
              <label>Notes (optional)</label>
              <textarea rows="2" [(ngModel)]="form.notes"></textarea>
              <button class="btn-sm b-red" style="margin-top:12px; width:100%; padding:9px"
                      [disabled]="!selected()" (click)="dispatch()">
                <i class="fas fa-truck-arrow-right"></i>
                {{ selected()?.requires_approval ? 'Request Dispatch (needs source-manager approval)' : 'Dispatch Now' }}
              </button>
            }

            <hr style="margin:18px 0; border:none; border-top:1px solid #e3e6ed">
            <b style="font-size:0.85rem"><i class="fas fa-cart-shopping" style="color:#dc3545"></i> External procurement</b>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0 10px">
              <div><label>Quantity</label><input type="number" min="1" [(ngModel)]="proc.quantity"></div>
              <div><label>Urgency</label>
                <select [(ngModel)]="proc.urgency">
                  <option value="low">Low</option><option value="medium">Medium</option>
                  <option value="high">High</option><option value="critical">Critical</option>
                </select></div>
              <div><label>Estimated cost (TZS)</label><input type="number" min="0" [(ngModel)]="proc.estimated_cost"></div>
              <div><label>Preferred vendor</label><input [(ngModel)]="proc.preferred_vendor"></div>
            </div>
            <label>Notes</label><textarea rows="2" [(ngModel)]="proc.notes"></textarea>
            <button class="btn-sm b-outline" style="margin-top:10px; width:100%; padding:8px" (click)="submitProcurement()">
              Submit to Procurement Team</button>

            <hr style="margin:18px 0; border:none; border-top:1px solid #e3e6ed">
            <b style="font-size:0.85rem"><i class="fas fa-hand-holding-heart" style="color:#dc3545"></i> Stakeholder donations</b>
            @if (drawer()!.allocation.published_for_stakeholder_bidding) {
              <p style="font-size:0.78rem; color:#6c757d; margin:6px 0">Already published for bidding —
                manage offers from the pool.</p>
              <button class="btn-sm b-outline" style="width:100%; padding:8px"
                      (click)="openPool(drawer()!.allocation.id)">Open Bidding Pool</button>
            } @else {
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:0 10px">
                <div><label>Bid deadline</label><input type="date" [(ngModel)]="pub.bid_deadline"></div>
                <div><label>Priority</label>
                  <select [(ngModel)]="pub.priority">
                    <option value="low">Low</option><option value="medium">Medium</option>
                    <option value="high">High</option><option value="critical">Critical</option>
                  </select></div>
              </div>
              <label>Notes</label><textarea rows="2" [(ngModel)]="pub.notes"></textarea>
              <button class="btn-sm b-outline" style="margin-top:10px; width:100%; padding:8px" (click)="publish()">
                Publish to Stakeholders</button>
            }

            @if (drawer()!.journal.length) {
              <hr style="margin:18px 0; border:none; border-top:1px solid #e3e6ed">
              <b style="font-size:0.85rem">Fulfilment journal</b>
              @for (j of drawer()!.journal; track $index) {
                <div style="font-size:0.76rem; padding:6px 0; border-bottom:1px dashed #e3e6ed">
                  <b>{{ j.source_type }}</b> — {{ j.source_name ?? j.preferred_vendor ?? '' }}
                  @if (j.quantity_dispatched) { · dispatched {{ j.quantity_dispatched }} }
                  @if (j.status) { · <i>{{ j.status }}</i> }
                </div>
              }
            }
          </div>
        </div>
      </div>
    }

    <!-- ── Bidding pool drawer: one allocation's stakeholder offers ── -->
    @if (pool()) {
      <div class="drawer-back" (click)="pool.set(null)">
        <div class="drawer" (click)="$event.stopPropagation()">
          <div class="drawer-head">
            <div><b>Bidding Pool — {{ pool()!.allocation.resource_name }}</b>
              <div style="font-size:0.74rem; opacity:0.85">
                Needed {{ pool()!.quantity_needed }} · accepted {{ pool()!.accepted_quantity }} ·
                pending {{ pool()!.pending_quantity }} · remaining {{ pool()!.remaining_quantity }}</div></div>
            <button class="btn-sm b-outline" (click)="pool.set(null)">✕</button>
          </div>
          <div class="drawer-body">
            @for (b of pool()!.bids; track b.id) {
              <div class="src-item">
                <div style="flex:1">
                  <b>{{ b.stakeholder_name }}</b>
                  <span class="chip" [class]="b.status === 'Pending' ? 'c-waiting' : b.status === 'Accepted' ? 'c-sourcing' : b.status === 'Received' ? 'c-approved' : 'c-other'">{{ b.status }}</span>
                  <div class="src-meta">{{ b.quantity_offered }} &#64; {{ b.unit_price }} · delivery {{ b.delivery_date?.substring(0, 10) }}
                    @if (b.notes) { · {{ b.notes.substring(0, 50) }} }</div>
                  @if (b.recorded_by_name) { <div class="src-meta" style="font-size:.72rem;opacity:.8;"><i class="fas fa-user-pen"></i> Recorded by {{ b.recorded_by_name }}@if (b.accepted_by_name) { · accepted by {{ b.accepted_by_name }} }</div> }
                  <div style="margin-top:6px">
                    @if (b.status === 'Pending') {
                      <button class="btn-sm b-green" (click)="acceptBid(b)">Accept</button>
                      <button class="btn-sm b-outline" style="margin-left:4px" (click)="dismissBid(b)">Dismiss</button>
                    }
                    @if (b.status === 'Accepted') {
                      <button class="btn-sm b-red" (click)="receiveBid(b)"><i class="fas fa-box-open"></i> Mark Received</button>
                    }
                  </div>
                </div>
              </div>
            } @empty { <div class="empty" style="padding:14px 0">No offers submitted yet.</div> }

            <hr style="margin:16px 0; border:none; border-top:1px solid #e3e6ed">
            <button class="btn-sm b-outline" style="width:100%; padding:8px" (click)="closeBidding()">
              Close Bidding (withdraw pending offers)</button>
            @if (pool()!.can_return_to_dispatch) {
              <button class="btn-sm b-outline" style="width:100%; padding:8px; margin-top:6px" (click)="returnToDispatch()">
                Return to Dispatch (cancel bidding)</button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class DispatchConsoleComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  /** Sidebar aliases (dispatch-approvals, procurement) preselect their tab via route data. */
  readonly tab = signal<'board' | 'approvals' | 'procurement'>('board');
  readonly board = signal<BoardIncident[]>([]);
  readonly stats = signal<any>({});
  readonly pendingApprovalCount = signal(0);
  readonly approvals = signal<ApprovalRow[]>([]);
  readonly procurement = signal<ProcurementRow[]>([]);
  readonly drawer = signal<{ allocation: any; sources: DispatchSource[]; journal: any[]; quantity_needed: number } | null>(null);
  readonly selected = signal<DispatchSource | null>(null);
  /** Only sources that actually hold stock are pickable rows; channels render as forms. */
  readonly stockedSources = computed(() =>
    (this.drawer()?.sources ?? []).filter(s => ['warehouse', 'temporary_warehouse', 'agency'].includes(s.source_type)));

  readonly pool = signal<any | null>(null);

  form = { quantity: null as number | null, estimated_arrival: '', notes: '' };
  proc = { quantity: null as number | null, urgency: 'medium', estimated_cost: null as number | null, preferred_vendor: '', notes: '' };
  pub = { bid_deadline: '', priority: 'medium', notes: '' };

  ngOnInit(): void {
    ensureSweetAlert();
    const initialTab = this.route.snapshot.data['tab'];
    if (initialTab === 'approvals' || initialTab === 'procurement') {
      this.tab.set(initialTab);
    }
    this.loadAll();
  }

  loadAll(): void {
    this.http.get<any>('/api/v1/response/dispatch').subscribe(d => {
      this.board.set(d.grouped);
      this.stats.set(d.stats);
      this.pendingApprovalCount.set(d.pending_approval_count);
    });
    this.http.get<any>('/api/v1/response/dispatch/approvals').subscribe(d => this.approvals.set(d.approvals));
    this.http.get<any>('/api/v1/response/dispatch/procurement-requests').subscribe(d => this.procurement.set(d.requests));
  }

  openDispatch(allocationId: number): void {
    this.selected.set(null);
    this.form = { quantity: null, estimated_arrival: '', notes: '' };
    this.proc = { quantity: null, urgency: 'medium', estimated_cost: null, preferred_vendor: '', notes: '' };
    this.http.get<any>(`/api/v1/response/dispatch/allocations/${allocationId}/sources`).subscribe(d => {
      this.form.quantity = d.quantity_needed;
      this.proc.quantity = d.quantity_needed;
      this.drawer.set(d);
    });
  }

  dispatch(): void {
    const s = this.selected()!;
    this.post(`/api/v1/response/dispatch/allocations/${this.drawer()!.allocation.id}/dispatch`, {
      source_type: s.source_type, source_id: s.source_id,
      quantity: this.form.quantity, notes: this.form.notes || null,
      estimated_arrival: this.form.estimated_arrival || null,
    });
  }

  submitProcurement(): void {
    this.post(`/api/v1/response/dispatch/allocations/${this.drawer()!.allocation.id}/procurement`, { ...this.proc });
  }

  // ── Stakeholder bidding (channel 3) ──

  publish(): void {
    this.post(`/api/v1/response/bidding/allocations/${this.drawer()!.allocation.id}/publish`, {
      bid_deadline: this.pub.bid_deadline || null, priority: this.pub.priority, notes: this.pub.notes || null,
    });
  }

  openPool(allocationId: number): void {
    this.http.get<any>(`/api/v1/response/bidding/allocations/${allocationId}/pool`).subscribe(d => {
      this.drawer.set(null);
      this.pool.set(d);
    });
  }

  /** Refresh the open pool after a bid action, keeping the drawer in place. */
  private reloadPool(): void {
    const id = this.pool()?.allocation?.id;
    if (id) { this.openPool(id); }
    this.loadAll();
  }

  acceptBid(b: any): void {
    this.confirmThenPost(`Accept ${b.quantity_offered} from ${b.stakeholder_name}?`,
      `/api/v1/response/bidding/bids/${b.id}/accept`, 'notes', 'Acceptance notes (optional)', false, () => this.reloadPool());
  }

  dismissBid(b: any): void {
    this.confirmThenPost(`Dismiss the offer from ${b.stakeholder_name}?`,
      `/api/v1/response/bidding/bids/${b.id}/dismiss`, 'reason', 'Reason (min 10 characters)', true, () => this.reloadPool());
  }

  receiveBid(b: any): void {
    const p = this.pool()!;
    const options = p.warehouses.map((w: any) => `<option value="warehouse:${w.id}">${w.name} (zonal)</option>`).join('')
      + p.temporary_warehouses.map((w: any) => `<option value="temporary_warehouse:${w.id}">${w.name} (${w.level})</option>`).join('');
    ensureSweetAlert().then(() => Swal.fire({
      title: `Receive donation from ${b.stakeholder_name}`,
      html: `<select id="rb-dest" class="swal2-select" style="width:85%">${options}</select>
             <input id="rb-qty" type="number" min="1" class="swal2-input" placeholder="Quantity received" value="${b.quantity_offered}">
             <input id="rb-notes" class="swal2-input" placeholder="Notes (optional)">`,
      showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Receive into Store',
      preConfirm: () => {
        const qty = Number((document.getElementById('rb-qty') as HTMLInputElement).value);
        if (!qty || qty <= 0) { Swal.showValidationMessage('Quantity is required'); return false; }
        const [type, id] = (document.getElementById('rb-dest') as HTMLSelectElement).value.split(':');
        return {
          destination_type: type, received_quantity: qty,
          [type === 'warehouse' ? 'warehouse_id' : 'temporary_warehouse_id']: Number(id),
          notes: (document.getElementById('rb-notes') as HTMLInputElement).value || null,
        };
      },
    }).then((r: any) => {
      if (r.isConfirmed) { this.post(`/api/v1/response/bidding/bids/${b.id}/receive`, r.value, () => this.reloadPool()); }
    }));
  }

  closeBidding(): void {
    this.post(`/api/v1/response/bidding/allocations/${this.pool()!.allocation.id}/close-bidding`, {},
      () => this.pool.set(null));
  }

  returnToDispatch(): void {
    this.post(`/api/v1/response/bidding/allocations/${this.pool()!.allocation.id}/return-to-dispatch`, {},
      () => this.pool.set(null));
  }

  approveDispatch(a: ApprovalRow): void {
    this.confirmThenPost(`Approve dispatch of ${a.quantity} ${a.resource_name} from ${a.source_name}? Stock will be deducted.`,
      `/api/v1/response/dispatch/approvals/${a.id}/approve`, 'notes', 'Approval notes (optional)', false);
  }

  rejectDispatch(a: ApprovalRow): void {
    this.confirmThenPost(`Reject the dispatch from ${a.source_name}?`,
      `/api/v1/response/dispatch/approvals/${a.id}/reject`, 'reason', 'Rejection reason (min 10 characters)', true);
  }

  approveProcurement(p: ProcurementRow): void {
    this.confirmThenPost(`Approve procurement of ${p.quantity} ${p.resource_name}?`,
      `/api/v1/response/dispatch/procurement/${p.allocation_id}/approve`, 'notes', 'Approval notes (optional)', false);
  }

  cancelProcurement(p: ProcurementRow): void {
    this.confirmThenPost('Cancel this procurement request?',
      `/api/v1/response/dispatch/procurement/${p.allocation_id}/cancel`, 'reason', 'Cancellation reason (min 10 characters)', true);
  }

  /** Delivery dialog: destination store + received quantity → intake + journal update. */
  openDeliver(p: ProcurementRow): void {
    this.http.get<any>(`/api/v1/response/dispatch/procurement/${p.allocation_id}/track`).subscribe(t => {
      const warehouseOptions = t.warehouses.map((w: any) => `<option value="warehouse:${w.id}">${w.name} (zonal)</option>`).join('')
        + t.temporary_warehouses.map((w: any) => `<option value="temporary_warehouse:${w.id}">${w.name} (${w.level})</option>`).join('');
      ensureSweetAlert().then(() => Swal.fire({
        title: 'Record procurement delivery',
        html: `<select id="dl-dest" class="swal2-select" style="width:85%">${warehouseOptions}</select>
               <input id="dl-qty" type="number" min="1" class="swal2-input" placeholder="Quantity received" value="${t.procurement.remaining_quantity ?? p.quantity}">
               <input id="dl-cost" type="number" min="0" class="swal2-input" placeholder="Actual cost (optional)">
               <input id="dl-notes" class="swal2-input" placeholder="Delivery notes (optional)">`,
        showCancelButton: true, confirmButtonColor: '#dc3545', confirmButtonText: 'Record Delivery',
        preConfirm: () => {
          const qty = Number((document.getElementById('dl-qty') as HTMLInputElement).value);
          if (!qty || qty <= 0) { Swal.showValidationMessage('Quantity is required'); return false; }
          const [type, id] = (document.getElementById('dl-dest') as HTMLSelectElement).value.split(':');
          return {
            destination_type: type, actual_quantity: qty,
            [type === 'warehouse' ? 'warehouse_id' : 'temporary_warehouse_id']: Number(id),
            actual_cost: Number((document.getElementById('dl-cost') as HTMLInputElement).value) || null,
            delivery_notes: (document.getElementById('dl-notes') as HTMLInputElement).value || null,
          };
        },
      }).then((r: any) => {
        if (r.isConfirmed) { this.post(`/api/v1/response/dispatch/procurement/${p.allocation_id}/deliver`, r.value); }
      }));
    });
  }

  /** Shared confirm → optional input → POST → toast → reload sequence. */
  private confirmThenPost(title: string, url: string, field: string, inputLabel: string,
                          required: boolean, after?: () => void): void {
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
      if (r.isConfirmed) { this.post(url, { [field]: r.value || null }, after); }
    }));
  }

  /** POST → toast; default afterwards closes the dispatch drawer and reloads everything. */
  private post(url: string, body: any, after?: () => void): void {
    this.http.post<any>(url, body).subscribe({
      next: r => ensureSweetAlert().then(() => Swal.fire({
        icon: 'success', title: 'Done', text: r.message, timer: 2600, showConfirmButton: false,
      }).then(() => {
        if (after) { after(); } else { this.drawer.set(null); this.loadAll(); }
      })),
      error: err => ensureSweetAlert().then(() =>
        Swal.fire('Error', err?.error?.detail ?? err?.error?.message ?? 'An error occurred.', 'error')),
    });
  }

  chipClass(status: string): string {
    switch (status) {
      case 'Approved': case 'Dispatch Approved': return 'c-approved';
      case 'Sourcing': case 'Requested to Stakeholders': return 'c-sourcing';
      case 'Awaiting Dispatch Approval': return 'c-waiting';
      default: return 'c-other';
    }
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
