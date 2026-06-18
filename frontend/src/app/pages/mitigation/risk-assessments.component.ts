import { SlicePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { StatCardComponent } from '../../shell/stat-card.component';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

interface AssessmentRow {
  id: number; priorityLevel: number | null; assessmentCode: string | null; assessmentTitle: string;
  planType: string | null; hazardName: string | null; locationName: string; districtCouncil: string | null;
  riskLevel: string; assessmentStatus: string; isPublished: boolean;
  assessmentDate: string | null; assessmentDateRelative: string;
}
interface Detail {
  [key: string]: any;
  versionHistory: { version?: number; created_at: string; created_by?: string; changes?: string }[];
}
interface IndexResponse {
  riskAssessments: AssessmentRow[];
  pagination: { currentPage: number; lastPage: number; total: number; firstItem: number; lastItem: number };
  stats: { total: number; highRisk: number; published: number; pendingReview: number };
  hazards: { id: number; name: string }[];
}

/**
 * Reproduction of admin/risk_assessments/index.blade.php — the module's richest screen.
 * Source quirks reproduced: page-scoped stats, textContent
 * filters, the broken create/edit modals' observable outcomes, and a version history that never grows.
 */
@Component({
  selector: 'page-risk-assessments',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, StatCardComponent, SlicePipe],
  styles: [`
    .filter-bar select { padding: 0.45rem 0.7rem; border: 1px solid var(--border); border-radius: 8px; font-size: 0.78rem; background: #fff; color: var(--text-dark); }
    .ra-modal-backdrop { display: none; position: fixed; inset: 0; z-index: 1100; background: rgba(0,0,0,0.5); overflow-y: auto; }
    .ra-modal-backdrop.open { display: block; }
    .ra-modal { background: #fff; border-radius: 0.5rem; margin: 1.75rem auto; max-width: 1140px; box-shadow: 0 12px 40px rgba(0,0,0,0.25); }
    .ra-modal.lg { max-width: 800px; }
    .ra-modal-header { background: var(--module-color, #003366); color: #fff; border: 0; padding: 1rem 1.25rem; border-radius: 0.5rem 0.5rem 0 0; display: flex; justify-content: space-between; align-items: center; }
    .ra-modal-header h5 { margin: 0; font-size: 1.1rem; font-weight: 600; }
    .ra-modal-body { padding: 1.25rem; }
    .ra-close { background: none; border: none; color: #fff; font-size: 1.4rem; cursor: pointer; line-height: 1; }
    .nav-tabs .nav-link { cursor: pointer; }
    /* Version history timeline — copied from viewVersionHistory()'s injected styles */
    .timeline { position: relative; padding: 20px 0 20px; margin-top: 20px; }
    .timeline:before { content: ''; position: absolute; top: 0; left: 25px; height: 100%; width: 3px; background: #003366; }
    .timeline-item { margin-bottom: 20px; position: relative; padding-left: 60px; }
    .timeline-icon { position: absolute; left: 11px; top: 0; width: 30px; height: 30px; border-radius: 50%; background: #FFD700; display: flex; align-items: center; justify-content: center; font-weight: bold; color: #003366; }
  `],
  template: `
    <dmis-page-header title="Risk Assessment Management" icon="fa-shield-alt"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Admin'}, {label:'Risk Assessments'}]">
      <!-- Source broken create modal deliberately FIXED: opens the working form page. -->
      <button class="btn-add" (click)="openCreateModal()"><i class="fas fa-plus"></i> New Assessment</button>
    </dmis-page-header>

    <div class="stats-row">
      <dmis-stat-card [value]="stats().total" label="Total Assessments" icon="fa-clipboard-list" color="#003366" />
      <dmis-stat-card [value]="stats().highRisk" label="High Risk Areas" icon="fa-exclamation-triangle" color="#ef4444" />
      <dmis-stat-card [value]="stats().published" label="Published" icon="fa-globe" color="#10b981" />
      <dmis-stat-card [value]="stats().pendingReview" label="Pending Review" icon="fa-hourglass-half" color="#f59e0b" />
    </div>

    <div class="filter-bar">
      <div class="search-box">
        <i class="fas fa-search"></i>
        <input type="text" placeholder="Search assessments..." [value]="search()" (input)="search.set($any($event.target).value)">
      </div>
      <select [value]="riskFilter()" (change)="riskFilter.set($any($event.target).value)">
        <option value="">All Risk Levels</option>
        <option value="Low">Low</option>
        <option value="Medium">Medium</option>
        <option value="High">High</option>
        <option value="Very High">Very High</option>
        <option value="Critical">Critical</option>
      </select>
      <select [value]="statusFilter()" (change)="statusFilter.set($any($event.target).value)">
        <option value="">All Status</option>
        <option value="draft">Draft</option>
        <option value="under_review">Under Review</option>
        <option value="approved">Approved</option>
        <option value="published">Published</option>
      </select>
      <select [value]="planTypeFilter()" (change)="planTypeFilter.set($any($event.target).value)">
        <option value="">All Plan Types</option>
        <option value="anticipatory">Anticipatory</option>
        <option value="contingency">Contingency</option>
      </select>
    </div>

    <div class="panel-row" style="animation-delay:.30s;">
      <dmis-panel title="Risk Assessments List" icon="fa-database" [badge]="pagination().total + ' total'">
        <div class="panel-body" style="padding:0;">
          @if (rows().length) {
            <div style="overflow-x:auto;">
              <table class="r-table">
                <thead>
                  <tr>
                    <th>Priority</th><th>Code</th><th>Title</th><th>Hazard</th><th>Location</th>
                    <th>Risk Level</th><th>Status</th><th>Date</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (a of rows(); track a.id) {
                    <tr class="data-row" [style.display]="rowVisible(a) ? '' : 'none'">
                      <td style="font-size:0.78rem;">
                        @if (a.priorityLevel) {
                          <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:rgba(245,158,11,0.15);color:#d97706;font-weight:700;font-size:0.75rem;">{{ a.priorityLevel }}</span>
                        } @else { <span style="color:var(--text-light);">-</span> }
                      </td>
                      <td><span class="r-badge" style="background:rgba(107,114,128,0.1);color:#6b7280;font-family:monospace;">{{ a.assessmentCode }}</span></td>
                      <td>
                        <div class="r-title">{{ limit(a.assessmentTitle, 30) }}</div>
                        @if (a.planType) { <div class="r-subtitle">{{ ucfirst(a.planType) }} Plan</div> }
                      </td>
                      <td><span class="r-badge" style="background:rgba(59,130,246,0.1);color:#2563eb;">{{ a.hazardName || 'N/A' }}</span></td>
                      <td style="font-size:0.78rem;color:var(--text-mid);max-width:130px;">
                        {{ a.locationName }}
                        @if (a.districtCouncil) { <div class="r-subtitle">{{ a.districtCouncil }}</div> }
                      </td>
                      <td><span class="r-badge {{ riskBadge(a.riskLevel) }}">{{ a.riskLevel }}</span></td>
                      <td>
                        <span class="r-badge {{ statusBadge(a.assessmentStatus) }}">{{ statusLabel(a.assessmentStatus) }}</span>
                        @if (a.isPublished) { <i class="fas fa-globe" style="color:#059669;font-size:0.55rem;margin-left:0.2rem;" title="Published"></i> }
                      </td>
                      <td style="font-size:0.78rem;color:var(--text-mid);">
                        <div style="font-weight:600;">{{ a.assessmentDate }}</div>
                        <div class="r-subtitle">{{ a.assessmentDateRelative }}</div>
                      </td>
                      <td>
                        <div class="ctx-wrap">
                          <button class="ctx-trigger" type="button" (click)="toggleMenu(a.id, $event)"><i class="fas fa-ellipsis-v"></i></button>
                          <div class="ctx-menu" [class.open]="openMenu() === a.id">
                            <button class="ctx-item" (click)="viewAssessment(a.id)"><i class="fas fa-eye"></i> View</button>
                            <button class="ctx-item success" (click)="openEditModal(a.id)"><i class="fas fa-edit"></i> Edit</button>
                            @if (a.assessmentStatus === 'draft' || a.assessmentStatus === 'under_review') {
                              <button class="ctx-item success" (click)="approveAssessment(a.id)"><i class="fas fa-check"></i> Approve</button>
                            }
                            @if (a.assessmentStatus === 'approved' && !a.isPublished) {
                              <button class="ctx-item" (click)="publishAssessment(a.id)"><i class="fas fa-globe"></i> Publish</button>
                            }
                            <button class="ctx-item" (click)="viewVersionHistory(a.id)"><i class="fas fa-history"></i> History</button>
                            <div class="ctx-divider"></div>
                            <button class="ctx-item danger" (click)="deleteAssessment(a.id)"><i class="fas fa-trash"></i> Delete</button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="empty-state">
              <i class="fas fa-folder-open"></i>
              No risk assessments found.<br>
              <button class="btn-add" (click)="openCreateModal()" style="margin-top:0.6rem;display:inline-flex;">
                <i class="fas fa-plus"></i> Create First Assessment
              </button>
            </div>
          }
        </div>

        @if (pagination().lastPage > 1) {
          <div class="pagination-wrap">
            <span>Showing {{ pagination().firstItem }} to {{ pagination().lastItem }} of {{ pagination().total }}</span>
            <div class="page-links">
              @if (pagination().currentPage === 1) {
                <span style="opacity:0.4;">&laquo;</span>
              } @else { <a (click)="load(pagination().currentPage - 1)" style="cursor:pointer;">&laquo;</a> }
              @for (p of pageRange(); track p) {
                @if (p === pagination().currentPage) { <span class="active">{{ p }}</span> }
                @else { <a (click)="load(p)" style="cursor:pointer;">{{ p }}</a> }
              }
              @if (pagination().currentPage < pagination().lastPage) {
                <a (click)="load(pagination().currentPage + 1)" style="cursor:pointer;">&raquo;</a>
              } @else { <span style="opacity:0.4;">&raquo;</span> }
            </div>
          </div>
        }
      </dmis-panel>
    </div>

    <!-- View Modal (Bootstrap modal-xl look, tabs as in the source) -->
    <div class="ra-modal-backdrop" [class.open]="viewOpen()" (click)="viewOpen.set(false)">
      <div class="ra-modal" (click)="$event.stopPropagation()">
        <div class="ra-modal-header">
          <h5><i class="fas fa-file-alt me-2"></i>{{ detail()?.['assessmentTitle'] || 'Risk Assessment Details' }}</h5>
          <button class="ra-close" (click)="viewOpen.set(false)">&times;</button>
        </div>
        <div class="ra-modal-body">
          @if (detail(); as d) {
            <div style="background:rgba(0,51,102,0.05);padding:1rem;border-radius:10px;border-left:4px solid #FFD700;margin-bottom:1.5rem;">
              <div class="row align-items-center">
                <div class="col-md-3"><small class="text-muted d-block">Location</small><strong><i class="fas fa-map-marker-alt me-1" style="color:#003366;"></i>{{ d['locationName'] || 'N/A' }}</strong></div>
                <div class="col-md-3"><small class="text-muted d-block">Assessment Code</small><strong style="color:#003366;">{{ d['assessmentCode'] || 'N/A' }}</strong></div>
                <div class="col-md-3"><small class="text-muted d-block">Status</small><span class="badge bg-info">{{ d['assessmentStatus'] || 'draft' }}</span></div>
                <div class="col-md-3"><small class="text-muted d-block">Date Created</small><strong>{{ d['createdAt'] ? (d['createdAt'] | slice:0:10) : 'N/A' }}</strong></div>
              </div>
            </div>

            <div class="text-center mb-4">
              <div style="display:inline-block;background:white;padding:1.5rem;border-radius:15px;box-shadow:0 5px 15px rgba(0,0,0,0.1);">
                <h5 style="margin-bottom:1rem;color:#003366;">Risk Assessment Matrix</h5>
                <div class="row g-3">
                  <div class="col-md-4"><div style="padding:1rem;border-radius:10px;background:#f8f9fa;"><small class="text-muted">Likelihood</small><h4 style="color:#003366;margin:0.5rem 0;">{{ d['likelihood'] || 'N/A' }}</h4></div></div>
                  <div class="col-md-4"><div style="padding:1rem;border-radius:10px;background:#f8f9fa;"><small class="text-muted">Severity</small><h4 style="color:#003366;margin:0.5rem 0;">{{ d['severityOfImpact'] || 'N/A' }}</h4></div></div>
                  <div class="col-md-4"><div style="padding:1rem;border-radius:10px;background:#f8f9fa;"><small class="text-muted">Risk Level</small><h4 class="badge bg-{{ riskColor(d['riskLevel']) }}" style="font-size:1.5rem;padding:0.5rem 1rem;">{{ d['riskLevel'] || 'N/A' }}</h4></div></div>
                </div>
              </div>
            </div>

            <ul class="nav nav-tabs" style="border-bottom:2px solid #003366;">
              <li class="nav-item"><a class="nav-link" [class.active]="viewTab() === 'details'" (click)="viewTab.set('details')">Details</a></li>
              <li class="nav-item"><a class="nav-link" [class.active]="viewTab() === 'impact'" (click)="viewTab.set('impact')">Impact</a></li>
              <li class="nav-item"><a class="nav-link" [class.active]="viewTab() === 'mitigation'" (click)="viewTab.set('mitigation')">Mitigation</a></li>
              @if (d['knowledgeType']) {
                <li class="nav-item"><a class="nav-link" [class.active]="viewTab() === 'knowledge'" (click)="viewTab.set('knowledge')">Knowledge</a></li>
              }
            </ul>

            <div class="pt-3">
              @if (viewTab() === 'details') {
                <div class="row">
                  <div class="col-md-6">
                    <h6 style="color:#003366;border-bottom:2px solid #FFD700;padding-bottom:0.5rem;margin-bottom:1rem;"><i class="fas fa-info-circle me-2"></i>Basic Information</h6>
                    <dl class="row">
                      <dt class="col-sm-5">Hazard:</dt><dd class="col-sm-7"><span class="badge bg-info">{{ d['hazardName'] || 'N/A' }}</span></dd>
                      <dt class="col-sm-5">Assessment Date:</dt><dd class="col-sm-7">{{ d['assessmentDate'] || 'N/A' }}</dd>
                      <dt class="col-sm-5">Assessed By:</dt><dd class="col-sm-7">{{ d['assessedBy'] || 'N/A' }}</dd>
                      <dt class="col-sm-5">Priority Level:</dt>
                      <dd class="col-sm-7">
                        @if (d['priorityLevel']) {
                          <span style="display:inline-block;width:30px;height:30px;border-radius:50%;background:#FFD700;color:#003366;text-align:center;line-height:30px;font-weight:bold;">{{ d['priorityLevel'] }}</span> / 10
                        } @else { N/A }
                      </dd>
                      <dt class="col-sm-5">Review Date:</dt><dd class="col-sm-7">{{ d['reviewDate'] || 'N/A' }}</dd>
                    </dl>
                  </div>
                  <div class="col-md-6">
                    <h6 style="color:#003366;border-bottom:2px solid #FFD700;padding-bottom:0.5rem;margin-bottom:1rem;"><i class="fas fa-map me-2"></i>Location Details</h6>
                    <dl class="row">
                      <dt class="col-sm-5">District/Council:</dt><dd class="col-sm-7">{{ d['districtCouncil'] || 'N/A' }}</dd>
                      <dt class="col-sm-5">Ward:</dt><dd class="col-sm-7">{{ d['ward'] || 'N/A' }}</dd>
                      <dt class="col-sm-5">Village:</dt><dd class="col-sm-7">{{ d['village'] || 'N/A' }}</dd>
                      <dt class="col-sm-5">Coordinates:</dt><dd class="col-sm-7">{{ d['latitude'] && d['longitude'] ? d['latitude'] + ', ' + d['longitude'] : 'N/A' }}</dd>
                      <dt class="col-sm-5">Published:</dt><dd class="col-sm-7">
                        @if (d['isPublished']) { <span class="badge bg-success">Yes</span> } @else { <span class="badge bg-secondary">No</span> }
                      </dd>
                    </dl>
                  </div>
                </div>
              } @else if (viewTab() === 'impact') {
                <div style="background:#f8f9fa;padding:1.5rem;border-radius:10px;" class="mb-3">
                  <h6 style="color:#003366;margin-bottom:1rem;"><i class="fas fa-chart-bar me-2"></i>Impact Statistics</h6>
                  <div class="row text-center">
                    <div class="col-md-3"><h3 style="color:#dc3545;">{{ d['populationAtRisk'] || '0' }}</h3><small class="text-muted">Population at Risk</small></div>
                    <div class="col-md-3"><h3 style="color:#ffc107;">{{ d['householdsAffected'] || '0' }}</h3><small class="text-muted">Households Affected</small></div>
                    <div class="col-md-3"><h3 style="color:#28a745;">TZS {{ d['economicImpact'] || '0' }}</h3><small class="text-muted">Economic Impact</small></div>
                    <div class="col-md-3"><h3 style="color:#17a2b8;">TZS {{ d['mitigationBudget'] || '0' }}</h3><small class="text-muted">Mitigation Budget</small></div>
                  </div>
                </div>
                <h6 style="color:#003366;"><i class="fas fa-exclamation-triangle me-2"></i>Impact Description</h6>
                <p style="background:white;padding:1rem;border-left:4px solid #FFD700;border-radius:5px;">{{ d['impactDescription'] || 'No impact description provided.' }}</p>
                @if (d['vulnerableGroups']?.length) {
                  <div class="mt-3"><h6 style="color:#003366;"><i class="fas fa-users me-2"></i>Vulnerable Groups</h6>
                    <div class="d-flex flex-wrap gap-2">@for (g of d['vulnerableGroups']; track g) { <span class="badge bg-warning text-dark">{{ g }}</span> }</div></div>
                }
                @if (d['criticalInfrastructure']?.length) {
                  <div class="mt-3"><h6 style="color:#003366;"><i class="fas fa-building me-2"></i>Critical Infrastructure</h6>
                    <div class="d-flex flex-wrap gap-2">@for (g of d['criticalInfrastructure']; track g) { <span class="badge bg-danger">{{ g }}</span> }</div></div>
                }
                @if (d['environmentalImpact']?.length) {
                  <div class="mt-3"><h6 style="color:#003366;"><i class="fas fa-leaf me-2"></i>Environmental Impact</h6>
                    <div class="d-flex flex-wrap gap-2">@for (g of d['environmentalImpact']; track g) { <span class="badge bg-success">{{ g }}</span> }</div></div>
                }
              } @else if (viewTab() === 'mitigation') {
                <div class="mb-4"><h6 style="color:#003366;border-bottom:2px solid #FFD700;padding-bottom:0.5rem;margin-bottom:1rem;"><i class="fas fa-shield-alt me-2"></i>Existing Controls</h6>
                  <p style="background:#e6f2ff;padding:1rem;border-radius:10px;">{{ d['existingControls'] || 'No existing controls documented.' }}</p></div>
                <div class="mb-4"><h6 style="color:#003366;border-bottom:2px solid #FFD700;padding-bottom:0.5rem;margin-bottom:1rem;"><i class="fas fa-bell me-2"></i>Early Warning Systems</h6>
                  <p style="background:#fff3cd;padding:1rem;border-radius:10px;">{{ d['earlyWarningSystems'] || 'No early warning systems documented.' }}</p></div>
                <div class="mb-4"><h6 style="color:#003366;border-bottom:2px solid #FFD700;padding-bottom:0.5rem;margin-bottom:1rem;"><i class="fas fa-tasks me-2"></i>Recommended Actions</h6>
                  <p style="background:#d4edda;padding:1rem;border-radius:10px;">{{ d['recommendedActions'] || 'No recommended actions provided.' }}</p></div>
                @if (d['evacuationPlan']) {
                  <div class="mb-4"><h6 style="color:#003366;border-bottom:2px solid #FFD700;padding-bottom:0.5rem;margin-bottom:1rem;"><i class="fas fa-route me-2"></i>Evacuation Plan</h6>
                    <p style="background:#f0f8ff;padding:1rem;border-radius:10px;">{{ d['evacuationPlan'] }}</p></div>
                }
                @if (d['stakeholders']?.length) {
                  <div class="mb-4"><h6 style="color:#003366;border-bottom:2px solid #FFD700;padding-bottom:0.5rem;margin-bottom:1rem;"><i class="fas fa-handshake me-2"></i>Stakeholders</h6>
                    <div class="d-flex flex-wrap gap-2">@for (s of d['stakeholders']; track s) { <span class="badge bg-primary">{{ s }}</span> }</div></div>
                }
                @if (d['fundingSource']) { <div class="alert alert-info"><i class="fas fa-dollar-sign me-2"></i><strong>Funding Source:</strong> {{ d['fundingSource'] }}</div> }
                @if (d['lessonsLearned']) { <div class="alert alert-warning"><i class="fas fa-lightbulb me-2"></i><strong>Lessons Learned:</strong> {{ d['lessonsLearned'] }}</div> }
              } @else if (viewTab() === 'knowledge') {
                <dl class="row">
                  <dt class="col-sm-3">Knowledge Type:</dt><dd class="col-sm-9">{{ d['knowledgeType'] }}</dd>
                  <dt class="col-sm-3">Repository ID:</dt><dd class="col-sm-9"><code>{{ d['repositoryEntryId'] || 'N/A' }}</code></dd>
                  <dt class="col-sm-3">Implementation Period:</dt><dd class="col-sm-9">{{ d['implementationPeriod'] || 'N/A' }}</dd>
                  <dt class="col-sm-3">Author:</dt><dd class="col-sm-9">{{ d['author'] || 'N/A' }}</dd>
                </dl>
              }
            </div>

            <div class="text-end mt-4 pt-3 border-top">
              <button type="button" class="btn btn-secondary" (click)="viewOpen.set(false)"><i class="fas fa-times me-2"></i>Close</button>
              <button type="button" class="btn btn-warning" (click)="openEditModal(d['id'])"><i class="fas fa-edit me-2"></i>Edit</button>
              @if (d['assessmentStatus'] !== 'published') {
                <button type="button" class="btn btn-success" (click)="viewOpen.set(false); approveAssessment(d['id'])"><i class="fas fa-check me-2"></i>Approve</button>
              }
            </div>
          }
        </div>
      </div>
    </div>

    <!-- Version History Modal -->
    <div class="ra-modal-backdrop" [class.open]="historyOpen()" (click)="historyOpen.set(false)">
      <div class="ra-modal lg" (click)="$event.stopPropagation()">
        <div class="ra-modal-header">
          <h5><i class="fas fa-history me-2"></i>Version History</h5>
          <button class="ra-close" (click)="historyOpen.set(false)">&times;</button>
        </div>
        <div class="ra-modal-body">
          <div class="timeline">
            @if (detail()?.versionHistory?.length) {
              @for (v of detail()!.versionHistory; track $index) {
                <div class="timeline-item">
                  <div class="timeline-icon">v{{ v.version || $index + 1 }}</div>
                  <div class="card"><div class="card-body">
                    <h6 class="card-title">Version {{ v.version || $index + 1 }}</h6>
                    <p class="text-muted mb-2"><small><i class="fas fa-calendar me-1"></i>{{ v.created_at }}
                      @if (v.created_by) { <br><i class="fas fa-user me-1"></i>{{ v.created_by }} }</small></p>
                    <p class="card-text">{{ v.changes || 'No description provided' }}</p>
                  </div></div>
                </div>
              }
            } @else {
              <div class="alert alert-info"><i class="fas fa-info-circle me-2"></i>No version history available</div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class RiskAssessmentsComponent {
  private http = inject(HttpClient);

  rows = signal<AssessmentRow[]>([]);
  pagination = signal({ currentPage: 1, lastPage: 1, total: 0, firstItem: 0, lastItem: 0 });
  stats = signal({ total: 0, highRisk: 0, published: 0, pendingReview: 0 });
  search = signal('');
  riskFilter = signal('');
  statusFilter = signal('');
  planTypeFilter = signal('');
  openMenu = signal<number | null>(null);
  viewOpen = signal(false);
  viewTab = signal('details');
  historyOpen = signal(false);
  detail = signal<Detail | null>(null);

  private router = inject(Router);

  constructor() {
    this.load(1);
    ensureSweetAlert();
    const flash = history.state?.['success'];
    if (flash) {
      ensureSweetAlert().then(() => Swal.fire({ icon: 'success', title: 'Success', text: flash, timer: 2500, showConfirmButton: false }));
    }
  }

  load(page: number): void {
    this.http.get<IndexResponse>(`/api/v1/risk-assessments?page=${page}`).subscribe(r => {
      this.rows.set(r.riskAssessments);
      this.pagination.set(r.pagination);
      this.stats.set(r.stats);
    });
  }

  pageRange(): number[] {
    const p = this.pagination();
    const from = Math.max(1, p.currentPage - 2);
    const to = Math.min(p.lastPage, p.currentPage + 2);
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }

  limit(value: string, max: number): string {
    return value.length > max ? value.slice(0, max) + '...' : value;
  }

  ucfirst(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /** Source's $riskBadge match — note 'Very High' => badge-active (its quirky mapping). */
  riskBadge(level: string): string {
    switch (level) {
      case 'Low': return 'badge-published';
      case 'Medium': return 'badge-pending';
      case 'High': return 'badge-rejected';
      case 'Very High': return 'badge-active';
      case 'Critical': return 'badge-rejected';
      default: return 'badge-inactive';
    }
  }

  statusBadge(status: string): string {
    switch (status) {
      case 'draft': return 'badge-inactive';
      case 'under_review': return 'badge-pending';
      case 'approved': return 'badge-approved';
      case 'published': return 'badge-published';
      default: return 'badge-inactive';
    }
  }

  statusLabel(status: string): string {
    return this.ucfirst((status || '').replace(/_/g, ' '));
  }

  riskColor(level: string): string {
    const colors: Record<string, string> = { Low: 'success', Medium: 'warning', High: 'danger', 'Very High': 'dark', Critical: 'danger' };
    return colors[level] || 'secondary';
  }

  /** filterTable() matches on the row's whole text — same crude matching ("high" hits "Very High"). */
  rowVisible(a: AssessmentRow): boolean {
    const text = [a.priorityLevel, a.assessmentCode, a.assessmentTitle, a.planType ? a.planType + ' plan' : '',
      a.hazardName, a.locationName, a.districtCouncil, a.riskLevel, this.statusLabel(a.assessmentStatus),
      a.assessmentDate, a.assessmentDateRelative].join(' ').toLowerCase();
    if (this.search() && !text.includes(this.search().toLowerCase())) return false;
    if (this.riskFilter() && !text.includes(this.riskFilter().toLowerCase())) return false;
    if (this.statusFilter() && !text.includes(this.statusFilter().toLowerCase().replace(/_/g, ' '))) return false;
    if (this.planTypeFilter() && !text.includes(this.planTypeFilter().toLowerCase())) return false;
    return true;
  }

  toggleMenu(id: number, event: Event): void {
    event.stopPropagation();
    this.openMenu.update(c => (c === id ? null : id));
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.openMenu.set(null);
  }

  viewAssessment(id: number): void {
    ensureSweetAlert().then(() => {
      Swal.fire({ title: 'Loading...', text: 'Fetching assessment details', allowOutsideClick: false, showConfirmButton: false, willOpen: () => Swal.showLoading() });
      this.http.get<Detail>(`/api/v1/risk-assessments/${id}`).subscribe({
        next: d => {
          Swal.close();
          this.detail.set(d);
          this.viewTab.set('details');
          this.viewOpen.set(true);
        },
        error: () => Swal.fire({ icon: 'error', title: 'Oops...', text: 'Failed to load assessment details!' }),
      });
    });
  }

  viewVersionHistory(id: number): void {
    this.http.get<Detail>(`/api/v1/risk-assessments/${id}`).subscribe({
      next: d => {
        this.detail.set(d);
        this.historyOpen.set(true);
      },
      error: () => ensureSweetAlert().then(() => Swal.fire('Error', 'Failed to load version history', 'error')),
    });
  }

  deleteAssessment(id: number): void {
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Are you sure?', text: 'This risk assessment will be permanently deleted!', icon: 'warning',
        showCancelButton: true, confirmButtonText: 'Yes, delete it!', cancelButtonText: 'Cancel', reverseButtons: true,
      }).then((result: any) => {
        if (result.isConfirmed) {
          this.http.delete(`/api/v1/risk-assessments/${id}`).subscribe({
            next: () => this.load(this.pagination().currentPage),
            error: () => Swal.fire('Error', 'Failed to delete the assessment', 'error'),
          });
        }
      });
    });
  }

  approveAssessment(id: number): void {
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Approve Assessment?', text: 'You are about to approve this risk assessment.', icon: 'question',
        showCancelButton: true, confirmButtonText: 'Yes, approve it!', cancelButtonText: 'Cancel', reverseButtons: true,
      }).then((result: any) => {
        if (result.isConfirmed) {
          this.http.post(`/api/v1/risk-assessments/${id}/approve`, {}).subscribe({
            next: () => this.load(this.pagination().currentPage),
            error: () => Swal.fire('Error', 'Failed to approve the assessment', 'error'),
          });
        }
      });
    });
  }

  publishAssessment(id: number): void {
    ensureSweetAlert().then(() => {
      Swal.fire({
        title: 'Publish Assessment?', text: 'This will make the assessment publicly visible.', icon: 'info',
        showCancelButton: true, confirmButtonText: 'Yes, publish it!', cancelButtonText: 'Cancel', reverseButtons: true,
      }).then((result: any) => {
        if (result.isConfirmed) {
          this.http.post(`/api/v1/risk-assessments/${id}/publish`, {}).subscribe({
            next: () => this.load(this.pagination().currentPage),
            error: (err) => Swal.fire('Error', err.error?.detail || 'Failed to publish the assessment', 'error'),
          });
        }
      });
    });
  }

  /** Source broken modal deliberately FIXED: routes to the working standalone form. */
  openCreateModal(): void {
    this.router.navigate(['/m/prevention-mitigation/risk-assessments/create']);
  }

  /** Source broken modal deliberately FIXED: routes to the working edit form. */
  openEditModal(id: number): void {
    this.viewOpen.set(false);
    this.router.navigate(['/m/prevention-mitigation/risk-assessments', id, 'edit']);
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
