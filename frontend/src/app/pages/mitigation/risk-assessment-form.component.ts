import { HttpClient } from '@angular/common/http';
import { AfterViewInit, Component, ElementRef, OnDestroy, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { addMapNav } from '../../core/tz-map';

declare const L: any;
declare const Swal: any;

/**
 * The WORKING risk-assessment form — reproduction of the standalone create.blade.php (5 tabs,
 * Tanzania map picker, live risk calculator, Save-as-Draft / Submit-for-Review), dual-mode for
 * edit (the page no source UI linked to — deliberately fixed by wiring it everywhere).
 */
@Component({
  selector: 'page-risk-assessment-form',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RouterLink],
  styles: [`
    .nav-tabs .nav-link { font-weight: 600; color: var(--primary); border-radius: 0.5rem 0.5rem 0 0; cursor: pointer; }
    .lake-label { background: transparent !important; border: none !important; box-shadow: none !important; color: #1565C0; font-size: 0.5rem; font-weight: 600; font-style: italic; letter-spacing: 0.5px; text-shadow: 0 1px 2px rgba(255,255,255,0.8); }
    .region-tooltip { background: rgba(0,51,102,0.85); color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 0.7rem; font-weight: 600; }
  `],
  template: `
    <dmis-page-header [title]="pageTitle" icon="fa-plus"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Risk Assessments', url:'/m/prevention-mitigation/risk-assessments'}, {label: crumb}]">
      <a routerLink="/m/prevention-mitigation/risk-assessments" class="btn-add" style="background:var(--text-mid);">
        <i class="fas fa-arrow-left"></i> Back
      </a>
    </dmis-page-header>

    <div class="panel-row full" style="animation-delay:.15s;">
      <dmis-panel title="Risk Assessment Form" icon="fa-clipboard-list">
        <div class="panel-body">
          <form (submit)="$event.preventDefault()">
            <ul class="nav nav-tabs mb-4" style="border-bottom:2px solid var(--module-color, #003366);">
              <li class="nav-item"><a class="nav-link" [class.active]="tab() === 'basic'" (click)="setTab('basic')"><i class="fas fa-info-circle me-2"></i>Basic Information</a></li>
              <li class="nav-item"><a class="nav-link" [class.active]="tab() === 'risk'" (click)="setTab('risk')"><i class="fas fa-chart-line me-2"></i>Risk Analysis</a></li>
              <li class="nav-item"><a class="nav-link" [class.active]="tab() === 'actions'" (click)="setTab('actions')"><i class="fas fa-clipboard-list me-2"></i>Action Plans</a></li>
              <li class="nav-item"><a class="nav-link" [class.active]="tab() === 'knowledge'" (click)="setTab('knowledge')"><i class="fas fa-book me-2"></i>Knowledge Repository</a></li>
              <li class="nav-item"><a class="nav-link" [class.active]="tab() === 'media'" (click)="setTab('media')"><i class="fas fa-map-marked-alt me-2"></i>Media & Maps</a></li>
            </ul>

            <div [style.display]="tab() === 'basic' ? '' : 'none'">
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Title <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" [class.is-invalid]="errors()['assessmentTitle']" required
                         [value]="assessmentTitle()" (input)="assessmentTitle.set($any($event.target).value)">
                  @if (errors()['assessmentTitle']) { <div class="invalid-feedback">{{ errors()['assessmentTitle'] }}</div> }
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Assessment Code</label>
                  <input type="text" class="form-control" [value]="assessmentCode() || 'Auto-generated'" readonly>
                  <small class="text-muted">Code will be generated upon saving</small>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Hazard <span class="text-danger">*</span></label>
                  <select class="form-select" required [value]="hazardId()" (change)="hazardId.set($any($event.target).value)">
                    <option value="">Select Hazard</option>
                    @for (h of hazards(); track h.id) { <option [value]="h.id" [selected]="'' + h.id === hazardId()">{{ h.name }}</option> }
                  </select>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Location <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" required
                         [value]="locationName()" (input)="locationName.set($any($event.target).value)">
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Impact Description</label>
                  <textarea class="form-control" rows="4" [value]="impactDescription()" (input)="impactDescription.set($any($event.target).value)"></textarea>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Assessment Date <span class="text-danger">*</span></label>
                  <input type="date" class="form-control" required [value]="assessmentDate()" (input)="assessmentDate.set($any($event.target).value)">
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Review Date</label>
                  <input type="date" class="form-control" [value]="reviewDate()" (input)="reviewDate.set($any($event.target).value)">
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Author</label>
                  <input type="text" class="form-control" [value]="author()" (input)="author.set($any($event.target).value)">
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Visibility Level</label>
                  <select class="form-select" [value]="visibilityLevel()" (change)="visibilityLevel.set($any($event.target).value)">
                    <option value="internal" [selected]="visibilityLevel() === 'internal'">Internal</option>
                    <option value="restricted" [selected]="visibilityLevel() === 'restricted'">Restricted</option>
                    <option value="public" [selected]="visibilityLevel() === 'public'">Public</option>
                  </select>
                </div>
                @if (editId) {
                  <div class="col-md-6 mb-3">
                    <label class="form-label" style="font-weight:600;color:var(--primary);">Status</label>
                    <select class="form-select" [value]="assessmentStatus()" (change)="assessmentStatus.set($any($event.target).value)">
                      <option value="draft" [selected]="assessmentStatus() === 'draft'">Draft</option>
                      <option value="under_review" [selected]="assessmentStatus() === 'under_review'">Under Review</option>
                      <option value="approved" [selected]="assessmentStatus() === 'approved'">Approved</option>
                      <option value="published" [selected]="assessmentStatus() === 'published'">Published</option>
                    </select>
                  </div>
                }
              </div>
            </div>

            <div [style.display]="tab() === 'risk' ? '' : 'none'">
              <div class="row">
                <div class="col-md-4 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Likelihood <span class="text-danger">*</span></label>
                  <select class="form-select" required [value]="likelihood()" (change)="likelihood.set($any($event.target).value); calculateRiskLevel()">
                    <option value="">Select Likelihood</option>
                    @for (l of likelihoods; track l) { <option [value]="l" [selected]="likelihood() === l">{{ l }}</option> }
                  </select>
                </div>
                <div class="col-md-4 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Severity <span class="text-danger">*</span></label>
                  <select class="form-select" required [value]="severityOfImpact()" (change)="severityOfImpact.set($any($event.target).value); calculateRiskLevel()">
                    <option value="">Select Severity</option>
                    @for (sv of severities; track sv) { <option [value]="sv" [selected]="severityOfImpact() === sv">{{ sv }}</option> }
                  </select>
                </div>
                <div class="col-md-4 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Risk Level <span class="text-danger">*</span></label>
                  <select class="form-select" required [value]="riskLevel()" (change)="riskLevel.set($any($event.target).value)" [style.backgroundColor]="riskLevelBg()">
                    <option value="">Select Risk Level</option>
                    @for (rl of riskLevels; track rl) { <option [value]="rl" [selected]="riskLevel() === rl">{{ rl }}</option> }
                  </select>
                </div>
                <div class="col-md-4 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Priority Level</label>
                  <input type="number" class="form-control" min="1" max="10" [value]="priorityLevel()" (input)="priorityLevel.set($any($event.target).value)">
                </div>
                <div class="col-md-4 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Population at Risk</label>
                  <input type="number" class="form-control" min="0" [value]="populationAtRisk()" (input)="populationAtRisk.set($any($event.target).value)">
                </div>
                <div class="col-md-4 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Economic Impact (TZS)</label>
                  <input type="number" class="form-control" min="0" step="0.01" [value]="economicImpact()" (input)="economicImpact.set($any($event.target).value)">
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Vulnerable Groups</label>
                  <div class="row">
                    @for (g of vulnerableGroupOptions; track g.value) {
                      <div class="col-md-3">
                        <div class="form-check">
                          <input class="form-check-input" type="checkbox" [id]="'vg_' + g.value"
                                 [checked]="vulnerableGroups().includes(g.value)" (change)="toggleIn(vulnerableGroups, g.value)">
                          <label class="form-check-label" [for]="'vg_' + g.value">{{ g.label }}</label>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              </div>
            </div>

            <div [style.display]="tab() === 'actions' ? '' : 'none'">
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Plan Type</label>
                  <select class="form-select" [value]="planType()" (change)="planType.set($any($event.target).value)">
                    <option value="">Select Plan Type</option>
                    <option value="anticipatory" [selected]="planType() === 'anticipatory'">Anticipatory Action Plan</option>
                    <option value="contingency" [selected]="planType() === 'contingency'">Contingency Plan</option>
                  </select>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Timeframe</label>
                  <input type="text" class="form-control" placeholder="e.g., Seasonal, Yearly" [value]="timeframe()" (input)="timeframe.set($any($event.target).value)">
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Recommended Actions</label>
                  <textarea class="form-control" rows="4" [value]="recommendedActions()" (input)="recommendedActions.set($any($event.target).value)"></textarea>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Early Warning Systems</label>
                  <textarea class="form-control" rows="3" [value]="earlyWarningSystems()" (input)="earlyWarningSystems.set($any($event.target).value)"></textarea>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Evacuation Plan</label>
                  <textarea class="form-control" rows="3" [value]="evacuationPlan()" (input)="evacuationPlan.set($any($event.target).value)"></textarea>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Implementation Period</label>
                  <input type="text" class="form-control" [value]="implementationPeriod()" (input)="implementationPeriod.set($any($event.target).value)">
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Is Post-Disaster Evaluation?</label>
                  <select class="form-select" [value]="isPostDisaster()" (change)="isPostDisaster.set($any($event.target).value)">
                    <option value="0" [selected]="isPostDisaster() === '0'">No</option>
                    <option value="1" [selected]="isPostDisaster() === '1'">Yes</option>
                  </select>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Coverage Regions (for Contingency Plans)</label>
                  <input type="text" class="form-control" placeholder="Comma-separated regions" [value]="coverageRegions()" (input)="coverageRegions.set($any($event.target).value)">
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Sectors</label>
                  <input type="text" class="form-control" placeholder="e.g., Health, Education, Agriculture" [value]="sectors()" (input)="sectors.set($any($event.target).value)">
                </div>
              </div>
            </div>

            <div [style.display]="tab() === 'knowledge' ? '' : 'none'">
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Knowledge Type</label>
                  <select class="form-select" [value]="knowledgeType()" (change)="knowledgeType.set($any($event.target).value)">
                    <option value="">Select Type</option>
                    <option value="case_study" [selected]="knowledgeType() === 'case_study'">Case Study</option>
                    <option value="best_practice" [selected]="knowledgeType() === 'best_practice'">Best Practice</option>
                    <option value="lesson_learned" [selected]="knowledgeType() === 'lesson_learned'">Lesson Learned</option>
                    <option value="research_report" [selected]="knowledgeType() === 'research_report'">Research Report</option>
                    <option value="technical_guide" [selected]="knowledgeType() === 'technical_guide'">Technical Guide</option>
                  </select>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Target Audience</label>
                  <input type="text" class="form-control" placeholder="e.g., Community Leaders, NGOs" [value]="targetAudience()" (input)="targetAudience.set($any($event.target).value)">
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Narrative Description</label>
                  <textarea class="form-control" rows="4" [value]="narrativeDescription()" (input)="narrativeDescription.set($any($event.target).value)"></textarea>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Key Lessons</label>
                  <textarea class="form-control" rows="3" placeholder="Enter each lesson on a new line" [value]="keyLessons()" (input)="keyLessons.set($any($event.target).value)"></textarea>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Challenges Encountered</label>
                  <textarea class="form-control" rows="3" [value]="challengesEncountered()" (input)="challengesEncountered.set($any($event.target).value)"></textarea>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Success Factors</label>
                  <textarea class="form-control" rows="3" [value]="successFactors()" (input)="successFactors.set($any($event.target).value)"></textarea>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Recommendations</label>
                  <textarea class="form-control" rows="3" [value]="recommendations()" (input)="recommendations.set($any($event.target).value)"></textarea>
                </div>
              </div>
            </div>

            <div [style.display]="tab() === 'media' ? '' : 'none'">
              <div class="row">
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);"><i class="fas fa-map-marked-alt me-1"></i> Assessment Location</label>
                  <small class="text-muted d-block mb-2">Click on the map to set the assessment location. The Tanzania boundary is shown for reference.</small>
                  <div #mapPicker style="height:500px;border-radius:10px;border:2px solid rgba(0,0,0,0.06);z-index:1;"></div>
                  <div class="mt-2 d-flex gap-3">
                    <div><small class="text-muted">Latitude:</small> <span class="fw-semibold">{{ latitude() || '---' }}</span></div>
                    <div><small class="text-muted">Longitude:</small> <span class="fw-semibold">{{ longitude() || '---' }}</span></div>
                  </div>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Risk Maps</label>
                  <input type="file" class="form-control" multiple accept="image/*" (change)="riskMapFiles = $any($event.target).files">
                  <small class="text-muted">Upload risk map images (multiple allowed)</small>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Hazard Maps</label>
                  <input type="file" class="form-control" multiple accept="image/*" (change)="hazardMapFiles = $any($event.target).files">
                  <small class="text-muted">Upload hazard map images (multiple allowed)</small>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Media Files</label>
                  <input type="file" class="form-control" multiple (change)="mediaFiles = $any($event.target).files">
                  <small class="text-muted">Upload supporting documents, videos, or images</small>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Delivery Channels</label>
                  <div class="row">
                    @for (c of deliveryChannelOptions; track c) {
                      <div class="col-md-3">
                        <div class="form-check">
                          <input class="form-check-input" type="checkbox" [id]="'dc_' + c"
                                 [checked]="deliveryChannels().includes(c)" (change)="toggleIn(deliveryChannels, c)">
                          <label class="form-check-label" [for]="'dc_' + c">{{ ucfirst(c) }}</label>
                        </div>
                      </div>
                    }
                  </div>
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Category Tags</label>
                  <input type="text" class="form-control" placeholder="Comma-separated tags" [value]="categoryTags()" (input)="categoryTags.set($any($event.target).value)">
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Awareness Type</label>
                  <input type="text" class="form-control" placeholder="e.g., Community awareness, School programs" [value]="awarenessType()" (input)="awarenessType.set($any($event.target).value)">
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label" style="font-weight:600;color:var(--primary);">Education Planning</label>
                  <textarea class="form-control" rows="3" placeholder="Describe education and training plans" [value]="educationPlanning()" (input)="educationPlanning.set($any($event.target).value)"></textarea>
                </div>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1.5rem;padding-top:1rem;border-top:1px solid rgba(0,0,0,0.06);">
              <a routerLink="/m/prevention-mitigation/risk-assessments" class="btn-add" style="background:var(--text-mid);">
                <i class="fas fa-times"></i> Cancel
              </a>
              <div style="display:flex;gap:0.5rem;">
                @if (!editId) {
                  <button type="button" class="btn-add" style="background:#003366;" [disabled]="saving()" (click)="save('save_draft')">
                    <i class="fas fa-save"></i> Save as Draft
                  </button>
                  <button type="button" class="btn-add" [disabled]="saving()" (click)="save('submit')">
                    <i class="fas fa-paper-plane"></i> Submit for Review
                  </button>
                } @else {
                  <button type="button" class="btn-add" [disabled]="saving()" (click)="save('update')">
                    <i class="fas fa-save"></i> Update Assessment
                  </button>
                }
              </div>
            </div>
          </form>
        </div>
      </dmis-panel>
    </div>
  `,
})
export class RiskAssessmentFormComponent implements AfterViewInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);
  mapEl = viewChild<ElementRef>('mapPicker');

  editId: number | null = null;
  pageTitle = 'Create Risk Assessment';
  crumb = 'Create';

  likelihoods = ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost Certain'];
  severities = ['Insignificant', 'Minor', 'Moderate', 'Major', 'Catastrophic'];
  riskLevels = ['Low', 'Medium', 'High', 'Very High', 'Critical'];
  vulnerableGroupOptions = [
    { value: 'children', label: 'Children' }, { value: 'elderly', label: 'Elderly' },
    { value: 'disabled', label: 'Disabled' }, { value: 'pregnant', label: 'Pregnant Women' },
  ];
  deliveryChannelOptions = ['web', 'mobile', 'print', 'broadcast'];

  tab = signal('basic');
  hazards = signal<{ id: number; name: string }[]>([]);
  assessmentTitle = signal('');
  assessmentCode = signal('');
  hazardId = signal('');
  locationName = signal('');
  impactDescription = signal('');
  assessmentDate = signal(new Date().toISOString().slice(0, 10));
  reviewDate = signal('');
  author = signal('');
  visibilityLevel = signal('internal');
  assessmentStatus = signal('draft');
  likelihood = signal('');
  severityOfImpact = signal('');
  riskLevel = signal('');
  priorityLevel = signal('1');
  populationAtRisk = signal('');
  economicImpact = signal('');
  vulnerableGroups = signal<string[]>([]);
  planType = signal('');
  timeframe = signal('');
  recommendedActions = signal('');
  earlyWarningSystems = signal('');
  evacuationPlan = signal('');
  implementationPeriod = signal('');
  isPostDisaster = signal('0');
  coverageRegions = signal('');
  sectors = signal('');
  knowledgeType = signal('');
  targetAudience = signal('');
  narrativeDescription = signal('');
  keyLessons = signal('');
  challengesEncountered = signal('');
  successFactors = signal('');
  recommendations = signal('');
  categoryTags = signal('');
  awarenessType = signal('');
  educationPlanning = signal('');
  deliveryChannels = signal<string[]>([]);
  latitude = signal('');
  longitude = signal('');
  saving = signal(false);
  errors = signal<Record<string, string>>({});

  riskMapFiles: FileList | null = null;
  hazardMapFiles: FileList | null = null;
  mediaFiles: FileList | null = null;

  private map: any;
  private marker: any;
  private viewReady = false;

  constructor(route: ActivatedRoute) {
    this.http.get<{ hazards: { id: number; name: string }[] }>('/api/v1/risk-assessments?page=1')
      .subscribe(r => this.hazards.set(r.hazards));
    const id = route.snapshot.paramMap.get('id');
    if (id) {
      this.editId = Number(id);
      this.pageTitle = 'Edit Risk Assessment';
      this.crumb = 'Edit';
      this.http.get<any>(`/api/v1/risk-assessments/${id}`).subscribe(d => {
        this.assessmentTitle.set(d.assessmentTitle ?? '');
        this.assessmentCode.set(d.assessmentCode ?? '');
        this.hazardId.set(d.hazardId != null ? '' + d.hazardId : '');
        this.locationName.set(d.locationName ?? '');
        this.impactDescription.set(d.impactDescription ?? '');
        this.assessmentDate.set(d.assessmentDate ?? '');
        this.reviewDate.set(d.reviewDate ?? '');
        this.author.set(d.author ?? '');
        this.visibilityLevel.set(d.visibilityLevel ?? 'internal');
        this.assessmentStatus.set(d.assessmentStatus ?? 'draft');
        this.likelihood.set(d.likelihood ?? '');
        this.severityOfImpact.set(d.severityOfImpact ?? '');
        this.riskLevel.set(d.riskLevel ?? '');
        this.priorityLevel.set(d.priorityLevel != null ? '' + d.priorityLevel : '');
        this.populationAtRisk.set(d.populationAtRisk != null ? '' + d.populationAtRisk : '');
        this.economicImpact.set(d.economicImpact != null ? '' + d.economicImpact : '');
        this.vulnerableGroups.set(d.vulnerableGroups ?? []);
        this.planType.set(d.planType ?? '');
        this.timeframe.set(d.timeframe ?? '');
        this.recommendedActions.set(d.recommendedActions ?? '');
        this.earlyWarningSystems.set(d.earlyWarningSystems ?? '');
        this.evacuationPlan.set(d.evacuationPlan ?? '');
        this.implementationPeriod.set(d.implementationPeriod ?? '');
        this.isPostDisaster.set(d.isPostDisaster ? '1' : '0');
        this.coverageRegions.set((d.coverageRegions ?? []).join(', '));
        this.sectors.set((d.sectors ?? []).join(', '));
        this.knowledgeType.set(d.knowledgeType ?? '');
        this.targetAudience.set(d.targetAudience ?? '');
        this.narrativeDescription.set(d.narrativeDescription ?? '');
        this.keyLessons.set((d.keyLessons ?? []).join('\n'));
        this.challengesEncountered.set(d.challengesEncountered ?? '');
        this.successFactors.set(d.successFactors ?? '');
        this.recommendations.set(d.recommendations ?? '');
        this.categoryTags.set((d.categoryTags ?? []).join(', '));
        this.awarenessType.set(d.awarenessType ?? '');
        this.educationPlanning.set('');
        this.deliveryChannels.set(d.deliveryChannels ?? []);
        this.latitude.set(d.latitude != null ? '' + d.latitude : '');
        this.longitude.set(d.longitude != null ? '' + d.longitude : '');
      });
    }
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }

  setTab(tab: string): void {
    this.tab.set(tab);
    if (tab === 'media') {
      setTimeout(() => this.initMap(), 100);
    }
  }

  toggleIn(list: ReturnType<typeof signal<string[]>>, value: string): void {
    list.update(items => items.includes(value) ? items.filter(v => v !== value) : [...items, value]);
  }

  ucfirst(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /** calculateRiskLevel() from create.blade.php, verbatim scoring. */
  calculateRiskLevel(): void {
    const likelihoodScores: Record<string, number> = { Rare: 1, Unlikely: 2, Possible: 3, Likely: 4, 'Almost Certain': 5 };
    const severityScores: Record<string, number> = { Insignificant: 1, Minor: 2, Moderate: 3, Major: 4, Catastrophic: 5 };
    if (this.likelihood() && this.severityOfImpact()) {
      const score = (likelihoodScores[this.likelihood()] || 1) * (severityScores[this.severityOfImpact()] || 1);
      const level = score <= 4 ? 'Low' : score <= 9 ? 'Medium' : score <= 14 ? 'High' : score <= 19 ? 'Very High' : 'Critical';
      this.riskLevel.set(level);
    }
  }

  riskLevelBg(): string {
    const colors: Record<string, string> = { Low: '#28a745', Medium: '#ffc107', High: '#fd7e14', 'Very High': '#dc3545', Critical: '#dc3545' };
    const color = colors[this.riskLevel()];
    return color ? color + '20' : '';
  }

  /** The create page's Tanzania-bounded picker with adm0/lakes/adm1 layers + draggable marker. */
  private initMap(): void {
    const el = this.mapEl()?.nativeElement;
    if (!el || this.map || typeof L === 'undefined' || !this.viewReady) {
      if (this.map) {
        setTimeout(() => this.map.invalidateSize(), 100);
      }
      return;
    }
    this.map = L.map(el, { maxBounds: [[-12.0, 29.0], [-0.8, 41.0]], maxBoundsViscosity: 1.0, maxZoom: 14 }).setView([-6.37, 34.89], 6);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 18 }).addTo(this.map);
    addMapNav(this.map, { home: [-6.37, 34.89, 6] });
    fetch('/geojson/adm0_national/adm0.geojson').then(r => r.json())
      .then(data => L.geoJSON(data, { style: { color: '#003366', weight: 2, fillColor: '#003366', fillOpacity: 0.05 } }).addTo(this.map)).catch(() => {});
    fetch('/geojson/tz_lakes.geojson').then(r => r.json())
      .then(data => L.geoJSON(data, {
        style: () => ({ fillColor: '#1976D2', fillOpacity: 0.35, color: '#42A5F5', weight: 1, opacity: 0.7 }),
        onEachFeature: (f: any, layer: any) => {
          const name = f.properties.name || '';
          if (name) layer.bindTooltip(name, { permanent: true, direction: 'center', className: 'lake-label', offset: [0, 0] });
        },
      }).addTo(this.map)).catch(() => {});
    fetch('/geojson/adm1_region/adm1.geojson').then(r => r.json())
      .then(data => L.geoJSON(data, {
        style: () => ({ fillColor: '#003366', fillOpacity: 0.02, color: '#003366', weight: 0.8, opacity: 0.3 }),
        onEachFeature: (f: any, layer: any) => {
          const rn = f.properties.reg_name || f.properties.ADM1_EN || 'Region';
          layer.bindTooltip(rn, { className: 'region-tooltip', sticky: true });
          layer.on('mouseover', () => layer.setStyle({ fillOpacity: 0.1, weight: 1.5 }));
          layer.on('mouseout', () => layer.setStyle({ fillOpacity: 0.02, weight: 0.8 }));
        },
      }).addTo(this.map)).catch(() => {});
    this.map.on('click', (e: any) => this.placeMarker(e.latlng.lat, e.latlng.lng));
    const lat = parseFloat(this.latitude());
    const lon = parseFloat(this.longitude());
    if (!isNaN(lat) && !isNaN(lon)) {
      this.placeMarker(lat, lon);
      this.map.setView([lat, lon], 10);
    }
    setTimeout(() => this.map.invalidateSize(), 100);
  }

  private placeMarker(lat: number, lng: number): void {
    if (this.marker) {
      this.marker.setLatLng([lat, lng]);
    } else {
      this.marker = L.marker([lat, lng], { draggable: true }).addTo(this.map);
      this.marker.on('dragend', (e: any) => {
        const pos = e.target.getLatLng();
        this.latitude.set(pos.lat.toFixed(6));
        this.longitude.set(pos.lng.toFixed(6));
      });
    }
    this.latitude.set(lat.toFixed(6));
    this.longitude.set(lng.toFixed(6));
  }

  save(action: string): void {
    if (action === 'submit') {
      const missing = !this.assessmentTitle() || !this.hazardId() || !this.locationName()
        || !this.likelihood() || !this.severityOfImpact() || !this.riskLevel() || !this.assessmentDate();
      if (missing) {
        ensureSweetAlert().then(() => Swal.fire({
          icon: 'warning', title: 'Incomplete Form',
          text: 'Please fill in all required fields before submitting.', confirmButtonColor: '#003366',
        }));
        return;
      }
    }
    this.saving.set(true);
    this.errors.set({});
    const form = new FormData();
    const set = (k: string, v: string) => { if (v) form.set(k, v); };
    set('assessmentTitle', this.assessmentTitle());
    set('hazardId', this.hazardId());
    set('locationName', this.locationName());
    set('impactDescription', this.impactDescription());
    set('assessmentDate', this.assessmentDate());
    set('reviewDate', this.reviewDate());
    set('author', this.author());
    set('visibilityLevel', this.visibilityLevel());
    set('likelihood', this.likelihood());
    set('severityOfImpact', this.severityOfImpact());
    set('riskLevel', this.riskLevel());
    set('priorityLevel', this.priorityLevel());
    set('populationAtRisk', this.populationAtRisk());
    set('economicImpact', this.economicImpact());
    this.vulnerableGroups().forEach(v => form.append('vulnerableGroups', v));
    set('planType', this.planType());
    set('timeframe', this.timeframe());
    set('recommendedActions', this.recommendedActions());
    set('earlyWarningSystems', this.earlyWarningSystems());
    set('evacuationPlan', this.evacuationPlan());
    set('implementationPeriod', this.implementationPeriod());
    form.set('isPostDisaster', this.isPostDisaster() === '1' ? 'true' : 'false');
    set('coverageRegions', this.coverageRegions());
    set('sectors', this.sectors());
    set('knowledgeType', this.knowledgeType());
    set('targetAudience', this.targetAudience());
    set('narrativeDescription', this.narrativeDescription());
    set('keyLessons', this.keyLessons());
    set('challengesEncountered', this.challengesEncountered());
    set('successFactors', this.successFactors());
    set('recommendations', this.recommendations());
    set('categoryTags', this.categoryTags());
    set('awarenessType', this.awarenessType());
    set('educationPlanning', this.educationPlanning());
    this.deliveryChannels().forEach(c => form.append('deliveryChannels', c));
    set('latitude', this.latitude());
    set('longitude', this.longitude());
    if (action !== 'update') {
      form.set('action', action);
    } else {
      set('assessmentStatus', this.assessmentStatus());
    }
    const appendFiles = (key: string, files: FileList | null) => {
      if (files) {
        Array.from(files).forEach(f => form.append(key, f));
      }
    };
    appendFiles('riskMaps', this.riskMapFiles);
    appendFiles('hazardMaps', this.hazardMapFiles);
    appendFiles('mediaFiles', this.mediaFiles);

    const request = this.editId
      ? this.http.put(`/api/v1/risk-assessments/${this.editId}`, form)
      : this.http.post('/api/v1/risk-assessments', form);
    request.subscribe({
      next: (d: any) => this.router.navigate(['/m/prevention-mitigation/risk-assessments'], {
        state: { success: this.editId ? 'Risk Assessment updated successfully.'
            : 'Risk Assessment created successfully with code: ' + d.assessmentCode },
      }),
      error: err => {
        this.saving.set(false);
        const detail = err.error?.detail || 'Failed to save the assessment.';
        this.errors.set({ assessmentTitle: detail });
        ensureSweetAlert().then(() => Swal.fire({ icon: 'error', title: 'Error', text: detail, confirmButtonColor: '#003366' }));
      },
    });
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
