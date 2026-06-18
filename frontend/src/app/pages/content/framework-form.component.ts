import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

/**
 * The WORKING framework form — frameworkStore/frameworkUpdate's exact rule set, organised as the
 * blueprint's 3-section wizard (Document Information / Hazards & Scope / Attachments) with
 * Save-as-Draft (relaxed requireds) and the ≥1 hazard rule on full save. The source v2 family has
 * no create UI at all, deliberately fixed here. Dual-mode create/edit by route param.
 */
@Component({
  selector: 'page-framework-form',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RouterLink],
  styles: [`
    .nav-tabs .nav-link { font-weight: 600; color: var(--primary); border-radius: 0.5rem 0.5rem 0 0; cursor: pointer; }
  `],
  template: `
    <dmis-page-header [title]="pageTitle" icon="fa-file-contract"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Content Management'}, {label:'Risk Frameworks', url:'/m/content-management/frameworks'}, {label: crumb}]">
      <a routerLink="/m/content-management/frameworks" class="btn-add" style="background:var(--text-mid);">
        <i class="fas fa-arrow-left"></i> Back to List
      </a>
    </dmis-page-header>

    <div class="panel-row full" style="animation-delay:.15s;">
      <dmis-panel title="Disaster Risk Framework" icon="fa-file-contract">
        <div class="panel-body">
          <form (submit)="$event.preventDefault()">
            <ul class="nav nav-tabs mb-4" style="border-bottom:2px solid var(--module-color, #e83e8c);">
              <li class="nav-item"><a class="nav-link" [class.active]="tab() === 'info'" (click)="tab.set('info')"><i class="fas fa-info-circle me-2"></i>Document Information</a></li>
              <li class="nav-item"><a class="nav-link" [class.active]="tab() === 'hazards'" (click)="tab.set('hazards')"><i class="fas fa-exclamation-triangle me-2"></i>Hazards & Scope</a></li>
              <li class="nav-item"><a class="nav-link" [class.active]="tab() === 'attachments'" (click)="tab.set('attachments')"><i class="fas fa-paperclip me-2"></i>Attachments</a></li>
            </ul>

            <div [style.display]="tab() === 'info' ? '' : 'none'">
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Document Type <span class="text-danger">*</span></label>
                  <select class="form-select" [class.is-invalid]="errors()['documentType']" required
                          [value]="documentType()" (change)="documentType.set($any($event.target).value)">
                    <option value="">Select Type</option>
                    @for (t of documentTypes; track t) { <option [value]="t" [selected]="documentType() === t">{{ t }}</option> }
                  </select>
                  @if (errors()['documentType']) { <div class="invalid-feedback">{{ errors()['documentType'] }}</div> }
                </div>
                @if (documentType() === 'Other') {
                  <div class="col-md-6 mb-3">
                    <label class="form-label">Specify Other Type</label>
                    <input type="text" class="form-control" [value]="documentTypeOther()" (input)="documentTypeOther.set($any($event.target).value)">
                  </div>
                }
                <div class="col-md-6 mb-3">
                  <label class="form-label">Language Edition <span class="text-danger">*</span></label>
                  <select class="form-select" [value]="language()" (change)="language.set($any($event.target).value)">
                    <option value="en" [selected]="language() === 'en'">English</option>
                    <option value="sw" [selected]="language() === 'sw'">Kiswahili</option>
                  </select>
                  <small class="text-muted">Swahili editions are separate library entries (e.g. Mkakati wa Taifa)</small>
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Year of Approval <span class="text-danger">*</span></label>
                  <input type="number" min="1900" [max]="currentYear" class="form-control" [class.is-invalid]="errors()['yearOfApproval']" required
                         [value]="yearOfApproval()" (input)="yearOfApproval.set($any($event.target).value)">
                  @if (errors()['yearOfApproval']) { <div class="invalid-feedback">{{ errors()['yearOfApproval'] }}</div> }
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label">Document Name <span class="text-danger">*</span></label>
                  <input type="text" class="form-control" [class.is-invalid]="errors()['documentName']" required
                         [value]="documentName()" (input)="documentName.set($any($event.target).value)">
                  @if (errors()['documentName']) { <div class="invalid-feedback">{{ errors()['documentName'] }}</div> }
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label">Narrative Description <span class="text-danger">*</span> <small class="text-muted">(max 150 characters)</small></label>
                  <textarea class="form-control" rows="3" maxlength="150" [class.is-invalid]="errors()['narrativeDescription']"
                            [value]="narrativeDescription()" (input)="narrativeDescription.set($any($event.target).value)"></textarea>
                  <small class="text-muted">{{ narrativeDescription().length }}/150</small>
                  @if (errors()['narrativeDescription']) { <div class="invalid-feedback">{{ errors()['narrativeDescription'] }}</div> }
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Implementation Period Start</label>
                  <input type="date" class="form-control" [value]="implementationPeriodStart()" (input)="implementationPeriodStart.set($any($event.target).value)">
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Implementation Period End</label>
                  <input type="date" class="form-control" [class.is-invalid]="errors()['implementationPeriodEnd']"
                         [value]="implementationPeriodEnd()" (input)="implementationPeriodEnd.set($any($event.target).value)">
                  @if (errors()['implementationPeriodEnd']) { <div class="invalid-feedback">{{ errors()['implementationPeriodEnd'] }}</div> }
                </div>
              </div>
            </div>

            <div [style.display]="tab() === 'hazards' ? '' : 'none'">
              <div class="mb-3">
                <label class="form-label">Hazard Types <span class="text-danger">*</span> <small class="text-muted">(at least one required)</small></label>
                <div class="row">
                  @for (ht of hazardTypeOptions; track ht) {
                    <div class="col-md-4">
                      <div class="form-check">
                        <input class="form-check-input" type="checkbox" [id]="'ht_' + ht"
                               [checked]="hazardTypes().includes(ht)" (change)="toggleHazard(ht)">
                        <label class="form-check-label" [for]="'ht_' + ht">{{ ht }}</label>
                      </div>
                    </div>
                  }
                </div>
                @if (errors()['hazardTypes']) { <div class="text-danger" style="font-size:0.78rem;">{{ errors()['hazardTypes'] }}</div> }
              </div>
              <div class="row">
                <div class="col-md-6 mb-3">
                  <label class="form-label">Geographic Scope <span class="text-danger">*</span></label>
                  <select class="form-select" [class.is-invalid]="errors()['geographicScope']"
                          [value]="geographicScope()" (change)="geographicScope.set($any($event.target).value)">
                    <option value="">Select Scope</option>
                    @for (s of scopeOptions; track s) { <option [value]="s" [selected]="geographicScope() === s">{{ s }}</option> }
                  </select>
                  @if (errors()['geographicScope']) { <div class="invalid-feedback">{{ errors()['geographicScope'] }}</div> }
                </div>
                <div class="col-md-6 mb-3">
                  <label class="form-label">Sectors Covered</label>
                  <input type="text" class="form-control" placeholder="e.g., Health, Agriculture"
                         [value]="sectorsCovered()" (input)="sectorsCovered.set($any($event.target).value)">
                </div>
                <div class="col-12 mb-3">
                  <label class="form-label">Key Stakeholders</label>
                  <textarea class="form-control" rows="2" [value]="keyStakeholders()" (input)="keyStakeholders.set($any($event.target).value)"></textarea>
                </div>
              </div>
            </div>

            <div [style.display]="tab() === 'attachments' ? '' : 'none'">
              <div class="mb-3">
                <label class="form-label">Attachment</label>
                <input type="file" class="form-control" accept=".pdf,.doc,.docx" [class.is-invalid]="errors()['attachment']"
                       (change)="file = $any($event.target).files?.[0] || null">
                <small class="text-muted">Allowed types: PDF, DOC, DOCX. Max size: 10MB.</small>
                @if (errors()['attachment']) { <div class="invalid-feedback">{{ errors()['attachment'] }}</div> }
              </div>
              @if (attachmentPath()) {
                <div class="mb-3">
                  <p>Current Attachment: <a [href]="'/api/storage/' + attachmentPath()" target="_blank"><i class="fas fa-file-alt me-1"></i>View Document</a></p>
                </div>
              }
              <div class="mb-3">
                <label class="form-label">External Link</label>
                <input type="url" class="form-control" placeholder="https://..."
                       [value]="externalLink()" (input)="externalLink.set($any($event.target).value)">
              </div>
              <div class="mb-3">
                <label class="form-label">Related Documents</label>
                <textarea class="form-control" rows="2" [value]="relatedDocuments()" (input)="relatedDocuments.set($any($event.target).value)"></textarea>
              </div>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-top:1.5rem;padding-top:1rem;border-top:1px solid rgba(0,0,0,0.06);">
              <a routerLink="/m/content-management/frameworks" class="btn-add" style="background:var(--text-mid);">
                <i class="fas fa-times"></i> Cancel
              </a>
              <div style="display:flex;gap:0.5rem;">
                @if (!editId) {
                  <button type="button" class="btn-add" style="background:#6c757d;" [disabled]="saving()" (click)="save(true)">
                    <i class="fas fa-save"></i> Save as Draft
                  </button>
                }
                <button type="button" class="btn-add" [disabled]="saving()" (click)="save(false)">
                  <i class="fas fa-check"></i> {{ editId ? 'Update Framework' : 'Save Framework' }}
                </button>
              </div>
            </div>
          </form>
        </div>
      </dmis-panel>
    </div>
  `,
})
export class FrameworkFormComponent {
  private http = inject(HttpClient);
  private router = inject(Router);
  editId: number | null = null;

