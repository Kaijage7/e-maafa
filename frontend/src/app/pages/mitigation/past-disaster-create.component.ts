import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

/** Reproduction of admin/past_disasters/create.blade.php — single page-form, multipart upload. */
@Component({
  selector: 'page-past-disaster-create',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RouterLink],
  template: `
    <dmis-page-header title="New Past Disaster Record" icon="fa-plus-circle"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Prevention & Mitigation'}, {label:'Disaster Repository', url:'/m/prevention-mitigation/past-disasters'}, {label:'New Record'}]" />

    <div class="panel-row full">
      <dmis-panel title="Disaster Record Details" icon="fa-history">
        <div class="panel-body">
          <form (submit)="submit($event)">
            <div class="mb-3">
              <label for="event_name" class="form-label">Event Name <span class="text-danger">*</span></label>
              <input id="event_name" type="text" class="form-control" [class.is-invalid]="errors()['eventName']"
                     required [value]="eventName()" (input)="eventName.set($any($event.target).value)">
              @if (errors()['eventName']) { <span class="invalid-feedback" role="alert"><strong>{{ errors()['eventName'] }}</strong></span> }
            </div>

            <div class="mb-3">
              <label for="event_date" class="form-label">Event Date <span class="text-danger">*</span></label>
              <input id="event_date" type="date" class="form-control" [class.is-invalid]="errors()['eventDate']"
                     required [value]="eventDate()" (input)="eventDate.set($any($event.target).value)">
              @if (errors()['eventDate']) { <span class="invalid-feedback" role="alert"><strong>{{ errors()['eventDate'] }}</strong></span> }
            </div>

            <div class="mb-3">
              <label for="location_description" class="form-label">Location Description</label>
              <textarea id="location_description" class="form-control" rows="3"
                        [value]="locationDescription()" (input)="locationDescription.set($any($event.target).value)"></textarea>
            </div>

            <div class="row">
              <div class="col-md-6 mb-3">
                <label for="latitude" class="form-label">Latitude (Optional)</label>
                <input id="latitude" type="text" class="form-control" placeholder="e.g., -6.8000000"
                       [value]="latitude()" (input)="latitude.set($any($event.target).value)">
              </div>
              <div class="col-md-6 mb-3">
                <label for="longitude" class="form-label">Longitude (Optional)</label>
                <input id="longitude" type="text" class="form-control" placeholder="e.g., 39.2833333"
                       [value]="longitude()" (input)="longitude.set($any($event.target).value)">
              </div>
            </div>

            <div class="mb-3">
              <label for="hazard_id" class="form-label">Primary Hazard Involved (Optional)</label>
              <select id="hazard_id" class="form-select" [value]="hazardId()" (change)="hazardId.set($any($event.target).value)">
                <option value="">None</option>
                @for (h of hazards(); track h.id) { <option [value]="h.id">{{ h.name }}</option> }
              </select>
            </div>

            <div class="mb-3">
              <label for="description_of_event" class="form-label">Description of Event</label>
              <textarea id="description_of_event" class="form-control" rows="5"
                        [value]="descriptionOfEvent()" (input)="descriptionOfEvent.set($any($event.target).value)"></textarea>
            </div>

            <div class="mb-3">
              <label for="impact_description" class="form-label">Impact Description</label>
              <textarea id="impact_description" class="form-control" rows="5"
                        [value]="impactDescription()" (input)="impactDescription.set($any($event.target).value)"></textarea>
            </div>

            <div class="mb-3">
              <label for="lessons_learned" class="form-label">Lessons Learned</label>
              <textarea id="lessons_learned" class="form-control" rows="5"
                        [value]="lessonsLearned()" (input)="lessonsLearned.set($any($event.target).value)"></textarea>
            </div>

            <div class="mb-3">
              <label for="source_of_information" class="form-label">Source of Information</label>
              <input id="source_of_information" type="text" class="form-control"
                     [value]="sourceOfInformation()" (input)="sourceOfInformation.set($any($event.target).value)">
            </div>

            <div class="mb-3">
              <label for="report_document" class="form-label">Upload Report Document (Optional)</label>
              <input id="report_document" type="file" class="form-control" [class.is-invalid]="errors()['reportDocument']"
                     (change)="onFile($any($event.target).files)">
              <small class="form-text text-muted">Allowed types: PDF, DOC, DOCX, TXT, JPG, PNG. Max size: 5MB.</small>
              @if (errors()['reportDocument']) { <span class="invalid-feedback" role="alert"><strong>{{ errors()['reportDocument'] }}</strong></span> }
            </div>

            <div class="mt-4">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">
                <i class="fas fa-save me-2"></i>Create Record
              </button>
              <a routerLink="/m/prevention-mitigation/past-disasters" class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </dmis-panel>
    </div>
  `,
})
export class PastDisasterCreateComponent {
  private http = inject(HttpClient);
  private router = inject(Router);

  hazards = signal<{ id: number; name: string }[]>([]);
  eventName = signal('');
  eventDate = signal('');
  locationDescription = signal('');
  latitude = signal('');
  longitude = signal('');
  hazardId = signal('');
  descriptionOfEvent = signal('');
  impactDescription = signal('');
  lessonsLearned = signal('');
  sourceOfInformation = signal('');
  file: File | null = null;
  saving = signal(false);
  errors = signal<Record<string, string>>({});

  constructor() {
    // The Blade create form receives Hazard::orderBy('name')->pluck('name','id').
    this.http.get<{ hazards: { id: number; name: string }[] }>('/api/v1/past-disasters?page=1')
      .subscribe(r => this.hazards.set(r.hazards));
  }

  onFile(files: FileList | null): void {
    this.file = files && files.length ? files[0] : null;
  }

  submit(event: Event): void {
    event.preventDefault();
    this.saving.set(true);
    this.errors.set({});
    const form = new FormData();
    form.set('eventName', this.eventName());
    form.set('eventDate', this.eventDate());
    if (this.locationDescription()) form.set('locationDescription', this.locationDescription());
    if (this.latitude()) form.set('latitude', this.latitude());
    if (this.longitude()) form.set('longitude', this.longitude());
    if (this.hazardId()) form.set('hazardId', this.hazardId());
    if (this.descriptionOfEvent()) form.set('descriptionOfEvent', this.descriptionOfEvent());
    if (this.impactDescription()) form.set('impactDescription', this.impactDescription());
    if (this.lessonsLearned()) form.set('lessonsLearned', this.lessonsLearned());
    if (this.sourceOfInformation()) form.set('sourceOfInformation', this.sourceOfInformation());
    if (this.file) form.set('reportDocument', this.file);

    this.http.post('/api/v1/past-disasters', form).subscribe({
      next: () => this.router.navigate(['/m/prevention-mitigation/past-disasters'],
        { state: { success: 'Past Disaster record created successfully.' } }),
      error: err => {
        this.saving.set(false);
        if (err.status === 422) {
          const detail: string = err.error?.detail || '';
          this.errors.set(detail.toLowerCase().includes('document')
            ? { reportDocument: detail } : { eventName: detail || 'Failed to create record.' });
        } else {
          this.errors.set(err.error?.errors || { eventName: 'Failed to create record.' });
        }
      },
    });
  }
}
