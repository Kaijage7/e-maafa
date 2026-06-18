import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

/**
 * The WORKING mitigation-measure form — the SRS field set measuresStore validates. The source has
 * no working create UI (deliberately fixed here); this page implements the intended flow.
 */
@Component({
  selector: 'page-measure-create',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RouterLink],
  template: `
    <dmis-page-header [title]="pageTitle" icon="fa-shield-virus"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Prevention & Mitigation', url:'/m/prevention-mitigation/dashboard'}, {label:'Mitigation Measures', url:'/m/prevention-mitigation/measures'}, {label: crumb}]">
      <a routerLink="/m/prevention-mitigation/measures" class="btn-add" style="background:var(--text-mid);">
        <i class="fas fa-arrow-left"></i> Back to List
      </a>
    </dmis-page-header>

    <form (submit)="submit($event)">
      <div class="panel-row" style="animation-delay:.15s;">
        <dmis-panel title="Project Information" icon="fa-info-circle">
          <div class="panel-body">
            <div class="mb-3">
              <label class="form-label">Project/Programme Name <span class="text-danger">*</span></label>
              <input type="text" class="form-control" [class.is-invalid]="errors()['projectProgrammeName']" required
                     [value]="projectProgrammeName()" (input)="projectProgrammeName.set($any($event.target).value)">
              @if (errors()['projectProgrammeName']) { <div class="invalid-feedback">{{ errors()['projectProgrammeName'] }}</div> }
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Implementing Entity <span class="text-danger">*</span></label>
                <select class="form-select" required [value]="implementingEntity()" (change)="implementingEntity.set($any($event.target).value)">
                  <option value="">Select...</option>
                  <option value="Government" [selected]="implementingEntity() === 'Government'">Government</option>
                  <option value="Non-Government" [selected]="implementingEntity() === 'Non-Government'">Non-Government</option>
                </select>
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Implementing Institution <span class="text-danger">*</span></label>
                <input type="text" class="form-control" required
                       [value]="implementingInstitution()" (input)="implementingInstitution.set($any($event.target).value)">
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label">Hazard/Risk Addressed <span class="text-danger">*</span></label>
              <input type="text" class="form-control" required placeholder="e.g. Floods"
                     [value]="hazardRiskAddressed()" (input)="hazardRiskAddressed.set($any($event.target).value)">
            </div>
            <div class="row">
              <div class="col-md-6 mb-3">
                <label class="form-label">Implementation Period Start <span class="text-danger">*</span></label>
                <input type="date" class="form-control" required
                       [value]="implementationPeriodStart()" (input)="implementationPeriodStart.set($any($event.target).value)">
              </div>
              <div class="col-md-6 mb-3">
                <label class="form-label">Implementation Period End <span class="text-danger">*</span></label>
                <input type="date" class="form-control" [class.is-invalid]="errors()['implementationPeriodEnd']" required
                       [value]="implementationPeriodEnd()" (input)="implementationPeriodEnd.set($any($event.target).value)">
                @if (errors()['implementationPeriodEnd']) { <div class="invalid-feedback">{{ errors()['implementationPeriodEnd'] }}</div> }
              </div>
            </div>
            <div class="row">
              <div class="col-md-4 mb-3">
                <label class="form-label">Project Status <span class="text-danger">*</span></label>
                <select class="form-select" required [value]="projectStatus()" (change)="projectStatus.set($any($event.target).value)">
                  <option value="">Select...</option>
                  <option value="Ongoing" [selected]="projectStatus() === 'Ongoing'">Ongoing</option>
                  <option value="Not started" [selected]="projectStatus() === 'Not started'">Not started</option>
                  <option value="Completed" [selected]="projectStatus() === 'Completed'">Completed</option>
                  <option value="Design" [selected]="projectStatus() === 'Design'">Design</option>
                </select>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Type of Mitigation <span class="text-danger">*</span></label>
                <select class="form-select" required [value]="typeOfMitigation()" (change)="typeOfMitigation.set($any($event.target).value)">
                  <option value="">Select...</option>
                  <option value="structural" [selected]="typeOfMitigation() === 'structural'">Structural</option>
                  <option value="non_structural" [selected]="typeOfMitigation() === 'non_structural'">Non-structural</option>
                </select>
              </div>
              <div class="col-md-4 mb-3">
                <label class="form-label">Priority <span class="text-danger">*</span></label>
                <select class="form-select" required [value]="priority()" (change)="priority.set($any($event.target).value)">
                  <option value="">Select...</option>
                  <option value="low" [selected]="priority() === 'low'">Low</option>
                  <option value="medium" [selected]="priority() === 'medium'">Medium</option>
                  <option value="high" [selected]="priority() === 'high'">High</option>
                </select>
              </div>
            </div>
            <div class="mb-3">
              <label class="form-label">Project Coverage <span class="text-danger">*</span></label>
              <div class="row">
                @for (scope of coverageScopes; track scope) {
                  <div class="col-md-3">
                    <div class="form-check">
                      <input class="form-check-input" type="checkbox" [id]="'cov_' + scope"
                             [checked]="projectCoverage().includes(scope)" (change)="toggleCoverage(scope)">
                      <label class="form-check-label" [for]="'cov_' + scope">{{ scope }}</label>
                    </div>
                  </div>
                }
              </div>
              @if (errors()['projectCoverage']) { <div class="text-danger" style="font-size:0.78rem;">{{ errors()['projectCoverage'] }}</div> }
            </div>
          </div>
        </dmis-panel>

        <dmis-panel title="Coverage & Impact" icon="fa-bullseye">
          <div class="panel-body">
            <div class="mb-3">
              <label class="form-label">Narrative Description <span class="text-danger">*</span></label>
              <textarea class="form-control" rows="3" required
                        [value]="narrativeDescription()" (input)="narrativeDescription.set($any($event.target).value)"></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Project Beneficiaries <span class="text-danger">*</span></label>
              <textarea class="form-control" rows="2" required
                        [value]="projectBeneficiaries()" (input)="projectBeneficiaries.set($any($event.target).value)"></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Project Activities <span class="text-danger">*</span></label>
              <textarea class="form-control" rows="2" required
                        [value]="projectActivities()" (input)="projectActivities.set($any($event.target).value)"></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Expected Outcome <span class="text-danger">*</span></label>
              <textarea class="form-control" rows="2" required
                        [value]="expectedOutcome()" (input)="expectedOutcome.set($any($event.target).value)"></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Associated Partners</label>
              <input type="text" class="form-control" placeholder="Comma-separated partners"
                     [value]="associatedPartners()" (input)="associatedPartners.set($any($event.target).value)">
            </div>
            <div class="mb-3">
              <label class="form-label">Resources Allocated</label>
              <input type="text" class="form-control"
                     [value]="resourcesAllocated()" (input)="resourcesAllocated.set($any($event.target).value)">
            </div>
            <div class="mb-3">
              <label class="form-label">Additional Support Required</label>
              <textarea class="form-control" rows="2"
                        [value]="additionalSupportRequired()" (input)="additionalSupportRequired.set($any($event.target).value)"></textarea>
            </div>
            <div class="mb-3">
              <label class="form-label">Challenges/Barriers/Needs</label>
              <textarea class="form-control" rows="2"
                        [value]="challengesBarriersNeeds()" (input)="challengesBarriersNeeds.set($any($event.target).value)"></textarea>
            </div>
          </div>
        </dmis-panel>
      </div>

      <div class="panel-row full">
        <div style="display:flex;justify-content:flex-end;gap:0.75rem;padding:1rem 0;">
          <a routerLink="/m/prevention-mitigation/measures" class="btn-add" style="background:var(--text-mid);">
            <i class="fas fa-times"></i> Cancel
          </a>
          <button type="submit" class="btn-add" [disabled]="saving()"><i class="fas fa-save"></i> {{ submitLabel }}</button>
        </div>
      </div>
    </form>
  `,
})
export class MeasureCreateComponent {
  protected http = inject(HttpClient);
  protected router = inject(Router);
  private editId: number | null = null;