  pageTitle = 'Add New Framework';
  crumb = 'Add New';
  currentYear = new Date().getFullYear();

  /** frameworkStore's exact option lists. */
  documentTypes = ['Act', 'Policies', 'Regulations', 'DRR Guidelines', 'Plans and Strategies', 'Other'];
  hazardTypeOptions = ['Floods', 'Droughts', 'Landslides', 'Epidemics', 'Cyclone', 'Fire'];
  scopeOptions = ['National', 'Regional', 'Districts', 'Ward', 'Village/Street'];

  tab = signal('info');
  documentType = signal('');
  documentTypeOther = signal('');
  documentName = signal('');
  yearOfApproval = signal('');
  narrativeDescription = signal('');
  hazardTypes = signal<string[]>([]);
  geographicScope = signal('');
  sectorsCovered = signal('');
  keyStakeholders = signal('');
  implementationPeriodStart = signal('');
  implementationPeriodEnd = signal('');
  externalLink = signal('');
  /** en | sw — which language edition; drives the EN/Kiswahili parts on the public page. */
  language = signal('en');
  relatedDocuments = signal('');
  attachmentPath = signal<string | null>(null);
  file: File | null = null;
  saving = signal(false);
  errors = signal<Record<string, string>>({});

  constructor(route: ActivatedRoute) {
    const id = route.snapshot.paramMap.get('id');
    if (id) {
      this.editId = Number(id);
      this.pageTitle = 'Edit Framework';
      this.crumb = 'Edit';
      this.http.get<any>(`/api/v1/frameworks/${id}`).subscribe(f => {
        this.documentType.set(f.documentType ?? '');
        this.documentTypeOther.set(f.documentTypeOther ?? '');
        this.documentName.set(f.documentName ?? '');
        this.yearOfApproval.set(f.yearOfApproval != null ? '' + f.yearOfApproval : '');
        this.narrativeDescription.set(f.narrativeDescription ?? '');
        this.hazardTypes.set(f.hazardTypes ?? []);
        this.geographicScope.set(f.geographicScope ?? '');
        this.sectorsCovered.set(f.sectorsCovered ?? '');
        this.keyStakeholders.set(f.keyStakeholders ?? '');
        this.implementationPeriodStart.set(f.implementationPeriodStart ?? '');
        this.implementationPeriodEnd.set(f.implementationPeriodEnd ?? '');
        this.externalLink.set(f.externalLink ?? '');
        this.language.set(f.language ?? 'en');
        this.relatedDocuments.set(f.relatedDocuments ?? '');
        this.attachmentPath.set(f.attachmentPath ?? null);
      });
    }
  }

