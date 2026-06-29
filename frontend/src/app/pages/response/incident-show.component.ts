import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';
import { AuthService } from '../../core/auth.service';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

/**
 * Reproduction of admin/incidents/show.blade.php as the incident operations hub:
 * details + location + human-impact stats + damage/needs labels + evidence,
 * the situation updates log, the DAS→RAS→Asst.Director→Director workflow action
 * panel (stage-aware buttons with comment prompts), the audit timeline, linked
 * tasks/allocations and periodic situation (history) reports.
 */
@Component({
  selector: 'page-incident-show',
  standalone: true,
  imports: [FormsModule, RouterLink, PageHeaderComponent, PanelComponent, StatCardComponent],
  styles: [`
    .detail-label { font-size: 0.72rem; color: var(--text-light); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 0.25rem; }
    .detail-value { font-size: 0.85rem; color: var(--text-dark); }
    .wf-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .tl { position: relative; padding-left: 20px; }
    .tl::before { content: ''; position: absolute; left: 7px; top: 4px; bottom: 4px; width: 2px; background: #e3e6ed; }
    .tl-item { position: relative; padding-bottom: 14px; }
    .tl-dot { position: absolute; left: -20px; top: 3px; width: 14px; height: 14px; border-radius: 50%; border: 3px solid #dc3545; background: #fff; }
    .tl-dot.approved { border-color: #198754; }
    .tl-dot.rolled_back { border-color: #dc3545; background: #fde2e2; }
    .tl-dot.submitted, .tl-dot.resubmitted { border-color: #0d6efd; }
    .tl-action { font-size: 0.8rem; font-weight: 600; color: var(--text-dark); }
    .tl-meta { font-size: 0.7rem; color: var(--text-light); }
    .tl-comment { font-size: 0.78rem; color: #4a5568; background: #f9fafb; border-left: 2px solid #dc3545; border-radius: 6px; padding: 4px 8px; margin-top: 4px; }
    .label-chips { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  `],
  template: `
    @if (data(); as d) {
      <dmis-page-header [title]="d.incident.title" icon="fa-exclamation-triangle"
        [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Response'},
          {label:'Incidents', url:'/m/response/incidents'}, {label:'#' + d.incident.id}]">
        <div style="display:flex;gap:0.5rem;">
          @if (canEdit()) { <a [routerLink]="['/m/response/incidents', d.incident.id, 'edit']" class="btn-add" style="background:#f59e0b;"><i class="fas fa-edit"></i> Edit</a> }
          <a routerLink="/m/response/incidents" class="btn-add" style="background:var(--text-mid);"><i class="fas fa-arrow-left"></i> Back</a>
        </div>
      </dmis-page-header>

      <div style="display:flex;gap:0.5rem;flex-wrap:wrap;margin-bottom:1rem;">
        <span class="r-badge badge-rejected" style="font-size:0.8rem;padding:0.3rem 0.7rem;">{{ d.incident.severity_level }}</span>
        <span class="r-badge badge-active" style="font-size:0.8rem;padding:0.3rem 0.7rem;">{{ d.incident.status }}</span>
        <span class="r-badge badge-pending" style="font-size:0.8rem;padding:0.3rem 0.7rem;">{{ d.incident.workflow_status_label }}</span>
        @if (d.incident.rollback_count > 0) {
          <span class="r-badge badge-rejected" style="font-size:0.8rem;padding:0.3rem 0.7rem;" title="Returned for corrections{{ d.incident.last_rollback_by_role ? ' by ' + d.incident.last_rollback_by_role : '' }}{{ d.incident.last_rollback_at_display ? ' on ' + d.incident.last_rollback_at_display : '' }}">↩ Returned · {{ d.incident.rollback_count }} rollback(s)</span>
        }
      </div>

      <div class="stats-row">
        <dmis-stat-card [value]="d.incident.people_affected ?? 0" label="People Affected" icon="fa-users" color="#6f42c1" />
        <dmis-stat-card [value]="d.incident.deaths_total ?? 0" label="Deaths" icon="fa-cross" color="#dc3545" />
        <dmis-stat-card [value]="d.incident.injured_total ?? 0" label="Injured" icon="fa-user-injured" color="#fd7e14" />
        <dmis-stat-card [value]="d.incident.missing_total ?? 0" label="Missing" icon="fa-question-circle" color="#6c757d" />
        <dmis-stat-card [value]="d.incident.displaced ?? 0" label="Displaced" icon="fa-people-roof" color="#0d6efd" />
      </div>

      <div class="row">
        <div class="col-lg-8">
          <div class="panel-row full">
            <dmis-panel title="Incident Details" icon="fa-clipboard-list">
              <div class="panel-body">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;">
                  <div><div class="detail-label">Hazard</div><div class="detail-value">{{ d.incident.hazard_name ?? '-' }}</div></div>
                  <div><div class="detail-label">Type</div><div class="detail-value">{{ d.incident.incident_type_name ?? '-' }}</div></div>
                  <div><div class="detail-label">Reported At</div><div class="detail-value">{{ d.incident.reported_at_display }}</div></div>
                  <div><div class="detail-label">Occurred At</div><div class="detail-value">{{ d.incident.occurred_at_display ?? '-' }}</div></div>
                  <div><div class="detail-label">Ended At</div><div class="detail-value">{{ d.incident.ended_at_display ?? 'Ongoing' }}</div></div>
                  <div><div class="detail-label">Source</div><div class="detail-value">{{ d.incident.source_of_report ?? '-' }}</div></div>
                  <div><div class="detail-label">Reported By</div><div class="detail-value">{{ d.incident.reported_by_name ?? '-' }} {{ d.incident.reported_by_contact ? '(' + d.incident.reported_by_contact + ')' : '' }}</div></div>
                  <div><div class="detail-label">Assigned To</div><div class="detail-value">{{ d.incident.assigned_to_name ?? 'Unassigned' }}</div></div>
                  <div><div class="detail-label">Location</div><div class="detail-value">{{ d.incident.location_description }}</div></div>
                  <div><div class="detail-label">District / Region</div><div class="detail-value">{{ d.incident.district_name ?? '-' }} / {{ d.incident.region_name ?? '-' }}</div></div>
                  @if (d.incident.ward_name || d.incident.council_name) { <div><div class="detail-label">Ward / Council</div><div class="detail-value">{{ d.incident.ward_name ?? '-' }} / {{ d.incident.council_name ?? '-' }}</div></div> }
                  @if (d.incident.latitude) {
                    <div><div class="detail-label">Coordinates</div><div class="detail-value">{{ d.incident.latitude }}, {{ d.incident.longitude }}</div></div>
                  }
                </div>
                @if (d.incident.description) {
                  <div class="mt-3"><div class="detail-label">Description</div><div class="detail-value" style="line-height:1.6;">{{ d.incident.description }}</div></div>
                }
                @if (d.incident.infrastructure_damage?.length) {
                  <div class="mt-3"><div class="detail-label">Infrastructure Damage</div>
                    <div class="label-chips">@for (k of d.incident.infrastructure_damage; track k) { <span class="r-badge badge-rejected">{{ humanize(k) }}</span> }</div>
                  </div>
                }
                @if (d.incident.emergency_needs?.length) {
                  <div class="mt-2"><div class="detail-label">Emergency Needs</div>
                    <div class="label-chips">@for (k of d.incident.emergency_needs; track k) { <span class="r-badge badge-pending">{{ humanize(k) }}</span> }
                      @if (d.incident.emergency_needs_other) { <span class="r-badge badge-pending">{{ d.incident.emergency_needs_other }}</span> }
                    </div>
                  </div>
                }
                @if (d.incident.action_taken) {
                  <div class="mt-3"><div class="detail-label">Action Taken</div><div class="detail-value">{{ d.incident.action_taken }}</div></div>
                }
                @if (d.incident.photo_paths?.length) {
                  <div class="mt-3"><div class="detail-label">Photos</div>
                    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
                      @for (p of d.incident.photo_paths; track p) {
                        <a [href]="'/api/storage/' + p" target="_blank"><img [src]="'/api/storage/' + p" style="height:84px;border-radius:8px;object-fit:cover;" alt="Incident photo"></a>
                      }
                    </div>
                  </div>
                }
              </div>
            </dmis-panel>
          </div>

          <div class="panel-row full">
            <dmis-panel title="Situation Updates" icon="fa-comment-dots" [badge]="d.updates.length + ' entries'">
              <div class="panel-body">
                <div class="d-flex gap-2 mb-3">
                  <select class="form-select form-select-sm" style="max-width:200px;" [(ngModel)]="updateType">
                    @for (t of updateTypes(); track t) { <option [value]="t">{{ t }}</option> }
                  </select>
                  <input type="text" class="form-control form-control-sm" placeholder="Log a situation update..." [(ngModel)]="updateText">
                  <button type="button" class="btn btn-sm btn-add" (click)="addUpdate()"><i class="fas fa-plus"></i></button>
                </div>
                @for (u of d.updates; track u.id) {
                  <div style="padding:0.5rem 0;border-bottom:1px solid #f1f5f9;">
                    <div style="font-size:0.82rem;color:var(--text-dark);">{{ u.update_details }}</div>
                    <div style="font-size:0.7rem;color:var(--text-light);">{{ u.update_type ?? 'General Update' }} · {{ u.user_name }} · {{ u.created_at }}</div>
                  </div>
                } @empty { <div class="empty-state" style="padding:1rem;">No updates logged yet.</div> }
              </div>
            </dmis-panel>
          </div>

          <div class="panel-row full">
            <dmis-panel title="Linked Operations" icon="fa-link">
              <div class="panel-body">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
                  <div>
                    <div class="detail-label">Resource Allocations ({{ d.allocations.length }})</div>
                    @for (a of d.allocations; track a.id) {
                      <div style="font-size:0.8rem;padding:0.25rem 0;">{{ a.resource_name }} — {{ a.quantity_requested }} {{ a.unit_of_measure }} <span class="r-badge badge-pending" style="font-size:0.62rem;">{{ a.status }}</span></div>
                    } @empty { <div style="font-size:0.78rem;color:var(--text-light);">None yet.</div> }
                  </div>
                  <div>
                    <div class="detail-label">Tasks ({{ d.tasks.length }})</div>
                    @for (t of d.tasks; track t.id) {
                      <div style="font-size:0.8rem;padding:0.25rem 0;">{{ t.title }} <span class="r-badge badge-inactive" style="font-size:0.62rem;">{{ t.status }}</span></div>
                    } @empty { <div style="font-size:0.78rem;color:var(--text-light);">None yet.</div> }
                  </div>
                </div>
              </div>
            </dmis-panel>
          </div>
        </div>

        <div class="col-lg-4">
          <dmis-panel title="Approval Workflow" icon="fa-route">
            <div class="panel-body">
              <div class="wf-actions">
                @if (canSubmit()) {
                  <button class="btn btn-sm btn-add" (click)="act('submit', 'Submit this incident into the approval chain?')"><i class="fas fa-paper-plane me-1"></i> Submit</button>
                }
                @if (canResubmit()) {
                  <button class="btn btn-sm btn-add" (click)="act('resubmit', 'Resubmit after corrections?')"><i class="fas fa-redo me-1"></i> Resubmit</button>
                }
                @if (canApprove()) {
                  <button class="btn btn-sm btn-success" (click)="act('approve', 'Approve and escalate to the next level?')"><i class="fas fa-check me-1"></i> Approve / Escalate</button>
                }
                @if (canRollback()) {
                  <button class="btn btn-sm btn-outline-danger" (click)="act('rollback', 'Roll back to the previous level for corrections? Comments are required.', true)"><i class="fas fa-undo me-1"></i> Roll Back</button>
                }
                @if (canResolve()) {
                  <button class="btn btn-sm btn-outline-success" (click)="act('resolve', 'Resolve locally — resources sufficient at this level? The levels above will be informed.')"><i class="fas fa-circle-check me-1"></i> Resolve Locally</button>
                }
                @if (canCloseRumor()) {
                  <button class="btn btn-sm btn-outline-secondary" (click)="act('close-rumor', 'Close as a rumour / normal case? District leadership (DED, DAS) will be informed.')"><i class="fas fa-ban me-1"></i> Close (Rumour)</button>
                }
              </div>
              <div class="detail-label mt-3">Operational Status</div>
              <div class="wf-actions mt-1">
                @if (canVerify()) {
                  <button class="btn btn-sm btn-outline-success" (click)="act('verify', 'Mark this incident as verified?')"><i class="fas fa-check-double me-1"></i> Verify</button>
                }
                @if (canEscalate()) {
                  <button class="btn btn-sm btn-outline-warning" (click)="act('escalate', 'Escalate this incident?')"><i class="fas fa-arrow-up me-1"></i> Escalate</button>
                }
                @if (canClose()) {
                  <button class="btn btn-sm btn-outline-secondary" (click)="act('close', 'Close this incident? This marks the operational response complete.')"><i class="fas fa-flag-checkered me-1"></i> Close</button>
                }
              </div>
              <div class="mt-3">
                <div class="detail-label">Audit Timeline</div>
                <div class="tl mt-2">
                  @for (h of d.workflow_histories; track $index) {
                    <div class="tl-item">
                      <div class="tl-dot" [class]="'tl-dot ' + h.action"></div>
                      <div class="tl-action">{{ humanize(h.action) }} → {{ h.to_status_label }}</div>
                      <div class="tl-meta">{{ h.user_name }} ({{ h.performed_by_role }}) · {{ h.created_at }}</div>
                      @if (h.comments) { <div class="tl-comment">{{ h.comments }}</div> }
                    </div>
                  } @empty { <div style="font-size:0.78rem;color:var(--text-light);">No workflow activity yet.</div> }
                </div>
              </div>
            </div>
          </dmis-panel>

          <dmis-panel title="Public Portal" icon="fa-bullhorn">
            <div class="panel-body">
              <div class="detail-label">Live map</div>
              <div class="wf-actions mt-1">
                @if (!d.incident.show_on_portal_map) {
                  <button class="btn btn-sm btn-add" (click)="pushMap(true)"><i class="fas fa-map-marker-alt me-1"></i> Push to map</button>
                } @else {
                  <button class="btn btn-sm btn-outline-danger" (click)="pushMap(false)"><i class="fas fa-map-marker-alt me-1"></i> Remove from map</button>
                  <a class="btn btn-sm btn-outline-primary" [href]="'/incident/' + d.incident.id" target="_blank" rel="noopener"><i class="fas fa-external-link-alt me-1"></i> View public page</a>
                }
              </div>
              <div class="detail-label mt-3">News &amp; Events</div>
              <div class="wf-actions mt-1">
                @if (!d.incident.portal_news_id) {
                  <button class="btn btn-sm btn-add" (click)="pushNews()"><i class="fas fa-newspaper me-1"></i> Push to news</button>
                } @else {
                  <button class="btn btn-sm btn-outline-danger" (click)="removeNews()"><i class="fas fa-newspaper me-1"></i> Remove from news</button>
                }
              </div>
              <div style="font-size:0.72rem;color:var(--text-light);margin-top:0.6rem;">
                Publishing shows a live snapshot (situation, response &amp; resources) on the public portal map and News &amp; Events; it updates as you update the incident.
              </div>
            </div>
          </dmis-panel>

          <dmis-panel title="Situation Reports" icon="fa-file-medical" [badge]="d.history_reports.length + ''">
            <div class="panel-body">
              <button class="btn btn-sm btn-outline-secondary w-100 mb-2" (click)="addHistoryReport()"><i class="fas fa-plus me-1"></i> Record Situation Report</button>
              @for (r of d.history_reports; track r.id) {
                <div style="font-size:0.78rem;padding:0.4rem 0;border-bottom:1px solid #f1f5f9;">
                  †{{ r.deaths_total }} · inj {{ r.injured_total }} · displ {{ r.displaced }}
                  @if (r.remarks) { — {{ r.remarks }} }
                  <div style="font-size:0.68rem;color:var(--text-light);">{{ r.reported_by_name ?? '-' }}</div>
                </div>
              } @empty { <div style="font-size:0.78rem;color:var(--text-light);">None recorded.</div> }
            </div>
          </dmis-panel>
        </div>
      </div>
    }
  `,
})
export class IncidentShowComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);
  readonly canEdit = computed(() => this.auth.hasPermission('incidents.update'));

  data = signal<any | null>(null);
  updateText = '';
  updateType = 'General Update';

  private get id(): string {
    return this.route.snapshot.paramMap.get('id')!;
  }

  ngOnInit(): void {
    ensureSweetAlert();
    this.load();
  }

  load(): void {
    this.http.get<any>(`/api/v1/response/incidents/${this.id}`).subscribe(d => this.data.set(d));
  }

  updateTypes(): string[] {
    return ['General Update', 'Action Taken', 'Decision Logged', 'Resource Status Update',
      'External Communication', 'Observation', 'Escalation Note', 'Resolution Update', 'Other'];
  }

  wf(): string {
    return this.data()?.incident.workflow_status ?? '';
  }

  canSubmit(): boolean {
    return ['draft', 'rolled_back_to_district', 'rolled_back_to_regional'].includes(this.wf());
  }

  canResubmit(): boolean {
    return this.wf() === 'rolled_back_to_das';
  }

  /** Escalation ladder stages (INCIDENT-WORKFLOW-PLAN.md). The backend still gates WHO may act at each. */
  canApprove(): boolean {
    return ['waiting_ddmc', 'waiting_ded', 'waiting_rdmc', 'waiting_ras',
      'waiting_eocc', 'waiting_director', 'waiting_ps'].includes(this.wf());
  }

  /** Roll-back is available at every stage except the DDMC entry. */
  canRollback(): boolean {
    return ['waiting_ded', 'waiting_rdmc', 'waiting_ras',
      'waiting_eocc', 'waiting_director', 'waiting_ps'].includes(this.wf());
  }

  /** DDMC gatekeeper: close an entry-stage report as a rumour / normal case. */
  canCloseRumor(): boolean {
    return this.wf() === 'waiting_ddmc';
  }

  /** DED (district) / RAS (region): resolve locally when resources sufficed, instead of escalating. */
  canResolve(): boolean {
    return ['waiting_ded', 'waiting_ras'].includes(this.wf());
  }

  canForward(): boolean {
    return false;   // the linear escalation ladder replaced the ad-hoc national forward
  }

  /** Operational status (separate axis from the approval workflow_status). */
  opStatus(): string {
    return this.data()?.incident.status ?? '';
  }

  canVerify(): boolean {
    return !['Verified', 'Closed'].includes(this.opStatus());
  }

  canEscalate(): boolean {
    return !['Escalated', 'Closed'].includes(this.opStatus());
  }

  canClose(): boolean {
    return this.opStatus() !== 'Closed';
  }

  /** Confirm + optional comments prompt, then POST the workflow action. */
  act(action: string, confirmText: string, commentsRequired = false): void {
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: confirmText, icon: 'question', input: 'textarea',
        inputLabel: commentsRequired ? 'Comments (required)' : 'Comments (optional)',
        showCancelButton: true, confirmButtonColor: '#dc3545',
        preConfirm: (value: string) => {
          if (commentsRequired && !value?.trim()) {
            Swal.showValidationMessage('Comments are required for this action');
            return false;
          }
          return value;
        },
      }).then((res: any) => {
        if (!res.isConfirmed) { return; }
        this.http.post<any>(`/api/v1/response/incidents/${this.id}/${action}`, { comments: res.value || null }).subscribe({
          next: r => Swal.fire({ icon: 'success', title: 'Done', text: r.message, timer: 2000, showConfirmButton: false }).then(() => this.load()),
          error: err => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  /** Push / remove the incident on the public portal live map (toggle show_on_portal_map). */
  pushMap(on: boolean): void {
    this.http.post<any>(`/api/v1/response/incidents/${this.id}/push-map`, { value: on }).subscribe({
      next: () => ensureSweetAlert().then(() => Swal.fire({
        icon: 'success', title: on ? 'Pushed to the public map' : 'Removed from the map',
        timer: 1600, showConfirmButton: false }).then(() => this.load())),
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error')),
    });
  }

  /** Publish the incident as a public News & Events article (links to its live snapshot). */
  pushNews(): void {
    this.http.post<any>(`/api/v1/response/incidents/${this.id}/push-news`, {}).subscribe({
      next: () => ensureSweetAlert().then(() => Swal.fire({
        icon: 'success', title: 'Published to News & Events', timer: 1600, showConfirmButton: false }).then(() => this.load())),
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error')),
    });
  }

  /** Remove the incident's News & Events article. */
  removeNews(): void {
    this.http.post<any>(`/api/v1/response/incidents/${this.id}/remove-news`, {}).subscribe({
      next: () => ensureSweetAlert().then(() => Swal.fire({
        icon: 'success', title: 'Removed from News & Events', timer: 1600, showConfirmButton: false }).then(() => this.load())),
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error')),
    });
  }

  forward(): void {
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Forward to', input: 'select',
        inputOptions: {
          'Director': 'Director', 'Asst. Director': 'Asst. Director', 'EOCC': 'EOCC',
          'Assistant Director Operation': 'Assistant Director Operation',
        },
        showCancelButton: true, confirmButtonColor: '#0d6efd',
      }).then((res: any) => {
        if (!res.isConfirmed) { return; }
        this.http.post<any>(`/api/v1/response/incidents/${this.id}/forward`, { to_role: res.value }).subscribe({
          next: r => Swal.fire({ icon: 'success', title: 'Forwarded', text: r.message, timer: 2000, showConfirmButton: false }).then(() => this.load()),
          error: err => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  addUpdate(): void {
    if (!this.updateText.trim()) { return; }
    this.http.post<any>(`/api/v1/response/incidents/${this.id}/updates`,
        { update_details: this.updateText.trim(), update_type: this.updateType }).subscribe({
      next: () => { this.updateText = ''; this.load(); },
      error: err => ensureSweetAlert().then(() => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error')),
    });
  }

  addHistoryReport(): void {
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Record Situation Report',
        html: `<div class="text-start" style="font-size:0.85rem;">
          <div class="row g-2">
            <div class="col-4"><label class="form-label">Deaths</label><input id="srD" type="number" min="0" value="0" class="form-control form-control-sm"></div>
            <div class="col-4"><label class="form-label">Injured</label><input id="srI" type="number" min="0" value="0" class="form-control form-control-sm"></div>
            <div class="col-4"><label class="form-label">Displaced</label><input id="srP" type="number" min="0" value="0" class="form-control form-control-sm"></div>
            <div class="col-12"><label class="form-label">Remarks</label><textarea id="srR" rows="2" class="form-control form-control-sm"></textarea></div>
          </div></div>`,
        showCancelButton: true, confirmButtonText: 'Record', width: 480,
        preConfirm: () => ({
          deaths_total: Number((document.getElementById('srD') as HTMLInputElement).value || 0),
          injured_total: Number((document.getElementById('srI') as HTMLInputElement).value || 0),
          displaced: Number((document.getElementById('srP') as HTMLInputElement).value || 0),
          remarks: (document.getElementById('srR') as HTMLTextAreaElement).value || null,
        }),
      }).then((res: any) => {
        if (!res.isConfirmed) { return; }
        this.http.post<any>(`/api/v1/response/incidents/${this.id}/history-reports`, res.value).subscribe({
          next: r => Swal.fire({ icon: 'success', title: 'Recorded', text: r.message, timer: 1800, showConfirmButton: false }).then(() => this.load()),
          error: err => Swal.fire('Error', err?.error?.message ?? 'An error occurred.', 'error'),
        });
      });
    });
  }

  humanize(key: string): string {
    return (key ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
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
