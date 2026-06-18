import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

declare const Swal: any; // SweetAlert2, loaded per-page from the CDN exactly as the Blade page pushes it

interface FormData {
  areas: { id: number; name: string; code: string; category: string }[];
  regions: { id: number; name: string }[];
  statuses: Record<string, string>;
  institutions: { id: number; organization: string; name: string }[];
  hazards: { id: number; name: string; type: string }[];
}
interface AnimalEntry { species: string; species_other: string; cases: number; deaths: number; notes: string; }

/**
 * The 4-step "Report New One Health Event" modal from
 * onehealth/events/partials/_create_event_modal.blade.php — shared by the Events
 * index and the One Health Dashboard exactly as the Blade partial is @included by both.
 *
 * Source bugs fixed here (issues/onehealth.issues.md): OH-1 (missing Event Title input),
 * OH-2 (human/animals/environment never serialized), OH-3 (dead Add Animal Entry button),
 * OH-4 (event type option mismatch).
 */
@Component({
  selector: 'oh-report-event-modal',
  standalone: true,
  imports: [FormsModule],
  styles: [`
    .oh-modal-backdrop { display: none; position: fixed; inset: 0; z-index: 1100; background: rgba(0,0,0,0.5); overflow-y: auto; }
    .oh-modal-backdrop.open { display: block; }
    .oh-modal { background: #fff; border-radius: 0.5rem; margin: 1.75rem auto; max-width: 1140px; box-shadow: 0 12px 40px rgba(0,0,0,0.25); display: flex; flex-direction: column; max-height: calc(100vh - 3.5rem); }
    .oh-modal-header { background: var(--tz-primary-blue, #003366); color: #fff; border: 0; padding: 1rem 1.25rem; border-radius: 0.5rem 0.5rem 0 0; display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
    .oh-modal-header h5 { margin: 0; font-size: 1.05rem; font-weight: 600; display: flex; align-items: center; gap: 0.5rem; }
    .oh-modal-close { background: none; border: none; color: #fff; font-size: 1.4rem; cursor: pointer; line-height: 1; }
    .oh-modal-body { padding: 1.25rem; overflow-y: auto; }
    .oh-modal-footer { display: flex; justify-content: space-between; padding: 0.85rem 1.25rem; border-top: 1px solid #e9ecef; flex-shrink: 0; }
    .modal-progress-tracker { display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 1rem; background: #f8f9fa; border-radius: 12px; margin-bottom: 1.5rem; }
    .modal-progress-step { display: flex; align-items: center; gap: 0.5rem; opacity: 0.4; transition: all 0.3s ease; }
    .modal-progress-step.active, .modal-progress-step.completed { opacity: 1; }
    .modal-step-num { width: 32px; height: 32px; border-radius: 50%; background: #dee2e6; color: #6c757d; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.85rem; transition: all 0.3s ease; }
    .modal-progress-step.active .modal-step-num { background: var(--tz-primary-blue, #003366); color: white; box-shadow: 0 3px 10px rgba(0, 51, 102, 0.3); }
    .modal-progress-step.completed .modal-step-num { background: #28a745; color: white; }
    .modal-progress-step span { font-size: 0.8rem; font-weight: 600; color: #6c757d; }
    .modal-progress-step.active span { color: var(--tz-primary-blue, #003366); }
    .modal-progress-step.completed span { color: #28a745; }
    .modal-progress-line { width: 40px; height: 3px; background: #dee2e6; border-radius: 2px; transition: all 0.3s ease; }
    .modal-progress-line.completed { background: #28a745; }
    .m-review-section { border-left: 3px solid var(--tz-primary-blue, #003366); padding: 0.75rem 1rem; margin-bottom: 0.75rem; background: #f8f9fa; border-radius: 0 6px 6px 0; }
    .m-review-section h6 { font-size: 0.85rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--tz-primary-blue, #003366); }
    .m-review-item { display: flex; justify-content: space-between; padding: 0.2rem 0; font-size: 0.85rem; border-bottom: 1px dashed #e9ecef; }
    .m-review-item:last-child { border-bottom: none; }
    .m-review-label { color: #6c757d; }
    .m-review-value { font-weight: 600; text-align: right; max-width: 55%; }
    .animal-entry { background: #fafafa; }
    .is-invalid { border-color: #dc3545 !important; }
    @media (max-width: 576px) { .modal-progress-step span { display: none; } .modal-progress-line { width: 20px; } }
  `],
  template: `
    <div class="oh-modal-backdrop" [class.open]="isOpen()" (click)="backdropClose($event)">
      <div class="oh-modal" (click)="$event.stopPropagation()">
        <div class="oh-modal-header">
          <h5><i class="fas fa-plus-circle"></i> Report New One Health Event</h5>
          <button type="button" class="oh-modal-close" (click)="close()">&times;</button>
        </div>
        <div class="oh-modal-body">
          @if (createErrors().length) {
            <div class="alert alert-danger"><ul class="mb-0">@for (e of createErrors(); track $index) { <li>{{ e }}</li> }</ul></div>
          }

          <div class="modal-progress-tracker">
            @for (s of [1, 2, 3, 4]; track s) {
              @if (s > 1) { <div class="modal-progress-line" [class.completed]="step() > s - 1"></div> }
              <div class="modal-progress-step" [class.active]="step() === s" [class.completed]="step() > s">
                <div class="modal-step-num">{{ s }}</div>
                <span>{{ ['Classification', 'Details & Location', 'One Health Details', 'Review'][s - 1] }}</span>
              </div>
            }
          </div>

          <!-- STEP 1: Classification -->
          @if (step() === 1) {
            <div class="card shadow-sm mb-3">
              <div class="card-header"><strong><i class="fas fa-clipboard-list text-primary me-2"></i>Event Classification</strong></div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="form-label">Reporting Institution <span class="text-danger">*</span></label>
                    <select class="form-select" [(ngModel)]="form.stakeholder_id" [class.is-invalid]="invalid()['stakeholder_id']">
                      <option value="">Select Institution</option>
                      @for (inst of formData()?.institutions ?? []; track inst.id) { <option [value]="inst.id">{{ inst.organization }} ({{ inst.name }})</option> }
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Area of Concern <span class="text-danger">*</span></label>
                    <select class="form-select" [(ngModel)]="form.area_of_concern_id" (ngModelChange)="onAreaChange($event)" [class.is-invalid]="invalid()['area_of_concern_id']">
                      <option value="">Select Area</option>
                      @for (a of formData()?.areas ?? []; track a.id) { <option [value]="a.id">{{ a.name }}</option> }
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Concern Item</label>
                    <select class="form-select" [(ngModel)]="form.concern_item_id">
                      <option value="">Select Concern Item (optional)</option>
                      @for (item of concernItems(); track item.id) { <option [value]="item.id">{{ item.name }}</option> }
                    </select>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Event Type <span class="text-danger">*</span></label>
                    <select class="form-select" [(ngModel)]="form.event_type" [class.is-invalid]="invalid()['event_type']">
                      <option value="">Select Type</option>
                      <option value="outbreak">Outbreak</option>
                      <option value="incident">Incident</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <!-- Source bug OH-1 fixed: the Laravel modal omitted this required field entirely -->
                  <div class="col-md-12">
                    <label class="form-label">Event Title <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" placeholder="Enter event title" [(ngModel)]="form.event_title" [class.is-invalid]="invalid()['event_title']">
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- STEP 2: Details & Location -->
          @if (step() === 2) {
            <div class="card shadow-sm mb-3">
              <div class="card-header"><strong><i class="fas fa-info-circle text-primary me-2"></i>Event Details</strong></div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-md-12">
                    <label class="form-label">Event Description <span class="text-danger">*</span></label>
                    <textarea rows="3" class="form-control" placeholder="Describe the event in detail" [(ngModel)]="form.event_description" [class.is-invalid]="invalid()['event_description']"></textarea>
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Date of Occurrence <span class="text-danger">*</span></label>
                    <input type="date" class="form-control" [(ngModel)]="form.date_of_occurrence" [class.is-invalid]="invalid()['date_of_occurrence']">
                  </div>
                  <div class="col-md-6">
                    <label class="form-label">Risk Level</label>
                    <select class="form-select" [(ngModel)]="form.risk_level">
                      <option value="">Select Risk Level</option>
                      <option value="low">Low</option><option value="moderate">Moderate</option>
                      <option value="high">High</option><option value="very_high">Very High</option>
                    </select>
                  </div>
                  <div class="col-md-12">
                    <label class="form-label">Recommendation</label>
                    <textarea rows="2" class="form-control" placeholder="Enter any recommendations" [(ngModel)]="form.recommendation"></textarea>
                  </div>
                </div>
              </div>
            </div>
            <div class="card shadow-sm mb-3">
              <div class="card-header"><strong><i class="fas fa-map-marker-alt text-success me-2"></i>Location</strong></div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-md-4">
                    <label class="form-label">Region <span class="text-danger">*</span></label>
                    <select class="form-select" [(ngModel)]="form.region_id" (ngModelChange)="onRegionChange($event)" [class.is-invalid]="invalid()['region_id']">
                      <option value="">Select Region</option>
                      @for (r of formData()?.regions ?? []; track r.id) { <option [value]="r.id">{{ r.name }}</option> }
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">District <span class="text-danger">*</span></label>
                    <select class="form-select" [(ngModel)]="form.district_id" (ngModelChange)="onDistrictChange($event)" [class.is-invalid]="invalid()['district_id']">
                      <option value="">Select District</option>
                      @for (d of districts(); track d.id) { <option [value]="d.id">{{ d.name }}</option> }
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Ward</label>
                    <select class="form-select" [(ngModel)]="form.ward_id">
                      <option value="">Select Ward (optional)</option>
                      @for (w of wards(); track w.id) { <option [value]="w.id">{{ w.name }}</option> }
                    </select>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Ward / Village (Text)</label>
                    <input type="text" class="form-control" placeholder="Enter ward or village name" [(ngModel)]="form.ward_village">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Latitude</label>
                    <input type="number" step="0.0000001" class="form-control" placeholder="-6.7924" [(ngModel)]="form.latitude">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">Longitude</label>
                    <input type="number" step="0.0000001" class="form-control" placeholder="39.2083" [(ngModel)]="form.longitude">
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- STEP 3: One Health Details (Universal Sections) -->
          @if (step() === 3) {
            <div class="alert alert-info mb-3">
              <i class="fas fa-info-circle me-2"></i>
              <strong>One Health Approach:</strong> Fill in the relevant sections below. All sections are optional — complete only those applicable to this event.
            </div>
            <div class="card shadow-sm mb-3">
              <div class="card-header bg-danger text-white d-flex justify-content-between align-items-center" role="button" (click)="humanOpen.set(!humanOpen())">
                <strong><i class="fas fa-user-injured me-2"></i>Human Cases</strong>
                <i class="fas" [class]="humanOpen() ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
              </div>
              @if (humanOpen()) {
                <div class="card-body">
                  <div class="row g-3">
                    <div class="col-md-3"><label class="form-label">Male Cases</label><input type="number" min="0" class="form-control" [(ngModel)]="human.cases_male"></div>
                    <div class="col-md-3"><label class="form-label">Female Cases</label><input type="number" min="0" class="form-control" [(ngModel)]="human.cases_female"></div>
                    <div class="col-md-3"><label class="form-label">Children Cases</label><input type="number" min="0" class="form-control" [(ngModel)]="human.cases_children"></div>
                    <div class="col-md-3"><label class="form-label">Total Cases</label><input type="number" min="0" class="form-control" [(ngModel)]="human.cases_total"></div>
                    <div class="col-md-3"><label class="form-label">Deaths</label><input type="number" min="0" class="form-control" [(ngModel)]="human.deaths"></div>
                    <div class="col-md-3"><label class="form-label">Admitted</label><input type="number" min="0" class="form-control" [(ngModel)]="human.admitted"></div>
                    <div class="col-md-6"><label class="form-label">Lab Results</label><textarea rows="2" class="form-control" placeholder="Lab test results if available" [(ngModel)]="human.lab_results"></textarea></div>
                  </div>
                </div>
              }
            </div>
            <!-- Animal Cases (repeatable — source bug OH-3 fixed: add/remove rows actually work) -->
            <div class="card shadow-sm mb-3">
              <div class="card-header bg-warning text-dark d-flex justify-content-between align-items-center" role="button" (click)="animalOpen.set(!animalOpen())">
                <strong><i class="fas fa-paw me-2"></i>Animal Cases</strong>
                <i class="fas" [class]="animalOpen() ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
              </div>
              @if (animalOpen()) {
                <div class="card-body">
                  @for (entry of animals(); track $index; let i = $index) {
                    <div class="animal-entry border rounded p-3 mb-2">
                      <div class="row g-2 align-items-end">
                        <div class="col-md-3">
                          <label class="form-label">Species</label>
                          <select class="form-select" [(ngModel)]="entry.species">
                            <option value="">Select Species</option>
                            @for (sp of speciesOptions; track sp.value) { <option [value]="sp.value">{{ sp.label }}</option> }
                          </select>
                        </div>
                        @if (entry.species === 'other') {
                          <div class="col-md-2">
                            <label class="form-label">Specify</label>
                            <input type="text" class="form-control" placeholder="Specify species" [(ngModel)]="entry.species_other">
                          </div>
                        }
                        <div class="col-md-2"><label class="form-label">Cases</label><input type="number" min="0" class="form-control" [(ngModel)]="entry.cases"></div>
                        <div class="col-md-2"><label class="form-label">Deaths</label><input type="number" min="0" class="form-control" [(ngModel)]="entry.deaths"></div>
                        <div class="col-md-2"><label class="form-label">Notes</label><input type="text" class="form-control" placeholder="Optional" [(ngModel)]="entry.notes"></div>
                        <div class="col-md-1 text-end">
                          <button type="button" class="btn btn-outline-danger btn-sm" title="Remove" [style.visibility]="animals().length > 1 ? 'visible' : 'hidden'" (click)="removeAnimal(i)"><i class="fas fa-times"></i></button>
                        </div>
                      </div>
                    </div>
                  }
                  <button type="button" class="btn btn-outline-warning btn-sm mt-2" (click)="addAnimal()"><i class="fas fa-plus me-1"></i>Add Animal Entry</button>
                </div>
              }
            </div>
            <div class="card shadow-sm mb-3">
              <div class="card-header bg-info text-white d-flex justify-content-between align-items-center" role="button" (click)="envOpen.set(!envOpen())">
                <strong><i class="fas fa-leaf me-2"></i>Environment</strong>
                <i class="fas" [class]="envOpen() ? 'fas fa-chevron-up' : 'fas fa-chevron-down'"></i>
              </div>
              @if (envOpen()) {
                <div class="card-body">
                  <div class="row g-3">
                    <div class="col-md-12">
                      <label class="form-label">Related Hazard</label>
                      <select class="form-select" [(ngModel)]="environment.hazard_id">
                        <option value="">Select Hazard (optional)</option>
                        @for (h of formData()?.hazards ?? []; track h.id) { <option [value]="h.id">{{ h.name }} ({{ h.type }})</option> }
                      </select>
                    </div>
                    <div class="col-md-12"><label class="form-label">Weather Data</label><textarea rows="2" class="form-control" placeholder="Describe weather conditions" [(ngModel)]="environment.weather_data"></textarea></div>
                    <div class="col-md-4"><label class="form-label">Temperature</label><input type="text" class="form-control" placeholder="e.g., 35C" [(ngModel)]="environment.temperature"></div>
                    <div class="col-md-4"><label class="form-label">Rainfall</label><input type="text" class="form-control" placeholder="e.g., 150mm" [(ngModel)]="environment.rainfall"></div>
                    <div class="col-md-4"><label class="form-label">Wind Speed</label><input type="text" class="form-control" placeholder="e.g., 80km/h" [(ngModel)]="environment.wind_speed"></div>
                    <div class="col-md-12"><label class="form-label">Environmental Impact</label><textarea rows="3" class="form-control" placeholder="Describe the environmental impact" [(ngModel)]="environment.environmental_impact"></textarea></div>
                  </div>
                </div>
              }
            </div>
          }

          <!-- STEP 4: Review -->
          @if (step() === 4) {
            <div class="card shadow-sm mb-3">
              <div class="card-header"><strong><i class="fas fa-user text-secondary me-2"></i>Contact Person</strong></div>
              <div class="card-body">
                <div class="row g-3">
                  <div class="col-md-4"><label class="form-label text-muted">Name</label><input type="text" class="form-control form-control-sm" [value]="auth.user()?.name ?? ''" readonly></div>
                  <div class="col-md-4"><label class="form-label text-muted">Phone</label><input type="text" class="form-control form-control-sm" value="-" readonly></div>
                  <div class="col-md-4"><label class="form-label text-muted">Email</label><input type="text" class="form-control form-control-sm" [value]="auth.user()?.email ?? ''" readonly></div>
                </div>
              </div>
            </div>
            <div class="card shadow-sm mb-3">
              <div class="card-header" style="background: var(--tz-primary-blue, #003366);">
                <h6 class="mb-0 text-white"><i class="fas fa-clipboard-check me-2"></i>Review Summary</h6>
              </div>
              <div class="card-body">
                <div class="m-review-section">
                  <h6><i class="fas fa-clipboard-list me-2"></i>Event Classification</h6>
                  <div class="m-review-item"><span class="m-review-label">Institution</span><span class="m-review-value">{{ institutionName(form.stakeholder_id) || '-' }}</span></div>
                  <div class="m-review-item"><span class="m-review-label">Area of Concern</span><span class="m-review-value">{{ areaName(form.area_of_concern_id) || '-' }}</span></div>
                  <div class="m-review-item"><span class="m-review-label">Concern Item</span><span class="m-review-value">{{ concernItemName(form.concern_item_id) || '-' }}</span></div>
                  <div class="m-review-item"><span class="m-review-label">Event Type</span><span class="m-review-value">{{ ucwords(form.event_type) || '-' }}</span></div>
                  <div class="m-review-item"><span class="m-review-label">Title</span><span class="m-review-value">{{ form.event_title || '-' }}</span></div>
                </div>
                <div class="m-review-section">
                  <h6><i class="fas fa-info-circle me-2"></i>Details</h6>
                  <div class="m-review-item"><span class="m-review-label">Description</span><span class="m-review-value">{{ limit(form.event_description, 100) || '-' }}</span></div>
                  <div class="m-review-item"><span class="m-review-label">Date</span><span class="m-review-value">{{ form.date_of_occurrence || '-' }}</span></div>
                  <div class="m-review-item"><span class="m-review-label">Risk</span><span class="m-review-value">{{ form.risk_level ? ucwords(form.risk_level) : 'Not set' }}</span></div>
                </div>
                <div class="m-review-section">
                  <h6><i class="fas fa-map-marker-alt me-2"></i>Location</h6>
                  <div class="m-review-item"><span class="m-review-label">Region</span><span class="m-review-value">{{ regionName(form.region_id) || '-' }}</span></div>
                  <div class="m-review-item"><span class="m-review-label">District</span><span class="m-review-value">{{ districtName(form.district_id) || '-' }}</span></div>
                  <div class="m-review-item"><span class="m-review-label">Ward</span><span class="m-review-value">{{ wardName(form.ward_id) || '-' }}</span></div>
                </div>
                <div class="m-review-section" style="border-left-color: #20c997;">
                  <h6><i class="fas fa-heartbeat me-2"></i>One Health Approach</h6>
                  <div class="m-review-item"><span class="m-review-label">Human Cases (total)</span><span class="m-review-value">{{ human.cases_total || 0 }}</span></div>
                  <div class="m-review-item"><span class="m-review-label">Animal Entries</span><span class="m-review-value">{{ filledAnimals().length }}</span></div>
                  <div class="m-review-item"><span class="m-review-label">Environment Section</span><span class="m-review-value">{{ environmentFilled() ? 'Provided' : 'Not provided' }}</span></div>
                </div>
              </div>
            </div>
          }
        </div>
        <div class="oh-modal-footer">
          <div>
            <button type="button" class="btn btn-secondary" (click)="close()">Cancel</button>
            @if (step() > 1) {
              <button type="button" class="btn btn-outline-secondary" (click)="prevStep()"><i class="fas fa-arrow-left me-1"></i>Previous</button>
            }
          </div>
          <div>
            @if (step() < 4) {
              <button type="button" class="btn btn-primary" (click)="nextStep()">Next <i class="fas fa-arrow-right ms-1"></i></button>
            } @else {
              <button type="button" class="btn btn-success" [disabled]="submitting()" (click)="submitCreate()">
                @if (submitting()) { <i class="fas fa-spinner fa-spin me-1"></i>Submitting... } @else { <i class="fas fa-paper-plane me-1"></i>Submit Event }
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class OhReportEventModalComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  readonly auth = inject(AuthService);

  /** Emits the create response after the success dialog closes with "Stay Here". */
  @Output() created = new EventEmitter<any>();

  isOpen = signal(false);
  step = signal(1);
  submitting = signal(false);
  createErrors = signal<string[]>([]);
  invalid = signal<Record<string, boolean>>({});
  formData = signal<FormData | null>(null);
  concernItems = signal<{ id: number; name: string }[]>([]);
  districts = signal<{ id: number; name: string }[]>([]);
  wards = signal<{ id: number; name: string }[]>([]);
  humanOpen = signal(true);
  animalOpen = signal(true);
  envOpen = signal(true);
  animals = signal<AnimalEntry[]>([this.blankAnimal()]);

  form = this.blankForm();
  human = this.blankHuman();
  environment = this.blankEnvironment();

  readonly speciesOptions = [
    { value: 'cattle', label: 'Cattle' }, { value: 'goats', label: 'Goats' }, { value: 'sheep', label: 'Sheep' },
    { value: 'dogs', label: 'Dogs' }, { value: 'cats', label: 'Cats' }, { value: 'poultry_chickens', label: 'Poultry/Chickens' },
    { value: 'pigs', label: 'Pigs' }, { value: 'donkeys', label: 'Donkeys' }, { value: 'horses', label: 'Horses' },
    { value: 'camels', label: 'Camels' }, { value: 'wildlife_primates', label: 'Wildlife (Primates)' },
    { value: 'wildlife_bats', label: 'Wildlife (Bats)' }, { value: 'wildlife_rodents', label: 'Wildlife (Rodents)' },
    { value: 'wildlife_birds', label: 'Wildlife (Birds)' }, { value: 'wildlife_other', label: 'Wildlife (Other)' },
    { value: 'other', label: 'Other' },
  ];

  ngOnInit(): void {
    ensureSweetAlert();
    this.http.get<FormData>('/api/v1/onehealth/events/form-data').subscribe(fd => this.formData.set(fd));
  }

  open(): void {
    this.form = this.blankForm();
    this.human = this.blankHuman();
    this.environment = this.blankEnvironment();
    this.animals.set([this.blankAnimal()]);
    this.concernItems.set([]);
    this.districts.set([]);
    this.wards.set([]);
    this.createErrors.set([]);
    this.invalid.set({});
    this.step.set(1);
    this.humanOpen.set(true); this.animalOpen.set(true); this.envOpen.set(true);
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  backdropClose(ev: Event): void {
    if (ev.target === ev.currentTarget) { this.close(); }
  }

  onAreaChange(areaId: string): void {
    this.form.concern_item_id = '';
    this.concernItems.set([]);
    if (areaId) {
      this.http.get<any[]>(`/api/v1/onehealth/events/concern-items/${areaId}`).subscribe(items => this.concernItems.set(items as any));
    }
  }

  onRegionChange(regionId: string): void {
    this.form.district_id = '';
    this.form.ward_id = '';
    this.districts.set([]);
    this.wards.set([]);
    if (regionId) {
      this.http.get<any[]>(`/api/v1/onehealth/events/districts/${regionId}`).subscribe(d => this.districts.set(d as any));
    }
  }

  onDistrictChange(districtId: string): void {
    this.form.ward_id = '';
    this.wards.set([]);
    if (districtId) {
      this.http.get<any[]>(`/api/v1/onehealth/events/wards/${districtId}`).subscribe(w => this.wards.set(w as any));
    }
  }

  addAnimal(): void {
    this.animals.set([...this.animals(), this.blankAnimal()]);
  }

  removeAnimal(i: number): void {
    this.animals.set(this.animals().filter((_, idx) => idx !== i));
  }

  filledAnimals(): AnimalEntry[] {
    return this.animals().filter(a => !!a.species);
  }

  environmentFilled(): boolean {
    return Object.values(this.environment).some(v => v !== '' && v !== null);
  }

  nextStep(): void {
    if (!this.validateStep(this.step())) { return; }
    this.step.set(this.step() + 1);
    this.scrollTop();
  }

  prevStep(): void {
    this.step.set(this.step() - 1);
    this.scrollTop();
  }

  private scrollTop(): void {
    document.querySelector('oh-report-event-modal .oh-modal-body')?.scrollTo({ top: 0 });
  }

  private validateStep(step: number): boolean {
    const bad: Record<string, boolean> = {};
    if (step === 1) {
      for (const f of ['stakeholder_id', 'area_of_concern_id', 'event_type', 'event_title'] as const) {
        if (!String(this.form[f] ?? '').trim()) { bad[f] = true; }
      }
    } else if (step === 2) {
      for (const f of ['event_description', 'date_of_occurrence', 'region_id', 'district_id'] as const) {
        if (!String(this.form[f] ?? '').trim()) { bad[f] = true; }
      }
    }
    this.invalid.set(bad);
    if (Object.keys(bad).length) {
      ensureSweetAlert().then(() => Swal.fire({
        icon: 'error', title: 'Incomplete Fields',
        text: 'Please fill in all required fields before continuing.',
        confirmButtonColor: '#003366', timer: 3000,
      }));
      return false;
    }
    return true;
  }

  /** OH-2 fix: serializes the One Health sections the source modal silently dropped. */
  submitCreate(): void {
    const f = this.form;
    const data: any = {
      stakeholderId: f.stakeholder_id || null,
      areaOfConcernId: f.area_of_concern_id || null,
      concernItemId: f.concern_item_id || null,
      eventTitle: f.event_title || null,
      eventType: f.event_type || null,
      eventDescription: f.event_description || null,
      dateOfOccurrence: f.date_of_occurrence || null,
      recommendation: f.recommendation || null,
      regionId: f.region_id || null,
      districtId: f.district_id || null,
      wardId: f.ward_id || null,
      wardVillage: f.ward_village || null,
      latitude: f.latitude === '' ? null : Number(f.latitude),
      longitude: f.longitude === '' ? null : Number(f.longitude),
      riskLevel: f.risk_level || null,
    };
    const humanFilled = Object.entries(this.human).some(([, v]) => v !== '' && v !== null && v !== 0);
    if (humanFilled) { data.human = { ...this.human }; }
    const animals = this.filledAnimals();
    if (animals.length) { data.animals = animals; }
    if (this.environmentFilled()) { data.environment = { ...this.environment }; }

    this.submitting.set(true);
    this.createErrors.set([]);
    this.http.post<any>('/api/v1/onehealth/events', data).subscribe({
      next: res => {
        this.submitting.set(false);
        this.isOpen.set(false);
        ensureSweetAlert().then(() => Swal.fire({
          icon: 'success', title: 'Event Created!', text: res.message,
          confirmButtonText: 'View Event', showCancelButton: true, cancelButtonText: 'Stay Here',
        }).then((result: any) => {
          if (result.isConfirmed && res.redirect) {
            this.router.navigateByUrl(res.redirect);
          } else {
            this.created.emit(res);
          }
        }));
      },
      error: err => {
        this.submitting.set(false);
        if (err.status === 422 && err.error?.errors) {
          this.createErrors.set(Object.values(err.error.errors as Record<string, string[]>).flat());
        } else {
          this.createErrors.set([err.error?.message ?? 'An error occurred.']);
        }
        this.step.set(1);
        this.scrollTop();
      },
    });
  }

  // ── name lookups & formatting ──

  areaName(id: string | number): string { return this.formData()?.areas.find(a => String(a.id) === String(id))?.name ?? ''; }
  regionName(id: string | number): string { return this.formData()?.regions.find(r => String(r.id) === String(id))?.name ?? ''; }
  institutionName(id: string | number): string {
    const i = this.formData()?.institutions.find(x => String(x.id) === String(id));
    return i ? `${i.organization} (${i.name})` : '';
  }
  concernItemName(id: string | number): string { return this.concernItems().find(c => String(c.id) === String(id))?.name ?? ''; }
  districtName(id: string | number): string { return this.districts().find(d => String(d.id) === String(id))?.name ?? ''; }
  wardName(id: string | number): string { return this.wards().find(w => String(w.id) === String(id))?.name ?? ''; }

  limit(s: string | null | undefined, max: number): string {
    if (!s) { return ''; }
    return s.length <= max ? s : s.substring(0, max).trimEnd() + '...';
  }

  ucwords(s: string): string {
    return (s ?? '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  private blankForm() {
    return {
      stakeholder_id: '', area_of_concern_id: '', concern_item_id: '', event_type: '', event_title: '',
      event_description: '', date_of_occurrence: '', risk_level: '', recommendation: '',
      region_id: '', district_id: '', ward_id: '', ward_village: '', latitude: '' as string | number, longitude: '' as string | number,
    };
  }

  private blankHuman() {
    return { cases_male: 0, cases_female: 0, cases_children: 0, cases_total: 0, deaths: 0, admitted: 0, lab_results: '' };
  }

  private blankEnvironment() {
    return { hazard_id: '', weather_data: '', temperature: '', rainfall: '', wind_speed: '', environmental_impact: '' };
  }

  private blankAnimal(): AnimalEntry {
    return { species: '', species_other: '', cases: 0, deaths: 0, notes: '' };
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
