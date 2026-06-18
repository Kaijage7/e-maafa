import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';

/**
 * Reproduction of admin/infrastructure_items/create.blade.php — two-column page form with the FLAT
 * type list (the optgroups are only on the index filter). The source breadcrumb says "Preparedness"
 * although this is a Prevention & Mitigation screen — reproduced as-is.
 */
@Component({
  selector: 'page-infrastructure-create',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RouterLink],
  template: `
    <dmis-page-header title="New Infrastructure Item" icon="fa-road"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Infrastructure Items', url:'/m/prevention-mitigation/infrastructure'}, {label:'New Item'}]" />

    <div class="panel-row full">
      <dmis-panel title="Infrastructure Details" icon="fa-road">
        <div class="panel-body">
          <form (submit)="submit($event)">
            <div class="row">
              <div class="col-md-6">
                <div class="mb-3">
                  <label for="name" class="form-label">Name <span class="text-danger">*</span></label>
                  <input id="name" type="text" class="form-control" [class.is-invalid]="errors()['name']"
                         required [value]="name()" (input)="name.set($any($event.target).value)">
                  @if (errors()['name']) { <span class="invalid-feedback" role="alert"><strong>{{ errors()['name'] }}</strong></span> }
                </div>

                <div class="mb-3">
                  <label for="type" class="form-label">Type <span class="text-danger">*</span></label>
                  <select id="type" class="form-select" [class.is-invalid]="errors()['type']" required
                          [value]="type()" (change)="type.set($any($event.target).value)">
                    <option value="">Select Type...</option>
                    @for (t of types(); track t) { <option [value]="t">{{ t }}</option> }
                  </select>
                  @if (errors()['type']) { <span class="invalid-feedback" role="alert"><strong>{{ errors()['type'] }}</strong></span> }
                </div>

                <div class="mb-3">
                  <label for="status" class="form-label">Status <span class="text-danger">*</span></label>
                  <select id="status" class="form-select" [class.is-invalid]="errors()['status']" required
                          [value]="status()" (change)="status.set($any($event.target).value)">
                    <option value="">Select Status...</option>
                    @for (s of statuses(); track s) { <option [value]="s">{{ s }}</option> }
                  </select>
                  @if (errors()['status']) { <span class="invalid-feedback" role="alert"><strong>{{ errors()['status'] }}</strong></span> }
                </div>

                <div class="mb-3">
                  <label for="capacity" class="form-label">Capacity</label>
                  <input id="capacity" type="number" min="0" class="form-control"
                         [value]="capacity()" (input)="capacity.set($any($event.target).value)">
                </div>
              </div>

              <div class="col-md-6">
                <div class="mb-3">
                  <label for="latitude" class="form-label">Latitude</label>
                  <input id="latitude" type="text" class="form-control" placeholder="e.g., -6.8000000"
                         [value]="latitude()" (input)="latitude.set($any($event.target).value)">
                </div>

                <div class="mb-3">
                  <label for="longitude" class="form-label">Longitude</label>
                  <input id="longitude" type="text" class="form-control" placeholder="e.g., 39.2833333"
                         [value]="longitude()" (input)="longitude.set($any($event.target).value)">
                </div>

                <div class="mb-3">
                  <label for="address" class="form-label">Address</label>
                  <textarea id="address" class="form-control" rows="2"
                            [value]="address()" (input)="address.set($any($event.target).value)"></textarea>
                </div>
              </div>
            </div>

            <hr>

            <div class="row">
              <div class="col-md-6">
                <div class="mb-3">
                  <label for="contact_person_name" class="form-label">Contact Person Name</label>
                  <input id="contact_person_name" type="text" class="form-control"
                         [value]="contactPersonName()" (input)="contactPersonName.set($any($event.target).value)">
                </div>
              </div>
              <div class="col-md-6">
                <div class="mb-3">
                  <label for="contact_person_phone" class="form-label">Contact Person Phone</label>
                  <input id="contact_person_phone" type="text" class="form-control"
                         [value]="contactPersonPhone()" (input)="contactPersonPhone.set($any($event.target).value)">
                </div>
              </div>
            </div>

            <div class="mb-3">
              <label for="contact_person_email" class="form-label">Contact Person Email</label>
              <input id="contact_person_email" type="email" class="form-control"
                     [value]="contactPersonEmail()" (input)="contactPersonEmail.set($any($event.target).value)">
            </div>

            <div class="mb-3">
              <label for="location_description" class="form-label">Location Description</label>
              <textarea id="location_description" class="form-control" rows="3"
                        [value]="locationDescription()" (input)="locationDescription.set($any($event.target).value)"></textarea>
            </div>

            <div class="mb-3">
              <label for="additional_info" class="form-label">Additional Info</label>
              <textarea id="additional_info" class="form-control" rows="3"
                        [value]="additionalInfo()" (input)="additionalInfo.set($any($event.target).value)"></textarea>
            </div>

            <div class="mt-4">
              <button type="submit" class="btn btn-primary" [disabled]="saving()">Create Infrastructure Item</button>
              <a routerLink="/m/prevention-mitigation/infrastructure" class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </dmis-panel>
    </div>
  `,
})
export class InfrastructureCreateComponent {
  protected http = inject(HttpClient);
  protected router = inject(Router);

  types = signal<string[]>([]);
  statuses = signal<string[]>([]);
  name = signal('');
  type = signal('');
  status = signal('');
  capacity = signal('');
  latitude = signal('');
  longitude = signal('');
  address = signal('');
  contactPersonName = signal('');
  contactPersonPhone = signal('');
  contactPersonEmail = signal('');
  locationDescription = signal('');
  additionalInfo = signal('');
  saving = signal(false);
  errors = signal<Record<string, string>>({});

  constructor() {
    // The Blade form receives the controller's flat type list + status options.
    this.http.get<{ typeGroups: Record<string, string[]>; statuses: string[] }>('/api/v1/infrastructure-items?page=1')
      .subscribe(r => {
        this.types.set(Object.values(r.typeGroups).flat());
        this.statuses.set(r.statuses);
      });
  }

  payload(): object {
    return {
      name: this.name(),
      type: this.type(),
      status: this.status(),
      capacity: this.capacity() ? Number(this.capacity()) : null,
      latitude: this.latitude() ? Number(this.latitude()) : null,
      longitude: this.longitude() ? Number(this.longitude()) : null,
      address: this.address() || null,
      contactPersonName: this.contactPersonName() || null,
      contactPersonPhone: this.contactPersonPhone() || null,
      contactPersonEmail: this.contactPersonEmail() || null,
      locationDescription: this.locationDescription() || null,
      additionalInfo: this.additionalInfo() || null,
    };
  }

  handleError(err: any, fallback: string): void {
    this.saving.set(false);
    if (err.status === 422) {
      this.errors.set({ type: err.error?.detail || fallback });
    } else {
      this.errors.set(err.error?.errors || { name: fallback });
    }
  }

  submit(event: Event): void {
    event.preventDefault();
    this.saving.set(true);
    this.errors.set({});
    this.http.post('/api/v1/infrastructure-items', this.payload()).subscribe({
      next: () => this.router.navigate(['/m/prevention-mitigation/infrastructure'],
        { state: { success: 'Infrastructure Item created successfully.' } }),
      error: err => this.handleError(err, 'Failed to create infrastructure item.'),
    });
  }
}
