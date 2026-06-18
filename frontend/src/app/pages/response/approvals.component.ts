import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

interface ApprovalRow {
  id: number; status: string; workflow_status: string | null; current_workflow_step: number | null;
  current_step_name: string | null; quantity_requested: number; unit_of_measure: string;
  justification_for_request: string | null; rejection_reason: string | null;
  incident_id: number; incident_title: string; severity_level: string;
  resource_name: string; resource_category: string; requested_by_name: string | null;
}

/**
 * Reproduction of response/approval/index + my-requests + show on the generalized
 * engine: the pending queue (requests sitting at an approval step), the full
 * request history, the caller's own requests with in-app notifications, and a
 * detail drawer with the step chain plus approve / fast-track / reject /
 * rollback / resubmit actions.
 */
@Component({
  selector: 'page-response-approvals',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .queue-tabs { display: flex; gap: 4px; background: #fff; border-bottom: 2px solid #e3e6ed; border-radius: 12px 12px 0 0; padding: 0 4px; margin-bottom: 12px; }
    .queue-tabs button { font-size: 0.82rem; font-weight: 600; color: #6c757d; border: none; background: none; padding: 10px 16px; border-bottom: 2px solid transparent; margin-bottom: -2px; cursor: pointer; font-family: inherit; }
    .queue-tabs button.active { color: #dc3545; border-bottom-color: #dc3545; }
    .q-badge { background: rgba(220,53,69,0.1); color: #dc3545; border-radius: 10px; padding: 0 6px; font-size: 0.68rem; margin-left: 4px; }
    .actions button { font-size: 0.7rem; padding: 2px 8px; border-radius: 6px; }
    /* Detail drawer */
    .drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.35); z-index: 1090; opacity: 0; pointer-events: none; transition: opacity 0.25s; }
    .drawer-backdrop.open { opacity: 1; pointer-events: auto; }
    .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 460px; max-width: 100vw; background: #fff; z-index: 1095; box-shadow: -8px 0 40px rgba(0,0,0,0.1); transform: translateX(100%); transition: transform 0.3s ease; display: flex; flex-direction: column; }
    .drawer.open { transform: translateX(0); }
    .drawer-head { background: #dc3545; color: #fff; padding: 1rem 1.25rem; }
    .drawer-body { flex: 1; overflow-y: auto; padding: 1rem 1.25rem; }
    .step { display: flex; gap: 0.6rem; padding: 0.45rem 0; border-bottom: 1px solid #f1f5f9; align-items: flex-start; }
    .step-dot { width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 0.6rem; flex-shrink: 0; margin-top: 2px; }
    .step-dot.approved { background: #198754; }
    .step-dot.pending { background: #adb5bd; }
    .step-dot.rejected { background: #dc3545; }
    .notif { font-size: 0.78rem; padding: 0.4rem 0; border-bottom: 1px solid #f1f5f9; }
    .notif.unread { font-weight: 600; }
  `],
  template: `
    <dmis-page-header title="Resource Approval Workflow" icon="fa-clipboard-check"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Approvals'}]">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search requests..." [ngModel]="search()" (ngModelChange)="search.set($event)" (keydown.enter)="load()">
      </div>
    </dmis-page-header>

    <div class="queue-tabs">
      <button [class.active]="tab() === 'pending'" (click)="tab.set('pending')">Pending My Approval <span class="q-badge">{{ pending().length }}</span></button>
      <button [class.active]="tab() === 'all'" (click)="tab.set('all')">All Requests <span class="q-badge">{{ all().length }}</span></button>
      <button [class.active]="tab() === 'mine'" (click)="tab.set('mine'); loadMine()">My Requests & Notifications <span class="q-badge">{{ mine().length }}</span></button>
    </div>

    @if (tab() !== 'mine') {
      <div class="panel-row">
        <dmis-panel [title]="tab() === 'pending' ? 'Requests Awaiting Approval' : 'All Requests'" icon="fa-database" [badge]="visible().length + ''">
          <div class="panel-body" style="padding:0;">
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead>
                  <tr><th>#</th><th>Incident</th><th>Resource</th><th>Qty</th><th>Current Stage</th><th>Status</th><th>Requested By</th><th></th></tr>
                </thead>
                <tbody>
                  @for (a of visible(); track a.id) {
                    <tr class="data-row">
                      <td style="font-size:0.82rem;color:var(--text-mid);">{{ a.id }}</td>
                      <td>
                        <a [routerLink]="['/m/response/incidents', a.incident_id]" style="text-decoration:none;">
                          <div class="r-title" style="color:#dc3545;font-size:0.8rem;">{{ limit(a.incident_title, 32) }}</div>
                          <div class="r-subtitle">{{ a.severity_level }}</div>
                        </a>
                      </td>
                      <td><div class="r-title" style="font-size:0.8rem;">{{ a.resource_name }}</div><div class="r-subtitle">{{ a.resource_category }}</div></td>
                      <td style="font-size:0.82rem;">{{ a.quantity_requested }} {{ a.unit_of_measure }}</td>
                      <td style="font-size:0.78rem;color:var(--text-mid);">{{ a.current_step_name ?? '—' }}</td>
                      <td><span class="r-badge" [class]="'r-badge ' + statusBadge(a)">{{ wfLabel(a) }}</span></td>
                      <td style="font-size:0.78rem;color:var(--text-mid);">{{ a.requested_by_name ?? '-' }}</td>
                      <td><button class="r-view" style="font-size:0.72rem;padding:0.3rem 0.6rem;" (click)="open(a)"><i class="fas fa-eye"></i> Review</button></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="8"><div class="empty-state"><i class="fas fa-clipboard-check"></i> No requests here.</div></td></tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        </dmis-panel>
      </div>
    } @else {
      <div class="row">
        <div class="col-lg-7">
          <dmis-panel title="My Requests" icon="fa-list" [badge]="mine().length + ''">
            <div class="panel-body" style="padding:0;">
              <table class="r-table">
                <thead><tr><th>#</th><th>Resource</th><th>Qty</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  @for (a of mine(); track a.id) {
                    <tr class="data-row">
                      <td style="font-size:0.82rem;">{{ a.id }}</td>
                      <td><div class="r-title" style="font-size:0.8rem;">{{ a.resource_name }}</div><div class="r-subtitle">{{ limit(a.incident_title, 30) }}</div></td>
                      <td style="font-size:0.82rem;">{{ a.quantity_requested }} {{ a.unit_of_measure }}</td>
                      <td><span class="r-badge" [class]="'r-badge ' + statusBadge(a)">{{ wfLabel(a) }}</span></td>
                      <td>
                        @if (a.workflow_status === 'requires_revision') {
                          <button class="btn btn-sm btn-outline-primary" style="font-size:0.7rem;" (click)="resubmit(a)"><i class="fas fa-redo me-1"></i>Resubmit</button>
                        } @else {
                          <button class="r-view" style="font-size:0.72rem;padding:0.3rem 0.6rem;" (click)="open(a)"><i class="fas fa-eye"></i></button>
                        }
                      </td>
                    </tr>
                  } @empty { <tr><td colspan="5"><div class="empty-state">No requests yet.</div></td></tr> }
                </tbody>
              </table>
            </div>
          </dmis-panel>
        </div>
        <div class="col-lg-5">
          <dmis-panel title="Notifications" icon="fa-bell" [badge]="notifications().length + ''">
            <div class="panel-body">
              @for (n of notifications(); track n.id) {
                <div class="notif" [class.unread]="!n.is_read">
                  <i class="fas me-1" [class]="'fas me-1 ' + notifIcon(n.type)"></i>
                  <strong>{{ n.title }}</strong> — {{ n.message }}
                </div>
              } @empty { <div style="font-size:0.8rem;color:var(--text-light);">No notifications.</div> }
            </div>
          </dmis-panel>
        </div>
      </div>
    }

    <!-- ═══ Review drawer: chain timeline + actions ═══ -->
    <div class="drawer-backdrop" [class.open]="drawerOpen()" (click)="drawerOpen.set(false)"></div>
    <div class="drawer" [class.open]="drawerOpen()">
      @if (detail(); as d) {
        <div class="drawer-head">
          <div style="font-size:0.7rem;text-transform:uppercase;opacity:0.75;">Request #{{ d.id }}</div>
          <div style="font-weight:700;">{{ d.resource_name }} — {{ d.quantity_requested }} {{ d.unit_of_measure }}</div>
          <div style="font-size:0.75rem;opacity:0.85;">{{ d.incident_title }}</div>
        </div>
        <div class="drawer-body">
          <div style="font-size:0.8rem;margin-bottom:0.75rem;">
            <strong>Justification:</strong> {{ d.justification_for_request ?? '-' }}<br>
            <strong>Requested by:</strong> {{ d.requested_by_name ?? '-' }} ·
            <strong>Source:</strong> {{ d.warehouse_name ?? d.source_details ?? 'TBD' }}
          </div>
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:var(--text-light);margin-bottom:0.4rem;">
            Approval Chain — {{ d.workflow.progress }}%
          </div>
          @for (s of d.workflow.steps; track s.step_number) {
            <div class="step">
              <div class="step-dot" [class]="'step-dot ' + s.status">
                @if (s.status === 'approved') { <i class="fas fa-check"></i> }
                @else if (s.status === 'rejected') { <i class="fas fa-times"></i> }
                @else { {{ s.step_number }} }
              </div>
              <div style="flex:1;">
                <div style="font-size:0.8rem;font-weight:600;">{{ s.step_name }} <span style="font-weight:400;color:var(--text-light);">({{ s.approver_role }})</span></div>
                @if (s.actioned_by) { <div style="font-size:0.7rem;color:var(--text-light);">{{ s.actioned_by }} · {{ s.remarks ?? s.rejection_reason ?? '' }}</div> }
              </div>
            </div>
          }
          <div class="d-flex gap-2 flex-wrap mt-3 actions">
            @if (d.can_approve) {
              <button class="btn btn-success" (click)="act('approve', 'Approve the current step?', 'Remarks (optional)', false)"><i class="fas fa-check me-1"></i>Approve Step</button>
              <button class="btn btn-outline-success" (click)="act('fast-track', 'Fast-track ALL remaining steps? (Super Admin)', 'Remarks (optional)', false)"><i class="fas fa-forward me-1"></i>Fast Track</button>
              <button class="btn btn-outline-warning" (click)="act('rollback', 'Roll back to requester for revision?', 'Rollback reason (required)', true, 'rollback_reason')"><i class="fas fa-undo me-1"></i>Roll Back</button>
              <button class="btn btn-outline-danger" (click)="act('reject', 'Reject this request?', 'Rejection reason (required)', true, 'rejection_reason')"><i class="fas fa-times me-1"></i>Reject</button>
            }
            @if (d.can_edit) {
              <button class="btn btn-outline-primary" (click)="act('resubmit', 'Resubmit after corrections?', null, false)"><i class="fas fa-redo me-1"></i>Resubmit</button>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class ResponseApprovalsComponent implements OnInit {
  private http = inject(HttpClient);

  tab = signal<'pending' | 'all' | 'mine'>('pending');
  search = signal('');
  pending = signal<ApprovalRow[]>([]);
  all = signal<ApprovalRow[]>([]);
  mine = signal<ApprovalRow[]>([]);
  notifications = signal<any[]>([]);
  drawerOpen = signal(false);
  detail = signal<any | null>(null);

  visible = computed(() => this.tab() === 'pending' ? this.pending() : this.all());

  ngOnInit(): void {
    ensureSweetAlert();
    this.load();
  }

  load(): void {
    const params: Record<string, string> = this.search() ? { search: this.search() } : {};
    this.http.get<any>('/api/v1/response/approvals', { params }).subscribe(d => {
      this.pending.set(d.pending_approvals);
      this.all.set(d.all_requests);
    });
  }

  loadMine(): void {
    this.http.get<any>('/api/v1/response/approvals/my-requests').subscribe(d => {
      this.mine.set(d.my_requests);
      this.notifications.set(d.notifications);
    });
  }

  open(a: ApprovalRow): void {
    this.http.get<any>(`/api/v1/response/approvals/${a.id}`).subscribe(d => {
      this.detail.set(d);
      this.drawerOpen.set(true);
    });
  }

  resubmit(a: ApprovalRow): void {
    this.http.post<any>(`/api/v1/response/approvals/${a.id}/resubmit`, {}).subscribe({
      next: r => ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Resubmitted', text: r.message, timer: 2200, showConfirmButton: false }).then(() => this.loadMine())),
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.detail ?? 'An error occurred.', 'error')),
    });
  }

  /** Confirm → optional reason input → POST the drawer action → refresh both views. */
  act(action: string, title: string, inputLabel: string | null, required: boolean, field = 'remarks'): void {
    const id = this.detail()!.id;
    ensureSweetAlert().then(() => {
      Swal.fire({
        title, icon: 'question', showCancelButton: true, confirmButtonColor: '#dc3545',
        ...(inputLabel ? { input: 'textarea', inputLabel } : {}),
        preConfirm: (value: string) => {
          if (required && !value?.trim()) {
            Swal.showValidationMessage('This field is required');
            return false;
          }
          return value;
        },
      }).then((res: any) => {
        if (!res.isConfirmed) { return; }
        const body: any = {};
        if (res.value) { body[field] = res.value; }
        this.http.post<any>(`/api/v1/response/approvals/${id}/${action}`, body).subscribe({
          next: r => Swal.fire({ icon: 'success', title: 'Done', text: r.message, timer: 2400, showConfirmButton: false })
            .then(() => { this.drawerOpen.set(false); this.load(); this.open({ id } as ApprovalRow); }),
          error: err => Swal.fire('Error', err?.error?.detail ?? err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  wfLabel(a: ApprovalRow): string {
    const map: Record<string, string> = {
      pending_approval: 'Pending Approval', approved: 'Approved', rejected: 'Rejected',
      requires_revision: 'Requires Revision',
    };
    return map[a.workflow_status ?? ''] ?? a.status;
  }

  statusBadge(a: ApprovalRow): string {
    const map: Record<string, string> = {
      pending_approval: 'badge-pending', approved: 'badge-approved',
      rejected: 'badge-rejected', requires_revision: 'badge-rejected',
    };
    return map[a.workflow_status ?? ''] ?? 'badge-inactive';
  }

  notifIcon(type: string): string {
    return ({
      approval_request: 'fa-clipboard-check', approval_granted: 'fa-check-circle',
      approval_rejected: 'fa-times-circle', rollback: 'fa-undo',
    } as Record<string, string>)[type] ?? 'fa-bell';
  }

  limit(s: string, max: number): string {
    return s.length <= max ? s : s.substring(0, max).trimEnd() + '...';
  }
}

/** Loads SweetAlert2 from the same CDN the Blade page pushes, once. */
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
      document.head.appendChild(script);
    });
  }
  return swalPromise;
}
