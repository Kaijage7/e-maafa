import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

interface PivotStakeholder {
  id: number; organization: string; name: string; email: string | null; phone: string | null;
  acknowledgement_status: string; acknowledged_at: string | null; response_notes: string | null;
  implementation_status: string | null; implementation_percentage: number | null;
  implementation_notes: string | null; last_update_at: string | null;
}
interface DirectiveDetail {
  id: number; directive_title: string; action_description: string;
  deadline: string | null; deadline_display: string | null; priority_level: string;
  risk_level: string | null; coordination_notes: string | null; status: string;
  is_overdue: boolean; issued_by_name: string | null; issued_at: string | null;
  event: { id: number; event_id: string; is_ew_alert: boolean; area_of_concern_id: number | null; status: string };
  stakeholders: PivotStakeholder[];
  acknowledgement: { total: number; acknowledged: number; declined: number; pending: number };
  implementation: { total: number; avgPercentage: number };
  action_trackings: { id: number; action_title: string; status: string; completion_percentage: number; target_date: string | null }[];
  area_stakeholders: { id: number; organization: string; name: string }[];
  selected_stakeholder_ids: number[];
  can_edit: boolean; can_respond: boolean;
}

/**
 * Reproduction of onehealth/directives/show.blade.php (555 lines): status badges,
 * acknowledgement/implementation stat cards and tables, the sidebar Actions
 * (escalate, edit, add action item, submit update), the Edit Directive modal,
 * the Submit Implementation Update modal and the Add Action Item modal.
 *
 * OH-12 fix: the respond modal carries an "On behalf of" institution select so
 * admin sessions record updates against an assigned stakeholder (the source
 * 500s on this path).
 */
