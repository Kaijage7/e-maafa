import { Component } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { InfrastructureCreateComponent } from './infrastructure-create.component';

/**
 * Reproduction of admin/infrastructure_items/edit.blade.php — the same two-column form prefilled
 * (coordinates included, unlike past-disasters), status badge on the panel, PUT on submit.
 * Shares the form template/fields with the create reproduction, as the Blade views do.
 */
@Component({
  selector: 'page-infrastructure-edit',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RouterLink],
  template: `
    <dmis-page-header title="Edit Infrastructure Item" icon="fa-road"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Infrastructure Items', url:'/m/prevention-mitigation/infrastructure'}, {label: name()}, {label:'Edit'}]" />

    <div class="panel-row full">
      <dmis-panel title="Edit Infrastructure Item" icon="fa-edit" [badge]="status() || null">
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
                    @for (t of types(); track t) { <option [value]="t" [selected]="t === type()">{{ t }}</option> }
                  </select>
                  @if (errors()['type']) { <span class="invalid-feedback" role="alert"><strong>{{ errors()['type'] }}</strong></span> }
                </div>

                <div class="mb-3">
                  <label for="status" class="form-label">Status <span class="text-danger">*</span></label>
                  <select id="status" class="form-select" [class.is-invalid]="errors()['status']" required
                          [value]="status()" (change)="status.set($any($event.target).value)">
                    <option value="">Select Status...</option>
                    @for (s of statuses(); track s) { <option [value]="s" [selected]="s === status()">{{ s }}</option> }
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
              <button type="submit" class="btn btn-primary" [disabled]="saving()">Update Infrastructure Item</button>
              <a routerLink="/m/prevention-mitigation/infrastructure" class="btn btn-secondary">Cancel</a>
            </div>
          </form>
        </div>
      </dmis-panel>
    </div>
  `,
})
export class InfrastructureEditComponent extends InfrastructureCreateComponent {
  private id: number;

  constructor(route: ActivatedRoute) {
    super();
    this.id = Number(route.snapshot.paramMap.get('id'));
    this.http.get<any>(`/api/v1/infrastructure-items/${this.id}`).subscribe(d => {
      this.name.set(d.name ?? '');
      this.type.set(d.type ?? '');
      this.status.set(d.status ?? '');
      this.capacity.set(d.capacity != null ? '' + d.capacity : '');
      this.latitude.set(d.latitude != null ? '' + d.latitude : '');
      this.longitude.set(d.longitude != null ? '' + d.longitude : '');
      this.address.set(d.address ?? '');
      this.contactPersonName.set(d.contactPersonName ?? '');
      this.contactPersonPhone.set(d.contactPersonPhone ?? '');
      this.contactPersonEmail.set(d.contactPersonEmail ?? '');
      this.locationDescription.set(d.locationDescription ?? '');
      this.additionalInfo.set(d.additionalInfo ?? '');
    });
  }

  override submit(event: Event): void {
    event.preventDefault();
    this.saving.set(true);
    this.errors.set({});
    this.http.put(`/api/v1/infrastructure-items/${this.id}`, this.payload()).subscribe({
      next: () => this.router.navigate(['/m/prevention-mitigation/infrastructure'],
        { state: { success: 'Infrastructure Item updated successfully.' } }),
      error: err => this.handleError(err, 'Failed to update infrastructure item.'),
    });
  }
}
