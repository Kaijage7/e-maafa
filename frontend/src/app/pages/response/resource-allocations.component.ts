import { HttpClient } from '@angular/common/http';
import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

interface AllocationRow {
  id: number; status: string; quantity_requested: number; unit_of_measure: string;
  justification_for_request: string | null; created_at: string;
  incident_id: number; incident_title: string; severity_level: string;
  resource_name: string; resource_category: string;
  requested_by_name: string | null; forwarded_by_name: string | null; rejection_reason: string | null;
}
interface FormData {
  incidents: { id: number; title: string; severity_level: string }[];
  resources: { id: number; name: string; category: string; unit_of_measure: string; available_stock: number }[];
  urgency_levels: string[];
}

/**
 * Reproduction of response/resource-allocation/index + create: the three
 * operational queues (pending → forward/approve/reject, forwarded-to-PMO,
 * active deployments with In Transit → Deployed → Delivered transitions),
 * warehouse stock summary, and the multi-resource request form gated to
 * approved/active incidents — the entry point of the relief supply chain.
 */
@Component({
  selector: 'page-resource-allocations',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent],
  styles: [`
    .queue-tabs { display: flex; gap: 4px; background: #fff; border-bottom: 2px solid #e3e6ed; border-radius: 12px 12px 0 0; padding: 0 4px; margin-bottom: 12px; }
    .queue-tabs button { font-size: 0.82rem; font-weight: 600; color: #6c757d; border: none; background: none; padding: 10px 16px; border-bottom: 2px solid transparent; margin-bottom: -2px; cursor: pointer; font-family: inherit; }
    .queue-tabs button.active { color: #dc3545; border-bottom-color: #dc3545; }
    .q-badge { background: rgba(220,53,69,0.1); color: #dc3545; border-radius: 10px; padding: 0 6px; font-size: 0.68rem; margin-left: 4px; }
    .stock-pill { font-size: 0.68rem; color: var(--text-light); }
    .actions button { font-size: 0.7rem; padding: 2px 8px; border-radius: 6px; }
    .req-modal { display: none; position: fixed; inset: 0; z-index: 1100; background: rgba(0,0,0,0.5); overflow-y: auto; }
    .req-modal.open { display: block; }
    .req-card { background: #fff; border-radius: 0.5rem; margin: 1.75rem auto; max-width: 880px; box-shadow: 0 12px 40px rgba(0,0,0,0.25); }
    .req-head { background: #c1272d; color: #fff; padding: 1rem 1.25rem; border-radius: 0.5rem 0.5rem 0 0; display: flex; justify-content: space-between; }
    .req-body { padding: 1.25rem; max-height: 70vh; overflow-y: auto; }
    .req-foot { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0.85rem 1.25rem; border-top: 1px solid #e9ecef; }
    .res-line { display: grid; grid-template-columns: auto 1fr 110px 90px; gap: 0.6rem; align-items: center; padding: 0.3rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.82rem; }
  `],
  template: `
    <dmis-page-header title="Resource Allocation & Deployment" icon="fa-truck"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'}, {label:'Resource Allocation'}]">
      <button type="button" class="btn-add" (click)="openRequest()"><i class="fas fa-plus"></i> Request Resources</button>
    </dmis-page-header>

    <div class="queue-tabs">
      <button [class.active]="tab() === 'pending'" (click)="tab.set('pending')">Pending Requests <span class="q-badge">{{ pending().length }}</span></button>
      <button [class.active]="tab() === 'forwarded'" (click)="tab.set('forwarded')">Forwarded to PMO <span class="q-badge">{{ forwarded().length }}</span></button>
      <button [class.active]="tab() === 'active'" (click)="tab.set('active')">Active Deployments <span class="q-badge">{{ active().length }}</span></button>
    </div>

    <div class="panel-row">
      <dmis-panel [title]="tabTitle()" icon="fa-database" [badge]="visible().length + ''">
        <div class="panel-body" style="padding:0;">
          <div style="overflow-x:auto;">
            <table class="r-table">
              <thead>
                <tr><th>#</th><th>Incident</th><th>Resource</th><th>Qty</th><th>Status</th><th>Requested By</th><th>Justification</th><th>Actions</th></tr>
              </thead>
              <tbody>
                @for (a of visible(); track a.id) {
                  <tr class="data-row">
                    <td style="font-size:0.82rem;color:var(--text-mid);">{{ a.id }}</td>
                    <td>
                      <a [routerLink]="['/m/response/incidents', a.incident_id]" style="text-decoration:none;">
                        <div class="r-title" style="color:#dc3545;font-size:0.8rem;">{{ limit(a.incident_title, 35) }}</div>
                        <div class="r-subtitle">{{ a.severity_level }}</div>
                      </a>
                    </td>
                    <td><div class="r-title" style="font-size:0.8rem;">{{ a.resource_name }}</div><div class="r-subtitle">{{ a.resource_category }}</div></td>
                    <td style="font-size:0.82rem;">{{ a.quantity_requested }} {{ a.unit_of_measure }}</td>
                    <td><span class="r-badge" [class]="'r-badge ' + statusBadge(a.status)">{{ a.status }}</span></td>
                    <td style="font-size:0.78rem;color:var(--text-mid);">{{ a.requested_by_name ?? '-' }}</td>
                    <td style="font-size:0.75rem;color:var(--text-mid);max-width:230px;">{{ limit(a.justification_for_request ?? '-', 70) }}</td>
                    <td style="text-align:right;">
                      <div class="ctx-wrap">
                        <button class="ctx-trigger" type="button" (click)="toggleMenu(a.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                        <div class="ctx-menu" [class.open]="openMenu() === a.id">
                          @if (tab() === 'pending') {
                            <a class="ctx-item" (click)="forward(a)"><i class="fas fa-share"></i> Forward to PMO</a>
                            <a class="ctx-item success" (click)="approve(a)"><i class="fas fa-check"></i> Quick approve</a>
                            <a class="ctx-item danger" (click)="reject(a)"><i class="fas fa-times"></i> Reject</a>
                          }
                          @if (tab() === 'active') {
                            @for (next of nextStatuses(a.status); track next) {
                              <a class="ctx-item" (click)="setStatus(a, next)"><i class="fas fa-arrow-right"></i> {{ next }}</a>
                            }
                          }
                          <a class="ctx-item" (click)="track(a)"><i class="fas fa-route"></i> Track movement</a>
                        </div>
                      </div>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="8"><div class="empty-state"><i class="fas fa-truck"></i> Nothing in this queue.</div></td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </dmis-panel>
    </div>

    <div class="panel-row">
      <dmis-panel title="Warehouse Stock Summary" icon="fa-warehouse">
        <div class="panel-body" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:0.75rem;">
          @for (w of warehouses(); track w.id) {
            <div style="border:1px solid #e3e6ed;border-radius:10px;padding:0.6rem 0.8rem;">
              <div class="r-title" style="font-size:0.8rem;">{{ w.name }}</div>
              <div style="font-size:0.72rem;color:var(--text-mid);">{{ w.total_items }} items
                @if (w.critical_items > 0) { · <span style="color:#dc3545;">{{ w.critical_items }} low</span> }
              </div>
            </div>
          }
        </div>
      </dmis-panel>
    </div>

    <!-- ═══ Request Resources modal: incident + multi-resource lines + justification ═══ -->
    <div class="req-modal" [class.open]="requestOpen()" (click)="backdrop($event)">
      <div class="req-card" (click)="$event.stopPropagation()">
        <div class="req-head">
          <h5 style="margin:0;font-size:1.05rem;"><i class="fas fa-truck me-2"></i>Request Resources</h5>
          <button type="button" style="background:none;border:none;color:#fff;font-size:1.3rem;cursor:pointer;" (click)="requestOpen.set(false)">&times;</button>
        </div>
        <div class="req-body">
          @if (errors().length) {
            <div class="alert alert-danger"><ul class="mb-0">@for (e of errors(); track $index) { <li>{{ e }}</li> }</ul></div>
          }
          <div class="row g-3 mb-3">
            <div class="col-md-8">
              <label class="form-label">Incident <span class="text-danger">*</span></label>
              <select class="form-select" [(ngModel)]="reqForm.incident_id">
                <option value="">Select approved/active incident</option>
                @for (i of fd()?.incidents ?? []; track i.id) { <option [value]="i.id">{{ i.title }} ({{ i.severity_level }})</option> }
              </select>
            </div>
            <div class="col-md-4">
              <label class="form-label">Urgency <span class="text-danger">*</span></label>
              <select class="form-select" [(ngModel)]="reqForm.urgency">
                @for (u of fd()?.urgency_levels ?? []; track u) { <option [value]="u">{{ u }}</option> }
              </select>
            </div>
          </div>
          <label class="form-label">Resources <span class="text-danger">*</span> <small class="text-muted">(tick + quantity; stock shown for reference — requesting beyond stock is allowed)</small></label>
          <div style="max-height:260px;overflow-y:auto;border:1px solid #e3e6ed;border-radius:10px;padding:0.5rem 0.8rem;">
            @for (r of fd()?.resources ?? []; track r.id) {
              <div class="res-line">
                <input type="checkbox" [checked]="selected().has(r.id)" (change)="toggle(r.id)">
                <span>{{ r.name }} <span class="stock-pill">· {{ r.category }} · stock {{ r.available_stock }}</span></span>
                <input type="number" min="1" class="form-control form-control-sm" placeholder="Qty"
                       [disabled]="!selected().has(r.id)" [(ngModel)]="quantities[r.id]">
                <span class="stock-pill">{{ r.unit_of_measure }}</span>
              </div>
            }
          </div>
          <div class="mt-3">
            <label class="form-label">Justification <span class="text-danger">*</span></label>
            <textarea rows="3" class="form-control" maxlength="1000" placeholder="Why are these resources needed?" [(ngModel)]="reqForm.justification"></textarea>
          </div>
        </div>
        <div class="req-foot">
          <button type="button" class="btn btn-secondary" (click)="requestOpen.set(false)">Cancel</button>
          <button type="button" class="btn-add" [disabled]="submitting()" (click)="submitRequest()"><i class="fas fa-paper-plane"></i> Submit Request</button>
        </div>
      </div>
    </div>
  `,
})
export class ResourceAllocationsComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  tab = signal<'pending' | 'forwarded' | 'active'>('pending');
  openMenu = signal<number | null>(null);
  pending = signal<AllocationRow[]>([]);
  forwarded = signal<AllocationRow[]>([]);
  active = signal<AllocationRow[]>([]);
  warehouses = signal<any[]>([]);
  fd = signal<FormData | null>(null);

  requestOpen = signal(false);
  submitting = signal(false);
  errors = signal<string[]>([]);
  selected = signal(new Set<number>());
  quantities: Record<number, number> = {};
  reqForm = { incident_id: '', urgency: 'high', justification: '' };

  visible = computed(() =>
      this.tab() === 'pending' ? this.pending() : this.tab() === 'forwarded' ? this.forwarded() : this.active());

  ngOnInit(): void {
    ensureSweetAlert();
    this.http.get<FormData>('/api/v1/response/allocations/form-data').subscribe(fd => this.fd.set(fd));
    this.load();
    // Deep link from an incident page: ?incident_id=N opens the request modal pre-filled
    const incidentId = this.route.snapshot.queryParamMap.get('incident_id');
    if (incidentId) {
      this.reqForm.incident_id = incidentId;
      setTimeout(() => this.requestOpen.set(true), 150);
    }
  }

  load(): void {
    this.http.get<any>('/api/v1/response/allocations').subscribe(d => {
      this.pending.set(d.pending_requests);
      this.forwarded.set(d.forwarded_requests);
      this.active.set(d.active_deployments);
      this.warehouses.set(d.warehouse_inventory);
    });
  }

  tabTitle(): string {
    return this.tab() === 'pending' ? 'Pending Requests'
        : this.tab() === 'forwarded' ? 'Forwarded to PMO (read-only)' : 'Active Deployments';
  }

  /** The source's updateStatus() transition matrix, mirrored for the action buttons. */
  toggleMenu(id: number, event: Event): void { event.stopPropagation(); this.openMenu.update(c => (c === id ? null : id)); }
  @HostListener('document:click') closeMenu(): void { this.openMenu.set(null); }

  nextStatuses(status: string): string[] {
    const transitions: Record<string, string[]> = {
      'Approved': ['In Transit'],
      'In Transit': ['Deployed', 'Returned'],
      'Deployed': ['Delivered', 'Returned'],
    };
    return transitions[status] ?? [];
  }

  openRequest(): void {
    this.errors.set([]);
    this.selected.set(new Set());
    this.quantities = {};
    this.reqForm = { incident_id: this.reqForm.incident_id || '', urgency: 'high', justification: '' };
    this.requestOpen.set(true);
  }

  backdrop(ev: Event): void {
    if (ev.target === ev.currentTarget) { this.requestOpen.set(false); }
  }

  toggle(id: number): void {
    const next = new Set(this.selected());
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    this.selected.set(next);
  }

  submitRequest(): void {
    const lines = [...this.selected()]
        .filter(id => Number(this.quantities[id]) >= 1)
        .map(id => ({ resource_id: id, quantity: Number(this.quantities[id]) }));
    this.submitting.set(true);
    this.errors.set([]);
    this.http.post<any>('/api/v1/response/allocations', {
      incident_id: this.reqForm.incident_id || null,
      urgency: this.reqForm.urgency,
      justification: this.reqForm.justification.trim() || null,
      resources: lines,
    }).subscribe({
      next: res => {
        this.submitting.set(false);
        this.requestOpen.set(false);
        ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Submitted', text: res.message, timer: 3000, showConfirmButton: false })
          .then(() => this.load()));
      },
      error: err => {
        this.submitting.set(false);
        this.errors.set(err.status === 422 && err.error?.errors
          ? Object.values(err.error.errors as Record<string, string[]>).flat()
          : [err.error?.detail ?? err.error?.message ?? 'An error occurred.']);
      },
    });
  }

  forward(a: AllocationRow): void {
    this.confirmAction(`Forward "${a.resource_name}" to PMO?`, 'Remarks (optional)', false,
        remarks => this.http.post<any>(`/api/v1/response/allocations/${a.id}/forward`, { remarks }));
  }

  approve(a: AllocationRow): void {
    this.confirmAction(`Quick-approve ${a.quantity_requested} ${a.unit_of_measure} of "${a.resource_name}"?`, null, false,
        () => this.http.post<any>(`/api/v1/response/allocations/${a.id}/approve`, {}));
  }

  reject(a: AllocationRow): void {
    this.confirmAction(`Reject "${a.resource_name}" request?`, 'Rejection reason (required)', true,
        reason => this.http.post<any>(`/api/v1/response/allocations/${a.id}/reject`, { rejection_reason: reason }));
  }

  setStatus(a: AllocationRow, status: string): void {
    this.confirmAction(`Mark "${a.resource_name}" as ${status}?`, 'Notes (optional)', false,
        notes => this.http.post<any>(`/api/v1/response/allocations/${a.id}/status`, { status, notes }));
  }

  track(a: AllocationRow): void {
    this.http.get<any>(`/api/v1/response/allocations/${a.id}/track`).subscribe(d => {
      const steps = ['requested', 'forwarded', 'approved', 'dispatched', 'deployed', 'delivered']
          .map(k => `<div style="padding:2px 0;">${d.timeline[k] ? '✅' : '⬜'} ${k[0].toUpperCase() + k.slice(1)}</div>`).join('');
      const history = (d.history as any[]).map(h =>
          `<div style="font-size:0.78rem;color:#4a5568;">• ${h.action} — ${h.remarks ?? ''} <span style="color:#9ca3af;">(${h.user_name ?? ''})</span></div>`).join('');
      ensureSweetAlert().then(() => Swal.fire({
        title: `${d.resource_name} → ${d.status}`,
        html: `<div class="text-start" style="font-size:0.85rem;">
                 <b>Incident:</b> ${d.incident_title}<br><b>From:</b> ${d.warehouse_name ?? 'TBD'}<br><br>
                 ${steps}<hr style="margin:8px 0;">${history || '<i>No history.</i>'}</div>`,
        width: 520, confirmButtonColor: '#dc3545',
      }));
    });
  }

  /** Shared confirm → optional input → POST → toast → reload pattern for queue actions. */
  private confirmAction(title: string, inputLabel: string | null, inputRequired: boolean,
                        request: (value: string | null) => any): void {
    ensureSweetAlert().then(() => {
      Swal.fire({
        title, icon: 'question', showCancelButton: true, confirmButtonColor: '#dc3545',
        ...(inputLabel ? { input: 'textarea', inputLabel } : {}),
        preConfirm: (value: string) => {
          if (inputRequired && !value?.trim()) {
            Swal.showValidationMessage('This field is required');
            return false;
          }
          return value ?? null;
        },
      }).then((res: any) => {
        if (!res.isConfirmed) { return; }
        request(res.value || null).subscribe({
          next: (r: any) => Swal.fire({ icon: 'success', title: 'Done', text: r.message, timer: 2200, showConfirmButton: false }).then(() => this.load()),
          error: (err: any) => Swal.fire('Error', err?.error?.detail ?? err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  statusBadge(s: string): string {
    return ({
      'Requested': 'badge-pending', 'Pending Approval': 'badge-pending', 'Pending PMO Approval': 'badge-published',
      'Approved': 'badge-approved', 'In Transit': 'badge-active', 'Deployed': 'badge-published',
      'Delivered': 'badge-approved', 'Rejected': 'badge-rejected', 'Returned': 'badge-inactive',
    } as Record<string, string>)[s] ?? 'badge-inactive';
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
