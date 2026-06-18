import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PageHeaderComponent } from '../../shell/page-header.component';
import { PanelComponent } from '../../shell/panel.component';
import { RegionDistrictPickerComponent } from '../../shell/region-district-picker.component';

/** Temporary Warehouses → New — a real create form that POSTs to the Spring Boot API. */
@Component({
  selector: 'page-temporary-warehouse-create',
  standalone: true,
  imports: [PageHeaderComponent, PanelComponent, RegionDistrictPickerComponent],
  template: `
    <dmis-page-header title="New Temporary Warehouse" icon="fa-warehouse"
      [breadcrumbs]="[{label:'Home', url:'/home'}, {label:'Preparedness'}, {label:'Temporary Warehouses', url:'/m/preparedness/temporary-warehouses'}, {label:'New'}]">
    </dmis-page-header>

    <div class="panel-row">
      <dmis-panel title="Temporary Warehouse Details" icon="fa-clipboard-list">
        <div class="form-body">
          <div class="form-grid">
            <div class="fg fg-wide">
              <label>Name <span class="req">*</span></label>
              <input type="text" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="e.g. Ilala District Emergency Store">
            </div>
            <div class="fg">
              <label>Level <span class="req">*</span></label>
              <select [value]="level()" (change)="level.set($any($event.target).value)">
                <option value="">Select level…</option>
                @for (l of levels; track l) { <option [value]="l">{{ l }}</option> }
              </select>
            </div>
            <div class="fg">
              <label>Operational Status</label>
              <select [value]="status()" (change)="status.set($any($event.target).value)">
                @for (s of statuses; track s) { <option [value]="s">{{ s }}</option> }
              </select>
            </div>
            <dmis-region-district class="fg-wide"
              [region]="region()" (regionChange)="region.set($event)"
              [district]="district()" (districtChange)="district.set($event)"
              [council]="council()" (councilChange)="council.set($event)" />
            <div class="fg fg-wide">
              <label>Location Description <span class="hint">(specific address / landmark)</span></label>
              <input type="text" [value]="location()" (input)="location.set($any($event.target).value)" placeholder="e.g. Vingunguti ward, near the market">
            </div>
            <div class="fg">
              <label>Contact Person</label>
              <input type="text" [value]="contactName()" (input)="contactName.set($any($event.target).value)" placeholder="Full name">
            </div>
            <div class="fg">
              <label>Contact Phone</label>
              <input type="text" [value]="contactPhone()" (input)="contactPhone.set($any($event.target).value)" placeholder="07XX XXX XXX">
            </div>
            <div class="fg">
              <label>Latitude</label>
              <input type="number" step="0.000001" [value]="latitude()" (input)="latitude.set($any($event.target).value)" placeholder="-6.8">
            </div>
            <div class="fg">
              <label>Longitude</label>
              <input type="number" step="0.000001" [value]="longitude()" (input)="longitude.set($any($event.target).value)" placeholder="39.2">
            </div>
          </div>

          @if (error()) { <div class="form-error"><i class="fas fa-exclamation-circle"></i> {{ error() }}</div> }

          <div class="form-actions">
            <button type="button" class="btn-ghost" (click)="cancel()">Cancel</button>
            <button type="button" class="btn-add" [disabled]="!valid() || saving()" (click)="submit()">
              <i class="fas" [class.fa-save]="!saving()" [class.fa-spinner]="saving()" [class.fa-spin]="saving()"></i>
              {{ saving() ? 'Saving…' : (editId() ? 'Update Temporary Warehouse' : 'Create Temporary Warehouse') }}
            </button>
          </div>
        </div>
      </dmis-panel>
    </div>
  `,
  styles: [`
    .form-body { padding: 1.1rem 1.2rem; }
    .form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem 1.1rem; }
    .fg { display: flex; flex-direction: column; gap: 0.3rem; }
    .fg-wide { grid-column: 1 / -1; }
    .fg label { font-size: 0.78rem; font-weight: 600; color: var(--text-mid); }
    .req { color: #dc2626; }
    .fg input, .fg select { border: 1px solid var(--border); border-radius: 9px; padding: 0.5rem 0.65rem; font-size: 0.86rem; font-family: inherit; background: #fff; }
    .fg input:focus, .fg select:focus { outline: none; border-color: var(--primary); box-shadow: 0 0 0 3px rgba(0,51,102,0.08); }
    .form-error { margin-top: 0.9rem; background: rgba(220,38,38,0.08); color: #dc2626; padding: 0.55rem 0.8rem; border-radius: 9px; font-size: 0.82rem; }
    .form-actions { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1.2rem; padding-top: 1rem; border-top: 1px solid var(--border); }
    .btn-ghost { border: 1px solid var(--border); background: #fff; color: var(--text-mid); border-radius: 9px; padding: 0.5rem 1.1rem; font-size: 0.84rem; cursor: pointer; }
    .btn-add[disabled] { opacity: 0.55; cursor: not-allowed; }
  `],
})
export class TemporaryWarehouseCreateComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  editId = signal<number | null>(null);

  levels = ['District', 'Regional', 'National'];
  statuses = ['Active', 'Inactive', 'Closed'];

  name = signal('');
  level = signal('');
  status = signal('Active');
  region = signal('');
  district = signal('');
  council = signal('');
  location = signal('');
  contactName = signal('');
  contactPhone = signal('');
  latitude = signal('');
  longitude = signal('');
  saving = signal(false);
  error = signal('');

  valid = computed(() => this.name().trim().length > 0 && !!this.level());

  ngOnInit(): void {
    const edit = this.route.snapshot.queryParamMap.get('edit');
    if (!edit) { return; }
    this.editId.set(Number(edit));
    this.http.get<any>(`/api/v1/temporary-warehouses/${edit}`).subscribe({
      next: w => {
        this.name.set(w.name ?? '');
        this.level.set(w.level ?? '');
        this.status.set(w.operationalStatus ?? 'Active');
        this.region.set(w.region ?? '');
        this.district.set(w.district ?? '');
        this.council.set(w.council ?? '');
        this.location.set(w.locationDescription ?? '');
        this.contactName.set(w.contactPersonName ?? '');
        this.contactPhone.set(w.contactPersonPhone ?? '');
        this.latitude.set(w.latitude == null ? '' : String(w.latitude));
        this.longitude.set(w.longitude == null ? '' : String(w.longitude));
      },
      error: () => this.error.set('Could not load the temporary warehouse for editing.'),
    });
  }

  submit(): void {
    if (!this.valid()) { this.error.set('Name and Level are required.'); return; }
    this.saving.set(true);
    this.error.set('');
    const payload = {
      name: this.name().trim(), level: this.level(), operationalStatus: this.status(),
      region: this.region() || null, district: this.district() || null, council: this.council() || null,
      locationDescription: this.location() || null, contactPersonName: this.contactName() || null,
      contactPersonPhone: this.contactPhone() || null,
      latitude: this.latitude() === '' ? null : Number(this.latitude()),
      longitude: this.longitude() === '' ? null : Number(this.longitude()),
    };
    const id = this.editId();
    const req = id == null
      ? this.http.post('/api/v1/temporary-warehouses', payload)
      : this.http.put(`/api/v1/temporary-warehouses/${id}`, payload);
    req.subscribe({
      next: () => { this.saving.set(false); this.router.navigate(['/m/preparedness/temporary-warehouses']); },
      error: (e) => { this.saving.set(false); this.error.set(e?.error?.message || e?.error?.detail || 'Could not save the temporary warehouse. Please try again.'); },
    });
  }

  cancel(): void { this.router.navigate(['/m/preparedness/temporary-warehouses']); }
}