  toggleHazard(ht: string): void {
    this.hazardTypes.update(list => list.includes(ht) ? list.filter(h => h !== ht) : [...list, ht]);
  }

  save(asDraft: boolean): void {
    this.saving.set(true);
    this.errors.set({});
    const form = new FormData();
    const set = (k: string, v: string) => { if (v) form.set(k, v); };
    set('documentType', this.documentType());
    set('documentTypeOther', this.documentTypeOther());
    set('documentName', this.documentName());
    set('language', this.language());
    set('yearOfApproval', this.yearOfApproval());
    this.hazardTypes().forEach(h => form.append('hazardTypes', h));
    set('geographicScope', this.geographicScope());
    set('narrativeDescription', this.narrativeDescription());
    if (asDraft) {
      form.set('status', 'draft');
    }
    set('sectorsCovered', this.sectorsCovered());
    set('keyStakeholders', this.keyStakeholders());
    set('implementationPeriodStart', this.implementationPeriodStart());
    set('implementationPeriodEnd', this.implementationPeriodEnd());
    set('externalLink', this.externalLink());
    set('relatedDocuments', this.relatedDocuments());
    if (this.file) {
      form.set('attachment', this.file);
    }
    const request = this.editId
      ? this.http.put(`/api/v1/frameworks/${this.editId}`, form)
      : this.http.post('/api/v1/frameworks', form);
    const flash = this.editId ? 'Disaster Risk Framework updated successfully.'
      : asDraft ? 'Framework saved as draft successfully.' : 'Disaster Risk Framework created successfully.';
    request.subscribe({
      next: () => this.router.navigate(['/m/content-management/frameworks'], { state: { success: flash } }),
      error: err => {
        this.saving.set(false);
        const detail: string = err.error?.detail || 'Failed to save the framework.';
        const key = detail.includes('hazard') ? 'hazardTypes' : detail.includes('scope') ? 'geographicScope'
          : detail.includes('narrative') ? 'narrativeDescription' : detail.includes('year') ? 'yearOfApproval'
          : detail.includes('attachment') ? 'attachment' : detail.includes('period') ? 'implementationPeriodEnd'
          : detail.includes('document type') ? 'documentType' : 'documentName';
        this.errors.set({ [key]: detail });
        if (key === 'hazardTypes' || key === 'geographicScope') {
          this.tab.set('hazards');
        } else if (key === 'attachment') {
          this.tab.set('attachments');
        } else {
          this.tab.set('info');
        }
      },
    });
  }
}