  pageTitle = 'Add New Mitigation Measure';
  crumb = 'Add New';
  submitLabel = 'Create Mitigation Measure';

  constructor(route: ActivatedRoute) {
    const id = route.snapshot.paramMap.get('id');
    if (id) {
      this.editId = Number(id);
      this.pageTitle = 'Edit Mitigation Measure';
      this.crumb = 'Edit';
      this.submitLabel = 'Update Mitigation Measure';
      this.http.get<any>(`/api/v1/mitigation-measures/${id}`).subscribe(d => {
        this.projectProgrammeName.set(d.projectProgrammeName ?? '');
        this.implementingEntity.set(d.implementingEntity ?? '');
        this.implementingInstitution.set(d.implementingInstitution ?? '');
        this.hazardRiskAddressed.set(d.hazardRiskAddressed ?? '');
        this.implementationPeriodStart.set(d.implementationPeriodStart ?? '');
        this.implementationPeriodEnd.set(d.implementationPeriodEnd ?? '');
        this.projectStatus.set(d.projectStatus ?? '');
        this.typeOfMitigation.set(d.typeOfMitigation ?? '');
        this.priority.set(d.priority ?? '');
        this.narrativeDescription.set(d.narrativeDescription ?? '');
        this.projectCoverage.set(d.projectCoverage ?? []);
        this.projectBeneficiaries.set(d.projectBeneficiaries ?? '');
        this.projectActivities.set(d.projectActivities ?? '');
        this.expectedOutcome.set(d.expectedOutcome ?? '');
        this.associatedPartners.set((d.associatedPartners ?? []).join(', '));
        this.resourcesAllocated.set(d.resourcesAllocated ?? '');
        this.additionalSupportRequired.set(d.additionalSupportRequired ?? '');
        this.challengesBarriersNeeds.set(d.challengesBarriersNeeds ?? '');
      });
    }
  }