@Component({
  selector: 'page-oh-directive-show',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent, StatCardComponent],
  styles: [`
    .progress { background: #e9ecef; border-radius: 0.375rem; overflow: hidden; display: flex; }
    .progress-bar { background: #0d6efd; color: #fff; font-size: 0.62rem; display: flex; align-items: center; justify-content: center; white-space: nowrap; transition: width 0.6s ease; }
    .progress-bar.bg-success { background: #198754; }
    .oh-modal-backdrop { display: none; position: fixed; inset: 0; z-index: 1100; background: rgba(0,0,0,0.5); overflow-y: auto; }
    .oh-modal-backdrop.open { display: block; }
    .oh-modal { background: #fff; border-radius: 0.5rem; margin: 1.75rem auto; max-width: 800px; box-shadow: 0 12px 40px rgba(0,0,0,0.25); display: flex; flex-direction: column; max-height: calc(100vh - 3.5rem); }
    .oh-modal-header { background: var(--tz-primary-blue, #003366); color: #fff; padding: 1rem 1.25rem; border-radius: 0.5rem 0.5rem 0 0; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    .oh-modal-header.respond { background: #0d6efd; }
    .oh-modal-header h5 { margin: 0; font-size: 1.05rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
    .oh-modal-close { background: none; border: none; color: #fff; font-size: 1.4rem; cursor: pointer; line-height: 1; }
    .oh-modal-body { padding: 1.25rem; overflow-y: auto; }
    .oh-modal-footer { display: flex; justify-content: flex-end; gap: 0.5rem; padding: 0.85rem 1.25rem; border-top: 1px solid #e9ecef; flex-shrink: 0; }
    .detail-label { font-size: 0.72rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem; }
    .detail-value { font-size: 0.85rem; color: var(--text-dark); }
    .form-range { width: 100%; }
  `],
  template: `
    @if (directive(); as d) {
      <dmis-page-header [title]="d.directive_title" icon="fa-gavel"
        [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'One Health'},
          {label:'Events', url:'/m/one-health/events'},
          {label:d.event.event_id, url:'/m/one-health/events/' + d.event.id},
          {label:'Directive'}]">
        <div style="display:flex;gap:0.5rem;">
          @if (d.can_edit) {
            <button type="button" class="btn-add" style="background:#f59e0b;font-size:0.78rem;" (click)="openEdit()"><i class="fas fa-edit"></i> Edit</button>
          }
          @if (d.can_respond) {
            <button type="button" class="btn-add" style="font-size:0.78rem;" (click)="openRespond()"><i class="fas fa-reply"></i> Submit Update</button>
          }
          <a [routerLink]="['/m/one-health/events', d.event.id]" class="btn-add" style="background:var(--text-mid);font-size:0.78rem;"><i class="fas fa-arrow-left"></i> Back to Event</a>
        </div>
      </dmis-page-header>

      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;flex-wrap:wrap;">
        <span class="r-badge" [class]="'r-badge ' + statusBadge(d.status)" style="font-size:0.82rem;padding:0.35rem 0.8rem;">{{ ucfirst(d.status) }}</span>
        @if (d.is_overdue) {
          <span class="r-badge badge-rejected" style="font-size:0.82rem;padding:0.35rem 0.8rem;">OVERDUE</span>
        }
      </div>

      <div class="stats-row">
        <dmis-stat-card [value]="d.acknowledgement.acknowledged" label="Acknowledged" icon="fa-check-circle" color="#10b981" />
        <dmis-stat-card [value]="d.acknowledgement.pending" label="Pending" icon="fa-clock" color="#f59e0b" />
        <dmis-stat-card [value]="d.acknowledgement.declined" label="Declined" icon="fa-times-circle" color="#ef4444" />
        <dmis-stat-card [value]="d.implementation.avgPercentage" label="Overall Progress %" icon="fa-chart-line" color="#0891b2" />
      </div>

      <div class="row">
        <div class="col-lg-8">
          <div class="panel-row full" style="animation-delay:.20s;">
            <dmis-panel title="Directive Details" icon="fa-clipboard-list">
              <div class="panel-body">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1.5rem;">
                  <div>
                    <div class="detail-label">Event</div>
                    <div class="detail-value"><a [routerLink]="['/m/one-health/events', d.event.id]" style="color:var(--primary);text-decoration:none;">{{ d.event.event_id }}</a></div>
                  </div>
                  <div>
                    <div class="detail-label">Priority</div>
                    <div><span class="r-badge" [class]="'r-badge ' + (d.priority_level === 'critical' ? 'badge-rejected' : d.priority_level === 'high' ? 'badge-pending' : 'badge-inactive')">{{ ucfirst(d.priority_level) }}</span></div>
                  </div>
                  <div>
                    <div class="detail-label">Deadline</div>
                    <div class="detail-value">{{ d.deadline_display ?? 'No deadline' }}</div>
                  </div>
                  <div>
                    <div class="detail-label">Risk Level</div>
                    <div class="detail-value">{{ d.risk_level ? ucfirst(d.risk_level) : '-' }}</div>
                  </div>
                  <div>
                    <div class="detail-label">Issued By</div>
                    <div class="detail-value">{{ d.issued_by_name ?? '-' }}</div>
                  </div>
                  <div>
                    <div class="detail-label">Issued At</div>
                    <div class="detail-value">{{ d.issued_at ?? '-' }}</div>
                  </div>
                </div>
                <div style="margin-top:1rem;padding-top:0.75rem;border-top:1px solid rgba(0,0,0,0.06);">
                  <div class="detail-label">Action Description</div>
                  <div class="detail-value" style="line-height:1.6;">{{ d.action_description }}</div>
                </div>
                @if (d.coordination_notes) {
                  <div style="margin-top:0.8rem;">
                    <div class="detail-label">Coordination Notes</div>
                    <div class="detail-value" style="line-height:1.6;">{{ d.coordination_notes }}</div>
                  </div>
                }
              </div>
            </dmis-panel>
          </div>

          <div class="panel-row full" style="animation-delay:.25s;">
            <dmis-panel title="Stakeholder Acknowledgement Status" icon="fa-handshake"
              [badge]="d.acknowledgement.acknowledged + '/' + d.acknowledgement.total + ' acknowledged'">
              <div class="panel-body">
                <div style="overflow-x:auto;">
                  <table class="r-table">
                    <thead>
                      <tr><th>Institution</th><th>Contact</th><th>Status</th><th>Acknowledged At</th><th>Response Notes</th></tr>
                    </thead>
                    <tbody>
                      @for (s of d.stakeholders; track s.id) {
                        <tr class="data-row">
                          <td><div class="r-title">{{ s.organization }}</div><div class="r-subtitle">{{ s.name }}</div></td>
                          <td>
                            <div style="font-size:0.78rem;color:var(--text-mid);">{{ s.email }}</div>
                            <div style="font-size:0.78rem;color:var(--text-mid);">{{ s.phone }}</div>
                          </td>
                          <td>
                            @if (s.acknowledgement_status === 'acknowledged') { <span class="r-badge badge-published">Acknowledged</span> }
                            @else if (s.acknowledgement_status === 'declined') { <span class="r-badge badge-rejected">Declined</span> }
                            @else { <span class="r-badge badge-pending">Pending</span> }
                          </td>
                          <td style="font-size:0.78rem;color:var(--text-mid);">{{ s.acknowledged_at ?? '-' }}</td>
                          <td style="font-size:0.78rem;color:var(--text-mid);">{{ s.response_notes ?? '-' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </dmis-panel>
          </div>

          <div class="panel-row full" style="animation-delay:.30s;">
            <dmis-panel title="Implementation Status" icon="fa-tasks" [badge]="d.implementation.avgPercentage + '% overall'">
              <div class="panel-body">
                <div style="overflow-x:auto;">
                  <table class="r-table">
                    <thead>
                      <tr><th>Institution</th><th>Status</th><th>Progress</th><th>Last Update</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                      @for (s of d.stakeholders; track s.id) {
                        <tr class="data-row">
                          <td><div class="r-title">{{ s.organization }}</div><div class="r-subtitle">{{ s.name }}</div></td>
                          <td><span class="r-badge" [class]="'r-badge ' + implBadge(s.implementation_status)">{{ ucfirst(s.implementation_status ?? 'not_started') }}</span></td>
                          <td>
                            <div class="progress" style="height:15px;min-width:80px;">
                              <div class="progress-bar" [class.bg-success]="(s.implementation_percentage ?? 0) >= 100" [style.width.%]="s.implementation_percentage ?? 0">{{ s.implementation_percentage ?? 0 }}%</div>
                            </div>
                          </td>
                          <td style="font-size:0.78rem;color:var(--text-mid);">{{ s.last_update_at ?? '-' }}</td>
                          <td style="font-size:0.78rem;color:var(--text-mid);">{{ limit(s.implementation_notes ?? '-', 50) }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            </dmis-panel>
          </div>

          @if (d.action_trackings.length) {
            <div class="panel-row full" style="animation-delay:.35s;">
              <dmis-panel title="Related Action Items" icon="fa-list-check">
                <div class="panel-body">
                  <div style="overflow-x:auto;">
                    <table class="r-table">
                      <thead><tr><th>Action</th><th>Status</th><th>Progress</th><th>Target Date</th></tr></thead>
                      <tbody>
                        @for (a of d.action_trackings; track a.id) {
                          <tr class="data-row">
                            <td><div class="r-title">{{ a.action_title }}</div></td>
                            <td><span class="r-badge" [class]="'r-badge ' + actionBadge(a.status)">{{ ucfirst(a.status) }}</span></td>
                            <td>
                              <div class="progress" style="height:15px;width:100px;">
                                <div class="progress-bar" [style.width.%]="a.completion_percentage">{{ a.completion_percentage }}%</div>
                              </div>
                            </td>
                            <td style="font-size:0.78rem;color:var(--text-mid);">{{ a.target_date ?? '-' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                </div>
              </dmis-panel>
            </div>
          }
        </div>

        <div class="col-lg-4">
          <dmis-panel title="Actions" icon="fa-bolt">
            <div class="panel-body">
              <div class="d-grid gap-2">
                @if (d.can_edit) {
                  @if (d.acknowledgement.pending > 0) {
                    <button type="button" class="btn-add w-100" style="background:#f59e0b;font-size:0.78rem;justify-content:center;" (click)="escalate()">
                      <i class="fas fa-bell"></i> Escalate ({{ d.acknowledgement.pending }} pending)
                    </button>
                  }
                  <button type="button" class="r-view w-100" style="font-size:0.78rem;justify-content:center;padding:0.45rem 0.75rem;" (click)="openEdit()"><i class="fas fa-edit" style="font-size:0.65rem;margin-right:0.3rem;"></i> Edit Directive</button>
                  <button type="button" class="r-view w-100" style="font-size:0.78rem;justify-content:center;padding:0.45rem 0.75rem;" (click)="openAction()"><i class="fas fa-tasks" style="font-size:0.65rem;margin-right:0.3rem;"></i> Add Action Item</button>
                }
                @if (d.can_respond) {
                  <button type="button" class="btn-add w-100" style="font-size:0.78rem;justify-content:center;" (click)="openRespond()"><i class="fas fa-reply"></i> Submit Update</button>
                }
              </div>
            </div>
          </dmis-panel>

          <dmis-panel title="Acknowledgement Summary" icon="fa-chart-pie">
            <div class="panel-body">
              <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;text-align:center;">
                <div style="padding:0.6rem;background:rgba(16,185,129,0.06);border-radius:8px;">
                  <div style="font-size:1.1rem;font-weight:700;color:#10b981;">{{ d.acknowledgement.acknowledged }}</div>
                  <div style="font-size:0.7rem;color:var(--text-light);">Acknowledged</div>
                </div>
                <div style="padding:0.6rem;background:rgba(245,158,11,0.06);border-radius:8px;">
                  <div style="font-size:1.1rem;font-weight:700;color:#f59e0b;">{{ d.acknowledgement.pending }}</div>
                  <div style="font-size:0.7rem;color:var(--text-light);">Pending</div>
                </div>
                <div style="padding:0.6rem;background:rgba(239,68,68,0.06);border-radius:8px;">
                  <div style="font-size:1.1rem;font-weight:700;color:#ef4444;">{{ d.acknowledgement.declined }}</div>
                  <div style="font-size:0.7rem;color:var(--text-light);">Declined</div>
                </div>
              </div>
            </div>
          </dmis-panel>
        </div>
      </div>

      <!-- ═══ Edit Directive Modal ═══ -->
      <div class="oh-modal-backdrop" [class.open]="editOpen()" (click)="closeOnBackdrop($event, 'edit')">
        <div class="oh-modal" (click)="$event.stopPropagation()">
          <div class="oh-modal-header">
            <h5><i class="fas fa-edit"></i> Edit Directive</h5>
            <button type="button" class="oh-modal-close" (click)="editOpen.set(false)">&times;</button>
          </div>
          <div class="oh-modal-body">
            @if (editErrors().length) {
              <div class="alert alert-danger"><ul class="mb-0">@for (e of editErrors(); track $index) { <li>{{ e }}</li> }</ul></div>
            }
            <div class="row g-3">
              <div class="col-md-12">
                <label class="form-label">Directive Title <span class="text-danger">*</span></label>
                <input type="text" class="form-control" [(ngModel)]="editForm.directive_title">
              </div>
              <div class="col-md-12">
                <label class="form-label">Action Description <span class="text-danger">*</span></label>
                <textarea rows="3" class="form-control" [(ngModel)]="editForm.action_description"></textarea>
              </div>
              <div class="col-md-3">
                <label class="form-label">Deadline</label>
                <input type="date" class="form-control" [(ngModel)]="editForm.deadline">
              </div>
              <div class="col-md-3">
                <label class="form-label">Priority Level <span class="text-danger">*</span></label>
                <select class="form-select" [(ngModel)]="editForm.priority_level">
                  <option value="low">Low</option><option value="medium">Medium</option>
                  <option value="high">High</option><option value="critical">Critical</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label">Risk Level</label>
                <select class="form-select" [(ngModel)]="editForm.risk_level">
                  <option value="">Select</option><option value="low">Low</option><option value="moderate">Moderate</option>
                  <option value="high">High</option><option value="very_high">Very High</option>
                </select>
              </div>
              <div class="col-md-3">
                <label class="form-label">Status</label>
                <select class="form-select" [(ngModel)]="editForm.status">
                  @for (s of ['draft', 'issued', 'acknowledged', 'in_progress', 'completed', 'overdue']; track s) {
                    <option [value]="s">{{ ucfirst(s) }}</option>
                  }
                </select>
              </div>
              <div class="col-md-12">
                <label class="form-label">Coordination Notes</label>
                <textarea rows="2" class="form-control" [(ngModel)]="editForm.coordination_notes"></textarea>
              </div>
              <div class="col-md-12">
                <label class="form-label">Responsible Stakeholders</label>
                <div class="border rounded p-3" style="max-height: 200px; overflow-y: auto;">
                  @for (s of d.area_stakeholders; track s.id) {
                    <div class="form-check">
                      <input class="form-check-input" type="checkbox" [id]="'edSh' + s.id" [checked]="editSelected().has(s.id)" (change)="toggleEditStakeholder(s.id)">
                      <label class="form-check-label" [for]="'edSh' + s.id"><strong>{{ s.organization }}</strong> ({{ s.name }})</label>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
          <div class="oh-modal-footer">
            <button type="button" class="btn btn-secondary" (click)="editOpen.set(false)">Cancel</button>
            <button type="button" class="btn btn-primary" [disabled]="editSubmitting()" (click)="submitEdit()">
              @if (editSubmitting()) { <i class="fas fa-spinner fa-spin me-1"></i>Updating... } @else { <i class="fas fa-save me-1"></i>Update Directive }
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ Submit Implementation Update Modal ═══ -->
      <div class="oh-modal-backdrop" [class.open]="respondOpen()" (click)="closeOnBackdrop($event, 'respond')">
        <div class="oh-modal" (click)="$event.stopPropagation()">
          <div class="oh-modal-header respond">
            <h5><i class="fas fa-reply"></i> Submit Implementation Update</h5>
            <button type="button" class="oh-modal-close" (click)="respondOpen.set(false)">&times;</button>
          </div>
          <div class="oh-modal-body">
            @if (respondErrors().length) {
              <div class="alert alert-danger"><ul class="mb-0">@for (e of respondErrors(); track $index) { <li>{{ e }}</li> }</ul></div>
            }
            <div class="alert alert-info mb-3">
              <strong>Directive:</strong> {{ d.directive_title }}
            </div>
            <div class="row g-3">
              <!-- OH-12 fix: record the update on behalf of an assigned institution -->
              <div class="col-md-12">
                <label class="form-label">On Behalf Of (Institution) <span class="text-danger">*</span></label>
                <select class="form-select" [(ngModel)]="respondForm.stakeholder_id">
                  <option value="">Select institution</option>
                  @for (s of d.stakeholders; track s.id) { <option [value]="s.id">{{ s.organization }} ({{ s.name }})</option> }
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Implementation Status <span class="text-danger">*</span></label>
                <select class="form-select" [(ngModel)]="respondForm.implementation_status">
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="delayed">Delayed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Progress <span class="text-danger">*</span></label>
                <div class="d-flex align-items-center gap-2">
                  <input type="range" class="form-range flex-grow-1" min="0" max="100" step="5" [(ngModel)]="respondForm.implementation_percentage">
                  <span class="badge bg-primary fs-6" style="min-width: 50px;">{{ respondForm.implementation_percentage }}%</span>
                </div>
              </div>
              <div class="col-12">
                <label class="form-label">Update Notes <span class="text-danger">*</span></label>
                <textarea rows="3" class="form-control" placeholder="Describe the progress made, actions taken..." [(ngModel)]="respondForm.update_notes"></textarea>
              </div>
              <div class="col-12">
                <label class="form-label">Challenges</label>
                <textarea rows="2" class="form-control" placeholder="Any challenges or blockers encountered (optional)..." [(ngModel)]="respondForm.challenges"></textarea>
              </div>
              <div class="col-md-6">
                <label class="form-label">Expected Completion Date</label>
                <input type="date" class="form-control" [(ngModel)]="respondForm.expected_completion_date">
              </div>
            </div>
          </div>
          <div class="oh-modal-footer">
            <button type="button" class="btn btn-secondary" (click)="respondOpen.set(false)">Cancel</button>
            <button type="button" class="btn btn-primary" [disabled]="respondSubmitting()" (click)="submitRespond()">
              @if (respondSubmitting()) { <i class="fas fa-spinner fa-spin"></i> Submitting... } @else { <i class="fas fa-paper-plane"></i> Submit Update }
            </button>
          </div>
        </div>
      </div>

      <!-- ═══ Add Action Item Modal ═══ -->
      <div class="oh-modal-backdrop" [class.open]="actionOpen()" (click)="closeOnBackdrop($event, 'action')">
        <div class="oh-modal" (click)="$event.stopPropagation()">
          <div class="oh-modal-header" style="background:#fff;color:var(--text-dark);border-bottom:1px solid #e9ecef;">
            <h5><i class="fas fa-tasks"></i> Add Action Item - {{ d.event.event_id }}</h5>
            <button type="button" class="oh-modal-close" style="color:var(--text-dark);" (click)="actionOpen.set(false)">&times;</button>
          </div>
          <div class="oh-modal-body">
            @if (actionErrors().length) {
              <div class="alert alert-danger"><ul class="mb-0">@for (e of actionErrors(); track $index) { <li>{{ e }}</li> }</ul></div>
            }
            <div class="row g-3">
              <div class="col-md-12">
                <label class="form-label">Action Title <span class="text-danger">*</span></label>
                <input type="text" class="form-control" placeholder="Enter action title" [(ngModel)]="actionForm.action_title">
              </div>
              <div class="col-md-12">
                <label class="form-label">Action Description</label>
                <textarea rows="3" class="form-control" placeholder="Describe the action item" [(ngModel)]="actionForm.action_description"></textarea>
              </div>
              <div class="col-md-6">
                <label class="form-label">Link to Directive</label>
                <select class="form-select" [(ngModel)]="actionForm.directive_id">
                  <option value="">-- No specific directive --</option>
                  <option [value]="d.id">{{ d.directive_title }}</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Responsible Stakeholder</label>
                <select class="form-select" [(ngModel)]="actionForm.stakeholder_id">
                  <option value="">-- Select stakeholder --</option>
                  @for (s of d.area_stakeholders; track s.id) { <option [value]="s.id">{{ s.organization }}</option> }
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">Target Date</label>
                <input type="date" class="form-control" [(ngModel)]="actionForm.target_date">
              </div>
              <div class="col-md-6">
                <label class="form-label">Remarks</label>
                <input type="text" class="form-control" placeholder="Any remarks" [(ngModel)]="actionForm.remarks">
              </div>
            </div>
          </div>
          <div class="oh-modal-footer">
            <button type="button" class="btn btn-secondary" (click)="actionOpen.set(false)">Cancel</button>
            <button type="button" class="btn btn-primary" [disabled]="actionSubmitting()" (click)="submitAction()">
              @if (actionSubmitting()) { <i class="fas fa-spinner fa-spin"></i> Adding... } @else { <i class="fas fa-plus"></i> Add Action Item }
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class OhDirectiveShowComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);

  directive = signal<DirectiveDetail | null>(null);

  editOpen = signal(false);
  editErrors = signal<string[]>([]);
  editSubmitting = signal(false);
  editSelected = signal(new Set<number>());
  editForm = { directive_title: '', action_description: '', deadline: '', priority_level: 'medium', risk_level: '', coordination_notes: '', status: 'issued' };

  respondOpen = signal(false);
  respondErrors = signal<string[]>([]);
  respondSubmitting = signal(false);
  respondForm = { stakeholder_id: '', implementation_status: 'not_started', implementation_percentage: 0, update_notes: '', challenges: '', expected_completion_date: '' };

  actionOpen = signal(false);
  actionErrors = signal<string[]>([]);
  actionSubmitting = signal(false);
  actionForm = { action_title: '', action_description: '', directive_id: '', stakeholder_id: '', target_date: '', remarks: '' };

  private get id(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    ensureSweetAlert();
    this.load(() => {
      // #edit / #respond deep links from the registry kebab menu
      const fragment = this.route.snapshot.fragment;
      if (fragment === 'edit') { setTimeout(() => this.openEdit(), 200); }
      if (fragment === 'respond') { setTimeout(() => this.openRespond(), 200); }
    });
  }

  load(after?: () => void): void {
    this.http.get<DirectiveDetail>(`/api/v1/onehealth/directives/${this.id}`).subscribe(d => {
      this.directive.set(d);
      after?.();
    });
  }

  closeOnBackdrop(ev: Event, which: 'edit' | 'respond' | 'action'): void {
    if (ev.target !== ev.currentTarget) { return; }
    if (which === 'edit') { this.editOpen.set(false); }
    if (which === 'respond') { this.respondOpen.set(false); }
    if (which === 'action') { this.actionOpen.set(false); }
  }

  // ── edit ──

  openEdit(): void {
    const d = this.directive()!;
    this.editForm = {
      directive_title: d.directive_title,
      action_description: d.action_description,
      deadline: d.deadline ?? '',
      priority_level: d.priority_level,
      risk_level: d.risk_level ?? '',
      coordination_notes: d.coordination_notes ?? '',
      status: d.status,
    };
    this.editSelected.set(new Set(d.selected_stakeholder_ids));
    this.editErrors.set([]);
    this.editOpen.set(true);
  }

  toggleEditStakeholder(id: number): void {
    const next = new Set(this.editSelected());
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    this.editSelected.set(next);
  }

  submitEdit(): void {
    const payload: any = {
      directive_title: this.editForm.directive_title.trim(),
      action_description: this.editForm.action_description.trim(),
      deadline: this.editForm.deadline || null,
      priority_level: this.editForm.priority_level,
      risk_level: this.editForm.risk_level || null,
      coordination_notes: this.editForm.coordination_notes.trim() || null,
      status: this.editForm.status,
      stakeholder_ids: [...this.editSelected()],
    };
    this.editSubmitting.set(true);
    this.http.put<any>(`/api/v1/onehealth/directives/${this.id}`, payload).subscribe({
      next: res => {
        this.editSubmitting.set(false);
        this.editOpen.set(false);
        ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Updated!', text: res.message, timer: 2000, timerProgressBar: true })
          .then(() => this.load()));
      },
      error: err => {
        this.editSubmitting.set(false);
        this.editErrors.set(err.status === 422 && err.error?.errors
          ? Object.values(err.error.errors as Record<string, string[]>).flat()
          : [err.error?.message ?? 'An error occurred.']);
      },
    });
  }

  // ── escalate ──

  escalate(): void {
    const pending = this.directive()!.acknowledgement.pending;
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Escalate?',
        text: `Send reminder to ${pending} unacknowledged stakeholder(s)?`,
        icon: 'question', showCancelButton: true, confirmButtonColor: '#f59e0b', confirmButtonText: 'Yes, send reminders',
      }).then((res: any) => {
        if (!res.isConfirmed) { return; }
        this.http.post<any>(`/api/v1/onehealth/directives/${this.id}/escalate`, {}).subscribe({
          next: r => Swal.fire({ icon: r.info ? 'info' : 'success', title: r.info ? 'Already acknowledged' : 'Escalated', text: r.message ?? r.info, timer: 3000 }),
          error: err => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  // ── respond ──

  openRespond(): void {
    this.respondForm = { stakeholder_id: '', implementation_status: 'not_started', implementation_percentage: 0, update_notes: '', challenges: '', expected_completion_date: '' };
    this.respondErrors.set([]);
    this.respondOpen.set(true);
  }

  submitRespond(): void {
    const payload: any = {
      stakeholder_id: this.respondForm.stakeholder_id || null,
      implementation_status: this.respondForm.implementation_status,
      implementation_percentage: Number(this.respondForm.implementation_percentage),
      update_notes: this.respondForm.update_notes.trim(),
      challenges: this.respondForm.challenges.trim() || null,
      expected_completion_date: this.respondForm.expected_completion_date || null,
    };
    this.respondSubmitting.set(true);
    this.http.post<any>(`/api/v1/onehealth/directives/${this.id}/respond`, payload).subscribe({
      next: res => {
        this.respondSubmitting.set(false);
        this.respondOpen.set(false);
        ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Submitted!', text: res.message, timer: 2000, timerProgressBar: true })
          .then(() => this.load()));
      },
      error: err => {
        this.respondSubmitting.set(false);
        this.respondErrors.set(err.status === 422 && err.error?.errors
          ? Object.values(err.error.errors as Record<string, string[]>).flat()
          : [err.error?.message ?? 'An error occurred.']);
      },
    });
  }

  // ── add action item ──

  openAction(): void {
    this.actionForm = { action_title: '', action_description: '', directive_id: String(this.directive()!.id), stakeholder_id: '', target_date: '', remarks: '' };
    this.actionErrors.set([]);
    this.actionOpen.set(true);
  }

  submitAction(): void {
    const payload: any = {
      action_title: this.actionForm.action_title.trim(),
      action_description: this.actionForm.action_description.trim() || null,
      directive_id: this.actionForm.directive_id || null,
      stakeholder_id: this.actionForm.stakeholder_id || null,
      target_date: this.actionForm.target_date || null,
      remarks: this.actionForm.remarks.trim() || null,
    };
    this.actionSubmitting.set(true);
    this.http.post<any>(`/api/v1/onehealth/events/${this.directive()!.event.id}/actions`, payload).subscribe({
      next: res => {
        this.actionSubmitting.set(false);
        this.actionOpen.set(false);
        ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Success!', text: res.message, timer: 3000, timerProgressBar: true })
          .then(() => this.load()));
      },
      error: err => {
        this.actionSubmitting.set(false);
        this.actionErrors.set(err.status === 422 && err.error?.errors
          ? Object.values(err.error.errors as Record<string, string[]>).flat()
          : [err.error?.message ?? 'An error occurred.']);
      },
    });
  }

  // ── formatting ──

  statusBadge(status: string): string {
    return ({
      draft: 'badge-inactive', issued: 'badge-published', acknowledged: 'badge-active',
      in_progress: 'badge-pending', completed: 'badge-published', overdue: 'badge-rejected',
    } as Record<string, string>)[status] ?? 'badge-inactive';
  }

  implBadge(status: string | null): string {
    return ({
      not_started: 'badge-inactive', in_progress: 'badge-pending', completed: 'badge-published',
      delayed: 'badge-rejected', blocked: 'badge-rejected',
    } as Record<string, string>)[status ?? 'not_started'] ?? 'badge-inactive';
  }

  actionBadge(status: string): string {
    return ({
      completed: 'badge-published', in_progress: 'badge-pending', overdue: 'badge-rejected', pending: 'badge-inactive',
    } as Record<string, string>)[status] ?? 'badge-inactive';
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
