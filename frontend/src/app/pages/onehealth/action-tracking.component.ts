import { NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

interface ActionItem {
  id: number; directive_id: number | null; stakeholder_id: number | null;
  action_title: string; action_description: string | null; status: string;
  completion_percentage: number; target_date: string | null; target_date_display: string | null;
  completed_date: string | null; completed_date_display: string | null; remarks: string | null;
  directive_title: string | null; stakeholder_organization: string | null;
}
interface ActionsResponse {
  event: { id: number; event_id: string; event_title: string; status: string; completion_percentage: number };
  actions: ActionItem[];
  directives: { id: number; directive_title: string }[];
  stakeholders: { id: number; organization: string; name: string }[];
}

/**
 * Reproduction of onehealth/action-tracking/index.blade.php + _action_card.blade.php:
 * the event completion progress (with Close Event once at 100% — reachable here,
 * unlike the source per OH-11), actions grouped by directive, inline action cards
 * with edit mode and the live progress slider that rolls up into the event bar.
 */
@Component({
  selector: 'page-oh-action-tracking',
  standalone: true,
  imports: [FormsModule, RouterLink, NgTemplateOutlet, PageHeaderComponent, PanelComponent],
  styles: [`
    .progress { background: #e9ecef; border-radius: 0.375rem; overflow: hidden; display: flex; }
    .progress-bar { background: #198754; color: #fff; font-size: 0.78rem; display: flex; align-items: center; justify-content: center; white-space: nowrap; transition: width 0.6s ease; }
    .list-group-item { padding: 0.85rem 1.1rem; border-bottom: 1px solid #f1f5f9; }
    .list-group-item:last-child { border-bottom: none; }
    .badge { display: inline-block; padding: 0.3em 0.55em; border-radius: 0.375rem; font-size: 0.7rem; font-weight: 700; color: #fff; }
    .badge.bg-success { background: #198754; }
    .badge.bg-warning { background: #ffc107; color: #1e293b; }
    .badge.bg-danger { background: #dc3545; }
    .badge.bg-secondary { background: #6c757d; }
    .form-range { accent-color: #0891b2; }
    .oh-modal-backdrop { display: none; position: fixed; inset: 0; z-index: 1100; background: rgba(0,0,0,0.5); overflow-y: auto; }
    .oh-modal-backdrop.open { display: block; }
    .oh-modal { background: #fff; border-radius: 0.5rem; margin: 1.75rem auto; max-width: 800px; box-shadow: 0 12px 40px rgba(0,0,0,0.25); }
    .oh-modal.sm { max-width: 500px; }
    .oh-modal-header { padding: 1rem 1.25rem; border-bottom: 1px solid #e9ecef; display: flex; justify-content: space-between; align-items: center; }
    .oh-modal-header h5 { margin: 0; font-size: 1.05rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
    .oh-modal-close { background: none; border: none; font-size: 1.4rem; cursor: pointer; line-height: 1; color: var(--text-dark); }
    .oh-modal-body { padding: 1.25rem; }
    .oh-modal-footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0.85rem 1.25rem; border-top: 1px solid #e9ecef; }
  `],
  template: `
    @if (data(); as d) {
      <dmis-page-header title="Action Tracking" icon="fa-tasks"
        [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'One Health'},
          {label:'Events', url:'/m/one-health/events'}, {label:d.event.event_id}, {label:'Action Tracking'}]">
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <button type="button" class="btn btn-primary" (click)="openAdd()"><i class="fas fa-plus"></i> Add Action</button>
          <a [routerLink]="['/m/one-health/events', d.event.id]" class="r-view" style="font-size:0.78rem;padding:0.35rem 0.75rem;"><i class="fas fa-arrow-left" style="font-size:0.55rem;margin-right:0.25rem;"></i> Back to Event</a>
        </div>
      </dmis-page-header>

      <div style="margin:-0.5rem 0 1rem;font-size:0.85rem;color:var(--text-mid);">
        <i class="fas fa-info-circle" style="color:#0891b2;margin-right:0.25rem;"></i> {{ d.event.event_title }}
      </div>

      <div class="panel-row" style="animation-delay:.10s;">
        <dmis-panel title="Event Completion Progress" icon="fa-chart-line" [badge]="d.event.completion_percentage + '%'">
          <div class="panel-body">
            <div class="progress" style="height: 25px;">
              <div class="progress-bar" [style.width.%]="d.event.completion_percentage">{{ d.event.completion_percentage }}% Complete</div>
            </div>
            @if (d.event.status !== 'closed' && d.event.status !== 'archived' && d.event.completion_percentage >= 100) {
              <div class="mt-3">
                <button type="button" class="btn btn-success" (click)="closeOpen.set(true)">
                  <i class="fas fa-flag-checkered"></i> Close Event
                </button>
              </div>
            } @else if (d.event.status === 'closed') {
              <div class="alert alert-success mt-3 mb-0">
                <i class="fas fa-check-circle"></i> This event has been closed.
              </div>
            }
          </div>
        </dmis-panel>
      </div>

      @for (directive of d.directives; track directive.id) {
        <div class="panel-row" style="animation-delay:.20s;">
          <dmis-panel [title]="directive.directive_title" icon="fa-clipboard-check">
            <div class="panel-body" style="padding:0;">
              @if (actionsFor(directive.id).length) {
                @for (action of actionsFor(directive.id); track action.id) {
                  <ng-container *ngTemplateOutlet="actionCard; context: { action }" />
                }
              } @else {
                <div class="empty-state" style="padding:1.5rem;">
                  <i class="fas fa-clipboard-list"></i> No action items for this directive.
                </div>
              }
            </div>
          </dmis-panel>
        </div>
      }

      @if (unlinked().length) {
        <div class="panel-row" style="animation-delay:.30s;">
          <dmis-panel title="General Actions (No Directive)" icon="fa-list-ul">
            <div class="panel-body" style="padding:0;">
              @for (action of unlinked(); track action.id) {
                <ng-container *ngTemplateOutlet="actionCard; context: { action }" />
              }
            </div>
          </dmis-panel>
        </div>
      }

      @if (!d.actions.length) {
        <div class="panel-row" style="animation-delay:.25s;">
          <div class="empty-state" style="padding:2rem;background:#fff;border-radius:12px;border:1px solid #e5e7eb;text-align:center;">
            <i class="fas fa-tasks" style="font-size:2rem;color:#0891b2;opacity:0.5;"></i>
            <div style="margin-top:0.5rem;color:var(--text-mid);font-size:0.88rem;">
              No action items have been created yet.<br>
              <a href="javascript:void(0)" (click)="openAdd()" style="color:#0891b2;font-weight:600;">Add the first action item</a>.
            </div>
          </div>
        </div>
      }

      <!-- Action card template (view + inline edit) -->
      <ng-template #actionCard let-action="action">
        <div class="list-group-item">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1 me-3">
              <h6 class="mb-1">{{ action.action_title }}</h6>
              @if (action.action_description) {
                <p class="mb-1 small text-muted">{{ limit(action.action_description, 100) }}</p>
              }
              <div class="d-flex gap-3 small text-muted flex-wrap">
                @if (action.stakeholder_organization) {
                  <span><i class="fas fa-building"></i> {{ action.stakeholder_organization }}</span>
                }
                @if (action.target_date_display) {
                  <span [class.text-danger]="isOverdue(action)" [class.fw-bold]="isOverdue(action)">
                    <i class="fas fa-calendar"></i> Target: {{ action.target_date_display }}
                    @if (isOverdue(action)) { <span class="badge bg-danger" style="font-size:0.6rem;vertical-align:middle;">OVERDUE</span> }
                  </span>
                }
                @if (action.completed_date_display) {
                  <span class="text-success"><i class="fas fa-check"></i> Completed: {{ action.completed_date_display }}</span>
                }
              </div>
              @if (action.remarks) {
                <div class="mt-1 small text-muted" style="font-style:italic;"><i class="fas fa-comment-dots me-1"></i>{{ limit(action.remarks, 80) }}</div>
              }
            </div>
            <div class="text-end" style="min-width: 200px;">
              <div class="d-flex align-items-center justify-content-end gap-2 mb-2">
                <span class="badge" [class]="'badge ' + actionBadge(action.status)">{{ ucfirst(action.status) }}</span>
                <button type="button" class="btn btn-sm btn-outline-secondary" style="font-size:0.65rem;padding:0.15rem 0.4rem;" (click)="toggleEdit(action.id)" title="Edit action"><i class="fas fa-pen"></i></button>
              </div>
              <div class="d-flex align-items-center gap-2">
                <input type="range" class="form-range flex-grow-1" min="0" max="100" step="5"
                  [value]="action.completion_percentage" (change)="updateProgress(action, $event)" style="width: 100px;">
                <span class="badge bg-secondary">{{ action.completion_percentage }}%</span>
              </div>
            </div>
          </div>

          @if (editingId() === action.id) {
            <div style="border-top:1px solid #e5e7eb;padding-top:0.75rem;margin-top:0.5rem;">
              @if (editErrors().length) {
                <div class="alert alert-danger"><ul class="mb-0">@for (e of editErrors(); track $index) { <li>{{ e }}</li> }</ul></div>
              }
              <div class="row g-2">
                <div class="col-md-6">
                  <label class="form-label form-label-sm">Action Title</label>
                  <input type="text" class="form-control form-control-sm" [(ngModel)]="editForm.action_title">
                </div>
                <div class="col-md-6">
                  <label class="form-label form-label-sm">Target Date</label>
                  <input type="date" class="form-control form-control-sm" [(ngModel)]="editForm.target_date">
                </div>
                <div class="col-12">
                  <label class="form-label form-label-sm">Description</label>
                  <textarea class="form-control form-control-sm" rows="2" [(ngModel)]="editForm.action_description"></textarea>
                </div>
                <div class="col-12">
                  <label class="form-label form-label-sm">Remarks</label>
                  <input type="text" class="form-control form-control-sm" [(ngModel)]="editForm.remarks">
                </div>
                <div class="col-12 d-flex gap-2 justify-content-end">
                  <button type="button" class="btn btn-sm btn-secondary" (click)="editingId.set(null)">Cancel</button>
                  <button type="button" class="btn btn-sm btn-primary" (click)="saveEdit(action)"><i class="fas fa-save"></i> Save</button>
                </div>
              </div>
            </div>
          }
        </div>
      </ng-template>

      <!-- Add Action modal -->
      <div class="oh-modal-backdrop" [class.open]="addOpen()" (click)="backdrop($event, 'add')">
        <div class="oh-modal" (click)="$event.stopPropagation()">
          <div class="oh-modal-header">
            <h5><i class="fas fa-tasks"></i> Add Action Item - {{ d.event.event_id }}</h5>
            <button type="button" class="oh-modal-close" (click)="addOpen.set(false)">&times;</button>
          </div>
          <div class="oh-modal-body">
            @if (addErrors().length) {
              <div class="alert alert-danger"><ul class="mb-0">@for (e of addErrors(); track $index) { <li>{{ e }}</li> }</ul></div>
            }
            <div class="row g-3">
              <div class="col-md-12">
                <label class="form-label">Action Title <span class="text-danger">*</span></label>
                <input type="text" class="form-control" placeholder="Enter action title" [(ngModel)]="addForm.action_title">
              </div>
              <div class="col-md-12">
                <label class="form-label">Action Description</label>
                <textarea rows="3" class="form-control" placeholder="Describe the action item" [(ngModel)]="addForm.action_description"></textarea>
              </div>
              <div class="col-md-6">
                <label class="form-label">Link to Directive</label>
                <select class="form-select" [(ngModel)]="addForm.directive_id">
                  <option value="">-- No specific directive --</option>
                  @for (dir of d.directives; track dir.id) { <option [value]="dir.id">{{ dir.directive_title }}</option> }
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Responsible Stakeholder</label>
                <select class="form-select" [(ngModel)]="addForm.stakeholder_id">
                  <option value="">-- Select stakeholder --</option>
                  @for (s of d.stakeholders; track s.id) { <option [value]="s.id">{{ s.organization }}</option> }
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Target Date</label>
                <input type="date" class="form-control" [(ngModel)]="addForm.target_date">
              </div>
              <div class="col-md-6">
                <label class="form-label">Remarks</label>
                <input type="text" class="form-control" placeholder="Any remarks" [(ngModel)]="addForm.remarks">
              </div>
            </div>
          </div>
          <div class="oh-modal-footer">
            <button type="button" class="btn btn-secondary" (click)="addOpen.set(false)">Cancel</button>
            <button type="button" class="btn btn-primary" [disabled]="addSubmitting()" (click)="submitAdd()"><i class="fas fa-plus"></i> Add Action Item</button>
          </div>
        </div>
      </div>

      <!-- Close Event modal -->
      <div class="oh-modal-backdrop" [class.open]="closeOpen()" (click)="backdrop($event, 'close')">
        <div class="oh-modal sm" (click)="$event.stopPropagation()">
          <div class="oh-modal-header">
            <h5>Close Event</h5>
            <button type="button" class="oh-modal-close" (click)="closeOpen.set(false)">&times;</button>
          </div>
          <div class="oh-modal-body">
            @if (closeErrors().length) {
              <div class="alert alert-danger"><ul class="mb-0">@for (e of closeErrors(); track $index) { <li>{{ e }}</li> }</ul></div>
            }
            <div class="mb-3">
              <label class="form-label">Outcome Summary <span class="text-danger">*</span></label>
              <textarea rows="3" class="form-control" [(ngModel)]="closeForm.outcome_summary"></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Lessons Learned</label>
              <textarea rows="3" class="form-control" [(ngModel)]="closeForm.lessons_learned"></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Closure Date</label>
              <input type="date" class="form-control" [(ngModel)]="closeForm.closure_date">
            </div>
            <div class="mb-3">
              <label class="form-label">Comments</label>
              <input type="text" class="form-control" [(ngModel)]="closeForm.comments">
            </div>
          </div>
          <div class="oh-modal-footer">
            <button type="button" class="btn btn-secondary" (click)="closeOpen.set(false)">Cancel</button>
            <button type="button" class="btn btn-success" [disabled]="closeSubmitting()" (click)="submitClose()">Close Event</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class OhActionTrackingComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  data = signal<ActionsResponse | null>(null);
  editingId = signal<number | null>(null);
  editErrors = signal<string[]>([]);
  editForm = { action_title: '', action_description: '', target_date: '', remarks: '' };

  addOpen = signal(false);
  addErrors = signal<string[]>([]);
  addSubmitting = signal(false);
  addForm = { action_title: '', action_description: '', directive_id: '', stakeholder_id: '', target_date: '', remarks: '' };

  closeOpen = signal(false);
  closeErrors = signal<string[]>([]);
  closeSubmitting = signal(false);
  closeForm = { outcome_summary: '', lessons_learned: '', closure_date: new Date().toISOString().substring(0, 10), comments: '' };

  unlinked = computed(() => (this.data()?.actions ?? []).filter(a => !a.directive_id));

  private get eventId(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    ensureSweetAlert();
    this.load();
  }

  load(): void {
    this.http.get<ActionsResponse>(`/api/v1/onehealth/events/${this.eventId}/actions`).subscribe(d => this.data.set(d));
  }

  actionsFor(directiveId: number): ActionItem[] {
    return (this.data()?.actions ?? []).filter(a => a.directive_id === directiveId);
  }

  isOverdue(a: ActionItem): boolean {
    return !!a.target_date && a.status !== 'completed' && new Date(a.target_date) < new Date();
  }

  backdrop(ev: Event, which: 'add' | 'close'): void {
    if (ev.target !== ev.currentTarget) { return; }
    if (which === 'add') { this.addOpen.set(false); } else { this.closeOpen.set(false); }
  }

  updateProgress(action: ActionItem, ev: Event): void {
    const value = Number((ev.target as HTMLInputElement).value);
    this.http.post<any>(`/api/v1/onehealth/actions/${action.id}/progress`, { completion_percentage: value }).subscribe({
      next: () => this.load(),
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error')),
    });
  }

  toggleEdit(id: number): void {
    if (this.editingId() === id) {
      this.editingId.set(null);
      return;
    }
    const a = (this.data()?.actions ?? []).find(x => x.id === id)!;
    this.editForm = {
      action_title: a.action_title,
      action_description: a.action_description ?? '',
      target_date: a.target_date ? String(a.target_date).substring(0, 10) : '',
      remarks: a.remarks ?? '',
    };
    this.editErrors.set([]);
    this.editingId.set(id);
  }

  saveEdit(action: ActionItem): void {
    const payload = {
      action_title: this.editForm.action_title.trim(),
      action_description: this.editForm.action_description.trim() || null,
      target_date: this.editForm.target_date || null,
      remarks: this.editForm.remarks.trim() || null,
    };
    this.http.put<any>(`/api/v1/onehealth/actions/${action.id}`, payload).subscribe({
      next: res => {
        this.editingId.set(null);
        ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Updated!', text: res.message, timer: 1500, timerProgressBar: true })
          .then(() => this.load()));
      },
      error: err => this.editErrors.set(err.status === 422 && err.error?.errors
        ? Object.values(err.error.errors as Record<string, string[]>).flat()
        : [err.error?.message ?? 'An error occurred.']),
    });
  }

  openAdd(): void {
    this.addForm = { action_title: '', action_description: '', directive_id: '', stakeholder_id: '', target_date: '', remarks: '' };
    this.addErrors.set([]);
    this.addOpen.set(true);
  }

  submitAdd(): void {
    const payload = {
      action_title: this.addForm.action_title.trim(),
      action_description: this.addForm.action_description.trim() || null,
      directive_id: this.addForm.directive_id || null,
      stakeholder_id: this.addForm.stakeholder_id || null,
      target_date: this.addForm.target_date || null,
      remarks: this.addForm.remarks.trim() || null,
    };
    this.addSubmitting.set(true);
    this.http.post<any>(`/api/v1/onehealth/events/${this.eventId}/actions`, payload).subscribe({
      next: res => {
        this.addSubmitting.set(false);
        this.addOpen.set(false);
        ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Success!', text: res.message, timer: 3000, timerProgressBar: true })
          .then(() => this.load()));
      },
      error: err => {
        this.addSubmitting.set(false);
        this.addErrors.set(err.status === 422 && err.error?.errors
          ? Object.values(err.error.errors as Record<string, string[]>).flat()
          : [err.error?.message ?? 'An error occurred.']);
      },
    });
  }

  submitClose(): void {
    const payload = {
      outcome_summary: this.closeForm.outcome_summary.trim(),
      lessons_learned: this.closeForm.lessons_learned.trim() || null,
      closure_date: this.closeForm.closure_date || null,
      comments: this.closeForm.comments.trim() || null,
    };
    this.closeSubmitting.set(true);
    this.http.post<any>(`/api/v1/onehealth/events/${this.eventId}/close`, payload).subscribe({
      next: res => {
        this.closeSubmitting.set(false);
        this.closeOpen.set(false);
        ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Closed!', text: res.message, timer: 2500, timerProgressBar: true })
          .then(() => this.load()));
      },
      error: err => {
        this.closeSubmitting.set(false);
        this.closeErrors.set(err.status === 422 && err.error?.errors
          ? Object.values(err.error.errors as Record<string, string[]>).flat()
          : [err.error?.message ?? 'An error occurred.']);
      },
    });
  }

  actionBadge(status: string): string {
    return ({
      completed: 'bg-success', in_progress: 'bg-warning', overdue: 'bg-danger', delayed: 'bg-danger', pending: 'bg-secondary',
    } as Record<string, string>)[status] ?? 'bg-secondary';
  }

  ucfirst(s: string): string {
    return (s ?? '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase());
  }

  limit(s: string | null | undefined, max: number): string {
    if (!s) { return ''; }
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