  /** MitigationMeasure::COVERAGE_SCOPES. */
  coverageScopes = ['Region', 'District', 'Ward', 'Village/Street'];

  projectProgrammeName = signal('');
  implementingEntity = signal('');
  implementingInstitution = signal('');
  hazardRiskAddressed = signal('');
  implementationPeriodStart = signal('');
  implementationPeriodEnd = signal('');
  projectStatus = signal('');
  typeOfMitigation = signal('');
  priority = signal('');
  narrativeDescription = signal('');
  projectCoverage = signal<string[]>([]);
  projectBeneficiaries = signal('');
  projectActivities = signal('');
  expectedOutcome = signal('');
  associatedPartners = signal('');
  resourcesAllocated = signal('');
  additionalSupportRequired = signal('');
  challengesBarriersNeeds = signal('');
  saving = signal(false);
  errors = signal<Record<string, string>>({});

  toggleCoverage(scope: string): void {
    this.projectCoverage.update(list =>
      list.includes(scope) ? list.filter(s => s !== scope) : [...list, scope]);
  }

  payload(): object {
    return {
      projectProgrammeName: this.projectProgrammeName(),
      implementingEntity: this.implementingEntity(),
      implementingInstitution: this.implementingInstitution(),
      hazardRiskAddressed: this.hazardRiskAddressed(),
      implementationPeriodStart: this.implementationPeriodStart() || null,
      implementationPeriodEnd: this.implementationPeriodEnd() || null,
      projectStatus: this.projectStatus(),
      typeOfMitigation: this.typeOfMitigation(),
      priority: this.priority(),
      narrativeDescription: this.narrativeDescription(),
      projectCoverage: this.projectCoverage(),
      projectBeneficiaries: this.projectBeneficiaries(),
      projectActivities: this.projectActivities(),
      expectedOutcome: this.expectedOutcome(),
      associatedPartners: this.associatedPartners()
        ? this.associatedPartners().split(',').map(s => s.trim()).filter(Boolean) : null,
      resourcesAllocated: this.resourcesAllocated() || null,
      additionalSupportRequired: this.additionalSupportRequired() || null,
      challengesBarriersNeeds: this.challengesBarriersNeeds() || null,
    };
  }

  handleError(err: any, fallback: string): void {
    this.saving.set(false);
    if (err.status === 422) {
      const detail: string = err.error?.detail || fallback;
      this.errors.set(detail.includes('period') ? { implementationPeriodEnd: detail }
        : detail.includes('coverage') ? { projectCoverage: detail }
        : { projectProgrammeName: detail });
    } else {
      this.errors.set(err.error?.errors || { projectProgrammeName: fallback });
    }
  }

  submit(event: Event): void {
    event.preventDefault();
    this.saving.set(true);
    this.errors.set({});
    if (!this.projectCoverage().length) {
      this.saving.set(false);
      this.errors.set({ projectCoverage: 'The project coverage field is required.' });
      return;
    }
    const request = this.editId
      ? this.http.put(`/api/v1/mitigation-measures/${this.editId}`, this.payload())
      : this.http.post('/api/v1/mitigation-measures', this.payload());
    const flash = this.editId ? 'Mitigation Measure updated successfully.' : 'Mitigation Measure created successfully.';
    request.subscribe({
      next: () => this.router.navigate(['/m/prevention-mitigation/measures'], { state: { success: flash } }),
      error: err => this.handleError(err, 'Failed to save mitigation measure.'),
    });
  }
}
